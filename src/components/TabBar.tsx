import type { TabId } from '../types';
import type { ReactNode } from 'react';

interface TabDef { id: TabId; label: string; icon: ReactNode; }

const TABS: TabDef[] = [
  {
    id: 'ar', label: 'AR뷰',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[22px] h-[22px]">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
  },
  {
    id: 'moon', label: '달',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[22px] h-[22px]">
        <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z"/>
      </svg>
    ),
  },
  {
    id: 'planets', label: '행성',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[22px] h-[22px]">
        <circle cx="12" cy="12" r="5"/>
        <path d="M4 12C4 12 7 6 12 6s8 6 8 6-3 6-8 6-8-6-8-6z" strokeDasharray="2 2"/>
      </svg>
    ),
  },
  {
    id: 'weather', label: '날씨',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[22px] h-[22px]">
        <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
      </svg>
    ),
  },
  {
    id: 'events', label: '이벤트',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[22px] h-[22px]">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
];

interface Props { currentTab: TabId; onTabChange: (tab: TabId) => void; }

export default function TabBar({ currentTab, onTabChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex bg-[rgba(4,6,18,0.94)] border-t border-blue-900/18 backdrop-blur-xl z-[100] shadow-[0_-1px_30px_rgba(0,0,0,0.5)]"
      style={{ height: 'calc(var(--tab-h) + var(--safe-bottom))', paddingBottom: 'var(--safe-bottom)' }}
    >
      {TABS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 border-none text-[10px] font-medium cursor-pointer transition-colors
            ${currentTab === id ? 'text-blue-300/95' : 'text-blue-900/80 bg-transparent'}`}
          style={{ background: 'none' }}
        >
          {icon}
          {label}
        </button>
      ))}
    </nav>
  );
}
