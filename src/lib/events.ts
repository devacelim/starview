/**
 * events.ts — Dynamic astronomical event calculator
 */

import { dateToJD } from './astronomy';
import type { AstroEvent, EventFilterType } from '../types';

const SYNODIC_MONTH  = 29.53058867;
const KNOWN_NEW_MOON = 2451550.1; // 2000-01-06 UTC

function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

function getMoonPhaseEvents(daysAhead = 90): AstroEvent[] {
  const now    = new Date();
  const nowJD  = dateToJD(now);
  const endJD  = nowJD + daysAhead;

  const cycleOffset = Math.floor((nowJD - KNOWN_NEW_MOON) / SYNODIC_MONTH) - 1;
  const events: AstroEvent[] = [];

  const phases: Array<{ frac: number; name: string; icon: string; desc: string }> = [
    { frac: 0,    name: '삭 (New Moon)',     icon: '🌑', desc: '달이 보이지 않는 삭. 어두운 밤하늘에서 관측 최적.' },
    { frac: 0.25, name: '상현달',             icon: '🌓', desc: '달이 반쪽 밝아지는 상현. 저녁 서쪽에서 관측.' },
    { frac: 0.5,  name: '보름달 (Full Moon)', icon: '🌕', desc: '달 전체가 밝게 빛나는 망. 달 관측 최적.' },
    { frac: 0.75, name: '하현달',             icon: '🌗', desc: '달이 반쪽 남은 하현. 새벽 동쪽에서 관측.' },
  ];

  for (let c = cycleOffset; ; c++) {
    const newMoonJD = KNOWN_NEW_MOON + c * SYNODIC_MONTH;
    if (newMoonJD > endJD + SYNODIC_MONTH) break;

    phases.forEach(({ frac, name, icon, desc }) => {
      const jd   = newMoonJD + frac * SYNODIC_MONTH;
      const date = jdToDate(jd);
      if (jd >= nowJD - 0.5 && jd <= endJD) {
        events.push({ type: 'moon', title: name, icon, desc, date });
      }
    });
  }
  return events;
}

const METEOR_SHOWERS = [
  { name: '사분의자리 유성우',  nameEn: 'Quadrantids',   month: 1,  day: 3,  zhr: 120, parent: '소행성 2003 EH1',        icon: '☄️', duration: 1 },
  { name: '거문고자리 유성우',  nameEn: 'Lyrids',         month: 4,  day: 22, zhr: 18,  parent: '혜성 C/1861 G1 Thatcher', icon: '☄️', duration: 2 },
  { name: '물병자리 유성우',   nameEn: 'Eta Aquariids',   month: 5,  day: 6,  zhr: 60,  parent: '핼리 혜성',               icon: '☄️', duration: 3 },
  { name: '남쪽 물고기자리 유성우', nameEn: 'S. Delta Aquariids', month: 7, day: 28, zhr: 20, parent: '혜성 96P/맥홀츠', icon: '☄️', duration: 5 },
  { name: '페르세우스 유성우', nameEn: 'Perseids',        month: 8,  day: 12, zhr: 100, parent: '혜성 109P/스위프트-터틀',  icon: '☄️', duration: 3 },
  { name: '드래코 유성우',     nameEn: 'Draconids',       month: 10, day: 8,  zhr: 10,  parent: '혜성 21P/지아코비니-진너', icon: '☄️', duration: 1 },
  { name: '오리온 유성우',     nameEn: 'Orionids',        month: 10, day: 21, zhr: 20,  parent: '핼리 혜성',               icon: '☄️', duration: 2 },
  { name: '황소자리 유성우',   nameEn: 'Taurids',         month: 11, day: 5,  zhr: 5,   parent: '혜성 2P/엔케',            icon: '☄️', duration: 7 },
  { name: '사자자리 유성우',   nameEn: 'Leonids',         month: 11, day: 17, zhr: 15,  parent: '혜성 55P/템펠-터틀',      icon: '☄️', duration: 2 },
  { name: '쌍둥이자리 유성우', nameEn: 'Geminids',        month: 12, day: 14, zhr: 150, parent: '소행성 3200 파에톤',       icon: '☄️', duration: 2 },
  { name: '작은곰자리 유성우', nameEn: 'Ursids',          month: 12, day: 22, zhr: 10,  parent: '혜성 8P/터틀',            icon: '☄️', duration: 2 },
];

