/**
 * observation.js — Observation index calculator and weather screen updater
 */

import { fetchWeather } from './weather.js';

/**
 * Light pollution Bortle class estimate based on population density proxy.
 * In production, use a static dataset or Light Pollution Map API.
 */
function estimateLightPollution() {
  // Default: suburban (Bortle 5-6) until we have a proper dataset
  return { bortle: 5, label: 'Bortle 5 (교외)' };
}

/**
 * Calculate observation index 0-100
 */
export function calcObsIndex({ clouds, visibility, humidity, bortle }) {
  // clouds: 0-100 (%), visibility: 0-10000 (m), humidity: 0-100 (%)
  const cloudScore = Math.max(0, 100 - clouds);                          // 0-100
  const visScore = Math.min(100, (visibility / 10000) * 100);            // 0-100
  const humScore = Math.max(0, 100 - Math.max(0, humidity - 40) * 1.5); // penalty above 40%
  const bortleScore = Math.max(0, 100 - (bortle - 1) * 11);             // 0-100

  return Math.round(cloudScore * 0.4 + visScore * 0.3 + humScore * 0.15 + bortleScore * 0.15);
}

export function obsGrade(score) {
  if (score >= 80) return '최적 관측';
  if (score >= 60) return '양호';
  if (score >= 40) return '보통';
  if (score >= 20) return '나쁨';
  return '관측 불가';
}

/**
 * Best observation time — after midnight, look for lowest cloud hour
 * Returns a formatted string like "22:00 – 02:00"
 */
export function bestObsTime(hourlyForecast) {
  if (!hourlyForecast || hourlyForecast.length === 0) return '자정 이후';
  const night = hourlyForecast.filter((h) => {
    const hr = new Date(h.dt * 1000).getHours();
    return hr >= 20 || hr <= 4;
  });
  if (night.length === 0) return '--';
  const best = night.reduce((min, h) => (h.clouds.all < min.clouds.all ? h : min));
  const hr = new Date(best.dt * 1000).getHours();
  return `${String(hr).padStart(2, '0')}:00 전후`;
}

export async function updateWeatherScreen(lat, lon) {
  const scoreEl = document.getElementById('obs-score');
  const gradeEl = document.getElementById('obs-grade');

  scoreEl.textContent = '...';
  gradeEl.textContent = '불러오는 중';

  const data = await fetchWeather(lat, lon);
  const { bortle, label: bortleLabel } = estimateLightPollution();

  if (!data) {
    scoreEl.textContent = '--';
    gradeEl.textContent = '날씨 데이터 없음';
    document.getElementById('w-lightpollution').textContent = bortleLabel;
    return;
  }

  const clouds = data.clouds?.all ?? 50;
  const visibility = data.visibility ?? 5000;
  const humidity = data.main?.humidity ?? 60;

  const score = calcObsIndex({ clouds, visibility, humidity, bortle });

  scoreEl.textContent = score;
  gradeEl.textContent = obsGrade(score);
  scoreEl.style.color = score >= 60 ? '#7eb8f7' : score >= 40 ? '#f7c97e' : '#f77e7e';

  document.getElementById('w-clouds').textContent = `${clouds}%`;
  document.getElementById('w-visibility').textContent = `${(visibility / 1000).toFixed(1)} km`;
  document.getElementById('w-humidity').textContent = `${humidity}%`;
  document.getElementById('w-lightpollution').textContent = bortleLabel;
  document.getElementById('w-besttime').textContent = bestObsTime(data.hourly);
}
