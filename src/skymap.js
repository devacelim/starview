/**
 * skymap.js — AR/Virtual Sky Overlay Renderer
 */

import { raDecToAltAz, getMoonPosition, getMoonPhase } from './astronomy.js';
import { drawMiniMoon } from './moon.js';

let starsData  = [];
let constsData = [];

export async function loadSkyData() {
  const [starsRes, constsRes] = await Promise.all([
    fetch('/assets/stars.json'),
    fetch('/assets/constellations.json'),
  ]);
  starsData  = await starsRes.json();
  constsData = await constsRes.json();
}

/**
 * Gnomonic (tangent-plane) projection: alt/az → canvas (x,y)
 */
function project(altDeg, azDeg, deviceAz, deviceAlt, W, H, fovH) {
  const dAz  = ((azDeg  - deviceAz  + 540) % 360) - 180;
  const dAlt = altDeg - deviceAlt;
  const scale = W / fovH;
  const x = W / 2 + dAz  * scale;
  const y = H / 2 - dAlt * scale;
  const fovV   = fovH * (H / W);
  const margin = Math.max(fovH, fovV) * scale * 0.15;
  const visible = x > -margin && x < W + margin && y > -margin && y < H + margin;
  return { x, y, visible };
}

/**
 * Draw virtual sky background: gradient + horizon line + cardinal labels.
 */
function drawVirtualSky(ctx, W, H, deviceAz, deviceAlt, fov) {
  const scale  = W / fov;
  const horizY = Math.round(H / 2 + deviceAlt * scale);

  // Sky (above horizon)
  const clipAbove = Math.max(0, Math.min(H, horizY));
  if (clipAbove > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, clipAbove);
    sky.addColorStop(0,   '#000005');
    sky.addColorStop(0.6, '#030818');
    sky.addColorStop(1,   '#050d20');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, clipAbove);
  }

  // Ground (below horizon)
  if (horizY < H) {
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, Math.max(0, horizY), W, H - Math.max(0, horizY));
  }

  // Horizon glow + line
  if (horizY > -40 && horizY < H + 40) {
    const gw = ctx.createLinearGradient(0, horizY - 24, 0, horizY + 24);
    gw.addColorStop(0,   'rgba(30,80,200,0)');
    gw.addColorStop(0.5, 'rgba(30,80,200,0.1)');
    gw.addColorStop(1,   'rgba(30,80,200,0)');
    ctx.fillStyle = gw;
    ctx.fillRect(0, horizY - 24, W, 48);

    ctx.save();
    ctx.strokeStyle = 'rgba(100,150,255,0.22)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, horizY); ctx.lineTo(W, horizY);
    ctx.stroke();
    ctx.restore();
  }

  // Cardinal direction labels on the horizon
  const CARDINALS = ['N','NE','E','SE','S','SW','W','NW'];
  CARDINALS.forEach((lbl, i) => {
    const pos = project(0, i * 45, deviceAz, deviceAlt, W, H, fov);
    if (!pos.visible) return;
    ctx.save();
    ctx.font      = `bold 12px -apple-system, sans-serif`;
    ctx.fillStyle = lbl === 'N' ? 'rgba(255,160,80,0.85)' : 'rgba(126,184,247,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, pos.x, pos.y + 18);
    ctx.restore();
  });
}

/**
 * Main render — called every animation frame.
 * Uses state.stars (API, pre-computed alt/az) if available, else local catalog.
 */
