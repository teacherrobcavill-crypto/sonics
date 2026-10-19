import React from 'react';
import { CompressorParams, CompressorStem, CompressorTelemetry } from '../../types/compressor';
import { AlertTriangle, CheckCircle, Zap, ShieldCheck, Activity, Info } from 'lucide-react';

interface AdsrEnvelopeCardProps {
  mode: 'input' | 'output';
  params: CompressorParams;
  stem: CompressorStem;
  telemetry: CompressorTelemetry;
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
  const crestDelta = telemetry.crestReductionDb;
  const swing = telemetry.envelopeSwingDb;

  // ---------------------------------------------------------------------------
  // Envelope Curve Coordinates (SVG Width: 240, Height: 120)
  // ---------------------------------------------------------------------------
  const svgW = 240;
  const svgH = 120;
  const baselineY = 105;

  // 1. Raw Input Curve Coordinates
  // Attack peak at (35, 20), Decay to (90, 60), Sustain to (160, 60), Release to (230, 105)
  const inAttackX = 35;
  const inAttackY = 20; // High transient peak
  const inDecayX = 85;
  const inDecayY = 58;  // Natural body level
  const inSustainX = 155;
  const inSustainY = 58;
  const inReleaseX = 225;
  const inReleaseY = baselineY;

  // 2. Output Curve Coordinates (Reacts dynamically to settings)
  let outAttackX = inAttackX;
  let outAttackY = inAttackY;
  let outDecayX = inDecayX;
  let outDecayY = inDecayY;
  let outSustainX = inSustainX;
  let outSustainY = inDecayY;
  let outReleaseX = inReleaseX;
  let outReleaseY = baselineY;

  // Calculate Output Attack Peak
  if (isBypassed || !isSignal) {
    outAttackY = inAttackY;
    outDecayY = inDecayY;
    outSustainY = inSustainY;
    outReleaseX = inReleaseX;
  } else {
    // If attack is ultra fast and GR is high -> attack peak is flattened down
    if (params.attackMs < 3.0 && gr > 1.0) {
      const clampAmount = Math.min(35, gr * 3.5);
      outAttackY = inAttackY + clampAmount; // Lower peak (higher Y value)
    } else if (params.attackMs > 20.0 && gr > 1.0) {
      // Slow attack: transient punches through fully (near 18-20)
      outAttackY = inAttackY - 2;
    } else {
      outAttackY = inAttackY + Math.min(15, gr * 1.5);
    }

    // Sustain level: affected by threshold and ratio
    const sustainPullDown = Math.min(28, avgGr * 2.8);
    outDecayY = inDecayY + sustainPullDown;
    outSustainY = outDecayY;

    // Release length: mapped from releaseMs (10ms to 1000ms)
    // Fast release: short tail (curves down earlier); slow release: hangs longer
    const relProgress = Math.min(1.0, Math.log10(Math.max(10, params.releaseMs) / 10) / 2.0); // 0 to 1
    outReleaseX = 180 + relProgress * 50; // 180 (fast) to 230 (slow)
  }

  // ---------------------------------------------------------------------------
  // Warnings & Acoustic Indicators for Output Mode
  // ---------------------------------------------------------------------------
  const warnings: { type: 'attack' | 'sustain' | 'release'; title: string; desc: string; severity: 'warn' | 'crit' | 'good' }[] = [];

