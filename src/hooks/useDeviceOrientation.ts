/**
 * useDeviceOrientation.ts — Device orientation sensor hook
 */

import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

// Low-pass filter constants
const ALPHA_LOW  = 0.15;            // lerp factor at low elevation (responsive)
const ALPHA_HIGH = 0.03;            // lerp factor at high elevation (heavy smoothing)
const ALPHA_ELEV_START = 25;        // elevation where adaptive smoothing begins
const ALPHA_ELEV_FULL  = 55;        // elevation where maximum smoothing is reached
const GLITCH_THRESHOLD = 0.6;       // max unit-vector distance per frame (~35°)
const DRIFT_ALPHA = 0.015;          // slow drift toward rejected readings (prevents freeze)

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

/** Convert az/alt (degrees) to unit vector [east, north, up] */
function azAltToVec(az: number, alt: number): [number, number, number] {
  const D = Math.PI / 180;
  const ca = Math.cos(alt * D);
  return [Math.sin(az * D) * ca, Math.cos(az * D) * ca, Math.sin(alt * D)];
}

/** Convert unit vector [east, north, up] back to { az, alt } in degrees */
function vecToAzAlt(e: number, n: number, u: number): { az: number; alt: number } {
  const D = Math.PI / 180;
  const len = Math.sqrt(e * e + n * n + u * u) || 1;
  const alt = Math.asin(Math.max(-1, Math.min(1, u / len))) / D;
  const az  = ((Math.atan2(e / len, n / len) / D) + 360) % 360;
  return { az, alt };
}

export function useDeviceOrientation(skyStateRef: MutableRefObject<SkyState>) {
  const startedRef = useRef(false);
  const hasAbsoluteSensorRef = useRef(false);
  const hasFirstReadingRef = useRef(false);
  const smoothVec = useRef<[number, number, number]>([0, 1, 0]);

  /** Lerp + normalize helper */
  function lerpVec(sv: [number, number, number], raw: [number, number, number], a: number): [number, number, number] {
    let ve = sv[0] + (raw[0] - sv[0]) * a;
    let vn = sv[1] + (raw[1] - sv[1]) * a;
    let vu = sv[2] + (raw[2] - sv[2]) * a;
    const len = Math.sqrt(ve * ve + vn * vn + vu * vu) || 1;
    return [ve / len, vn / len, vu / len];
  }

  /** Smooth in 3D vector space — avoids azimuth singularity near zenith */
  function smoothOrientation(rawAz: number, rawAlt: number): { az: number; alt: number } {
    const raw = azAltToVec(rawAz, rawAlt);

    if (!hasFirstReadingRef.current) {
      smoothVec.current = raw;
      return { az: rawAz, alt: rawAlt };
    }

    // Glitch detection in vector space
    const dx = raw[0] - smoothVec.current[0];
    const dy = raw[1] - smoothVec.current[1];
    const dz = raw[2] - smoothVec.current[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > GLITCH_THRESHOLD) {
      // Likely glitch — but drift slowly toward it to prevent permanent freeze
      smoothVec.current = lerpVec(smoothVec.current, raw, DRIFT_ALPHA);
      return vecToAzAlt(smoothVec.current[0], smoothVec.current[1], smoothVec.current[2]);
    }

    // Adaptive alpha: stronger smoothing at high elevation (sensor noise amplifies)
    const absAlt = Math.abs(rawAlt);
    const t = Math.max(0, Math.min(1, (absAlt - ALPHA_ELEV_START) / (ALPHA_ELEV_FULL - ALPHA_ELEV_START)));
    const a = ALPHA_LOW + (ALPHA_HIGH - ALPHA_LOW) * t;

    smoothVec.current = lerpVec(smoothVec.current, raw, a);
    return vecToAzAlt(smoothVec.current[0], smoothVec.current[1], smoothVec.current[2]);
  }

  function handleAbsolute(e: DeviceOrientationEvent) {
    hasAbsoluteSensorRef.current = true;
    skyStateRef.current.hasSensor = true;
    if (e.alpha == null || e.beta == null || e.gamma == null) return;

    // Rotation-matrix approach: stable at any elevation (no gimbal lock)
    const raw = deviceOrientationToAzAlt(e.alpha, e.beta, e.gamma);
    const { az, alt } = smoothOrientation(raw.az, raw.alt);
    skyStateRef.current.deviceAz  = az;
    skyStateRef.current.deviceAlt = alt;
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
      const D    = Math.PI / 180;
      const rawAlt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * D) * Math.cos((e.gamma ?? 0) * D)))) / D;
      const smoothed = smoothOrientation(wk!, rawAlt);
      skyStateRef.current.deviceAz  = smoothed.az;
      skyStateRef.current.deviceAlt = smoothed.alt;
    } else {
      // Non-iOS fallback: full rotation matrix for both az and alt
      const alpha = hasAbsAlpha ? e.alpha! : (e.alpha ?? 0);
      const raw = deviceOrientationToAzAlt(alpha, e.beta, e.gamma ?? 0);
      const smoothed = smoothOrientation(raw.az, raw.alt);
      skyStateRef.current.deviceAz  = smoothed.az;
      skyStateRef.current.deviceAlt = smoothed.alt;
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