function getMeteorShowerEvents(daysAhead = 180): AstroEvent[] {
  const now    = new Date();
  const endDate = new Date(now.getTime() + daysAhead * 86400000);
  const events: AstroEvent[] = [];

  [0, 1].forEach((yearOffset) => {
    const year = now.getFullYear() + yearOffset;
    METEOR_SHOWERS.forEach((shower) => {
      const peak = new Date(year, shower.month - 1, shower.day, 22, 0, 0);
      if (peak >= now && peak <= endDate) {
        const window = shower.duration;
        events.push({
          type: 'meteor',
          title: shower.name,
          icon: shower.icon,
          desc: `모혜성: ${shower.parent} · 시간당 최대 ${shower.zhr}개 · 활동 기간 약 ${window * 2 + 1}일`,
          date: peak,
        });
      }
    });
  });
  return events;
}

function getSeasonEvents(daysAhead = 180): AstroEvent[] {
  const now  = new Date();
  const end  = new Date(now.getTime() + daysAhead * 86400000);
  const events: AstroEvent[] = [];

  [0, 1].forEach((yearOffset) => {
    const Y    = now.getFullYear() + yearOffset;
    const JDE0 = equinoxSolsticeJDE(Y);

    const seasons: Array<{ jd: number; name: string; icon: string; desc: string }> = [
      { jd: JDE0.marchEquinox,   name: '춘분 (봄 시작)',  icon: '🌱', desc: '낮과 밤의 길이가 같아지는 춘분. 봄 별자리 시즌 시작.' },
      { jd: JDE0.juneSolstice,   name: '하지 (여름 시작)', icon: '☀️', desc: '1년 중 낮이 가장 긴 날. 여름 별자리 관측 시작.' },
      { jd: JDE0.septEquinox,    name: '추분 (가을 시작)', icon: '🍂', desc: '낮과 밤의 길이가 같아지는 추분. 가을 별자리 시즌.' },
      { jd: JDE0.decSolstice,    name: '동지 (겨울 시작)', icon: '❄️', desc: '1년 중 밤이 가장 긴 날. 겨울 별자리 관측 최적.' },
    ];

    seasons.forEach(({ jd, name, icon, desc }) => {
      const date = jdToDate(jd);
      if (date >= now && date <= end) {
        events.push({ type: 'season', title: name, icon, desc, date });
      }
    });
  });
  return events;
}

function equinoxSolsticeJDE(Y: number): { marchEquinox: number; juneSolstice: number; septEquinox: number; decSolstice: number } {
  const k = Y / 1000;
  return {
    marchEquinox: 1721139.2855 + 365242.1376 * k + 0.067919 * k*k - 0.0002 * k*k*k,
    juneSolstice: 1721233.2486 + 365241.7436 * k - 0.05933 * k*k - 0.0 * k*k*k,
    septEquinox:  1721325.6978 + 365242.4900 * k - 0.11589 * k*k - 0.00048 * k*k*k,
    decSolstice:  1721414.3920 + 365242.8823 * k - 0.00823 * k*k - 0.00032 * k*k*k,
  };
}

