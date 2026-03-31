/**
 * skymap.ts — AR/Virtual Sky Overlay Renderer
 */

import { raDecToAltAz } from './astronomy';
import { drawMiniMoon } from './moon';
import type { SkyState, HitResult, Star, MoonData, Planet, Constellation } from '../types';

interface PlanetVisCfg {
  baseR: number;
  c1: string;
  c2: string;
  glow: string;
  bands: boolean;
  rings: boolean;
}

const PLANET_VIS: Record<string, PlanetVisCfg> = {
  Mercury: { baseR: 5,  c1: '#c8c8c8', c2: '#606060', glow: 'rgba(200,200,200,0.3)',  bands: false, rings: false },
  Venus:   { baseR: 8,  c1: '#fffae0', c2: '#d8c030', glow: 'rgba(255,245,80,0.35)',  bands: false, rings: false },
  Mars:    { baseR: 7,  c1: '#e85030', c2: '#901808', glow: 'rgba(232,80,48,0.35)',   bands: false, rings: false },
  Jupiter: { baseR: 14, c1: '#e4b870', c2: '#a87030', glow: 'rgba(228,184,112,0.3)', bands: true,  rings: false },
  Saturn:  { baseR: 12, c1: '#f0e090', c2: '#c09840', glow: 'rgba(240,224,144,0.3)', bands: false, rings: true  },
  Uranus:  { baseR: 9,  c1: '#90e8f8', c2: '#40a0b8', glow: 'rgba(144,232,248,0.3)', bands: false, rings: false },
  Neptune: { baseR: 8,  c1: '#4878f0', c2: '#1830a0', glow: 'rgba(72,120,240,0.3)',  bands: false, rings: false },
};

function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 60);
  const g = Math.max(0, ((n >> 8) & 0xff) - 60);
  const b = Math.max(0, (n & 0xff) - 60);
  return `rgb(${r},${g},${b})`;
}

export function drawPlanetDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, nameEn: string): void {
  const cfg = PLANET_VIS[nameEn] || PLANET_VIS.Mercury;
  ctx.save();

  if (cfg.rings) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 2.2, r * 0.45, 0, Math.PI, 0, true);
    ctx.strokeStyle = 'rgba(180,148,80,0.6)';
    ctx.lineWidth   = r * 0.38;
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
  grad.addColorStop(0,   cfg.c1);
  grad.addColorStop(0.6, cfg.c2);
  grad.addColorStop(1,   darken(cfg.c2));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  if (cfg.bands) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    [cy - r * 0.55, cy - r * 0.15, cy + r * 0.2, cy + r * 0.55].forEach((by, i) => {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(160,90,30,0.42)' : 'rgba(255,210,130,0.28)';
      ctx.fillRect(cx - r, by, r * 2, r * 0.28);
    });
    ctx.restore();
  }

  if (cfg.rings) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 2.2, r * 0.45, 0, 0, Math.PI);
    ctx.strokeStyle = 'rgba(210,178,100,0.88)';
    ctx.lineWidth   = r * 0.36;
    ctx.stroke();
  }

  const spec = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.32, 0, cx - r * 0.32, cy - r * 0.32, r * 0.55);
  spec.addColorStop(0, 'rgba(255,255,255,0.45)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();

  ctx.restore();
}

function drawPlanetEdgeArrow(ctx: CanvasRenderingContext2D, W: number, H: number, projX: number, projY: number, r: number, planet: Planet, cfg: PlanetVisCfg): void {
  const cx = W / 2, cy = H / 2;
  const angle = Math.atan2(projY - cy, projX - cx);
  const cos = Math.cos(angle), sin = Math.sin(angle);

  const m = 40;
  let t = Infinity;
  if (cos > 1e-9) t = Math.min(t, (W - m - cx) / cos);
  if (cos < -1e-9) t = Math.min(t, (m - cx) / cos);
  if (sin > 1e-9) t = Math.min(t, (H - m - cy) / sin);
  if (sin < -1e-9) t = Math.min(t, (m - cy) / sin);
  if (!isFinite(t) || t <= 0) return;

  const bx = cx + cos * t;
  const by = cy + sin * t;
  const br = 20;

  ctx.save();

  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,8,24,0.78)';
  ctx.fill();
  ctx.strokeStyle = cfg.c1;
  ctx.lineWidth   = 1.2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, br - 2, 0, Math.PI * 2);
  ctx.clip();
  drawPlanetDisc(ctx, bx, by, Math.max(4, Math.min(9, r * 0.72)), planet.nameEn);
  ctx.restore();

  const ax = bx + cos * (br + 6);
  const ay = by + sin * (br + 6);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = cfg.c1;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4,  4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.font        = 'bold 9px -apple-system, sans-serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = 'rgba(0,0,20,0.9)';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.strokeText(planet.name, bx, by + br + 3);
  ctx.fillStyle   = cfg.c1;
  ctx.fillText(planet.name, bx, by + br + 3);

  ctx.restore();
}

