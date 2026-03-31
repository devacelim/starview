/**
 * main.js — StarView app entry point
 */

const APP_VERSION = 'v2.4';

import { loadSkyData, renderSky, hitTest, getStarsData, getConstsData } from './skymap.js';
import { updateMoonScreen } from './moon.js';
import { updatePlanetsScreen } from './planets.js';
import { updateWeatherScreen } from './observation.js';
import { showPopup, hidePopup, initTabs, azToCompass, nowTimeStr } from './ui.js';
import { getPlanetPositions, getMoonPosition, getMoonPhase, raDecToAltAz, getSatellitePositions } from './astronomy.js';
import { renderEventsScreen } from './events.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  lat: null, lon: null,
  deviceAz: 0, deviceAlt: 10, deviceRoll: 0,  // 지평선이 화면 아래쪽에 오도록
  planets: [],
  moon: null,
  stars: null,
  date: new Date(),
  permGranted: false,
  arMode: 'virtual',
  fov: 60,   // horizontal field-of-view in degrees (zoom)
  toggles: { stars: true, constellations: true, moon: true, planets: true },
  searchTarget: null,  // { az, alt, name, icon } — mobile direction target
};

let currentTab = 'ar';
let hasSensor        = false; // true = 센서 있음 → 드래그 비활성
let hasAbsoluteSensor = false; // true = deviceorientationabsolute 수신 중 → deviceorientation 무시

// 모바일 여부 (터치 지원 = 물리 센서 있음)
const isMobile = navigator.maxTouchPoints > 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const permOverlay   = document.getElementById('perm-overlay');
const permBtn       = document.getElementById('perm-btn');
const video         = document.getElementById('camera-video');
const canvas        = document.getElementById('sky-canvas');
const hudDir        = document.getElementById('hud-dir');
const hudTime       = document.getElementById('hud-time');
const hudObs        = document.getElementById('hud-obs');
const popupOverlay  = document.getElementById('popup-overlay');
const popupClose    = document.getElementById('popup-close');
const modeBtn       = document.getElementById('mode-btn');
const modeIcon      = document.getElementById('mode-icon');
const tooltip       = document.getElementById('sky-tooltip');
const centerTooltip = document.getElementById('center-tooltip');

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
// iOS Safari 규칙: DeviceOrientationEvent.requestPermission()은 반드시
// 사용자 제스처 핸들러에서 첫 번째 await이어야 함.
// geolocation/camera await 이후에 호출하면 제스처 컨텍스트가 만료되어
// 권한 팝업이 아예 뜨지 않음.
permBtn.addEventListener('click', async () => {
  // ① iOS 자이로스코프 권한 — 제일 먼저, 다른 await 없이 호출
  // iOS Safari: listeners MUST be registered after requestPermission resolves
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r === 'granted') {
        startSensorListeners(); // register NOW — iOS Safari ignores pre-registered listeners
      } else {
        alert('자이로스코프 권한이 거부되었습니다. AR 방향 기능이 제한됩니다.');
      }
    } catch (e) {
      console.warn('DeviceOrientation permission:', e);
    }
  }

  // ② 위치·카메라는 이후에 요청해도 무관
  await requestAllPermissions();
});

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

  permOverlay.style.display = 'none';
  state.permGranted = true;
  init();
}

// ── Device Orientation ────────────────────────────────────────────────────────
// Chrome Android (deviceorientationabsolute): e.alpha = clockwise azimuth from North
// iOS Safari (deviceorientation): e.webkitCompassHeading = clockwise azimuth from North
//
// IMPORTANT: iOS Safari requires event listeners to be registered AFTER
// DeviceOrientationEvent.requestPermission() resolves — pre-registered listeners
// do NOT receive events. So we register lazily via startSensorListeners().

// Low-pass filters for orientation — handles sensor glitches and wrap-around jumps
const AZ_ALPHA  = 0.12; // 0=frozen, 1=raw
const ALT_ALPHA = 0.15;
// Glitch threshold: >40° in one sensor event = physically impossible (max ~300°/s human)
const AZ_GLITCH  = 40; // degrees
const ALT_GLITCH = 35; // degrees

