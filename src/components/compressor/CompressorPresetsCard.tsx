import React from 'react';
import { CompressorParams, CompressorStem } from '../../types/compressor';
import { getPresetsForStem } from '../../audio/compressorPresets';
import { Sparkles, Sliders, ChevronDown } from 'lucide-react';

interface CompressorPresetsCardProps {
  stem: CompressorStem;
  currentParams: CompressorParams;
  onApplyPreset: (presetParams: Partial<CompressorParams>, presetId: string) => void;
  activePresetId: string | null;
}

export const CompressorPresetsCard: React.FC<CompressorPresetsCardProps> = ({
  stem,
  onApplyPreset,
  activePresetId
}) => {
  const presets = getPresetsForStem(stem.category);
  const activePreset = presets.find((p) => p.id === activePresetId);

  return (
    <div className="bg-studio-950/80 border border-studio-800 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between space-y-3 h-full min-h-[300px] shadow-inner font-mono overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-800/80 pb-2 h-9 min-h-[36px] max-h-[36px] flex-shrink-0">
        <div className="overflow-hidden">
          <div className="flex items-center space-x-1.5 truncate">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white truncate">
              Starting Points
            </h3>
          </div>
          <p className="text-[9px] text-slate-400 font-sans truncate">
            Tailored for {stem.name}
          </p>
        </div>

        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex-shrink-0">
          {stem.category.toUpperCase()}
        </span>
      </div>

      {/* Dropdown Menu Area */}
      <div className="flex-grow flex flex-col justify-center space-y-3 py-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Select Preset Profile</span>
            <span className="text-[9px] text-cyan-400 font-mono">6 PRESETS</span>
          </label>

          <div className="relative">
            <select
              value={activePresetId || ''}
              onChange={(e) => {
                const selectedId = e.target.value;
                const match = presets.find((p) => p.id === selectedId);
                if (match) {
                  onApplyPreset(match.params, match.id);
                }
              }}
              className="w-full appearance-none bg-studio-900 border border-studio-700/80 hover:border-cyan-500/60 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white tracking-wide cursor-pointer outline-none transition-all pr-10 shadow-md"
            >
              <option value="" disabled className="bg-studio-950 text-slate-400">
                -- Choose a Starting Point --
              </option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-studio-950 text-slate-200 py-1">
                  {preset.name}
                </option>
              ))}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-cyan-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Active Preset Spec Sheet Badge */}
        {activePreset ? (
          <div className="p-2.5 rounded-xl bg-studio-900/80 border border-cyan-500/30 text-[10px] space-y-1.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between font-bold text-cyan-300 border-b border-studio-800 pb-1">
              <span className="flex items-center gap-1.5 truncate">
                <Sliders className="w-3 h-3 text-cyan-400" />
                {activePreset.name}
              </span>
              <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300 text-[9.5px]">
              <div>THRESH: <span className="text-white font-bold">{activePreset.params.thresholdDb ?? '-'}dB</span></div>
              <div>RATIO: <span className="text-white font-bold">{activePreset.params.ratio ?? '-'}:1</span></div>
              <div>ATTACK: <span className="text-white font-bold">{activePreset.params.attackMs ?? '-'}ms</span></div>
              <div>RELEASE: <span className="text-white font-bold">{activePreset.params.releaseMs ?? '-'}ms</span></div>
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-studio-900/40 border border-studio-800/80 text-[10px] text-slate-400 text-center py-3">
            Pick a preset above or adjust the rotary knobs manually.
          </div>
        )}
      </div>

      {/* Minimal Footer */}
      <div className="h-9 min-h-[36px] max-h-[36px] p-2 rounded-xl bg-studio-900/60 border border-studio-800/80 text-[9.5px] text-slate-400 font-sans leading-tight overflow-hidden flex items-center justify-center text-center flex-shrink-0">
        <span className="truncate">
          Select a preset starting point, then fine-tune with the dials.
        </span>
      </div>

    </div>
  );
};
