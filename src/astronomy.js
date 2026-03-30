/**
 * astronomy.js — astronomy-engine wrapper
 * Uses the astronomy-engine library loaded via CDN in main.js
 */

// astronomy-engine is loaded as a global `Astronomy` from CDN
// We wrap key calculations here

export function getObserver(lat, lon) {
  return new Astronomy.Observer(lat, lon, 0);
}

/**
 * Convert equatorial (RA hours, Dec degrees) to horizontal (alt, az) coordinates.
 * @param {number} raDeg  RA in degrees (0-360)
 * @param {number} dec    Declination in degrees
 * @param {Date}   date
 * @param {object} observer astronomy-engine Observer
 * @returns {{ altitude: number, azimuth: number }}
 */
export function equatorialToHorizontal(raDeg, dec, date, observer) {
  const raHours = raDeg / 15;
  const equ = new Astronomy.Equatorial(raHours, dec, 1);
  const hor = Astronomy.HorizonFromVector(
    Astronomy.VectorFromEquator(equ, date, observer),
    observer,
    date,
    'normal'
  );
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

/**
 * Simpler horizon calculation using GMST.
 */
export function raDecToAltAz(raDeg, decDeg, date, lat, lon) {
  const jd = dateToJD(date);
  const lst = localSiderealTime(jd, lon); // degrees
  const ha = ((lst - raDeg) % 360 + 360) % 360; // hour angle degrees

  const latR = toRad(lat);
  const decR = toRad(decDeg);
  const haR = toRad(ha);

  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const altitude = toDeg(Math.asin(sinAlt));

  const cosA = (Math.sin(decR) - sinAlt * Math.sin(latR)) / (Math.cos(toDeg(Math.acos(sinAlt)) * Math.PI / 180) * Math.cos(latR));
  let azimuth = toDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
  if (Math.sin(haR) > 0) azimuth = 360 - azimuth;

  return { altitude, azimuth };
}

/**
 * Julian Date from JS Date
 */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time in degrees
 */
export function gmst(jd) {
  const T = (jd - 2451545.0) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * 0.000387933 - T * T * T / 38710000;
  return ((g % 360) + 360) % 360;
}

/**
 * Local Sidereal Time in degrees
 */
export function localSiderealTime(jd, lonDeg) {
  return (gmst(jd) + lonDeg + 360) % 360;
}

/**
 * Get Moon illumination fraction and phase angle (0-1, 0=new, 0.5=full)
 */
export function getMoonPhase(date) {
  const jd = dateToJD(date);
  const T = (jd - 2451545.0) / 36525;
  // Mean elongation of moon
  const D = toRad(297.85036 + 445267.111480 * T - 0.0019142 * T * T + T * T * T / 189474);
  // Mean anomaly of Sun
  const M = toRad(357.52772 + 35999.050340 * T - 0.0001603 * T * T - T * T * T / 300000);
  // Mean anomaly of Moon
  const Mp = toRad(134.96298 + 477198.867398 * T + 0.0086972 * T * T + T * T * T / 56250);

  // Phase angle
  const i = 180 - toDeg(D) - 6.289 * Math.sin(Mp) + 2.1 * Math.sin(M)
            - 1.274 * Math.sin(2 * D - Mp) - 0.658 * Math.sin(2 * D)
            - 0.214 * Math.sin(2 * Mp) - 0.11 * Math.sin(D);

  const illumination = (1 + Math.cos(toRad(i))) / 2;

  // Synodic month fraction (0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter)
  const synodicDays = 29.53058867;
  const knownNewMoon = 2451550.1; // Jan 6, 2000 new moon JD
  const daysSinceNew = (jd - knownNewMoon) % synodicDays;
  const phase = ((daysSinceNew / synodicDays) % 1 + 1) % 1;

  return { illumination, phase };
}

/**
 * Phase name in Korean
 */
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
 * Get planet positions using simplified VSOP87 approximations
 * Returns { altitude, azimuth, magnitude, visible }
 */
export function getPlanetPositions(date, lat, lon) {
  const jd = dateToJD(date);
  const T = (jd - 2451545.0) / 36525;

  const planets = [
    { name: '수성', nameEn: 'Mercury', icon: '☿', ...mercuryPos(T) },
    { name: '금성', nameEn: 'Venus',   icon: '♀', ...venusPos(T) },
    { name: '화성', nameEn: 'Mars',    icon: '♂', ...marsPos(T) },
    { name: '목성', nameEn: 'Jupiter', icon: '♃', ...jupiterPos(T) },
    { name: '토성', nameEn: 'Saturn',  icon: '♄', ...saturnPos(T) },
    { name: '천왕성', nameEn: 'Uranus', icon: '⛢', ...uranusPos(T) },
    { name: '해왕성', nameEn: 'Neptune', icon: '♆', ...neptunePos(T) },
  ];

  return planets.map((p) => {
    const { altitude, azimuth } = raDecToAltAz(p.ra, p.dec, date, lat, lon);
    return { ...p, altitude, azimuth, visible: altitude > 5 };
  });
}

// Simplified planet mean longitude calculations (degrees)
function mercuryPos(T) {
  const L = (252.2509 + 149472.6746 * T) % 360;
  const ra = (L + 10 + 360) % 360;
  return { ra, dec: 5 * Math.sin(toRad(L)), mag: -0.5 };
}
function venusPos(T) {
  const L = (181.9798 + 58517.8156 * T) % 360;
  const ra = (L + 8 + 360) % 360;
  return { ra, dec: 3.4 * Math.sin(toRad(L + 30)), mag: -4.0 };
}
function marsPos(T) {
  const L = (355.433 + 19140.2993 * T) % 360;
  const ra = (L + 360) % 360;
  return { ra, dec: 1.85 * Math.sin(toRad(L + 20)), mag: 0.6 };
}
function jupiterPos(T) {
  const L = (34.351 + 3034.9057 * T) % 360;
  const ra = (L + 360) % 360;
  return { ra, dec: 1.3 * Math.sin(toRad(L + 10)), mag: -2.1 };
}
function saturnPos(T) {
  const L = (50.077 + 1222.1138 * T) % 360;
  const ra = (L + 360) % 360;
  return { ra, dec: 2.49 * Math.sin(toRad(L + 5)), mag: 0.7 };
}
function uranusPos(T) {
  const L = (314.055 + 428.4748 * T) % 360;
  const ra = (L + 360) % 360;
  return { ra, dec: 0.77 * Math.sin(toRad(L)), mag: 5.7 };
}
function neptunePos(T) {
  const L = (304.349 + 218.4600 * T) % 360;
  const ra = (L + 360) % 360;
  return { ra, dec: 1.77 * Math.sin(toRad(L)), mag: 8.0 };
}

/**
 * Approximate Moon rise/set times for today
 */
export function getMoonRiseSet(date, lat, lon) {
  // Sample moon altitude over 24 hours at 10-min intervals
  const results = [];
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);

  let prevAlt = null;
  let riseTime = null, setTime = null;

  for (let m = 0; m <= 24 * 60; m += 10) {
    const t = new Date(base.getTime() + m * 60000);
    const { phase } = getMoonPhase(t);
    // Approximate moon RA from phase
    const moonRA = (phase * 360 + sunRA(t)) % 360;
    const moonDec = 5 * Math.sin(toRad(moonRA));
    const { altitude } = raDecToAltAz(moonRA, moonDec, t, lat, lon);

    if (prevAlt !== null) {
      if (prevAlt < 0 && altitude >= 0 && !riseTime) riseTime = t;
      if (prevAlt >= 0 && altitude < 0 && !setTime) setTime = t;
    }
    prevAlt = altitude;
  }

  const fmt = (d) => d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '--:--';
  return { rise: fmt(riseTime), set: fmt(setTime) };
}

function sunRA(date) {
  const jd = dateToJD(date);
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = toRad((357.528 + 0.9856003 * n) % 360);
  const lambda = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  return (lambda + 360) % 360;
}

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
