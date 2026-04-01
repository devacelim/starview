import { useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState, HitResult } from '../types';
import { renderSky, hitTest, getPlanetArrowHits, getMoonArrowHit } from '../lib/skymap';

interface Props {
  skyStateRef: MutableRefObject<SkyState>;
  onHit: (hit: HitResult, x: number, y: number) => void;
  onHover: (hit: HitResult | null, x: number, y: number) => void;
}

export default function SkyCanvas({ skyStateRef, onHit, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let rafId: number;

    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    onResize();
    window.addEventListener('resize', onResize);

    let isDragging = false, dragLastX = 0, dragLastY = 0;
    let touchLastX = 0, touchLastY = 0, lastPinchDist: number | null = null;
    let isTouching = false;
    let lastCenterKey = '';

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDragging = true; dragLastX = e.clientX; dragLastY = e.clientY;
    };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging && !skyStateRef.current.hasSensor) {
        const dx = e.clientX - dragLastX, dy = e.clientY - dragLastY;
        const sens = skyStateRef.current.fov / canvas.width;
        skyStateRef.current.deviceAz = (skyStateRef.current.deviceAz - dx * sens + 360) % 360;
        skyStateRef.current.deviceAlt = Math.max(-85, Math.min(85, skyStateRef.current.deviceAlt + dy * sens));
      }
      dragLastX = e.clientX; dragLastY = e.clientY;
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(canvas, e.clientX - rect.left, e.clientY - rect.top, skyStateRef.current);
      onHover(hit, e.clientX, e.clientY);
    };
    const onMouseLeave = () => onHover(null, 0, 0);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      skyStateRef.current.fov = Math.max(1, Math.min(120, skyStateRef.current.fov + e.deltaY * 0.05));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (skyStateRef.current.hasSensor) return;
      const step = skyStateRef.current.fov / 20;
      if (e.key === 'ArrowLeft') skyStateRef.current.deviceAz = (skyStateRef.current.deviceAz - step + 360) % 360;
      if (e.key === 'ArrowRight') skyStateRef.current.deviceAz = (skyStateRef.current.deviceAz + step) % 360;
      if (e.key === 'ArrowUp') skyStateRef.current.deviceAlt = Math.min(85, skyStateRef.current.deviceAlt + step);
      if (e.key === 'ArrowDown') skyStateRef.current.deviceAlt = Math.max(-85, skyStateRef.current.deviceAlt - step);
      if (e.key === '+' || e.key === '=') skyStateRef.current.fov = Math.max(1, skyStateRef.current.fov - 5);
      if (e.key === '-') skyStateRef.current.fov = Math.min(120, skyStateRef.current.fov + 5);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isTouching = true;
        touchLastX = e.touches[0].clientX; touchLastY = e.touches[0].clientY; lastPinchDist = null;
        // Show hover tooltip on touch (mobile)
        const rect = canvas.getBoundingClientRect();
        const hit = hitTest(canvas, e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top, skyStateRef.current);
        onHover(hit, e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && !skyStateRef.current.hasSensor) {
        const dx = e.touches[0].clientX - touchLastX, dy = e.touches[0].clientY - touchLastY;
        const sens = skyStateRef.current.fov / canvas.width;
        skyStateRef.current.deviceAz = (skyStateRef.current.deviceAz - dx * sens + 360) % 360;
        skyStateRef.current.deviceAlt = Math.max(-85, Math.min(85, skyStateRef.current.deviceAlt + dy * sens));
        touchLastX = e.touches[0].clientX; touchLastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastPinchDist !== null) {
          skyStateRef.current.fov = Math.max(1, Math.min(120, skyStateRef.current.fov * (lastPinchDist / dist)));
        }
        lastPinchDist = dist;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) lastPinchDist = null;
      if (e.touches.length === 1) {
        touchLastX = e.touches[0].clientX; touchLastY = e.touches[0].clientY;
      }
      if (e.touches.length === 0) {
        isTouching = false;
        lastCenterKey = '__reset__'; // force re-check on next frame
      }
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      // Check planet edge arrow hit areas
      for (const ah of getPlanetArrowHits()) {
        if (Math.hypot(cx - ah.bx, cy - ah.by) <= ah.br + 8) {
          onHit({ type: 'planet_arrow', data: ah.planet }, e.clientX, e.clientY);
          return;
        }
      }
      // Check moon edge arrow hit area
      const mah = getMoonArrowHit();
      if (mah && Math.hypot(cx - mah.bx, cy - mah.by) <= mah.br + 8) {
        onHit({ type: 'moon_arrow', data: mah.moon }, e.clientX, e.clientY);
        return;
      }
      const hit = hitTest(canvas, cx, cy, skyStateRef.current);
      if (hit) onHit(hit, e.clientX, e.clientY);
    };

    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);

    const loop = () => {
      skyStateRef.current.date = new Date();
      renderSky(canvas, skyStateRef.current);

      // Center crosshair focus tooltip (AR mode: object drifts into view)
      if (!isTouching) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const hit = hitTest(canvas, cx, cy, skyStateRef.current);
        const key = hit ? `${hit.type}-${(hit.data as { id?: string | number }).id ?? hit.type}` : '';
        if (key !== lastCenterKey) {
          lastCenterKey = key;
          onHover(hit, cx, cy);
        }
      }

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
