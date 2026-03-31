/**
 * astronomy.js — Astronomical calculations (no external dependency)
 */

export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmst(jd) {
  const T = (jd - 2451545.0) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
        + T * T * 0.000387933 - T * T * T / 38710000;
  return ((g % 360) + 360) % 360;
}

export function localSiderealTime(jd, lonDeg) {
  return (gmst(jd) + lonDeg + 360) % 360;
}

/**
 * Equatorial (RA°, Dec°) → Horizontal (altitude°, azimuth°)
 * Fixed: cos(alt) = sqrt(1 - sin²(alt)), not sinAlt
 */
export function raDecToAltAz(raDeg, decDeg, date, lat, lon) {
  const jd = dateToJD(date);
  const lst = localSiderealTime(jd, lon);
  const ha = ((lst - raDeg) % 360 + 360) % 360; // hour angle °

  const latR = toRad(lat);
  const decR = toRad(decDeg);
  const haR  = toRad(ha);

  const sinAlt = Math.sin(latR) * Math.sin(decR)
               + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const altitude = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

  // cos(altitude) — NOT sinAlt (that was the bug)
  const cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));

  let azimuth = 0;
  if (cosAlt > 1e-10) {
    const cosA = (Math.sin(decR) - sinAlt * Math.sin(latR)) / (cosAlt * Math.cos(latR));
    azimuth = toDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
    if (Math.sin(haR) > 0) azimuth = 360 - azimuth;
  }

  return { altitude, azimuth };
}

/**
 * Approximate Moon RA/Dec (good to ~1°)
 * Based on Jean Meeus "Astronomical Algorithms" Ch.47
 */
export function getMoonPosition(date) {
  const jd = dateToJD(date);
  const T  = (jd - 2451545.0) / 36525;

  const L0 = ((218.3164477 + 481267.88123421 * T) % 360 + 360) % 360;
  const M  = toRad(((134.9633964 + 477198.8675055  * T) % 360 + 360) % 360);
  const Ms = toRad(((357.5291092 + 35999.0502909   * T) % 360 + 360) % 360);
  const F  = toRad(((93.2720950  + 483202.0175233  * T) % 360 + 360) % 360);
  const D  = toRad(((297.8501921 + 445267.1114034  * T) % 360 + 360) % 360);

  const dLon = 6.289 * Math.sin(M)
             - 1.274 * Math.sin(2*D - M)
             + 0.658 * Math.sin(2*D)
             - 0.186 * Math.sin(Ms)
             - 0.059 * Math.sin(2*M - 2*D)
             - 0.057 * Math.sin(M - 2*D + Ms)
             + 0.053 * Math.sin(M + 2*D)
             + 0.046 * Math.sin(2*D - Ms)
             + 0.041 * Math.sin(M - Ms);

  const dLat = 5.128 * Math.sin(F)
             + 0.280 * Math.sin(M + F)
             - 0.280 * Math.sin(F - M)
             - 0.173 * Math.sin(F - 2*D)
             - 0.055 * Math.sin(2*D - M + F)
             - 0.046 * Math.sin(2*D + F - M)
             + 0.033 * Math.sin(F + 2*D);

  const lonR = toRad((L0 + dLon + 360) % 360);
  const latR = toRad(dLat);

  // Ecliptic → Equatorial (ε ≈ 23.439°)
  const eps = toRad(23.439 - 0.0000004 * T * 36525);
  const sinDec = Math.sin(latR) * Math.cos(eps)
               + Math.cos(latR) * Math.sin(eps) * Math.sin(lonR);
  const dec = toDeg(Math.asin(Math.max(-1, Math.min(1, sinDec))));

  const y = Math.sin(lonR) * Math.cos(eps) - Math.tan(latR) * Math.sin(eps);
  const x = Math.cos(lonR);
  const ra = ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;

  return { ra, dec };
}

/**
 * Moon phase: illumination fraction + 0–1 cycle
 * phase and illumination are derived from the same geometric formula to stay consistent.
 */
export function getMoonPhase(date) {
  const jd = dateToJD(date);
  const T  = (jd - 2451545.0) / 36525;

  // Mean elongation of the moon from the sun (degrees, before perturbations)
  const Dangle = ((297.85036 + 445267.111480 * T - 0.0019142 * T*T) % 360 + 360) % 360;
  const D  = toRad(Dangle);
  const M  = toRad(((357.52772 + 35999.050340  * T - 0.0001603 * T*T) % 360 + 360) % 360);
  const Mp = toRad(((134.96298 + 477198.867398 * T + 0.0086972 * T*T) % 360 + 360) % 360);

  const i = 180 - Dangle
          - 6.289 * Math.sin(Mp) + 2.1 * Math.sin(M)
          - 1.274 * Math.sin(2*D - Mp) - 0.658 * Math.sin(2*D)
          - 0.214 * Math.sin(2*Mp) - 0.11 * Math.sin(D);

  const illumination = (1 + Math.cos(toRad(i))) / 2;

  // Derive phase consistently: waxing (0→0.5) if D < 180°, waning (0.5→1) otherwise.
  // This avoids the mismatch between the geometric and calendar-based formulas.
  const isWaxing = Dangle < 180;
  const phase = isWaxing ? illumination / 2 : 1 - illumination / 2;

  return { illumination, phase };
}

