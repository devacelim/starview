/**
 * useDeviceOrientation.ts — Device orientation sensor hook
 */

import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

// Low-pass filter constants
const AZ_ALPHA  = 0.12;
const ALT_ALPHA = 0.15;
const AZ_GLITCH  = 40;
const ALT_GLITCH = 35;

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

export function useDeviceOrientation(skyStateRef: MutableRefObject<SkyState>) {
  const startedRef = useRef(false);
  const hasAbsoluteSensorRef = useRef(false);
  const hasFirstReadingRef = useRef(false);  // bypass filter on first event

  function smoothAz(rawAz: number): number {
    if (!hasFirstReadingRef.current) return rawAz;  // first reading: set directly
    const dAz = ((rawAz - skyStateRef.current.deviceAz + 540) % 360) - 180;
    if (Math.abs(dAz) > AZ_GLITCH) return skyStateRef.current.deviceAz;
    return (skyStateRef.current.deviceAz + dAz * AZ_ALPHA + 360) % 360;
  }

  function smoothAlt(rawAlt: number): number {
    if (!hasFirstReadingRef.current) return rawAlt;  // first reading: set directly
    const dAlt = rawAlt - skyStateRef.current.deviceAlt;
    if (Math.abs(dAlt) > ALT_GLITCH) return skyStateRef.current.deviceAlt;
    return skyStateRef.current.deviceAlt + dAlt * ALT_ALPHA;
  }

  function handleAbsolute(e: DeviceOrientationEvent) {
    hasAbsoluteSensorRef.current = true;
    skyStateRef.current.hasSensor = true;
    if (e.alpha == null || e.beta == null || e.gamma == null) return;

    // Rotation-matrix approach: stable at any elevation (no gimbal lock)
    const { az, alt } = deviceOrientationToAzAlt(e.alpha, e.beta, e.gamma);
    skyStateRef.current.deviceAz   = smoothAz(az);
    skyStateRef.current.deviceAlt  = smoothAlt(alt);
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
      const D   = Math.PI / 180;
      const alt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * D) * Math.cos((e.gamma ?? 0) * D)))) / D;
      skyStateRef.current.deviceAz  = smoothAz(wk!);
      skyStateRef.current.deviceAlt = smoothAlt(alt);
    } else {
      // Non-iOS fallback: full rotation matrix for both az and alt
      const alpha = hasAbsAlpha ? e.alpha! : (e.alpha ?? 0);
      const { az, alt } = deviceOrientationToAzAlt(alpha, e.beta, e.gamma ?? 0);
      skyStateRef.current.deviceAz  = smoothAz(az);
      skyStateRef.current.deviceAlt = smoothAlt(alt);
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
