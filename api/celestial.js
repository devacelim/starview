/**
 * Vercel Edge Function — Celestial positions via Supabase
 * GET /api/celestial?lat=&lon=&ts=
 */
export const config = { runtime: 'edge' };

// ── Math helpers ──────────────────────────────────────────────────────────────
const toR = d => d * Math.PI / 180;
const toD = r => r * 180 / Math.PI;
const mod = (x, n) => ((x % n) + n) % n;

function gmst(jd) {
  const T = (jd - 2451545.0) / 36525;
  return mod(280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + T * T * 0.000387933 - T * T * T / 38710000, 360);
}

function altAz(ra, dec, jd, lat, lon) {
  const ha    = toR(mod(gmst(jd) + lon - ra, 360));
  const latR  = toR(lat), decR = toR(dec);
  const sinA  = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(ha);
  const alt   = toD(Math.asin(Math.max(-1, Math.min(1, sinA))));
  const cosAlt = Math.sqrt(Math.max(0, 1 - sinA * sinA));
  let az = 0;
  if (cosAlt > 1e-10) {
    const cosA = (Math.sin(decR) - sinA * Math.sin(latR)) / (cosAlt * Math.cos(latR));
    az = toD(Math.acos(Math.max(-1, Math.min(1, cosA))));
    if (Math.sin(ha) > 0) az = 360 - az;
  }
  return { altitude: alt, azimuth: az };
}

function moonRaDec(jd) {
  const T  = (jd - 2451545.0) / 36525;
  const L0 = mod(218.3164477 + 481267.88123421 * T, 360);
  const M  = toR(mod(134.9633964 + 477198.8675055 * T, 360));
  const Ms = toR(mod(357.5291092 + 35999.0502909  * T, 360));
  const F  = toR(mod(93.2720950  + 483202.0175233 * T, 360));
  const D  = toR(mod(297.8501921 + 445267.1114034 * T, 360));

  const lon = mod(L0
    + 6.289 * Math.sin(M)    - 1.274 * Math.sin(2*D - M) + 0.658 * Math.sin(2*D)
    - 0.186 * Math.sin(Ms)   - 0.059 * Math.sin(2*M - 2*D)
    - 0.057 * Math.sin(M - 2*D + Ms) + 0.053 * Math.sin(M + 2*D)
    + 0.046 * Math.sin(2*D - Ms)     + 0.041 * Math.sin(M - Ms), 360);
  const lat = 5.128 * Math.sin(F)     + 0.280 * Math.sin(M + F)
    - 0.280 * Math.sin(F - M)         - 0.173 * Math.sin(F - 2*D)
    - 0.055 * Math.sin(2*D - M + F)   - 0.046 * Math.sin(2*D + F - M)
    + 0.033 * Math.sin(F + 2*D);

  const lonR = toR(lon), latR = toR(lat);
  const eps  = toR(23.439 - 0.0000004 * T * 36525);
  const sinDec = Math.sin(latR) * Math.cos(eps) + Math.cos(latR) * Math.sin(eps) * Math.sin(lonR);
  const dec = toD(Math.asin(Math.max(-1, Math.min(1, sinDec))));
  const ra  = mod(toD(Math.atan2(
    Math.sin(lonR) * Math.cos(eps) - Math.tan(latR) * Math.sin(eps),
    Math.cos(lonR)
  )), 360);
  return { ra, dec };
}

function moonPhase(jd) {
  const T      = (jd - 2451545.0) / 36525;
  const Dangle = mod(297.85036 + 445267.111480 * T - 0.0019142 * T * T, 360);
  const D      = toR(Dangle);
  const M      = toR(mod(357.52772 + 35999.050340 * T - 0.0001603 * T * T, 360));
  const Mp     = toR(mod(134.96298 + 477198.867398 * T + 0.0086972 * T * T, 360));
  const i      = 180 - Dangle
    - 6.289 * Math.sin(Mp) + 2.1 * Math.sin(M)
    - 1.274 * Math.sin(2*D - Mp) - 0.658 * Math.sin(2*D)
    - 0.214 * Math.sin(2*Mp) - 0.11 * Math.sin(D);
  const illumination = (1 + Math.cos(toR(i))) / 2;
  // phase derived from same formula as illumination to keep drawing consistent
  const phase = Dangle < 180 ? illumination / 2 : 1 - illumination / 2;
  return { illumination, phase };
}

