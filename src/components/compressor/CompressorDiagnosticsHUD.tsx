import React from 'react';
import { CompressorParams, CompressorStem, CompressorTelemetry } from '../../types/compressor';
import { Activity, ShieldCheck, Zap, Info, Radio, AlertTriangle } from 'lucide-react';

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
  const avgGr = telemetry.avgGainReductionDb;
  const isSignal = telemetry.isSignalPresent;
  const isBypassed = params.bypassed;
  const crestDelta = telemetry.crestReductionDb;
  const swing = telemetry.envelopeSwingDb;

  // ----------------------------------------------------
  // 1. REAL-TIME TRANSIENT ATTACK & CREST ENVELOPE DETECTOR
  // ----------------------------------------------------
  let transientStatus = 'Natural Balance';
  let transientColor = 'text-cyan-400';
  let transientBorder = 'border-cyan-500/20';
  let transientNote = 'Balanced transient response with moderate attack time.';
  let transientBadge = 'IN TUNE';

  if (!isSignal) {
    transientStatus = 'Detector Idle';
    transientColor = 'text-slate-500';
    transientBorder = 'border-studio-800';
    transientNote = 'Audio paused or signal below -52 dBFS. Start playback to analyze transients.';
    transientBadge = 'STANDBY';
  } else if (isBypassed) {
    transientStatus = 'Bypassed (Bit-Transparent)';
    transientColor = 'text-slate-400';
    transientBorder = 'border-studio-800';
    transientNote = 'Compressor is bypassed. Transients pass through 100% unaltered.';
    transientBadge = 'BYPASS';
  } else if (gr < 0.3) {
    transientStatus = 'Below Threshold (Intact)';
    transientColor = 'text-slate-300';
    transientBorder = 'border-slate-700/40';
    transientNote = `Peaks remain below ${params.thresholdDb.toFixed(1)} dB threshold. Full dynamic transient crest is passing untouched.`;
    transientBadge = '0 dB GR';
  } else if (crestDelta > 2.2) {
    transientStatus = 'Transient Clamping Active';
    transientColor = 'text-amber-400';
    transientBorder = 'border-amber-500/40';
    transientNote = `Fast attack is squashing initial transient spikes (${crestDelta.toFixed(1)} dB crest attenuation). Softens strike, pushes body/tail forward.`;
    transientBadge = `-${crestDelta.toFixed(1)} dB CREST`;
  } else if (crestDelta < -0.4 && params.attackMs >= 15.0) {
    transientStatus = 'Transient Punch Accentuated!';
    transientColor = 'text-emerald-400';
    transientBorder = 'border-emerald-500/40';
    transientNote = `Slow attack (${params.attackMs.toFixed(0)} ms) lets the transient spike crack through before clamp-down, exaggerating initial attack punch!`;
    transientBadge = `+${Math.abs(crestDelta).toFixed(1)} dB PUNCH`;
  } else {
    transientStatus = 'Natural Transient Dynamics';
    transientColor = 'text-cyan-300';
    transientBorder = 'border-cyan-500/30';
    transientNote = `Crest factor maintained within musical bounds (${Math.abs(crestDelta).toFixed(1)} dB delta). Preserving natural punch and instrument character.`;
    transientBadge = 'TRANSPARENT';
  }

  // ----------------------------------------------------
  // 2. REAL-TIME RELEASE & ENVELOPE MODULATION DETECTOR
  // ----------------------------------------------------
  let releaseStatus = 'Smooth Musical Recovery';
  let releaseColor = 'text-emerald-400';
  let releaseBorder = 'border-emerald-500/20';
  let releaseNote = 'Release envelope smoothly bridges transients without audible breathing.';
  let releaseBadge = 'SMOOTH';

  if (!isSignal) {
    releaseStatus = 'Envelope Resting';
    releaseColor = 'text-slate-500';
    releaseBorder = 'border-studio-800';
    releaseNote = 'No gain modulation detected while audio is silent.';
    releaseBadge = 'REST';
  } else if (isBypassed) {
    releaseStatus = 'Bypass Active';
    releaseColor = 'text-slate-400';
    releaseBorder = 'border-studio-800';
    releaseNote = 'Gain cell is bypassed; release timing circuit is disengaged.';
    releaseBadge = 'OFF';
  } else if (gr < 0.3) {
    releaseStatus = 'Resting at Unity (0 dB GR)';
    releaseColor = 'text-slate-400';
    releaseBorder = 'border-slate-700/40';
    releaseNote = 'Envelope follower is at rest waiting for signal to cross threshold.';
    releaseBadge = '0 dB GR';
  } else if (swing > 3.2 && params.releaseMs < 120.0) {
    releaseStatus = 'Pumping / Breathing Active!';
    releaseColor = 'text-rose-400';
    releaseBorder = 'border-rose-500/40';
    releaseNote = `Fast recovery is causing gain reduction to swing by ${swing.toFixed(1)} dB between beats. Producing an audible pumping groove!`;
    releaseBadge = `${swing.toFixed(1)} dB SWING`;
  } else if (swing < 1.6 && avgGr > 2.5) {
    releaseStatus = 'Continuous Density / Leveling';
    releaseColor = 'text-cyan-400';
    releaseBorder = 'border-cyan-500/30';
    releaseNote = `Release holds steady (${swing.toFixed(1)} dB variance). Pinning the gain reduction for consistent wall-to-wall thickness.`;
    releaseBadge = 'PINNED';
  } else {
    releaseStatus = 'Musical Tempo Tracking';
    releaseColor = 'text-emerald-400';
    releaseBorder = 'border-emerald-500/30';
    releaseNote = `Envelope recovers naturally with the cadence of the stem (${swing.toFixed(1)} dB modulation).`;
    releaseBadge = 'BALANCED';
  }

  // ----------------------------------------------------
  // 3. REAL-TIME DYNAMIC DENSITY & COMPACTION DETECTOR
  // ----------------------------------------------------
  let densityStatus = 'Subtle Optical Leveling';
  let densityColor = 'text-slate-300';
  let densityBorder = 'border-studio-800';
  let densityNote = 'Gentle transparent dynamic control.';
  let densityBadge = `${avgGr.toFixed(1)} dB AVG`;

  if (!isSignal) {
    densityStatus = 'Awaiting Audio';
    densityColor = 'text-slate-500';
    densityBorder = 'border-studio-800';
    densityNote = 'Audio input idle. Dynamic density computer standing by.';
    densityBadge = 'IDLE';
  } else if (isBypassed) {
    densityStatus = 'Direct Pass-Through';
    densityColor = 'text-amber-400';
    densityBorder = 'border-amber-500/30';
    densityNote = 'Bypass switch engaged. Output is bit-identical to incoming signal.';
    densityBadge = 'BYPASS';
  } else if (gr < 0.3) {
    densityStatus = 'Transparent (Below Threshold)';
    densityColor = 'text-slate-400';
    densityBorder = 'border-slate-700/40';
    densityNote = `Input audio level does not exceed ${params.thresholdDb.toFixed(1)} dB. No dynamic compaction applied.`;
    densityBadge = 'LINEAR';
  } else if (avgGr > 7.5) {
    densityStatus = 'Aggressive Dynamic Squash';
    densityColor = 'text-rose-400 font-bold';
    densityBorder = 'border-rose-500/40';
    densityNote = `Heavy gain reduction (-${gr.toFixed(1)} dB) is aggressively leveling dynamic range and amplifying room tails.`;
    densityBadge = `-${gr.toFixed(1)} dB GR`;
  } else if (avgGr >= 2.0 && avgGr <= 6.0) {
    densityStatus = 'Analog Sweet Spot (Glue)';
    densityColor = 'text-emerald-400 font-bold';
    densityBorder = 'border-emerald-500/40';
    densityNote = `Optimal 2–6 dB reduction zone. Delivers classic analog cohesion and body without over-choking the audio.`;
    densityBadge = `-${avgGr.toFixed(1)} dB AVG`;
  } else {
    densityStatus = 'Gentle Dynamic Touch (< 2 dB)';
    densityColor = 'text-cyan-400';
    densityBorder = 'border-cyan-500/30';
    densityNote = `Transparent peak taming. Leveling occasional bursts while retaining original recording dynamics.`;
    densityBadge = `-${avgGr.toFixed(1)} dB AVG`;
  }

  return (
    <div className="bg-studio-950/90 border border-studio-800 rounded-2xl p-4 space-y-3.5 shadow-xl font-mono text-xs">
      {/* Header with Live Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-studio-800/80 pb-2.5 gap-2">
        <div className="flex items-center space-x-2 text-studio-accent font-bold">
          <Activity className="w-4 h-4 animate-pulse" />
          <span className="tracking-wider uppercase">Real-Time Acoustic Diagnostic HUD</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] bg-studio-900 border border-studio-750 text-slate-300 font-normal">
            Pre vs Post Detector
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[11px] text-slate-400">
          <div className="flex items-center space-x-1.5">
            <Radio className={`w-3 h-3 ${isSignal ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
            <span>{isSignal ? 'Signal Active' : 'Signal Idle'}</span>
          </div>
          <span>•</span>
          <span>
            Stem: <strong className="text-white">{stem.name}</strong>
          </span>
        </div>
      </div>

      {/* 3 Real-Time Envelope Detector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* 1. Transient Attack & Crest Detector */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${transientBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>TRANSIENT ENVELOPE</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-cyan-300">
              {transientBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs font-black ${transientColor}`}>{transientStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{transientNote}</p>
          </div>

          {/* Real-time telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Pre-Crest</div>
              <div className="text-white font-bold">{isSignal ? `${telemetry.inputCrestDb.toFixed(1)} dB` : '--'}</div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Post-Crest</div>
              <div className="text-white font-bold">{isSignal ? `${telemetry.outputCrestDb.toFixed(1)} dB` : '--'}</div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Δ Attack</div>
              <div className={crestDelta > 1.5 ? 'text-amber-400 font-bold' : crestDelta < -0.4 ? 'text-emerald-400 font-bold' : 'text-slate-300 font-bold'}>
                {isSignal ? `${crestDelta > 0 ? '-' : '+'}${Math.abs(crestDelta).toFixed(1)} dB` : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Release & Pumping Modulation Detector */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${releaseBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              <span>RELEASE & PUMPING</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-amber-300">
              {releaseBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs font-black ${releaseColor}`}>{releaseStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{releaseNote}</p>
          </div>

          {/* Real-time telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Modulation</div>
              <div className={swing > 3.0 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
                {isSignal ? `${swing.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Dial Setting</div>
              <div className="text-white font-bold">{params.releaseMs.toFixed(0)} ms</div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Dynamics</div>
              <div className="text-slate-300 font-bold">
                {isSignal ? (swing > 3.0 ? 'Pumping' : swing < 1.5 ? 'Static' : 'Dynamic') : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dynamic Range & Density Compaction */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${densityBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>DENSITY COMPACTION</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-emerald-300">
              {densityBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs ${densityColor}`}>{densityStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{densityNote}</p>
          </div>

          {/* Real-time telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Inst. GR</div>
              <div className="text-white font-bold">
                {isSignal ? `-${gr.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">300ms Avg</div>
              <div className="text-emerald-400 font-bold">
                {isSignal ? `${avgGr.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1 rounded border border-studio-800/80">
              <div className="text-slate-500">Ratio</div>
              <div className="text-white font-bold">
                {params.ratio >= 20 ? '∞:1' : `${params.ratio.toFixed(1)}:1`}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Stem Contextual Diagnostic Tip */}
      <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-200 flex items-start space-x-2">
        <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-cyan-300">Acoustic Guide for {stem.name}:</strong> {stem.tips}
        </div>
      </div>
    </div>
  );
};
