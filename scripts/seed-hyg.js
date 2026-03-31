#!/usr/bin/env node
/**
 * HYG v3 성표 다운로드 → 필터링 → Supabase 시드
 * 출처: https://github.com/astronexus/HYG-Database
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-hyg.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { gunzipSync } from 'zlib';

const __dir = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const MAG_LIMIT    = 6.5;   // 육안 한계 등급
const BATCH_SIZE   = 500;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_KEY 환경변수를 설정해주세요.');
  process.exit(1);
}

// ── 기존 stars.json 에서 한국어 이름 매핑 구축 ─────────────────────────────
const localStars = JSON.parse(readFileSync(join(__dir, '../assets/stars.json'), 'utf-8'));
const koMap = {};  // proper name (lowercase) → Korean name
localStars.forEach(s => { if (s.nameKo) koMap[s.name.toLowerCase()] = s.nameKo; });

// ── 별자리 약어 → 한국어 ─────────────────────────────────────────────────────
const CON_KO = {
  And:'안드로메다', Ant:'펌프자리', Aps:'극락조자리', Aqr:'물병자리', Aql:'독수리자리',
  Ara:'제단자리', Ari:'양자리', Aur:'마차부자리', Boo:'목동자리', Cae:'조각칼자리',
  Cam:'기린자리', Cnc:'게자리', CVn:'사냥개자리', CMa:'큰개자리', CMi:'작은개자리',
  Cap:'염소자리', Car:'용골자리', Cas:'카시오페이아', Cen:'켄타우루스', Cep:'세페우스',
  Cet:'고래자리', Cha:'카멜레온', Cir:'컴퍼스자리', Col:'비둘기자리', Com:'머리털자리',
  CrA:'남쪽왕관', CrB:'북쪽왕관', Crv:'까마귀자리', Crt:'컵자리', Cru:'남십자자리',
  Cyg:'백조자리', Del:'돌고래자리', Dor:'황새치자리', Dra:'용자리', Equ:'조랑말자리',
  Eri:'에리다누스', For:'화로자리', Gem:'쌍둥이자리', Gru:'두루미자리', Her:'헤르쿨레스',
  Hor:'시계자리', Hya:'바다뱀자리', Hyi:'물뱀자리', Ind:'인디언자리', Lac:'도마뱀자리',
  Leo:'사자자리', LMi:'작은사자자리', Lep:'토끼자리', Lib:'천칭자리', Lup:'이리자리',
  Lyn:'살쾡이자리', Lyr:'거문고자리', Men:'테이블산자리', Mic:'현미경자리', Mon:'외뿔소자리',
  Mus:'파리자리', Nor:'직각자자리', Oct:'팔분의자리', Oph:'뱀주인자리', Ori:'오리온자리',
  Pav:'공작자리', Peg:'페가수스', Per:'페르세우스', Phe:'봉황자리', Pic:'화가자리',
  PsA:'남쪽물고기', Psc:'물고기자리', Pup:'고물자리', Pyx:'나침반자리', Ret:'그물자리',
  Sge:'화살자리', Sgr:'궁수자리', Sco:'전갈자리', Scl:'조각가자리', Sct:'방패자리',
  Ser:'뱀자리', Sex:'육분의자리', Tau:'황소자리', Tel:'망원경자리', TrA:'남쪽삼각형',
  Tri:'삼각형자리', Tuc:'큰부리새자리', UMa:'큰곰자리', UMi:'작은곰자리', Vel:'돛자리',
  Vir:'처녀자리', Vol:'날치자리', Vul:'여우자리',
};

// ── HYG CSV 다운로드 ──────────────────────────────────────────────────────────
const HYG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv.gz';
console.log('HYG v38 성표 다운로드 중...');
const csvRes = await fetch(HYG_URL);
if (!csvRes.ok) { console.error('다운로드 실패:', csvRes.status); process.exit(1); }
const buf  = Buffer.from(await csvRes.arrayBuffer());
const csv  = gunzipSync(buf).toString('utf-8');
console.log(`다운로드·압축해제 완료 (${(csv.length / 1024 / 1024).toFixed(1)} MB)`);

// ── CSV 파싱 ──────────────────────────────────────────────────────────────────
const lines   = csv.split('\n');
// v38 헤더에 따옴표 포함 → 제거
const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
const col = name => headers.indexOf(name);

const C = {
  id:    col('id'),
  hip:   col('hip'),
  proper:col('proper'),
  ra:    col('ra'),
  dec:   col('dec'),
  mag:   col('mag'),
  con:   col('con'),
  bayer: col('bayer'),
  flam:  col('flam'),
};

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const r = lines[i].split(',');
  if (r.length < 10) continue;

  const mag = parseFloat(r[C.mag]);
  if (isNaN(mag) || mag > MAG_LIMIT) continue;

  const raHours = parseFloat(r[C.ra]);
  const dec     = parseFloat(r[C.dec]);
  if (isNaN(raHours) || isNaN(dec)) continue;

  const hip    = r[C.hip]?.replace(/"/g,'').trim();
  const proper = r[C.proper]?.replace(/"/g,'').trim();
  const bayer  = r[C.bayer]?.replace(/"/g,'').trim();
  const flam   = r[C.flam]?.replace(/"/g,'').trim();
  const con    = r[C.con]?.replace(/"/g,'').trim() || null;

  const id   = hip ? `hip${hip}` : `hyg${r[C.id]?.trim()}`;
  const name = proper || (bayer && con ? `${bayer} ${con}` : flam && con ? `${flam} ${con}` : id);
  const nameKo = proper ? (koMap[proper.toLowerCase()] ?? null) : null;

  rows.push({
    id,
    name,
    name_ko:       nameKo,
    ra:            raHours * 15,   // 시간 → 도
    dec,
    mag:           Math.round(mag * 100) / 100,
    constellation: con,
  });
}

console.log(`필터링 결과: ${rows.length}개 (등급 ≤ ${MAG_LIMIT})`);

// ── Supabase upsert (배치) ─────────────────────────────────────────────────
const headers_ = {
  'Content-Type':  'application/json',
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Prefer':        'resolution=merge-duplicates,return=minimal',
};

let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stars`, {
    method:  'POST',
    headers: headers_,
    body:    JSON.stringify(batch),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ 배치 ${i}~${i + batch.length} 실패: ${body}`);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\r  → ${inserted} / ${rows.length} 업로드...`);
}

console.log(`\n✓ ${inserted}개 별 시드 완료.`);
