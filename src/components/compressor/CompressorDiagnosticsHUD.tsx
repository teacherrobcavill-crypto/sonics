import React from 'react';
import { CompressorParams, CompressorStem, CompressorTelemetry } from '../../types/compressor';
import { Activity, ShieldCheck, Zap, Info } from 'lucide-react';

interface CompressorDiagnosticsHUDProps {
  params: CompressorParams;
  stem: CompressorStem;
  telemetry: CompressorTelemetry;
}

export const CompressorDiagnosticsHUD: React.FC<CompressorDiagnosticsHUDProps> = ({
  params,
  stem,
  telemetry
}) => {
  const gr = Math.abs(telemetry.gainReductionDb);

  // Transient Analysis
  let transientStatus = 'Natural Balance';
  let transientColor = 'text-cyan-400';
  let transientNote = 'Balanced transient response with moderate attack time.';

  if (params.attackMs < 3.0) {
    transientStatus = 'Heavy Transient Clamping';
    transientColor = 'text-amber-400';
    transientNote = 'Ultra-fast attack is clamping the initial transient impact, softening the strike and emphasizing body/decay.';
  } else if (params.attackMs > 25.0) {
    transientStatus = 'Maximum Punch Preserved';
    transientColor = 'text-emerald-400';
    transientNote = 'Slow attack lets the full uncompressed transient crack through before compression engages, maximizing punch!';
  }

  // Pumping / Release Analysis
  let releaseStatus = 'Smooth Musical Recovery';
  let releaseColor = 'text-emerald-400';
  let releaseNote = 'Release envelope smoothly bridges transients without audible breathing.';

  if (params.releaseMs < 45.0 && gr > 3.0) {
    releaseStatus = 'Pumping / Breathing Active';
    releaseColor = 'text-rose-400';
    releaseNote = 'Fast release opens up rapidly between hits, causing an audible volume pump/breathing effect.';
  } else if (params.releaseMs > 400.0) {
    releaseStatus = 'Continuous Density / Leveling';
    releaseColor = 'text-cyan-400';
    releaseNote = 'Long release holds the compressor clamped across multiple beats, creating consistent wall-to-wall density.';
  }

  // Dynamic Range / GR Analysis
  let grStatus = 'Subtle Optical Leveling';
  let grColor = 'text-slate-300';

  if (gr > 10.0) {
    grStatus = 'Heavy Compression (>10 dB GR)';
    grColor = 'text-rose-400 font-bold';
  } else if (gr >= 2.0 && gr <= 6.0) {
    grStatus = 'Sweet Spot (2–6 dB GR)';
    grColor = 'text-emerald-400 font-bold';
  } else if (gr < 1.0) {
    grStatus = 'Transparent / Minimal Reduction';
    grColor = 'text-slate-400';
  }

  return (
    <div className="bg-studio-950/90 border border-studio-800 rounded-2xl p-4 space-y-3.5 shadow-xl font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-800/80 pb-2">
        <div className="flex items-center space-x-2 text-studio-accent font-bold">
          <Activity className="w-4 h-4" />
          <span className="tracking-wider uppercase">Live Acoustic Diagnostic HUD</span>
        </div>
        <span className="text-[11px] text-slate-400">
          Source: <strong className="text-white">{stem.name}</strong>
        </span>
      </div>

      {/* 3 Metric Diagnostics Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Transient Punch */}
        <div className="p-3 bg-studio-900/80 rounded-xl border border-studio-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>TRANSIENT ATTACK</span>
            </span>
            <span className="text-white">{params.attackMs.toFixed(1)} ms</span>
          </div>
          <div className={`text-xs font-black ${transientColor}`}>{transientStatus}</div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{transientNote}</p>
        </div>

        {/* 2. Pumping / Release Recovery */}
        <div className="p-3 bg-studio-900/80 rounded-xl border border-studio-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              <span>RELEASE ENVELOPE</span>
            </span>
            <span className="text-white">{params.releaseMs.toFixed(0)} ms</span>
          </div>
          <div className={`text-xs font-black ${releaseColor}`}>{releaseStatus}</div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{releaseNote}</p>
        </div>

        {/* 3. Gain Reduction & Density */}
        <div className="p-3 bg-studio-900/80 rounded-xl border border-studio-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>DYNAMIC DENSITY</span>
            </span>
            <span className="text-white">Ratio {params.ratio >= 50 ? '∞:1' : `${params.ratio.toFixed(1)}:1`}</span>
          </div>
          <div className={`text-xs ${grColor}`}>{grStatus}</div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
            Current reduction: <strong className="text-white">-{gr.toFixed(1)} dB</strong> (300ms avg: {telemetry.avgGainReductionDb.toFixed(1)} dB)
          </p>
        </div>
      </div>

      {/* Stem Pro-Tip Footer */}
      <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-200 flex items-start space-x-2">
        <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300">Pro-Tip for {stem.name}:</strong> {stem.tips}
        </div>
      </div>
    </div>
  );
};
