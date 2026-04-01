/**
 * useSkyObjects.ts — Manages star/planet/moon data updates
 */

import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState, Planet, MoonData } from '../types';
import { getPlanetPositions, getMoonPosition, getMoonPhase, raDecToAltAz, getSatellitePositions } from '../lib/astronomy';
import { loadSkyData, getStarsData } from '../lib/skymap';

export function useSkyObjects(skyStateRef: MutableRefObject<SkyState>, permGranted: boolean) {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [moon, setMoon] = useState<MoonData | null>(null);
  const initializedRef = useRef(false);

  function _localUpdate(now: Date = new Date()) {
    const s = skyStateRef.current;
    if (s.lat == null || s.lon == null) return;

    const newPlanets = getPlanetPositions(now, s.lat, s.lon);
    const { ra, dec }           = getMoonPosition(now);
    const { altitude, azimuth } = raDecToAltAz(ra, dec, now, s.lat, s.lon);
    const { phase, illumination } = getMoonPhase(now);
    const newMoon: MoonData = { ra, dec, altitude, azimuth, phase, illumination };

    const satPositions = getSatellitePositions(now);
    const satMap = Object.fromEntries(satPositions.map((sat) => [sat.id, sat]));
    const newStars = getStarsData().map((star) =>
      star.type === 'satellite' && satMap[star.id]
        ? { ...star, ...satMap[star.id], altitude: undefined, azimuth: undefined }
        : star
    );

    skyStateRef.current.planets = newPlanets;
    skyStateRef.current.moon    = newMoon;
    skyStateRef.current.stars   = newStars;
    setPlanets(newPlanets);
    setMoon(newMoon);
  }

  async function updateSkyObjects() {
    const s = skyStateRef.current;
    if (!s.lat || !s.lon) return;
    const now = new Date();
    // Always use local Keplerian planet calculations (API uses simplified formula)
    const localPlanets = getPlanetPositions(now, s.lat, s.lon);
    const { ra: mRa, dec: mDec } = getMoonPosition(now);
    const { altitude: mAlt, azimuth: mAz } = raDecToAltAz(mRa, mDec, now, s.lat, s.lon);
    const { phase: mPhase, illumination: mIllu } = getMoonPhase(now);
    const localMoon: MoonData = { ra: mRa, dec: mDec, altitude: mAlt, azimuth: mAz, phase: mPhase, illumination: mIllu };

    // Dynamic satellite positions
    const satPositions = getSatellitePositions(now);
    const satMap = Object.fromEntries(satPositions.map((sat) => [sat.id, sat]));

    try {
      const res = await fetch(
        `/api/celestial?lat=${s.lat}&lon=${s.lon}&ts=${now.getTime()}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Use API star catalog but overlay dynamic satellite positions
      const apiStars = (data.stars || []).map((star: any) =>
        star.type === 'satellite' && satMap[star.id]
          ? { ...star, ...satMap[star.id], altitude: undefined, azimuth: undefined }
          : star
      );
      skyStateRef.current.stars   = apiStars;
    } catch {
      // Fallback: local star data with dynamic satellite positions
      skyStateRef.current.stars = getStarsData().map((star) =>
        star.type === 'satellite' && satMap[star.id]
          ? { ...star, ...satMap[star.id], altitude: undefined, azimuth: undefined }
          : star
      );
    }

    skyStateRef.current.planets = localPlanets;
    skyStateRef.current.moon    = localMoon;
    setPlanets(localPlanets);
    setMoon(localMoon);
  }

  useEffect(() => {
    if (!permGranted) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    let interval: ReturnType<typeof setInterval>;
    loadSkyData().then(() => {
      updateSkyObjects();
      interval = setInterval(updateSkyObjects, 30000);
    });
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permGranted]);

  return { planets, moon };
}
