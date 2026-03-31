/**
 * main.js — StarView app entry point
 */

const APP_VERSION = 'v1.2';

import { loadSkyData, renderSky, hitTest } from './skymap.js';
import { updateMoonScreen } from './moon.js';
import { updatePlanetsScreen } from './planets.js';
import { updateWeatherScreen } from './observation.js';
import { showPopup, hidePopup, initTabs, azToCompass, nowTimeStr } from './ui.js';
import { getPlanetPositions, getMoonPosition, getMoonPhase, raDecToAltAz } from './astronomy.js';
import { renderEventsScreen } from './events.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  lat: null, lon: null,
  deviceAz: 0, deviceAlt: 30, deviceRoll: 0,
  planets: [],
  moon: null,
  stars: null,
  date: new Date(),
  permGranted: false,
  arMode: 'ar',
  fov: 60,   // horizontal field-of-view in degrees (zoom)
  toggles: { stars: true, constellations: true, moon: true, planets: true },
};

let currentTab = 'ar';
let hasSensor   = false;  // becomes true when any orientation event fires

// 모바일 여부 (터치 지원 = 물리 센서 있음)
const isMobile = navigator.maxTouchPoints > 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const permOverlay  = document.getElementById('perm-overlay');
const permBtn      = document.getElementById('perm-btn');
const video        = document.getElementById('camera-video');
const canvas       = document.getElementById('sky-canvas');
const hudDir       = document.getElementById('hud-dir');
const hudTime      = document.getElementById('hud-time');
const hudObs       = document.getElementById('hud-obs');
const popupOverlay = document.getElementById('popup-overlay');
const popupClose   = document.getElementById('popup-close');
const modeBtn      = document.getElementById('mode-btn');
const modeIcon     = document.getElementById('mode-icon');
const tooltip      = document.getElementById('sky-tooltip');

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Toggle buttons ────────────────────────────────────────────────────────────
const toggleDefs = [
  { key: 'stars',          label: '별',    icon: '★' },
  { key: 'constellations', label: '별자리', icon: '⊹' },
  { key: 'moon',           label: '달',    icon: '☽' },
  { key: 'planets',        label: '행성',  icon: '♃' },
];

function buildToggles() {
  const bar = document.getElementById('ar-toggles');
  toggleDefs.forEach(({ key, label, icon }) => {
    const btn = document.createElement('button');
    btn.className = 'tog-btn active';
    btn.dataset.key = key;
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener('click', () => {
      state.toggles[key] = !state.toggles[key];
      btn.classList.toggle('active', state.toggles[key]);
    });
    bar.appendChild(btn);
  });
}

// ── AR / Virtual mode toggle ──────────────────────────────────────────────────
modeBtn.addEventListener('click', () => {
  state.arMode = state.arMode === 'ar' ? 'virtual' : 'ar';
  const isAR = state.arMode === 'ar';
  video.style.display  = isAR ? '' : 'none';
  modeIcon.textContent = isAR ? '🔭' : '📷';
  modeBtn.title        = isAR ? '가상 하늘 모드로 전환' : 'AR 카메라 모드로 전환';
});

// ── Permissions ───────────────────────────────────────────────────────────────
permBtn.addEventListener('click', requestAllPermissions);

async function requestAllPermissions() {
  try {
    await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => { state.lat = pos.coords.latitude; state.lon = pos.coords.longitude; resolve(); },
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      )
    );
  } catch {
    // 위치 권한 없이도 계속 (기본: 서울)
    state.lat = 37.5665;
    state.lon = 126.9780;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch {
    // 카메라 없이도 가상 하늘 모드로 계속
    video.style.display = 'none';
    state.arMode = 'virtual';
    modeIcon.textContent = '📷';
    modeBtn.title = 'AR 카메라 모드로 전환';
  }

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') alert('자이로스코프 권한이 거부되었습니다. AR 방향 기능이 제한됩니다.');
    } catch (e) { console.warn('DeviceOrientation:', e); }
  }

  permOverlay.style.display = 'none';
  state.permGranted = true;
  init();
}

// ── Device Orientation ────────────────────────────────────────────────────────
// Chrome Android (deviceorientationabsolute): e.alpha = clockwise azimuth from North
// iOS (deviceorientation): e.webkitCompassHeading = clockwise azimuth from North
// Both are already in standard compass bearing — NO inversion needed.

// deviceorientationabsolute: Chrome Android — only fires on real hardware, no isMobile guard needed
window.addEventListener('deviceorientationabsolute', (e) => {
  if (!state.permGranted) return;
  hasSensor = true;
  state.deviceAz   = e.alpha  ?? 0;
  state.deviceAlt  = (e.beta  ?? 90) - 90;
  state.deviceRoll = e.gamma  ?? 0;
}, true);