export function renderSky(canvas, state) {
  const { lat, lon, deviceAz, deviceAlt, planets, moon, date, toggles, arMode, fov: stateFov } = state;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  const fov = stateFov ?? 60; // horizontal FOV degrees (zoom)

  // Background / clear
  if (arMode === 'virtual') {
    drawVirtualSky(ctx, W, H, deviceAz, deviceAlt, fov);
  } else {
    ctx.clearRect(0, 0, W, H);
  }

  if (lat == null || lon == null) return;

  const tog = toggles || { stars: true, constellations: true, moon: true, planets: true };

  // Resolve star catalog: API data (has pre-computed alt/az) or local JSON
  const catalog = state.stars || starsData;

  // Pre-project all stars
  const projected = catalog.map((star) => {
    let altitude, azimuth;
    if (star.altitude !== undefined && star.azimuth !== undefined) {
      // From API: positions already computed
      altitude = star.altitude;
      azimuth  = star.azimuth;
    } else {
      // Local fallback: compute on the fly
      const pos = raDecToAltAz(star.ra, star.dec, date, lat, lon);
      altitude  = pos.altitude;
      azimuth   = pos.azimuth;
    }
    return { ...star, altitude, azimuth, ...project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov) };
  });

  // ── Constellation lines ──────────────────────────────────────────────────
  if (tog.constellations) {
    ctx.save();
    ctx.strokeStyle = 'rgba(100,150,255,0.4)';
    ctx.lineWidth   = 1;
    constsData.forEach((c) => {
      c.lines.forEach(([idA, idB]) => {
        const a = projected.find((s) => s.id === idA);
        const b = projected.find((s) => s.id === idB);
        if (!a || !b) return;
        if (a.altitude < -5 && b.altitude < -5) return;
        if (!a.visible && !b.visible) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });
    ctx.restore();

    // Constellation labels
    constsData.forEach((c) => {
      const members = projected.filter(
        (s) => s.constellation?.toUpperCase() === c.id.toUpperCase() && s.visible && s.altitude > 0
      );
      if (members.length < 2) return;
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
      ctx.save();
      ctx.font      = 'bold 11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(126,184,247,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(c.nameKo || c.name, cx, cy - 6);
      ctx.restore();
    });
  }

  // ── Stars ────────────────────────────────────────────────────────────────
  if (tog.stars) {
    projected.forEach((star) => {
      if (!star.visible || star.altitude < -5) return;

      const radius = Math.max(0.8, 3.8 - star.mag * 0.85);
      const alpha  = Math.min(1, Math.max(0.25, (5 - star.mag) / 5.5));

      ctx.save();
      const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 2.5);
      grad.addColorStop(0,   `rgba(230,240,255,${alpha})`);
      grad.addColorStop(0.4, `rgba(200,220,255,${alpha * 0.7})`);
      grad.addColorStop(1,   'rgba(100,150,255,0)');
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      if (star.mag < 1.5) {
        ctx.save();
        ctx.font      = '11px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(180,210,255,0.85)';
        ctx.fillText(star.nameKo || star.name, star.x + radius + 4, star.y + 4);
        ctx.restore();
      }
    });
  }

  // ── Moon ─────────────────────────────────────────────────────────────────
  if (tog.moon && moon) {
    const pos = project(moon.altitude, moon.azimuth, deviceAz, deviceAlt, W, H, fov);
    if (pos.visible && moon.altitude > -5) {
      const R = 22;
      ctx.save();
      const glow = ctx.createRadialGradient(pos.x, pos.y, R * 0.5, pos.x, pos.y, R * 2.5);
      glow.addColorStop(0,   'rgba(255,245,200,0.25)');
      glow.addColorStop(1,   'rgba(255,245,200,0)');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.restore();

      const mc = Object.assign(document.createElement('canvas'), { width: R * 2, height: R * 2 });
      drawMiniMoon(mc, moon.phase);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(mc, pos.x - R, pos.y - R, R * 2, R * 2);
      ctx.restore();

      ctx.save();
      ctx.font      = 'bold 12px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,245,200,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('달', pos.x, pos.y + R + 14);
      ctx.restore();
    }
  }

  // ── Planets ──────────────────────────────────────────────────────────────
  if (tog.planets && planets) {
    planets.forEach((p) => {
      const pos = project(p.altitude, p.azimuth, deviceAz, deviceAlt, W, H, fov);
      if (!pos.visible || p.altitude < -5) return;

      ctx.save();
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 16);
      glow.addColorStop(0, 'rgba(247,201,126,0.6)');
      glow.addColorStop(1, 'rgba(247,201,126,0)');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.font         = '18px sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, pos.x, pos.y);

      ctx.font         = '11px -apple-system, sans-serif';
      ctx.fillStyle    = 'rgba(247,201,126,0.95)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.name, pos.x, pos.y + 20);
      ctx.restore();
    });
  }
}

/**
 * Tap hit-test — returns closest visible object.
 * Handles both API-provided (pre-computed) and locally-computed positions.
 */
export function hitTest(canvas, tapX, tapY, state) {
  const { lat, lon, deviceAz, deviceAlt, planets, moon, date, fov: stateFov } = state;
  const W   = canvas.width;
  const H   = canvas.height;
  const fov = stateFov ?? 60;

  let best = null, bestDist = 44;

  // Stars
  const catalog = state.stars || starsData;
  catalog.forEach((star) => {
    let altitude, azimuth;
    if (star.altitude !== undefined && star.azimuth !== undefined) {
      altitude = star.altitude; azimuth = star.azimuth;
    } else {
      const p = raDecToAltAz(star.ra, star.dec, date, lat, lon);
      altitude = p.altitude; azimuth = p.azimuth;
    }
    if (altitude < -5) return;
    const pos = project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov);
    const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
    if (d < bestDist) { bestDist = d; best = { type: 'star', data: star }; }
  });

  // Moon
  if (moon && moon.altitude > -5) {
    const pos = project(moon.altitude, moon.azimuth, deviceAz, deviceAlt, W, H, fov);
    const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
    if (d < 36) { bestDist = d; best = { type: 'moon', data: moon }; }
  }

  // Planets
  if (planets) {
    planets.forEach((p) => {
      if (p.altitude < -5) return;
      const pos = project(p.altitude, p.azimuth, deviceAz, deviceAlt, W, H, fov);
      const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
      if (d < bestDist) { bestDist = d; best = { type: 'planet', data: p }; }
    });
  }

  return best;
}
