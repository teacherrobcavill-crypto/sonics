import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Upload, Music, Radio, Disc, Zap, Flame, Sparkles, Activity, Star, X } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';
import { AudioSourceType } from '../types';
import { StudentProfile } from '../utils/studentStorage';

interface AudioTransportProps {
  isMobile?: boolean;
  volume?: number;
  isMuted?: boolean;
  onVolumeChange?: (newVol: number) => void;
  onToggleMute?: () => void;
  currentStudent?: StudentProfile | null;
  onSetDefaultTrack?: (track: AudioSourceType) => void;
  onOpenAuthModal?: () => void;
}

const TRACKS: { id: AudioSourceType; label: string; icon: React.FC<{ className?: string }>; activeColor: string }[] = [
  { id: 'dance_pop', label: 'Dance Pop', icon: Sparkles, activeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { id: 'alt_rock', label: 'Alt Rock', icon: Flame, activeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'electronic_pop', label: 'Electro Pop', icon: Zap, activeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'hard_rock', label: 'Hard Rock', icon: Activity, activeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  { id: 'hip_hop', label: 'Hip-Hop', icon: Disc, activeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'pink_noise', label: 'Pink Noise', icon: Radio, activeColor: 'bg-studio-700 text-white border-studio-600' }
];

export const AudioTransport: React.FC<AudioTransportProps> = ({
  isMobile = false,
  volume: controlledVolume,
  isMuted: controlledIsMuted,
  onVolumeChange,
  onToggleMute,
  currentStudent
}) => {
  const [activeSource, setActiveSource] = useState<AudioSourceType>(() => audioEngine.getCurrentSourceType());
  const [internalVolume, setInternalVolume] = useState(0.75);
  const [internalIsMuted, setInternalIsMuted] = useState(false);
  const [customFileName, setCustomFileName] = useState<string | null>(() => audioEngine.getCustomFileName());
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const volume = controlledVolume !== undefined ? controlledVolume : internalVolume;
  const isMuted = controlledIsMuted !== undefined ? controlledIsMuted : internalIsMuted;

  // Subscribe to AudioEngine state
  useEffect(() => {
    const unsub = audioEngine.subscribeState((_playing, _mode, srcType) => {
      setActiveSource(srcType);
      setCustomFileName(audioEngine.getCustomFileName());
    });
    return unsub;
  }, []);

  // Global Keyboard shortcuts: Space (Play/Pause), 1/A (Flat), 2/B (EQ Target), 3/C (User Match)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        audioEngine.togglePlay();
      } else if (e.key === 'a' || e.key === 'A' || e.key === '1') {
        e.preventDefault();
        audioEngine.setListeningMode('bypass');
      } else if (e.key === 'b' || e.key === 'B' || e.key === '2') {
        e.preventDefault();
        audioEngine.setListeningMode('target');
      } else if (e.key === 'c' || e.key === 'C' || e.key === '3') {
        e.preventDefault();
        audioEngine.setListeningMode('user');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSourceChange = async (source: AudioSourceType) => {
    setActiveSource(source);
    await audioEngine.setAudioSource(source);
  };

  const handleCustomAudioClick = () => {
    // If user has custom audio loaded and is currently on another source, switch back to it
    if (activeSource !== 'custom_file' && audioEngine.hasCustomAudio()) {
      handleSourceChange('custom_file');
    } else {
      // If already on custom audio or no audio loaded yet, trigger file picker
      fileInputRef.current?.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsDecodingAudio(true);
      const name = await audioEngine.loadCustomAudioFile(file);
      setCustomFileName(name);
      setActiveSource('custom_file');
    } catch (err: unknown) {
      console.error("Failed to load audio file", err);
      const msg = err instanceof Error ? err.message : "Failed to decode audio file. Please try a standard MP3 or WAV file.";
      alert(msg);
    } finally {
      setIsDecodingAudio(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleVolumeChange = (newVol: number) => {
    if (onVolumeChange) {
      onVolumeChange(newVol);
    } else {
      setInternalVolume(newVol);
      if (!isMuted) {
        audioEngine.setMasterVolume(newVol);
      }
    }
  };

  const toggleMute = () => {
    if (onToggleMute) {
      onToggleMute();
    } else if (isMuted) {
      audioEngine.setMasterVolume(volume);
      setInternalIsMuted(false);
    } else {
      audioEngine.setMasterVolume(0);
      setInternalIsMuted(true);
    }
  };

  return (
    <div className={`bg-studio-900 border border-studio-800 rounded-2xl ${isMobile ? 'p-1.5' : 'p-2.5 sm:p-3.5'} shadow-xl`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'flex-col md:flex-row items-center justify-between gap-3 sm:gap-4'}`}>
        
        {/* Audio Source Selector (Horizontal scrollable strip on mobile) */}
        <div className={`flex items-center gap-1.5 bg-studio-950/70 p-1.5 rounded-xl border border-studio-800 text-xs font-medium w-full ${isMobile ? 'overflow-x-auto flex-nowrap scrollbar-none' : 'md:w-auto overflow-x-auto scrollbar-none flex-nowrap md:flex-wrap'} justify-start`}>
          {!isMobile && (
            <span className="text-[11px] font-mono text-slate-500 uppercase px-2 hidden sm:inline flex-shrink-0">
              Source:
            </span>
          )}

          {TRACKS.map(track => {
            const Icon = track.icon;
            const isActive = activeSource === track.id;
            const isStudentDefault = Boolean(currentStudent && (currentStudent.defaultTrack || 'dance_pop') === track.id);

            return (
              <button
                key={track.id}
                onClick={() => handleSourceChange(track.id)}
                className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer flex-shrink-0 ${
                  isActive
                    ? `${track.activeColor} font-semibold shadow`
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={isStudentDefault ? `${track.label} (Your default track)` : track.label}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-inherit' : 'text-slate-400'}`} />
                <span>{track.label}</span>
                {isStudentDefault && (
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 ml-0.5 shrink-0" />
                )}
              </button>
            );
          })}

          {/* Custom File Upload Input (Off-screen sr-only so Safari / iOS security allows .click()) */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*,.mp3,.wav,.wave,.ogg,.flac,.m4a,.aac,.aif,.aiff"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <div className="flex items-center flex-shrink-0">
            <button
              type="button"
              onClick={handleCustomAudioClick}
              disabled={isDecodingAudio}
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 border border-dashed flex-shrink-0 cursor-pointer ${
                activeSource === 'custom_file'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-semibold shadow'
                  : 'border-studio-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
              title={
                isDecodingAudio
                  ? "Decoding audio file..."
                  : activeSource === 'custom_file'
                  ? `Active: "${customFileName || 'Custom Track'}" (Click to choose a different file)`
                  : customFileName
                  ? `Switch back to "${customFileName}"`
                  : "Load your own reference track (MP3, WAV, FLAC, OGG)"
              }
            >
              <Upload className={`w-3.5 h-3.5 ${isDecodingAudio ? 'animate-bounce text-cyan-400' : ''}`} />
              <span className="truncate max-w-[120px]">
                {isDecodingAudio ? "Decoding..." : (customFileName || "Load Audio")}
              </span>
            </button>
            {customFileName && (
              <div className="flex items-center ml-0.5 space-x-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-studio-800 transition-colors cursor-pointer"
                  title="Upload a different audio file"
                >
                  <Upload className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await audioEngine.clearCustomAudio();
                    setCustomFileName(null);
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-studio-800 transition-colors cursor-pointer"
                  title="Eject / Clear custom audio"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Master Volume Slider (Desktop Only - moved to top header on Mobile) */}
        {!isMobile && (
          <div className="flex items-center space-x-2 text-slate-400 w-full md:w-auto justify-between md:justify-end px-1 sm:px-0">
            <div className="flex items-center space-x-2 flex-1">
              <button
                onClick={toggleMute}
                className="p-1 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 sm:w-28 h-2 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-studio-accent"
              />
            </div>
            <span className="text-[11px] font-mono text-slate-400 w-9 text-right flex-shrink-0">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        )}

      </div>
    </div>
  );
};