function drawMoonEdgeArrow(ctx: CanvasRenderingContext2D, W: number, H: number, projX: number, projY: number, moon: MoonData): void {
  const cx = W / 2, cy = H / 2;
  const angle = Math.atan2(projY - cy, projX - cx);
  const cos = Math.cos(angle), sin = Math.sin(angle);

  const m = 40;
  let t = Infinity;
  if (cos > 1e-9)  t = Math.min(t, (W - m - cx) / cos);
  if (cos < -1e-9) t = Math.min(t, (m - cx) / cos);
  if (sin > 1e-9)  t = Math.min(t, (H - m - cy) / sin);
  if (sin < -1e-9) t = Math.min(t, (m - cy) / sin);
  if (!isFinite(t) || t <= 0) return;

  const bx = cx + cos * t;
  const by = cy + sin * t;
  const br = 20;

  ctx.save();

  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,8,24,0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,245,200,0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const mc = Object.assign(document.createElement('canvas'), { width: br * 2, height: br * 2 });
  drawMiniMoon(mc, moon.phase);
  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, br - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(mc, bx - br, by - br, br * 2, br * 2);
  ctx.restore();

  const ax = bx + cos * (br + 6);
  const ay = by + sin * (br + 6);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(255,245,200,0.9)';
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4,  4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.font        = 'bold 9px -apple-system, sans-serif';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = 'rgba(0,0,20,0.9)';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.strokeText('달', bx, by + br + 3);
  ctx.fillStyle   = 'rgba(255,245,200,0.9)';
  ctx.fillText('달', bx, by + br + 3);

  ctx.restore();
}

