import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Activity,
  Heart,
  HeartCrack,
  Award,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sliders,
  Layers,
  Music,
  Trophy,
  Target,
  Crosshair,
  Volume2,
  Headphones
} from 'lucide-react';
import { FilterParams, GameMode, RoundResult } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumDisplay, ToleranceBand } from '../SpectrumDisplay';
import { InlineTransport } from '../InlineTransport';
import {
  ISO_OCTAVE_THIRD,
  formatFrequency,
  formatGain,
  freqDistanceInOctaves,
  freqDistanceInSemitones,
  getWeightedPeakMasterFrequency,
  getNextStratifiedTargetFrequency
} from '../../utils/frequencies';
import {
  getPersistedGameSession,
  savePersistedGameSession,
  getActiveStudentId,
  markStudentGameOver
} from '../../utils/studentStorage';

interface PeakMasterGameProps {
  onRoundComplete: (result: RoundResult) => void;
  onBonusPoints?: (points: number) => void;
  currentStreak: number;
  totalScore: number;
  remainingDailyRounds?: number;
  isCustomAudio?: boolean;
  onNavigateToSandbox?: () => void;
  onOpenLeaderboard?: () => void;
  onNavigateToMode?: (mode: GameMode) => void;
  isMobile?: boolean;
  isPracticeMode?: boolean;
  onTogglePracticeMode?: (enabled: boolean) => void;
  isActive?: boolean;
}

/**
 * Calculates tolerance half-width in octaves for a given round (1 to 20).
 * Round 1:  ±1.90 octaves (reduced slightly overall from ±2.5 for a more balanced target window)
 * Scales smoothly across rounds 1–18 (down to ±0.75 octaves), with the
 * final 2 rounds (19 & 20) reaching precision targeting (±1.5 to 2.4 semitones).
 */
function getRoundToleranceOctaves(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 18) {
    const progress = (r - 1) / 17.0;
    // Smooth decay from 1.90 octaves down to 0.75 octaves
    return 1.90 - Math.pow(progress, 1.5) * (1.90 - 0.75);
  } else if (r === 19) {
    // Round 19: narrow (2.4 semitones = 0.20 octaves)
    return 0.20;
  } else {
    // Round 20: pinpoint (1.5 semitones = 0.125 octaves)
    return 1.5 / 12.0;
  }
}

/**
 * Returns base maximum score for a spot-on guess in Peak Master for a given round.
 * Rounds 1–10: 500 points max.
 * Rounds 11–17: linearly scales up from 500 to 1,000.
 * Rounds 18–20: 1,000 points max awarded for exact frequency.
 */
function getPeakMasterBaseMaxScore(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 10) return 500;
  if (r >= 18) return 1000;
  const progress = (r - 10) / 8.0;
  return Math.round(500 + progress * 500);
}

const CUT_BONUS_MULTIPLIER = 1.25;

/**
 * Returns the score multiplier based on EQ gain challenge difficulty.
 * Correct answers on 3dB gain a lot more points (1.0x), while 12dB is the lowest scoring (0.35x).
 * Cuts (gainDb < 0) are harder to hear and earn a 25% higher multiplier (1.25x).
 */
function getGainScoreMultiplier(gainDb: number): number {
  const absGain = Math.abs(gainDb);
  let baseMult = 0.35; // 12 dB
  if (absGain <= 3) baseMult = 1.0;
  else if (absGain <= 6) baseMult = 0.70;
  else if (absGain <= 9) baseMult = 0.50;

  return gainDb < 0 ? baseMult * CUT_BONUS_MULTIPLIER : baseMult;
}

