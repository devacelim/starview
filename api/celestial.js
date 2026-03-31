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

// ── Supabase fetch ─────────────────────────────────────────────────────────────
async function fetchStars(supabaseUrl, anon) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/stars?select=*&order=mag.asc&limit=300`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
  );
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  // Normalise snake_case DB columns → camelCase (matches local stars.json)
  return rows.map(r => ({
    id: r.id, name: r.name, nameKo: r.name_ko,
    ra: r.ra, dec: r.dec, mag: r.mag, constellation: r.constellation,
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
  const starsOut = stars.map(s => ({ ...s, ...altAz(s.ra, s.dec, jd, lat, lon) }));

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
