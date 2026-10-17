import React, { useState, useEffect, useCallback } from 'react';
import { Sliders, Activity, Info, RotateCcw, Plus, Trash2, Eye, EyeOff, Sparkles, ChevronDown } from 'lucide-react';
import { FilterParams, FilterType, BAND_COLORS } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumDisplay } from '../SpectrumDisplay';
import { InlineTransport } from '../InlineTransport';
import { formatFrequency, formatGain } from '../../utils/frequencies';

interface SandboxBand extends FilterParams {
  id: string;
  enabled: boolean;
}

interface SandboxEQProps {
  isMobile?: boolean;
}

const MAX_POINTS = 6;
const MIN_POINTS = 1;

const EQ_TYPES: Array<{
  type: FilterType;
  label: string;
  shortLabel: string;
  mobileLabel: string;
  badge: string;
  description: string;
}> = [
  {
    type: 'highpass',
    label: 'HPF',
    shortLabel: 'HPF',
    mobileLabel: 'HPF',
    badge: 'High-Pass',
    description: 'High-Pass Filter (Low Cut): attenuates rumble below cutoff frequency'
  },
  {
    type: 'lowshelf',
    label: 'Low Freq Shelving',
    shortLabel: 'Low Shelf',
    mobileLabel: 'L-Shelf',
    badge: 'Low Shelf',
    description: 'Low Frequency Shelving: boosts or cuts all low frequencies below cutoff'
  },
  {
    type: 'peaking',
    label: 'Parametric',
    shortLabel: 'Parametric',
    mobileLabel: 'Bell',
    badge: 'Bell',
    description: 'Parametric Bell: resonant boost or cut at targeted frequency with variable Q'
  },
  {
    type: 'highshelf',
    label: 'High Freq Shelving',
    shortLabel: 'High Shelf',
    mobileLabel: 'H-Shelf',
    badge: 'High Shelf',
    description: 'High Frequency Shelving: boosts or cuts all high frequencies above cutoff'
  },
  {
    type: 'lowpass',
    label: 'LPF',
    shortLabel: 'LPF',
    mobileLabel: 'LPF',
    badge: 'Low-Pass',
    description: 'Low-Pass Filter (High Cut): attenuates harsh treble & air above cutoff frequency'
  }
];

