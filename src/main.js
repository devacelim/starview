/**
 * main.js — StarView app entry point
 */

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
  deviceAz: 0, deviceAlt: 0, deviceRoll: 0,
  planets: [],
  moon: null,
  stars: null,      // populated by API; null = use local catalog
  date: new Date(),
  permGranted: false,
  arMode: 'ar',     // 'ar' | 'virtual'
  toggles: { stars: true, constellations: true, moon: true, planets: true },
};

let currentTab = 'ar';

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
  video.style.display     = isAR ? '' : 'none';
  modeIcon.textContent    = isAR ? '🔭' : '📷';
  modeBtn.title           = isAR ? '가상 하늘 모드로 전환' : 'AR 카메라 모드로 전환';
});

// ── Permissions ───────────────────────────────────────────────────────────────
permBtn.addEventListener('click', requestAllPermissions);

async function requestAllPermissions() {
  // 1. Geolocation
  try {
    await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => { state.lat = pos.coords.latitude; state.lon = pos.coords.longitude; resolve(); },
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      )
    );
  } catch {
    alert('위치 권한이 필요합니다. 설정에서 위치 허용 후 다시 시도해주세요.');
    return;
  }

  // 2. Camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch {
    alert('카메라 권한이 필요합니다.');
    return;
  }

  // 3. Gyroscope (iOS 13+ requires gesture)
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
// iOS does not provide North-referenced alpha — use webkitCompassHeading.
// Android with deviceorientationabsolute gives North-referenced alpha,
// but counterclockwise, so convert: azimuth = (360 - alpha) % 360.

let hasAbsoluteOrientation = false;

window.addEventListener('deviceorientationabsolute', (e) => {
  hasAbsoluteOrientation = true;
  if (!state.permGranted) return;
  // alpha: CCW from North → convert to CW azimuth
  state.deviceAz   = (360 - (e.alpha ?? 0)) % 360;
  state.deviceAlt  = (e.beta  ?? 90) - 90;
  state.deviceRoll = e.gamma ?? 0;
}, true);

window.addEventListener('deviceorientation', (e) => {
  if (!state.permGranted || hasAbsoluteOrientation) return;
  // iOS: webkitCompassHeading = CW azimuth from true North
  // Fallback for other browsers: use alpha as-is
  const heading = typeof e.webkitCompassHeading === 'number'
    ? e.webkitCompassHeading
    : (e.alpha ?? 0);
  state.deviceAz   = heading;
  state.deviceAlt  = (e.beta  ?? 90) - 90;
  state.deviceRoll = e.gamma ?? 0;
}, true);

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

// ── Update celestial objects ───────────────────────────────────────────────────
// Primary: fetch from /api/celestial (Supabase-backed backend).
// Fallback: local astronomy.js calculations.

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
    localUpdateSkyObjects(now);
  }
}

function localUpdateSkyObjects(now = new Date()) {
  state.planets = getPlanetPositions(now, state.lat, state.lon);
  const { ra, dec }          = getMoonPosition(now);
  const { altitude, azimuth } = raDecToAltAz(ra, dec, now, state.lat, state.lon);
  const { phase, illumination } = getMoonPhase(now);
  state.moon = { ra, dec, altitude, azimuth, phase, illumination };
  // state.stars stays null → skymap falls back to local catalog
}

// ── Render loop ───────────────────────────────────────────────────────────────
function renderLoop() {
  state.date = new Date();

  if (currentTab === 'ar') {
    renderSky(canvas, state);
    hudDir.textContent  = `${azToCompass(state.deviceAz)} ${Math.round(state.deviceAz)}°`;
    hudTime.textContent = nowTimeStr();
    hudObs.textContent  = `고도 ${Math.round(state.deviceAlt)}°`;
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
  Object.entries(screens).forEach(([id, el]) => el.classList.toggle('active', id === tab));
  if (tab === 'moon'    && state.lat) updateMoonScreen(state.lat, state.lon);
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

// ── Canvas tap → hit test ──────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
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
