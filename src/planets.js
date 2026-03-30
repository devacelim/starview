/**
 * planets.js — Planet tracking screen
 */

import { getPlanetPositions } from './astronomy.js';

export function updatePlanetsScreen(lat, lon) {
  const planets = getPlanetPositions(new Date(), lat, lon);

  // Sort: visible first, then by altitude descending
  planets.sort((a, b) => {
    if (a.visible !== b.visible) return a.visible ? -1 : 1;
    return b.altitude - a.altitude;
  });

  const list = document.getElementById('planet-list');
  list.innerHTML = '';

  planets.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'planet-card' + (p.visible ? ' visible' : '');

    const altStr = p.altitude >= 0
      ? `고도 ${p.altitude.toFixed(1)}°`
      : `지평선 아래 ${Math.abs(p.altitude).toFixed(1)}°`;
    const azStr = `방위 ${p.azimuth.toFixed(1)}°`;
    const magStr = `등급 ${p.mag > 0 ? '+' : ''}${p.mag}`;

    card.innerHTML = `
      <div class="planet-icon">${p.icon}</div>
      <div class="planet-info">
        <div class="planet-name">${p.name} <small style="color:#7986cb;font-weight:400">${p.nameEn}</small></div>
        <div class="planet-stats">${altStr} · ${azStr} · ${magStr}</div>
      </div>
      <div class="planet-badge ${p.visible ? '' : 'hidden'}">${p.visible ? '관측 가능' : '관측 불가'}</div>
    `;

    list.appendChild(card);
  });

  return planets;
}
