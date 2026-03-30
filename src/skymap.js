/**
 * skymap.js — AR Sky Overlay Renderer
 * Draws stars, constellation lines, and planets on canvas over camera feed.
 */

import { raDecToAltAz, localSiderealTime, dateToJD } from './astronomy.js';

let starsData = [];
let constsData = [];
let starMap = {};  // id -> star

export async function loadSkyData() {
  const [starsRes, constsRes] = await Promise.all([
    fetch('/assets/stars.json'),
    fetch('/assets/constellations.json'),
  ]);
  starsData = await starsRes.json();
  constsData = await constsRes.json();
  starsData.forEach((s) => { starMap[s.id] = s; });
}

/**
 * Project altitude/azimuth onto canvas coordinates given device orientation.
 * @param {number} altitude  degrees above horizon
 * @param {number} azimuth   degrees clockwise from North
 * @param {number} deviceAz  device heading (alpha) degrees
 * @param {number} deviceAlt device tilt (beta - 90) degrees
 * @param {number} W canvas width
 * @param {number} H canvas height
 * @param {number} fov field-of-view degrees (horizontal)
 * @returns {{ x: number, y: number, visible: boolean }}
 */
function project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov) {
  const dAz = ((azimuth - deviceAz + 540) % 360) - 180;
  const dAlt = altitude - deviceAlt;

  const scale = W / fov;
  const x = W / 2 + dAz * scale;
  const y = H / 2 - dAlt * scale;

  const margin = 60;
  const visible = x > -margin && x < W + margin && y > -margin && y < H + margin;
  return { x, y, visible };
}

/**
 * Main render function — call on each animation frame.
 */
export function renderSky(canvas, state) {
  const { lat, lon, deviceAz, deviceAlt, deviceRoll, planets, date } = state;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const fov = 60; // horizontal field of view in degrees

  ctx.clearRect(0, 0, W, H);

  if (!lat || !lon || starsData.length === 0) return;

  // Compute positions for all stars
  const projected = starsData.map((star) => {
    const { altitude, azimuth } = raDecToAltAz(star.ra, star.dec, date, lat, lon);
    const pos = project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov);
    return { ...star, altitude, azimuth, ...pos };
  });

  // Draw constellation lines
  ctx.save();
  constsData.forEach((c) => {
    c.lines.forEach(([idA, idB]) => {
      const a = projected.find((s) => s.id === idA);
      const b = projected.find((s) => s.id === idB);
      if (!a || !b || !a.visible || !b.visible) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(100,150,255,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  });
  ctx.restore();

  // Draw stars
  projected.forEach((star) => {
    if (!star.visible) return;
    if (star.altitude < -10) return;

    const radius = Math.max(0.5, 4 - star.mag * 0.9);
    const alpha = Math.min(1, Math.max(0.2, (5 - star.mag) / 6));

    ctx.save();
    ctx.beginPath();
    ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 2);
    grad.addColorStop(0, `rgba(220,235,255,${alpha})`);
    grad.addColorStop(1, `rgba(100,150,255,0)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Label for bright stars
    if (star.mag < 1.5 && radius > 2) {
      ctx.save();
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(180,210,255,0.8)';
      ctx.fillText(star.nameKo || star.name, star.x + radius + 4, star.y + 4);
      ctx.restore();
    }
  });

  // Draw constellation name labels
  constsData.forEach((c) => {
    const members = projected.filter((s) => s.constellation === c.id.toUpperCase() && s.visible);
    if (members.length < 2) return;
    const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
    if (cx < 0 || cx > W || cy < 0 || cy > H) return;

    ctx.save();
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(126,184,247,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(c.nameKo || c.name, cx, cy);
    ctx.restore();
  });

  // Draw planets
  if (planets) {
    planets.forEach((p) => {
      if (!p.visible) return;
      const pos = project(p.altitude, p.azimuth, deviceAz, deviceAlt, W, H, fov);
      if (!pos.visible) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,201,126,0.9)';
      ctx.fill();
      ctx.font = '14px sans-serif';
      ctx.fillText(p.icon, pos.x - 7, pos.y + 5);
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(247,201,126,0.9)';
      ctx.fillText(p.name, pos.x + 10, pos.y + 4);
      ctx.restore();
    });
  }
}

/**
 * Handle tap on canvas — return closest visible object
 */
export function hitTest(canvas, tapX, tapY, state) {
  const { lat, lon, deviceAz, deviceAlt, date } = state;
  const W = canvas.width;
  const H = canvas.height;
  const fov = 60;

  let best = null;
  let bestDist = 40;

  starsData.forEach((star) => {
    const { altitude, azimuth } = raDecToAltAz(star.ra, star.dec, date, lat, lon);
    const pos = project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov);
    if (!pos.visible) return;
    const d = Math.hypot(tapX - pos.x, tapY - pos.y);
    if (d < bestDist) { bestDist = d; best = { type: 'star', data: star }; }
  });

  return best;
}
