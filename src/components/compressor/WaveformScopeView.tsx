import React, { useRef, useEffect } from 'react';
import { CompressorTelemetry } from '../../types/compressor';

interface WaveformScopeViewProps {
  telemetry: CompressorTelemetry;
  isBypassed?: boolean;
}

export const WaveformScopeView: React.FC<WaveformScopeViewProps> = ({ telemetry, isBypassed }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<{ gr: number; inLevel: number }[]>([]);

  useEffect(() => {
    // Append current frame data to circular history buffer
    const history = historyRef.current;
    const currentIn = Math.max(0, (Math.max(telemetry.inputPeakL, telemetry.inputPeakR) + 48) / 54);
    const currentGr = isBypassed ? 0 : Math.min(1.0, Math.abs(telemetry.gainReductionDb) / 20);

    history.push({ gr: currentGr, inLevel: currentIn });
    if (history.length > 200) {
      history.shift();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Dark oscilloscope background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, width, height);

    // Reference Grid Lines: 0 dB, -6 dB, -12 dB, -18 dB
    ctx.lineWidth = 1;
    const gridLines = [
      { y: height * 0.1, label: '0 dB Ceiling' },
      { y: height * 0.35, label: '-6 dB' },
      { y: height * 0.60, label: '-12 dB' },
      { y: height * 0.85, label: '-18 dB' }
    ];

    gridLines.forEach(g => {
      ctx.beginPath();
      ctx.moveTo(0, g.y);
      ctx.lineTo(width, g.y);
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();

      ctx.font = '9px "SF Mono", Menlo, monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(g.label, 8, g.y - 3);
    });

    const stepX = width / Math.max(1, history.length - 1);
    const midY = height * 0.55;

    // 1. Draw Audio Waveform Ribbon (Cyan glow)
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < history.length; i++) {
      const x = i * stepX;
      const amp = history[i].inLevel * (height * 0.38);
      // Generate organic smooth multi-harmonic ribbon
      const wiggle = Math.sin(i * 0.45) * amp;
      ctx.lineTo(x, midY - wiggle);
    }
    for (let i = history.length - 1; i >= 0; i--) {
      const x = i * stepX;
      const amp = history[i].inLevel * (height * 0.38);
      const wiggle = Math.sin(i * 0.45) * amp;
      ctx.lineTo(x, midY + wiggle);
    }
    ctx.closePath();

    const waveGrad = ctx.createLinearGradient(0, height * 0.2, 0, height * 0.9);
    waveGrad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
    waveGrad.addColorStop(1, 'rgba(30, 58, 138, 0.2)');
    ctx.fillStyle = waveGrad;
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Draw Inverted Gain Reduction Curve dipping down from the 0 dB ceiling
    if (!isBypassed) {
      const ceilingY = height * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, ceilingY);

      for (let i = 0; i < history.length; i++) {
        const x = i * stepX;
        // Map 0 to 20 dB GR to pixels dipping down
        const dip = history[i].gr * (height * 0.65);
        ctx.lineTo(x, ceilingY + dip);
      }
      ctx.lineTo(width, ceilingY);
      ctx.closePath();

      // Translucent amber gain reduction bite fill
      const grGrad = ctx.createLinearGradient(0, ceilingY, 0, height * 0.7);
      grGrad.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
      grGrad.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
      ctx.fillStyle = grGrad;
      ctx.fill();

      // Sharp GR Curve line
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = i * stepX;
        const dip = history[i].gr * (height * 0.65);
        if (i === 0) ctx.moveTo(x, ceilingY + dip);
        else ctx.lineTo(x, ceilingY + dip);
      }
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }

    // Legend Badge
    ctx.font = 'bold 10px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('● AUDIO WAVEFORM', width - 240, 18);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('▼ GAIN REDUCTION ENVELOPE', width - 120, 18);

  }, [telemetry, isBypassed]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2">
      <canvas
        ref={canvasRef}
        width={420}
        height={220}
        className="w-full h-auto max-w-[420px] rounded-xl shadow-2xl border-2 border-slate-700/80"
      />
    </div>
  );
};
