/**
 * weather.js — Weather API client (via Vercel Edge Function proxy)
 */

let cachedWeather = null;
let lastFetch = 0;
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchWeather(lat, lon) {
  const now = Date.now();
  if (cachedWeather && now - lastFetch < CACHE_MS) return cachedWeather;

  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('weather fetch failed');
    cachedWeather = await res.json();
    lastFetch = now;
    return cachedWeather;
  } catch (e) {
    console.warn('Weather fetch error:', e);
    return null;
  }
}