function smoothAz(rawAz) {
  const dAz = ((rawAz - state.deviceAz + 540) % 360) - 180;
  if (Math.abs(dAz) > AZ_GLITCH) return state.deviceAz; // discard glitch
  return (state.deviceAz + dAz * AZ_ALPHA + 360) % 360;
}

function smoothAlt(rawAlt) {
  const dAlt = rawAlt - state.deviceAlt;
  if (Math.abs(dAlt) > ALT_GLITCH) return state.deviceAlt; // discard glitch
  return state.deviceAlt + dAlt * ALT_ALPHA;
}

let _sensorListenersStarted = false;
function startSensorListeners() {
  if (_sensorListenersStarted) return;
  _sensorListenersStarted = true;

  // Chrome Android: absolute compass
  window.addEventListener('deviceorientationabsolute', (e) => {
    hasAbsoluteSensor = true;
    hasSensor = true;
    state.deviceAz   = smoothAz(e.alpha ?? 0);
    state.deviceAlt  = smoothAlt((e.beta ?? 90) - 90);
    state.deviceRoll = e.gamma ?? 0;
  }, true);

  // iOS Safari / others
  window.addEventListener('deviceorientation', (e) => {
    if (hasAbsoluteSensor) return; // absolute sensor is more accurate

    const wk        = e.webkitCompassHeading;
    const hasCompass = typeof wk === 'number' && isFinite(wk);
    const hasAbsAlpha = e.absolute === true && typeof e.alpha === 'number' && isFinite(e.alpha);

    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    if (!hasCompass && !hasAbsAlpha && e.alpha === 0 && e.beta === 0 && e.gamma === 0) return;
    if (e.beta == null) return;

    const az = hasCompass  ? wk
             : hasAbsAlpha ? e.alpha
             :               (e.alpha ?? 0);

    hasSensor = true;
    state.deviceAz   = smoothAz(az);
    state.deviceAlt  = smoothAlt(e.beta - 90);
    state.deviceRoll = e.gamma ?? 0;
  }, true);
}

// Android / desktop: no permission needed — start listeners immediately
if (typeof DeviceOrientationEvent === 'undefined' ||
    typeof DeviceOrientationEvent.requestPermission !== 'function') {
  startSensorListeners();
}

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
    const sens = state.fov / canvas.width;   // deg/px — scales with zoom
    state.deviceAz  = (state.deviceAz  - dx * sens + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, state.deviceAlt + dy * sens));
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
  const step = state.fov / 20;   // proportional to zoom — finer control when zoomed in
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
    const sens = state.fov / canvas.width;   // deg/px — scales with zoom
    state.deviceAz  = (state.deviceAz  - dx * sens + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, state.deviceAlt + dy * sens));
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
    (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      if (isFinite(lat) && isFinite(lon)) { state.lat = lat; state.lon = lon; }
    },
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

  // 위성 동적 위치 계산 — starsData의 satellite 항목을 실시간 RA/Dec로 교체
  const satPositions = getSatellitePositions(now);
  const satMap = Object.fromEntries(satPositions.map(s => [s.id, s]));
  state.stars = getStarsData().map(star =>
    star.type === 'satellite' && satMap[star.id]
      ? { ...star, ...satMap[star.id], altitude: undefined, azimuth: undefined }
      : star
  );
}

// ── Render loop ───────────────────────────────────────────────────────────────
const _targetHud     = document.getElementById('target-hud');
const _targetHudInfo = document.getElementById('target-hud-info');
const _targetHudClose = document.getElementById('target-hud-close');
if (_targetHudClose) {
  _targetHudClose.addEventListener('click', () => { state.searchTarget = null; });
}

