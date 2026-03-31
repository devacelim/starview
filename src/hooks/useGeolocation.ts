/**
 * useGeolocation.ts — Geolocation hook
 */

import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

export function useGeolocation(skyStateRef: MutableRefObject<SkyState>) {
  async function requestGeolocation(): Promise<{ lat: number; lon: number }> {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      skyStateRef.current.lat = lat;
      skyStateRef.current.lon = lon;

      // Watch for updates
      navigator.geolocation.watchPosition(
        (p) => {
          const la = p.coords.latitude, lo = p.coords.longitude;
          if (isFinite(la) && isFinite(lo)) {
            skyStateRef.current.lat = la;
            skyStateRef.current.lon = lo;
          }
        },
        () => {},
        { enableHighAccuracy: true }
      );

      return { lat, lon };
    } catch {
      // Default: Seoul
      skyStateRef.current.lat = 37.5665;
      skyStateRef.current.lon = 126.9780;
      return { lat: 37.5665, lon: 126.9780 };
    }
  }

  return { requestGeolocation };
}