// deviceorientation: iOS (webkitCompassHeading) or fallback
window.addEventListener('deviceorientation', (e) => {
  if (!state.permGranted || hasSensor) return;

  const hasCompass = typeof e.webkitCompassHeading === 'number';
  const az = hasCompass ? e.webkitCompassHeading : (e.alpha ?? 0);
  // Skip spurious desktop events (no compass, no tilt data, all zeros)
  if (!hasCompass && e.beta == null) return;
  if (!hasCompass && az === 0 && (e.beta === 0 || e.beta == null)) return;

  hasSensor = true;
  state.deviceAz   = az;
  state.deviceAlt  = (e.beta  ?? 90) - 90;
  state.deviceRoll = e.gamma  ?? 0;
}, true);

// ── Desktop mouse drag (when no physical sensor) ──────────────────────────────
let isDragging = false, dragLastX = 0, dragLastY = 0;

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dragLastX  = e.clientX;
  dragLastY  = e.clientY;
});
document.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mousemove', (e) => {
  // Drag to look around (desktop only — overridden by sensor on mobile)
  if (isDragging && !hasSensor) {
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    state.deviceAz  = (state.deviceAz  - dx * 0.3 + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, state.deviceAlt + dy * 0.3));
  }
  dragLastX = e.clientX;
  dragLastY = e.clientY;

  // Hover tooltip
  if (currentTab !== 'ar') return;
  const rect = canvas.getBoundingClientRect();
  const hit  = hitTest(canvas, e.clientX - rect.left, e.clientY - rect.top, state);
  if (hit) {
    showTooltip(hit, e.clientX, e.clientY);
  } else {
    hideTooltip();
  }
});
canvas.addEventListener('mouseleave', hideTooltip);

// Scroll = zoom (change FOV)
canvas.addEventListener('wheel', (e) => {
  if (currentTab !== 'ar') return;
  e.preventDefault();
  state.fov = Math.max(15, Math.min(120, state.fov + e.deltaY * 0.05));
}, { passive: false });

// Arrow keys (pan) / +/- (zoom)
window.addEventListener('keydown', (e) => {
  if (currentTab !== 'ar' || hasSensor) return;
  const step = 3;
  if (e.key === 'ArrowLeft')  state.deviceAz  = (state.deviceAz  - step + 360) % 360;
  if (e.key === 'ArrowRight') state.deviceAz  = (state.deviceAz  + step) % 360;
  if (e.key === 'ArrowUp')    state.deviceAlt = Math.min(85, state.deviceAlt + step);
  if (e.key === 'ArrowDown')  state.deviceAlt = Math.max(-85, state.deviceAlt - step);
  if (e.key === '+' || e.key === '=') state.fov = Math.max(15, state.fov - 5);
  if (e.key === '-')                  state.fov = Math.min(120, state.fov + 5);
});

// ── Touch: swipe(pan) + pinch(zoom) ──────────────────────────────────────────
let touchLastX = 0, touchLastY = 0, lastPinchDist = null;

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchLastX = e.touches[0].clientX;
    touchLastY = e.touches[0].clientY;
    lastPinchDist = null;
  } else if (e.touches.length === 2) {
    lastPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && !hasSensor) {
    // 단일 터치 스와이프 — 센서 없을 때 패닝
    const dx = e.touches[0].clientX - touchLastX;
    const dy = e.touches[0].clientY - touchLastY;
    state.deviceAz  = (state.deviceAz  - dx * 0.3 + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, state.deviceAlt + dy * 0.3));
    touchLastX = e.touches[0].clientX;
    touchLastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    e.preventDefault(); // 브라우저 핀치 줌 차단
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastPinchDist !== null) {
      state.fov = Math.max(15, Math.min(120, state.fov * (lastPinchDist / dist)));
    }
    lastPinchDist = dist;
  }
}, { passive: false }); // passive:false 로 pinch preventDefault 허용

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) lastPinchDist = null;
  if (e.touches.length === 1) {
    touchLastX = e.touches[0].clientX;
    touchLastY = e.touches[0].clientY;
  }
}, { passive: true });

// ── Tooltip ───────────────────────────────────────────────────────────────────
function showTooltip(hit, x, y) {
  let name, detail;
  if (hit.type === 'star') {
    const s = hit.data;
    name   = s.nameKo || s.name;
    const mag = s.mag >= 0 ? `+${s.mag}` : `${s.mag}`;
    detail = `${mag}등급${s.constellation ? ' · ' + s.constellation : ''}`;
  } else if (hit.type === 'moon') {
    const m = hit.data;
    name   = '달';
    detail = `조도 ${Math.round(m.illumination * 100)}% · 고도 ${m.altitude.toFixed(0)}°`;
  } else if (hit.type === 'planet') {
    const p = hit.data;
    name   = `${p.icon} ${p.name}`;
    detail = `고도 ${p.altitude.toFixed(0)}° · ${p.mag >= 0 ? '+' : ''}${p.mag}등급`;
  } else return;

  tooltip.innerHTML = `<div class="tt-name">${name}</div><div class="tt-detail">${detail}</div>`;
  tooltip.style.display = 'block';

  const pad = 14;
  const tw  = tooltip.offsetWidth;
  const th  = tooltip.offsetHeight;
  tooltip.style.left = `${Math.min(x + pad, window.innerWidth  - tw  - 8)}px`;
  tooltip.style.top  = `${Math.max(y - th - pad, 8)}px`;
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = 'none';
}

