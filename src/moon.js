/**
 * moon.js — Moon phase rendering and calendar
 */

import { getMoonPhase, moonPhaseName, getMoonRiseSet } from './astronomy.js';

/**
 * Draw moon phase on a canvas element.
 * Algorithm: draw dark base circle, then draw lit region (yellow) on top.
 *   - phase 0   = new moon  (all dark)
 *   - phase 0.5 = full moon (all lit/yellow)
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

  // 1. Draw dark base circle (unlit side)
  const darkGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  darkGrad.addColorStop(0, '#1a1c2a');
  darkGrad.addColorStop(1, '#0a0b14');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = darkGrad;
  ctx.fill();
  ctx.restore();

  // 2. Draw lit region (yellow) on top
  const litGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  litGrad.addColorStop(0, '#f8f4d0');
  litGrad.addColorStop(0.5, '#d4cfa0');
  litGrad.addColorStop(1, '#b0a870');
  _drawLitRegion(ctx, cx, cy, R, phase, litGrad);

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
 * Draw the lit (yellow) region on top of a dark base.
 * For waxing (phase 0→0.5): right side lit
 * For waning (phase 0.5→1): left side lit
 *
 * Path = same structure as _drawShadow but with the semicircle arc direction flipped,
 * so the path traces the LIT region instead of the dark shadow region.
 * Terminator ellipse x-radius a = R * |1 - 2*illum|
 */
function _drawLitRegion(ctx, cx, cy, R, phase, litColor) {
  if (phase === 0 || phase === 1) return; // new moon — no lit region

  const isWaxing = phase < 0.5;
  const illum = isWaxing ? phase * 2 : (1 - phase) * 2; // 0=new, 1=full

  if (illum < 0.01) return; // essentially new moon

  // Near-full moon: fill entire circle
  if (illum > 0.99) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = litColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  const isGibbous = illum > 0.5;
  const a = R * Math.abs(1 - 2 * illum); // terminator ellipse x-radius

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  ctx.beginPath();
  if (isWaxing) {
    // Lit side = RIGHT → right outer arc + inner terminator
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false); // right semi: top→right→bottom
    if (!isGibbous) {
      // Crescent: thin right sliver — close via RIGHT half of terminator (bottom→right→top)
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, true);
    } else {
      // Gibbous: large right region — close via LEFT half of terminator (bottom→left→top)
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, false);
    }
  } else {
    // Lit side = LEFT → left outer arc + inner terminator
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true); // left semi: top→left→bottom
    if (!isGibbous) {
      // Crescent: thin left sliver — close via LEFT half of terminator (bottom→left→top)
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, false);
    } else {
      // Gibbous: large left region — close via RIGHT half of terminator (bottom→right→top)
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, true);
    }
  }
  ctx.closePath();
  ctx.fillStyle = litColor;
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

  // Dark base
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0f1a';
  ctx.fill();
  ctx.restore();

  _drawLitRegion(ctx, cx, cy, R, phase, '#d4cfa0');
}

/**
 * Update the moon screen UI
 */
export function updateMoonScreen(lat, lon, moonData) {
  const now = new Date();
  // API에서 가져온 데이터 우선, 없으면 로컬 계산
  const { phase, illumination } = moonData ?? getMoonPhase(now);

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