const PLANET_DEFS = [
  { name: '수성', nameEn: 'Mercury', icon: '☿', mag: -0.5, L0: 252.2509, dL: 149472.6746, dRa: 10, dA: 5,    dP: 0  },
  { name: '금성', nameEn: 'Venus',   icon: '♀', mag: -4.0, L0: 181.9798, dL: 58517.8156,  dRa: 8,  dA: 3.4,  dP: 30 },
  { name: '화성', nameEn: 'Mars',    icon: '♂', mag:  0.6, L0: 355.433,  dL: 19140.2993,  dRa: 0,  dA: 1.85, dP: 20 },
  { name: '목성', nameEn: 'Jupiter', icon: '♃', mag: -2.1, L0: 34.351,   dL: 3034.9057,   dRa: 0,  dA: 1.3,  dP: 10 },
  { name: '토성', nameEn: 'Saturn',  icon: '♄', mag:  0.7, L0: 50.077,   dL: 1222.1138,   dRa: 0,  dA: 2.49, dP: 5  },
  { name: '천왕성', nameEn: 'Uranus',  icon: '⛢', mag:  5.7, L0: 314.055,  dL: 428.4748,    dRa: 0,  dA: 0.77, dP: 0  },
  { name: '해왕성', nameEn: 'Neptune', icon: '♆', mag:  8.0, L0: 304.349,  dL: 218.4600,    dRa: 0,  dA: 1.77, dP: 0  },
];

// ── Keplerian orbital elements (J2000) — Meeus Table 33a ─────────────────────
const ORB_API = {
  Earth:   { L0: 100.46457, Ln: 35999.37244,  e: 0.016710, wbar: 102.93768, a:  1.00000, i:  0.00000, Om:   0.00000 },
  Mars:    { L0: 355.45332, Ln:  19140.30268, e: 0.093412, wbar: 336.04084, a:  1.52366, i:  1.84969, Om:  49.55953 },
  Jupiter: { L0:  34.39644, Ln:   3034.74612, e: 0.048541, wbar:  14.72847, a:  5.20336, i:  1.30330, Om: 100.46444 },
  Saturn:  { L0:  49.94432, Ln:   1222.49309, e: 0.055508, wbar:  92.59132, a:  9.53707, i:  2.48446, Om: 113.71504 },
  Uranus:  { L0: 313.23218, Ln:    428.48202, e: 0.046295, wbar: 170.95427, a: 19.19126, i:  0.77320, Om:  74.22988 },
  Neptune: { L0: 304.87997, Ln:    218.46515, e: 0.008992, wbar:  44.96476, a: 30.06896, i:  1.76917, Om: 131.72169 },
};

function norm360a(d) { return ((d % 360) + 360) % 360; }

function eqCenterA(e, Mdeg) {
  const Mr = Mdeg * Math.PI / 180;
  return (180 / Math.PI) * (
    (2 * e - 0.25 * e ** 3) * Math.sin(Mr)
    + 1.25 * e * e           * Math.sin(2 * Mr)
    + (13 / 12) * e ** 3     * Math.sin(3 * Mr)
  );
}

function helioEclA(T, name) {
  const o   = ORB_API[name];
  const L   = norm360a(o.L0 + o.Ln * T);
  const M   = norm360a(L - o.wbar);
  const v   = norm360a(M + eqCenterA(o.e, M));
  const lon = norm360a(v + o.wbar);
  const r   = o.a * (1 - o.e * o.e) / (1 + o.e * Math.cos(v * Math.PI / 180));
  const lat = (180 / Math.PI) * Math.asin(
    Math.sin(o.i * Math.PI / 180) * Math.sin((lon - o.Om) * Math.PI / 180)
  );
  return { lon, lat, r };
}

function ecl2eqA(lon, lat, T) {
  const eps  = (23.439291 - 0.013004 * T) * Math.PI / 180;
  const lonR = lon * Math.PI / 180, latR = lat * Math.PI / 180;
  const sinD = Math.sin(latR) * Math.cos(eps) + Math.cos(latR) * Math.sin(eps) * Math.sin(lonR);
  const dec  = toD(Math.asin(Math.max(-1, Math.min(1, sinD))));
  const y    = Math.sin(lonR) * Math.cos(eps) - Math.tan(latR) * Math.sin(eps);
  const ra   = mod(toD(Math.atan2(y, Math.cos(lonR))), 360);
  return { ra, dec };
}

/**
 * Compute satellite RA/Dec from parent planet using simplified orbital mechanics.
 * poleRA/poleDec: planet's north pole (J2000, degrees)
 * L_deg: satellite's current orbital longitude in planet equatorial frame
 * a_km: semi-major axis in km
 */
