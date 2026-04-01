/**
 * useDeviceOrientation.ts — Device orientation sensor hook
 */

import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

// Azimuth smoothing (2D vector space — singularity-free)
const AZ_ALPHA_LOW  = 0.15;         // responsive at low elevation
const AZ_ALPHA_HIGH = 0.04;         // heavy smoothing near zenith
const AZ_ELEV_START = 25;           // elevation where adaptive smoothing begins
const AZ_ELEV_FULL  = 55;           // elevation where maximum smoothing is reached
const AZ_GLITCH     = 1.2;          // max 2D vector distance per frame (~70°)
const AZ_DRIFT      = 0.015;        // slow drift toward rejected readings

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
  // Azimuth: 2D unit vector [east, north] on horizontal plane (no zenith singularity)
  const smoothHoriz = useRef<[number, number]>([0, 1]);

  /** Smooth azimuth via 2D horizontal vector — immune to zenith singularity */
  function smoothAz(rawAz: number, absAlt: number): number {
    const rawE = Math.sin(rawAz * D_);
    const rawN = Math.cos(rawAz * D_);

    if (!hasFirstReadingRef.current) {
      smoothHoriz.current = [rawE, rawN];
      return rawAz;
    }

    const sv = smoothHoriz.current;
    const dx = rawE - sv[0], dy = rawN - sv[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Adaptive alpha: heavier smoothing at high elevation where az noise grows
    // cos(alt) factor: azimuth becomes physically undefined at zenith,
    // so scale tracking responsiveness by cos(elevation) to suppress gyro drift
    const t = Math.max(0, Math.min(1, (absAlt - AZ_ELEV_START) / (AZ_ELEV_FULL - AZ_ELEV_START)));
    const baseAlpha = AZ_ALPHA_LOW + (AZ_ALPHA_HIGH - AZ_ALPHA_LOW) * t;
    const alpha = baseAlpha * Math.cos(absAlt * D_);

    const a = dist > AZ_GLITCH ? AZ_DRIFT * Math.cos(absAlt * D_) : alpha;
    let he = sv[0] + dx * a;
    let hn = sv[1] + dy * a;
    const len = Math.sqrt(he * he + hn * hn) || 1;
    he /= len; hn /= len;
    smoothHoriz.current = [he, hn];

    return ((Math.atan2(he, hn) / D_) + 360) % 360;
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

    // Rotation-matrix approach: stable at any elevation (no gimbal lock)
    const raw = deviceOrientationToAzAlt(e.alpha, e.beta, e.gamma);
    const alt = smoothAlt(raw.alt);
    skyStateRef.current.deviceAlt = alt;
    skyStateRef.current.deviceAz  = smoothAz(raw.az, Math.abs(alt));
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

    if (hasCompass) {
      // iOS webkitCompassHeading: already tilt-compensated, use directly for azimuth.
      // Altitude: compute from beta/gamma via rotation matrix formula (gamma-aware).
      const rawAlt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * D_) * Math.cos((e.gamma ?? 0) * D_)))) / D_;
      const alt = smoothAlt(rawAlt);
      skyStateRef.current.deviceAlt = alt;
      skyStateRef.current.deviceAz  = smoothAz(wk!, Math.abs(alt));
    } else {
      // Non-iOS fallback: full rotation matrix for both az and alt
      const alpha = hasAbsAlpha ? e.alpha! : (e.alpha ?? 0);
      const raw = deviceOrientationToAzAlt(alpha, e.beta, e.gamma ?? 0);
      const alt = smoothAlt(raw.alt);
      skyStateRef.current.deviceAlt = alt;
      skyStateRef.current.deviceAz  = smoothAz(raw.az, Math.abs(alt));
    }
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
