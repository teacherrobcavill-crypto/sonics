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
  Radio
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
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            
            {/* Section A: Parallel Blender (New York Style) */}
            <div className="md:col-span-4 bg-studio-900/60 border border-studio-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>PARALLEL BLENDER</span>
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
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateParam('mixPercent', 100)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                      params.mixPercent === 50
                        ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 ring-1 ring-cyan-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    50% NY BLEND
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateParam('mixPercent', 0)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
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
                Mixes uncompressed dry signal with compressed signal to preserve natural transients while raising subtle low-level details.
              </div>
            </div>

            {/* Section B: Sidechain HPF (Sub/LF Filter up to 150Hz) & Sweepable Mid Band */}
            <div className="md:col-span-5 bg-studio-900/60 border border-studio-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SIDECHAIN DETECTOR EQ</span>
                </div>
                <span className="text-[10px] text-slate-400">INTERNAL FILTER</span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 items-center justify-items-center">
                
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
                HPF protects sub fundamentals from causing pumping. Mid band focuses compression on harsh frequencies (2-5kHz) or cuts boxiness.
              </div>
            </div>

            {/* Section C: Sidechain Monitor / Audition Switch */}
            <div className="md:col-span-3 bg-studio-900/60 border border-studio-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-studio-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Headphones className="w-3.5 h-3.5 text-amber-400" />
                  <span>AUDITION</span>
                </div>
                <span className="text-[10px] text-amber-400/80 font-bold">MONITOR</span>
              </div>

              {/* Latching Audition Button */}
              <div className="flex flex-col items-center justify-center py-1">
                <button
                  type="button"
                  onClick={() => onUpdateParam('scMonitor', !params.scMonitor)}
                  className={`w-full py-3.5 px-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    params.scMonitor
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/30'
                      : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${params.scMonitor ? 'animate-bounce text-amber-300' : 'text-slate-500'}`} />
                    <span className="text-[11px] font-bold tracking-wide">
                      {params.scMonitor ? 'SC AUDITION ON' : 'MONITOR DETECTOR'}
                    </span>
                  </div>
                  <span className="text-[8.5px] text-slate-400">
                    {params.scMonitor ? 'Listening to Filtered Sidechain' : 'Click to hear detector signal'}
                  </span>
                </button>
              </div>

              <div className="text-[9.5px] text-amber-400/90 leading-tight">
                {params.scMonitor ? (
                  <span className="font-bold">⚠️ Warning: Listening to sidechain filter! Turn off for normal compression.</span>
                ) : (
                  <span>Route the filtered sidechain to audio output to hear exactly what drives the compression.</span>
                )}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