function satRaDec(T, parentName, L_deg, a_km, poleRA, poleDec) {
  const earth  = helioEclA(T, 'Earth');
  const planet = helioEclA(T, parentName);

  // Geocentric planet RA/Dec
  const ex  = earth.r  * Math.cos(toR(earth.lon));
  const ey  = earth.r  * Math.sin(toR(earth.lon));
  const prr = planet.r * Math.cos(toR(planet.lat));
  const px  = prr * Math.cos(toR(planet.lon));
  const py  = prr * Math.sin(toR(planet.lon));
  const pz  = planet.r * Math.sin(toR(planet.lat));
  const dx = px - ex, dy = py - ey;
  const geoLon = mod(toD(Math.atan2(dy, dx)), 360);
  const geoLat = toD(Math.atan2(pz, Math.sqrt(dx * dx + dy * dy)));
  const { ra: pRA, dec: pDec } = ecl2eqA(geoLon, geoLat, T);
  const dist_km = Math.sqrt(dx * dx + dy * dy + pz * pz) * 149597870.7;

  // Angular semi-major axis (degrees)
  const a_deg = (a_km / dist_km) * (180 / Math.PI);

  // Sub-Earth latitude on planet (how elliptical the orbit appears from Earth)
  const De = Math.asin(Math.max(-1, Math.min(1,
    -Math.sin(toR(poleDec)) * Math.sin(toR(pDec))
    - Math.cos(toR(poleDec)) * Math.cos(toR(pDec)) * Math.cos(toR(pRA - poleRA))
  )));

  const Lr   = toR(L_deg);
  const dRA  = (a_deg * Math.cos(Lr)) / Math.cos(toR(pDec));
  const dDec =  a_deg * Math.sin(Lr) * Math.sin(De);
  return { ra: mod(pRA + dRA, 360), dec: pDec + dDec };
}

/** Compute all major satellite positions for the given JD/T */
function computeSatellites(T, jd, lat, lon) {
  const d  = jd - 2451545.0;

  // Galilean moons — Meeus Ch.44 + Laplace resonance
  const g1 = mod(106.07719 + 203.4889538 * d, 360);
  const g2 = mod(175.73161 + 101.3747235 * d, 360);
  const g3 = mod(120.55883 +  50.3176081 * d, 360);
  const g4 = mod( 84.44459 +  21.5710715 * d, 360);
  const l1 = mod(g1 + 0.472 * Math.sin(toR(2 * (g1 - g2))), 360);
  const l2 = mod(g2 + 0.473 * Math.sin(toR(2 * (g2 - g3))), 360);
  const l3 = mod(g3 + 0.199 * Math.sin(toR(2 * (g3 - g4))), 360);
  const l4 = g4;

  const ml = (n) => mod(n * d, 360);

  // Planet pole directions (J2000)
  const J = { ra: 268.057, dec:  64.495 };
  const S = { ra:  40.589, dec:  83.537 };
  const U = { ra: 257.311, dec: -15.175 };
  const N = { ra: 299.329, dec:  42.950 };
  const M = { ra: 317.681, dec:  52.887 };

  const SAT_CATALOG = [
    // metadata: id, name, nameKo, mag (used if not in DB)
    { id: 'io',        name: 'Io',        nameKo: '이오',       mag:  5.02, ...satRaDec(T, 'Jupiter', l1,         421800, J.ra, J.dec) },
    { id: 'europa',    name: 'Europa',    nameKo: '유로파',     mag:  5.29, ...satRaDec(T, 'Jupiter', l2,         671100, J.ra, J.dec) },
    { id: 'ganymede',  name: 'Ganymede',  nameKo: '가니메데',   mag:  4.61, ...satRaDec(T, 'Jupiter', l3,        1070400, J.ra, J.dec) },
    { id: 'callisto',  name: 'Callisto',  nameKo: '칼리스토',   mag:  5.65, ...satRaDec(T, 'Jupiter', l4,        1882700, J.ra, J.dec) },
    { id: 'mimas',     name: 'Mimas',     nameKo: '미마스',     mag: 12.90, ...satRaDec(T, 'Saturn', ml( 381.995),  185520, S.ra, S.dec) },
    { id: 'enceladus', name: 'Enceladus', nameKo: '엔셀라두스', mag: 11.70, ...satRaDec(T, 'Saturn', ml( 262.732),  238020, S.ra, S.dec) },
    { id: 'tethys',    name: 'Tethys',    nameKo: '테티스',     mag: 10.30, ...satRaDec(T, 'Saturn', ml( 190.698),  294619, S.ra, S.dec) },
    { id: 'dione',     name: 'Dione',     nameKo: '디오네',     mag: 10.40, ...satRaDec(T, 'Saturn', ml( 131.535),  377396, S.ra, S.dec) },
    { id: 'rhea',      name: 'Rhea',      nameKo: '레아',       mag:  9.65, ...satRaDec(T, 'Saturn', ml(  79.690),  527108, S.ra, S.dec) },
    { id: 'titan',     name: 'Titan',     nameKo: '타이탄',     mag:  8.40, ...satRaDec(T, 'Saturn', ml(  22.577), 1221870, S.ra, S.dec) },
    { id: 'hyperion',  name: 'Hyperion',  nameKo: '히페리온',   mag: 14.20, ...satRaDec(T, 'Saturn', ml(  16.920), 1481010, S.ra, S.dec) },
    { id: 'iapetus',   name: 'Iapetus',   nameKo: '이아페투스', mag: 11.00, ...satRaDec(T, 'Saturn', ml(   4.538), 3560820, S.ra, S.dec) },
    { id: 'phoebe',    name: 'Phoebe',    nameKo: '포이베',     mag: 16.50, ...satRaDec(T, 'Saturn', ml(  -0.657),12944300, S.ra, S.dec) },
    { id: 'miranda',   name: 'Miranda',   nameKo: '미란다',     mag: 15.80, ...satRaDec(T, 'Uranus', ml( 254.691),  129390, U.ra, U.dec) },
    { id: 'ariel',     name: 'Ariel',     nameKo: '아리엘',     mag: 14.40, ...satRaDec(T, 'Uranus', ml( 142.836),  191020, U.ra, U.dec) },
    { id: 'umbriel',   name: 'Umbriel',   nameKo: '움브리엘',   mag: 15.00, ...satRaDec(T, 'Uranus', ml(  86.869),  266300, U.ra, U.dec) },
    { id: 'titania',   name: 'Titania',   nameKo: '티타니아',   mag: 13.90, ...satRaDec(T, 'Uranus', ml(  41.351),  435910, U.ra, U.dec) },
    { id: 'oberon',    name: 'Oberon',    nameKo: '오베론',     mag: 14.10, ...satRaDec(T, 'Uranus', ml(  26.740),  583520, U.ra, U.dec) },
    { id: 'triton',    name: 'Triton',    nameKo: '트리톤',     mag: 13.50, ...satRaDec(T, 'Neptune', ml( -61.257),  354759, N.ra, N.dec) },
    { id: 'nereid',    name: 'Nereid',    nameKo: '네레이드',   mag: 19.70, ...satRaDec(T, 'Neptune', ml(   1.000), 5513818, N.ra, N.dec) },
    { id: 'phobos',    name: 'Phobos',    nameKo: '포보스',     mag: 11.30, ...satRaDec(T, 'Mars', ml(1128.845),    9376, M.ra, M.dec) },
    { id: 'deimos',    name: 'Deimos',    nameKo: '데이모스',   mag: 12.40, ...satRaDec(T, 'Mars', ml( 285.162),   23463, M.ra, M.dec) },
  ];

  return SAT_CATALOG.map(s => ({ ...s, type: 'satellite', ...altAz(s.ra, s.dec, jd, lat, lon) }));
}

