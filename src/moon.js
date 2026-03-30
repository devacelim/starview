/**
 * moon.js — Moon phase rendering and calendar
 */

import { getMoonPhase, moonPhaseName, getMoonRiseSet } from './astronomy.js';

/**
 * Draw moon phase on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number} phase 0-1 (0=new, 0.5=full)
 * @param {number} illumination 0-1
 */
export function drawMoon(canvas, phase, illumination) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const R = Math.min(W, H) / 2 - 8;
  const cx = W / 2;
  const cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Dark side
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  ctx.restore();

  // Glow
  const glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.4);
  glow.addColorStop(0, 'rgba(220,220,180,0)');
  glow.addColorStop(1, 'rgba(200,200,150,0.08)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();

  // Illuminated portion using clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // Determine lit side direction
  const waxing = phase < 0.5;
  const phaseAngle = phase < 0.5 ? phase * 2 : (phase - 0.5) * 2;

  // x-scale for the terminator ellipse
  const ellipseX = R * Math.abs(1 - phaseAngle * 2);

  ctx.beginPath();
  if (waxing) {
    // Right side lit
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(cx, cy, ellipseX, R, 0, Math.PI / 2, -Math.PI / 2, true);
  } else {
    // Left side lit
    ctx.arc(cx, cy, R, Math.PI / 2, -Math.PI / 2, false);
    ctx.ellipse(cx, cy, ellipseX, R, 0, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.closePath();

  const moonGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  moonGrad.addColorStop(0, '#f5f5e0');
  moonGrad.addColorStop(0.5, '#d4cfa0');
  moonGrad.addColorStop(1, '#b0a870');
  ctx.fillStyle = moonGrad;
  ctx.fill();

  ctx.restore();

  // Crater details (subtle circles)
  drawCraters(ctx, cx, cy, R, phase);

  // Border
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,200,180,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawCraters(ctx, cx, cy, R, phase) {
  const craters = [
    { rx: 0.2, ry: -0.1, r: 0.08 },
    { rx: -0.3, ry: 0.2, r: 0.06 },
    { rx: 0.1, ry: 0.35, r: 0.05 },
    { rx: -0.15, ry: -0.3, r: 0.07 },
    { rx: 0.35, ry: 0.1, r: 0.04 },
  ];
  ctx.save();
  ctx.globalAlpha = 0.15;
  craters.forEach((c) => {
    ctx.beginPath();
    ctx.arc(cx + c.rx * R, cy + c.ry * R, c.r * R, 0, Math.PI * 2);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * Render mini moon phase icon for calendar
 */
export function drawMiniMoon(canvas, phase) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const R = W / 2 - 1;
  const cx = W / 2, cy = W / 2;

  ctx.clearRect(0, 0, W, W);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();

  const waxing = phase < 0.5;
  const phaseAngle = phase < 0.5 ? phase * 2 : (phase - 0.5) * 2;
  const ellipseX = R * Math.abs(1 - phaseAngle * 2);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  ctx.beginPath();
  if (waxing) {
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(cx, cy, ellipseX, R, 0, Math.PI / 2, -Math.PI / 2, true);
  } else {
    ctx.arc(cx, cy, R, Math.PI / 2, -Math.PI / 2, false);
    ctx.ellipse(cx, cy, ellipseX, R, 0, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.closePath();
  ctx.fillStyle = '#d4cfa0';
  ctx.fill();
  ctx.restore();
}

/**
 * Update the moon screen UI
 */
export function updateMoonScreen(lat, lon) {
  const now = new Date();
  const { phase, illumination } = getMoonPhase(now);

  const moonCanvas = document.getElementById('moon-canvas');
  drawMoon(moonCanvas, phase, illumination);

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
