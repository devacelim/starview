import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState, SearchTarget } from '../types';

interface Props {
  target: SearchTarget | null;
  skyStateRef: MutableRefObject<SkyState>;
  onClose: () => void;
}

export default function TargetHUD({ target, skyStateRef, onClose }: Props) {
  const infoRef = useRef<HTMLSpanElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const flyingRef = useRef(false);

  useEffect(() => {
    if (!target) return;
    let rafId: number;
    const update = () => {
      const t = target;
      const s = skyStateRef.current;
      const dAz  = ((t.az - s.deviceAz + 540) % 360) - 180;
      const dAlt = t.alt - s.deviceAlt;
      const dist = Math.sqrt(dAz * dAz + dAlt * dAlt);
      if (infoRef.current) {
        if (dist < 12) {
          infoRef.current.textContent = `${t.icon || '✦'} ${t.name}  발견! ✓`;
          infoRef.current.style.color = 'rgba(100,255,160,0.95)';
          if (hudRef.current) {
            hudRef.current.style.borderColor = 'rgba(80,255,140,0.6)';
            hudRef.current.style.boxShadow = '0 0 20px rgba(80,255,140,0.25), 0 2px 16px rgba(0,0,0,0.5)';
          }
        } else {
          infoRef.current.style.color = 'rgba(255,220,80,0.95)';
          if (hudRef.current) {
            hudRef.current.style.borderColor = 'rgba(255,220,80,0.4)';
            hudRef.current.style.boxShadow = '';
          }
          const azDir  = dAz  > 0 ? '→' : '←';
          const altDir = dAlt > 0 ? '↑' : '↓';
          infoRef.current.textContent = `${t.icon || '✦'} ${t.name}  ${azDir} ${Math.abs(Math.round(dAz))}°  ${altDir} ${Math.abs(Math.round(dAlt))}°`;
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [target, skyStateRef]);

  if (!target) return null;

  const flyToTarget = () => {
    if (!target || flyingRef.current) return;
    flyingRef.current = true;
    const s = skyStateRef.current;
    const startAz  = s.deviceAz;
    const startAlt = s.deviceAlt;
    const dAz = ((target.az - startAz + 540) % 360) - 180;
    const duration = 900;
    s.viewLocked = true; // lock sensor immediately; stays locked after animation
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      skyStateRef.current.deviceAz  = ((startAz + dAz * ease) + 360) % 360;
      skyStateRef.current.deviceAlt = Math.max(-85, Math.min(85, startAlt + (target!.alt - startAlt) * ease));
      if (t < 1) requestAnimationFrame(step);
      else flyingRef.current = false;
    }
    requestAnimationFrame(step);
  };

  return (
    <div
      ref={hudRef}
      onClick={flyToTarget}
      className="absolute left-1/2 -translate-x-1/2 bg-[rgba(4,8,20,0.88)] border border-yellow-400/40 rounded-full px-4 py-2 flex items-center gap-2.5 backdrop-blur-md pointer-events-auto whitespace-nowrap shadow-lg z-[95] cursor-pointer active:bg-[rgba(20,30,60,0.95)]"
      style={{ bottom: 'calc(var(--tab-h) + var(--safe-bottom) + 88px)' }}
    >
      <span ref={infoRef} className="text-sm font-medium text-yellow-300/95 tracking-tight" />
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="bg-transparent border-none text-yellow-300/60 text-base cursor-pointer leading-none p-0"
      >✕</button>
    </div>
  );
}
