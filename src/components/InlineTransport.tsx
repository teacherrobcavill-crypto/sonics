import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { audioEngine, ListeningMode } from '../audio/AudioEngine';

interface InlineTransportProps {
  showUserMatch?: boolean;
  bypassLabel?: string;
  targetLabel?: string;
  userMatchLabel?: string;
  isMobile?: boolean;
}

export const InlineTransport: React.FC<InlineTransportProps> = ({
  showUserMatch = false,
  bypassLabel = '[A] FLAT',
  targetLabel = '[B] EQ ON',
  userMatchLabel = '[C] YOUR EQ',
  isMobile = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<ListeningMode>('target');

  useEffect(() => {
    const unsub = audioEngine.subscribeState((playing, currentMode) => {
      setIsPlaying(playing);
      setMode(currentMode);
    });
    return unsub;
  }, []);

  return (
    <div className={`flex items-center gap-1.5 bg-studio-950/90 p-1.5 rounded-2xl border border-studio-800 shadow-inner ${isMobile ? 'w-full' : 'w-full sm:w-auto sm:space-x-2'}`}>
      {/* Play / Pause Toggle Button */}
      <button
        type="button"
        onClick={() => audioEngine.togglePlay()}
        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all shadow-md active:scale-95 flex-shrink-0 cursor-pointer ${
          isPlaying
            ? 'bg-studio-neonPink text-white shadow-studio-neonPink/25'
            : 'bg-studio-accent text-studio-950 font-bold shadow-studio-accent/25 hover:brightness-110'
        }`}
        title="Play / Pause (Spacebar)"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* [A] FLAT / Bypass */}
      <button
        type="button"
        onClick={() => audioEngine.setListeningMode('bypass')}
        className={`flex-1 ${isMobile ? 'px-2 py-2 text-[11px]' : 'sm:flex-initial px-2 sm:px-3.5 py-2.5 text-[11px] sm:text-xs'} rounded-xl font-mono font-bold transition-all flex items-center justify-center space-x-1 active:scale-95 cursor-pointer min-w-0 ${
          mode === 'bypass'
            ? 'bg-slate-700 text-white shadow-lg shadow-slate-900/50 ring-1 ring-slate-500'
            : 'bg-studio-900/80 text-slate-400 hover:text-slate-200 hover:bg-studio-850'
        }`}
        title="Audition Clean / Flat (Key: 1 or A)"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mode === 'bypass' ? 'bg-white' : 'bg-slate-500'}`}></span>
        <span className="truncate">{bypassLabel}</span>
      </button>

      {/* [B] Target Audio */}
      <button
        type="button"
        onClick={() => audioEngine.setListeningMode('target')}
        className={`flex-1 ${isMobile ? 'px-2 py-2 text-[11px]' : 'sm:flex-initial px-2 sm:px-3.5 py-2.5 text-[11px] sm:text-xs'} rounded-xl font-mono font-bold transition-all flex items-center justify-center space-x-1 active:scale-95 cursor-pointer min-w-0 ${
          mode === 'target'
            ? 'bg-studio-accent text-studio-950 shadow-lg shadow-studio-accent/30 ring-1 ring-studio-accent/50'
            : 'bg-studio-900/80 text-slate-400 hover:text-slate-200 hover:bg-studio-850'
        }`}
        title="Audition Target (Key: 2 or B)"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mode === 'target' ? 'bg-studio-950' : 'bg-studio-accent'}`}></span>
        <span className="truncate">{targetLabel}</span>
      </button>

      {/* [C] Your Match Audio */}
      {showUserMatch && (
        <button
          type="button"
          onClick={() => audioEngine.setListeningMode('user')}
          className={`flex-1 ${isMobile ? 'px-2 py-2 text-[11px]' : 'sm:flex-initial px-2 sm:px-3.5 py-2.5 text-[11px] sm:text-xs'} rounded-xl font-mono font-bold transition-all flex items-center justify-center space-x-1 active:scale-95 cursor-pointer min-w-0 ${
            mode === 'user'
              ? 'bg-amber-400 text-studio-950 shadow-lg shadow-amber-400/30 ring-1 ring-amber-400/50'
              : 'bg-studio-900/80 text-slate-400 hover:text-slate-200 hover:bg-studio-850'
          }`}
          title="Audition Your Guess (Key: 3 or C)"
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mode === 'user' ? 'bg-studio-950' : 'bg-amber-400'}`}></span>
          <span className="truncate">{userMatchLabel}</span>
        </button>
      )}
    </div>
  );
};
