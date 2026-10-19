import React, { useRef, useState, useEffect } from 'react';
import { CompressorParams, CompressorStem, CompressorTelemetry } from '../../types/compressor';
import { Activity, ShieldCheck, Zap, Info, Radio, HelpCircle } from 'lucide-react';

interface CompressorDiagnosticsHUDProps {
  params: CompressorParams;
  stem: CompressorStem;
  telemetry: CompressorTelemetry;
}

interface SmoothedHUDState {
  isSignal: boolean;
  preCrest: number;
  postCrest: number;
  crestDelta: number;
  transientStatus: string;
  transientColor: string;
  transientBorder: string;
  transientNote: string;
  transientBadge: string;

  swing: number;
  releaseStatus: string;
  releaseColor: string;
  releaseBorder: string;
  releaseNote: string;
  releaseBadge: string;

  instantGr: number;
  avgGr: number;
  densityStatus: string;
  densityColor: string;
  densityBorder: string;
  densityNote: string;
  densityBadge: string;
}

export const CompressorDiagnosticsHUD: React.FC<CompressorDiagnosticsHUDProps> = ({
  params,
  stem,
  telemetry
}) => {
  // Show/hide explainer banner for producers
  const [showExplainer, setShowExplainer] = useState(false);

  // Ballistic Smoothing & Peak-Hold Ref
  const stateRef = useRef<SmoothedHUDState>({
    isSignal: false,
    preCrest: 0,
    postCrest: 0,
    crestDelta: 0,
    transientStatus: 'Awaiting Audio',
    transientColor: 'text-slate-500',
    transientBorder: 'border-studio-800',
    transientNote: 'Start audio playback to analyze real-time transients.',
    transientBadge: 'IDLE',

    swing: 0,
    releaseStatus: 'Envelope Resting',
    releaseColor: 'text-slate-500',
    releaseBorder: 'border-studio-800',
    releaseNote: 'No gain modulation detected while audio is silent.',
    releaseBadge: 'REST',

    instantGr: 0,
    avgGr: 0,
    densityStatus: 'Awaiting Audio',
    densityColor: 'text-slate-500',
    densityBorder: 'border-studio-800',
    densityNote: 'Dynamic density computer standing by.',
    densityBadge: 'IDLE'
  });

  const lastTransientHitTime = useRef<number>(0);
  const lastSignalTime = useRef<number>(0);
  const lastPumpingHitTime = useRef<number>(0);

  // Smoothed state for render
  const [smoothed, setSmoothed] = useState<SmoothedHUDState>(stateRef.current);

  useEffect(() => {
    const now = performance.now();
    const s = stateRef.current;
    const isSignalNow = telemetry.isSignalPresent;
    const isBypassed = params.bypassed;
    const rawGr = Math.abs(telemetry.gainReductionDb);
    const rawAvgGr = telemetry.avgGainReductionDb;

    if (isSignalNow) {
      lastSignalTime.current = now;
      s.isSignal = true;
    } else if (now - lastSignalTime.current > 1000) {
      // 1000ms hangover before declaring idle
      s.isSignal = false;
    }

    // -----------------------------------------------------------------
    // 1. TRANSIENT ENVELOPE BALLISTICS (Peak-Hold + 750ms Persistence)
    // -----------------------------------------------------------------
    const rawCrestDelta = telemetry.crestReductionDb;
    const isCompEngaged = rawGr > 0.4;

    if (isCompEngaged && s.isSignal) {
      // Audio is actively compressing: catch peak transient delta
      if (now - lastTransientHitTime.current > 750 || Math.abs(rawCrestDelta) > Math.abs(s.crestDelta)) {
        s.crestDelta = rawCrestDelta;
        s.preCrest = telemetry.inputCrestDb;
        s.postCrest = telemetry.outputCrestDb;
        lastTransientHitTime.current = now;
      } else {
        // Slow gentle ease towards current reading
        s.crestDelta = s.crestDelta * 0.92 + rawCrestDelta * 0.08;
        s.preCrest = s.preCrest * 0.92 + telemetry.inputCrestDb * 0.08;
        s.postCrest = s.postCrest * 0.92 + telemetry.outputCrestDb * 0.08;
      }
    } else {
      // Not compressing right now - only decay hold after 800ms
      if (now - lastTransientHitTime.current > 800) {
        s.crestDelta *= 0.88;
        s.preCrest = s.preCrest * 0.90 + telemetry.inputCrestDb * 0.10;
        s.postCrest = s.postCrest * 0.90 + telemetry.outputCrestDb * 0.10;
      }
    }

    // Determine Transient Status with Hysteresis
    if (!s.isSignal) {
      s.transientStatus = 'Detector Idle';
      s.transientColor = 'text-slate-500';
      s.transientBorder = 'border-studio-800';
      s.transientNote = 'Audio paused or below noise floor. Press Play or upload a file to analyze.';
      s.transientBadge = 'STANDBY';
    } else if (isBypassed) {
      s.transientStatus = 'Bypassed (Bit-Transparent)';
      s.transientColor = 'text-slate-400';
      s.transientBorder = 'border-studio-800';
      s.transientNote = 'Compressor is bypassed. All transient spikes pass through unaltered.';
      s.transientBadge = 'BYPASS';
    } else if (!isCompEngaged && now - lastTransientHitTime.current > 850) {
      s.transientStatus = 'Passing Uncompressed';
      s.transientColor = 'text-slate-300';
      s.transientBorder = 'border-slate-700/40';
      s.transientNote = `Signal peaks are below the ${params.thresholdDb.toFixed(1)} dB threshold. Full dynamic transient punch is untouched.`;
      s.transientBadge = '0 dB GR';
    } else if (s.crestDelta > 2.0) {
      s.transientStatus = 'Transients Clamped / Softened';
      s.transientColor = 'text-amber-400 font-bold';
      s.transientBorder = 'border-amber-500/40';
      s.transientNote = `Fast attack (${params.attackMs.toFixed(1)} ms) catches the initial crack, softening the strike and bringing the body/sustain forward.`;
      s.transientBadge = `-${s.crestDelta.toFixed(1)} dB CLAMP`;
    } else if (s.crestDelta < -0.3 && params.attackMs >= 15.0) {
      s.transientStatus = 'Transient Punch Accentuated!';
      s.transientColor = 'text-emerald-400 font-bold';
      s.transientBorder = 'border-emerald-500/40';
      s.transientNote = `Slow attack (${params.attackMs.toFixed(0)} ms) lets the initial stick/pick strike crack through before clamping the tail, maximizing punch!`;
      s.transientBadge = `+${Math.abs(s.crestDelta).toFixed(1)} dB PUNCH`;
    } else {
      s.transientStatus = 'Natural Transient Snap';
      s.transientColor = 'text-cyan-300 font-bold';
      s.transientBorder = 'border-cyan-500/30';
      s.transientNote = `Balanced attack preserves natural transient crack (${Math.abs(s.crestDelta).toFixed(1)} dB change) with smooth dynamic glue.`;
      s.transientBadge = 'BALANCED';
    }

    // -----------------------------------------------------------------
    // 2. RELEASE & PUMPING BALLISTICS (Exponential Moving Average)
    // -----------------------------------------------------------------
    s.swing = s.swing * 0.88 + telemetry.envelopeSwingDb * 0.12;

    if (!s.isSignal) {
      s.releaseStatus = 'Envelope Resting';
      s.releaseColor = 'text-slate-500';
      s.releaseBorder = 'border-studio-800';
      s.releaseNote = 'No gain modulation detected while audio is silent.';
      s.releaseBadge = 'REST';
    } else if (isBypassed) {
      s.releaseStatus = 'Bypass Active';
      s.releaseColor = 'text-slate-400';
      s.releaseBorder = 'border-studio-800';
      s.releaseNote = 'Release timing circuit is disengaged.';
      s.releaseBadge = 'OFF';
    } else if (!isCompEngaged && now - lastPumpingHitTime.current > 850) {
      s.releaseStatus = 'Resting at Unity (0 dB GR)';
      s.releaseColor = 'text-slate-400';
      s.releaseBorder = 'border-slate-700/40';
      s.releaseNote = 'Envelope follower resting at unity gain.';
      s.releaseBadge = '0 dB GR';
    } else if (s.swing > 2.8 && params.releaseMs < 120.0) {
      lastPumpingHitTime.current = now;
      s.releaseStatus = 'Pumping / Breathing Active!';
      s.releaseColor = 'text-rose-400 font-bold';
      s.releaseBorder = 'border-rose-500/40';
      s.releaseNote = `Fast recovery is causing volume to swing by ${s.swing.toFixed(1)} dB between hits, creating an audible rhythmic pump!`;
      s.releaseBadge = `${s.swing.toFixed(1)} dB SWING`;
    } else if (s.swing < 1.4 && rawAvgGr > 2.0) {
      lastPumpingHitTime.current = now;
      s.releaseStatus = 'Continuous Density / Leveling';
      s.releaseColor = 'text-cyan-400 font-bold';
      s.releaseBorder = 'border-cyan-500/30';
      s.releaseNote = `Release holds steady (${s.swing.toFixed(1)} dB swing). Pinning gain reduction for consistent wall-to-wall thickness.`;
      s.releaseBadge = 'PINNED';
    } else {
      if (isCompEngaged) lastPumpingHitTime.current = now;
      s.releaseStatus = 'Smooth Musical Tracking';
      s.releaseColor = 'text-emerald-400 font-bold';
      s.releaseBorder = 'border-emerald-500/30';
      s.releaseNote = `Envelope recovers smoothly with the natural decay of the sound (${s.swing.toFixed(1)} dB swing).`;
      s.releaseBadge = 'SMOOTH';
    }

    // -----------------------------------------------------------------
    // 3. DENSITY COMPACTION BALLISTICS
    // -----------------------------------------------------------------
    s.instantGr = s.instantGr * 0.85 + rawGr * 0.15;
    s.avgGr = s.avgGr * 0.90 + rawAvgGr * 0.10;

    if (!s.isSignal) {
      s.densityStatus = 'Awaiting Audio';
      s.densityColor = 'text-slate-500';
      s.densityBorder = 'border-studio-800';
      s.densityNote = 'Dynamic density computer standing by.';
      s.densityBadge = 'IDLE';
    } else if (isBypassed) {
      s.densityStatus = 'Direct Pass-Through';
      s.densityColor = 'text-amber-400 font-bold';
      s.densityBorder = 'border-amber-500/30';
      s.densityNote = 'Bypass active. Output is bit-identical to incoming signal.';
      s.densityBadge = 'BYPASS';
    } else if (!isCompEngaged) {
      s.densityStatus = 'Below Threshold (Linear)';
      s.densityColor = 'text-slate-400';
      s.densityBorder = 'border-slate-700/40';
      s.densityNote = `Input audio remains below ${params.thresholdDb.toFixed(1)} dB threshold. No dynamic compaction applied.`;
      s.densityBadge = 'LINEAR';
    } else if (s.avgGr > 7.0) {
      s.densityStatus = 'Aggressive Dynamic Squash';
      s.densityColor = 'text-rose-400 font-bold';
      s.densityBorder = 'border-rose-500/40';
      s.densityNote = `Heavy gain reduction (-${s.instantGr.toFixed(1)} dB) heavily compacts dynamic range, pulling up background room details.`;
      s.densityBadge = `-${s.instantGr.toFixed(1)} dB GR`;
    } else if (s.avgGr >= 1.8 && s.avgGr <= 6.0) {
      s.densityStatus = 'Analog Sweet Spot (Glue)';
      s.densityColor = 'text-emerald-400 font-bold';
      s.densityBorder = 'border-emerald-500/40';
      s.densityNote = `Optimal 2–6 dB reduction zone. Delivers classic analog cohesion and body without choking the life out of the audio.`;
      s.densityBadge = `-${s.avgGr.toFixed(1)} dB AVG`;
    } else {
      s.densityStatus = 'Gentle Dynamic Touch (< 2 dB)';
      s.densityColor = 'text-cyan-400 font-bold';
      s.densityBorder = 'border-cyan-500/30';
      s.densityNote = `Transparent peak taming. Leveling occasional bursts while retaining original recording dynamics.`;
      s.densityBadge = `-${s.avgGr.toFixed(1)} dB AVG`;
    }

    // Push smoothed copy to state for render
    setSmoothed({ ...s });
  }, [telemetry, params.bypassed, params.attackMs, params.releaseMs, params.thresholdDb, params.ratio]);

  return (
    <div className="bg-studio-950/90 border border-studio-800 rounded-2xl p-4 space-y-3.5 shadow-xl font-mono text-xs">
      {/* Header with Live Status Indicator and Info Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-studio-800/80 pb-2.5 gap-2">
        <div className="flex items-center space-x-2 text-studio-accent font-bold">
          <Activity className="w-4 h-4 animate-pulse" />
          <span className="tracking-wider uppercase">Live Acoustic Diagnostic HUD</span>
          <button
            type="button"
            onClick={() => setShowExplainer(!showExplainer)}
            className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer font-sans"
            title="What does this mean?"
          >
            <HelpCircle className="w-3 h-3" />
            <span>How to Read This</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 text-[11px] text-slate-400">
          <div className="flex items-center space-x-1.5">
            <Radio className={`w-3 h-3 ${smoothed.isSignal ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
            <span>{smoothed.isSignal ? 'Signal Active' : 'Signal Idle'}</span>
          </div>
          <span>•</span>
          <span>
            Stem: <strong className="text-white">{stem.name}</strong>
          </span>
        </div>
      </div>

      {/* Explainer Banner (Toggleable) */}
      {showExplainer && (
        <div className="p-3 rounded-xl bg-studio-900 border border-cyan-500/40 text-[11px] text-slate-200 space-y-2 font-sans animate-fade-in">
          <div className="font-bold text-cyan-300 font-mono text-xs uppercase flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>Understanding The Envelope: Initial Hit vs Sustain Body</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Every instrument note has two key stages:
            <br />
            <strong>1. The Transient (Initial Crack/Snap):</strong> The first 5–25 milliseconds (e.g. the drumstick striking the skin or a guitar pick clicking).
            <br />
            <strong>2. The Body & Sustain:</strong> The tone and resonance that rings out afterwards.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
            <div className="p-2 rounded bg-studio-950 border border-studio-800">
              <span className="text-amber-400 font-bold">Fast Attack (&lt; 5 ms):</span> Clamps down on the initial crack. Result: Softens the strike, making the sound smoother and pulling the sustain closer.
            </div>
            <div className="p-2 rounded bg-studio-950 border border-studio-800">
              <span className="text-emerald-400 font-bold">Slow Attack (&gt; 20 ms):</span> Lets the initial crack pass untouched before clamping the ring. Result: Emphasizes the snap, making drums feel punchier!
            </div>
          </div>
        </div>
      )}

      {/* 3 Ballistically Smoothed Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* 1. Transient Attack & Snap Impact */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${smoothed.transientBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>TRANSIENT PUNCH & SNAP</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-cyan-300">
              {smoothed.transientBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs font-black ${smoothed.transientColor}`}>{smoothed.transientStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{smoothed.transientNote}</p>
          </div>

          {/* Ballistically smoothed telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Raw Snap</div>
              <div className="text-white font-bold">{smoothed.isSignal ? `${smoothed.preCrest.toFixed(1)} dB` : '--'}</div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">After Comp</div>
              <div className="text-white font-bold">{smoothed.isSignal ? `${smoothed.postCrest.toFixed(1)} dB` : '--'}</div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Impact Change</div>
              <div className={smoothed.crestDelta > 1.5 ? 'text-amber-400 font-bold' : smoothed.crestDelta < -0.3 ? 'text-emerald-400 font-bold' : 'text-slate-300 font-bold'}>
                {smoothed.isSignal ? `${smoothed.crestDelta > 0 ? '-' : '+'}${Math.abs(smoothed.crestDelta).toFixed(1)} dB` : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Release & Pumping Envelope Recovery */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${smoothed.releaseBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              <span>RELEASE & PUMPING</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-amber-300">
              {smoothed.releaseBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs font-black ${smoothed.releaseColor}`}>{smoothed.releaseStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{smoothed.releaseNote}</p>
          </div>

          {/* Ballistically smoothed telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Vol. Swing</div>
              <div className={smoothed.swing > 2.8 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
                {smoothed.isSignal ? `${smoothed.swing.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Dial Setting</div>
              <div className="text-white font-bold">{params.releaseMs.toFixed(0)} ms</div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Feel</div>
              <div className="text-slate-300 font-bold">
                {smoothed.isSignal ? (smoothed.swing > 2.8 ? 'Pumping' : smoothed.swing < 1.4 ? 'Steady' : 'Natural') : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Dynamic Range & Density Compaction */}
        <div className={`p-3 bg-studio-900/90 rounded-xl border ${smoothed.densityBorder} space-y-2 transition-all`}>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>DENSITY COMPACTION</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-[9px] font-mono font-bold text-emerald-300">
              {smoothed.densityBadge}
            </span>
          </div>

          <div>
            <div className={`text-xs ${smoothed.densityColor}`}>{smoothed.densityStatus}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">{smoothed.densityNote}</p>
          </div>

          {/* Ballistically smoothed telemetry readouts */}
          <div className="pt-2 border-t border-studio-800/60 grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Inst. GR</div>
              <div className="text-white font-bold">
                {smoothed.isSignal ? `-${smoothed.instantGr.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">300ms Avg</div>
              <div className="text-emerald-400 font-bold">
                {smoothed.isSignal ? `${smoothed.avgGr.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="bg-studio-950/80 p-1.5 rounded border border-studio-800/80">
              <div className="text-slate-500 text-[8px] uppercase">Ratio</div>
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
