/**
 * main.js — StarView app entry point
 */

import { loadSkyData, renderSky, hitTest } from './skymap.js';
import { updateMoonScreen } from './moon.js';
import { updatePlanetsScreen } from './planets.js';
import { updateWeatherScreen } from './observation.js';
import { showPopup, hidePopup, initTabs, azToCompass, nowTimeStr } from './ui.js';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  lat: null,
  lon: null,
  deviceAz: 0,    // compass heading (alpha)
  deviceAlt: 0,   // tilt from horizon
  deviceRoll: 0,
  planets: [],
  date: new Date(),
  permGranted: false,
};

let currentTab = 'ar';
let animFrame = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const permOverlay = document.getElementById('perm-overlay');
const permBtn = document.getElementById('perm-btn');
const arView = document.getElementById('ar-view');
const video = document.getElementById('camera-video');
const canvas = document.getElementById('sky-canvas');
const hudDir = document.getElementById('hud-dir');
const hudTime = document.getElementById('hud-time');
const hudObs = document.getElementById('hud-obs');
const popupOverlay = document.getElementById('popup-overlay');
const popupClose = document.getElementById('popup-close');

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Permissions ───────────────────────────────────────────────────────────────
permBtn.addEventListener('click', async () => {
  await requestAllPermissions();
});

async function requestAllPermissions() {
  // 1. Geolocation
  try {
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.lat = pos.coords.latitude;
          state.lon = pos.coords.longitude;
          resolve();
        },
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  } catch (e) {
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
  } catch (e) {
    alert('카메라 권한이 필요합니다.');
    return;
  }

  // 3. Gyroscope (iOS 13+ requires explicit requestPermission inside user gesture)
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') {
        alert('자이로스코프 권한이 거부되었습니다. AR 방향 기능이 제한됩니다.');
      }
    } catch (e) {
      console.warn('DeviceOrientation permission error:', e);
    }
  }

  permOverlay.style.display = 'none';
  state.permGranted = true;
  init();
}

// ── Device Orientation ────────────────────────────────────────────────────────
window.addEventListener('deviceorientation', (e) => {
  if (!state.permGranted) return;
  // alpha: compass heading (0=North on some devices, needs correction)
  // beta: front-back tilt (-180 to 180), 0=flat, 90=upright
  // gamma: left-right tilt
  state.deviceAz = e.alpha ?? 0;
  // When phone is held upright pointing at sky: beta ≈ 90
  // Convert to altitude: 90° beta = horizon, 180° = pointing straight up
  state.deviceAlt = (e.beta ?? 90) - 90;
  state.deviceRoll = e.gamma ?? 0;
}, true);

// Continuous geolocation watch
function watchPosition() {
  navigator.geolocation.watchPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
    },
    () => {},
    { enableHighAccuracy: true }
  );
}

// ── Canvas Resize ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Render Loop ───────────────────────────────────────────────────────────────
function renderLoop() {
  state.date = new Date();

  if (currentTab === 'ar') {
    renderSky(canvas, state);

    // HUD update
    hudDir.textContent = `${azToCompass(state.deviceAz)} ${Math.round(state.deviceAz)}°`;
    hudTime.textContent = nowTimeStr();
    hudObs.textContent = `고도 ${Math.round(state.deviceAlt)}°`;
  }

  animFrame = requestAnimationFrame(renderLoop);
}

// ── Tab Switch ────────────────────────────────────────────────────────────────
const screens = {
  ar: document.getElementById('ar-view'),
  moon: document.getElementById('moon-screen'),
  planets: document.getElementById('planets-screen'),
  weather: document.getElementById('weather-screen'),
  events: document.getElementById('events-screen'),
};

function switchTab(tab) {
  currentTab = tab;
  Object.entries(screens).forEach(([id, el]) => {
    el.classList.toggle('active', id === tab);
  });

  if (tab === 'moon' && state.lat) updateMoonScreen(state.lat, state.lon);
  if (tab === 'planets' && state.lat) {
    const planets = updatePlanetsScreen(state.lat, state.lon);
    state.planets = planets;
  }
  if (tab === 'weather' && state.lat) updateWeatherScreen(state.lat, state.lon);
  if (tab === 'events') renderEvents();
}

initTabs(switchTab);

// ── Canvas Tap (AR) ───────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const hit = hitTest(canvas, x, y, state);
  if (hit && hit.type === 'star') {
    const s = hit.data;
    const mag = s.mag > 0 ? `+${s.mag}` : `${s.mag}`;
    showPopup(
      `${s.nameKo || s.name}`,
      `<b>적경:</b> ${(s.ra / 15).toFixed(2)}h &nbsp; <b>적위:</b> ${s.dec.toFixed(2)}°<br>
       <b>겉보기 등급:</b> ${mag}<br>
       <b>별자리:</b> ${s.constellation || '--'}`
    );
  }
});

popupOverlay.addEventListener('click', (e) => {
  if (e.target === popupOverlay) hidePopup();
});
popupClose.addEventListener('click', hidePopup);

// ── Events Screen ─────────────────────────────────────────────────────────────
const EVENTS = [
  { title: '페르세우스 유성우', date: '2026-08-12', desc: '연간 최대 유성우 중 하나. 시간당 최대 100개 이상.' },
  { title: '목성 충', date: '2026-09-26', desc: '목성이 지구와 가장 가까워지는 시기. 망원경 관측 최적.' },
  { title: '개기 월식', date: '2026-09-07', desc: '아시아에서 관측 가능한 개기 월식.' },
  { title: '레오니드 유성우', date: '2026-11-17', desc: '사자자리 방향에서 쏟아지는 유성우.' },
  { title: '쌍둥이자리 유성우', date: '2026-12-14', desc: '연중 가장 풍성한 유성우 중 하나.' },
  { title: '토성 충', date: '2026-08-27', desc: '토성 관측 최적 시기. 고리 선명하게 관측 가능.' },
];

function renderEvents() {
  const list = document.getElementById('event-list');
  list.innerHTML = '';
  const now = new Date();

  EVENTS.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((ev) => {
    const d = new Date(ev.date);
    const days = Math.ceil((d - now) / 86400000);
    if (days < -1) return; // skip past events

    const card = document.createElement('div');
    card.className = 'event-card';
    const dStr = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
    const countdown = days <= 0 ? '오늘!' : `D-${days}`;
    card.innerHTML = `
      <div class="event-title">${ev.title}</div>
      <div class="event-date">${dStr}</div>
      <span class="event-countdown">${countdown}</span>
      <p style="margin-top:10px;font-size:13px;color:#7986cb;line-height:1.5">${ev.desc}</p>
    `;
    list.appendChild(card);
  });
}

// ── Push Notification ─────────────────────────────────────────────────────────
async function requestNotificationPerm() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadSkyData();
  watchPosition();

  // Initial data load
  if (state.lat) {
    const planets = updatePlanetsScreen(state.lat, state.lon);
    state.planets = planets;
  }

  renderLoop();
}
