import React, { useState, useEffect, useRef } from 'react';
import {
  CompressorParams,
  CompressorTelemetry,
  CompressorDisplayMode,
  DEFAULT_COMPRESSOR_PARAMS,
  CompressorStem
} from '../../types/compressor';
import { COMPRESSOR_STEMS, generateProceduralStemAudio } from '../../audio/compressorStems';
import { FeedForwardCompressorNode } from '../../audio/worklets/FeedForwardCompressorNode';
import { VuNeedleMeter } from './VuNeedleMeter';
import { DualBarMeterView } from './DualBarMeterView';
import { WaveformScopeView } from './WaveformScopeView';
import { RotaryKnob } from './RotaryKnob';
import { AdsrEnvelopeCard } from './AdsrEnvelopeCard';
import { CompressorPresetsCard } from './CompressorPresetsCard';
import { CompressorDiagnosticsHUD } from './CompressorDiagnosticsHUD';
import { AdvancedCompressorControls } from './AdvancedCompressorControls';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Power,
  Sliders,
  Upload,
  Gauge,
  BarChart2,
  Activity,
  Sparkles,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Zap
} from 'lucide-react';

export interface CompressorLabProps {
  volume?: number;
  isMuted?: boolean;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
}

export const CompressorLab: React.FC<CompressorLabProps> = ({
  volume: propVolume,
  isMuted: propIsMuted,
  onVolumeChange,
  onToggleMute
}) => {
  // Volume state (controlled by parent App or internal fallback)
  const [internalVolume, setInternalVolume] = useState(0.85);
  const [internalIsMuted, setInternalIsMuted] = useState(false);

  const currentVolume = propVolume !== undefined ? propVolume : internalVolume;
  const isMuted = propIsMuted !== undefined ? propIsMuted : internalIsMuted;

  const handleVolumeChange = (newVol: number) => {
    if (onVolumeChange) {
      onVolumeChange(newVol);
    } else {
      setInternalVolume(newVol);
    }
  };

  const handleToggleMute = () => {
    if (onToggleMute) {
      onToggleMute();
    } else {
      setInternalIsMuted(prev => !prev);
    }
  };

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStem, setSelectedStem] = useState<CompressorStem>(COMPRESSOR_STEMS[0]);
  const [displayMode, setDisplayMode] = useState<CompressorDisplayMode>('vu');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [params, setParams] = useState<CompressorParams>({
    ...DEFAULT_COMPRESSOR_PARAMS,
    ...COMPRESSOR_STEMS[0].suggestedParams
  });
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [isTransientOpen, setIsTransientOpen] = useState(false);

  // Telemetry from AudioWorklet
  const [telemetry, setTelemetry] = useState<CompressorTelemetry>({
    inputPeakL: -60,
    inputPeakR: -60,
    inputRmsL: -60,
    inputRmsR: -60,
    outputPeakL: -60,
    outputPeakR: -60,
    outputRmsL: -60,
    outputRmsR: -60,
    gainReductionDb: 0,
    avgGainReductionDb: 0,
    vuNeedlePosition: 0,
    isSignalPresent: false,
    inputCrestDb: 0,
    outputCrestDb: 0,
    crestReductionDb: 0,
    envelopeSwingDb: 0
  });

  // Audio Context and Nodes references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<FeedForwardCompressorNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Web Audio graph
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = isMuted ? 0 : currentVolume;
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    const comp = new FeedForwardCompressorNode(ctx);
    compressorRef.current = comp;

    comp.initialize().then(() => {
      comp.setParameters(params);
      const compOut = comp.getOutputNode();
      if (compOut) {
        compOut.connect(masterGain);
      }
      comp.onTelemetry((t) => {
        setTelemetry(t);
      });
    });

    // Generate initial stem buffer
    const buf = generateProceduralStemAudio(ctx, selectedStem.id);
    currentBufferRef.current = buf;

    return () => {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch {}
      }
      ctx.close();
    };
  }, []);

  // Sync volume & mute changes to master gain
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = isMuted ? 0 : currentVolume;
      masterGainRef.current.gain.setValueAtTime(targetGain, audioCtxRef.current.currentTime);
    }
  }, [currentVolume, isMuted]);

  // Sync parameters to AudioWorklet
  useEffect(() => {
    if (compressorRef.current) {
      compressorRef.current.setParameters(params);
    }
  }, [params]);

  // Handle Play / Pause
  const handleTogglePlay = async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (isPlaying) {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch {}
        sourceNodeRef.current = null;
      }
      setIsPlaying(false);
    } else {
      startPlayback();
    }
  };

  const startPlayback = () => {
    const ctx = audioCtxRef.current;
    const comp = compressorRef.current;
    if (!ctx || !comp || !currentBufferRef.current) return;

    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
    }

    const source = ctx.createBufferSource();
    source.buffer = currentBufferRef.current;
    source.loop = true;

    const compIn = comp.getInputNode();
    if (compIn) {
      source.connect(compIn);
    }

    source.start(0);
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  // Switch Stems
  const handleSelectStem = (stem: CompressorStem) => {
    setSelectedStem(stem);
    setActivePresetId(null);
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const buf = generateProceduralStemAudio(ctx, stem.id);
    currentBufferRef.current = buf;

    if (stem.suggestedParams) {
      setParams(prev => ({
        ...prev,
        ...stem.suggestedParams
      }));
    }

    if (isPlaying) {
      startPlayback();
    }
  };

  const handleApplyPreset = (presetParams: Partial<CompressorParams>, presetId: string) => {
    setActivePresetId(presetId);
    setParams(prev => ({
      ...prev,
      ...presetParams
    }));
  };

  // Handle Custom Audio File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ctx = audioCtxRef.current;
    if (!file || !ctx) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const copy = arrayBuffer.slice(0);
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        let settled = false;
        try {
          const promise = ctx.decodeAudioData(
            copy,
            (buf) => { if (!settled) { settled = true; resolve(buf); } },
            (err) => { if (!settled) { settled = true; reject(err); } }
          );
          if (promise && typeof promise.then === 'function') {
            promise.then(
              (buf) => { if (!settled) { settled = true; resolve(buf); } },
              (err) => { if (!settled) { settled = true; reject(err); } }
            );
          }
        } catch (err) {
          if (!settled) { settled = true; reject(err); }
        }
      });
      currentBufferRef.current = audioBuffer;
      setCustomFileName(file.name);

      const customStem: CompressorStem = {
        id: 'custom',
        name: `Custom: ${file.name.slice(0, 20)}`,
        category: 'custom',
        description: `Custom user audio: ${file.name}`,
        tips: 'Audition compression curves across your own reference recordings.',
        suggestedParams: {}
      };

      setSelectedStem(customStem);
      if (isPlaying) {
        startPlayback();
      }
    } catch (err) {
      alert('Failed to decode audio file. Please try a standard MP3 or WAV.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleRestart = () => {
    if (isPlaying) {
      startPlayback();
    }
  };

  const updateParam = (key: keyof CompressorParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans text-slate-100 animate-fade-in">
      {/* 1. Hardware Rack Console Top Header */}
      <div className="bg-studio-900 border border-studio-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-md flex-shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black text-white tracking-tight uppercase">
                Sonics Compressor Lab
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Feed-Forward VCA
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Live VST3 DSP port with ANSI C16.5 ballistics & real-time acoustic diagnostics.
            </p>
          </div>
        </div>

        {/* Master Output Volume Control on the Right */}
        <div className="flex items-center space-x-3 bg-studio-950/80 px-3.5 py-2 rounded-2xl border border-studio-800 shadow-inner w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-studio-900 transition-colors cursor-pointer flex-shrink-0"
              title={isMuted ? 'Unmute Master Volume' : 'Mute Master Volume'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-cyan-400" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : currentVolume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-28 sm:w-36 h-2 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              title={`Master Volume: ${Math.round((isMuted ? 0 : currentVolume) * 100)}%`}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-300 min-w-[38px] text-right">
            {Math.round((isMuted ? 0 : currentVolume) * 100)}%
          </span>
        </div>
      </div>

      {/* 2. Stems & Transport Bar */}
      <div className="bg-studio-950 border border-studio-800 rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg">
        {/* Playback Transport */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              isPlaying
                ? 'bg-amber-500 text-studio-950 shadow-amber-500/20'
                : 'bg-studio-accent text-studio-950 shadow-studio-accent/25 hover:brightness-110'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY STEM'}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            title="Restart Loop"
            className="p-2.5 rounded-xl bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850 transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Stem Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none py-1">
          {COMPRESSOR_STEMS.map(stem => {
            const isSelected = selectedStem.id === stem.id;
            return (
              <button
                key={stem.id}
                type="button"
                onClick={() => handleSelectStem(stem)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                    : 'bg-studio-900 border-studio-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {stem.name}
              </button>
            );
          })}

          {/* Upload Custom Audio */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*,.mp3,.wav,.wave,.ogg,.flac,.m4a,.aac,.aif,.aiff"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap bg-studio-900 border border-studio-800 text-amber-300 hover:text-amber-200 hover:border-amber-400/50 flex items-center space-x-1 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{customFileName ? customFileName.slice(0, 14) : 'Upload File'}</span>
          </button>
        </div>
      </div>

      {/* 3. Main Hardware Outboard Console Panel */}
      <div className="bg-studio-900 border-2 border-studio-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative">
        {/* Subtle rack screws */}
        <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center text-[9px] font-mono text-slate-400">+</div>
        <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center text-[9px] font-mono text-slate-400">+</div>
        <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center text-[9px] font-mono text-slate-400">+</div>
        <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center text-[9px] font-mono text-slate-400">+</div>

        {/* Main Hardware Console Grid: Left ADSR (Input), Center (VU/Bars/Wave), Right ADSR (Output) */}
        <div className="flex flex-col space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            
            {/* Left Column: Tailored Starting Point Presets (Double Column, Compact) */}
            <div className="lg:col-span-3 flex flex-col h-full">
              <CompressorPresetsCard
                stem={selectedStem}
                currentParams={params}
                onApplyPreset={handleApplyPreset}
                activePresetId={activePresetId}
              />
            </div>

            {/* Center Column: Focused VU Needle Meter, Tabs & Bypass (Spacious & 100% Viewable) */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-3 bg-studio-950/40 p-2.5 sm:p-3 rounded-2xl border border-studio-800/80">
              {/* Display Header Mode Tabs & Controls */}
              <div className="flex flex-col gap-2 pb-2.5 border-b border-studio-800/80">
                {/* Top Row: Title & SC Audition Indicator */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
                    <span>GAIN REDUCTION</span>
                  </span>

                  {params.scMonitor && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/25 border border-amber-400 text-amber-300 animate-pulse">
                      SC AUDITION ACTIVE
                    </span>
                  )}
                </div>

                {/* Controls Row: Mode Selector Tabs and Action Buttons */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-1">
                  {/* 3-Mode Selector Tabs */}
                  <div className="flex p-0.5 bg-studio-950 rounded-xl border border-studio-800 text-[10px] font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setDisplayMode('vu')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'vu' ? 'bg-amber-500 text-studio-950 shadow-sm font-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Gauge className="w-3 h-3" />
                      <span>VU</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('bars')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'bars' ? 'bg-cyan-500 text-studio-950 shadow-sm font-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <BarChart2 className="w-3 h-3" />
                      <span>BARS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('wave')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'wave' ? 'bg-studio-accent text-studio-950 shadow-sm font-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Activity className="w-3 h-3" />
                      <span>WAVE</span>
                    </button>
                  </div>

                  {/* Dual Action Buttons: Auto-Level & Bypass */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateParam('autoGain', !params.autoGain)}
                      className={`py-1 px-2.5 rounded-lg text-[9.5px] font-mono font-bold flex items-center justify-center space-x-1 transition-all border cursor-pointer ${
                        params.autoGain
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                          : 'bg-studio-950 border-studio-800 text-slate-500 hover:text-slate-300'
                      }`}
                      title="Smooth automatic makeup gain to maintain output level after compression"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>{params.autoGain ? 'AUTO LVL' : 'MANUAL'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateParam('bypassed', !params.bypassed)}
                      className={`py-1 px-2.5 rounded-lg text-[9.5px] font-mono font-bold flex items-center justify-center space-x-1 transition-all border cursor-pointer ${
                        params.bypassed
                          ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                          : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <Power className="w-2.5 h-2.5" />
                      <span>{params.bypassed ? 'BYPASSED' : 'BYPASS'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tri-Mode Display Screen */}
              <div className="h-48 sm:h-56 w-full flex items-center justify-center">
                {displayMode === 'vu' && (
                  <VuNeedleMeter
                    needlePosition={telemetry.vuNeedlePosition}
                    isBypassed={params.bypassed}
                  />
                )}
                {displayMode === 'bars' && (
                  <DualBarMeterView
                    telemetry={telemetry}
                    isBypassed={params.bypassed}
                  />
                )}
                {displayMode === 'wave' && (
                  <WaveformScopeView
                    telemetry={telemetry}
                    isBypassed={params.bypassed}
                  />
                )}
              </div>
            </div>

            {/* Right Column: Output ADSR Envelope (Post Compression with Real-Time Warnings) */}
            <div className="lg:col-span-4 flex flex-col h-full">
              <AdsrEnvelopeCard
                mode="output"
                params={params}
                stem={selectedStem}
                telemetry={telemetry}
              />
            </div>

          </div>

          {/* Main 4 Precision Rotary Knobs with Embedded Center Transient Designer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 pt-4 pb-1 border-t border-studio-800/80 justify-items-center">
            <RotaryKnob
              label="Threshold"
              value={params.thresholdDb}
              min={-60}
              max={0}
              step={0.5}
              defaultValue={-18}
              unit=" dB"
              color="#00f0ff"
              onChange={v => updateParam('thresholdDb', v)}
            />

            <RotaryKnob
              label="Ratio"
              value={params.ratio}
              min={1.0}
              max={100.0}
              isRatioCurve
              defaultValue={4.0}
              color={params.negativeRatio ? "#c084fc" : "#38bdf8"}
              onChange={v => updateParam('ratio', v)}
              formatValue={v => {
                if (params.negativeRatio) {
                  return `-${v.toFixed(1)}:1 Inv`;
                }
                return v >= 50 ? '∞:1 Limit' : `${v.toFixed(1)}:1`;
              }}
            />

            <RotaryKnob
              label="Attack"
              value={params.attackMs}
              min={0.1}
              max={200.0}
              step={0.1}
              isLogarithmic
              defaultValue={10.0}
              color="#fbbf24"
              onChange={v => updateParam('attackMs', v)}
              formatValue={v => (v < 1.0 ? `${v.toFixed(1)} ms` : `${v.toFixed(0)} ms`)}
            />

            <RotaryKnob
              label="Release"
              value={params.releaseMs}
              min={10.0}
              max={1000.0}
              step={1.0}
              isLogarithmic
              defaultValue={100.0}
              color="#f59e0b"
              onChange={v => updateParam('releaseMs', v)}
              formatValue={v => `${v.toFixed(0)} ms`}
            />
          </div>

          {/* Transient Designer Dropdown (Closed by default per user request) */}
          <div className="w-full mt-4 pt-3 border-t border-studio-800/80 font-mono">
            <button
              type="button"
              onClick={() => setIsTransientOpen(!isTransientOpen)}
              className={`w-full py-2.5 px-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group ${
                isTransientOpen
                  ? 'bg-studio-950 border-rose-500/50 shadow-md ring-1 ring-rose-500/30'
                  : 'bg-studio-950/60 border-studio-800 hover:border-slate-700 hover:bg-studio-950/90'
              }`}
            >
              {/* Left: Title & Badges */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 transition-colors ${
                    isTransientOpen ? 'text-rose-400' : 'text-slate-400 group-hover:text-rose-400'
                  }`} />
                  <span className="text-xs font-bold text-white tracking-wider uppercase">
                    Transient Designer
                  </span>
                </div>

                {/* Status Pills */}
                <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
                  <span className={`px-2 py-0.5 rounded-md border font-bold ${
                    Math.abs(params.transientAttack || 0) > 0
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-studio-900 text-slate-500 border-studio-800'
                  }`}>
                    TRANSIENT: {(params.transientAttack || 0) > 0 ? '+' : ''}{(params.transientAttack || 0).toFixed(0)}%
                  </span>

                  <span className={`px-2 py-0.5 rounded-md border font-bold ${
                    Math.abs(params.transientSustain || 0) > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-studio-900 text-slate-500 border-studio-800'
                  }`}>
                    SUSTAIN: {(params.transientSustain || 0) > 0 ? '+' : ''}{(params.transientSustain || 0).toFixed(0)}%
                  </span>

                  <span className={`px-2 py-0.5 rounded-md border font-bold ${
                    params.transientRouting === 'pre'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  }`}>
                    ROUTING: {(params.transientRouting || 'post').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Right: Toggle Chevron */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">
                  {isTransientOpen ? 'HIDE' : 'REVEAL'}
                </span>
                {isTransientOpen ? (
                  <ChevronUp className="w-4 h-4 text-rose-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white" />
                )}
              </div>
            </button>

            {/* Revealed Transient Designer Panel */}
            {isTransientOpen && (
              <div className="mt-3 p-4 sm:p-5 rounded-2xl bg-studio-950/80 border border-studio-800/90 shadow-2xl space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-studio-800/80 pb-2.5 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Envelope Shaper
                    </span>
                    <span className="text-[10px] text-slate-400">
                      (Level-independent attack crack & sustain body control)
                    </span>
                  </div>

                  {/* PRE / POST Routing Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Routing:
                    </span>
                    <button
                      type="button"
                      onClick={() => updateParam('transientRouting', params.transientRouting === 'pre' ? 'post' : 'pre')}
                      className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold uppercase transition-all border cursor-pointer flex items-center gap-1.5 ${
                        params.transientRouting === 'pre'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/20'
                      }`}
                      title={`Click to switch between PRE (before compressor) and POST (after compressor). Currently: ${(params.transientRouting || 'post').toUpperCase()}`}
                    >
                      <span className={params.transientRouting === 'pre' ? 'text-amber-300 font-extrabold' : 'text-slate-500'}>PRE-COMP</span>
                      <span className="text-slate-600">/</span>
                      <span className={(params.transientRouting || 'post') === 'post' ? 'text-cyan-300 font-extrabold' : 'text-slate-500'}>POST-COMP</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  {/* Transient Attack Control Card */}
                  <div className="bg-studio-900/60 border border-studio-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="space-y-1.5 pr-2">
                      <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                        <span>TRANSIENT ATTACK</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-tight">
                        Accentuate pick/stick snap or soften harsh strikes (-100% to +100%).
                      </p>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => updateParam('transientAttack', 0)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientAttack || 0) === 0
                              ? 'bg-studio-800 text-white border-slate-600'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          0%
                        </button>
                        <button
                          type="button"
                          onClick={() => updateParam('transientAttack', 25)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientAttack || 0) === 25
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          +25%
                        </button>
                        <button
                          type="button"
                          onClick={() => updateParam('transientAttack', -25)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientAttack || 0) === -25
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          -25%
                        </button>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <RotaryKnob
                        label="Transient"
                        value={params.transientAttack || 0}
                        min={-100}
                        max={100}
                        step={2}
                        defaultValue={0}
                        unit="%"
                        color="#f43f5e"
                        onChange={v => updateParam('transientAttack', v)}
                        formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                      />
                    </div>
                  </div>

                  {/* Sustain Control Card */}
                  <div className="bg-studio-900/60 border border-studio-800 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="space-y-1.5 pr-2">
                      <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <span>SUSTAIN / TAIL</span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-tight">
                        Lengthen room resonance & decay or tighten drum tails (-100% to +100%).
                      </p>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => updateParam('transientSustain', 0)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientSustain || 0) === 0
                              ? 'bg-studio-800 text-white border-slate-600'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          0%
                        </button>
                        <button
                          type="button"
                          onClick={() => updateParam('transientSustain', 30)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientSustain || 0) === 30
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          +30%
                        </button>
                        <button
                          type="button"
                          onClick={() => updateParam('transientSustain', -30)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                            (params.transientSustain || 0) === -30
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          -30%
                        </button>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <RotaryKnob
                        label="Sustain"
                        value={params.transientSustain || 0}
                        min={-100}
                        max={100}
                        step={2}
                        defaultValue={0}
                        unit="%"
                        color="#10b981"
                        onChange={v => updateParam('transientSustain', v)}
                        formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Controls Reveal: Parallel Blender, Sidechain HPF, Sweepable Mid Focus & Monitor */}
          <AdvancedCompressorControls
            params={params}
            onUpdateParam={updateParam}
          />
        </div>
      </div>

      {/* 4. Live Acoustic Diagnostics HUD */}
      <CompressorDiagnosticsHUD
        params={params}
        stem={selectedStem}
        telemetry={telemetry}
      />
    </div>
  );
};
