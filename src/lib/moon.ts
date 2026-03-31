/**
 * moon.ts — Moon phase canvas rendering functions
 */

export function drawMoon(canvas: HTMLCanvasElement, phase: number): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const R  = Math.min(W, H) / 2 - 8;
  const cx = W / 2;
  const cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.5);
  glow.addColorStop(0, 'rgba(255,240,180,0)');
  glow.addColorStop(1, 'rgba(255,240,180,0.06)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.restore();

  // 1. Draw dark base circle (unlit side)
  const darkGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  darkGrad.addColorStop(0, '#1a1c2a');
  darkGrad.addColorStop(1, '#0a0b14');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = darkGrad;
  ctx.fill();
  ctx.restore();

  // 2. Draw lit region (yellow) on top
  const litGrad = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  litGrad.addColorStop(0, '#f8f4d0');
  litGrad.addColorStop(0.5, '#d4cfa0');
  litGrad.addColorStop(1, '#b0a870');
  _drawLitRegion(ctx, cx, cy, R, phase, litGrad);

  // Craters
  _drawCraters(ctx, cx, cy, R);

  // Border
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,200,180,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function _drawLitRegion(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, phase: number, litColor: string | CanvasGradient): void {
  if (phase === 0 || phase === 1) return;

  const isWaxing = phase < 0.5;
  const illum = isWaxing ? phase * 2 : (1 - phase) * 2;

  if (illum < 0.01) return;

  if (illum > 0.99) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = litColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  const isGibbous = illum > 0.5;
  const a = R * Math.abs(1 - 2 * illum);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  ctx.beginPath();
  if (isWaxing) {
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
    if (!isGibbous) {
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, true);
    } else {
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, false);
    }
  } else {
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
    if (!isGibbous) {
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, false);
    } else {
      ctx.ellipse(cx, cy, a, R, 0, Math.PI / 2, -Math.PI / 2, true);
    }
  }
  ctx.closePath();
  ctx.fillStyle = litColor;
  ctx.fill();
  ctx.restore();
}

function _drawCraters(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  const craters = [
    { rx: 0.2, ry: -0.1, r: 0.08 },
    { rx: -0.3, ry: 0.2,  r: 0.06 },
    { rx: 0.1,  ry: 0.35, r: 0.05 },
    { rx: -0.15, ry: -0.3, r: 0.07 },
    { rx: 0.35, ry: 0.1,  r: 0.04 },
  ];
  ctx.save();
  ctx.globalAlpha = 0.12;
  craters.forEach((c) => {
    ctx.beginPath();
    ctx.arc(cx + c.rx * R, cy + c.ry * R, c.r * R, 0, Math.PI * 2);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();
}

export function drawMiniMoon(canvas: HTMLCanvasElement, phase: number): void {
  const ctx = canvas.getContext('2d')!;
  const W  = canvas.width;
  const R  = W / 2 - 1;
  const cx = W / 2, cy = W / 2;

  ctx.clearRect(0, 0, W, W);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0f1a';
  ctx.fill();
  ctx.restore();

  _drawLitRegion(ctx, cx, cy, R, phase, '#d4cfa0');
}