  if (!isInput && isSignal && !isBypassed) {
    // Attack Warning: Transient flattened or destroyed
    if (params.attackMs < 2.0 && gr > 3.0) {
      warnings.push({
        type: 'attack',
        title: 'Transient Crushed',
        desc: `Attack is too fast (${params.attackMs.toFixed(1)}ms). The initial snap is muffled and flattened.`,
        severity: 'crit'
      });
    } else if (params.attackMs > 25.0 && gr > 1.5) {
      warnings.push({
        type: 'attack',
        title: 'Punch Preserved',
        desc: `Slow attack (${params.attackMs.toFixed(0)}ms) lets the transient spike crack through with maximum snap.`,
        severity: 'good'
      });
    }

    // Sustain Warning: Over-squashed / choked dynamic life
    if (avgGr > 8.0) {
      warnings.push({
        type: 'sustain',
        title: 'Choked Dynamics',
        desc: `Heavy compression (-${avgGr.toFixed(1)} dB). Audio is over-squashed and may sound lifeless.`,
        severity: 'crit'
      });
    } else if (avgGr >= 2.0 && avgGr <= 6.0) {
      warnings.push({
        type: 'sustain',
        title: 'Analog Glue',
        desc: `Sweet spot (2–6 dB GR). Adds cohesive body without audible choking.`,
        severity: 'good'
      });
    }

    // Release Warning: Pumping or Release Lag
    if (swing > 3.0 && params.releaseMs < 45.0) {
      warnings.push({
        type: 'release',
        title: 'Audible Pumping',
        desc: `Release is too fast (${params.releaseMs.toFixed(0)}ms). Volume swells up unnaturally between hits.`,
        severity: 'warn'
      });
    } else if (params.releaseMs > 500.0 && (stem.category === 'drums' || stem.category === 'kick' || stem.category === 'snare')) {
      warnings.push({
        type: 'release',
        title: 'Release Lag',
        desc: `Slow release (${params.releaseMs.toFixed(0)}ms) fails to recover before the next drum hit arrives.`,
        severity: 'warn'
      });
    }
  }

  // Active warning pill on envelope
  const activeWarning = warnings.find(w => w.severity === 'crit' || w.severity === 'warn') || warnings[0];

  return (
    <div className="bg-studio-950/80 border border-studio-800 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between space-y-3 h-full shadow-inner font-mono">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-studio-800/80 pb-2">
        <div>
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${isInput ? 'bg-cyan-400' : isBypassed ? 'bg-amber-400' : 'bg-studio-accent'} animate-pulse`} />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              {isInput ? 'Input ADSR' : 'Output ADSR'}
            </h3>
          </div>
          <p className="text-[10px] text-slate-400 font-sans">
            {isInput ? 'Pre-Compression Profile' : 'Post-VCA Processed Shape'}
          </p>
        </div>

        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
          isInput
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : isBypassed
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : activeWarning?.severity === 'crit'
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
            : activeWarning?.severity === 'warn'
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
        }`}>
          {isInput ? 'PRE-COMP' : isBypassed ? 'BYPASS' : activeWarning?.severity === 'crit' ? '⚠️ UNNATURAL' : activeWarning?.severity === 'warn' ? '⚠️ CAUTION' : 'OPTIMAL'}
        </span>
      </div>

      {/* 2. ADSR Oscilloscope Graph Container */}
      <div className="relative w-full bg-studio-950 rounded-xl border border-studio-800/90 p-2 overflow-hidden flex items-center justify-center">
        {/* Subtle Background Oscilloscope Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:12px_12px] opacity-40 pointer-events-none" />

        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-28 sm:h-32 overflow-visible select-none"
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
              d={`M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 25} ${inDecayY + 15} ${inReleaseX} ${inReleaseY}`}
              fill="none"
              stroke="#475569"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.6"
            />
          )}

          {/* Filled Envelope Area */}
          <path
            d={
              isInput
                ? `M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 25} ${inDecayY + 15} ${inReleaseX} ${inReleaseY} Z`
                : `M 10 ${baselineY} L ${outAttackX} ${outAttackY} L ${outDecayX} ${outDecayY} L ${outSustainX} ${outSustainY} Q ${outSustainX + 20} ${outDecayY + 15} ${outReleaseX} ${outReleaseY} Z`
            }
            fill={
              isInput
                ? 'url(#inputGradient)'
                : activeWarning?.severity === 'crit'
                ? 'url(#critGradient)'
                : 'url(#outputGradient)'
            }
            opacity="0.25"
          />

