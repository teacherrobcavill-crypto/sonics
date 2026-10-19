import React from 'react';
import { CompressorParams, CompressorStem } from '../../types/compressor';
import { getPresetsForStem, CompressorPreset } from '../../audio/compressorPresets';
import { Bookmark, Sparkles, Check, ArrowRight } from 'lucide-react';

interface CompressorPresetsCardProps {
  stem: CompressorStem;
  currentParams: CompressorParams;
  onApplyPreset: (presetParams: Partial<CompressorParams>, presetId: string) => void;
  activePresetId: string | null;
}

export const CompressorPresetsCard: React.FC<CompressorPresetsCardProps> = ({
  stem,
  currentParams,
  onApplyPreset,
  activePresetId
}) => {
  const presets = getPresetsForStem(stem.category);

  return (
    <div className="bg-studio-950/80 border border-studio-800 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 h-full min-h-[300px] shadow-inner font-mono overflow-hidden">
      
      {/* 1. Header */}
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

      {/* 2. 3 Tailored Preset Buttons */}
      <div className="flex flex-col space-y-2 flex-grow justify-center">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.params, preset.id)}
              className={`w-full p-2.5 rounded-xl text-left transition-all border cursor-pointer relative overflow-hidden group ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-950/70 to-studio-900 border-cyan-400 shadow-md ring-1 ring-cyan-400/50'
                  : 'bg-studio-900/90 border-studio-800/90 hover:border-slate-600 hover:bg-studio-850'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold tracking-tight truncate ${isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                  {preset.name}
                </span>
                
                <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap ml-1 ${
                  isActive
                    ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                    : 'bg-studio-950 text-slate-400 border border-studio-800'
                }`}>
                  {preset.tag}
                </span>
              </div>

              <p className="text-[9.5px] text-slate-400 font-sans line-clamp-1 mt-1 leading-snug">
                {preset.description}
              </p>

              {/* Active checkmark glow */}
              {isActive && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
                  <Check className="w-8 h-8 text-cyan-400" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Helper Footer */}
      <div className="h-11 min-h-[44px] max-h-[44px] p-2 rounded-xl bg-studio-900/90 border border-studio-800 text-[9.5px] text-slate-400 font-sans leading-tight overflow-hidden flex items-center flex-shrink-0">
        <div className="flex items-center space-x-1.5 overflow-hidden w-full">
          <Bookmark className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span className="truncate">
            Click any starting point to apply, then shape with the 4 dials.
          </span>
        </div>
      </div>

    </div>
  );
};
