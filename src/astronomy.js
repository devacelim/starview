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

// ── Orbital elements at J2000.0 (Meeus "Astronomical Algorithms" Table 33a) ──
// L0/Ln: mean longitude & rate (°/Julian century), wbar: longitude of perihelion (°)
// a: semi-major axis (AU), e: eccentricity, i: inclination (°), Om: ascending node (°)
const ORB = {
  Earth:   { L0: 100.46457, Ln: 35999.37244,  e: 0.016710, wbar: 102.93768, a:  1.00000, i:  0.00000, Om:   0.00000 },
  Mercury: { L0: 252.25032, Ln: 149472.67411, e: 0.205630, wbar:  77.45645, a:  0.38710, i:  7.00497, Om:  48.33076 },
  Venus:   { L0: 181.97973, Ln:  58517.81538, e: 0.006773, wbar: 131.56370, a:  0.72333, i:  3.39467, Om:  76.67984 },
  Mars:    { L0: 355.45332, Ln:  19140.30268, e: 0.093412, wbar: 336.04084, a:  1.52366, i:  1.84969, Om:  49.55953 },
  Jupiter: { L0:  34.39644, Ln:   3034.74612, e: 0.048541, wbar:  14.72847, a:  5.20336, i:  1.30330, Om: 100.46444 },
  Saturn:  { L0:  49.94432, Ln:   1222.49309, e: 0.055508, wbar:  92.59132, a:  9.53707, i:  2.48446, Om: 113.71504 },
  Uranus:  { L0: 313.23218, Ln:    428.48202, e: 0.046295, wbar: 170.95427, a: 19.19126, i:  0.77320, Om:  74.22988 },
  Neptune: { L0: 304.87997, Ln:    218.46515, e: 0.008992, wbar:  44.96476, a: 30.06896, i:  1.76917, Om: 131.72169 },
};

/** Normalize to [0, 360) */
function norm360(d) { return ((d % 360) + 360) % 360; }

/** Equation of center (degrees): given eccentricity e and mean anomaly M in degrees */
function eqCenter(e, Mdeg) {
  const Mr = Mdeg * Math.PI / 180;
  return (180 / Math.PI) * (
    (2*e - 0.25*e*e*e) * Math.sin(Mr)
    + (1.25*e*e)        * Math.sin(2*Mr)
    + (13/12*e*e*e)     * Math.sin(3*Mr)
  );
}

/** Heliocentric ecliptic lon (°), lat (°), r (AU) from Keplerian elements */
function helioEcl(T, name) {
  const o   = ORB[name];
  const L   = norm360(o.L0 + o.Ln * T);   // mean longitude
  const M   = norm360(L - o.wbar);          // mean anomaly
  const C   = eqCenter(o.e, M);
  const v   = norm360(M + C);               // true anomaly
  const lon = norm360(v + o.wbar);          // true ecliptic longitude
  const r   = o.a * (1 - o.e*o.e) / (1 + o.e * Math.cos(v * Math.PI / 180));
  const lat = (180/Math.PI) * Math.asin(
    Math.sin(o.i * Math.PI / 180) * Math.sin((lon - o.Om) * Math.PI / 180)
  );
  return { lon, lat, r };
}

/** Convert heliocentric ecliptic positions of Earth & planet to geocentric ecliptic (lon°, lat°) */
function helioToGeoEcl(earth, planet) {
  const eR   = earth.lon  * Math.PI / 180;
  const pR   = planet.lon * Math.PI / 180;
  const pBR  = planet.lat * Math.PI / 180;
  const xE = earth.r * Math.cos(eR),  yE = earth.r * Math.sin(eR);
  const xP = planet.r * Math.cos(pBR) * Math.cos(pR);
  const yP = planet.r * Math.cos(pBR) * Math.sin(pR);
  const zP = planet.r * Math.sin(pBR);
  const dx = xP - xE, dy = yP - yE, dz = zP;
  const geoLon = norm360(Math.atan2(dy, dx) * 180 / Math.PI);
  const geoLat = (180/Math.PI) * Math.atan2(dz, Math.sqrt(dx*dx + dy*dy));
  return { lon: geoLon, lat: geoLat };
}

