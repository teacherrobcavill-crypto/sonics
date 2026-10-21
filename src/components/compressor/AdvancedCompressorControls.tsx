import React, { useState } from 'react';
import { CompressorParams } from '../../types/compressor';
import { RotaryKnob } from './RotaryKnob';
import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Headphones,
  Filter,
  Layers,
  Activity,
  Radio,
  Zap
} from 'lucide-react';

interface AdvancedCompressorControlsProps {
  params: CompressorParams;
  onUpdateParam: <K extends keyof CompressorParams>(key: K, value: CompressorParams[K]) => void;
}

export const AdvancedCompressorControls: React.FC<AdvancedCompressorControlsProps> = ({
  params,
  onUpdateParam
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full mt-4 pt-3 border-t border-studio-800/80 font-mono">
      {/* 1. Collapsible Reveal Header Bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full py-2.5 px-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group ${
          isOpen
            ? 'bg-studio-950 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
            : 'bg-studio-950/60 border-studio-800 hover:border-slate-700 hover:bg-studio-950/90'
        }`}
      >
        {/* Left: Title & Badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className={`w-4 h-4 transition-colors ${
              isOpen ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'
            }`} />
            <span className="text-xs font-bold text-white tracking-wider uppercase">
              Advanced Controls
            </span>
          </div>

          {/* Quick Status Pill Indicators */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
            {/* Parallel Mix Pill */}
            <span className={`px-2 py-0.5 rounded-md border ${
              params.mixPercent < 99.9
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                : 'bg-studio-900 text-slate-400 border-studio-800'
            }`}>
              MIX: {params.mixPercent.toFixed(0)}%{params.mixPercent === 50 ? ' (NY)' : ''}
            </span>

            {/* HPF Pill */}
            <span className={`px-2 py-0.5 rounded-md border ${
              params.scHpfActive
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                : 'bg-studio-900 text-slate-500 border-studio-800'
            }`}>
              HPF: {params.scHpfActive ? `${params.scHpfHz.toFixed(0)}Hz` : 'OFF'}
            </span>

            {/* Makeup Gain Pill */}
            <span className={`px-2 py-0.5 rounded-md border ${
              Math.abs(params.makeupGainDb || 0) > 0.1
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                : 'bg-studio-900 text-slate-500 border-studio-800'
            }`}>
              MAKEUP: {(params.makeupGainDb || 0) > 0 ? '+' : ''}{(params.makeupGainDb || 0).toFixed(1)}dB
            </span>

            {/* Negative Ratio Pill */}
            {params.negativeRatio && (
              <span className="px-2 py-0.5 rounded-md bg-purple-500/25 text-purple-300 border border-purple-400 font-bold animate-pulse flex items-center gap-1 shadow-[0_0_8px_rgba(192,132,252,0.4)]">
                <Zap className="w-2.5 h-2.5 text-purple-300" />
                NEG: -{params.ratio.toFixed(1)}:1{params.lookaheadMs > 0 ? ` (${params.lookaheadMs.toFixed(1)}ms)` : ''}
              </span>
            )}

            {/* Transient Designer Routing Pill */}
            {(Math.abs(params.transientAttack || 0) > 0 || Math.abs(params.transientSustain || 0) > 0) && (
              <span className={`px-2 py-0.5 rounded-md border font-bold ${
                params.transientRouting === 'pre'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              }`}>
                TD: {params.transientRouting === 'pre' ? 'PRE' : 'POST'}
              </span>
            )}

            {/* Mid Pill */}
            <span className={`px-2 py-0.5 rounded-md border ${
              params.scMidActive && Math.abs(params.scMidGainDb) > 0.05
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold'
                : 'bg-studio-900 text-slate-500 border-studio-800'
            }`}>
              MID: {params.scMidActive
                ? `${params.scMidFreq >= 1000 ? `${(params.scMidFreq / 1000).toFixed(1)}k` : params.scMidFreq.toFixed(0)}Hz (${params.scMidGainDb > 0 ? '+' : ''}${params.scMidGainDb.toFixed(1)}dB)`
                : 'OFF'}
            </span>

            {/* Sidechain Monitor Pill */}
            {params.scMonitor && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold animate-pulse flex items-center gap-1">
                <Radio className="w-2.5 h-2.5" />
                SC LISTEN
              </span>
            )}
          </div>
        </div>

        {/* Right: Toggle Chevron */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">
            {isOpen ? 'HIDE' : 'REVEAL'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-cyan-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white" />
          )}
        </div>
      </button>

      {/* 2. Revealed Advanced Outboard Rack Strip */}
      {isOpen && (
        <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-studio-950/80 border border-studio-800/90 shadow-2xl space-y-5 animate-in fade-in duration-200">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            
            {/* Section A: Parallel Blender (New York Style) */}
            <div className="md:col-span-3 bg-studio-900/60 border border-studio-800 rounded-xl p-3 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>PARALLEL MIX</span>
                </div>
                <span className="text-[10px] text-cyan-400/80 font-bold">NY STYLE</span>
              </div>

              <div className="flex items-center justify-around py-1">
                <RotaryKnob
                  label="Dry / Wet"
                  value={params.mixPercent}
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={100}
                  unit="%"
                  color="#00f0ff"
                  size="sm"
                  onChange={(val) => onUpdateParam('mixPercent', val)}
                  formatValue={(v) => `${v.toFixed(0)}%`}
                />

                {/* Quick Blend Presets */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateParam('mixPercent', 100)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      params.mixPercent === 100
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    100% WET
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('mixPercent', 50)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      params.mixPercent === 50
                        ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 ring-1 ring-cyan-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    50% NY
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('mixPercent', 0)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      params.mixPercent === 0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    0% DRY
                  </button>
                </div>
              </div>

              <div className="text-[9.5px] text-slate-400 leading-tight">
                Blends original input with compression &amp; transient designer wet tone.
              </div>
            </div>

            {/* Section B: Make-Up Gain */}
            <div className="md:col-span-3 bg-studio-900/60 border border-studio-800 rounded-xl p-3 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>MAKE-UP GAIN</span>
                </div>
                <span className="text-[10px] text-amber-400/80 font-bold">MANUAL</span>
              </div>

              <div className="flex items-center justify-around py-1">
                <RotaryKnob
                  label="Make-Up"
                  value={params.makeupGainDb || 0}
                  min={-12}
                  max={24}
                  step={0.5}
                  defaultValue={0}
                  unit="dB"
                  color="#f59e0b"
                  size="sm"
                  onChange={(val) => onUpdateParam('makeupGainDb', val)}
                  formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
                />

                {/* Quick Gain Presets */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onUpdateParam('makeupGainDb', 0)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      (params.makeupGainDb || 0) === 0
                        ? 'bg-amber-500/25 text-amber-300 border-amber-400 ring-1 ring-amber-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    0 dB
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('makeupGainDb', 3)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      (params.makeupGainDb || 0) === 3
                        ? 'bg-amber-500/25 text-amber-300 border-amber-400 ring-1 ring-amber-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    +3 dB
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('makeupGainDb', 6)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                      (params.makeupGainDb || 0) === 6
                        ? 'bg-amber-500/25 text-amber-300 border-amber-400 ring-1 ring-amber-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    +6 dB
                  </button>
                </div>
              </div>

              <div className="text-[9.5px] text-slate-400 leading-tight">
                Post-VCA manual gain boost or cut (-12dB to +24dB).
              </div>
            </div>

            {/* Section C: Negative Ratio (Omnipressor / Invert Dynamics) + Lookahead */}
            <div className="md:col-span-2 bg-studio-900/60 border border-studio-800 rounded-xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between border-b border-studio-800 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>NEG RATIO</span>
                </div>
                <span className={`text-[10px] font-bold ${params.negativeRatio ? 'text-purple-400' : 'text-slate-500'}`}>
                  {params.negativeRatio ? 'INVERT' : 'OFF'}
                </span>
              </div>

              <div className="flex flex-col items-center justify-center space-y-1.5 py-0.5">
                {/* Master Negative Ratio Latching Toggle Button */}
                <button
                  type="button"
                  onClick={() => onUpdateParam('negativeRatio', !params.negativeRatio)}
                  className={`w-full py-1.5 px-2 rounded-xl border text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    params.negativeRatio
                      ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/40 ring-1 ring-purple-300'
                      : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-purple-300 hover:border-purple-500/40'
                  }`}
                  title="Inverts dynamic transfer slope: loud signals drop BELOW threshold (Omnipressor effect)"
                >
                  <Zap className={`w-3.5 h-3.5 ${params.negativeRatio ? 'fill-current text-purple-200' : 'text-purple-400'}`} />
                  <span>{params.negativeRatio ? 'INVERT ON' : 'ENABLE NEG'}</span>
                </button>

                {/* Quick Negative Ratio Target Presets */}
                <div className="grid grid-cols-3 gap-1 w-full">
                  {[
                    { label: '-1:1', val: 1.0 },
                    { label: '-2:1', val: 2.0 },
                    { label: '-4:1', val: 4.0 }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        onUpdateParam('negativeRatio', true);
                        onUpdateParam('ratio', preset.val);
                      }}
                      className={`py-0.5 px-0.5 rounded text-[8.5px] font-bold border transition-all cursor-pointer text-center ${
                        params.negativeRatio && Math.abs(params.ratio - preset.val) < 0.1
                          ? 'bg-purple-500/30 text-purple-200 border-purple-400 ring-1 ring-purple-400'
                          : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                      }`}
                      title={`Set ratio to -${preset.val.toFixed(1)}:1`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Lookahead Function Dial & Presets */}
                <div className="w-full pt-1.5 border-t border-studio-800/80 flex items-center justify-between gap-1">
                  <RotaryKnob
                    label="Lookahead"
                    value={params.lookaheadMs || 0}
                    min={0}
                    max={10}
                    step={0.5}
                    defaultValue={0}
                    unit="ms"
                    color="#c084fc"
                    size="sm"
                    onChange={(val) => onUpdateParam('lookaheadMs', val)}
                    formatValue={(v) => (v === 0 ? '0ms (Off)' : `${v.toFixed(1)}ms`)}
                  />

                  {/* Lookahead Quick Buttons */}
                  <div className="flex flex-col gap-0.5">
                    {[
                      { label: '0ms', val: 0 },
                      { label: '2ms', val: 2 },
                      { label: '5ms', val: 5 }
                    ].map(btn => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => onUpdateParam('lookaheadMs', btn.val)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                          (params.lookaheadMs || 0) === btn.val
                            ? 'bg-purple-500/30 text-purple-200 border-purple-400'
                            : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-[9px] text-slate-400 leading-tight">
                {params.lookaheadMs > 0 ? (
                  <span className="text-purple-300 font-semibold">Pre-clamps transients {params.lookaheadMs.toFixed(1)}ms early.</span>
                ) : (
                  <span>Lookahead buffers audio to clamp onset peaks.</span>
                )}
              </div>
            </div>

            {/* Section D: Sidechain HPF & Sweepable Mid Band */}
            <div className="md:col-span-3 bg-studio-900/60 border border-studio-800 rounded-xl p-3 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SIDECHAIN EQ</span>
                </div>
                <span className="text-[10px] text-slate-400">DETECTOR</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 py-1 items-center justify-items-center">
                
                {/* 1. HPF Filter (up to 150 Hz) */}
                <div className="flex flex-col items-center space-y-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => onUpdateParam('scHpfActive', !params.scHpfActive)}
                    className={`w-full py-1 px-1 rounded-lg text-[9px] font-bold border text-center transition-all cursor-pointer ${
                      params.scHpfActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-studio-950 border-studio-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {params.scHpfActive ? 'HPF ON' : 'HPF OFF'}
                  </button>
                  <RotaryKnob
                    label="SC HPF"
                    value={params.scHpfHz}
                    min={20}
                    max={150}
                    step={1}
                    defaultValue={80}
                    unit="Hz"
                    color="#10b981"
                    size="sm"
                    onChange={(val) => onUpdateParam('scHpfHz', val)}
                    formatValue={(v) => `${v.toFixed(0)}Hz`}
                  />
                </div>

                {/* 2. Sweepable Mid Band Frequency (200Hz - 8000Hz) */}
                <div className="flex flex-col items-center space-y-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => onUpdateParam('scMidActive', !params.scMidActive)}
                    className={`w-full py-1 px-1 rounded-lg text-[9px] font-bold border text-center transition-all cursor-pointer ${
                      params.scMidActive
                        ? 'bg-purple-500/20 text-purple-300 border-purple-400 ring-1 ring-purple-400'
                        : 'bg-studio-950 border-studio-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {params.scMidActive ? 'MID ON' : 'MID OFF'}
                  </button>
                  <RotaryKnob
                    label="Mid Freq"
                    value={params.scMidFreq}
                    min={200}
                    max={8000}
                    step={10}
                    defaultValue={2500}
                    isLogarithmic
                    unit="Hz"
                    color="#a855f7"
                    size="sm"
                    onChange={(val) => onUpdateParam('scMidFreq', val)}
                    formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${v.toFixed(0)}Hz`)}
                  />
                </div>

                {/* 3. Sweepable Mid Band Gain (-12dB to +12dB) */}
                <div className="flex flex-col items-center space-y-1.5 w-full">
                  <span className="text-[9px] text-slate-500 font-bold py-1">GAIN</span>
                  <RotaryKnob
                    label="Mid Gain"
                    value={params.scMidGainDb}
                    min={-12}
                    max={12}
                    step={0.5}
                    defaultValue={0}
                    unit="dB"
                    color="#ec4899"
                    size="sm"
                    onChange={(val) => onUpdateParam('scMidGainDb', val)}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
                  />
                </div>

              </div>

              <div className="text-[9.5px] text-slate-400 leading-tight">
                HPF protects bass. Mid focuses harshness.
              </div>
            </div>

            {/* Section E: Sidechain Monitor / Audition Switch */}
            <div className="md:col-span-1 bg-studio-900/60 border border-studio-800 rounded-xl p-2.5 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between border-b border-studio-800 pb-1.5">
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-200">
                  <Headphones className="w-3 h-3 text-amber-400" />
                  <span>SC</span>
                </div>
              </div>

              {/* Latching Audition Button */}
              <div className="flex flex-col items-center justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateParam('scMonitor', !params.scMonitor)}
                  className={`w-full py-2.5 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    params.scMonitor
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/30'
                      : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                  title="Route sidechain detector filter path to output for listening"
                >
                  <Activity className={`w-3.5 h-3.5 ${params.scMonitor ? 'animate-bounce text-amber-300' : 'text-slate-500'}`} />
                  <span className="text-[9px] font-bold tracking-tight text-center leading-none">
                    {params.scMonitor ? 'ON' : 'LISTEN'}
                  </span>
                </button>
              </div>

              <div className="text-[8.5px] text-amber-400/90 leading-tight text-center">
                {params.scMonitor ? 'Auditioning' : 'Monitor'}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