// ── Geolocation watch ─────────────────────────────────────────────────────────
function watchPosition() {
  navigator.geolocation.watchPosition(
    (pos) => { state.lat = pos.coords.latitude; state.lon = pos.coords.longitude; },
    () => {},
    { enableHighAccuracy: true }
  );
}

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Update celestial objects (API → fallback local) ───────────────────────────
async function updateSkyObjects() {
  if (!state.lat) return;
  const now = new Date();
  try {
    const res = await fetch(
      `/api/celestial?lat=${state.lat}&lon=${state.lon}&ts=${now.getTime()}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.stars   = data.stars;
    state.planets = data.planets;
    state.moon    = data.moon;
  } catch (err) {
    console.warn('[StarView] API fallback:', err.message);
    _localUpdate(now);
  }
}

function _localUpdate(now = new Date()) {
  state.planets = getPlanetPositions(now, state.lat, state.lon);
  const { ra, dec }           = getMoonPosition(now);
  const { altitude, azimuth } = raDecToAltAz(ra, dec, now, state.lat, state.lon);
  const { phase, illumination } = getMoonPhase(now);
  state.moon = { ra, dec, altitude, azimuth, phase, illumination };
}

// ── Render loop ───────────────────────────────────────────────────────────────
function renderLoop() {
  state.date = new Date();

  if (currentTab === 'ar') {
    renderSky(canvas, state);
    hudDir.textContent  = `${azToCompass(state.deviceAz)} ${Math.round(state.deviceAz)}°`;
    hudTime.textContent = `${nowTimeStr()} ${APP_VERSION}`;
    if (state.lat != null) {
      hudObs.textContent = `${state.lat.toFixed(2)}°N ${state.lon.toFixed(2)}°E ↑${Math.round(state.deviceAlt)}°`;
    } else {
      hudObs.textContent = `↑${Math.round(state.deviceAlt)}°`;
    }
  }

  requestAnimationFrame(renderLoop);
}

// ── Tab switch ────────────────────────────────────────────────────────────────
const screens = {
  ar:      document.getElementById('ar-view'),
  moon:    document.getElementById('moon-screen'),
  planets: document.getElementById('planets-screen'),
  weather: document.getElementById('weather-screen'),
  events:  document.getElementById('events-screen'),
};

function switchTab(tab) {
  currentTab = tab;
  hideTooltip();
  Object.entries(screens).forEach(([id, el]) => el.classList.toggle('active', id === tab));
  if (tab === 'moon'    && state.lat) updateMoonScreen(state.lat, state.lon, state.moon);
  if (tab === 'planets' && state.lat) updatePlanetsScreen(state.lat, state.lon);
  if (tab === 'weather' && state.lat) updateWeatherScreen(state.lat, state.lon);
  if (tab === 'events') renderEventsScreen(Number(document.getElementById('event-range-select')?.value ?? 180));
}
initTabs(switchTab);

document.getElementById('event-filter-select')?.addEventListener('change', () => {
  renderEventsScreen(Number(document.getElementById('event-range-select')?.value ?? 180));
});
document.getElementById('event-range-select')?.addEventListener('change', () => {
  renderEventsScreen(Number(document.getElementById('event-range-select')?.value ?? 180));
});

// ── Canvas tap → popup ────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  hideTooltip();
  const rect = canvas.getBoundingClientRect();
  const hit  = hitTest(canvas, e.clientX - rect.left, e.clientY - rect.top, state);
  if (!hit) return;

  if (hit.type === 'star') {
    const s   = hit.data;
    const mag = s.mag >= 0 ? `+${s.mag}` : `${s.mag}`;
    showPopup(s.nameKo || s.name,
      `<b>적경:</b> ${(s.ra / 15).toFixed(2)}h &nbsp; <b>적위:</b> ${s.dec.toFixed(2)}°<br>
       <b>겉보기 등급:</b> ${mag}<br><b>별자리:</b> ${s.constellation || '--'}`
    );
  } else if (hit.type === 'moon') {
    const m = hit.data;
    showPopup('달',
      `<b>위상:</b> ${Math.round(m.phase * 100)}% 진행<br>
       <b>조도:</b> ${Math.round(m.illumination * 100)}%<br>
       <b>고도:</b> ${m.altitude.toFixed(1)}° &nbsp; <b>방위:</b> ${m.azimuth.toFixed(1)}°`
    );
  } else if (hit.type === 'planet') {
    const p = hit.data;
    showPopup(`${p.icon} ${p.name}`,
      `<b>고도:</b> ${p.altitude.toFixed(1)}°<br>
       <b>방위:</b> ${p.azimuth.toFixed(1)}°<br>
       <b>밝기:</b> ${p.mag >= 0 ? '+' : ''}${p.mag} 등급`
    );
  }
});

popupOverlay.addEventListener('click', (e) => { if (e.target === popupOverlay) hidePopup(); });
popupClose.addEventListener('click', hidePopup);

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadSkyData();
  watchPosition();
  buildToggles();
  await updateSkyObjects();
  setInterval(updateSkyObjects, 30000);
  renderLoop();
}
