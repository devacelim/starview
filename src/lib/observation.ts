/**
 * observation.ts — Observation index calculator (pure functions only)
 */

export function calcObsIndex({ clouds, visibility, humidity, bortle }: {
  clouds: number;
  visibility: number;
  humidity: number;
  bortle: number;
}): number {
  const cloudScore = Math.max(0, 100 - clouds);
  const visScore = Math.min(100, (visibility / 10000) * 100);
  const humScore = Math.max(0, 100 - Math.max(0, humidity - 40) * 1.5);
  const bortleScore = Math.max(0, 100 - (bortle - 1) * 11);

  return Math.round(cloudScore * 0.4 + visScore * 0.3 + humScore * 0.15 + bortleScore * 0.15);
}

export function obsGrade(score: number): string {
  if (score >= 80) return '최적 관측';
  if (score >= 60) return '양호';
  if (score >= 40) return '보통';
  if (score >= 20) return '나쁨';
  return '관측 불가';
}

export function bestObsTime(hourlyForecast: Array<{ dt: number; clouds: { all: number } }> | undefined): string {
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
