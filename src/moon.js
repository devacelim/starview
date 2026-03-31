/**
 * moon.js — Moon phase rendering and calendar
 */

import { getMoonPhase, moonPhaseName, getMoonRiseSet } from './astronomy.js';

/**
 * Draw moon phase on a canvas element.
 * Algorithm: draw full lit circle, then overlay dark shadow on the unlit side.
 *   - phase 0   = new moon  (all dark)
 *   - phase 0.5 = full moon (all lit)
 *   - phase 1   = new moon  (all dark)
 */
export function drawMoon(canvas, phase) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const R  = Math.min(W, H) / 2 - 8;
  const cx = W / 2;
  const cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.5);
  glow.addColorStop(0, 'rgba(255,240,180,0)');
  glow.addColorStop(1, 'rgba(255,240,180,0.06)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();

  // 1. Draw fully lit circle (base)
  const litGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  litGrad.addColorStop(0, '#f8f4d0');
  litGrad.addColorStop(0.5, '#d4cfa0');
  litGrad.addColorStop(1, '#b0a870');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = litGrad;
  ctx.fill();
  ctx.restore();

  // 2. Draw dark shadow overlay (unlit portion)
  _drawShadow(ctx, cx, cy, R, phase, '#0d1020');

  // Craters
  _drawCraters(ctx, cx, cy, R, phase);

  // Border
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,200,180,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the dark shadow that covers the unlit side.
 * phaseFactor: 0 = new moon (all shadow), 1 = full moon (no shadow)
 * For waxing (0→0.5): shadow on LEFT
 * For waning (0.5→1): shadow on RIGHT
 */
function _drawShadow(ctx, cx, cy, R, phase, darkColor) {
  if (phase === 0.5) return; // full moon — no shadow

  // phaseFactor: 0 at new moon, 1 at full moon, 0 at new moon again
  const pf = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  const shadowX = R * (1 - pf); // 0 at full moon, R at new moon

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  ctx.beginPath();
  if (phase < 0.5) {
    // Shadow on LEFT
    // counterclockwise arc = left semicircle (top → left → bottom)
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
    // Close with clockwise ellipse (bottom → right side → top)
    ctx.ellipse(cx, cy, shadowX, R, 0, Math.PI / 2, -Math.PI / 2, false);
  } else {
    // Shadow on RIGHT
    // clockwise arc = right semicircle (top → right → bottom)
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
    // Close with counterclockwise ellipse (bottom → left side → top)
    ctx.ellipse(cx, cy, shadowX, R, 0, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.closePath();
  ctx.fillStyle = darkColor;
  ctx.fill();
  ctx.restore();
}

function _drawCraters(ctx, cx, cy, R, phase) {
  const craters = [
    { rx: 0.2, ry: -0.1, r: 0.08 },
    { rx: -0.3, ry: 0.2,  r: 0.06 },
    { rx: 0.1,  ry: 0.35, r: 0.05 },
    { rx: -0.15, ry: -0.3, r: 0.07 },
    { rx: 0.35, ry: 0.1,  r: 0.04 },
  ];
  ctx.save();
  ctx.globalAlpha = 0.12;
  craters.forEach((c) => {
    ctx.beginPath();
    ctx.arc(cx + c.rx * R, cy + c.ry * R, c.r * R, 0, Math.PI * 2);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * Mini moon icon for AR overlay and calendar
 */
export function drawMiniMoon(canvas, phase) {
  const ctx = canvas.getContext('2d');
  const W  = canvas.width;
  const R  = W / 2 - 1;
  const cx = W / 2, cy = W / 2;

  ctx.clearRect(0, 0, W, W);

  // Lit base
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#d4cfa0';
  ctx.fill();
  ctx.restore();

  _drawShadow(ctx, cx, cy, R, phase, '#111');
}

/**
 * Update the moon screen UI
 */
export function updateMoonScreen(lat, lon) {
  const now = new Date();
  const { phase, illumination } = getMoonPhase(now);

  const moonCanvas = document.getElementById('moon-canvas');
  drawMoon(moonCanvas, phase);

  document.getElementById('moon-phase-name').textContent = moonPhaseName(phase);
  document.getElementById('moon-illumination').textContent = `${Math.round(illumination * 100)}%`;

  const { rise, set } = getMoonRiseSet(now, lat, lon);
  document.getElementById('moon-rise').textContent = rise;
  document.getElementById('moon-set').textContent = set;

  buildMoonCalendar(now);
}

function buildMoonCalendar(baseDate) {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 30; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i - 2);
    const { phase } = getMoonPhase(d);
    const isToday = i === 2;

    const cell = document.createElement('div');
    cell.className = 'cal-day' + (isToday ? ' today' : '');

    const num = document.createElement('div');
    num.className = 'd-num';
    num.textContent = d.getDate();

    const c = document.createElement('canvas');
    c.width = 28; c.height = 28;
    drawMiniMoon(c, phase);

    cell.appendChild(num);
    cell.appendChild(c);
    grid.appendChild(cell);
  }
}