export const PeakMasterGame: React.FC<PeakMasterGameProps> = ({
  onRoundComplete,
  onBonusPoints,
  currentStreak,
  totalScore,
  remainingDailyRounds,
  isCustomAudio = false,
  onNavigateToSandbox,
  onOpenLeaderboard,
  onNavigateToMode,
  isMobile = false,
  isPracticeMode = false,
  onTogglePracticeMode,
  isActive = true
}) => {
  const isDailyLocked = !isPracticeMode && !isCustomAudio && remainingDailyRounds !== undefined && remainingDailyRounds <= 0;

  // Game session states (restored from daily persistence if available)
  const [roundCount, setRoundCount] = useState<number>(() => {
    const saved = getPersistedGameSession('peak_master');
    return saved ? saved.roundCount : 1;
  });
  const [lives, setLives] = useState<number>(() => {
    const saved = getPersistedGameSession('peak_master');
    return saved ? saved.lives : 3;
  });
  const [isGameOver, setIsGameOver] = useState<boolean>(() => {
    const saved = getPersistedGameSession('peak_master');
    return saved ? saved.isGameOver : false;
  });
  const [isVictory, setIsVictory] = useState<boolean>(() => {
    const saved = getPersistedGameSession('peak_master');
    return saved ? saved.isVictory : false;
  });
  const [sessionScore, setSessionScore] = useState<number>(() => {
    const saved = getPersistedGameSession('peak_master');
    return saved ? saved.sessionScore : 0;
  });
  const [round10Milestone, setRound10Milestone] = useState<'extra_life' | 'bonus_points' | null>(null);

  // Persist session state so switching tabs or refreshing never resets lives
  useEffect(() => {
    savePersistedGameSession('peak_master', {
      roundCount,
      lives,
      isGameOver,
      isVictory,
      sessionScore
    });
  }, [roundCount, lives, isGameOver, isVictory, sessionScore]);

  // Settings
  const [includeCuts, setIncludeCuts] = useState<boolean>(false);
  const [fixedGain, setFixedGain] = useState<number>(12); // dB
  const [qFactor, setQFactor] = useState<number>(1.41);

  // Filter & Guesses
  const [targetFilter, setTargetFilter] = useState<FilterParams | null>(null);
  const [hoverFreq, setHoverFreq] = useState<number | null>(1000);
  const [pinnedFreq, setPinnedFreq] = useState<number | null>(null);
  const [isRoundAnswered, setIsRoundAnswered] = useState<boolean>(false);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [lastHitStatus, setLastHitStatus] = useState<'hit' | 'miss' | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Current round tolerance width
  const currentToleranceOctaves = useMemo(() => {
    return getRoundToleranceOctaves(roundCount);
  }, [roundCount]);

  // Selected frequency for aiming
  const activeFreq = pinnedFreq ?? hoverFreq ?? 1000;

  // Tolerance band boundaries
  const toleranceLowFreq = Math.max(20, Math.round(activeFreq * Math.pow(2, -currentToleranceOctaves)));
  const toleranceHighFreq = Math.min(20000, Math.round(activeFreq * Math.pow(2, currentToleranceOctaves)));

  const targetHistoryRef = useRef<number[]>([]);

  // Generate new random target round
  const generateNewRound = useCallback((targetRoundNumber?: number) => {
    const currentRound = typeof targetRoundNumber === 'number' ? targetRoundNumber : roundCount;
    const recentFreqs = targetHistoryRef.current;
    const previousFreq = recentFreqs.length > 0 ? recentFreqs[recentFreqs.length - 1] : null;

    // Stratified frequency generation: strictly 50 Hz to 15,000 Hz, jumping across 4 spectrum zones
    const randomFreq = getNextStratifiedTargetFrequency({
      roundNumber: currentRound,
      previousFreq,
      recentFreqs,
      filterType: 'peaking',
      minFreq: 50,
      maxFreq: 15000
    });

    targetHistoryRef.current = [...recentFreqs.slice(-8), randomFreq];

    const isCut = includeCuts && Math.random() > 0.5;
    const gain = isCut ? -fixedGain : fixedGain;

    const filter: FilterParams = {
      type: 'peaking',
      frequency: randomFreq,
      gain: gain,
      q: qFactor
    };

    setTargetFilter(filter);
    if (isActive) {
      audioEngine.setTargetFilter(filter);
      audioEngine.setListeningMode('target');
    }

    setPinnedFreq(null);
    setIsRoundAnswered(false);
    setLastRoundResult(null);
    setLastHitStatus(null);
    setStartTime(Date.now());
  }, [roundCount, includeCuts, fixedGain, qFactor, isActive]);

  // Initial load
  useEffect(() => {
    generateNewRound(roundCount);
  }, []);

  // Re-sync AudioEngine when this tab becomes active
  useEffect(() => {
    if (isActive && targetFilter) {
      audioEngine.setMonoMode(false);
      audioEngine.setCorrectionMode(false);
      audioEngine.setStemMode(false);
      audioEngine.resetDbLevels();
      audioEngine.setTargetPan(0);
      audioEngine.setUserPan(0);
      audioEngine.setTargetFilter(targetFilter);
      audioEngine.setListeningMode('target');
    }
  }, [isActive]);

  // Auto-dismiss Round 10 milestone graphic after 3.2 seconds
  useEffect(() => {
    if (!round10Milestone) return;
    const timer = setTimeout(() => {
      setRound10Milestone(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [round10Milestone]);

  // Pointer hover on canvas
  const handleBandMove = useCallback((freq: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    setHoverFreq(freq);
  }, [isRoundAnswered, isGameOver, isDailyLocked]);

  // Click on canvas to lock/pin guess
  const handleBandSelect = useCallback((freq: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    setPinnedFreq(freq);
    setHoverFreq(freq);
  }, [isRoundAnswered, isGameOver, isDailyLocked]);

  // Micro-adjustment buttons for touch/fine-tuning
  const handleNudge = (factor: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    const current = pinnedFreq ?? hoverFreq ?? 1000;
    const nextFreq = Math.max(20, Math.min(20000, Math.round(current * factor)));
    setPinnedFreq(nextFreq);
    setHoverFreq(nextFreq);
  };

  // Submit Guess
  const handleSubmitGuess = () => {
    if (!targetFilter || isRoundAnswered || isDailyLocked || isGameOver) return;

    const guessFrequency = activeFreq;
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const distOctaves = freqDistanceInOctaves(guessFrequency, targetFilter.frequency);
    const distSemitones = freqDistanceInSemitones(guessFrequency, targetFilter.frequency);

    // Hit test: Is target within the current round's tolerance window?
    const isHit = distOctaves <= currentToleranceOctaves;

    // Calculate dynamic scaled max score based on round and dB challenge difficulty
    const baseMaxScore = getPeakMasterBaseMaxScore(roundCount);
    const gainMult = getGainScoreMultiplier(targetFilter.gain);
    const maxPossibleScore = Math.round(baseMaxScore * gainMult);

    let score = 0;
    if (isHit) {
      if (distOctaves <= 0.05) {
        // Bullseye (within half a semitone)
        score = maxPossibleScore;
      } else {
        // Linear / power curve from maxPossibleScore down to 25% boundary score
        const ratio = 1 - (distOctaves / currentToleranceOctaves);
        const minHitScore = Math.round(maxPossibleScore * 0.25);
        score = Math.round(minHitScore + (maxPossibleScore - minHitScore) * Math.pow(ratio, 1.25));
      }
    } else {
      score = 0;
    }

    if (isPracticeMode) {
      score = 0;
    }

    const userFilterParam: FilterParams = {
      type: 'peaking',
      frequency: guessFrequency,
      gain: targetFilter.gain,
      q: targetFilter.q
    };

    audioEngine.setUserFilter(userFilterParam);

    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'peak_master',
      target: targetFilter,
      guess: userFilterParam,
      freqDistanceOctaves: distOctaves,
      freqDistanceSemitones: distSemitones,
      gainDistanceDb: 0,
      isFilterTypeCorrect: true,
      isDirectionCorrect: true,
      score: score,
      timeSpentSeconds: elapsedSeconds,
      timestamp: Date.now()
    };

    setIsRoundAnswered(true);
    setLastRoundResult(result);
    setLastHitStatus(isHit ? 'hit' : 'miss');
    setSessionScore(prev => prev + score);

    // Handle lives & game over (Lives protected in Practice Mode)
    if (isHit) {
      if (distOctaves <= 0.05 || (score >= Math.round(maxPossibleScore * 0.85) && !isPracticeMode)) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    } else if (!isPracticeMode) {
      const remainingLives = lives - 1;
      setLives(remainingLives);
      if (remainingLives <= 0) {
        setIsGameOver(true);
        const activeId = getActiveStudentId();
        if (activeId) {
          markStudentGameOver(activeId, 'peak_master');
        }
      }
    }

    onRoundComplete(result);
  };

  // Advance to next round
  const handleNextRound = () => {
    if (roundCount >= 20 && !isPracticeMode) {
      setIsVictory(true);
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.5 }
      });
      return;
    }

    const nextRound = roundCount + 1;
    setRoundCount(nextRound);

    // Round 10 Milestone Check
    if (nextRound === 10) {
      if (lives < 3) {
        setLives(prev => Math.min(3, prev + 1));
        setRound10Milestone('extra_life');
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#ef4444', '#f43f5e', '#fb7185', '#ffffff']
        });
      } else {
        setSessionScore(prev => prev + 100);
        onBonusPoints?.(100);
        setRound10Milestone('bonus_points');
        confetti({
          particleCount: 80,
          spread: 90,
          origin: { y: 0.5 },
          colors: ['#fbbf24', '#f59e0b', '#10b981', '#00f0ff', '#ffffff']
        });
      }
    }

    generateNewRound(nextRound);
  };

  // Restart Peak Master session (if in custom audio or after reset)
  const handleRestartSession = () => {
    targetHistoryRef.current = [];
    setRoundCount(1);
    setLives(3);
    setIsGameOver(false);
    setIsVictory(false);
    setSessionScore(0);
    setRound10Milestone(null);
    generateNewRound(1);
  };

  // Constructed tolerance band for SpectrumDisplay
  const toleranceBand: ToleranceBand = useMemo(() => {
    let status: 'hover' | 'pinned' | 'hit' | 'miss' = 'hover';
    if (isRoundAnswered) {
      status = lastHitStatus === 'hit' ? 'hit' : 'miss';
    } else if (pinnedFreq !== null) {
      status = 'pinned';
    }

    return {
      centerFreq: activeFreq,
      halfWidthOctaves: currentToleranceOctaves,
      status: status
    };
  }, [activeFreq, currentToleranceOctaves, isRoundAnswered, lastHitStatus, pinnedFreq]);

  return (
    <div className={isMobile ? 'space-y-3' : 'space-y-6'}>
      
      {/* Settings & Game Header */}
      <div className={`flex ${isMobile ? 'flex-col gap-3 p-3' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl shadow-lg`}>
        <div className="w-full">
          <div className={`flex flex-wrap items-center gap-1.5 sm:gap-2 ${isMobile ? 'justify-between w-full' : ''}`}>
            {/* Round indicator */}
            <span className={`${isMobile ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider bg-studio-accent/20 text-studio-accent rounded-lg border border-studio-accent/30 flex items-center gap-1 shadow-sm shrink-0`}>
              <Activity className="w-3.5 h-3.5" />
              {isPracticeMode ? (isMobile ? `Rd ${roundCount} (Prac)` : `Round ${roundCount} (Practice)`) : (isMobile ? `Rd ${roundCount}/20` : `Round ${roundCount} / 20`)}
            </span>

            {/* Mobile: Practice or Daily Left */}
            {isMobile && (
              isPracticeMode ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm shrink-0">
                  <Headphones className="w-3 h-3 text-purple-400" /> Practice
                </span>
              ) : isCustomAudio ? (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm shrink-0">
                  📁 Custom
                </span>
              ) : (
                remainingDailyRounds !== undefined && (
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border shrink-0 ${
                    remainingDailyRounds > 10
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : remainingDailyRounds > 3
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    🎯 {remainingDailyRounds}/20 Left
                  </span>
                )
              )
            )}

            {/* Lives Indicator */}
            {isPracticeMode ? (
              <div className={`flex items-center space-x-1 ${isMobile ? 'px-2 py-0.5' : 'px-2.5 py-1'} bg-purple-950/60 border border-purple-500/40 rounded-lg shadow-inner shrink-0`} title="Lives protected in Practice Mode">
                <span className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} font-mono text-purple-300 mr-0.5 font-semibold uppercase`}>Lives:</span>
                <Heart className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-purple-400 fill-purple-400`} />
                <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} font-mono font-bold text-purple-200 uppercase`}>Protected</span>
              </div>
            ) : (
              <div className={`flex items-center space-x-1 ${isMobile ? 'px-2 py-0.5' : 'px-2.5 py-1'} bg-studio-950 border border-studio-800 rounded-lg shadow-inner shrink-0`}>
                <span className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} font-mono text-slate-400 mr-0.5 font-semibold uppercase`}>Lives:</span>
                {[1, 2, 3].map(heartIdx => (
                  <span key={heartIdx} className="transition-transform duration-300">
                    {heartIdx <= lives ? (
                      <Heart className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-red-500 fill-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]`} />
                    ) : (
                      <HeartCrack className={`${isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-slate-600/70`} />
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Desktop: Practice or Daily Left */}
            {!isMobile && (
              isPracticeMode ? (
                <span className="px-2 py-1 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm">
                  <Headphones className="w-3.5 h-3.5 text-purple-400" /> Practice Mode (Lives Protected &bull; 0 PTS)
                </span>
              ) : isCustomAudio ? (
                <span className="px-2 py-1 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm">
                  📁 Custom Audio
                </span>
              ) : (
                remainingDailyRounds !== undefined && (
                  <span className={`px-2 py-1 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border ${
                    remainingDailyRounds > 10
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : remainingDailyRounds > 3
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    🎯 {remainingDailyRounds}/20 Left
                  </span>
                )
              )
            )}

            <h2 className={`${isMobile ? 'text-base w-full mt-1 justify-center text-center' : 'text-xl'} font-bold text-white flex items-center gap-2`}>
              <span>Peak Master</span>
            </h2>
          </div>
          {!isMobile && (
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Aim by hovering over the frequency plot &bull; 3dB earns top score multiplier &bull; Narrowing tolerance zone &bull; 3 misses to survive!
            </p>
          )}
        </div>

        {/* Audio Practice Settings */}
        <div className={`flex flex-wrap items-center gap-2 ${isMobile ? 'w-full justify-between' : 'flex-shrink-0'}`}>
          <div className={`flex items-center ${isMobile ? 'w-full justify-between px-2.5 py-1.5' : 'space-x-1.5 px-3 py-1.5'} bg-studio-950 rounded-xl border border-studio-800 text-xs`}>
            <span className="text-slate-400 font-mono text-[11px]">Gain:</span>
            <div className="flex items-center gap-1">
              {[3, 6, 9, 12].map((db) => {
                const boostMult = getGainScoreMultiplier(db);
                const cutMult = getGainScoreMultiplier(-db);
                const formatMult = (m: number) => `${Number(m.toFixed(2))}x`;
                const displayMult = includeCuts && !isMobile
                  ? `${formatMult(boostMult)}/${formatMult(cutMult)}`
                  : includeCuts
                  ? formatMult(cutMult)
                  : formatMult(boostMult);
                return (
                  <button
                    key={db}
                    onClick={() => setFixedGain(db)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded font-mono cursor-pointer flex items-center gap-1 ${
                      fixedGain === db
                        ? 'bg-studio-accent text-studio-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title={`${db}dB EQ boost (${formatMult(boostMult)}) / cut (${formatMult(cutMult)} with +25% cut bonus)`}
                  >
                    <span>{db}dB</span>
                    <span className={`text-[9px] ${fixedGain === db ? 'text-studio-950/80 font-bold' : 'text-slate-500'}`}>
                      {displayMult}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label
            className={`flex items-center justify-between space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 text-xs cursor-pointer select-none ${isMobile ? 'w-full' : ''}`}
            title="Includes random EQ cuts, which award +25% more points on correct guesses across all gain multipliers"
          >
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={includeCuts}
                onChange={e => setIncludeCuts(e.target.checked)}
                className="accent-studio-accent rounded"
              />
              <span className="text-slate-300">Allow Cuts</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              includeCuts
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                : 'bg-studio-900 text-slate-500 border-studio-800'
            }`}>
              +25% PTS
            </span>
          </label>
        </div>
      </div>

      {/* Visual Spectrum Display with Interactive Shaded Tolerance Zone */}
      <SpectrumDisplay
        targetFilter={targetFilter}
        userFilter={isRoundAnswered ? {
          type: 'peaking',
          frequency: activeFreq,
          gain: targetFilter?.gain || 12,
          q: qFactor
        } : null}
        showTargetCurve={isRoundAnswered}
        targetFreqMarker={isRoundAnswered ? targetFilter?.frequency : null}
        highlightFreq={isRoundAnswered ? activeFreq : null}
        height={isMobile ? 210 : 280}
        toleranceBand={toleranceBand}
        isInteractiveBand={!isRoundAnswered && !isGameOver && !isDailyLocked}
        onBandMove={handleBandMove}
        onBandSelect={handleBandSelect}
        isMobile={isMobile}
      />

      {/* Interactive Precision Radar & Tolerance Gauge (Desktop Only) */}
      {!isMobile && (
        <div className="bg-studio-900 border border-studio-800 p-4 flex-col md:flex-row items-center justify-between gap-4 rounded-2xl shadow-xl flex">
          
          {/* Left: Active Aiming Readout & Micro-Nudge */}
          <div className="flex flex-wrap items-center justify-between gap-2 w-full md:w-auto">
            <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800">
              <Crosshair className="w-4 h-4 text-studio-accent" />
              <div className="font-mono text-xs">
                <span className="text-slate-400">Aiming: </span>
                <span className="text-white font-bold text-sm">{formatFrequency(activeFreq)}</span>
                {pinnedFreq !== null && (
                  <span className="ml-1.5 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                    Locked
                  </span>
                )}
              </div>
            </div>

            {/* Micro Nudges */}
            {!isRoundAnswered && !isGameOver && !isDailyLocked && (
              <div className="flex items-center space-x-1 font-mono text-xs">
                <button
                  onClick={() => handleNudge(0.95)}
                  className="px-2.5 py-1.5 bg-studio-950 hover:bg-studio-800 text-slate-300 hover:text-white rounded-lg border border-studio-800 cursor-pointer"
                  title="Nudge frequency 5% lower"
                >
                  &larr; -5%
                </button>
                <button
                  onClick={() => handleNudge(1.05)}
                  className="px-2.5 py-1.5 bg-studio-950 hover:bg-studio-800 text-slate-300 hover:text-white rounded-lg border border-studio-800 cursor-pointer"
                  title="Nudge frequency 5% higher"
                >
                  +5% &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Center: Tolerance Width Gauge */}
          <div className="w-full md:w-[320px] bg-studio-950/80 p-2.5 rounded-xl border border-studio-800 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Tolerance:</span>
              <span className="text-studio-accent font-bold truncate">
                &plusmn;{currentToleranceOctaves.toFixed(2)} oct ({formatFrequency(toleranceLowFreq)}&ndash;{formatFrequency(toleranceHighFreq)})
              </span>
            </div>

            {/* Dynamic Gauge Meter */}
            <div className="w-full h-2 bg-studio-900 rounded-full overflow-hidden border border-studio-800/80">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  currentToleranceOctaves > 1.0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : currentToleranceOctaves > 0.4
                    ? 'bg-gradient-to-r from-teal-400 to-amber-400'
                    : 'bg-gradient-to-r from-amber-400 to-red-500'
                }`}
                style={{
                  width: `${Math.max(8, (currentToleranceOctaves / 1.90) * 100)}%`
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
              <span>Tight (&plusmn;0.13 oct)</span>
              <span>Round {roundCount} of 20</span>
              <span>Wide (&plusmn;1.90 oct)</span>
            </div>
          </div>

          {/* Right: Round Score Accumulator */}
          <div className="flex items-center space-x-2 bg-studio-950 px-3.5 py-2 rounded-xl border border-studio-800 font-mono text-xs w-full md:w-auto justify-between md:justify-start">
            <span className="text-slate-400">Run Score:</span>
            <span className="text-emerald-400 font-bold text-sm">+{sessionScore.toLocaleString()} PTS</span>
          </div>
        </div>
      )}

      {/* Unified Action Strip: Play / Flat / EQ On + Action Button + Points + Result */}
      <div className={`bg-studio-900 border border-studio-800 p-2.5 rounded-2xl shadow-xl flex ${isMobile ? 'flex-col gap-2.5' : 'flex-wrap items-center gap-3 sm:gap-4'}`}>
        {/* Play controls */}
        <InlineTransport isMobile={isMobile} />

        {!isMobile && <div className="hidden sm:block h-6 w-px bg-studio-800" />}

        {/* Action Controls */}
        {!isRoundAnswered ? (
          isDailyLocked ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700/50 w-full sm:w-auto text-center"
            >
              Daily Limit Reached (20/20)
            </button>
          ) : isGameOver ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-red-950/40 text-red-400 cursor-not-allowed border border-red-800/40 w-full sm:w-auto text-center"
            >
              Out of Lives (0/3)
            </button>
          ) : (
            <button
              onClick={handleSubmitGuess}
              className={`px-6 py-3 sm:py-2.5 rounded-xl font-bold font-mono text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95 bg-studio-accent text-studio-950 shadow-studio-accent/25 hover:brightness-110 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'} text-center`}
            >
              Submit Guess ({formatFrequency(activeFreq)}) &bull; Up to {Math.round(getPeakMasterBaseMaxScore(roundCount) * getGainScoreMultiplier(includeCuts ? -fixedGain : fixedGain))} PTS
            </button>
          )
        ) : (
          <>
            {/* Next Round or Finish */}
            {!isGameOver && !isVictory && (
              <button
                onClick={handleNextRound}
                className={`px-6 py-3 sm:py-2.5 rounded-xl font-bold font-mono text-xs sm:text-sm uppercase tracking-wider bg-studio-neonGreen text-studio-950 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-1.5 shadow-lg shadow-studio-neonGreen/20 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'}`}
              >
                <span>{roundCount >= 20 ? 'Complete Run' : 'Next Round'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {lastRoundResult && (
              <>
                {/* Result Status & Score */}
                <div className={`px-3.5 py-2 rounded-xl border font-bold font-mono text-xs sm:text-sm flex items-center justify-center space-x-1.5 ${isMobile ? 'w-full' : ''} ${
                  lastHitStatus === 'hit'
                    ? lastRoundResult.freqDistanceOctaves <= 0.05
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10 shadow-lg'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                }`}>
                  <Award className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {lastHitStatus === 'hit'
                      ? lastRoundResult.freqDistanceOctaves <= 0.05
                        ? `+${lastRoundResult.score.toLocaleString()} PTS • BULLSEYE!${lastRoundResult.target.gain < 0 ? ' (CUT +25%)' : ''}`
                        : `+${lastRoundResult.score.toLocaleString()} PTS (HIT!${lastRoundResult.target.gain < 0 ? ' • CUT +25%' : ''})`
                      : 'MISS • 1 LIFE LOST (-1 ❤️)'}
                  </span>
                </div>

                {/* Target vs Guess readout */}
                <div className={`text-xs font-mono bg-studio-950/80 px-3 py-2 rounded-xl border border-studio-800 ${isMobile ? 'w-full text-center' : ''}`}>
                  <span className="text-slate-400">Target: </span>
                  <span className="text-emerald-400 font-bold">
                    {formatFrequency(lastRoundResult.target.frequency)} ({formatGain(lastRoundResult.target.gain)})
                  </span>
                  <span className="text-slate-500 mx-1.5">|</span>
                  <span className="text-slate-400">Aim: </span>
                  <span className={lastHitStatus === 'hit' ? 'text-teal-300 font-bold' : 'text-red-400 font-bold'}>
                    {formatFrequency(lastRoundResult.guess.frequency)}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* GAME OVER CARD: When 3 lives lost before round 20 */}
      {isGameOver && (
        <div className="p-6 bg-red-950/30 border border-red-500/40 rounded-3xl space-y-4 shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <HeartCrack className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-sans">
                  Out of Lives &bull; Peak Master Session Ended
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  You survived to <strong className="text-white">Round {roundCount} of 20</strong> and banked <strong className="text-emerald-400">+{sessionScore.toLocaleString()} PTS</strong>.
                </p>
              </div>
            </div>

            {/* Continue in Practice Mode (Zero Points) */}
            <button
              onClick={() => {
                onTogglePracticeMode?.(true);
                setIsGameOver(false);
                setRoundCount(prev => prev + 1);
                generateNewRound();
              }}
              className="flex items-center space-x-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-purple-600/25"
            >
              <Headphones className="w-4 h-4" />
              <span>Practice Mode (0 PTS)</span>
            </button>
          </div>

          <div className="border-t border-red-900/60 pt-4">
            <span className="text-xs font-mono text-slate-300 block mb-3 font-semibold">
              Move on to other available training games for today:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => onNavigateToMode?.('tye_match')}
                className="flex items-center justify-center space-x-2 p-3 bg-studio-900 hover:bg-studio-800 border border-studio-700/80 rounded-xl text-xs font-mono font-bold text-studio-neonGreen transition-all cursor-pointer shadow"
              >
                <Sliders className="w-4 h-4" />
                <span>EQ Correct</span>
              </button>

              <button
                onClick={() => onNavigateToMode?.('filter_doctor')}
                className="flex items-center justify-center space-x-2 p-3 bg-studio-900 hover:bg-studio-800 border border-studio-700/80 rounded-xl text-xs font-mono font-bold text-studio-neonOrange transition-all cursor-pointer shadow"
              >
                <Layers className="w-4 h-4" />
                <span>Filter Doctor</span>
              </button>

              <button
                onClick={onNavigateToSandbox}
                className="flex items-center justify-center space-x-2 p-3 bg-studio-900 hover:bg-studio-800 border border-studio-700/80 rounded-xl text-xs font-mono font-bold text-slate-200 transition-all cursor-pointer shadow"
              >
                <Music className="w-4 h-4" />
                <span>{isMobile ? 'EQ Sandbox' : 'EQ Sandbox (Unlimited)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY CARD: When completing Round 20 with lives remaining */}
      {isVictory && (
        <div className="p-6 bg-emerald-950/40 border border-emerald-500/50 rounded-3xl space-y-4 shadow-2xl backdrop-blur-md animate-fade-in text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/20">
                <Sparkles className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-sans flex items-center gap-2">
                  <span>🏆 Peak Master Challenge Complete!</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 font-mono mt-1">
                  You conquered all 20 rounds with <strong className="text-red-400">{lives} of 3 Lives</strong> remaining! Final Run Score: <strong className="text-emerald-400">+{sessionScore.toLocaleString()} PTS</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenLeaderboard}
              className="flex items-center space-x-2 px-5 py-2.5 bg-amber-400 text-studio-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-amber-400/20 cursor-pointer"
            >
              <Trophy className="w-4 h-4" />
              <span>View Leaderboard</span>
            </button>
          </div>
        </div>
      )}

      {/* Daily Lockout Alert Banner */}
      {isDailyLocked && !isGameOver && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2.5 text-amber-300">
            <Award className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Daily Training Goal Met!</span>
              <span className="text-slate-400 block sm:inline sm:ml-2">
                You've completed all 20 rounds for Peak Master today. Resets tomorrow at midnight!
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onTogglePracticeMode && (
              <button
                onClick={() => onTogglePracticeMode(true)}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-purple-600/20"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Practice Mode</span>
              </button>
            )}
            {onNavigateToSandbox && (
              <button
                onClick={onNavigateToSandbox}
                className="px-3.5 py-1.5 rounded-xl bg-studio-accent text-studio-950 font-bold hover:brightness-110 transition-all cursor-pointer"
              >
                Practice in Sandbox
              </button>
            )}
            {onOpenLeaderboard && (
              <button
                onClick={onOpenLeaderboard}
                className="px-3.5 py-1.5 rounded-xl bg-studio-800 text-slate-200 hover:text-white border border-studio-700 transition-all cursor-pointer"
              >
                Leaderboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* ROUND 10 MILESTONE GRAPHIC OVERLAY */}
      {round10Milestone && (
        <div
          onClick={() => setRound10Milestone(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-milestoneFade" />

          {round10Milestone === 'extra_life' ? (
            <div className="relative z-10 max-w-md w-full px-8 py-8 rounded-3xl border-2 border-rose-400/80 bg-gradient-to-b from-rose-500/30 via-studio-900/95 to-studio-950/98 shadow-2xl shadow-rose-500/40 ring-4 ring-rose-500/20 flex flex-col items-center text-center animate-milestonePop">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-rose-500 via-red-500 to-pink-500 opacity-25 blur-xl animate-pulse" />

              <div className="relative flex items-center space-x-2 text-xs sm:text-sm font-mono font-extrabold tracking-widest uppercase text-rose-300 mb-3">
                <Sparkles className="w-4 h-4 text-rose-300 animate-spin" />
                <span>ROUND 10 CHECKPOINT REACHED!</span>
                <Sparkles className="w-4 h-4 text-rose-300 animate-spin" />
              </div>

              <div className="relative my-3 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-rose-500/20 border-2 border-rose-400/60 flex items-center justify-center shadow-[0_0_35px_rgba(244,63,94,0.6)] animate-bounce">
                  <Heart className="w-12 h-12 text-red-500 fill-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
                </div>
                <span className="absolute -top-1 -right-3 px-2.5 py-0.5 rounded-full bg-emerald-400 text-studio-950 font-mono font-black text-sm shadow-lg">
                  +1 ❤️
                </span>
              </div>

              <h3 className="relative text-3xl sm:text-4xl font-black font-mono tracking-tight text-white mt-2 drop-shadow-lg">
                EXTRA LIFE GAINED!
              </h3>

              <p className="relative text-xs sm:text-sm font-mono text-rose-200/90 mt-2">
                Halfway milestone! +1 Heart restored ({lives}/3 Lives active)
              </p>

              <span className="relative mt-4 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Click anywhere to continue
              </span>
            </div>
          ) : (
            <div className="relative z-10 max-w-md w-full px-8 py-8 rounded-3xl border-2 border-amber-400/90 bg-gradient-to-b from-amber-500/30 via-studio-900/95 to-studio-950/98 shadow-2xl shadow-amber-500/40 ring-4 ring-amber-400/25 flex flex-col items-center text-center animate-milestonePop">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 opacity-25 blur-xl animate-pulse" />

              <div className="relative flex items-center space-x-2 text-xs sm:text-sm font-mono font-extrabold tracking-widest uppercase text-amber-300 mb-3">
                <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
                <span>ROUND 10 FLAWLESS SURVIVAL!</span>
                <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
              </div>

              <div className="relative my-2 flex items-center justify-center space-x-2">
                {[1, 2, 3].map(i => (
                  <Heart
                    key={i}
                    className="w-8 h-8 text-red-500 fill-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-bounce"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>

              <div className="relative flex items-baseline space-x-2 my-1">
                <span className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]">
                  +100
                </span>
                <span className="text-xl sm:text-2xl font-mono font-bold text-amber-100">
                  BONUS PTS
                </span>
              </div>

              <p className="relative text-xs sm:text-sm font-mono text-emerald-300 font-bold mt-2 bg-emerald-950/80 px-3.5 py-1 rounded-full border border-emerald-500/40">
                All 3 Lives Intact &bull; Perfect Halfway Bonus!
              </p>

              <span className="relative mt-4 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Click anywhere to continue
              </span>
            </div>
          )}

          <style>{`
            @keyframes milestonePop {
              0% {
                opacity: 0;
                transform: scale(0.5) translateY(24px);
              }
              18% {
                opacity: 1;
                transform: scale(1.06) translateY(-4px);
              }
              28% {
                transform: scale(0.98) translateY(0);
              }
              85% {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
              100% {
                opacity: 0;
                transform: scale(1.03) translateY(-8px);
              }
            }
            @keyframes milestoneFade {
              0% { opacity: 0; }
              15% { opacity: 1; }
              85% { opacity: 1; }
              100% { opacity: 0; }
            }
            .animate-milestonePop {
              animation: milestonePop 3.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .animate-milestoneFade {
              animation: milestoneFade 3.2s ease-in-out forwards;
            }
          `}</style>
        </div>
      )}

    </div>
  );
};