          {/* Main ADSR Stroke */}
          <path
            d={
              isInput
                ? `M 10 ${baselineY} L ${inAttackX} ${inAttackY} L ${inDecayX} ${inDecayY} L ${inSustainX} ${inSustainY} Q ${inSustainX + 25} ${inDecayY + 15} ${inReleaseX} ${inReleaseY}`
                : `M 10 ${baselineY} L ${outAttackX} ${outAttackY} L ${outDecayX} ${outDecayY} L ${outSustainX} ${outSustainY} Q ${outSustainX + 20} ${outDecayY + 15} ${outReleaseX} ${outReleaseY}`
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
            strokeWidth="2.5"
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
            cx={isInput ? inAttackX : outAttackX}
            cy={isInput ? inAttackY : outAttackY}
            r="4.5"
            fill="#ffffff"
            stroke={isInput ? '#00f0ff' : activeWarning?.type === 'attack' && activeWarning.severity === 'crit' ? '#f43f5e' : '#10b981'}
            strokeWidth="2"
          />

          {/* Decay Transition Point */}
          <circle
            cx={isInput ? inDecayX : outDecayX}
            cy={isInput ? inDecayY : outDecayY}
            r="3"
            fill={isInput ? '#38bdf8' : '#34d399'}
          />

          {/* Sustain End Point */}
          <circle
            cx={isInput ? inSustainX : outSustainX}
            cy={isInput ? inSustainY : outSustainY}
            r="3.5"
            fill="#ffffff"
            stroke={isInput ? '#00f0ff' : activeWarning?.type === 'sustain' && activeWarning.severity === 'crit' ? '#f43f5e' : '#10b981'}
            strokeWidth="1.5"
          />

          {/* Stage Labels (A, D, S, R) */}
          <text x={isInput ? inAttackX : outAttackX} y={baselineY + 12} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            A
          </text>
          <text x={isInput ? inDecayX - 10 : outDecayX - 10} y={baselineY + 12} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            D
          </text>
          <text x={isInput ? inSustainX - 25 : outSustainX - 25} y={baselineY + 12} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            S
          </text>
          <text x={isInput ? inReleaseX : outReleaseX} y={baselineY + 12} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="bold">
            R
          </text>
        </svg>

        {/* Warning Callout Pill overlaid on Output Graph */}
        {!isInput && activeWarning && isSignal && !isBypassed && (
          <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[9px] font-bold flex items-center space-x-1 shadow-md border ${
            activeWarning.severity === 'crit'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/60 animate-pulse'
              : activeWarning.severity === 'warn'
              ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
              : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
          }`}>
            {activeWarning.severity === 'crit' ? (
              <AlertTriangle className="w-2.5 h-2.5" />
            ) : activeWarning.severity === 'warn' ? (
              <Info className="w-2.5 h-2.5" />
            ) : (
              <CheckCircle className="w-2.5 h-2.5" />
            )}
            <span>{activeWarning.title}</span>
          </div>
        )}
      </div>

      {/* 3. Stage Diagnostics & Metrics Grid */}
      <div className="grid grid-cols-4 gap-1 text-center text-[9px]">
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[8px]">ATTACK</div>
          <div className="text-white font-bold truncate">
            {isInput ? '< 1ms' : `${params.attackMs.toFixed(1)}ms`}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[8px]">DECAY</div>
          <div className="text-white font-bold truncate">
            {isInput ? 'Natural' : gr > 1 ? 'Compressed' : 'Linear'}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[8px]">SUSTAIN</div>
          <div className="text-white font-bold truncate">
            {isInput
              ? isSignal ? `${telemetry.inputRmsL.toFixed(0)} dB` : '--'
              : isSignal ? `${telemetry.outputRmsL.toFixed(0)} dB` : '--'}
          </div>
        </div>
        <div className="p-1 rounded bg-studio-900 border border-studio-800">
          <div className="text-slate-500 text-[8px]">RELEASE</div>
          <div className="text-white font-bold truncate">
            {isInput ? 'Natural' : `${params.releaseMs.toFixed(0)}ms`}
          </div>
        </div>
      </div>

      {/* 4. Acoustic Feedback Footer */}
      <div className="p-2 rounded-xl bg-studio-900/90 border border-studio-800 text-[10px] text-slate-300 font-sans leading-tight">
        {isInput ? (
          <div className="flex items-start space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>
              Raw uncompressed transient snap of <strong>{stem.name}</strong>.
            </span>
          </div>
        ) : (
          <div className="flex items-start space-x-1.5">
            {activeWarning?.severity === 'crit' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
            ) : activeWarning?.severity === 'warn' ? (
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <span className={activeWarning?.severity === 'crit' ? 'text-rose-200' : activeWarning?.severity === 'warn' ? 'text-amber-200' : 'text-emerald-200'}>
              {activeWarning ? activeWarning.desc : 'Dynamic processing within natural musical thresholds.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
