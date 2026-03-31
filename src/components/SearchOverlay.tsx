import { useState, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState, SearchTarget, PopupContent } from '../types';
import { raDecToAltAz } from '../lib/astronomy';
import { getStarsData, getConstsData } from '../lib/skymap';

interface SearchItem {
  type: 'moon' | 'planet' | 'star' | 'constellation';
  name: string;
  icon: string;
  sub: string;
  ra?: number;
  dec?: number;
  id?: string;
  data?: { azimuth: number; altitude: number };
}

interface Props {
  skyStateRef: MutableRefObject<SkyState>;
  onClose: () => void;
  onTargetSet: (t: SearchTarget | null) => void;
  onPopup: (c: PopupContent | null) => void;
}

const isMobile = navigator.maxTouchPoints > 0;

function searchObjects(query: string, state: SkyState): SearchItem[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const results: SearchItem[] = [];

  if ('달moon'.includes(q) || q.includes('달') || q.includes('moon')) {
    results.push({ type: 'moon', name: '달', icon: '☽', sub: '위성' });
  }

  (state.planets || []).forEach((p) => {
    if ((p.name || '').toLowerCase().includes(q)) {
      results.push({ type: 'planet', name: p.name, icon: p.icon, sub: '행성', data: p });
    }
  });

  const stars = state.stars || getStarsData();
  stars.forEach((s) => {
    const kn = (s.nameKo || '').toLowerCase();
    const en = (s.name   || '').toLowerCase();
    if (!kn && !en) return;
    const isSatellite = s.type === 'satellite';
    if (!isSatellite && s.mag > 4.0) return;
    if (kn.includes(q) || en.includes(q)) {
      results.push({
        type: 'star', name: s.nameKo || s.name,
        icon: isSatellite ? '🌑' : '★',
        sub: isSatellite
          ? `위성 · ${s.mag >= 0 ? '+' : ''}${s.mag}등급`
          : `${s.constellation || ''} · ${s.mag >= 0 ? '+' : ''}${s.mag}등급`,
        ra: s.ra, dec: s.dec,
      });
    }
  });

  getConstsData().forEach((c) => {
    const kn = (c.nameKo || '').toLowerCase();
    const en = (c.name   || '').toLowerCase();
    if (kn.includes(q) || en.includes(q)) {
      results.push({ type: 'constellation', name: c.nameKo || c.name, icon: '⊹', sub: '별자리', id: c.id });
    }
  });

  return results.slice(0, 18);
}

function getObjectAltAz(item: SearchItem, state: SkyState): { az: number; alt: number } | null {
  if (!state.lat || !isFinite(state.lat) || state.lon == null || !isFinite(state.lon)) return null;
  if (item.type === 'moon' && state.moon)
    return { az: state.moon.azimuth, alt: state.moon.altitude };
  if (item.type === 'planet' && item.data)
    return { az: item.data.azimuth, alt: item.data.altitude };
  if (item.type === 'star' && item.ra !== undefined && item.dec !== undefined) {
    const r = raDecToAltAz(item.ra, item.dec, state.date, state.lat, state.lon);
    return { az: r.azimuth, alt: r.altitude };
  }
  if (item.type === 'constellation' && item.id) {
    const members = (state.stars || getStarsData())
      .filter((s) => s.constellation?.toUpperCase() === item.id!.toUpperCase() && s.mag < 5);
    if (!members.length) return null;
    const ra  = members.reduce((s, m) => s + m.ra,  0) / members.length;
    const dec = members.reduce((s, m) => s + m.dec, 0) / members.length;
    const r = raDecToAltAz(ra, dec, state.date, state.lat, state.lon);
    return { az: r.azimuth, alt: r.altitude };
  }
  return null;
}

