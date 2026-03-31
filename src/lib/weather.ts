/**
 * weather.ts — Weather API client (via Vercel Edge Function proxy)
 */

let _cache: { data: unknown; ts: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function fetchWeather(lat: number, lon: number): Promise<unknown> {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_MS) return _cache.data;

  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('weather fetch failed');
    const data = await res.json();
    _cache = { data, ts: now };
    return data;
  } catch (e) {
    console.warn('Weather fetch error:', e);
    return null;
  }
}
