/**
 * ui.js — Shared UI utilities
 */

/**
 * Show the detail popup
 */
export function showPopup(title, bodyHtml) {
  document.getElementById('popup-title').textContent = title;
  document.getElementById('popup-body').innerHTML = bodyHtml;
  document.getElementById('popup-overlay').classList.add('open');
}

export function hidePopup() {
  document.getElementById('popup-overlay').classList.remove('open');
}

/**
 * Tab navigation
 */
export function initTabs(onTabChange) {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onTabChange(btn.dataset.tab);
    });
  });
}

/**
 * Update HUD direction label from azimuth
 */
export function azToCompass(az) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(az / 45) % 8];
}

/**
 * Format current time HH:MM
 */
export function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