/** Geocentric ecliptic (lon°, lat°) → equatorial (RA°, Dec°) */
function ecl2eq(lon, lat, T) {
  const eps  = (23.439291 - 0.013004 * T) * Math.PI / 180;
  const lonR = lon * Math.PI / 180;
  const latR = lat * Math.PI / 180;
  const sinD = Math.sin(latR)*Math.cos(eps) + Math.cos(latR)*Math.sin(eps)*Math.sin(lonR);
  const dec  = (180/Math.PI) * Math.asin(Math.max(-1, Math.min(1, sinD)));
  const y    = Math.sin(lonR)*Math.cos(eps) - Math.tan(latR)*Math.sin(eps);
  const ra   = norm360((180/Math.PI) * Math.atan2(y, Math.cos(lonR)));
  return { ra, dec };
}

/** Geocentric equatorial RA/Dec for a solar-system body */
function planetRaDec(T, name) {
  const earth  = helioEcl(T, 'Earth');
  const planet = helioEcl(T, name);
  const geo    = helioToGeoEcl(earth, planet);
  return ecl2eq(geo.lon, geo.lat, T);
}

/**
 * Planet positions — proper ecliptic-to-equatorial conversion via heliocentric elements
 * (Meeus-based, accurate to ~1–2° for 2000–2050)
 */