function drawSearchTargetEdgeArrow(ctx: CanvasRenderingContext2D, W: number, H: number, projX: number, projY: number, name: string, icon: string): void {
  const cx = W / 2, cy = H / 2;
  const angle = Math.atan2(projY - cy, projX - cx);
  const cos = Math.cos(angle), sin = Math.sin(angle);

  const m = 44;
  let t = Infinity;
  if (cos > 1e-9)  t = Math.min(t, (W - m - cx) / cos);
  if (cos < -1e-9) t = Math.min(t, (m - cx) / cos);
  if (sin > 1e-9)  t = Math.min(t, (H - m - cy) / sin);
  if (sin < -1e-9) t = Math.min(t, (m - cy) / sin);
  if (!isFinite(t) || t <= 0) return;

  const bx = cx + cos * t;
  const by = cy + sin * t;
  const br = 22;

  ctx.save();

  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,8,24,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,80,0.9)';
  ctx.lineWidth   = 1.8;
  ctx.stroke();

  ctx.font         = `${Math.round(br * 0.85)}px -apple-system, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(255,220,80,0.95)';
  ctx.fillText(icon || '✦', bx, by);

  const ax = bx + cos * (br + 7);
  const ay = by + sin * (br + 7);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(255,220,80,0.9)';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4,  4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.font         = 'bold 9px -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.strokeStyle  = 'rgba(0,0,20,0.9)';
  ctx.lineWidth    = 2;
  ctx.lineJoin     = 'round';
  ctx.strokeText(name, bx, by + br + 3);
  ctx.fillStyle = 'rgba(255,220,80,0.9)';
  ctx.fillText(name, bx, by + br + 3);

  ctx.restore();
}

let starsData: Star[]  = [];
let constsData: Constellation[] = [];

export function getStarsData(): Star[]  { return starsData;  }
export function getConstsData(): Constellation[] { return constsData; }

export async function loadSkyData(): Promise<void> {
  const [starsRes, constsRes] = await Promise.all([
    fetch('/assets/stars.json'),
    fetch('/assets/constellations.json'),
  ]);
  starsData  = await starsRes.json();
  constsData = await constsRes.json();
}

interface ProjectResult {
  x: number;
  y: number;
  visible: boolean;
}

function project(altDeg: number, azDeg: number, deviceAz: number, deviceAlt: number, W: number, H: number, fovH: number): ProjectResult {
  const dAz  = ((azDeg  - deviceAz  + 540) % 360) - 180;
  const dAlt = altDeg - deviceAlt;
  const scale = Math.max(W, H) / fovH;
  const x = W / 2 + dAz  * scale;
  const y = H / 2 - dAlt * scale;
  const margin = Math.max(W, H) * 0.12;
  const visible = x > -margin && x < W + margin && y > -margin && y < H + margin;
  return { x, y, visible };
}

function drawVirtualSky(ctx: CanvasRenderingContext2D, W: number, H: number, deviceAz: number, deviceAlt: number, fov: number): void {
  const scale  = Math.max(W, H) / fov;
  const horizY = Math.round(H / 2 + deviceAlt * scale);

  const skyBottom = Math.max(0, Math.min(H, horizY));
  if (skyBottom > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, skyBottom);
    sky.addColorStop(0,    '#000008');
    sky.addColorStop(0.45, '#010c1e');
    sky.addColorStop(0.78, '#04152c');
    sky.addColorStop(1,    '#081c38');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, skyBottom);
  }

  if (horizY < H) {
    const groundTop = Math.max(0, horizY);
    if (deviceAlt < -5) {
      const ug = ctx.createLinearGradient(0, groundTop, 0, Math.min(H, groundTop + 300));
      ug.addColorStop(0,   '#04100a');
      ug.addColorStop(1,   '#010405');
      ctx.fillStyle = ug;
      ctx.fillRect(0, groundTop, W, H - groundTop);
    } else {
      const ground = ctx.createLinearGradient(0, groundTop, 0, H);
      ground.addColorStop(0,   '#040a05');
      ground.addColorStop(0.3, '#030705');
      ground.addColorStop(1,   '#010302');
      ctx.fillStyle = ground;
      ctx.fillRect(0, groundTop, W, H - groundTop);
    }
  }

  if (horizY > -120 && horizY < H + 120) {
    const topGlow = ctx.createLinearGradient(0, Math.max(0, horizY - 90), 0, horizY);
    topGlow.addColorStop(0,   'rgba(10,40,150,0)');
    topGlow.addColorStop(0.5, 'rgba(20,65,190,0.07)');
    topGlow.addColorStop(1,   'rgba(50,110,230,0.22)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, Math.max(0, horizY - 90), W, Math.min(90, horizY));

    if (horizY < H) {
      const botGlow = ctx.createLinearGradient(0, horizY, 0, Math.min(H, horizY + 70));
      botGlow.addColorStop(0,   'rgba(50,110,230,0.18)');
      botGlow.addColorStop(1,   'rgba(10,40,150,0)');
      ctx.fillStyle = botGlow;
      ctx.fillRect(0, horizY, W, Math.min(70, H - horizY));
    }

    ctx.save();
    ctx.shadowColor = 'rgba(80,150,255,0.5)';
    ctx.shadowBlur  = 6;
    ctx.strokeStyle = 'rgba(90,150,255,0.55)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, horizY);
    ctx.lineTo(W, horizY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  const scaleX = W - 24;
  [90, 60, 45, 30, 15, 0, -15, -30, -45, -60].forEach((alt) => {
    const y = H / 2 - (alt - deviceAlt) * scale;
    if (y < 8 || y > H - 8) return;
    const isHorizon = alt === 0;
    ctx.save();
    ctx.strokeStyle = isHorizon ? 'rgba(90,150,255,0.55)' : 'rgba(80,130,220,0.2)';
    ctx.lineWidth   = isHorizon ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(scaleX - 6, y);
    ctx.lineTo(scaleX + 6, y);
    ctx.stroke();
    if (alt % 30 === 0) {
      ctx.fillStyle = 'rgba(100,160,255,0.35)';
      ctx.font      = '9px -apple-system, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${alt >= 0 ? '+' : ''}${alt}°`, scaleX - 8, y + 3);
    }
    ctx.restore();
  });

  const CARDINALS = [
    { lbl: 'N', az: 0 }, { lbl: 'NE', az: 45 }, { lbl: 'E', az: 90 }, { lbl: 'SE', az: 135 },
    { lbl: 'S', az: 180 }, { lbl: 'SW', az: 225 }, { lbl: 'W', az: 270 }, { lbl: 'NW', az: 315 },
  ];
  CARDINALS.forEach(({ lbl, az }) => {
    const pos = project(0, az, deviceAz, deviceAlt, W, H, fov);
    if (!pos.visible) return;
    const isN = lbl === 'N';
    const isMain = ['N','E','S','W'].includes(lbl);
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${isMain ? 13 : 11}px -apple-system, sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,20,0.8)';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.strokeText(lbl, pos.x, pos.y + 20);
    ctx.fillStyle = isN ? 'rgba(255,165,70,0.95)' : 'rgba(120,180,255,0.8)';
    ctx.fillText(lbl, pos.x, pos.y + 20);
    ctx.restore();
  });

  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(140,200,255,0.35)';
  ctx.lineWidth   = 1;
  const rCross   = 20;
  const arm = 16;
  const gap = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, rCross, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rCross - arm, cy); ctx.lineTo(cx - rCross - gap, cy);
  ctx.moveTo(cx + rCross + gap,  cy); ctx.lineTo(cx + rCross + arm, cy);
  ctx.moveTo(cx, cy - rCross - arm); ctx.lineTo(cx, cy - rCross - gap);
  ctx.moveTo(cx, cy + rCross + gap);  ctx.lineTo(cx, cy + rCross + arm);
  ctx.stroke();
  ctx.restore();

  if (deviceAlt < -8) {
    const labelY = Math.min(horizY + 28, H - 20);
    ctx.save();
    ctx.fillStyle   = 'rgba(100,170,255,0.3)';
    ctx.font        = '11px -apple-system, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(`▼ 지평선 아래 ${Math.abs(Math.round(deviceAlt))}°`, W / 2, labelY);
    ctx.restore();
  }
}

