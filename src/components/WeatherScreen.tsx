import { useState, useEffect } from 'react';
import { fetchWeather } from '../lib/weather';
import { calcObsIndex, obsGrade, bestObsTime } from '../lib/observation';
import type { WeatherData } from '../types';

interface Props {
  lat: number | null;
  lon: number | null;
}

function estimateLightPollution() {
  return { bortle: 5, label: 'Bortle 5 (교외)' };
}

export default function WeatherScreen({ lat, lon }: Props) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [grade, setGrade] = useState('--');
  const [clouds, setClouds] = useState('--');
  const [visibility, setVisibility] = useState('--');
  const [humidity, setHumidity] = useState('--');
  const [bestTime, setBestTime] = useState('--');
  const [bortleLabel, setBortleLabel] = useState('--');
  const [scoreColor, setScoreColor] = useState('#f7c97e');

  useEffect(() => {
    if (lat == null || lon == null) return;
    setLoading(true);

    fetchWeather(lat, lon).then((data) => {
      const { bortle, label } = estimateLightPollution();
      setBortleLabel(label);

      if (!data) {
        setScore(null);
        setGrade('날씨 데이터 없음');
        setLoading(false);
        return;
      }

      const wd = data as WeatherData;
      const c = wd.clouds?.all ?? 50;
      const v = wd.visibility ?? 5000;
      const h = wd.main?.humidity ?? 60;

      const s = calcObsIndex({ clouds: c, visibility: v, humidity: h, bortle });
      setScore(s);
      setGrade(obsGrade(s));
      setClouds(`${c}%`);
      setVisibility(`${(v / 1000).toFixed(1)} km`);
      setHumidity(`${h}%`);
      setBestTime(bestObsTime(wd.hourly));
      setScoreColor(s >= 60 ? '#7eb8f7' : s >= 40 ? '#f7c97e' : '#f77e7e');
      setLoading(false);
    });
  }, [lat, lon]);

  const rows = [
    { label: '구름양', value: clouds },
    { label: '시야',   value: visibility },
    { label: '습도',   value: humidity },
    { label: '광해 등급', value: bortleLabel },
    { label: '최적 관측 시각', value: bestTime },
  ];

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar"
      style={{
        background: 'radial-gradient(ellipse at top, #0a1a0d 0%, #000 70%)',
        paddingBottom: 'calc(var(--tab-h) + var(--safe-bottom) + 8px)',
      }}
    >
      {/* Header */}
      <div
        className="text-[26px] font-bold px-5 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 20px)' }}
      >
        관측 조건
      </div>

      {/* Score gauge */}
      <div className="flex flex-col items-center gap-2 py-6">
        <div className="text-sm text-[#7986cb]">오늘 밤 관측 지수</div>
        <div className="text-[64px] font-bold" style={{ color: scoreColor }}>
          {loading ? '...' : (score ?? '--')}
        </div>
        <div className="text-sm">{loading ? '불러오는 중' : grade}</div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-2.5 px-4">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="bg-[rgba(10,10,30,0.85)] border border-[rgba(126,184,247,0.12)] rounded-[14px] p-[14px_16px] flex justify-between items-center"
          >
            <span className="text-sm text-[#7986cb]">{label}</span>
            <span className="text-[16px] font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
