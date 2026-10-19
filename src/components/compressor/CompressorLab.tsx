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
import { CompressorDiagnosticsHUD } from './CompressorDiagnosticsHUD';
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
  Activity
} from 'lucide-react';

export const CompressorLab: React.FC = () => {
  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStem, setSelectedStem] = useState<CompressorStem>(COMPRESSOR_STEMS[0]);
  const [displayMode, setDisplayMode] = useState<CompressorDisplayMode>('vu');
  const [params, setParams] = useState<CompressorParams>({
    ...DEFAULT_COMPRESSOR_PARAMS,
    ...COMPRESSOR_STEMS[0].suggestedParams
  });
  const [customFileName, setCustomFileName] = useState<string | null>(null);

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
    masterGain.gain.value = 0.85;
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
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-md">
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
            
            {/* Left Column: Input ADSR Envelope (Before Compression) */}
            <div className="lg:col-span-3 flex flex-col h-full">
              <AdsrEnvelopeCard
                mode="input"
                params={params}
                stem={selectedStem}
                telemetry={telemetry}
              />
            </div>

            {/* Center Column: Tri-Mode VU Display Screen & Mode Tabs */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-3 bg-studio-950/40 p-2 sm:p-3 rounded-2xl border border-studio-800/80">
              {/* Display Header Mode Tabs & Bypass */}
              <div className="flex items-start justify-between px-1">
                <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1.5 pt-1">
                  <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
                  <span className="truncate">GAIN REDUCTION</span>
                </span>

                {/* Mode Tabs and Bypass stacked on the right */}
                <div className="flex flex-col items-end gap-1.5">
                  {/* 3-Mode Selector Tabs */}
                  <div className="flex p-0.5 bg-studio-950 rounded-xl border border-studio-800 text-[10px] font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setDisplayMode('vu')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'vu' ? 'bg-amber-500 text-studio-950 shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Gauge className="w-3 h-3" />
                      <span>VU</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('bars')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'bars' ? 'bg-cyan-500 text-studio-950 shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <BarChart2 className="w-3 h-3" />
                      <span>BARS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('wave')}
                      className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        displayMode === 'wave' ? 'bg-studio-accent text-studio-950 shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Activity className="w-3 h-3" />
                      <span>WAVE</span>
                    </button>
                  </div>

                  {/* Bypass Button directly underneath VU / BARS / WAVE options */}
                  <button
                    type="button"
                    onClick={() => updateParam('bypassed', !params.bypassed)}
                    className={`w-full py-0.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center space-x-1.5 transition-all border cursor-pointer ${
                      params.bypassed
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{params.bypassed ? 'BYPASS (ON)' : 'BYPASS'}</span>
                  </button>
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
            <div className="lg:col-span-3 flex flex-col h-full">
              <AdsrEnvelopeCard
                mode="output"
                params={params}
                stem={selectedStem}
                telemetry={telemetry}
              />
            </div>

          </div>

          {/* 4 Precision Rotary Knobs */}
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
              max={20.0}
              step={0.1}
              defaultValue={4.0}
              color="#38bdf8"
              onChange={v => updateParam('ratio', v)}
              formatValue={v => (v >= 20 ? '∞:1' : `${v.toFixed(1)}:1`)}
            />

            <RotaryKnob
              label="Attack"
              value={params.attackMs}
              min={0.1}
              max={100.0}
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
