import { useRef, useEffect, useState, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState, Toggles, SearchTarget, HitResult, PopupContent, Star, MoonData, Planet } from '../types';
import SkyCanvas from './SkyCanvas';
import SearchOverlay from './SearchOverlay';
import TargetHUD from './TargetHUD';
import DebugOverlay from './DebugOverlay';
import { azToCompass, nowTimeStr } from '../lib/ui';

interface Props {
  skyStateRef: MutableRefObject<SkyState>;
  arMode: 'ar' | 'virtual';
  toggles: Toggles;
  searchTarget: SearchTarget | null;
  onARModeToggle: () => void;
  onToggleChange: (key: keyof Toggles) => void;
  onSearchTargetSet: (t: SearchTarget | null) => void;
  onPopup: (c: PopupContent | null) => void;
  version: string;
}

export default function ARView({
  skyStateRef, arMode, toggles, searchTarget,
  onARModeToggle, onToggleChange, onSearchTargetSet, onPopup, version
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hudDirRef = useRef<HTMLSpanElement>(null);
  const hudTimeRef = useRef<HTMLSpanElement>(null);
  const hudObsRef = useRef<HTMLSpanElement>(null);
  const lockBtnRef = useRef<HTMLButtonElement>(null);
  const flyingRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ name: string; detail: string; x: number; y: number } | null>(null);

  // Camera management
  useEffect(() => {
    if (arMode !== 'ar') {
      if (videoRef.current) videoRef.current.style.display = 'none';
      return;
    }
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(s => {
      stream = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
        videoRef.current.style.display = '';
      }
    }).catch(() => {});
    return () => {
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.style.display = 'none';
    };
  }, [arMode]);

  // HUD 60fps update via RAF (no useState)
  useEffect(() => {
    let rafId: number;
    const update = () => {
      const s = skyStateRef.current;
      if (lockBtnRef.current) {
        const locked = s.viewLocked;
        lockBtnRef.current.textContent = locked ? '🔒' : '🔓';
        lockBtnRef.current.style.borderColor = locked
          ? 'rgba(251,146,60,0.75)' : 'rgba(100,149,237,0.35)';
        lockBtnRef.current.style.backgroundColor = locked
          ? 'rgba(69,10,10,0.85)' : 'rgba(0,8,24,0.7)';
      }
      if (hudDirRef.current)
        hudDirRef.current.textContent = `${azToCompass(s.deviceAz)} ${Math.round(s.deviceAz)}°`;
      if (hudTimeRef.current)
        hudTimeRef.current.textContent = `${nowTimeStr()} ${version}`;
      if (hudObsRef.current) {
        if (s.lat != null && isFinite(s.lat) && isFinite(s.lon ?? NaN)) {
          const latStr = `${Math.abs(s.lat).toFixed(2)}°${s.lat >= 0 ? 'N' : 'S'}`;
          const lonStr = `${Math.abs(s.lon ?? 0).toFixed(2)}°${(s.lon ?? 0) >= 0 ? 'E' : 'W'}`;
          const altSign = s.deviceAlt >= 0 ? '↑' : '↓';
          hudObsRef.current.textContent = `${latStr} ${lonStr} ${altSign}${Math.abs(Math.round(s.deviceAlt))}°`;
        } else {
          const altSign = s.deviceAlt >= 0 ? '↑' : '↓';
          hudObsRef.current.textContent = `${altSign}${Math.abs(Math.round(s.deviceAlt))}°`;
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const handleHover = useCallback((hit: HitResult | null, x: number, y: number) => {
    if (!hit) { setTooltip(null); return; }
    let name = '', detail = '';
    if (hit.type === 'star') {
      const s = hit.data as Star;
      name   = s.nameKo || s.name;
      const mag = s.mag >= 0 ? `+${s.mag}` : `${s.mag}`;
      detail = `${mag}등급${s.constellation ? ' · ' + s.constellation : ''}`;
    } else if (hit.type === 'moon') {
      const m = hit.data as MoonData;
      name   = '달';
      detail = `조도 ${Math.round(m.illumination * 100)}% · 고도 ${m.altitude.toFixed(0)}°`;
    } else if (hit.type === 'planet') {
      const p = hit.data as Planet;
      name   = `${p.icon} ${p.name}`;
      detail = `고도 ${p.altitude.toFixed(0)}° · ${p.mag >= 0 ? '+' : ''}${p.mag}등급`;
    } else return;
    setTooltip({ name, detail, x, y });
  }, []);

  const flyAndLock = useCallback((az: number, alt: number) => {
    if (flyingRef.current) return;
    flyingRef.current = true;
    const s = skyStateRef.current;
    s.viewLocked = true;
    const startAz = s.deviceAz, startAlt = s.deviceAlt;
    const dAz = ((az - startAz + 540) % 360) - 180;
    const duration = 900;
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      skyStateRef.current.deviceAz  = ((startAz + dAz * ease) + 360) % 360;
      skyStateRef.current.deviceAlt = Math.max(-85, Math.min(85, startAlt + (alt - startAlt) * ease));
      if (t < 1) requestAnimationFrame(step);
      else flyingRef.current = false;
    }
    requestAnimationFrame(step);
  }, [skyStateRef]);

  const handleHit = useCallback((hit: HitResult, _x: number, _y: number) => {
    setTooltip(null);
    if (hit.type === 'planet_arrow') {
      const p = hit.data as Planet;
      flyAndLock(p.azimuth, p.altitude);
      onSearchTargetSet({ az: p.azimuth, alt: p.altitude, name: p.name, icon: p.icon });
      return;
    }
    if (hit.type === 'moon_arrow') {
      const m = hit.data as MoonData;
      flyAndLock(m.azimuth, m.altitude);
      onSearchTargetSet({ az: m.azimuth, alt: m.altitude, name: '달', icon: '🌕' });
      return;
    }
    let title = '', bodyHtml = '';
    if (hit.type === 'star') {
      const s = hit.data as Star;
      const mag = s.mag >= 0 ? `+${s.mag}` : `${s.mag}`;
      title = s.nameKo || s.name;
      bodyHtml = `<b>적경:</b> ${(s.ra/15).toFixed(2)}h &nbsp; <b>적위:</b> ${s.dec.toFixed(2)}°<br><b>겉보기 등급:</b> ${mag}<br><b>별자리:</b> ${s.constellation || '--'}`;
    } else if (hit.type === 'moon') {
      const m = hit.data as MoonData;
      title = '달';
      bodyHtml = `<b>위상:</b> ${Math.round(m.phase * 100)}% 진행<br><b>조도:</b> ${Math.round(m.illumination * 100)}%<br><b>고도:</b> ${m.altitude.toFixed(1)}° &nbsp; <b>방위:</b> ${m.azimuth.toFixed(1)}°`;
    } else if (hit.type === 'planet') {
      const p = hit.data as Planet;
      title = `${p.icon} ${p.name}`;
      bodyHtml = `<b>고도:</b> ${p.altitude.toFixed(1)}°<br><b>방위:</b> ${p.azimuth.toFixed(1)}°<br><b>밝기:</b> ${p.mag >= 0 ? '+' : ''}${p.mag} 등급`;
    }
    if (title) onPopup({ title, bodyHtml });
  }, [flyAndLock, onPopup, onSearchTargetSet]);

  const toggleDefs: Array<{ key: keyof Toggles; label: string; icon: string }> = [
    { key: 'stars',          label: '별',    icon: '★' },
    { key: 'constellations', label: '별자리', icon: '⊹' },
    { key: 'moon',           label: '달',    icon: '☽' },
    { key: 'planets',        label: '행성',  icon: '♃' },
  ];

  return (
    <div className="absolute inset-0">
      {/* Camera video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* Sky canvas */}
      <SkyCanvas skyStateRef={skyStateRef} onHit={handleHit} onHover={handleHover} />

      {/* HUD top bar */}
      <div
        className="absolute left-0 right-16 flex justify-between items-center px-3.5 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
      >
        <div className="bg-black/70 border border-orange-400/25 rounded-full px-3 py-1 text-xs font-medium text-orange-300/95 backdrop-blur-md shadow-md">
          <span ref={hudDirRef}>--</span>
        </div>
        <div className="bg-black/70 border border-blue-500/20 rounded-full px-3 py-1 text-xs font-medium text-blue-200/90 backdrop-blur-md shadow-md">
          <span ref={hudTimeRef}>--:--</span>
        </div>
        <div className="bg-black/70 border border-blue-500/20 rounded-full px-3 py-1 text-xs font-medium text-blue-200/90 backdrop-blur-md shadow-md">
          <span ref={hudObsRef}>--</span>
        </div>
      </div>

      {/* Right-side button column: AR toggle + lock */}
      <div
        className="absolute flex flex-col gap-2 z-[96]"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: '16px' }}
      >
        <button
          onClick={onARModeToggle}
          className="w-10 h-10 rounded-full border border-blue-400/40 bg-black/70 backdrop-blur-md flex items-center justify-center text-lg cursor-pointer"
        >
          {arMode === 'ar' ? '🔭' : '📷'}
        </button>
        <button
          ref={lockBtnRef}
          onClick={() => { skyStateRef.current.viewLocked = !skyStateRef.current.viewLocked; }}
          className="w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center text-base cursor-pointer border"
        >
          🔓
        </button>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed bg-black/88 border border-blue-500/30 rounded-xl px-3.5 py-2 pointer-events-none z-50 backdrop-blur-md shadow-xl"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 140),
            top: Math.max(tooltip.y - 60, 8),
          }}
        >
          <div className="text-sm font-semibold text-blue-100/95">{tooltip.name}</div>
          <div className="text-xs text-blue-300/80 mt-0.5">{tooltip.detail}</div>
        </div>
      )}

      {/* Search button */}
      <button
        onClick={() => setSearchOpen(true)}
        className="absolute w-10 h-10 rounded-full border border-blue-500/30 bg-black/70 backdrop-blur-md flex items-center justify-center cursor-pointer z-[91] shadow-md"
        style={{ bottom: 'calc(var(--tab-h) + var(--safe-bottom) + 14px)', left: '16px' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(150,200,255,0.85)" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>

      {/* Toggle bar */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex gap-1.5 z-[90]"
        style={{ bottom: 'calc(var(--tab-h) + var(--safe-bottom) + 14px)' }}
      >
        {toggleDefs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => onToggleChange(key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-md transition-all cursor-pointer shadow-md
              ${toggles[key]
                ? 'bg-blue-950/75 border-blue-500/45 text-blue-200/95 shadow-blue-500/15'
                : 'bg-black/70 border-blue-700/20 text-blue-900/80'}`}
          >
            <span>{icon}</span><span className="text-[11px]">{label}</span>
          </button>
        ))}
      </div>

      {/* Target HUD */}
      <TargetHUD
        target={searchTarget}
        skyStateRef={skyStateRef}
        onClose={() => onSearchTargetSet(null)}
      />

      {/* Debug overlay */}
      <DebugOverlay skyStateRef={skyStateRef} />

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          skyStateRef={skyStateRef}
          onClose={() => setSearchOpen(false)}
          onTargetSet={onSearchTargetSet}
          onPopup={onPopup}
        />
      )}
    </div>
  );
}