function renderLoop() {
  state.date = new Date();

  if (currentTab === 'ar') {
    renderSky(canvas, state);

    // ── Center crosshair star tooltip ─────────────────────────────────────
    if (centerTooltip) {
      const centerHit = hitTest(canvas, canvas.width / 2, canvas.height / 2, state);
      if (centerHit && centerHit.type === 'star') {
        const s = centerHit.data;
        centerTooltip.textContent = s.nameKo || s.name;
        centerTooltip.style.display = 'block';
      } else {
        centerTooltip.style.display = 'none';
      }
    }

    hudDir.textContent  = `${azToCompass(state.deviceAz)} ${Math.round(state.deviceAz)}°`;
    hudTime.textContent = `${nowTimeStr()} ${APP_VERSION}`;
    if (state.lat != null && isFinite(state.lat) && isFinite(state.lon)) {
      const latStr = `${Math.abs(state.lat).toFixed(2)}°${state.lat >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(state.lon).toFixed(2)}°${state.lon >= 0 ? 'E' : 'W'}`;
      const altSign = state.deviceAlt >= 0 ? '↑' : '↓';
      hudObs.textContent = `${latStr} ${lonStr} ${altSign}${Math.abs(Math.round(state.deviceAlt))}°`;
    } else {
      const altSign = state.deviceAlt >= 0 ? '↑' : '↓';
      hudObs.textContent = `${altSign}${Math.abs(Math.round(state.deviceAlt))}°`;
    }

    // ── Search target direction HUD ────────────────────────────────────────
    if (_targetHud) {
      if (state.searchTarget) {
        _targetHud.style.display = 'flex';
        const t = state.searchTarget;
        const dAz  = ((t.az - state.deviceAz + 540) % 360) - 180;
        const dAlt = t.alt - state.deviceAlt;
        const dist = Math.sqrt(dAz * dAz + dAlt * dAlt);
        if (dist < 12) {
          _targetHudInfo.textContent = `${t.icon || '✦'} ${t.name}  발견! ✓`;
          _targetHud.classList.add('found');
        } else {
          _targetHud.classList.remove('found');
          const azDir  = dAz  > 0 ? '→' : '←';
          const altDir = dAlt > 0 ? '↑' : '↓';
          _targetHudInfo.textContent = `${t.icon || '✦'} ${t.name}  ${azDir} ${Math.abs(Math.round(dAz))}°  ${altDir} ${Math.abs(Math.round(dAlt))}°`;
        }
      } else {
        _targetHud.style.display = 'none';
        _targetHud.classList.remove('found');
      }
    }
  } else {
    // Hide target HUD when not on AR tab
    if (_targetHud) _targetHud.style.display = 'none';
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
  initSearch();
  await updateSkyObjects();
  setInterval(updateSkyObjects, 30000);
  renderLoop();
}

// ── Search ────────────────────────────────────────────────────────────────────
function initSearch() {
  const searchBtn     = document.getElementById('search-btn');
  const searchOverlay = document.getElementById('search-overlay');
  const searchInput   = document.getElementById('search-input');
  const searchClose   = document.getElementById('search-close');
  const searchResults = document.getElementById('search-results');

  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('open');
    searchInput.value = '';
    searchResults.innerHTML = '';
    setTimeout(() => searchInput.focus(), 50);
  });

  function closeSearch() {
    searchOverlay.classList.remove('open');
    searchInput.blur();
  }

  searchClose.addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    renderSearchResults(q, searchResults, closeSearch);
  });
}

