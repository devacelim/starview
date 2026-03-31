import { useEffect, useRef } from 'react';
import type { MoonData } from '../types';
import { getMoonPhase, moonPhaseName, getMoonRiseSet } from '../lib/astronomy';
import { drawMoon, drawMiniMoon } from '../lib/moon';

interface Props {
  lat: number | null;
  lon: number | null;
  moonData: MoonData | null;
}

export default function MoonScreen({ lat, lon, moonData }: Props) {
  const moonCanvasRef = useRef<HTMLCanvasElement>(null);
  const calGridRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const { phase, illumination } = moonData ?? getMoonPhase(now);
  const phaseName = moonPhaseName(phase);
  const riseSet = (lat != null && lon != null)
    ? getMoonRiseSet(now, lat, lon)
    : { rise: '--:--', set: '--:--' };

  useEffect(() => {
    if (moonCanvasRef.current) {
      drawMoon(moonCanvasRef.current, phase);
    }
  }, [phase]);

  useEffect(() => {
    const grid = calGridRef.current;
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i - 2);
      const { phase: p } = getMoonPhase(d);
      const isToday = i === 2;

      const cell = document.createElement('div');
      cell.className = 'flex flex-col items-center gap-0.5';

      const num = document.createElement('div');
      num.className = isToday
        ? 'text-[11px] text-[#7eb8f7] font-bold'
        : 'text-[11px] text-[#7986cb]';
      num.textContent = String(d.getDate());

      const c = document.createElement('canvas');
      c.width = 28; c.height = 28;
      c.className = 'rounded-full';
      drawMiniMoon(c, p);

      cell.appendChild(num);
      cell.appendChild(c);
      grid.appendChild(cell);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar"
      style={{
        background: 'radial-gradient(ellipse at top, #0d1b2a 0%, #000 70%)',
        paddingBottom: 'calc(var(--tab-h) + var(--safe-bottom) + 8px)',
      }}
    >
      {/* Header */}
      <div
        className="text-[26px] font-bold px-5 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 20px)' }}
      >
        달의 위상
      </div>

      {/* Moon canvas */}
      <div className="flex justify-center px-5 py-5">
        <canvas ref={moonCanvasRef} width={200} height={200} className="rounded-full" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-6">
        {[
          { label: '위상', value: phaseName },
          { label: '조도', value: `${Math.round(illumination * 100)}%` },
          { label: '월출', value: riseSet.rise },
          { label: '월몰', value: riseSet.set },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-[rgba(10,10,30,0.85)] border border-[rgba(126,184,247,0.15)] rounded-[14px] p-[14px_16px]"
          >
            <div className="text-[11px] text-[#7986cb] mb-1 uppercase tracking-[0.5px]">{label}</div>
            <div className="text-[20px] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="px-4 pb-6">
        <div className="text-[16px] font-semibold mb-3">30일 위상 캘린더</div>
        <div ref={calGridRef} className="grid grid-cols-7 gap-1.5" />
      </div>
    </div>
  );
}
