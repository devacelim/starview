import { useState } from 'react';
import { getAllEvents } from '../lib/events';
import type { EventFilterType } from '../types';

function dateStr(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - new Date().getTime()) / 86400000);
}

export default function EventsScreen() {
  const [filter, setFilter] = useState<EventFilterType>('all');
  const [range, setRange] = useState<number>(180);

  const allEvents = getAllEvents(range);
  const events = filter === 'all' ? allEvents : allEvents.filter((e) => e.type === filter);

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
        천체 이벤트
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 pb-3 items-center">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as EventFilterType)}
          className="flex-1 bg-[rgba(10,10,30,0.8)] border border-[rgba(126,184,247,0.25)] rounded-[10px] px-3 py-2 text-[#e8eaf6] text-sm outline-none"
        >
          <option value="all">전체 이벤트</option>
          <option value="moon">달 위상</option>
          <option value="meteor">유성우</option>
          <option value="eclipse">일·월식</option>
          <option value="planet">행성 충</option>
          <option value="season">절기</option>
        </select>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="bg-[rgba(10,10,30,0.8)] border border-[rgba(126,184,247,0.25)] rounded-[10px] px-3 py-2 text-[#e8eaf6] text-sm outline-none"
        >
          <option value={90}>3개월</option>
          <option value={180}>6개월</option>
          <option value={365}>1년</option>
          <option value={1095}>3년</option>
        </select>
      </div>

      {/* Event list */}
      <div className="flex flex-col gap-2.5 px-4">
        {events.length === 0 ? (
          <p className="text-center text-[#7986cb] py-5">해당 기간에 이벤트가 없습니다.</p>
        ) : (
          events.map((ev, idx) => {
            const days = daysUntil(ev.date);
            const countdown = days <= 0 ? '오늘!' : days === 1 ? '내일!' : `D-${days}`;
            const urgent = days <= 3;

            return (
              <div
                key={idx}
                className="bg-[rgba(10,10,30,0.85)] border border-[rgba(126,184,247,0.12)] rounded-[16px] p-4"
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[22px]">{ev.icon}</span>
                  <div className="flex-1">
                    <div className="text-[16px] font-semibold">{ev.title}</div>
                    <div className="text-[13px] text-[#7986cb] mt-0.5">{dateStr(ev.date)}</div>
                  </div>
                  <span
                    className={`inline-block rounded-full px-2.5 py-[3px] text-xs font-semibold ml-auto
                      ${urgent
                        ? 'bg-[rgba(247,126,126,0.15)] text-[#f77e7e]'
                        : 'bg-[rgba(126,184,247,0.12)] text-[#7eb8f7]'}`}
                  >
                    {countdown}
                  </span>
                </div>
                <p className="text-[13px] text-[#7986cb] leading-relaxed">{ev.desc}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
