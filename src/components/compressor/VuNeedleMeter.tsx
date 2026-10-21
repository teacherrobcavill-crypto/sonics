import React, { useRef, useEffect } from 'react';
import { VUMeterBallistics } from '../../utils/compressorBallistics';

interface VuNeedleMeterProps {
  needlePosition: number; // 0.0 (rest / 0dB) to 1.0 (full deflection / -20dB)
  isBypassed?: boolean;
}

export const VuNeedleMeter: React.FC<VuNeedleMeterProps> = ({ needlePosition, isBypassed }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // 1. Vintage Faceplate Background with Warm Glow
    const bgGrad = ctx.createRadialGradient(
      width * 0.5, height * 0.9, 20,
      width * 0.5, height * 0.5, width * 0.65
    );
    bgGrad.addColorStop(0, '#fef3c7');    // Warm bulb glow
    bgGrad.addColorStop(0.5, '#fde68a');  // Cream amber
    bgGrad.addColorStop(1, '#f59e0b');    // Deep amber aged dial

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle dial shadow / inner bezel
    const innerShadow = ctx.createLinearGradient(0, 0, 0, height);
    innerShadow.addColorStop(0, 'rgba(0,0,0,0.4)');
    innerShadow.addColorStop(0.15, 'rgba(0,0,0,0.05)');
    innerShadow.addColorStop(0.85, 'rgba(0,0,0,0.05)');
    innerShadow.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = innerShadow;
    ctx.fillRect(0, 0, width, height);

    // Meter Dimensions & Geometry
    const pivotX = width * 0.5;
    const pivotY = height * 1.08;
    const radius = height * 0.88;

    // 2. Calibrated Gain Reduction Arc Markings
    // 0 dB (left), -1, -2, -3, -5, -7, -10, -15, -20 dB (right)
    const markings: { db: number; label: string; isMajor: boolean }[] = [
      { db: 0, label: '0', isMajor: true },
      { db: 1, label: '1', isMajor: false },
      { db: 2, label: '2', isMajor: false },
      { db: 3, label: '3', isMajor: true },
      { db: 5, label: '5', isMajor: true },
      { db: 7, label: '7', isMajor: true },
      { db: 10, label: '10', isMajor: true },
      { db: 15, label: '15', isMajor: true },
      { db: 20, label: '20', isMajor: true }
    ];

    // Red compression danger arc (-10 dB to -20 dB, on the left)
    const startDangerNorm = VUMeterBallistics.mapGainReductionToNormalized(-10);
    const endDangerNorm = VUMeterBallistics.mapGainReductionToNormalized(-20);
    const startDangerAngle = VUMeterBallistics.positionToAngle(startDangerNorm) - Math.PI / 2;
    const endDangerAngle = VUMeterBallistics.positionToAngle(endDangerNorm) - Math.PI / 2;

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, radius + 2, endDangerAngle, startDangerAngle);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Draw Ticks and Numbers
    markings.forEach(m => {
      const normPos = VUMeterBallistics.mapGainReductionToNormalized(-m.db);
      const angle = VUMeterBallistics.positionToAngle(normPos) - Math.PI / 2;

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const tickStart = radius - (m.isMajor ? 14 : 8);
      const tickEnd = radius;

      const x1 = pivotX + cos * tickStart;
      const y1 = pivotY + sin * tickStart;
      const x2 = pivotX + cos * tickEnd;
      const y2 = pivotY + sin * tickEnd;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = m.db >= 10 ? '#dc2626' : '#1e293b';
      ctx.lineWidth = m.isMajor ? 2.5 : 1.5;
      ctx.stroke();

      if (m.isMajor) {
        const textDist = radius - 24;
        const tx = pivotX + cos * textDist;
        const ty = pivotY + sin * textDist;

        ctx.font = 'bold 11px "SF Mono", Menlo, Monaco, monospace';
        ctx.fillStyle = m.db >= 10 ? '#b91c1c' : '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, tx, ty);
      }
    });

    // Faceplate Labeling
    ctx.font = '900 11px "SF Mono", Menlo, Monaco, monospace';
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText('GAIN REDUCTION dB', pivotX, height * 0.62);

    ctx.font = '700 8.5px "SF Mono", Menlo, Monaco, monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('ANSI C16.5', pivotX, height * 0.70);

    // 3. Physical Needle Drawing
    const needleAngle = VUMeterBallistics.positionToAngle(needlePosition) - Math.PI / 2;
    const needleLength = radius + 4;

    const needleTipX = pivotX + Math.cos(needleAngle) * needleLength;
    const needleTipY = pivotY + Math.sin(needleAngle) * needleLength;

    // Needle shadow
    ctx.beginPath();
    ctx.moveTo(pivotX + 2, pivotY + 2);
    ctx.lineTo(needleTipX + 2, needleTipY + 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Actual Needle
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(needleTipX, needleTipY);
    ctx.strokeStyle = isBypassed ? '#64748b' : '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Red Needle Tip Accent
    const accentStart = radius - 15;
    const tipAccentX = pivotX + Math.cos(needleAngle) * accentStart;
    const tipAccentY = pivotY + Math.sin(needleAngle) * accentStart;

    ctx.beginPath();
    ctx.moveTo(tipAccentX, tipAccentY);
    ctx.lineTo(needleTipX, needleTipY);
    ctx.strokeStyle = isBypassed ? '#94a3b8' : '#e11d48';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 4. Heavy Brass / Metal Needle Pivot Hub
    const hubGrad = ctx.createRadialGradient(pivotX, pivotY, 2, pivotX, pivotY, 18);
    hubGrad.addColorStop(0, '#64748b');
    hubGrad.addColorStop(0.7, '#1e293b');
    hubGrad.addColorStop(1, '#090d16');

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 18, 0, Math.PI * 2);
    ctx.fillStyle = hubGrad;
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [needlePosition, isBypassed]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-1">
      <canvas
        ref={canvasRef}
        width={300}
        height={170}
        className="w-full h-auto max-w-[270px] rounded-xl shadow-2xl border-2 border-slate-700/80"
      />
    </div>
  );
};