const ShapeIcon: React.FC<{ type: FilterType; className?: string }> = ({ type, className = 'w-5 h-3.5' }) => {
  switch (type) {
    case 'highpass':
      return (
        <svg viewBox="0 0 24 16" className={`${className} fill-none stroke-current stroke-2`}>
          <path d="M2 14 Q 8 14 12 5 L 22 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'lowshelf':
      return (
        <svg viewBox="0 0 24 16" className={`${className} fill-none stroke-current stroke-2`}>
          <path d="M2 4 L 7 4 Q 11 4 13 12 L 22 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'peaking':
      return (
        <svg viewBox="0 0 24 16" className={`${className} fill-none stroke-current stroke-2`}>
          <path d="M2 12 L 7 12 Q 12 2 17 12 L 22 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'highshelf':
      return (
        <svg viewBox="0 0 24 16" className={`${className} fill-none stroke-current stroke-2`}>
          <path d="M2 12 L 11 12 Q 13 4 17 4 L 22 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'lowpass':
      return (
        <svg viewBox="0 0 24 16" className={`${className} fill-none stroke-current stroke-2`}>
          <path d="M2 5 L 12 5 Q 16 14 22 14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
};

const createDefaultBands = (): SandboxBand[] => [
  { id: 'band-1', type: 'highpass', frequency: 20, gain: 0, q: 0.707, slope: 18, enabled: true },
  { id: 'band-2', type: 'peaking', frequency: 500, gain: 0, q: 1.0, slope: 12, enabled: true },
  { id: 'band-3', type: 'peaking', frequency: 3000, gain: 0, q: 1.0, slope: 12, enabled: true },
  { id: 'band-4', type: 'lowpass', frequency: 20000, gain: 0, q: 0.707, slope: 18, enabled: true }
];

const DEFAULT_BANDS: SandboxBand[] = createDefaultBands();

export const SandboxEQ: React.FC<SandboxEQProps> = ({ isMobile = false }) => {
  const [bands, setBands] = useState<SandboxBand[]>(createDefaultBands());
  const [activeBandIndex, setActiveBandIndex] = useState<number>(1);

  // Sync active audio filters to Web Audio engine whenever bands change
  const syncAudio = useCallback((currentBands: SandboxBand[]) => {
    const activeFilters: FilterParams[] = currentBands
      .filter(b => b.enabled)
      .map(({ id, enabled, ...filterParams }) => filterParams);

    // If all bands bypassed, send a dummy flat filter so sound continues clean
    if (activeFilters.length === 0) {
      audioEngine.setTargetFilter({ type: 'peaking', frequency: 1000, gain: 0, q: 1.0 });
      audioEngine.setUserFilter({ type: 'peaking', frequency: 1000, gain: 0, q: 1.0 });
    } else {
      audioEngine.setTargetFilter(activeFilters);
      audioEngine.setUserFilter(activeFilters);
    }
    audioEngine.setListeningMode('target');
  }, []);

  // Sync on initial mount
  useEffect(() => {
    syncAudio(bands);
  }, [syncAudio]);

  // Update a single band by index
  const updateBand = (index: number, changes: Partial<SandboxBand>) => {
    setBands(prev => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...changes };
      syncAudio(next);
      return next;
    });
  };

  // Change the EQ type of any existing node (HPF, LPF, High/Low Shelving, Parametric)
  const handleChangeType = (index: number, newType: FilterType) => {
    setBands(prev => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;

      let newGain = current.gain;
      let newSlope = current.slope || 18;
      let newQ = current.q;

      if (newType === 'highpass' || newType === 'lowpass') {
        newGain = 0; // Cutoff filter
        if (!newSlope || newSlope < 12) newSlope = 18;
      } else if (current.type === 'highpass' || current.type === 'lowpass') {
        // Switching to shelf or parametric: give a nice audible default boost if gain was 0
        if (newGain === 0) newGain = 4.0;
        newQ = newType === 'peaking' ? 1.41 : 0.707;
      }

      next[index] = {
        ...current,
        type: newType,
        gain: newGain,
        slope: newSlope,
        q: newQ
      };

      syncAudio(next);
      return next;
    });
  };

  // Add new band
  const handleAddBand = (freq?: number, gain?: number, initialType: FilterType = 'peaking') => {
    if (bands.length >= MAX_POINTS) return;

    // Pick a sensible frequency if not provided
    const defaultFreqs = [100, 350, 1000, 3000, 8000, 14000];
    const newFreq = freq ?? defaultFreqs[bands.length % defaultFreqs.length];
    const newGain = gain ?? (initialType === 'highpass' || initialType === 'lowpass' ? 0 : 3.0);

    const newBand: SandboxBand = {
      id: `band-${Date.now()}-${Math.random()}`,
      type: initialType,
      frequency: Math.max(20, Math.min(20000, Math.round(newFreq))),
      gain: Math.max(-18, Math.min(18, Math.round(newGain * 2) / 2)),
      q: initialType === 'peaking' ? 1.41 : 0.707,
      slope: 18,
      enabled: true
    };

    const nextBands = [...bands, newBand];
    setBands(nextBands);
    setActiveBandIndex(nextBands.length - 1);
    syncAudio(nextBands);
  };

  // Remove a band by index
  const handleRemoveBand = (indexToRemove: number) => {
    if (bands.length <= MIN_POINTS) return;
    const nextBands = bands.filter((_, idx) => idx !== indexToRemove);
    setBands(nextBands);
    const nextActive = Math.min(activeBandIndex, nextBands.length - 1);
    setActiveBandIndex(Math.max(0, nextActive));
    syncAudio(nextBands);
  };

  // Toggle enable/bypass for a band
  const toggleBandBypass = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateBand(index, { enabled: !bands[index].enabled });
  };

  // Reset all active bands flat: zero out boost/cut (gain) while preserving existing nodes, types, frequencies, and Q values
  const handleResetFlat = () => {
    const flatBands: SandboxBand[] = bands.map(b => ({
      ...b,
      gain: 0,
      enabled: true
    }));
    setBands(flatBands);
    syncAudio(flatBands);
  };

  // Restore factory default 4-band setup: HPF @ 20Hz, 2x Mid Parametric (500Hz & 3000Hz), and LPF @ 20kHz
  const handleResetDefault = () => {
    const defaultSetup = createDefaultBands();
    setBands(defaultSetup);
    setActiveBandIndex(1);
    syncAudio(defaultSetup);
  };

  const activeBand = bands[activeBandIndex] || bands[0];
  const activeColor = BAND_COLORS[activeBandIndex % BAND_COLORS.length];
  const isCutFilter = activeBand.type === 'highpass' || activeBand.type === 'lowpass';
  const isShelfFilter = activeBand.type === 'lowshelf' || activeBand.type === 'highshelf';
  const currentShape = EQ_TYPES.find(s => s.type === activeBand.type) || EQ_TYPES[2];

  return (
    <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
      {/* Header */}
      <div className={`flex ${isMobile ? 'flex-col items-stretch gap-3 p-3.5' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl`}>
        <div>
          <div className="flex items-center space-x-2">
            <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white flex items-center gap-2`}>
              EQ Laboratory & Sandbox
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-studio-accent/20 text-studio-accent border border-studio-accent/30">
              {bands.length} / {MAX_POINTS} Points
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Multi-point studio equalizer. Click & drag nodes on the spectrum, scroll to change bandwidth (Q) or slope, and switch any node between <strong>HPF, LPF, Shelving, or Parametric</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetFlat}
            className={`flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl border border-studio-700 bg-studio-950 text-slate-300 hover:text-white text-xs font-mono cursor-pointer transition-colors ${isMobile ? 'flex-1' : ''}`}
            title="Zero out all boosts & cuts while retaining EQ node types, positions, and Q bandwidth"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Flat</span>
          </button>
          <button
            onClick={handleResetDefault}
            className={`flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl border border-studio-700 bg-studio-950 text-slate-300 hover:text-white text-xs font-mono cursor-pointer transition-colors ${isMobile ? 'flex-1' : ''}`}
            title="Restore default 4-band setup (HPF 20Hz, 2x Mid Parametric, LPF 20kHz)"
          >
            <span>Preset 4-Band</span>
          </button>
        </div>
      </div>

      {/* Visual Spectrum Display (Interactive with Multi-Point Handles & Live Parameter Badges) */}
      <SpectrumDisplay
        userFilter={bands.map(b => b.enabled ? b : { ...b, gain: 0, slope: 0 })}
        interactive={true}
        showNodeParameters={true}
        showLegend={false}
        activeNodeIndex={activeBandIndex}
        onActiveNodeChange={setActiveBandIndex}
        onFilterNodeChange={(idx, params) => updateBand(idx, params)}
        onAddNode={(freq, gain) => handleAddBand(freq, gain)}
        height={isMobile ? 240 : 340}
      />

      {/* Play controls directly underneath the EQ graph */}
      <div className="bg-studio-900 border border-studio-800 p-2.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3">
        <InlineTransport isMobile={isMobile} targetLabel="[B] EQ ON" bypassLabel="[A] FLAT" />
        {!isMobile && (
          <div className="text-xs font-mono text-slate-400 flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-studio-accent animate-pulse" />
              <span>Click dot & drag on spectrum</span>
            </span>
            <span className="text-slate-600">•</span>
            <span>Mousewheel: Bandwidth Q / Slope</span>
            <span className="text-slate-600">•</span>
            <span>Double-click canvas to drop new point</span>
          </div>
        )}
      </div>

      {/* PROMINENT QUICK SHAPE SELECTOR FOR THE ACTIVE NODE (HPF, LPF, High/Low Shelving, Parametric) */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-2' : 'p-3.5'} rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl`}>
        {/* On desktop: show the active node feedback header. On mobile: removed to give maximum space for the shapes */}
        {!isMobile && (
          <div className="flex items-center space-x-2.5 shrink-0">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-studio-950 shrink-0 shadow-md"
              style={{ backgroundColor: activeColor }}
            >
              {activeBandIndex + 1}
            </span>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-white">
                  Change EQ Type (Node {activeBandIndex + 1}):
                </span>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-studio-950 border border-studio-700"
                  style={{ color: activeColor }}
                >
                  Current: {currentShape.label}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {formatFrequency(activeBand.frequency)} • {isCutFilter ? `${activeBand.slope || 18} dB/oct` : formatGain(activeBand.gain)} • Q: {activeBand.q.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* 5 Prominent EQ Shape Buttons: spread out across the full container */}
        <div className={`grid grid-cols-5 ${isMobile ? 'gap-1.5 w-full p-1' : 'gap-1.5 md:flex md:items-center'} bg-studio-950/80 rounded-xl border border-studio-800/80`}>
          {EQ_TYPES.map(shape => {
            const isActive = activeBand.type === shape.type;
            return (
              <button
                key={shape.type}
                type="button"
                onClick={() => handleChangeType(activeBandIndex, shape.type)}
                className={`${isMobile ? 'py-2.5 px-1 min-h-[52px]' : 'px-3 py-2 min-h-[46px]'} rounded-xl text-xs font-mono font-bold transition-all flex flex-col items-center justify-center cursor-pointer border ${
                  isActive
                    ? 'bg-studio-900 border-current shadow-lg ring-1'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-studio-850'
                }`}
                style={{
                  borderColor: isActive ? activeColor : undefined,
                  boxShadow: isActive ? `0 0 12px ${activeColor}40` : undefined,
                  color: isActive ? activeColor : undefined
                }}
                title={shape.description}
              >
                <div className={`${isMobile ? 'mb-1.5' : 'mb-1'} opacity-90`}>
                  <ShapeIcon type={shape.type} className={isMobile ? 'w-6 h-4' : 'w-5 h-3.5'} />
                </div>
                <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} font-mono font-bold leading-tight tracking-tight`}>
                  {isMobile ? shape.mobileLabel : shape.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* EQ Band Strip (Tabs 1 to 6 with + Add Point button) */}
      <div className="bg-studio-900 border border-studio-800 p-3 rounded-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-studio-800 pb-2">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-studio-accent" />
            <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              EQ Points ({bands.length}/{MAX_POINTS})
            </span>
          </div>

          <button
            onClick={() => handleAddBand()}
            disabled={bands.length >= MAX_POINTS}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              bands.length >= MAX_POINTS
                ? 'bg-studio-950 text-slate-600 border border-studio-800 cursor-not-allowed opacity-50'
                : 'bg-studio-accent text-studio-950 hover:brightness-110 shadow-md shadow-studio-accent/20'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isMobile ? 'Add Point' : 'Add EQ Point (Max 6)'}</span>
          </button>
        </div>

        {/* Scrollable / Wrap Band Selector Pills: horizontal swipe on mobile, wrap on desktop */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar flex-nowrap md:flex-wrap">
          {bands.map((band, idx) => {
            const color = BAND_COLORS[idx % BAND_COLORS.length];
            const isSelected = activeBandIndex === idx;
            const shapeObj = EQ_TYPES.find(s => s.type === band.type) || EQ_TYPES[2];

            return (
              <div
                key={band.id}
                onClick={() => setActiveBandIndex(idx)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer border select-none shrink-0 ${
                  isSelected
                    ? 'bg-studio-950 shadow-lg ring-1'
                    : 'bg-studio-950/60 hover:bg-studio-950 text-slate-400'
                } ${!band.enabled ? 'opacity-40 line-through' : ''}`}
                style={{
                  borderColor: isSelected ? color : 'rgba(255, 255, 255, 0.1)',
                  boxShadow: isSelected ? `0 0 12px ${color}33` : undefined
                }}
              >
                {/* Band Number Dot */}
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 text-studio-950"
                  style={{ backgroundColor: color }}
                >
                  {idx + 1}
                </span>

                {/* Shape & Frequency Readout */}
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1">
                    <span className="font-bold text-white text-[11px]">{shapeObj.shortLabel}</span>
                    <span className="text-slate-400 text-[10px]">{formatFrequency(band.frequency)}</span>
                  </div>
                  <span className="text-[10px]" style={{ color }}>
                    {band.type === 'highpass' || band.type === 'lowpass'
                      ? `${band.slope || 18} dB/oct`
                      : formatGain(band.gain)}
                  </span>
                </div>

                {/* Mute/Bypass button */}
                <button
                  type="button"
                  onClick={(e) => toggleBandBypass(idx, e)}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  title={band.enabled ? 'Bypass this band' : 'Enable this band'}
                >
                  {band.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
                </button>

                {/* Remove button (if > 1 point) */}
                {bands.length > MIN_POINTS && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBand(idx);
                    }}
                    className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete this EQ point"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Point Detailed Controls (Sliders for Frequency, Gain, Q / Slope) */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3.5 space-y-4' : 'p-5 space-y-6'} rounded-2xl shadow-xl`}>
        {/* Active Band Title Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-studio-800 gap-2">
          <div className="flex items-center space-x-2 shrink-0">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] text-studio-950"
              style={{ backgroundColor: activeColor }}
            >
              {activeBandIndex + 1}
            </span>
            <span className="text-xs md:text-sm font-mono font-bold text-white truncate max-w-[160px] md:max-w-none">
              {isMobile ? `Point ${activeBandIndex + 1} (${currentShape.shortLabel})` : `Fine-Tune EQ Point ${activeBandIndex + 1} (${currentShape.label})`}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => toggleBandBypass(activeBandIndex)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-mono transition-colors border ${
                activeBand.enabled
                  ? 'bg-studio-950 text-slate-300 border-studio-700 hover:text-white'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
            >
              {activeBand.enabled ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              <span>{activeBand.enabled ? 'Active' : 'Bypassed'}</span>
            </button>

            {bands.length > MIN_POINTS && (
              <button
                onClick={() => handleRemoveBand(activeBandIndex)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                title="Delete active point"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Knobs / Sliders */}
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-3 gap-6'}`}>
          {/* Frequency */}
          <div className="space-y-2 bg-studio-950/50 p-3 rounded-xl border border-studio-800/80">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Frequency:</span>
              <span className="text-white font-bold">{formatFrequency(activeBand.frequency)}</span>
            </div>
            <input
              type="range"
              min="20"
              max="20000"
              step="1"
              value={activeBand.frequency}
              onChange={e => updateBand(activeBandIndex, { frequency: parseFloat(e.target.value) })}
              className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-studio-accent"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>20 Hz</span>
              <span>1 kHz</span>
              <span>20 kHz</span>
            </div>
          </div>

          {/* Gain (only if not HPF/LPF) */}
          <div className="space-y-2 bg-studio-950/50 p-3 rounded-xl border border-studio-800/80">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Gain (+/- dB):</span>
              <span className={`font-bold ${
                isCutFilter
                  ? 'text-slate-500'
                  : activeBand.gain > 0
                  ? 'text-emerald-400'
                  : activeBand.gain < 0
                  ? 'text-red-400'
                  : 'text-slate-400'
              }`}>
                {isCutFilter ? 'Cutoff (-3 dB)' : formatGain(activeBand.gain)}
              </span>
            </div>
            <input
              type="range"
              min="-18"
              max="18"
              step="0.5"
              value={activeBand.gain}
              disabled={isCutFilter}
              onChange={e => updateBand(activeBandIndex, { gain: parseFloat(e.target.value) })}
              className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-studio-accent disabled:opacity-30"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>-18 dB</span>
              <span>0 dB</span>
              <span>+18 dB</span>
            </div>
          </div>

          {/* Q Factor (Bandwidth) or Slope (dB/oct) */}
          <div className="space-y-2 bg-studio-950/50 p-3 rounded-xl border border-studio-800/80">
            {isCutFilter ? (
              <>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Filter Slope:</span>
                  <span className="text-white font-bold">{activeBand.slope || 18} dB/oct</span>
                </div>
                <div className="grid grid-cols-6 gap-1 pt-1">
                  {[6, 12, 18, 24, 36, 48].map(s => (
                    <button
                      key={s}
                      onClick={() => updateBand(activeBandIndex, { slope: s })}
                      className={`py-1 rounded-lg text-xs font-mono transition-colors ${
                        (activeBand.slope || 18) === s
                          ? 'bg-studio-accent text-studio-950 font-bold shadow-sm'
                          : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s} dB
                    </button>
                  ))}
                </div>
              </>
            ) : isShelfFilter ? (
              <>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Q (Shelf Slope Gradient):</span>
                  <span className="text-white font-bold">
                    {activeBand.q.toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({activeBand.q < 0.6 ? 'Shallow' : activeBand.q > 1.0 ? 'Steep' : 'Natural'})
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="3.0"
                  step="0.05"
                  value={activeBand.q}
                  onChange={e => updateBand(activeBandIndex, { q: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-studio-accent"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>Shallow (0.30)</span>
                  <span>Natural (0.71)</span>
                  <span>Steep (3.00)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Q (Bandwidth / Resonance):</span>
                  <span className="text-white font-bold">{activeBand.q.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="10.0"
                  step="0.05"
                  value={activeBand.q}
                  onChange={e => updateBand(activeBandIndex, { q: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-studio-accent"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>Wide (0.3)</span>
                  <span>1.41</span>
                  <span>Narrow (10.0)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pro Ear Training Tip Box */}
        <div className="bg-studio-950/70 border border-studio-800 p-3.5 rounded-xl flex items-start space-x-3 text-xs text-slate-400">
          <Info className="w-4 h-4 text-studio-accent flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="text-slate-200 font-semibold">Pro Audio Workflow Tip: </span>
            Click any dot on the spectrum or select a node above to instantly switch its type between <strong>HPF, Low Freq Shelving, Parametric, High Freq Shelving, and LPF</strong>. You can adjust frequency and gain directly by dragging on the graph, use the <strong>mouse scroll wheel</strong> over any node to alter bandwidth (Q) or slope, and double-click the canvas to add up to 6 nodes.
          </div>
        </div>
      </div>
    </div>
  );
};
