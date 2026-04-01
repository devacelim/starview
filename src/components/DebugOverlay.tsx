import { useRef, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { SkyState } from '../types';

interface Props {
  skyStateRef: MutableRefObject<SkyState>;
}

interface LogEntry {
  t: number;
  alpha: number;
  beta: number;
  gamma: number;
  rawAz: number;    // rotation matrix az
  smoothAz: number; // output deviceAz
  alt: number;
  delta: number;    // frame-to-frame az change
  src: string;
}

export default function DebugOverlay({ skyStateRef }: Props) {
  const [visible, setVisible] = useState(false);
  const [recording, setRecording] = useState(false);
  const logRef = useRef<LogEntry[]>([]);
  const divRef = useRef<HTMLDivElement>(null);
  const prevAzRef = useRef(0);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    let rafId: number;
    const update = () => {
      const s = skyStateRef.current;
      if (divRef.current) {
        const d = s.azDelta;
        const dirArrow = Math.abs(d) < 0.05 ? '·' : d > 0 ? '→' : '←';
        const altColor = s.deviceAlt > 45 ? '#ff6b6b' : '#7bed9f';
        divRef.current.innerHTML = `
<b style="color:#ffd43b">RAW SENSOR</b>
α: ${s.rawAlpha.toFixed(1)}° β: ${s.rawBeta.toFixed(1)}° γ: ${s.rawGamma.toFixed(1)}°
<b style="color:#ffd43b">COMPUTED</b>
matrixAz: ${s.rawAz.toFixed(1)}°  alphaAz: ${s.rawAlpha.toFixed(1)}°
smoothAz: ${s.deviceAz.toFixed(1)}°  <span style="color:${altColor}">alt: ${s.deviceAlt.toFixed(1)}°</span>
<b style="color:#74b9ff">DELTA</b>
Δaz: ${d >= 0 ? '+' : ''}${d.toFixed(2)}° <span style="font-size:16px">${dirArrow}</span>
matrixAz−alpha: ${((s.rawAz - s.rawAlpha + 540) % 360 - 180).toFixed(1)}°
<b style="color:#a29bfe">SOURCE</b>: ${s.sensorSource}
<b style="color:#fd79a8">FRAME</b>: ${frameCountRef.current++}
${recording ? '<span style="color:#ff6b6b">● REC ' + logRef.current.length + '</span>' : ''}`;
      }

      if (recording) {
        logRef.current.push({
          t: Date.now(),
          alpha: s.rawAlpha,
          beta: s.rawBeta,
          gamma: s.rawGamma,
          rawAz: s.rawAz,
          smoothAz: s.deviceAz,
          alt: s.deviceAlt,
          delta: s.azDelta,
          src: s.sensorSource,
        });
      }

      prevAzRef.current = s.deviceAz;
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [visible, recording, skyStateRef]);

  const exportLog = () => {
    const log = logRef.current;
    if (!log.length) return;
    // Build CSV
    const header = 't,alpha,beta,gamma,matrixAz,smoothAz,alt,delta,src';
    const rows = log.map(e =>
      `${e.t},${e.alpha.toFixed(2)},${e.beta.toFixed(2)},${e.gamma.toFixed(2)},${e.rawAz.toFixed(2)},${e.smoothAz.toFixed(2)},${e.alt.toFixed(2)},${e.delta.toFixed(3)},${e.src}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensor-log-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Floating debug button (always visible)
  return (
    <>
      <button
        onClick={() => setVisible(v => !v)}
        className="fixed z-[200] w-8 h-8 rounded-full bg-red-900/80 border border-red-500/50 text-[10px] text-red-300 font-bold backdrop-blur-sm"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px)', right: '20px' }}
      >
        {visible ? 'X' : 'D'}
      </button>

      {visible && (
        <div
          className="fixed z-[199] bg-black/90 border border-yellow-500/40 rounded-lg p-2 backdrop-blur-md shadow-xl"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 144px)',
            right: '8px',
            width: '280px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#dfe6e9',
            lineHeight: '1.5',
          }}
        >
          <div ref={divRef} style={{ whiteSpace: 'pre' }}>Loading...</div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                if (!recording) logRef.current = [];
                setRecording(r => !r);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                recording
                  ? 'bg-red-900/80 border-red-500/60 text-red-200'
                  : 'bg-green-900/80 border-green-500/60 text-green-200'
              }`}
            >
              {recording ? 'STOP' : 'REC'}
            </button>
            <button
              onClick={exportLog}
              className="px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-900/80 border-blue-500/60 text-blue-200"
            >
              EXPORT CSV ({logRef.current.length})
            </button>
          </div>
        </div>
      )}
    </>
  );
}
