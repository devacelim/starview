/**
 * useDeviceOrientation.ts — Device orientation sensor hook
 */

import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

// Azimuth smoothing: double-EMA in 2D vector space (wrap-safe)
const AZ_ALPHA1  = 0.25;            // first stage: tracks movement
const AZ_ALPHA2  = 0.15;            // second stage: kills oscillation
const AZ_GLITCH  = 1.2;             // max 2D vector distance per frame (~70°)
const AZ_DRIFT   = 0.01;            // slow drift toward rejected readings

// Altitude smoothing (direct angle — no singularity on this axis)
const ALT_ALPHA  = 0.15;
const ALT_GLITCH = 35;              // max degrees per frame before rejection
const ALT_DRIFT  = 0.01;            // slow drift on rejected alt readings

type DOEWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<string>;
};

/**
 * Gimbal-lock-free az/alt from full 3-axis rotation matrix.
 * Uses W3C DeviceOrientation convention: R = Rz(α)·Rx(β)·Ry(γ)
 * Camera direction = back camera = -Z of screen frame, transformed to ENU world frame.
 */
function deviceOrientationToAzAlt(alpha: number, beta: number, gamma: number): { az: number; alt: number } {
  const D  = Math.PI / 180;
  const cA = Math.cos(alpha * D), sA = Math.sin(alpha * D);
  const cB = Math.cos(beta  * D), sB = Math.sin(beta  * D);
  const cG = Math.cos(gamma * D), sG = Math.sin(gamma * D);

  // Camera direction vector in East-North-Up world frame
  const east  = -(cA * sG - sA * sB * cG);
  const north =   sA * sG + cA * sB * cG;
  const up    =  -cB * cG;

  const alt = Math.asin(Math.max(-1, Math.min(1, up))) / D;
  const az  = ((Math.atan2(east, north) / D) + 360) % 360;
  return { az, alt };
}

const D_ = Math.PI / 180;

