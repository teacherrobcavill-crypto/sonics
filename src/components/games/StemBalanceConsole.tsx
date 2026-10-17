import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  Volume1,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Award,
  ChevronRight,
  Music,
  Activity,
  Sliders,
  Radio,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Target,
  HeartCrack
} from 'lucide-react';
import { StemType, StemMixBalance, RoundResult, AudioSourceType, FilterParams } from '../../types';
import { audioEngine, STEM_TYPES, ListeningMode } from '../../audio/AudioEngine';

interface StemBalanceConsoleProps {
  roundCount: number;
  lives: number;
  onRoundComplete: (result: RoundResult) => void;
  onNextRound: () => void;
  isDailyLocked?: boolean;
  isCustomAudio?: boolean;
  currentSourceType: AudioSourceType;
  isMobile?: boolean;
}

interface StemChannelMeta {
  type: StemType;
  name: string;
  badge: string;
  color: string;
  borderColor: string;
  accentBg: string;
}

const STEM_METAS: Record<StemType, StemChannelMeta> = {
  drums: {
    type: 'drums',
    name: 'Drums',
    badge: 'Rhythm',
    color: '#00f0ff',
    borderColor: 'border-cyan-400',
    accentBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
  },
  bass: {
    type: 'bass',
    name: 'Bass',
    badge: 'Low End',
    color: '#f59e0b',
    borderColor: 'border-amber-400',
    accentBg: 'bg-amber-500/20 text-amber-300 border-amber-400/40'
  },
  other: {
    type: 'other',
    name: 'Instruments',
    badge: 'Synths/Guitars',
    color: '#c084fc',
    borderColor: 'border-purple-400',
    accentBg: 'bg-purple-500/20 text-purple-300 border-purple-400/40'
  },
  vocals: {
    type: 'vocals',
    name: 'Vocals',
    badge: 'Lead/Melody',
    color: '#10b981',
    borderColor: 'border-emerald-400',
    accentBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
  }
};

const FADER_MIN_DB = -12.0;
const FADER_MAX_DB = 6.0;

/**
 * Maps a dB value (-12 to +6) to normalized percentage (0 = -12dB bottom, 1 = +6dB top)
 */
function dbToNorm(db: number): number {
  const clamped = Math.max(FADER_MIN_DB, Math.min(FADER_MAX_DB, db));
  return (clamped - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB);
}

/**
 * Maps normalized percentage (0 to 1) to dB value with 0.1 dB step
 */
function normToDb(norm: number): number {
  const db = FADER_MIN_DB + norm * (FADER_MAX_DB - FADER_MIN_DB);
  return Math.round(db * 10) / 10;
}

/**
 * Generates round target balance based on round difficulty tier (1 to 20):
 * - All 4 faders are always open and active in every round.
 * - 1 stem is chosen at random as the 0.0 dB anchor reference.
 * - Tier 1 (Rounds 1–5): 0.5 dB steps, max offset ±6.0 dB
 * - Tier 2 (Rounds 6–12): 0.2 dB steps, max offset ±8.0 dB
 * - Tier 3 (Rounds 13–18): 0.1 dB steps, max offset ±10.0 dB
 * - Tier 4 (Rounds 19–20): 0.1 dB steps, max offset ±3.5 dB (fine subtle mastering balances)
 */
function generateStemRoundTargets(round: number): {
  targetBalance: StemMixBalance;
  activeStems: StemType[];
  anchorStem: StemType;
} {
  const stems: StemType[] = ['drums', 'bass', 'other', 'vocals'];
  const r = Math.max(1, Math.min(20, round));

  // All 4 stems always open and active
  const activeStems: StemType[] = ['drums', 'bass', 'other', 'vocals'];
  let stepSize = 0.5;
  let maxOffset = 6.0;

  if (r >= 19) {
    stepSize = 0.1;
    maxOffset = 3.5; // Fine subtle mastering balance
  } else if (r >= 13) {
    stepSize = 0.1;
    maxOffset = 10.0;
  } else if (r >= 6) {
    stepSize = 0.2;
    maxOffset = 8.0;
  } else {
    stepSize = 0.5;
    maxOffset = 6.0;
  }

  // Shuffle to pick 1 anchor stem as 0.0 dB reference
  const anchorStem = stems[Math.floor(Math.random() * stems.length)];

  const targetBalance: StemMixBalance = {
    drums: 0,
    bass: 0,
    other: 0,
    vocals: 0
  };

  for (const st of activeStems) {
    if (st === anchorStem) {
      targetBalance[st] = 0.0;
    } else {
      // Pick random discrete offset
      const maxSteps = Math.floor(maxOffset / stepSize);
      // Ensure non-zero step (at least 1 step away from 0)
      const stepsCount = 1 + Math.floor(Math.random() * maxSteps);
      const sign = Math.random() < 0.5 ? -1 : 1;
      const offset = sign * stepsCount * stepSize;
      targetBalance[st] = Math.round(offset * 10) / 10;
    }
  }

  return { targetBalance, activeStems, anchorStem };
}