function getPlanetEvents(daysAhead = 180): AstroEvent[] {
  const now   = new Date();
  const events: AstroEvent[] = [];

  const PLANET_PERIODS = [
    { name: '화성',  icon: '♂', synodic: 779.9,  lastOpp: new Date('2025-01-16') },
    { name: '목성',  icon: '♃', synodic: 398.9,  lastOpp: new Date('2024-12-07') },
    { name: '토성',  icon: '♄', synodic: 378.1,  lastOpp: new Date('2025-09-21') },
    { name: '천왕성', icon: '⛢', synodic: 369.7, lastOpp: new Date('2024-11-17') },
    { name: '해왕성', icon: '♆', synodic: 367.5, lastOpp: new Date('2024-09-20') },
  ];

  PLANET_PERIODS.forEach(({ name, icon, synodic, lastOpp }) => {
    let opp = new Date(lastOpp);
    while (opp <= now) opp = new Date(opp.getTime() + synodic * 86400000);
    if (opp <= new Date(now.getTime() + daysAhead * 86400000)) {
      events.push({
        type: 'planet',
        title: `${name} 충 (관측 최적)`,
        icon,
        desc: `${name}이 지구와 가장 가까워지는 충. 밤새 관측 가능하며 밝기가 최대.`,
        date: opp,
      });
    }
  });

  return events;
}

const ECLIPSE_DATA: Array<{ type: string; date: string; name: string; icon: string; region: string; desc: string }> = [
  { type: 'lunar',  date: '2025-03-14', name: '개기 월식',  icon: '🌑', region: '북미·남미·서유럽',     desc: '달이 지구 그림자에 완전히 들어가는 개기 월식.' },
  { type: 'solar',  date: '2026-02-17', name: '금환 일식',  icon: '💍', region: '남극 근처',             desc: '달이 태양을 완전히 가리지 못해 금반지 모양이 나타나는 금환 일식.' },
  { type: 'lunar',  date: '2025-09-07', name: '개기 월식',  icon: '🌑', region: '아시아·아프리카·유럽',  desc: '아시아에서 관측 가능한 개기 월식.' },
  { type: 'solar',  date: '2026-08-12', name: '개기 일식',  icon: '🌞', region: '그린란드·아이슬란드',    desc: '달이 태양을 완전히 가리는 개기 일식.' },
  { type: 'lunar',  date: '2026-03-03', name: '반영 월식',  icon: '🌕', region: '전 세계',               desc: '달이 지구 반영에 들어가는 반영 월식.' },
  { type: 'lunar',  date: '2026-08-28', name: '부분 월식',  icon: '🌔', region: '아시아·호주',            desc: '달의 일부가 지구 본영에 들어가는 부분 월식.' },
  { type: 'solar',  date: '2027-02-06', name: '개기 일식',  icon: '🌞', region: '칠레·아르헨티나',         desc: '개기 일식.' },
  { type: 'solar',  date: '2027-08-02', name: '개기 일식',  icon: '🌞', region: '아프리카·아라비아',       desc: '21세기 가장 긴 개기 일식 중 하나 (6분 23초).' },
  { type: 'lunar',  date: '2028-01-12', name: '개기 월식',  icon: '🌑', region: '아시아·호주·아메리카',    desc: '개기 월식.' },
  { type: 'solar',  date: '2028-07-22', name: '개기 일식',  icon: '🌞', region: '호주·뉴질랜드',           desc: '호주 대도시에서 관측 가능한 개기 일식.' },
];

function getEclipseEvents(daysAhead = 1095): AstroEvent[] {
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 86400000);
  return ECLIPSE_DATA
    .map((e) => ({ ...e, date: new Date(e.date) }))
    .filter((e) => e.date >= now && e.date <= end)
    .map((e) => ({
      type: 'eclipse' as EventFilterType,
      title: e.name,
      icon: e.icon,
      desc: `관측 가능 지역: ${e.region}. ${e.desc}`,
      date: e.date,
    }));
}

export function getAllEvents(daysAhead = 180): AstroEvent[] {
  const all = [
    ...getMoonPhaseEvents(daysAhead),
    ...getMeteorShowerEvents(daysAhead),
    ...getSeasonEvents(daysAhead),
    ...getPlanetEvents(daysAhead),
    ...getEclipseEvents(daysAhead),
  ];
  return all.sort((a, b) => a.date.getTime() - b.date.getTime());
}
