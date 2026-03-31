import { useState, useEffect, useRef } from 'react';
import { getPlanetPositions, getPlanetRiseSet } from '../lib/astronomy';
import { drawPlanetDisc } from '../lib/skymap';
import type { Planet } from '../types';

interface Props {
  lat: number | null;
  lon: number | null;
}

type TimeMode = 'now' | 'night';

function nightDate(base: Date): Date {
  const d = new Date(base);
  d.setHours(21, 0, 0, 0);
  return d;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function renderSkyDiagram(canvas: HTMLCanvasElement, planets: Planet[]) {
  canvas.width  = canvas.parentElement?.clientWidth || 360;
  canvas.height = 110;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000c20');
  bg.addColorStop(1, '#020905');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  [0, 30, 60, 90].forEach((alt) => {
    const y = H * 0.78 - (alt / 90) * H * 0.72;
    ctx.save();
    ctx.strokeStyle = alt === 0 ? 'rgba(90,150,255,0.55)' : 'rgba(80,130,220,0.18)';
    ctx.lineWidth   = alt === 0 ? 1.2 : 0.7;
    ctx.setLineDash(alt === 0 ? [] : [4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
    ctx.restore();
    if (alt > 0) {
      ctx.fillStyle = 'rgba(100,160,255,0.35)';
      ctx.font = '8px -apple-system, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${alt}°`, 3, y - 2);
    }
  });

  [{ lbl: 'N', az: 0 }, { lbl: 'E', az: 90 }, { lbl: 'S', az: 180 }, { lbl: 'W', az: 270 }].forEach(({ lbl, az }) => {
    const x = (az / 360) * W;
    const y = H * 0.78;
    ctx.fillStyle = lbl === 'N' ? 'rgba(255,165,70,0.7)' : 'rgba(120,180,255,0.5)';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, x, y + 11);
  });

  planets.forEach((p) => {
    const x = (p.azimuth / 360) * W;
    const y = H * 0.78 - (Math.max(-15, p.altitude) / 90) * H * 0.72;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, p.altitude > 0 ? 'rgba(200,180,100,0.3)' : 'rgba(100,120,200,0.15)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    drawPlanetDisc(ctx, x, y, 5, p.nameEn);

    ctx.save();
    ctx.font = '8px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,20,0.8)';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.strokeText(p.name, x, y - 8);
    ctx.fillStyle = p.altitude > 0 ? 'rgba(240,210,130,0.9)' : 'rgba(140,160,200,0.6)';
    ctx.fillText(p.name, x, y - 8);
    ctx.restore();
  });
}

function PlanetDiscCanvas({ nameEn }: { nameEn: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawPlanetDisc(ctx, c.width / 2, c.height / 2, c.width * 0.38, nameEn);
  }, [nameEn]);
  return <canvas ref={ref} width={52} height={52} className="flex-shrink-0 rounded-full" />;
}

export default function PlanetsScreen({ lat, lon }: Props) {
  const [timeMode, setTimeMode] = useState<TimeMode>('now');
  const [currentDate, setCurrentDate] = useState(new Date());
  const skyCanvasRef = useRef<HTMLCanvasElement>(null);

  const viewDate = timeMode === 'night' ? nightDate(currentDate) : currentDate;
  const planets: Planet[] = (lat != null && lon != null)
    ? getPlanetPositions(viewDate, lat, lon)
    : [];

  const sorted = [...planets].sort((a, b) => {
    if (a.visible !== b.visible) return a.visible ? -1 : 1;
    return b.altitude - a.altitude;
  });

  useEffect(() => {
    if (skyCanvasRef.current && sorted.length > 0) {
      renderSkyDiagram(skyCanvasRef.current, sorted);
    }
  });

  const visCount = sorted.filter((p) => p.visible).length;

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (timeMode === 'now') return;
    const m = parseInt(e.target.value);
    const d = new Date(currentDate);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    setCurrentDate(d);
  };

  const sliderMins = viewDate.getHours() * 60 + viewDate.getMinutes();

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar bg-black"
      style={{ paddingBottom: 'calc(var(--tab-h) + var(--safe-bottom) + 8px)' }}
    >
      {/* Header */}
      <div
        className="text-[26px] font-bold px-5 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 20px)' }}
      >
        행성 위치
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 px-4 pb-1">
        {(['now', 'night'] as TimeMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              if (m === 'now') setCurrentDate(new Date());
              setTimeMode(m);
            }}
            className={`flex-1 py-[7px] rounded-[10px] text-[13px] font-semibold border cursor-pointer transition-colors
              ${timeMode === m
                ? 'bg-[rgba(126,184,247,0.2)] border-[rgba(126,184,247,0.5)] text-[#7eb8f7]'
                : 'bg-[rgba(126,184,247,0.08)] border-[rgba(126,184,247,0.18)] text-[#7986cb]'}`}
          >
            {m === 'now' ? '현재 시간' : '오늘 밤 (21:00)'}
          </button>
        ))}
      </div>

      {/* Date nav */}
      <div className="flex items-center justify-center gap-[18px] px-4 py-1.5">
        <button
          onClick={() => setCurrentDate(d => new Date(d.getTime() - 86400000))}
          className="bg-[rgba(126,184,247,0.12)] border border-[rgba(126,184,247,0.25)] rounded-[10px] text-[#7eb8f7] text-[18px] w-[34px] h-[34px] cursor-pointer flex items-center justify-center"
        >‹</button>
        <span className="text-[16px] font-semibold text-[#e8eaf6]">{fmtDate(currentDate)}</span>
        <button
          onClick={() => setCurrentDate(d => new Date(d.getTime() + 86400000))}
          className="bg-[rgba(126,184,247,0.12)] border border-[rgba(126,184,247,0.25)] rounded-[10px] text-[#7eb8f7] text-[18px] w-[34px] h-[34px] cursor-pointer flex items-center justify-center"
        >›</button>
      </div>

      <div className="text-center text-xs text-[#7986cb] pb-1.5">관측 가능 {visCount}개</div>

      {/* Sky diagram */}
      <canvas ref={skyCanvasRef} className="block w-full" style={{ height: '110px' }} />

      {/* Time slider */}
      <div className="flex items-center gap-2.5 px-4 py-2">
        <span className="text-xs text-[#7eb8f7] min-w-[38px]">{fmtTime(viewDate)}</span>
        <input
          type="range"
          min={0}
          max={1439}
          value={sliderMins}
          disabled={timeMode === 'now'}
          onChange={handleSlider}
          className="flex-1 h-[3px] rounded-sm bg-[rgba(126,184,247,0.25)] outline-none appearance-none cursor-pointer"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>

      {/* Planet list */}
      <div className="flex flex-col gap-2.5 px-4 pt-1">
        {sorted.map((p) => {
          const riseSet = (lat != null && lon != null)
            ? getPlanetRiseSet(p.nameEn, currentDate, lat, lon)
            : { rise: '--:--', set: '--:--' };

          const altStr = p.altitude >= 0
            ? `고도 ${p.altitude.toFixed(1)}°`
            : `지평선 아래 ${Math.abs(p.altitude).toFixed(1)}°`;
          const magStr = `${p.mag > 0 ? '+' : ''}${p.mag}등급`;

          return (
            <div
              key={p.nameEn}
              className={`bg-[rgba(10,10,30,0.85)] rounded-[16px] p-[12px_14px] flex items-center gap-3 border
                ${p.visible ? 'border-[rgba(126,184,247,0.35)]' : 'border-[rgba(126,184,247,0.12)]'}`}
            >
              <PlanetDiscCanvas nameEn={p.nameEn} />
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-semibold">
                  {p.name} <small className="text-[#7986cb] font-normal text-sm">{p.nameEn}</small>
                </div>
                <div className="text-xs text-[#7986cb] mt-0.5">{altStr} · 방위 {p.azimuth.toFixed(0)}° · {magStr}</div>
                <div className="text-[11px] text-[rgba(126,184,247,0.6)] mt-[3px]">↑ {riseSet.rise} &nbsp;↓ {riseSet.set}</div>
              </div>
              <div
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold
                  ${p.visible
                    ? 'bg-[rgba(126,184,247,0.15)] text-[#7eb8f7]'
                    : 'bg-[rgba(80,80,80,0.2)] text-[#666]'}`}
              >
                {p.visible ? '관측 가능' : '관측 불가'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