export function moonPhaseName(phase) {
  if (phase < 0.03 || phase > 0.97) return '삭 (New Moon)';
  if (phase < 0.22) return '초승달';
  if (phase < 0.28) return '상현달';
  if (phase < 0.47) return '상현 이후';
  if (phase < 0.53) return '보름달 (Full Moon)';
  if (phase < 0.72) return '하현 이전';
  if (phase < 0.78) return '하현달';
  return '그믐달';
}

/**
 * Planet positions — simplified mean longitude model
 */
export function getPlanetPositions(date, lat, lon) {
  const jd = dateToJD(date);
  const T  = (jd - 2451545.0) / 36525;

  const raw = [
    { name: '수성', nameEn: 'Mercury', icon: '☿', ...mercuryPos(T) },
    { name: '금성', nameEn: 'Venus',   icon: '♀', ...venusPos(T) },
    { name: '화성', nameEn: 'Mars',    icon: '♂', ...marsPos(T) },
    { name: '목성', nameEn: 'Jupiter', icon: '♃', ...jupiterPos(T) },
    { name: '토성', nameEn: 'Saturn',  icon: '♄', ...saturnPos(T) },
    { name: '천왕성', nameEn: 'Uranus', icon: '⛢', ...uranusPos(T) },
    { name: '해왕성', nameEn: 'Neptune', icon: '♆', ...neptunePos(T) },
  ];

  return raw.map((p) => {
    const { altitude, azimuth } = raDecToAltAz(p.ra, p.dec, date, lat, lon);
    return { ...p, altitude, azimuth, visible: altitude > 5 };
  });
}

function mercuryPos(T) {
  const L = ((252.2509 + 149472.6746 * T) % 360 + 360) % 360;
  return { ra: (L + 10) % 360, dec: 5 * Math.sin(toRad(L)), mag: -0.5 };
}
function venusPos(T) {
  const L = ((181.9798 + 58517.8156 * T) % 360 + 360) % 360;
  return { ra: (L + 8) % 360, dec: 3.4 * Math.sin(toRad(L + 30)), mag: -4.0 };
}
function marsPos(T) {
  const L = ((355.433 + 19140.2993 * T) % 360 + 360) % 360;
  return { ra: L, dec: 1.85 * Math.sin(toRad(L + 20)), mag: 0.6 };
}
function jupiterPos(T) {
  const L = ((34.351 + 3034.9057 * T) % 360 + 360) % 360;
  return { ra: L, dec: 1.3 * Math.sin(toRad(L + 10)), mag: -2.1 };
}
function saturnPos(T) {
  const L = ((50.077 + 1222.1138 * T) % 360 + 360) % 360;
  return { ra: L, dec: 2.49 * Math.sin(toRad(L + 5)), mag: 0.7 };
}
function uranusPos(T) {
  const L = ((314.055 + 428.4748 * T) % 360 + 360) % 360;
  return { ra: L, dec: 0.77 * Math.sin(toRad(L)), mag: 5.7 };
}
function neptunePos(T) {
  const L = ((304.349 + 218.4600 * T) % 360 + 360) % 360;
  return { ra: L, dec: 1.77 * Math.sin(toRad(L)), mag: 8.0 };
}

/**
 * Moon rise/set approximation by sampling altitude
 */
export function getMoonRiseSet(date, lat, lon) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  let prevAlt = null, riseTime = null, setTime = null;

  for (let m = 0; m <= 24 * 60; m += 10) {
    const t = new Date(base.getTime() + m * 60000);
    const { ra, dec } = getMoonPosition(t);
    const { altitude } = raDecToAltAz(ra, dec, t, lat, lon);
    if (prevAlt !== null) {
      if (prevAlt < 0 && altitude >= 0 && !riseTime) riseTime = t;
      if (prevAlt >= 0 && altitude < 0 && !setTime)  setTime  = t;
    }
    prevAlt = altitude;
  }

  const fmt = (d) => d
    ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    : '--:--';
  return { rise: fmt(riseTime), set: fmt(setTime) };
}

/**
 * Planet rise/set approximation by sampling altitude every 10 min
 */
export function getPlanetRiseSet(nameEn, date, lat, lon) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  let prevAlt = null, riseTime = null, setTime = null;

  for (let m = 0; m <= 24 * 60; m += 10) {
    const t = new Date(base.getTime() + m * 60000);
    const planets = getPlanetPositions(t, lat, lon);
    const p = planets.find((x) => x.nameEn === nameEn);
    if (!p) continue;
    if (prevAlt !== null) {
      if (prevAlt < 0 && p.altitude >= 0 && !riseTime) riseTime = t;
      if (prevAlt >= 0 && p.altitude < 0 && !setTime)  setTime  = t;
    }
    prevAlt = p.altitude;
  }

  const fmt = (d) => d
    ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    : '--:--';
  return { rise: fmt(riseTime), set: fmt(setTime) };
}

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