export const StemBalanceConsole: React.FC<StemBalanceConsoleProps> = ({
  roundCount,
  lives: _lives,
  onRoundComplete,
  onNextRound,
  isDailyLocked = false,
  isCustomAudio: _isCustomAudio = false,
  currentSourceType,
  isMobile = false
}) => {
  // Stem target balance for current round
  const [targetBalance, setTargetBalance] = useState<StemMixBalance>({
    drums: 0,
    bass: 0,
    other: 0,
    vocals: 0
  });
  const [activeStems, setActiveStems] = useState<StemType[]>(['drums', 'vocals']);
  const [anchorStem, setAnchorStem] = useState<StemType>('drums');

  // Student faders balance in dB
  const [userFaders, setUserFaders] = useState<StemMixBalance>({
    drums: 0,
    bass: 0,
    other: 0,
    vocals: 0
  });

  // Transport & Audio Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [listeningMode, setListeningMode] = useState<ListeningMode>('target');
  const [isRoundAnswered, setIsRoundAnswered] = useState<boolean>(false);
  const [roundScore, setRoundScore] = useState<number | null>(null);
  const [stemDeltas, setStemDeltas] = useState<Record<StemType, number> | null>(null);
  const [isHit, setIsHit] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isLoadingStems, setIsLoadingStems] = useState<boolean>(true);

  // Live RMS VU meters (0.0 to 1.0)
  const [rmsLevels, setRmsLevels] = useState<Record<StemType, number>>({
    drums: 0,
    bass: 0,
    other: 0,
    vocals: 0
  });

  // Initialize round targets
  const initRound = useCallback(async () => {
    setIsLoadingStems(true);
    await audioEngine.setStemMode(true);
    await audioEngine.loadStemBuffersForTrack(currentSourceType);

    const { targetBalance: newTarget, activeStems: newActive, anchorStem: newAnchor } = generateStemRoundTargets(roundCount);
    setTargetBalance(newTarget);
    setActiveStems(newActive);
    setAnchorStem(newAnchor);

    // Reset student faders to 0.0 dB every round
    const initialFaders: StemMixBalance = { drums: 0, bass: 0, other: 0, vocals: 0 };
    setUserFaders(initialFaders);

    audioEngine.setStemBalanceTarget(newTarget);
    audioEngine.resetStemMix();

    audioEngine.setListeningMode('target');
    setListeningMode('target');

    setIsRoundAnswered(false);
    setRoundScore(null);
    setStemDeltas(null);
    setIsHit(false);
    setStartTime(Date.now());
    setIsLoadingStems(false);
  }, [roundCount, currentSourceType]);

  useEffect(() => {
    initRound();
    return () => {
      audioEngine.stop();
    };
  }, [initRound]);

  // Subscribe to audio engine state
  useEffect(() => {
    const unsub = audioEngine.subscribeState((playing, mode) => {
      setIsPlaying(playing);
      setListeningMode(mode);
    });
    return unsub;
  }, []);

  // VU Meter Render Loop
  useEffect(() => {
    let animId: number;
    const updateVUs = () => {
      if (audioEngine.isStemModeActive()) {
        setRmsLevels({
          drums: audioEngine.getStemRMS('drums'),
          bass: audioEngine.getStemRMS('bass'),
          other: audioEngine.getStemRMS('other'),
          vocals: audioEngine.getStemRMS('vocals')
        });
      }
      animId = requestAnimationFrame(updateVUs);
    };
    animId = requestAnimationFrame(updateVUs);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Handle Fader Drag
  const handleFaderPointerDown = (stem: StemType, e: React.PointerEvent<HTMLDivElement>) => {
    if (isRoundAnswered || isDailyLocked) return;

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);
    const rect = targetEl.getBoundingClientRect();
    const slotEl = targetEl.querySelector('.fader-slot') as HTMLElement | null;
    const trackRect = slotEl ? slotEl.getBoundingClientRect() : rect;

    const calculateDbFromY = (clientY: number) => {
      const clampedY = Math.max(trackRect.top, Math.min(trackRect.bottom, clientY));
      const norm = 1 - (clampedY - trackRect.top) / trackRect.height; // 0 bottom, 1 top
      return normToDb(norm);
    };

    const newDb = calculateDbFromY(e.clientY);
    setUserFaders(prev => ({ ...prev, [stem]: newDb }));
    audioEngine.setUserStemGain(stem, newDb);

    const onPointerMove = (moveEvt: PointerEvent) => {
      const db = calculateDbFromY(moveEvt.clientY);
      setUserFaders(prev => ({ ...prev, [stem]: db }));
      audioEngine.setUserStemGain(stem, db);
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvt.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Nudge Fader
  const handleNudge = (stem: StemType, delta: number) => {
    if (isRoundAnswered || isDailyLocked) return;
    const current = userFaders[stem];
    const nextDb = Math.max(FADER_MIN_DB, Math.min(FADER_MAX_DB, Math.round((current + delta) * 10) / 10));
    setUserFaders(prev => ({ ...prev, [stem]: nextDb }));
    audioEngine.setUserStemGain(stem, nextDb);
  };

  // Reset all faders to 0.0 dB (Flat)
  const handleResetFlat = () => {
    if (isRoundAnswered || isDailyLocked) return;
    const flat: StemMixBalance = { drums: 0, bass: 0, other: 0, vocals: 0 };
    setUserFaders(flat);
    audioEngine.resetStemMix();
    audioEngine.setListeningMode('user');
    setListeningMode('user');
  };

  // Transport Switch: Target vs User Mix
  const handleSelectMode = (mode: ListeningMode) => {
    audioEngine.setListeningMode(mode);
    setListeningMode(mode);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.play();
    }
  };

  // Submit Answer
  const handleSubmit = () => {
    if (isRoundAnswered || isDailyLocked) return;

    const deltas: Record<StemType, number> = {
      drums: Math.round(Math.abs(userFaders.drums - targetBalance.drums) * 10) / 10,
      bass: Math.round(Math.abs(userFaders.bass - targetBalance.bass) * 10) / 10,
      other: Math.round(Math.abs(userFaders.other - targetBalance.other) * 10) / 10,
      vocals: Math.round(Math.abs(userFaders.vocals - targetBalance.vocals) * 10) / 10
    };

    setStemDeltas(deltas);

    // Calculate score across all stems using the identical formula as single fader (max 75 pts)
    let totalScore = 0;
    let sumDelta = 0;
    for (const st of activeStems) {
      const diff = deltas[st];
      sumDelta += diff;
      let stemScore = 0;
      if (diff === 0.0) {
        stemScore = 75; // Spot on
      } else if (diff <= 3.0) {
        const rawScore = 100 - (diff / 3.0) * 90;
        stemScore = Math.round(rawScore * 0.75); // 75 down to 8 pts
      } else if (diff <= 6.0) {
        stemScore = 8;
      } else {
        stemScore = 0;
      }
      totalScore += stemScore;
    }

    const finalRoundScore = Math.round(totalScore / activeStems.length);
    const avgDelta = Math.round((sumDelta / activeStems.length) * 10) / 10;

    // A life is lost if ANY active stem is more than 3.0 dB off target
    const hasStemOver3Db = activeStems.some(st => deltas[st] > 3.0);
    const hit = !hasStemOver3Db;
    setIsHit(hit);
    setRoundScore(finalRoundScore);
    setIsRoundAnswered(true);

    if (hit) {
      confetti({
        particleCount: avgDelta <= 0.6 ? 70 : 40,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    const dummyFilter: FilterParams = { type: 'peaking', frequency: 1000, gain: 0, q: 1.41 };
    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'db_master',
      target: dummyFilter,
      guess: dummyFilter,
      freqDistanceOctaves: 0,
      freqDistanceSemitones: 0,
      gainDistanceDb: avgDelta,
      isFilterTypeCorrect: true,
      isDirectionCorrect: true,
      score: finalRoundScore,
      timeSpentSeconds: (Date.now() - startTime) / 1000,
      timestamp: Date.now(),
      targetStemBalance: targetBalance,
      guessStemBalance: userFaders,
      stemDeltas: deltas,
      averageStemDeltaDb: avgDelta
    };

    onRoundComplete(result);
  };

  // Keyboard Shortcuts: Space for play/pause, Enter for submit/next round, A for Target, B for Your Mix, C for Flat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // Spacebar: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
        return;
      }

      // Enter: Submit or Next Round
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRoundAnswered) {
          onNextRound();
        } else if (!isDailyLocked) {
          handleSubmit();
        }
        return;
      }

      // A: Target Mix
      if (key === 'a' || key === 'q') {
        e.preventDefault();
        handleSelectMode('target');
        return;
      }

      // B: Your Mix
      if (key === 'b' || key === 'w') {
        e.preventDefault();
        handleSelectMode('user');
        return;
      }

      // C / 0 / F: Reset Flat (0 dB)
      if (key === 'c' || key === '0' || key === 'f') {
        e.preventDefault();
        handleResetFlat();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRoundAnswered, isDailyLocked, onNextRound, isPlaying, userFaders, targetBalance, activeStems]);

  return (
    <div className="space-y-4 font-sans select-none">
      
      {/* Console Header Info Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-studio-950/80 rounded-2xl border border-studio-800/80 text-xs font-mono shadow-md">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-studio-accent/20 text-studio-accent flex items-center justify-center border border-studio-accent/30 font-bold">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <span>Stem Balance Desk</span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-studio-accent/15 text-studio-accent border border-studio-accent/30 font-normal uppercase">
                All 4 Faders Open
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Listen to <strong className="text-studio-accent">[A] Target Mix</strong>, match faders in <strong className="text-amber-400">[B] Your Mix</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-400 text-[11px]">Anchor Stem:</span>
          <span className="px-2 py-0.5 rounded bg-studio-800 text-slate-200 font-bold uppercase border border-studio-700">
            {anchorStem} (0 dB Fixed)
          </span>
        </div>
      </div>

      {/* 4-Channel Mixing Console Desk */}
      <div className={`grid ${isMobile ? 'grid-cols-2 gap-2.5' : 'grid-cols-4 gap-3.5'} p-4 bg-studio-950 border border-studio-800 rounded-3xl shadow-2xl relative`}>
        {isLoadingStems && (
          <div className="absolute inset-0 bg-studio-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-3xl space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-studio-accent border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-studio-accent font-bold">Loading Multi-Track Stems...</span>
          </div>
        )}

        {STEM_TYPES.map(stemKey => {
          const meta = STEM_METAS[stemKey];
          const isActive = activeStems.includes(stemKey);
          const isAnchor = stemKey === anchorStem;
          const userVal = userFaders[stemKey];
          const targetVal = targetBalance[stemKey];
          const delta = stemDeltas ? stemDeltas[stemKey] : null;
          const rms = rmsLevels[stemKey] || 0;

          // Calculate knob vertical position percentage (0 = bottom -12dB, 100 = top +6dB)
          const faderHeightPercent = dbToNorm(userVal) * 100;
          const targetHeightPercent = dbToNorm(targetVal) * 100;

          return (
            <div
              key={stemKey}
              className={`flex flex-col items-center p-3 rounded-2xl border transition-all relative ${
                isActive
                  ? 'bg-studio-900/90 border-studio-750 shadow-lg'
                  : 'bg-studio-900/40 border-studio-850 opacity-60'
              }`}
            >
              {/* Channel Strip Header - Fixed Height 58px for uniform alignment across all 4 channels */}
              <div className="w-full text-center pb-2 border-b border-studio-800/80 mb-2 h-[58px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    {isAnchor && (
                      <span className="text-[8px] font-mono font-bold uppercase px-1 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                        Anchor
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded font-bold border whitespace-nowrap ${meta.accentBg}`}>
                    {meta.badge}
                  </span>
                </div>
                <div className="text-xs font-bold text-white tracking-wide uppercase font-mono truncate">
                  {meta.name}
                </div>
                <div className="h-3.5 flex items-center justify-center">
                  {isAnchor ? (
                    <span className="text-[9px] font-mono text-cyan-400 font-semibold block">
                      (Anchor Ref 0.0dB)
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500/60 block">
                      (Target Variable)
                    </span>
                  )}
                </div>
              </div>

              {/* Live Numeric dB Readout - Fixed Height 54px */}
              <div className="mb-2 w-full text-center h-[54px] flex flex-col items-center justify-start">
                <div
                  className="w-full px-2.5 py-1 rounded-xl font-mono font-extrabold text-sm border shadow-inner flex items-center justify-center space-x-1"
                  style={{
                    backgroundColor: `${meta.color}15`,
                    borderColor: `${meta.color}40`,
                    color: meta.color
                  }}
                >
                  <span>{userVal > 0 ? `+${userVal.toFixed(1)}` : userVal.toFixed(1)}</span>
                  <span className="text-[10px] font-normal text-slate-400">dB</span>
                </div>

                {/* Accuracy Delta Badge when Answered - Fixed Height 16px row */}
                <div className="h-4 flex items-center justify-center mt-1">
                  {isRoundAnswered && delta !== null && (
                    <div className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border whitespace-nowrap ${
                      delta <= 0.5
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : delta <= 1.5
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : delta <= 3.0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse'
                    }`}>
                      {delta === 0
                        ? 'Spot on! (0.0)'
                        : delta > 3.0
                        ? `${userVal > targetVal ? '▲' : '▼'} ${delta.toFixed(1)} dB (>3dB)`
                        : `${userVal > targetVal ? '▲' : '▼'} ${delta.toFixed(1)} dB`}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Fader Track & VU Meter Row */}
              <div className="flex items-center justify-center space-x-3 w-full my-1">
                {/* 12-Segment LED VU Meter */}
                <div className="flex flex-col-reverse justify-between h-44 w-2 bg-studio-950 rounded-full p-0.5 border border-studio-800 shadow-inner">
                  {Array.from({ length: 12 }).map((_, idx) => {
                    const threshold = (idx + 1) / 12;
                    const isLit = rms >= threshold && isPlaying;
                    let segmentColor = 'bg-emerald-500';
                    if (idx >= 10) segmentColor = 'bg-red-500';
                    else if (idx >= 8) segmentColor = 'bg-amber-400';

                    return (
                      <div
                        key={idx}
                        className={`w-full h-1 rounded-sm transition-all duration-75 ${
                          isLit ? `${segmentColor} shadow-[0_0_6px_currentColor]` : 'bg-studio-800/40'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Vertical Fader Touch/Mouse Track */}
                <div
                  onPointerDown={(e) => handleFaderPointerDown(stemKey, e)}
                  className={`relative w-12 h-44 bg-studio-950 rounded-2xl border cursor-pointer select-none shadow-inner flex items-center justify-center ${
                    isActive ? 'border-studio-700 hover:border-slate-500' : 'border-studio-850 cursor-not-allowed'
                  }`}
                  style={{ touchAction: 'none' }}
                >
                  {/* Fader Center Track Slot with fader-slot class for accurate pointer tracking */}
                  <div className="fader-slot w-1.5 h-36 bg-studio-800 rounded-full relative">
                    {/* Unity 0 dB Marker Tick */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-4 h-0.5 bg-slate-400/80 z-0"
                      style={{ bottom: `${dbToNorm(0) * 100}%` }}
                    />

                    {/* Target Ghost Reveal Pin (Shown after submission) */}
                    {isRoundAnswered && (
                      <div
                        className="absolute -left-3.5 right-[-14px] h-1 rounded-full z-10 flex items-center shadow-lg pointer-events-none"
                        style={{
                          bottom: `calc(${targetHeightPercent}% - 2px)`,
                          backgroundColor: '#00ff88',
                          boxShadow: '0 0 10px #00ff88'
                        }}
                      >
                        <span className="text-[8px] font-mono font-bold text-black bg-emerald-400 px-1 py-0.2 rounded absolute -right-6 shadow">
                          T
                        </span>
                      </div>
                    )}

                    {/* Knurled Aluminum Fader Cap Knob (28px height, centered on percentage line) */}
                    <div
                      className="absolute -left-4 w-9 h-7 bg-gradient-to-b from-slate-200 via-slate-400 to-slate-500 rounded-lg shadow-xl border border-white/60 flex items-center justify-center z-10 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
                      style={{
                        bottom: `calc(${faderHeightPercent}% - 14px)`
                      }}
                    >
                      {/* Knurled Ridges */}
                      <div className="flex flex-col space-y-0.5 w-6">
                        <div className="h-0.5 bg-slate-700/60 rounded" />
                        <div
                          className="h-1 rounded shadow-sm"
                          style={{ backgroundColor: meta.color }}
                        />
                        <div className="h-0.5 bg-slate-700/60 rounded" />
                      </div>
                    </div>
                  </div>

                  {/* Top & Bottom dB Boundary Labels */}
                  <span className="absolute top-1 text-[8px] font-mono text-slate-500">+6</span>
                  <span className="absolute bottom-1 text-[8px] font-mono text-slate-500">-12</span>
                </div>
              </div>

              {/* Micro Nudges (0.1 & 1.0 dB) */}
              <div className="grid grid-cols-2 gap-1 w-full mt-2 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => handleNudge(stemKey, -0.1)}
                  disabled={isRoundAnswered || !isActive}
                  className="py-1 rounded bg-studio-950 border border-studio-800 hover:bg-studio-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Nudge down 0.1 dB"
                >
                  -0.1
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(stemKey, 0.1)}
                  disabled={isRoundAnswered || !isActive}
                  className="py-1 rounded bg-studio-950 border border-studio-800 hover:bg-studio-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Nudge up 0.1 dB"
                >
                  +0.1
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(stemKey, -1.0)}
                  disabled={isRoundAnswered || !isActive}
                  className="py-1 rounded bg-studio-950 border border-studio-800 hover:bg-studio-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Nudge down 1.0 dB"
                >
                  -1.0
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(stemKey, 1.0)}
                  disabled={isRoundAnswered || !isActive}
                  className="py-1 rounded bg-studio-950 border border-studio-800 hover:bg-studio-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Nudge up 1.0 dB"
                >
                  +1.0
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified Mixing Desk Transport Strip */}
      <div className={`p-3.5 bg-studio-900 border border-studio-800 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 font-mono text-xs`}>
        {/* Play/Pause & Mode Select */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-studio-accent text-studio-950 font-bold uppercase tracking-wider shadow-lg shadow-studio-accent/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Mode Toggles */}
          <div className="flex items-center bg-studio-950 p-1 rounded-xl border border-studio-800 shadow-inner">
            <button
              type="button"
              onClick={() => handleSelectMode('target')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold cursor-pointer ${
                listeningMode === 'target'
                  ? 'bg-studio-accent text-studio-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              [A] Target Mix
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode('user')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold cursor-pointer ${
                listeningMode === 'user'
                  ? 'bg-amber-400 text-studio-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              [B] Your Mix
            </button>
            <button
              type="button"
              onClick={handleResetFlat}
              disabled={isRoundAnswered || isDailyLocked}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer font-bold text-slate-400 hover:text-white hover:bg-studio-800 active:scale-95 disabled:opacity-40"
              title="Reset all 4 faders to 0.0 dB (Flat)"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Flat (0dB)</span>
            </button>
          </div>
        </div>

        {/* Submit or Next Round Button */}
        <div>
          {!isRoundAnswered ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isDailyLocked}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-studio-950 font-bold text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Target className="w-4 h-4" />
              <span>Submit Mix Balance</span>
            </button>
          ) : (
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className={`text-sm font-bold flex items-center justify-end gap-1.5 ${isHit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isHit ? (
                    <span>✓ Balanced Mix Hit! (All ≤ 3 dB)</span>
                  ) : (
                    <>
                      <HeartCrack className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Track &gt; 3 dB Off (1 Life Lost)</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] text-amber-400 font-extrabold">
                  +{roundScore} PTS
                </div>
              </div>
              <button
                type="button"
                onClick={onNextRound}
                className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-studio-accent text-studio-950 font-bold uppercase tracking-wider shadow-lg shadow-studio-accent/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <span>Next Round</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