function searchObjects(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  const results = [];

  // 달
  if ('달moon'.includes(q) || q.includes('달') || q.includes('moon')) {
    results.push({ type: 'moon', name: '달', icon: '☽', sub: '위성' });
  }

  // 행성
  (state.planets || []).forEach((p) => {
    if ((p.name || '').toLowerCase().includes(q)) {
      results.push({ type: 'planet', name: p.name, icon: p.icon, sub: '행성', data: p });
    }
  });

  // 별 / 위성 검색
  const stars = state.stars || getStarsData();
  stars.forEach((s) => {
    const kn = (s.nameKo || '').toLowerCase();
    const en = (s.name   || '').toLowerCase();
    if (!kn && !en) return;
    const isSatellite = s.type === 'satellite';
    if (!isSatellite && s.mag > 4.0) return; // 위성은 밝기 필터 제외
    if (kn.includes(q) || en.includes(q)) {
      results.push({
        type: 'star', name: s.nameKo || s.name,
        icon: isSatellite ? '🌑' : '★',
        sub: isSatellite
          ? `위성 · ${s.mag >= 0 ? '+' : ''}${s.mag}등급`
          : `${s.constellation || ''} · ${s.mag >= 0 ? '+' : ''}${s.mag}등급`,
        ra: s.ra, dec: s.dec,
      });
    }
  });

  // 별자리
  getConstsData().forEach((c) => {
    const kn = (c.nameKo || '').toLowerCase();
    const en = (c.name   || '').toLowerCase();
    if (kn.includes(q) || en.includes(q)) {
      results.push({ type: 'constellation', name: c.nameKo || c.name, icon: '⊹', sub: '별자리', id: c.id });
    }
  });

  return results.slice(0, 18);
}

function getObjectAltAz(item) {
  if (!state.lat || !isFinite(state.lat) || !isFinite(state.lon)) return null;
  if (item.type === 'moon'   && state.moon)
    return { az: state.moon.azimuth, alt: state.moon.altitude };
  if (item.type === 'planet' && item.data)
    return { az: item.data.azimuth, alt: item.data.altitude };
  if (item.type === 'star') {
    const r = raDecToAltAz(item.ra, item.dec, state.date, state.lat, state.lon);
    return { az: r.azimuth, alt: r.altitude };
  }
  if (item.type === 'constellation') {
    const members = (state.stars || getStarsData())
      .filter((s) => s.constellation?.toUpperCase() === item.id.toUpperCase() && s.mag < 5);
    if (!members.length) return null;
    const ra  = members.reduce((s, m) => s + m.ra,  0) / members.length;
    const dec = members.reduce((s, m) => s + m.dec, 0) / members.length;
    const r = raDecToAltAz(ra, dec, state.date, state.lat, state.lon);
    return { az: r.azimuth, alt: r.altitude };
  }
  return null;
}

function flyTo(targetAz, targetAlt) {
  const startAz  = state.deviceAz;
  const startAlt = state.deviceAlt;
  const dAz      = ((targetAz - startAz + 540) % 360) - 180; // shortest arc
  const duration = 900;
  const t0       = performance.now();

  function step(now) {
    const t    = Math.min(1, (now - t0) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
    state.deviceAz  = ((startAz + dAz * ease) + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, startAlt + (targetAlt - startAlt) * ease));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderSearchResults(query, container, onClose) {
  container.innerHTML = '';
  if (!query) return;

  const items = searchObjects(query);
  if (!items.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(100,150,230,0.5);font-size:14px">검색 결과 없음</div>`;
    return;
  }

  items.forEach((item) => {
    const pos = getObjectAltAz(item);
    const validPos = pos && isFinite(pos.alt) && isFinite(pos.az);
    const altText = validPos
      ? (pos.alt >= 0
          ? `고도 ${pos.alt.toFixed(0)}° · 방위 ${pos.az.toFixed(0)}°`
          : `지평선 아래 ${Math.abs(pos.alt).toFixed(0)}°`)
      : '';
    const belowHorizon = validPos && pos.alt < 0;

    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.innerHTML = `
      <span class="sri-icon">${item.icon}</span>
      <span class="sri-main">
        <span class="sri-name">${item.name}</span>
        <span class="sri-sub">${item.sub || ''}</span>
      </span>
      <span class="sri-alt${belowHorizon ? ' below' : ''}">${altText}</span>
    `;
    el.addEventListener('click', () => {
      if (!validPos) { onClose(); return; }
      if (isMobile) {
        // 모바일: 자이로스코프 방향 안내 모드
        state.searchTarget = { az: pos.az, alt: pos.alt, name: item.name, icon: item.icon };
        onClose();
      } else {
        // 데스크탑: flyTo 애니메이션
        onClose();
        flyTo(pos.az, pos.alt);
      }
    });
    container.appendChild(el);
  });
}