function flyTo(az: number, alt: number, state: SkyState) {
  const startAz  = state.deviceAz;
  const startAlt = state.deviceAlt;
  const dAz      = ((az - startAz + 540) % 360) - 180;
  const duration = 900;
  const t0       = performance.now();

  function step(now: number) {
    const t    = Math.min(1, (now - t0) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    state.deviceAz  = ((startAz + dAz * ease) + 360) % 360;
    state.deviceAlt = Math.max(-85, Math.min(85, startAlt + (alt - startAlt) * ease));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export default function SearchOverlay({ skyStateRef, onClose, onTargetSet }: Props) {
  const [query, setQuery] = useState('');

  const state = skyStateRef.current;
  const items = searchObjects(query, state);

  const handleItemClick = useCallback((item: SearchItem) => {
    const pos = getObjectAltAz(item, skyStateRef.current);
    if (!pos || !isFinite(pos.alt) || !isFinite(pos.az)) { onClose(); return; }
    if (isMobile) {
      onTargetSet({ az: pos.az, alt: pos.alt, name: item.name, icon: item.icon });
      onClose();
    } else {
      onClose();
      flyTo(pos.az, pos.alt, skyStateRef.current);
    }
  }, [skyStateRef, onClose, onTargetSet]);

  return (
    <div
      className="absolute inset-0 z-[98] flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Search panel */}
      <div
        className="bg-[rgba(4,6,18,0.97)] border-b border-blue-900/20 backdrop-blur-2xl shadow-[0_4px_30px_rgba(0,0,0,0.6)]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 12px)', paddingBottom: '12px', paddingLeft: '14px', paddingRight: '14px' }}
      >
        <div className="flex items-center gap-2.5 bg-[rgba(14,20,55,0.8)] border border-blue-500/28 rounded-[14px] px-3.5 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(150,200,255,0.7)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 opacity-50">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            autoFocus
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="별, 별자리, 행성 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[rgba(215,232,255,0.95)] text-base font-sans placeholder:text-[rgba(90,130,210,0.55)]"
          />
          <button
            onClick={onClose}
            className="bg-transparent border-none text-[rgba(120,165,255,0.65)] text-xl leading-none cursor-pointer p-0.5"
          >✕</button>
        </div>
      </div>

      {/* Results */}
      <div className="overflow-y-auto max-h-[55vh] bg-[rgba(4,6,18,0.97)] backdrop-blur-2xl no-scrollbar">
        {query && items.length === 0 && (
          <div className="py-5 text-center text-[rgba(100,150,230,0.5)] text-sm">검색 결과 없음</div>
        )}
        {items.map((item, idx) => {
          const pos = getObjectAltAz(item, skyStateRef.current);
          const validPos = pos && isFinite(pos.alt) && isFinite(pos.az);
          const altText = validPos
            ? (pos.alt >= 0
                ? `고도 ${pos.alt.toFixed(0)}° · 방위 ${pos.az.toFixed(0)}°`
                : `지평선 아래 ${Math.abs(pos.alt).toFixed(0)}°`)
            : '';
          const belowHorizon = validPos && pos.alt < 0;

          return (
            <div
              key={idx}
              onClick={() => handleItemClick(item)}
              className="flex items-center gap-3 px-[18px] py-[13px] border-b border-[rgba(40,60,130,0.18)] cursor-pointer active:bg-[rgba(30,60,160,0.25)] transition-colors"
            >
              <span className="text-[18px] w-[26px] text-center flex-shrink-0">{item.icon}</span>
              <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                <span className="text-[15px] font-medium text-[rgba(215,232,255,0.95)]">{item.name}</span>
                <span className="text-xs text-[rgba(100,150,230,0.6)]">{item.sub}</span>
              </span>
              <span className={`text-[11px] text-right flex-shrink-0 max-w-[90px] ${belowHorizon ? 'text-[rgba(255,140,100,0.55)]' : 'text-[rgba(120,180,255,0.55)]'}`}>
                {altText}
              </span>
            </div>
          );
        })}
      </div>

      {/* Click-away backdrop */}
      <div className="flex-1" onClick={onClose} />
    </div>
  );
}