// ── Supabase fetch ─────────────────────────────────────────────────────────────
async function fetchStars(supabaseUrl, anon) {
  // Exclude satellites — positions are always computed dynamically
  const res = await fetch(
    `${supabaseUrl}/rest/v1/stars?select=*&type=neq.satellite&order=mag.asc&limit=300`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
  );
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  // Normalise snake_case DB columns → camelCase (matches local stars.json)
  return rows.map(r => ({
    id: r.id, name: r.name, nameKo: r.name_ko,
    ra: r.ra, dec: r.dec, mag: r.mag, constellation: r.constellation,
    type: r.type ?? 'star',
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat'));
  const lon = parseFloat(searchParams.get('lon'));
  const ts  = parseInt(searchParams.get('ts') || String(Date.now()), 10);

  if (isNaN(lat) || isNaN(lon)) {
    return new Response(JSON.stringify({ error: 'lat and lon required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  let stars;
  try {
    stars = await fetchStars(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  const jd = ts / 86400000 + 2440587.5;
  const T  = (jd - 2451545.0) / 36525;

  // Stars with computed positions
  const starsOut = [
    ...stars.map(s => ({ ...s, ...altAz(s.ra, s.dec, jd, lat, lon) })),
    ...computeSatellites(T, jd, lat, lon),
  ];

  // Planets with computed positions
  const planetsOut = PLANET_DEFS.map(p => {
    const L   = mod(p.L0 + p.dL * T, 360);
    const ra  = mod(L + p.dRa, 360);
    const dec = p.dA * Math.sin(toR(L + p.dP));
    const pos = altAz(ra, dec, jd, lat, lon);
    return { ...p, ra, dec, altitude: pos.altitude, azimuth: pos.azimuth, visible: pos.altitude > 5 };
  });

  // Moon
  const mrd  = moonRaDec(jd);
  const mpos = altAz(mrd.ra, mrd.dec, jd, lat, lon);
  const mph  = moonPhase(jd);
  const moon = { ...mrd, altitude: mpos.altitude, azimuth: mpos.azimuth, ...mph };

  return new Response(JSON.stringify({ stars: starsOut, planets: planetsOut, moon, ts }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
