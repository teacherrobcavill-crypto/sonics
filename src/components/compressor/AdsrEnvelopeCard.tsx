import React, { useRef, useState, useEffect } from 'react';
import { CompressorParams, CompressorStem, CompressorTelemetry } from '../../types/compressor';
import { AlertTriangle, CheckCircle, Zap, ShieldCheck, Info } from 'lucide-react';

interface AdsrEnvelopeCardProps {
  mode: 'input' | 'output';
  params: CompressorParams;
  stem: CompressorStem;
  telemetry: CompressorTelemetry;
}

interface WarningState {
  type: 'attack' | 'sustain' | 'release';
  title: string;
  desc: string;
  severity: 'warn' | 'crit' | 'good';
}

export const AdsrEnvelopeCard: React.FC<AdsrEnvelopeCardProps> = ({
  mode,
  params,
  stem,
  telemetry
}) => {
  const isInput = mode === 'input';
  const isSignal = telemetry.isSignalPresent;
  const isBypassed = params.bypassed;
  const gr = Math.abs(telemetry.gainReductionDb);
  const avgGr = telemetry.avgGainReductionDb;
  const swing = telemetry.envelopeSwingDb;

  // ---------------------------------------------------------------------------
  // Fixed Dimension SVG Coordinates (Width: 240, Height: 105) - strictly bounded
  // ---------------------------------------------------------------------------
  const svgW = 240;
  const svgH = 105;
  const baselineY = 82;

  // Safe coordinates strictly inside the 240x105 canvas
  const inAttackX = 35;
  const inAttackY = 18;
  const inDecayX = 85;
  const inDecayY = 48;
  const inSustainX = 145;
  const inSustainY = 48;
  const inReleaseX = 210;
  const inReleaseY = baselineY;

  // Smoothed Output Coordinates with damping
  const [smoothedCoords, setSmoothedCoords] = useState({
    attackY: inAttackY,
    decayY: inDecayY,
    sustainY: inSustainY,
    releaseX: inReleaseX
  });

  // Warning persistence ref (minimum 850ms hold to eliminate flicker/glitch)
  const [activeWarning, setActiveWarning] = useState<WarningState | null>(null);
  const lastWarningTime = useRef<number>(0);
  const currentWarningRef = useRef<WarningState | null>(null);

  useEffect(() => {
    const now = performance.now();

    // Compute target coordinates for output
    let targetAttackY = inAttackY;
    let targetDecayY = inDecayY;
    let targetSustainY = inSustainY;
    let targetReleaseX = inReleaseX;

    if (!isBypassed && isSignal) {
      if (params.attackMs < 3.0 && gr > 1.0) {
        const clampAmount = Math.min(26, gr * 2.8);
        targetAttackY = inAttackY + clampAmount;
      } else if (params.attackMs > 20.0 && gr > 1.0) {
        targetAttackY = inAttackY - 2;
      } else {
        targetAttackY = inAttackY + Math.min(12, gr * 1.2);
      }

      const sustainPullDown = Math.min(22, avgGr * 2.2);
      targetDecayY = inDecayY + sustainPullDown;
      targetSustainY = targetDecayY;

      const relProgress = Math.min(1.0, Math.log10(Math.max(10, params.releaseMs) / 10) / 2.0);
      targetReleaseX = 175 + relProgress * 40; // Clamped strictly between 175 and 215
    }

    setSmoothedCoords(prev => ({
      attackY: prev.attackY * 0.85 + targetAttackY * 0.15,
      decayY: prev.decayY * 0.85 + targetDecayY * 0.15,
      sustainY: prev.sustainY * 0.85 + targetSustainY * 0.15,
      releaseX: prev.releaseX * 0.85 + targetReleaseX * 0.15
    }));

    // Evaluate warnings with 850ms hold-off hysteresis
    if (!isInput && isSignal && !isBypassed) {
      let candidate: WarningState | null = null;

      if (params.attackMs < 2.0 && gr > 3.0) {
        candidate = {
          type: 'attack',
          title: 'Transient Crushed',
          desc: `Attack is too fast (${params.attackMs.toFixed(1)}ms). The initial snap is muffled and flattened.`,
          severity: 'crit'
        };
      } else if (avgGr > 7.5) {
        candidate = {
          type: 'sustain',
          title: 'Choked Dynamics',
          desc: `Heavy compression (-${avgGr.toFixed(1)} dB). Audio is over-squashed and may sound lifeless.`,
          severity: 'crit'
        };
      } else if (swing > 3.0 && params.releaseMs < 45.0) {
        candidate = {
          type: 'release',
          title: 'Audible Pumping',
          desc: `Release is too fast (${params.releaseMs.toFixed(0)}ms). Volume swells up unnaturally between hits.`,
          severity: 'warn'
        };
      } else if (params.releaseMs > 500.0 && (stem.category === 'drums' || stem.category === 'kick' || stem.category === 'snare')) {
        candidate = {
          type: 'release',
          title: 'Release Lag',
          desc: `Slow release (${params.releaseMs.toFixed(0)}ms) fails to recover before the next hit.`,
          severity: 'warn'
        };
      } else if (params.attackMs > 25.0 && gr > 1.5) {
        candidate = {
          type: 'attack',
          title: 'Punch Preserved',
          desc: `Slow attack (${params.attackMs.toFixed(0)}ms) lets initial snap crack through cleanly.`,
          severity: 'good'
        };
      } else if (avgGr >= 1.8 && avgGr <= 6.0) {
        candidate = {
          type: 'sustain',
          title: 'Analog Glue',
          desc: `Sweet spot (2–6 dB GR). Adds cohesive body without audible choking.`,
          severity: 'good'
        };
      }

      if (candidate) {
        if (candidate.severity === 'crit' || !currentWarningRef.current || now - lastWarningTime.current > 850) {
          currentWarningRef.current = candidate;
          lastWarningTime.current = now;
          setActiveWarning(candidate);
        }
      } else if (now - lastWarningTime.current > 1000) {
        currentWarningRef.current = null;
        setActiveWarning(null);
      }
    } else {
      if (now - lastWarningTime.current > 1000) {
        currentWarningRef.current = null;
        setActiveWarning(null);
      }
    }
  }, [telemetry, params.bypassed, params.attackMs, params.releaseMs, params.thresholdDb, params.ratio, isInput, isSignal, isBypassed, gr, avgGr, swing, stem.category]);

  const outAttackY = smoothedCoords.attackY;
  const outDecayY = smoothedCoords.decayY;
  const outSustainY = smoothedCoords.sustainY;
  const outReleaseX = Math.min(218, Math.max(170, smoothedCoords.releaseX));

  return (
    <div className="bg-studio-950/80 border border-studio-800 rounded-2xl p-3 sm:p-3.5 flex flex-col space-y-2.5 h-full min-h-[300px] shadow-inner font-mono overflow-hidden">
      
      {/* 1. Header (Fixed Height) */}
      <div className="flex items-center justify-between border-b border-studio-800/80 pb-2 h-9 min-h-[36px] max-h-[36px] flex-shrink-0">
        <div className="overflow-hidden">
          <div className="flex items-center space-x-1.5 truncate">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isInput ? 'bg-cyan-400' : isBypassed ? 'bg-amber-400' : 'bg-studio-accent'} animate-pulse`} />
            <h3 className="text-xs font-black uppercase tracking-wider text-white truncate">
              {isInput ? 'Input ADSR' : 'Output ADSR'}
            </h3>
          </div>
          <p className="text-[9px] text-slate-400 font-sans truncate">
            {isInput ? 'Pre-Compression Profile' : 'Post-VCA Processed Shape'}
          </p>
        </div>

        <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex-shrink-0 whitespace-nowrap ${
          isInput
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : isBypassed
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : activeWarning?.severity === 'crit'
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            : activeWarning?.severity === 'warn'
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
        }`}>
          {isInput ? 'PRE-COMP' : isBypassed ? 'BYPASS' : activeWarning?.severity === 'crit' ? '⚠️ UNNATURAL' : activeWarning?.severity === 'warn' ? '⚠️ CAUTION' : 'OPTIMAL'}
        </span>
      </div>

      {/* 2. ADSR Oscilloscope Graph Container (Fixed Height 110px, Overflow Hidden) */}
      <div className="relative w-full h-[110px] min-h-[110px] max-h-[110px] bg-studio-950 rounded-xl border border-studio-800/90 overflow-hidden flex items-center justify-center flex-shrink-0">
        {/* Subtle Background Oscilloscope Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:10px_10px] opacity-40 pointer-events-none" />

        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-full overflow-hidden select-none"
        >
          {/* Baseline Zero Level */}
          <line
            x1="10"
            y1={baselineY}
            x2={svgW - 10}
            y2={baselineY}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* If Output mode: render ghosted input reference curve */}
          {!isInput && (
            <path
              d={`M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 20} ${inDecayY + 12} ${inReleaseX} ${inReleaseY}`}
              fill="none"
              stroke="#475569"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.5"
            />
          )}

          {/* Filled Envelope Area */}
          <path
            d={
              isInput
                ? `M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 20} ${inDecayY + 12} ${inReleaseX} ${inReleaseY} Z`
                : `M 10 ${baselineY} L ${inAttackX} ${outAttackY} L ${inDecayX} ${outDecayY} L ${inSustainX} ${outSustainY} Q ${inSustainX + 18} ${outDecayY + 12} ${outReleaseX} ${inReleaseY} Z`
            }
            fill={
              isInput
                ? 'url(#inputGradient)'
                : activeWarning?.severity === 'crit'
                ? 'url(#critGradient)'
                : 'url(#outputGradient)'
            }
            opacity="0.22"
          />

          {/* Main ADSR Stroke */}
          <path
            d={
              isInput
                ? `M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 20} ${inDecayY + 12} ${inReleaseX} ${inReleaseY}`
                : `M 10 ${baselineY} L ${inAttackX} ${outAttackY} L ${inDecayX} ${outDecayY} L ${inSustainX} ${outSustainY} Q ${inSustainX + 18} ${outDecayY + 12} ${outReleaseX} ${inReleaseY}`
            }
            fill="none"
            stroke={
              isInput
                ? '#00f0ff'
                : activeWarning?.severity === 'crit'
                ? '#f43f5e'
                : activeWarning?.severity === 'warn'
                ? '#fbbf24'
                : '#10b981'
            }
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Gradients */}
          <defs>
            <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="critGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Attack Peak Point */}
          <circle
            cx={inAttackX}
            cy={isInput ? inAttackY : outAttackY}
            r="4"
            fill="#ffffff"
            stroke={isInput ? '#00f0ff' : activeWarning?.type === 'attack' && activeWarning.severity === 'crit' ? '#f43f5e' : '#10b981'}
            strokeWidth="2"
          />

          {/* Decay Transition Point */}
          <circle
            cx={inDecayX}
            cy={isInput ? inDecayY : outDecayY}
            r="2.5"
            fill={isInput ? '#38bdf8' : '#34d399'}
          />

          {/* Sustain End Point */}
          <circle
            cx={inSustainX}
            cy={isInput ? inSustainY : outSustainY}
            r="3"
            fill="#ffffff"
            stroke={isInput ? '#00f0ff' : activeWarning?.type === 'sustain' && activeWarning.severity === 'crit' ? '#f43f5e' : '#10b981'}
            strokeWidth="1.5"
          />

          {/* Stage Labels (A, D, S, R) */}
          <text x={inAttackX} y={baselineY + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
            A
          </text>
          <text x={inDecayX - 10} y={baselineY + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
            D
          </text>
          <text x={inSustainX - 25} y={baselineY + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
            S
          </text>
          <text x={isInput ? inReleaseX : outReleaseX} y={baselineY + 14} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
            R
          </text>
        </svg>

        {/* Warning Callout Pill overlaid on Output Graph (Strictly Bounded) */}
        {!isInput && activeWarning && isSignal && !isBypassed && (
          <div className={`absolute top-2 right-2 max-w-[135px] truncate px-2 py-0.5 rounded text-[8.5px] font-bold flex items-center space-x-1 shadow-md border pointer-events-none ${
            activeWarning.severity === 'crit'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/60'
              : activeWarning.severity === 'warn'
              ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
              : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
          }`}>
            {activeWarning.severity === 'crit' ? (
              <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
            ) : activeWarning.severity === 'warn' ? (
              <Info className="w-2.5 h-2.5 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />
            )}
            <span className="truncate">{activeWarning.title}</span>
          </div>
        )}
      </div>

      {/* 3. Stage Diagnostics & Metrics Grid (Fixed Height) */}
      <div className="grid grid-cols-4 gap-1 text-center text-[9px] flex-shrink-0">
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[7.5px]">ATTACK</div>
          <div className="text-white font-bold truncate">
            {isInput ? '< 1ms' : `${params.attackMs.toFixed(1)}ms`}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[7.5px]">DECAY</div>
          <div className="text-white font-bold truncate">
            {isInput ? 'Natural' : gr > 1 ? 'Clamped' : 'Linear'}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[7.5px]">SUSTAIN</div>
          <div className="text-white font-bold truncate">
            {isInput
              ? isSignal ? `${telemetry.inputRmsL.toFixed(0)} dB` : '--'
              : isSignal ? `${telemetry.outputRmsL.toFixed(0)} dB` : '--'}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[7.5px]">RELEASE</div>
          <div className="text-white font-bold truncate">
            {isInput ? 'Natural' : `${params.releaseMs.toFixed(0)}ms`}
          </div>
        </div>
      </div>

      {/* 4. Acoustic Feedback Footer (Fixed Height 44px, Prevents Layout Jumps) */}
      <div className="h-11 min-h-[44px] max-h-[44px] p-2 rounded-xl bg-studio-900/90 border border-studio-800 text-[9.5px] text-slate-300 font-sans leading-tight overflow-hidden flex items-center flex-shrink-0">
        {isInput ? (
          <div className="flex items-center space-x-1.5 overflow-hidden w-full">
            <Zap className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="truncate">
              Raw uncompressed transient snap of <strong>{stem.name}</strong>.
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 overflow-hidden w-full">
            {activeWarning?.severity === 'crit' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            ) : activeWarning?.severity === 'warn' ? (
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            )}
            <span className={`line-clamp-2 leading-tight ${activeWarning?.severity === 'crit' ? 'text-rose-200' : activeWarning?.severity === 'warn' ? 'text-amber-200' : 'text-emerald-200'}`}>
              {activeWarning ? activeWarning.desc : 'Dynamic processing within natural musical thresholds.'}
            </span>
          </div>
        )}
      </div>

    </div>
  );
};