export function useDeviceOrientation(skyStateRef: MutableRefObject<SkyState>) {
  const startedRef = useRef(false);
  const hasAbsoluteSensorRef = useRef(false);
  const hasFirstReadingRef = useRef(false);
  // Double-EMA azimuth filter: two cascaded stages in 2D vector space
  const stage1Ref = useRef<[number, number]>([0, 1]);    // intermediate
  const stage2Ref = useRef<[number, number]>([0, 1]);    // final output

  // iOS webkitCompassHeading gimbal-lock flip compensation.
  // At ~45° device tilt, iOS compass flips ~180°. We track the accumulated
  // offset and un-flip the input so smoothAz sees no discontinuity.
  const prevWkRef = useRef<number | null>(null);
  const wkOffsetRef = useRef<number>(0);

  /** Double-EMA azimuth filter in 2D vector space (wrap-safe) */
  function smoothAz(rawAz: number): number {
    const rawE = Math.sin(rawAz * D_);
    const rawN = Math.cos(rawAz * D_);

    if (!hasFirstReadingRef.current) {
      stage1Ref.current = [rawE, rawN];
      stage2Ref.current = [rawE, rawN];
      return rawAz;
    }

    // Stage 1: moderate filter on raw input
    const s1 = stage1Ref.current;
    const dx1 = rawE - s1[0], dy1 = rawN - s1[1];
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const a1 = dist1 > AZ_GLITCH ? AZ_DRIFT : AZ_ALPHA1;
    let s1e = s1[0] + dx1 * a1, s1n = s1[1] + dy1 * a1;
    let len1 = Math.sqrt(s1e * s1e + s1n * s1n) || 1;
    stage1Ref.current = [s1e / len1, s1n / len1];

    // Stage 2: smooth the intermediate → kills high-frequency oscillation
    const s2 = stage2Ref.current;
    const dx2 = stage1Ref.current[0] - s2[0], dy2 = stage1Ref.current[1] - s2[1];
    let s2e = s2[0] + dx2 * AZ_ALPHA2;
    let s2n = s2[1] + dy2 * AZ_ALPHA2;
    let len2 = Math.sqrt(s2e * s2e + s2n * s2n) || 1;
    stage2Ref.current = [s2e / len2, s2n / len2];

    return ((Math.atan2(stage2Ref.current[0], stage2Ref.current[1]) / D_) + 360) % 360;
  }

  /** Smooth altitude directly — no singularity on this axis */
  function smoothAlt(rawAlt: number): number {
    if (!hasFirstReadingRef.current) return rawAlt;
    const dAlt = rawAlt - skyStateRef.current.deviceAlt;
    if (Math.abs(dAlt) > ALT_GLITCH) {
      return skyStateRef.current.deviceAlt + dAlt * ALT_DRIFT;
    }
    return skyStateRef.current.deviceAlt + dAlt * ALT_ALPHA;
  }

  function handleAbsolute(e: DeviceOrientationEvent) {
    hasAbsoluteSensorRef.current = true;
    skyStateRef.current.hasSensor = true;
    if (e.alpha == null || e.beta == null || e.gamma == null) return;

    // Debug: store raw sensor values
    skyStateRef.current.rawAlpha = e.alpha;
    skyStateRef.current.rawBeta = e.beta;
    skyStateRef.current.rawGamma = e.gamma;
    skyStateRef.current.sensorSource = 'absolute';

    // Rotation matrix az (for comparison — NOT used for output)
    const { az: matrixAz } = deviceOrientationToAzAlt(e.alpha, e.beta, e.gamma);
    skyStateRef.current.rawAz = matrixAz;

    const rawAlt = Math.asin(Math.max(-1, Math.min(1,
      -Math.cos(e.beta * D_) * Math.cos(e.gamma * D_)))) / D_;
    skyStateRef.current.rawAlt = rawAlt;
    const alt = smoothAlt(rawAlt);
    skyStateRef.current.deviceAlt = alt;

    if (skyStateRef.current.viewLocked) return;

    const prevAz = skyStateRef.current.deviceAz;
    skyStateRef.current.deviceAz  = smoothAz(e.alpha);
    skyStateRef.current.azDelta = ((skyStateRef.current.deviceAz - prevAz + 540) % 360) - 180;

    skyStateRef.current.deviceRoll = e.gamma;
    hasFirstReadingRef.current = true;
  }

  function handleOrientation(e: DeviceOrientationEvent) {
    if (hasAbsoluteSensorRef.current) return;

    const wk        = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const hasCompass = typeof wk === 'number' && isFinite(wk);
    const hasAbsAlpha = e.absolute === true && typeof e.alpha === 'number' && isFinite(e.alpha!);

    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    if (!hasCompass && !hasAbsAlpha && e.alpha === 0 && e.beta === 0 && e.gamma === 0) return;
    if (e.beta == null) return;

    skyStateRef.current.hasSensor = true;
    skyStateRef.current.deviceRoll = e.gamma ?? 0;

    // Debug: store raw sensor values
    skyStateRef.current.rawAlpha = e.alpha ?? 0;
    skyStateRef.current.rawBeta = e.beta;
    skyStateRef.current.rawGamma = e.gamma ?? 0;

    // Rotation matrix az (for comparison)
    const { az: matrixAz } = deviceOrientationToAzAlt(e.alpha ?? 0, e.beta, e.gamma ?? 0);
    skyStateRef.current.rawAz = matrixAz;

    // Altitude from beta/gamma (no alpha dependency, no singularity)
    const rawAlt = Math.asin(Math.max(-1, Math.min(1,
      -Math.cos(e.beta * D_) * Math.cos((e.gamma ?? 0) * D_)))) / D_;
    skyStateRef.current.rawAlt = rawAlt;
    const alt = smoothAlt(rawAlt);
    skyStateRef.current.deviceAlt = alt;

    if (skyStateRef.current.viewLocked) return;

    const prevAz = skyStateRef.current.deviceAz;
    if (hasCompass) {
      // Detect iOS gimbal-lock flip: wk jumps >120° in one frame (physically
      // impossible as real rotation at 60fps; always a sensor artifact at ~45° tilt).
      // Accumulate offset to un-flip so the filter input is continuous.
      const prevWk = prevWkRef.current;
      if (prevWk !== null) {
        const wkJump = ((wk! - prevWk + 540) % 360) - 180;
        if (Math.abs(wkJump) > 120) {
          wkOffsetRef.current = ((wkOffsetRef.current - wkJump) % 360 + 360) % 360;
        }
      }
      prevWkRef.current = wk!;
      const correctedWk = ((wk! + wkOffsetRef.current) % 360 + 360) % 360;
      skyStateRef.current.deviceAz = smoothAz(correctedWk);
      skyStateRef.current.sensorSource = `wk:${wk!.toFixed(0)} off:${wkOffsetRef.current.toFixed(0)}`;
    } else {
      const alpha = hasAbsAlpha ? e.alpha! : (e.alpha ?? 0);
      skyStateRef.current.deviceAz = smoothAz(alpha);
      skyStateRef.current.sensorSource = hasAbsAlpha ? 'abs-alpha' : 'rel-alpha';
    }
    skyStateRef.current.azDelta = ((skyStateRef.current.deviceAz - prevAz + 540) % 360) - 180;
    hasFirstReadingRef.current = true;
  }

  function startSensorListeners() {
    if (startedRef.current) return;
    startedRef.current = true;

    window.addEventListener('deviceorientationabsolute', handleAbsolute as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
  }

  async function requestIOSPermission(): Promise<boolean> {
    const DOE = window.DeviceOrientationEvent as DOEWithPermission;
    if (typeof DOE?.requestPermission === 'function') {
      try {
        const r = await DOE.requestPermission();
        if (r === 'granted') { startSensorListeners(); return true; }
        return false;
      } catch { return false; }
    }
    startSensorListeners();
    return true;
  }

  // Android/Desktop: start immediately on mount (no permission prompt needed)
  useEffect(() => {
    const DOE = window.DeviceOrientationEvent as DOEWithPermission;
    if (typeof DOE?.requestPermission !== 'function') {
      startSensorListeners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { startSensorListeners, requestIOSPermission };
}
