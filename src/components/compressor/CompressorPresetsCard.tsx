import React from 'react';
import { CompressorParams, CompressorStem } from '../../types/compressor';
import { getPresetsForStem } from '../../audio/compressorPresets';
import { Sparkles, Check } from 'lucide-react';

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

  return (
    <div className="bg-studio-950/80 border border-studio-800 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 h-full min-h-[300px] shadow-inner font-mono overflow-hidden">
      
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

      {/* 2-Column Preset Title-Only Buttons */}
      <div className="grid grid-cols-2 gap-2 flex-grow content-center">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.params, preset.id)}
              className={`py-2.5 px-2.5 rounded-xl text-left transition-all border cursor-pointer relative overflow-hidden flex items-center justify-between group active:scale-[0.98] ${
                isActive
                  ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-md ring-1 ring-cyan-400/50'
                  : 'bg-studio-900 border-studio-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-studio-850'
              }`}
            >
              <span className="text-[11px] font-bold tracking-tight truncate">
                {preset.name}
              </span>
              
              {isActive && (
                <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 ml-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Minimal Footer */}
      <div className="h-9 min-h-[36px] max-h-[36px] p-2 rounded-xl bg-studio-900/60 border border-studio-800/80 text-[9.5px] text-slate-400 font-sans leading-tight overflow-hidden flex items-center justify-center text-center flex-shrink-0">
        <span className="truncate">
          Select a starting point, then fine-tune with the dials.
        </span>
      </div>

    </div>
  );
};
