/**
 * planets.js — Planet tracking screen
 */

import { getPlanetPositions, getPlanetRiseSet } from './astronomy.js';
import { drawPlanetDisc } from './skymap.js';

let currentDate = new Date();
currentDate.setHours(12, 0, 0, 0);

let _lat = null, _lon = null;

/** Format Date → "HH:MM" */
function fmtTime(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/** Format Date → "YYYY.MM.DD" */
function fmtDate(d) {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Draw the sky-arc diagram: azimuth (x) vs altitude (y) for all planets.
 */
function renderSkyDiagram(canvas, planets) {
  // Sync canvas resolution to CSS display size
  canvas.width  = canvas.parentElement?.clientWidth || 360;
  canvas.height = 110;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000c20');
  bg.addColorStop(1, '#020905');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Altitude grid lines
  [0, 30, 60, 90].forEach((alt) => {
    const y = H * 0.78 - (alt / 90) * H * 0.72;
    ctx.save();
    ctx.strokeStyle = alt === 0 ? 'rgba(90,150,255,0.55)' : 'rgba(80,130,220,0.18)';
    ctx.lineWidth   = alt === 0 ? 1.2 : 0.7;
    ctx.setLineDash(alt === 0 ? [] : [4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
    ctx.restore();
    if (alt > 0) {
      ctx.fillStyle = 'rgba(100,160,255,0.35)';
      ctx.font = '8px -apple-system, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${alt}°`, 3, y - 2);
    }
  });

  // Cardinal labels along horizon
  [{ lbl: 'N', az: 0 }, { lbl: 'E', az: 90 }, { lbl: 'S', az: 180 }, { lbl: 'W', az: 270 }].forEach(({ lbl, az }) => {
    const x = (az / 360) * W;
    const y = H * 0.78;
    ctx.fillStyle = lbl === 'N' ? 'rgba(255,165,70,0.7)' : 'rgba(120,180,255,0.5)';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, x, y + 11);
  });

  // Plot planets
  planets.forEach((p) => {
    const x = (p.azimuth / 360) * W;
    const y = H * 0.78 - (Math.max(-15, p.altitude) / 90) * H * 0.72;

    // Glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, p.altitude > 0 ? 'rgba(200,180,100,0.3)' : 'rgba(100,120,200,0.15)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Planet disc (small, 5px)
    drawPlanetDisc(ctx, x, y, 5, p.nameEn);

    // Label
    ctx.save();
    ctx.font = '8px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,20,0.8)';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.strokeText(p.name, x, y - 8);
    ctx.fillStyle = p.altitude > 0 ? 'rgba(240,210,130,0.9)' : 'rgba(140,160,200,0.6)';
    ctx.fillText(p.name, x, y - 8);
    ctx.restore();
  });
}

/**
 * Render a planet disc onto the card's <canvas> element.
 */
function renderCardDisc(canvas, nameEn) {
  const size = canvas.width;
  const ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const r = size * 0.38;
  drawPlanetDisc(ctx, size / 2, size / 2, r, nameEn);
}

/**
 * Main entry point — called when tab switches or date changes.
 */
export function updatePlanetsScreen(lat, lon) {
  _lat = lat ?? _lat;
  _lon = lon ?? _lon;
  if (_lat == null || _lon == null) return [];

  const planets = getPlanetPositions(currentDate, _lat, _lon);
  planets.sort((a, b) => {
    if (a.visible !== b.visible) return a.visible ? -1 : 1;
    return b.altitude - a.altitude;
  });

  // ── Date nav ──────────────────────────────────────────────────────────
  const dateLabel = document.getElementById('planet-date-label');
  if (dateLabel) dateLabel.textContent = fmtDate(currentDate);

  const prevBtn = document.getElementById('planet-prev-day');
  const nextBtn = document.getElementById('planet-next-day');
  if (prevBtn && !prevBtn._bound) {
    prevBtn._bound = true;
    prevBtn.addEventListener('click', () => {
      currentDate = new Date(currentDate.getTime() - 86400000);
      updatePlanetsScreen(null, null);
    });
  }
  if (nextBtn && !nextBtn._bound) {
    nextBtn._bound = true;
    nextBtn.addEventListener('click', () => {
      currentDate = new Date(currentDate.getTime() + 86400000);
      updatePlanetsScreen(null, null);
    });
  }

  // ── Time display ──────────────────────────────────────────────────────
  const timeLabel = document.getElementById('planet-time-label');
  if (timeLabel) timeLabel.textContent = fmtTime(currentDate);

  const slider = document.getElementById('planet-time-slider');
  if (slider) {
    const mins = currentDate.getHours() * 60 + currentDate.getMinutes();
    slider.value = mins;
    if (!slider._bound) {
      slider._bound = true;
      slider.addEventListener('input', () => {
        const m = parseInt(slider.value);
        currentDate.setHours(Math.floor(m / 60), m % 60, 0, 0);
        updatePlanetsScreen(null, null);
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const visCount = planets.filter((p) => p.visible).length;
  const summary  = document.getElementById('planet-summary');
  if (summary) summary.textContent = `관측 가능 ${visCount}개`;

  // ── Sky diagram ───────────────────────────────────────────────────────
  const skyCanvas = document.getElementById('planet-sky-canvas');
  if (skyCanvas) renderSkyDiagram(skyCanvas, planets);

  // ── Planet list ───────────────────────────────────────────────────────
  const list = document.getElementById('planet-list');
  list.innerHTML = '';

  planets.forEach((p) => {
    const riseSet = getPlanetRiseSet(p.nameEn, currentDate, _lat, _lon);

    const altStr = p.altitude >= 0
      ? `고도 ${p.altitude.toFixed(1)}°`
      : `지평선 아래 ${Math.abs(p.altitude).toFixed(1)}°`;
    const magStr = `${p.mag > 0 ? '+' : ''}${p.mag}등급`;

    const card = document.createElement('div');
    card.className = 'planet-card' + (p.visible ? ' visible' : '');
    card.innerHTML = `
      <canvas class="planet-disc-canvas" width="52" height="52"></canvas>
      <div class="planet-info">
        <div class="planet-name">${p.name} <small style="color:#7986cb;font-weight:400">${p.nameEn}</small></div>
        <div class="planet-stats">${altStr} · 방위 ${p.azimuth.toFixed(0)}° · ${magStr}</div>
        <div class="planet-times">↑ ${riseSet.rise} &nbsp;↓ ${riseSet.set}</div>
      </div>
      <div class="planet-badge ${p.visible ? '' : 'hidden'}">${p.visible ? '관측 가능' : '관측 불가'}</div>
    `;

    list.appendChild(card);

    // Draw canvas disc after appended (needs to be in DOM for size)
    const discCanvas = card.querySelector('.planet-disc-canvas');
    renderCardDisc(discCanvas, p.nameEn);
  });

  return planets;
}