export function getPlanetPositions(date, lat, lon) {
  const jd = dateToJD(date);
  const T  = (jd - 2451545.0) / 36525;

  const raw = [
    { name: '수성', nameEn: 'Mercury', icon: '☿', ...planetRaDec(T, 'Mercury'), mag: -0.5 },
    { name: '금성', nameEn: 'Venus',   icon: '♀', ...planetRaDec(T, 'Venus'),   mag: -4.0 },
    { name: '화성', nameEn: 'Mars',    icon: '♂', ...planetRaDec(T, 'Mars'),    mag:  0.6 },
    { name: '목성', nameEn: 'Jupiter', icon: '♃', ...planetRaDec(T, 'Jupiter'), mag: -2.1 },
    { name: '토성', nameEn: 'Saturn',  icon: '♄', ...planetRaDec(T, 'Saturn'),  mag:  0.7 },
    { name: '천왕성', nameEn: 'Uranus', icon: '⛢', ...planetRaDec(T, 'Uranus'), mag:  5.7 },
    { name: '해왕성', nameEn: 'Neptune', icon: '♆', ...planetRaDec(T, 'Neptune'), mag: 8.0 },
  ];

  return raw.map((p) => {
    const { altitude, azimuth } = raDecToAltAz(p.ra, p.dec, date, lat, lon);
    return { ...p, altitude, azimuth, visible: altitude > 5 };
  });
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

// ── Satellite position computation ────────────────────────────────────────────

/**
 * Compute geocentric RA/Dec of a satellite given:
 *   T            — Julian centuries from J2000
 *   parentName   — key in ORB (e.g. 'Jupiter')
 *   L_deg        — satellite's current orbital longitude in planet equatorial frame (°)
 *   a_km         — satellite's semi-major axis (km)
 *   poleRA/Dec   — planet's north pole direction (J2000, degrees)
 */
function satFromParent(T, parentName, L_deg, a_km, poleRA, poleDec) {
  const earth  = helioEcl(T, 'Earth');
  const planet = helioEcl(T, parentName);

  // Geocentric RA/Dec of parent planet
  const geo = helioToGeoEcl(earth, planet);
  const { ra: pRA, dec: pDec } = ecl2eq(geo.lon, geo.lat, T);

  // Earth–planet distance in km
  const ex  = earth.r  * Math.cos(toRad(earth.lon));
  const ey  = earth.r  * Math.sin(toRad(earth.lon));
  const prr = planet.r * Math.cos(toRad(planet.lat));
  const px  = prr * Math.cos(toRad(planet.lon));
  const py  = prr * Math.sin(toRad(planet.lon));
  const pz  = planet.r * Math.sin(toRad(planet.lat));
  const dist_km = Math.sqrt((px - ex) ** 2 + (py - ey) ** 2 + pz ** 2) * 149597870.7;

  // Angular semi-major axis (degrees)
  const a_deg = (a_km / dist_km) * (180 / Math.PI);

  // Sub-Earth latitude on planet: determines how elliptical the orbit appears
  const De = Math.asin(Math.max(-1, Math.min(1,
    -Math.sin(toRad(poleDec)) * Math.sin(toRad(pDec))
    - Math.cos(toRad(poleDec)) * Math.cos(toRad(pDec)) * Math.cos(toRad(pRA - poleRA))
  )));

  // Sky-plane offsets: E-W foreshortened by cos(pDec), N-S foreshortened by sin(De)
  const Lr   = toRad(L_deg);
  const dRA  = (a_deg * Math.cos(Lr)) / Math.cos(toRad(pDec));
  const dDec =  a_deg * Math.sin(Lr) * Math.sin(De);

  return { ra: norm360(pRA + dRA), dec: pDec + dDec };
}

/**
 * Compute dynamic positions for all major planetary satellites.
 * Returns array of { id, ra, dec } for merging into the star catalog.
 *
 * Phase accuracy:
 *   Galilean moons — Meeus Ch.44 mean longitudes + main Laplace resonance (~0.01°)
 *   All other moons — correct orbital period, phase offset is approximate
 *     (no precise L0 epoch calibration; position angle may differ from truth by up to ~180°)
 */
export function getSatellitePositions(date) {
  const jd = dateToJD(date);
  const d  = jd - 2451545.0;   // days from J2000
  const T  = d / 36525;

  // Galilean moon mean longitudes (Meeus Ch.44) + main Laplace resonance corrections
  const g1 = norm360(106.07719 + 203.4889538 * d);
  const g2 = norm360(175.73161 + 101.3747235 * d);
  const g3 = norm360(120.55883 +  50.3176081 * d);
  const g4 = norm360( 84.44459 +  21.5710715 * d);
  const l1 = norm360(g1 + 0.472 * Math.sin(toRad(2 * (g1 - g2))));
  const l2 = norm360(g2 + 0.473 * Math.sin(toRad(2 * (g2 - g3))));
  const l3 = norm360(g3 + 0.199 * Math.sin(toRad(2 * (g3 - g4))));
  const l4 = g4;

  // Mean longitude helper for moons without precise L0 (correct period, approx phase)
  const ml = (n) => norm360(n * d);

  // Planet north-pole directions (J2000)
  const J = { ra: 268.057, dec:  64.495 }; // Jupiter
  const S = { ra:  40.589, dec:  83.537 }; // Saturn
  const U = { ra: 257.311, dec: -15.175 }; // Uranus
  const N = { ra: 299.329, dec:  42.950 }; // Neptune
  const M = { ra: 317.681, dec:  52.887 }; // Mars

  const sat = (parent, L, a_km, pole) =>
    satFromParent(T, parent, L, a_km, pole.ra, pole.dec);

  return [
    // ── Jupiter — Galilean moons (Meeus-accurate) ──────────────────────────
    { id: 'io',        ...sat('Jupiter', l1,         421800, J) },
    { id: 'europa',    ...sat('Jupiter', l2,         671100, J) },
    { id: 'ganymede',  ...sat('Jupiter', l3,        1070400, J) },
    { id: 'callisto',  ...sat('Jupiter', l4,        1882700, J) },

    // ── Saturn — mean periods, approx phase ───────────────────────────────
    { id: 'mimas',     ...sat('Saturn', ml( 381.995),   185520, S) },
    { id: 'enceladus', ...sat('Saturn', ml( 262.732),   238020, S) },
    { id: 'tethys',    ...sat('Saturn', ml( 190.698),   294619, S) },
    { id: 'dione',     ...sat('Saturn', ml( 131.535),   377396, S) },
    { id: 'rhea',      ...sat('Saturn', ml(  79.690),   527108, S) },
    { id: 'titan',     ...sat('Saturn', ml(  22.577),  1221870, S) },
    { id: 'hyperion',  ...sat('Saturn', ml(  16.920),  1481010, S) },
    { id: 'iapetus',   ...sat('Saturn', ml(   4.538),  3560820, S) },
    { id: 'phoebe',    ...sat('Saturn', ml(  -0.657), 12944300, S) }, // retrograde

    // ── Uranus — prograde in equatorial frame ─────────────────────────────
    { id: 'miranda',   ...sat('Uranus', ml( 254.691),   129390, U) },
    { id: 'ariel',     ...sat('Uranus', ml( 142.836),   191020, U) },
    { id: 'umbriel',   ...sat('Uranus', ml(  86.869),   266300, U) },
    { id: 'titania',   ...sat('Uranus', ml(  41.351),   435910, U) },
    { id: 'oberon',    ...sat('Uranus', ml(  26.740),   583520, U) },

    // ── Neptune ───────────────────────────────────────────────────────────
    { id: 'triton',    ...sat('Neptune', ml( -61.257),   354759, N) }, // retrograde
    { id: 'nereid',    ...sat('Neptune', ml(   1.000),  5513818, N) },

    // ── Mars ──────────────────────────────────────────────────────────────
    { id: 'phobos',    ...sat('Mars', ml(1128.845),    9376, M) },
    { id: 'deimos',    ...sat('Mars', ml( 285.162),   23463, M) },
  ];
}
