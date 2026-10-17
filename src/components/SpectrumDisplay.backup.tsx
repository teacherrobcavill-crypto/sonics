import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilterParams } from '../types';
import { audioEngine } from '../audio/AudioEngine';
import {
  formatFrequency,
  formatGain,
  freqToLogScale,
  logScaleToFreq,
  MIN_FREQ,
  MAX_FREQ
} from '../utils/frequencies';

interface SpectrumDisplayProps {
  targetFilter?: FilterParams | null;
  userFilter?: FilterParams | null;
  showTargetCurve?: boolean;
  interactive?: boolean;
  onFilterChange?: (params: { frequency: number; gain: number; q?: number }) => void;
  onQChange?: (newQ: number) => void;
  currentQ?: number;
  height?: number;
  highlightFreq?: number | null;
}

export const SpectrumDisplay: React.FC<SpectrumDisplayProps> = ({
  targetFilter = null,
  userFilter = null,
  showTargetCurve = false,
  interactive = false,
  onFilterChange,
  onQChange,
  currentQ,
  height = 300,
  highlightFreq = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const [hoverInfo, setHoverInfo] = useState<{ freq: number; gain: number; x: number; y: number } | null>(null);
  const [qFeedback, setQFeedback] = useState<{ q: number; visible: boolean } | null>(null);
  const qFeedbackTimeoutRef = useRef<number | null>(null);

  // Frequency grid points
  const gridFreqs = [20, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
  const gridDbs = [18, 12, 6, 0, -6, -12, -18];

  // Helper to convert dB to canvas Y
  const dbToY = useCallback((db: number, h: number) => {
    const minDb = -18;
    const maxDb = 18;
    const norm = (db - minDb) / (maxDb - minDb);
    return h - norm * h;
  }, []);

  // Helper to convert canvas Y to dB
  const yToDb = useCallback((y: number, h: number) => {
    const norm = 1 - y / h;
    return -18 + norm * 36;
  }, []);

  // Generate frequency sample points for rendering curves
  const numPoints = 250;
  const sampleFreqs = useRef<Float32Array>(new Float32Array(numPoints));

  useEffect(() => {
    for (let i = 0; i < numPoints; i++) {
      const norm = i / (numPoints - 1);
      sampleFreqs.current[i] = logScaleToFreq(norm);
    }
  }, []);

  // Render loop for 60fps spectrum + curves
  useEffect(() => {
    let animationId: number;
    const fftArray = new Uint8Array(1024);

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#1a233a';
      ctx.fillStyle = '#51648d';
      ctx.font = '10px JetBrains Mono, monospace';

      // Horizontal dB lines
      gridDbs.forEach(db => {
        const y = dbToY(db, h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = db === 0 ? '#2a3b63' : '#141c2e';
        ctx.stroke();

        ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 8, y - 3);
      });

      // Vertical Frequency lines
      gridFreqs.forEach(freq => {
        const norm = freqToLogScale(freq);
        const x = norm * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.strokeStyle = (freq === 100 || freq === 1000 || freq === 10000) ? '#263454' : '#141c2e';
        ctx.stroke();

        const label = formatFrequency(freq);
        const textWidth = ctx.measureText(label).width;
        ctx.fillText(label, Math.max(2, Math.min(w - textWidth - 4, x - textWidth / 2)), h - 8);
      });

      // Highlight frequency vertical marker if specified
      if (highlightFreq) {
        const x = freqToLogScale(highlightFreq) * w;
        ctx.strokeStyle = 'rgba(255, 183, 3, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Live Audio Spectrum Analyzer (FFT)
      audioEngine.getSpectrumData(fftArray);
      ctx.beginPath();
      ctx.moveTo(0, h);

      // Map FFT bins to logarithmic scale
      const nyquist = 22050;
      const binCount = fftArray.length;
      let prevX = 0;

      for (let i = 0; i < w; i += 2) {
        const normX = i / w;
        const freq = logScaleToFreq(normX);
        const bin = Math.min(binCount - 1, Math.floor((freq / nyquist) * binCount));
        const val = fftArray[bin] / 255.0; // 0 to 1
        const barH = val * (h * 0.7);
        const y = h - barH;

        if (i === 0) {
          ctx.moveTo(0, y);
        } else {
          ctx.lineTo(i, y);
        }
        prevX = i;
      }
      ctx.lineTo(prevX, h);
      ctx.closePath();

      const spectrumGrad = ctx.createLinearGradient(0, h * 0.3, 0, h);
      spectrumGrad.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
      spectrumGrad.addColorStop(0.7, 'rgba(0, 240, 255, 0.05)');
      spectrumGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      ctx.fillStyle = spectrumGrad;
      ctx.fill();

      // Draw User Filter Curve (if active)
      if (userFilter) {
        const dbs = audioEngine.getFrequencyResponse(userFilter, sampleFreqs.current);
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffb703'; // Amber

        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Node handle
        const nodeX = freqToLogScale(userFilter.frequency) * w;
        const nodeY = dbToY(userFilter.gain, h);

        ctx.fillStyle = '#ffb703';
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw Target (Mystery) Filter Curve when revealed
      if (showTargetCurve && targetFilter) {
        const dbs = audioEngine.getFrequencyResponse(targetFilter, sampleFreqs.current);

        // Fill under curve
        ctx.beginPath();
        ctx.moveTo(0, dbToY(0, h));
        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, dbToY(0, h));
        ctx.closePath();

        const targetGrad = ctx.createLinearGradient(0, 0, 0, h);
        targetGrad.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
        targetGrad.addColorStop(1, 'rgba(0, 255, 136, 0.02)');
        ctx.fillStyle = targetGrad;
        ctx.fill();

        // Target Line
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#00ff88'; // Neon Green
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;

        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Target Node Handle
        const nodeX = freqToLogScale(targetFilter.frequency) * w;
        const nodeY = dbToY(targetFilter.gain, h);

        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0a0d14';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [targetFilter, userFilter, showTargetCurve, highlightFreq, dbToY]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Mousewheel Q Adjustment (Up = Higher Q, Down = Lower Q)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const effectiveQ = currentQ ?? userFilter?.q ?? targetFilter?.q ?? 1.41;
      // Up mousewheel (deltaY < 0) => higher Q, Down mousewheel (deltaY > 0) => lower Q
      const step = 0.15;
      const delta = e.deltaY < 0 ? step : -step;
      const nextQ = Math.max(0.3, Math.min(10.0, Math.round((effectiveQ + delta) * 100) / 100));

      if (onQChange) {
        onQChange(nextQ);
      }

      if (onFilterChange) {
        const activeFilter = userFilter || targetFilter;
        if (activeFilter) {
          onFilterChange({
            frequency: activeFilter.frequency,
            gain: activeFilter.gain,
            q: nextQ
          });
        }
      }

      setQFeedback({ q: nextQ, visible: true });
      if (qFeedbackTimeoutRef.current) {
        window.clearTimeout(qFeedbackTimeoutRef.current);
      }
      qFeedbackTimeoutRef.current = window.setTimeout(() => {
        setQFeedback(prev => prev ? { ...prev, visible: false } : null);
      }, 1500);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (qFeedbackTimeoutRef.current) {
        window.clearTimeout(qFeedbackTimeoutRef.current);
      }
    };
  }, [interactive, currentQ, userFilter, targetFilter, onQChange, onFilterChange]);

  // Mouse / Touch interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !canvasRef.current || !onFilterChange) return;
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFilterFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = x / rect.width;
    const freq = logScaleToFreq(normX);
    const gain = yToDb(y, rect.height);

    setHoverInfo({ freq, gain, x, y });

    if (interactive && isDraggingRef.current && onFilterChange) {
      onFilterChange({
        frequency: Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)),
        gain: Math.max(-18, Math.min(18, Math.round(gain * 2) / 2))
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateFilterFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onFilterChange) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = x / rect.width;
    const freq = logScaleToFreq(normX);
    const gain = yToDb(y, rect.height);

    onFilterChange({
      frequency: Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)),
      gain: Math.max(-18, Math.min(18, Math.round(gain * 2) / 2))
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-studio-800 bg-studio-950 shadow-2xl select-none"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${interactive ? 'cursor-crosshair' : 'cursor-default'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverInfo(null)}
      />

      {/* Real-time Mousewheel Q indicator */}
      {qFeedback && qFeedback.visible && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 px-3 py-1.5 text-xs font-mono bg-studio-accent text-studio-950 font-bold rounded-xl shadow-xl border border-white/30 flex items-center space-x-1.5 animate-pulse">
          <span>Q: {qFeedback.q.toFixed(2)}</span>
          <span className="text-[10px] font-normal opacity-80">(Mousewheel)</span>
        </div>
      )}

      {/* Interactive Helper Hint */}
      {interactive && (
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-mono text-slate-500 bg-studio-950/70 px-2 py-0.5 rounded border border-studio-800/80">
          Scroll Wheel: Q (Bandwidth) &bull; Drag: Freq & Gain
        </div>
      )}

      {/* Hover readout badge */}
      {hoverInfo && (
        <div
          className="pointer-events-none absolute px-2.5 py-1 text-xs font-mono bg-studio-900/90 text-studio-accent rounded border border-studio-700 shadow backdrop-blur-sm"
          style={{
            left: Math.min(hoverInfo.x + 12, (containerRef.current?.clientWidth || 300) - 140),
            top: Math.max(8, hoverInfo.y - 30)
          }}
        >
          {formatFrequency(hoverInfo.freq)} | {formatGain(hoverInfo.gain)}
        </div>
      )}

      {/* Legend badges */}
      <div className="absolute top-2 right-3 flex items-center space-x-3 text-[11px] font-mono pointer-events-none">
        {userFilter && (
          <div className="flex items-center space-x-1.5 bg-studio-900/80 px-2 py-0.5 rounded border border-amber-500/30 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Your Guess / EQ</span>
          </div>
        )}
        {showTargetCurve && targetFilter && (
          <div className="flex items-center space-x-1.5 bg-studio-900/80 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>Target Answer</span>
          </div>
        )}
      </div>
    </div>
  );
};
