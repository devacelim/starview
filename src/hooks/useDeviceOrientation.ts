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

export function useDeviceOrientation(skyStateRef: MutableRefObject<SkyState>) {
  const startedRef = useRef(false);
  const hasAbsoluteSensorRef = useRef(false);

  function smoothAz(rawAz: number): number {
    const dAz = ((rawAz - skyStateRef.current.deviceAz + 540) % 360) - 180;
    if (Math.abs(dAz) > AZ_GLITCH) return skyStateRef.current.deviceAz;
    return (skyStateRef.current.deviceAz + dAz * AZ_ALPHA + 360) % 360;
  }

  function smoothAlt(rawAlt: number): number {
    const dAlt = rawAlt - skyStateRef.current.deviceAlt;
    if (Math.abs(dAlt) > ALT_GLITCH) return skyStateRef.current.deviceAlt;
    return skyStateRef.current.deviceAlt + dAlt * ALT_ALPHA;
  }

  function handleAbsolute(e: DeviceOrientationEvent) {
    hasAbsoluteSensorRef.current = true;
    skyStateRef.current.hasSensor = true;
    skyStateRef.current.deviceAz   = smoothAz(e.alpha ?? 0);
    skyStateRef.current.deviceAlt  = smoothAlt((e.beta ?? 90) - 90);
    skyStateRef.current.deviceRoll = e.gamma ?? 0;
  }

  function handleOrientation(e: DeviceOrientationEvent) {
    if (hasAbsoluteSensorRef.current) return;

    const wk        = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const hasCompass = typeof wk === 'number' && isFinite(wk);
    const hasAbsAlpha = e.absolute === true && typeof e.alpha === 'number' && isFinite(e.alpha!);

    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    if (!hasCompass && !hasAbsAlpha && e.alpha === 0 && e.beta === 0 && e.gamma === 0) return;
    if (e.beta == null) return;

    const az = hasCompass  ? wk!
             : hasAbsAlpha ? e.alpha!
             :               (e.alpha ?? 0);

    skyStateRef.current.hasSensor = true;
    skyStateRef.current.deviceAz   = smoothAz(az);
    skyStateRef.current.deviceAlt  = smoothAlt(e.beta - 90);
    skyStateRef.current.deviceRoll = e.gamma ?? 0;
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