type ProjectedStar = Star & { altitude: number; azimuth: number; x: number; y: number; visible: boolean };

export function renderSky(canvas: HTMLCanvasElement, state: SkyState): void {
  const { lat, lon, deviceAz, deviceAlt, planets, moon, date, toggles, arMode, fov: stateFov } = state;
  const ctx = canvas.getContext('2d')!;
  const W   = canvas.width;
  const H   = canvas.height;
  const fov = stateFov ?? 60;

  if (arMode === 'virtual') {
    drawVirtualSky(ctx, W, H, deviceAz, deviceAlt, fov);
  } else {
    ctx.clearRect(0, 0, W, H);
  }

  if (lat == null || lon == null) return;

  const tog = toggles || { stars: true, constellations: true, moon: true, planets: true };

  const catalog = state.stars || starsData;

  const projected: ProjectedStar[] = catalog.map((star) => {
    let altitude: number, azimuth: number;
    if (star.altitude !== undefined && star.azimuth !== undefined) {
      altitude = star.altitude;
      azimuth  = star.azimuth;
    } else {
      const pos = raDecToAltAz(star.ra, star.dec, date, lat, lon);
      altitude  = pos.altitude;
      azimuth   = pos.azimuth;
    }
    return { ...star, altitude, azimuth, ...project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov) };
  });

  if (tog.constellations) {
    constsData.forEach((c) => {
      (c.lines || []).forEach(([idA, idB]) => {
        const a = projected.find((s) => s.id === idA);
        const b = projected.find((s) => s.id === idB);
        if (!a || !b) return;
        if (!a.visible && !b.visible) return;
        const belowHorizon = a.altitude < 0 && b.altitude < 0;
        ctx.save();
        ctx.strokeStyle = belowHorizon
          ? 'rgba(60,100,200,0.18)'
          : 'rgba(100,155,255,0.38)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      });
    });

    constsData.forEach((c) => {
      const members = projected.filter(
        (s) => s.constellation?.toUpperCase() === c.id.toUpperCase() && s.visible && s.altitude > -20
      );
      if (members.length < 2) return;
      const cxL = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cyL = members.reduce((s, m) => s + m.y, 0) / members.length;
      const avgAlt = members.reduce((s, m) => s + m.altitude, 0) / members.length;
      const belowHorizon = avgAlt < 0;
      ctx.save();
      ctx.font        = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,20,0.85)';
      ctx.lineWidth   = 3;
      ctx.lineJoin    = 'round';
      ctx.strokeText(c.nameKo || c.name, cxL, cyL - 6);
      ctx.fillStyle = belowHorizon ? 'rgba(80,130,220,0.4)' : 'rgba(126,184,247,0.65)';
      ctx.fillText(c.nameKo || c.name, cxL, cyL - 6);
      ctx.restore();
    });
  }

  if (tog.stars) {
    projected.forEach((star) => {
      if (!star.visible) return;

      const belowHorizon = star.altitude < 0;
      const alphaMult    = belowHorizon ? 0.3 : 1.0;
      const radius       = Math.max(0.8, 3.8 - star.mag * 0.85);
      const baseAlpha    = Math.min(1, Math.max(0.25, (5 - star.mag) / 5.5));
      const alpha        = baseAlpha * alphaMult;

      ctx.save();
      const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 2.8);
      grad.addColorStop(0,   `rgba(235,243,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(200,225,255,${alpha * 0.8})`);
      grad.addColorStop(0.7, `rgba(130,175,255,${alpha * 0.3})`);
      grad.addColorStop(1,   'rgba(80,130,255,0)');
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,248,255,${alpha})`;
      ctx.fill();
      ctx.restore();

      if (star.mag < 3.0 && (star.nameKo || star.name)) {
        ctx.save();
        ctx.font        = '13px -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,20,0.95)';
        ctx.lineWidth   = 3;
        ctx.lineJoin    = 'round';
        ctx.strokeText(star.nameKo || star.name, star.x + radius + 5, star.y);
        ctx.fillStyle = belowHorizon ? 'rgba(150,195,255,0.55)' : 'rgba(220,235,255,1.0)';
        ctx.fillText(star.nameKo || star.name, star.x + radius + 5, star.y);
        ctx.restore();
      }
    });
  }

  if (tog.moon && moon) {
    const pos = project(moon.altitude, moon.azimuth, deviceAz, deviceAlt, W, H, fov);
    const moonBelow = moon.altitude < 0;
    const moonAlpha = moonBelow ? 0.35 : 1.0;

    if (pos.visible) {
      const R = 22;
      ctx.save();
      ctx.globalAlpha = moonAlpha;
      const glow = ctx.createRadialGradient(pos.x, pos.y, R * 0.5, pos.x, pos.y, R * 2.5);
      glow.addColorStop(0,   'rgba(255,245,200,0.25)');
      glow.addColorStop(1,   'rgba(255,245,200,0)');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.restore();

      const mc = Object.assign(document.createElement('canvas'), { width: R * 2, height: R * 2 });
      drawMiniMoon(mc, moon.phase);
      ctx.save();
      ctx.globalAlpha = moonAlpha;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(mc, pos.x - R, pos.y - R, R * 2, R * 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = moonAlpha;
      ctx.font      = 'bold 12px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,245,200,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('달', pos.x, pos.y + R + 14);
      ctx.restore();
    } else if (moon.altitude > -3) {
      drawMoonEdgeArrow(ctx, W, H, pos.x, pos.y, moon);
    }
  }

  if (tog.planets && planets) {
    const scx = W / 2, scy = H / 2;
    const now = Date.now();

    planets.forEach((p) => {
      const pos = project(p.altitude, p.azimuth, deviceAz, deviceAlt, W, H, fov);
      const cfg = PLANET_VIS[p.nameEn] || PLANET_VIS.Mercury;
      const r   = cfg.baseR * Math.max(0.7, 60 / fov);

      if (pos.visible && p.altitude > -5) {
        const dist = Math.hypot(pos.x - scx, pos.y - scy);
        const threshold = W * 0.12;

        ctx.save();
        const glowGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 3.5);
        glowGrad.addColorStop(0, cfg.glow);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();
        ctx.restore();

        if (dist < threshold) {
          const pulse = (Math.sin(now / 300) + 1) / 2;
          for (let ring = 0; ring < 3; ring++) {
            const ringR = r * (2.2 + ring * 1.2 + pulse * 0.8);
            const alpha = (0.55 - ring * 0.15) * (1 - dist / threshold);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = cfg.c1;
            ctx.lineWidth   = 1.5 - ring * 0.4;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        drawPlanetDisc(ctx, pos.x, pos.y, r, p.nameEn);

        ctx.save();
        ctx.font         = '11px -apple-system, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle  = 'rgba(0,0,20,0.8)';
        ctx.lineWidth    = 2.5;
        ctx.lineJoin     = 'round';
        ctx.strokeText(p.name, pos.x, pos.y + r + 4);
        ctx.fillStyle = 'rgba(247,201,126,0.95)';
        ctx.fillText(p.name, pos.x, pos.y + r + 4);
        ctx.restore();

      } else if (p.altitude > -3) {
        drawPlanetEdgeArrow(ctx, W, H, pos.x, pos.y, r, p, cfg);
      }
    });
  }

  if (state.searchTarget) {
    const { az, alt, name, icon } = state.searchTarget;
    const tPos = project(alt, az, deviceAz, deviceAlt, W, H, fov);
    const now  = Date.now();
    const pulse = (Math.sin(now / 300) + 1) / 2;
    const onScreen = tPos.x > -60 && tPos.x < W + 60 && tPos.y > -60 && tPos.y < H + 60;

    if (onScreen) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,220,80,${0.65 + pulse * 0.35})`;
      ctx.lineWidth   = 2;
      ctx.shadowColor = 'rgba(255,220,80,0.7)';
      ctx.shadowBlur  = 12 + pulse * 8;
      ctx.beginPath();
      ctx.arc(tPos.x, tPos.y, 28 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(tPos.x, tPos.y, 16 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      drawSearchTargetEdgeArrow(ctx, W, H, tPos.x, tPos.y, name, icon);
    }
  }
}

export function hitTest(canvas: HTMLCanvasElement, tapX: number, tapY: number, state: SkyState): HitResult | null {
  const { lat, lon, deviceAz, deviceAlt, planets, moon, date, fov: stateFov } = state;
  const W   = canvas.width;
  const H   = canvas.height;
  const fov = stateFov ?? 60;

  let best: HitResult | null = null;
  let bestDist = 44;

  const catalog = state.stars || starsData;
  catalog.forEach((star) => {
    let altitude: number, azimuth: number;
    if (star.altitude !== undefined && star.azimuth !== undefined) {
      altitude = star.altitude; azimuth = star.azimuth;
    } else {
      if (lat == null || lon == null) return;
      const p = raDecToAltAz(star.ra, star.dec, date, lat, lon);
      altitude = p.altitude; azimuth = p.azimuth;
    }
    const pos = project(altitude, azimuth, deviceAz, deviceAlt, W, H, fov);
    const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
    if (d < bestDist) { bestDist = d; best = { type: 'star', data: star }; }
  });

  if (moon) {
    const pos = project(moon.altitude, moon.azimuth, deviceAz, deviceAlt, W, H, fov);
    const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
    if (d < 36) { bestDist = d; best = { type: 'moon', data: moon }; }
  }

  if (planets) {
    planets.forEach((p) => {
      const pos = project(p.altitude, p.azimuth, deviceAz, deviceAlt, W, H, fov);
      const d   = Math.hypot(tapX - pos.x, tapY - pos.y);
      if (d < bestDist) { bestDist = d; best = { type: 'planet', data: p }; }
    });
  }

  return best;
}
