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
 * Draw virtual sky background: gradient + horizon line + cardinal labels + crosshair.
 */
function drawVirtualSky(ctx, W, H, deviceAz, deviceAlt, fov) {
  const scale  = W / fov;
  const horizY = Math.round(H / 2 + deviceAlt * scale);

  // === Sky above horizon ===
  const skyBottom = Math.max(0, Math.min(H, horizY));
  if (skyBottom > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, skyBottom);
    sky.addColorStop(0,    '#000008');
    sky.addColorStop(0.45, '#010c1e');
    sky.addColorStop(0.78, '#04152c');
    sky.addColorStop(1,    '#081c38');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, skyBottom);
  }

  // === Ground / underground sky below horizon ===
  if (horizY < H) {
    const groundTop = Math.max(0, horizY);
    if (deviceAlt < -5) {
      // Underground view: treat as a mirrored dark sky so stars show through
      const ug = ctx.createLinearGradient(0, groundTop, 0, Math.min(H, groundTop + 300));
      ug.addColorStop(0,   '#04100a');
      ug.addColorStop(1,   '#010405');
      ctx.fillStyle = ug;
      ctx.fillRect(0, groundTop, W, H - groundTop);
    } else {
      const ground = ctx.createLinearGradient(0, groundTop, 0, H);
      ground.addColorStop(0,   '#040a05');
      ground.addColorStop(0.3, '#030705');
      ground.addColorStop(1,   '#010302');
      ctx.fillStyle = ground;
      ctx.fillRect(0, groundTop, W, H - groundTop);
    }
  }

  // === Atmospheric horizon glow ===
  if (horizY > -120 && horizY < H + 120) {
    // Sky-side glow
    const topGlow = ctx.createLinearGradient(0, Math.max(0, horizY - 90), 0, horizY);
    topGlow.addColorStop(0,   'rgba(10,40,150,0)');
    topGlow.addColorStop(0.5, 'rgba(20,65,190,0.07)');
    topGlow.addColorStop(1,   'rgba(50,110,230,0.22)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, Math.max(0, horizY - 90), W, Math.min(90, horizY));

    // Ground-side glow
    if (horizY < H) {
      const botGlow = ctx.createLinearGradient(0, horizY, 0, Math.min(H, horizY + 70));
      botGlow.addColorStop(0,   'rgba(50,110,230,0.18)');
      botGlow.addColorStop(1,   'rgba(10,40,150,0)');
      ctx.fillStyle = botGlow;
      ctx.fillRect(0, horizY, W, Math.min(70, H - horizY));
    }

    // Horizon line
    ctx.save();
    ctx.shadowColor = 'rgba(80,150,255,0.5)';
    ctx.shadowBlur  = 6;
    ctx.strokeStyle = 'rgba(90,150,255,0.55)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, horizY);
    ctx.lineTo(W, horizY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // === Altitude scale (right edge) ===
  const scaleX = W - 24;
  [90, 60, 45, 30, 15, 0, -15, -30, -45, -60].forEach((alt) => {
    const y = H / 2 - (alt - deviceAlt) * scale;
    if (y < 8 || y > H - 8) return;
    const isHorizon = alt === 0;
    ctx.save();
    ctx.strokeStyle = isHorizon ? 'rgba(90,150,255,0.55)' : 'rgba(80,130,220,0.2)';
    ctx.lineWidth   = isHorizon ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(scaleX - 6, y);
    ctx.lineTo(scaleX + 6, y);
    ctx.stroke();
    if (alt % 30 === 0) {
      ctx.fillStyle = 'rgba(100,160,255,0.35)';
      ctx.font      = '9px -apple-system, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${alt >= 0 ? '+' : ''}${alt}°`, scaleX - 8, y + 3);
    }
    ctx.restore();
  });

  // === Cardinal direction labels ===
  const CARDINALS = [
    { lbl: 'N', az: 0 }, { lbl: 'NE', az: 45 }, { lbl: 'E', az: 90 }, { lbl: 'SE', az: 135 },
    { lbl: 'S', az: 180 }, { lbl: 'SW', az: 225 }, { lbl: 'W', az: 270 }, { lbl: 'NW', az: 315 },
  ];
  CARDINALS.forEach(({ lbl, az }) => {
    const pos = project(0, az, deviceAz, deviceAlt, W, H, fov);
    if (!pos.visible) return;
    const isN = lbl === 'N';
    const isMain = ['N','E','S','W'].includes(lbl);
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${isMain ? 13 : 11}px -apple-system, sans-serif`;
    // Glow outline
    ctx.strokeStyle = 'rgba(0,0,20,0.8)';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.strokeText(lbl, pos.x, pos.y + 20);
    ctx.fillStyle = isN ? 'rgba(255,165,70,0.95)' : 'rgba(120,180,255,0.8)';
    ctx.fillText(lbl, pos.x, pos.y + 20);
    ctx.restore();
  });

  // === Center crosshair ===
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(140,200,255,0.35)';
  ctx.lineWidth   = 1;
  const r   = 20;
  const arm = 16;
  const gap = 5;
  // Circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Cross arms
  ctx.beginPath();
  ctx.moveTo(cx - r - arm, cy); ctx.lineTo(cx - r - gap, cy);
  ctx.moveTo(cx + r + gap,  cy); ctx.lineTo(cx + r + arm, cy);
  ctx.moveTo(cx, cy - r - arm); ctx.lineTo(cx, cy - r - gap);
  ctx.moveTo(cx, cy + r + gap);  ctx.lineTo(cx, cy + r + arm);
  ctx.stroke();
  ctx.restore();

  // === Below-horizon indicator ===
  if (deviceAlt < -8) {
    const labelY = Math.min(horizY + 28, H - 20);
    ctx.save();
    ctx.fillStyle   = 'rgba(100,170,255,0.3)';
    ctx.font        = '11px -apple-system, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(`▼ 지평선 아래 ${Math.abs(Math.round(deviceAlt))}°`, W / 2, labelY);
    ctx.restore();
  }
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
    constsData.forEach((c) => {
      c.lines.forEach(([idA, idB]) => {
        const a = projected.find((s) => s.id === idA);
        const b = projected.find((s) => s.id === idB);
        if (!a || !b) return;
        if (!a.visible && !b.visible) return;
        const belowHorizon = a.altitude < 0 && b.altitude < 0;
        ctx.save();
        ctx.strokeStyle = belowHorizon
          ? 'rgba(60,100,200,0.18)'
          : 'rgba(100,155,255,0.38)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      });
    });

    // Constellation labels (allow slightly below horizon)
    constsData.forEach((c) => {
      const members = projected.filter(
        (s) => s.constellation?.toUpperCase() === c.id.toUpperCase() && s.visible && s.altitude > -20
      );
      if (members.length < 2) return;
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
      const avgAlt = members.reduce((s, m) => s + m.altitude, 0) / members.length;
      const belowHorizon = avgAlt < 0;
      ctx.save();
      ctx.font        = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      // Stroke outline for readability
      ctx.strokeStyle = 'rgba(0,0,20,0.85)';
      ctx.lineWidth   = 3;
      ctx.lineJoin    = 'round';
      ctx.strokeText(c.nameKo || c.name, cx, cy - 6);
      ctx.fillStyle = belowHorizon ? 'rgba(80,130,220,0.4)' : 'rgba(126,184,247,0.65)';
      ctx.fillText(c.nameKo || c.name, cx, cy - 6);
      ctx.restore();
    });
  }

  // ── Stars ────────────────────────────────────────────────────────────────
  if (tog.stars) {
    projected.forEach((star) => {
      if (!star.visible) return;

      const belowHorizon = star.altitude < 0;
      const alphaMult    = belowHorizon ? 0.3 : 1.0;
      const radius       = Math.max(0.8, 3.8 - star.mag * 0.85);
      const baseAlpha    = Math.min(1, Math.max(0.25, (5 - star.mag) / 5.5));
      const alpha        = baseAlpha * alphaMult;

      ctx.save();
      const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 2.8);
      grad.addColorStop(0,   `rgba(235,243,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(200,225,255,${alpha * 0.8})`);
      grad.addColorStop(0.7, `rgba(130,175,255,${alpha * 0.3})`);
      grad.addColorStop(1,   'rgba(80,130,255,0)');
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Star core
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,248,255,${alpha})`;
      ctx.fill();
      ctx.restore();

      if (star.mag < 1.5) {
        ctx.save();
        ctx.font        = '11px -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        // Outline for readability
        ctx.strokeStyle = 'rgba(0,0,20,0.8)';
        ctx.lineWidth   = 2.5;
        ctx.lineJoin    = 'round';
        ctx.strokeText(star.nameKo || star.name, star.x + radius + 5, star.y);
        ctx.fillStyle = belowHorizon ? 'rgba(130,180,255,0.5)' : 'rgba(185,215,255,0.9)';
        ctx.fillText(star.nameKo || star.name, star.x + radius + 5, star.y);
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
