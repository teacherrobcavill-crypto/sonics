import React, { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { ChevronRight, Award, Sliders, Volume2, Sparkles, Crosshair, ArrowLeftRight, Headphones } from 'lucide-react';
import { FilterParams, RoundResult } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumDisplay } from '../SpectrumDisplay';
import { InlineTransport } from '../InlineTransport';
import {
  HPF_CUTOFFS,
  LPF_CUTOFFS,
  getWeightedFilterCutoff,
  formatFrequency,
  freqDistanceInOctaves,
  freqDistanceInSemitones
} from '../../utils/frequencies';

interface FilterDoctorGameProps {
  onRoundComplete: (result: RoundResult) => void;
  currentStreak: number;
  totalScore: number;
  remainingDailyRounds?: number;
  isCustomAudio?: boolean;
  onNavigateToSandbox?: () => void;
  onOpenLeaderboard?: () => void;
  isMobile?: boolean;
  isPracticeMode?: boolean;
  onTogglePracticeMode?: (enabled: boolean) => void;
  isActive?: boolean;
}

// Standard filter slopes available in Enhanced Mode (from 6 dB/oct up to 96 dB/oct)
const ENHANCED_SLOPES: readonly number[] = [6, 12, 18, 24, 36, 48, 72, 96];

function getSlopeScoreMultiplier(targetSlopeVal: number, userSlopeVal: number): number {
  const targetIdx = ENHANCED_SLOPES.indexOf(targetSlopeVal);
  const userIdx = ENHANCED_SLOPES.indexOf(userSlopeVal);
  const stepDiff = Math.abs((targetIdx >= 0 ? targetIdx : 3) - (userIdx >= 0 ? userIdx : 3));
  if (stepDiff === 0) return 1.0;
  if (stepDiff === 1) return 0.9;
  if (stepDiff === 2) return 0.8;
  return 0.7;
}

export const FilterDoctorGame: React.FC<FilterDoctorGameProps> = ({
  onRoundComplete,
  currentStreak,
  totalScore,
  remainingDailyRounds,
  isCustomAudio = false,
  onNavigateToSandbox,
  onOpenLeaderboard,
  isMobile = false,
  isPracticeMode = false,
  onTogglePracticeMode,
  isActive = true
}) => {
  const isDailyLocked = !isPracticeMode && !isCustomAudio && remainingDailyRounds !== undefined && remainingDailyRounds <= 0;


  const [slope, setSlope] = useState<number>(24); // 24 dB/oct default (standard mode)
  const [targetSlope, setTargetSlope] = useState<number>(24);
  const [userHpfSlope, setUserHpfSlope] = useState<number>(24);
  const [userLpfSlope, setUserLpfSlope] = useState<number>(24);
  const [activeFilterChoice, setActiveFilterChoice] = useState<'highpass' | 'lowpass'>('highpass');
  const [isEnhancedMode, setIsEnhancedMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('filter_doctor_enhanced') === 'true';
    } catch {
      return false;
    }
  });

  const activeUserSlope = activeFilterChoice === 'highpass' ? userHpfSlope : userLpfSlope;

  const handleToggleEnhancedMode = () => {
    const next = !isEnhancedMode;
    setIsEnhancedMode(next);
    try {
      localStorage.setItem('filter_doctor_enhanced', String(next));
    } catch {}
    if (!isRoundAnswered) {
      if (next) {
        // When activated, target slopes are randomized without modifying cutoffs or generating extra filters
        setTargetFilters(prev => prev.map(f => {
          const randSlope = ENHANCED_SLOPES[Math.floor(Math.random() * ENHANCED_SLOPES.length)];
          return { ...f, slope: randSlope };
        }));
      } else {
        setTargetSlope(slope);
        setUserHpfSlope(slope);
        setUserLpfSlope(slope);
        setTargetFilters(prev => prev.map(f => ({ ...f, slope: slope })));
      }
    }
  };

  const handleSlopeChange = (newSlope: number, filterType?: string) => {
    if (isRoundAnswered) return;
    if (!isEnhancedMode) return; // Slopes can only be altered in Enhanced Mode
    const target = (filterType === 'highpass' || filterType === 'lowpass') ? filterType : activeFilterChoice;
    if (target === 'highpass') {
      setUserHpfSlope(newSlope);
    } else {
      setUserLpfSlope(newSlope);
    }
    audioEngine.setListeningMode('user');
  };

  // Target mystery filter(s)
  const [targetFilters, setTargetFilters] = useState<FilterParams[]>([]);
  const isDualRound = targetFilters.length === 2;
  const isHpfActive = isDualRound || (targetFilters[0]?.type === 'highpass');
  const isLpfActive = isDualRound || (targetFilters[0]?.type === 'lowpass');

  // User interactive cutoff states - starts wide open at 25 Hz HPF & 18 kHz LPF
  const [userHpfFreq, setUserHpfFreq] = useState<number>(25);
  const [userLpfFreq, setUserLpfFreq] = useState<number>(18000);

  const [isRoundAnswered, setIsRoundAnswered] = useState(false);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [roundCount, setRoundCount] = useState(1);
  const [sessionScore, setSessionScore] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Generate User Filter array for real-time auditioning
  const currentUserFilters = useMemo<FilterParams[]>(() => {
    const list: FilterParams[] = [];
    if (isHpfActive) {
      list.push({
        type: 'highpass',
        frequency: userHpfFreq,
        gain: 0,
        q: 0.707,
        slope: userHpfSlope
      });
    }
    if (isLpfActive) {
      list.push({
        type: 'lowpass',
        frequency: userLpfFreq,
        gain: 0,
        q: 0.707,
        slope: userLpfSlope
      });
    }
    return list;
  }, [isHpfActive, isLpfActive, userHpfFreq, userLpfFreq, userHpfSlope, userLpfSlope]);

  // Synchronize user filter with AudioEngine in real time as user tweaks
  useEffect(() => {
    if (isActive && !isRoundAnswered) {
      audioEngine.setUserFilter(currentUserFilters);
    }
  }, [currentUserFilters, isRoundAnswered, isActive]);

  // Generate new HPF/LPF challenge (Mixed mode: cycles HPF -> LPF -> Both regularly)
  const generateNewRound = useCallback((targetRoundNumber?: number) => {
    const currentRound = typeof targetRoundNumber === 'number' ? targetRoundNumber : roundCount;
    const FILTER_CYCLE: ('highpass' | 'lowpass' | 'both')[] = ['highpass', 'lowpass', 'both'];
    const modeChoice = FILTER_CYCLE[(Math.max(1, currentRound) - 1) % FILTER_CYCLE.length];

    const chosenSlope = isEnhancedMode
      ? ENHANCED_SLOPES[Math.floor(Math.random() * ENHANCED_SLOPES.length)]
      : slope;
    setTargetSlope(chosenSlope);
    setUserHpfSlope(slope);
    setUserLpfSlope(slope);

    if (modeChoice === 'highpass') {
      setActiveFilterChoice('highpass');
    } else if (modeChoice === 'lowpass') {
      setActiveFilterChoice('lowpass');
    } else {
      setActiveFilterChoice('highpass');
    }

    const newTargets: FilterParams[] = [];

    if (modeChoice === 'both') {
      // Pick HPF cutoff between 40Hz and 1200Hz
      const hpfCandidates = HPF_CUTOFFS.filter(f => f <= 1200);
      const hpfCutoff = hpfCandidates[Math.floor(Math.random() * hpfCandidates.length)];

      // Pick LPF cutoff between 2000Hz and 16000Hz
      const lpfCandidates = LPF_CUTOFFS.filter(f => f >= 2000);
      const lpfCutoff = lpfCandidates[Math.floor(Math.random() * lpfCandidates.length)];

      const hpfTargetSlope = isEnhancedMode
        ? ENHANCED_SLOPES[Math.floor(Math.random() * ENHANCED_SLOPES.length)]
        : slope;
      const lpfTargetSlope = isEnhancedMode
        ? ENHANCED_SLOPES[Math.floor(Math.random() * ENHANCED_SLOPES.length)]
        : slope;

      newTargets.push({
        type: 'highpass',
        frequency: hpfCutoff,
        gain: 0,
        q: 0.707,
        slope: hpfTargetSlope
      });
      newTargets.push({
        type: 'lowpass',
        frequency: lpfCutoff,
        gain: 0,
        q: 0.707,
        slope: lpfTargetSlope
      });

      // Starting positions requested: 25 Hz for HPF, 18 kHz for LPF
      setUserHpfFreq(25);
      setUserLpfFreq(18000);
    } else {
      const cutoff = getWeightedFilterCutoff(modeChoice);
      newTargets.push({
        type: modeChoice,
        frequency: cutoff,
        gain: 0,
        q: 0.707,
        slope: chosenSlope
      });

      if (modeChoice === 'highpass') {
        setUserHpfFreq(25);
      } else {
        setUserLpfFreq(18000);
      }
    }

    setTargetFilters(newTargets);

    // Initial user filters sent to engine: starting at 25 Hz HPF & 18 kHz LPF
    const initialUser: FilterParams[] = modeChoice === 'both' ? [
      { type: 'highpass', frequency: 25, gain: 0, q: 0.707, slope: slope },
      { type: 'lowpass', frequency: 18000, gain: 0, q: 0.707, slope: slope }
    ] : [
      { type: modeChoice, frequency: modeChoice === 'highpass' ? 25 : 18000, gain: 0, q: 0.707, slope: slope }
    ];

    if (isActive) {
      audioEngine.setTargetFilter(newTargets);
      audioEngine.setUserFilter(initialUser);
      audioEngine.setListeningMode('target');
    }

    setIsRoundAnswered(false);
    setLastRoundResult(null);
    setStartTime(Date.now());
  }, [roundCount, slope, isEnhancedMode, isActive]);

  useEffect(() => {
    generateNewRound(1);
  }, []);

  // Re-sync AudioEngine when Filter Doctor becomes active
  useEffect(() => {
    if (isActive && targetFilters.length > 0) {
      audioEngine.setMonoMode(false);
      audioEngine.setCorrectionMode(false);
      audioEngine.setStemMode(false);
      audioEngine.resetDbLevels();
      audioEngine.setTargetPan(0);
      audioEngine.setUserPan(0);
      audioEngine.setTargetFilter(targetFilters);
      audioEngine.setUserFilter(currentUserFilters);
      audioEngine.setListeningMode('target');
    }
  }, [isActive]);

  // Click or drag on Spectrum Display frequency dots & canvas
  const handleNodeDrag = (freq: number, filterType?: string) => {
    if (isRoundAnswered || isDailyLocked) return;
    const clamped = Math.max(20, Math.min(20000, Math.round(freq)));

    if (filterType === 'highpass') {
      setActiveFilterChoice('highpass');
      const maxHpf = isDualRound ? Math.min(5000, userLpfFreq - 50) : 5000;
      setUserHpfFreq(Math.max(20, Math.min(maxHpf, clamped)));
    } else if (filterType === 'lowpass') {
      setActiveFilterChoice('lowpass');
      const minLpf = isDualRound ? Math.max(50, userHpfFreq + 50) : 50;
      setUserLpfFreq(Math.max(minLpf, Math.min(20000, clamped)));
    } else {
      // Fallback if filterType wasn't explicitly determined
      if (isDualRound) {
        if (clamped < 1500 || Math.abs(clamped - userHpfFreq) < Math.abs(clamped - userLpfFreq)) {
          setActiveFilterChoice('highpass');
          const maxHpf = Math.min(5000, userLpfFreq - 50);
          setUserHpfFreq(Math.max(20, Math.min(maxHpf, clamped)));
        } else {
          setActiveFilterChoice('lowpass');
          const minLpf = Math.max(50, userHpfFreq + 50);
          setUserLpfFreq(Math.max(minLpf, Math.min(20000, clamped)));
        }
      } else if (isHpfActive) {
        setActiveFilterChoice('highpass');
        setUserHpfFreq(Math.max(20, Math.min(5000, clamped)));
      } else if (isLpfActive) {
        setActiveFilterChoice('lowpass');
        setUserLpfFreq(Math.max(50, Math.min(20000, clamped)));
      }
    }

    audioEngine.setListeningMode('user');
  };

  const handleBandSelect = (freq: number) => {
    handleNodeDrag(freq);
  };

  // Nudge frequency helpers
  const handleNudgeHpf = (factor: number) => {
    if (isRoundAnswered || isDailyLocked) return;
    const next = Math.max(20, Math.min(isDualRound ? userLpfFreq - 50 : 5000, Math.round(userHpfFreq * factor)));
    setUserHpfFreq(next);
    audioEngine.setListeningMode('user');
  };

  const handleNudgeLpf = (factor: number) => {
    if (isRoundAnswered || isDailyLocked) return;
    const next = Math.max(isDualRound ? userHpfFreq + 50 : 50, Math.min(20000, Math.round(userLpfFreq * factor)));
    setUserLpfFreq(next);
    audioEngine.setListeningMode('user');
  };

  // Submit Guess
  const handleSubmitGuess = () => {
    if (targetFilters.length === 0 || isRoundAnswered || isDailyLocked) return;

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const baseMaxScore = isDualRound ? 200 : 100;
    const maxScore = isEnhancedMode ? Math.round(baseMaxScore * 1.25) : baseMaxScore;
    let totalScore = 0;

    let primaryTarget: FilterParams = targetFilters[0];
    let primaryGuess: FilterParams = currentUserFilters[0] || targetFilters[0];
    let distOct = 0;
    let distSemi = 0;

    let target2Param: FilterParams | undefined = undefined;
    let guess2Param: FilterParams | undefined = undefined;


    if (isDualRound) {
      const targetHpf = targetFilters.find(f => f.type === 'highpass') || targetFilters[0];
      const targetLpf = targetFilters.find(f => f.type === 'lowpass') || targetFilters[1];

      const hpfDist = freqDistanceInOctaves(userHpfFreq, targetHpf.frequency);
      const lpfDist = freqDistanceInOctaves(userLpfFreq, targetLpf.frequency);

      const halfMax = isEnhancedMode ? 125 : 100;
      // Spot on within 1 semitone (0.08 octaves) gives full halfMax
      let hpfScore = hpfDist <= 0.08 ? halfMax : Math.max(0, Math.round(halfMax * Math.pow(Math.max(0, 1 - hpfDist / 2.0), 1.5)));
      let lpfScore = lpfDist <= 0.08 ? halfMax : Math.max(0, Math.round(halfMax * Math.pow(Math.max(0, 1 - lpfDist / 2.0), 1.5)));

      if (isEnhancedMode) {
        const hpfTargetSlope = targetHpf.slope || targetSlope;
        const lpfTargetSlope = targetLpf.slope || targetSlope;
        const hpfSlopeMult = getSlopeScoreMultiplier(hpfTargetSlope, userHpfSlope);
        const lpfSlopeMult = getSlopeScoreMultiplier(lpfTargetSlope, userLpfSlope);
        hpfScore = Math.round(hpfScore * hpfSlopeMult);
        lpfScore = Math.round(lpfScore * lpfSlopeMult);
      }
      totalScore = hpfScore + lpfScore;

      primaryTarget = { ...targetHpf };
      primaryGuess = { type: 'highpass', frequency: userHpfFreq, gain: 0, q: 0.707, slope: userHpfSlope };
      target2Param = { ...targetLpf };
      guess2Param = { type: 'lowpass', frequency: userLpfFreq, gain: 0, q: 0.707, slope: userLpfSlope };

      distOct = (hpfDist + lpfDist) / 2;
      distSemi = distOct * 12;
    } else {
      const target = targetFilters[0];
      const guessFreq = target.type === 'highpass' ? userHpfFreq : userLpfFreq;
      const guessSlope = target.type === 'highpass' ? userHpfSlope : userLpfSlope;
      distOct = freqDistanceInOctaves(guessFreq, target.frequency);
      distSemi = freqDistanceInSemitones(guessFreq, target.frequency);

      // Spot on within 1 semitone gives full points
      let rawScore = distOct <= 0.08 ? maxScore : Math.max(0, Math.round(maxScore * Math.pow(Math.max(0, 1 - distOct / 2.0), 1.5)));
      if (isEnhancedMode) {
        const slopeMult = getSlopeScoreMultiplier(target.slope || targetSlope, guessSlope);
        rawScore = Math.round(rawScore * slopeMult);
      }
      totalScore = rawScore;

      primaryTarget = { ...target };
      primaryGuess = { type: target.type, frequency: guessFreq, gain: 0, q: 0.707, slope: guessSlope };
    }

    if (isPracticeMode) {
      totalScore = 0;
    }

    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'filter_doctor',
      target: primaryTarget,
      guess: primaryGuess,
      freqDistanceOctaves: distOct,
      freqDistanceSemitones: distSemi,
      gainDistanceDb: 0,
      isFilterTypeCorrect: true,
      isDirectionCorrect: true,
      score: totalScore,
      timeSpentSeconds: elapsedSeconds,
      timestamp: Date.now(),
      target2: target2Param,
      guess2: guess2Param
    };

    setIsRoundAnswered(true);
    setLastRoundResult(result);
    setSessionScore(prev => prev + totalScore);
    onRoundComplete(result);

    const isExact = totalScore === maxScore;
    if (isExact || totalScore >= Math.round(maxScore * 0.85)) {
      confetti({
        particleCount: isExact ? 70 : 35,
        spread: 60,
        origin: { y: 0.7 }
      });
    }
  };

  const handleNextRound = () => {
    const nextRound = roundCount + 1;
    setRoundCount(nextRound);
    generateNewRound(nextRound);
  };

  const baseMaxPoints = isDualRound ? 200 : 100;
  const maxPossiblePoints = isEnhancedMode ? Math.round(baseMaxPoints * 1.25) : baseMaxPoints;

  return (
    <div className={isMobile ? 'space-y-2.5' : 'space-y-6'}>
      
      {/* Settings Header */}
      <div className={`flex ${isMobile ? 'flex-col items-stretch gap-2 p-2.5' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl shadow-lg`}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider bg-studio-neonOrange/20 text-studio-neonOrange rounded-lg border border-studio-neonOrange/30`}>
                {isPracticeMode ? `Round ${roundCount} (Practice)` : `Round ${roundCount}`}
              </span>
              {isPracticeMode ? (
                <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm`}>
                  <Headphones className="w-3.5 h-3.5 text-purple-400" /> Practice Mode (0 PTS)
                </span>
              ) : isCustomAudio ? (
                <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm`}>
                  📁 Custom Audio {isMobile ? '' : '(Unlimited • Unranked)'}
                </span>
              ) : (
                remainingDailyRounds !== undefined && (
                  <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border ${
                    remainingDailyRounds > 10
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : remainingDailyRounds > 3
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    🎯 {remainingDailyRounds}/20 Left
                  </span>
                )
              )}
            </div>
            {isMobile && (
              <h2 className="text-sm font-bold text-white flex items-baseline gap-1.5">
                <span>Filter Doctor</span>
                <span className="text-[10px] font-normal text-slate-400">(HPF & LPF)</span>
              </h2>
            )}
          </div>

          {!isMobile && (
            <h2 className="text-xl mt-1.5 font-bold text-white flex flex-wrap items-baseline gap-2">
              <span>Filter Doctor</span>
              <span className="text-xs font-normal text-slate-400">(Interactive HPF & LPF Cutoff)</span>
            </h2>
          )}

          <p className={`${isMobile ? 'text-[11px] whitespace-nowrap truncate mt-1' : 'text-xs mt-1 leading-relaxed'} text-slate-400`}>
            {isMobile
              ? 'Drag filter cutoffs or faders • Compare [B] Target vs [C] Yours!'
              : 'Click & tweak the filter cutoffs in real time • A/B between [B] Target and [C] Your Version until they sound identical!'}
          </p>
        </div>

        {/* Slope & Enhanced Mode Controls */}
        <div className={`flex items-center ${isMobile ? 'justify-between w-full gap-2' : 'gap-2 shrink-0'} font-mono`}>
            {/* Enhanced Mode Toggle Button */}
            <button
              onClick={handleToggleEnhancedMode}
              className={`flex items-center gap-1 rounded-xl font-bold cursor-pointer transition-all border ${
                isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
              } ${
                isEnhancedMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/20'
                  : 'bg-studio-950 text-slate-400 border-studio-800 hover:text-white'
              }`}
              title="Enhanced Mode: dynamically alter slope via mouse wheel or mobile slider for +25% bonus points!"
            >
              <span>⚡ {isMobile ? 'Enhanced' : 'Enhanced Mode'}</span>
              <span className={`px-1 rounded text-[9px] ${isEnhancedMode ? 'bg-amber-400 text-studio-950 font-black' : 'bg-studio-800 text-amber-400'}`}>
                +25%
              </span>
            </button>

            {/* Slope Selector / Indicator */}
            <div className={`flex items-center bg-studio-950 ${isMobile ? 'p-0.5 space-x-0.5 text-[10px]' : 'p-1 space-x-1.5 text-xs'} rounded-xl border border-studio-800 shrink-0`}>
              <span className={`text-slate-400 ${isMobile ? 'px-1' : 'px-2'}`}>Slope:</span>
              {isEnhancedMode ? (
                isDualRound ? (
                  <div className="flex items-center space-x-1 font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveFilterChoice('highpass')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                        activeFilterChoice === 'highpass'
                          ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Select HPF to alter its slope"
                    >
                      HPF: {userHpfSlope}dB
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilterChoice('lowpass')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                        activeFilterChoice === 'lowpass'
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Select LPF to alter its slope"
                    >
                      LPF: {userLpfSlope}dB
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 px-1.5 py-0.5 text-amber-300 font-bold">
                    <span>{isHpfActive ? 'HPF' : 'LPF'}: {activeUserSlope} dB/oct</span>
                    <span className="text-[9px] text-slate-500 font-normal hidden sm:inline">(6–96dB)</span>
                  </div>
                )
              ) : (
                <span className="font-bold text-white px-2 py-0.5">
                  {isMobile ? '24dB' : '24 dB/oct'}
                </span>
              )}
            </div>
          </div>
        </div>

      {/* Real-time Filter Challenge Banner */}
      {isDualRound ? (
        <div className={`bg-purple-500/15 border border-purple-500/40 ${isMobile ? 'px-2.5 py-1.5 items-center justify-between gap-2 rounded-xl text-[10px]' : 'p-3.5 items-center justify-between rounded-2xl text-xs'} flex font-mono shadow-lg shadow-purple-500/5`}>
          <div className="flex items-center space-x-2 text-purple-200 min-w-0">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping shrink-0" />
            <div className="truncate">
              <strong className="text-purple-300 font-bold uppercase tracking-wider">⚡ {isMobile ? 'Dual Filter:' : 'Both Filters Active:'}</strong>
              <span className="text-purple-100 ml-1">
                {isMobile ? 'Match HPF & LPF cutoffs' : 'Both High-Pass (low cut) AND Low-Pass (high cut) are applied! Move both cutoffs to match.'}
              </span>
            </div>
          </div>
          <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} bg-purple-500/25 text-purple-200 rounded-lg border border-purple-400/30 font-bold shrink-0`}>
            {isMobile ? `Up to ${maxPossiblePoints} PTS` : `Dual Match • Up to ${maxPossiblePoints} PTS`}
          </span>
        </div>
      ) : isHpfActive ? (
        <div className={`bg-cyan-500/15 border border-cyan-500/40 ${isMobile ? 'px-2.5 py-1.5 items-center justify-between gap-2 rounded-xl text-[10px]' : 'p-3.5 items-center justify-between rounded-2xl text-xs'} flex font-mono shadow-lg shadow-cyan-500/5`}>
          <div className="flex items-center space-x-2 text-cyan-200 min-w-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <div className="truncate">
              <strong className="text-cyan-300 font-bold uppercase tracking-wider">{isMobile ? 'HPF Active:' : 'High-Pass Filter (HPF):'}</strong>
              <span className="text-cyan-100 ml-1">
                {isMobile ? 'Low end cut • Find HPF cutoff' : 'Sub-bass and low frequencies are cut. Click the spectrum or drag the HPF slider to find the cutoff.'}
              </span>
            </div>
          </div>
          <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} bg-cyan-500/25 text-cyan-200 rounded-lg border border-cyan-400/30 font-bold shrink-0`}>
            {isMobile ? `Up to ${maxPossiblePoints} PTS` : `HPF Match • Up to ${maxPossiblePoints} PTS`}
          </span>
        </div>
      ) : (
        <div className={`bg-amber-500/15 border border-amber-500/40 ${isMobile ? 'px-2.5 py-1.5 items-center justify-between gap-2 rounded-xl text-[10px]' : 'p-3.5 items-center justify-between rounded-2xl text-xs'} flex font-mono shadow-lg shadow-amber-500/5`}>
          <div className="flex items-center space-x-2 text-amber-200 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <div className="truncate">
              <strong className="text-amber-300 font-bold uppercase tracking-wider">{isMobile ? 'LPF Active:' : 'Low-Pass Filter (LPF):'}</strong>
              <span className="text-amber-100 ml-1">
                {isMobile ? 'High end cut • Find LPF cutoff' : 'High-end air and sparkle are cut. Click the spectrum or drag the LPF slider to find the cutoff.'}
              </span>
            </div>
          </div>
          <span className={`${isMobile ? 'px-2.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} bg-amber-500/25 text-amber-200 rounded-lg border border-amber-400/30 font-bold shrink-0`}>
            {isMobile ? `Up to ${maxPossiblePoints} PTS` : `LPF Match • Up to ${maxPossiblePoints} PTS`}
          </span>
        </div>
      )}

      {/* Clickable & Draggable Visual Spectrum Display */}
      <SpectrumDisplay
        targetFilter={targetFilters}
        userFilter={currentUserFilters}
        showTargetCurve={isRoundAnswered}
        targetFreqMarker={isRoundAnswered ? targetFilters.map(f => f.frequency) : null}
        isInteractiveBand={!isRoundAnswered}
        onBandSelect={handleBandSelect}
        onNodeDrag={handleNodeDrag}
        height={isMobile ? 210 : 260}
        onSlopeChange={!isRoundAnswered && isEnhancedMode ? handleSlopeChange : undefined}
        currentSlope={activeUserSlope}
        isMobile={isMobile}
      />

      {/* Unified Action Strip: Play / Flat [A] / Target [B] / Your Filter [C] + Submit + Result */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3 flex-col items-stretch gap-2.5' : 'p-2.5 flex-wrap items-center gap-3 sm:gap-4'} rounded-2xl shadow-xl flex`}>
        {/* Play controls with live A/B/C testing */}
        <InlineTransport
          bypassLabel="[A] FLAT"
          targetLabel={isMobile ? '[B] TARGET' : '[B] TARGET FILTER'}
          userMatchLabel={isMobile ? '[C] YOURS' : '[C] YOUR VERSION'}
          showUserMatch={true}
          isMobile={isMobile}
        />

        {!isMobile && <div className="hidden sm:block h-6 w-px bg-studio-800" />}

        {/* Action Controls */}
        {!isRoundAnswered ? (
          isDailyLocked ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700/50 w-full text-center"
            >
              Daily Limit Reached (20/20)
            </button>
          ) : isMobile ? (
            <div className="flex items-center gap-2 w-full min-w-0">
              {/* Mobile Slope Slider Sat Next to Submit Button (Enhanced Mode only) */}
              {isEnhancedMode && (
                <div className="flex flex-col justify-center bg-studio-950 border border-studio-800 rounded-xl px-2 py-1 shrink-0 shadow-inner">
                  <div className="flex items-center justify-between w-20 sm:w-24 text-[9px] font-mono">
                    {isDualRound ? (
                      <button
                        type="button"
                        onClick={() => setActiveFilterChoice(prev => prev === 'highpass' ? 'lowpass' : 'highpass')}
                        className="text-amber-400 font-bold uppercase underline decoration-dotted cursor-pointer"
                        title="Tap to switch between HPF and LPF slope adjustment"
                      >
                        {activeFilterChoice === 'highpass' ? 'HPF' : 'LPF'} ⇄
                      </button>
                    ) : (
                      <span className="text-amber-400 font-bold uppercase">
                        ⚡ Slope
                      </span>
                    )}
                    <span className="text-white font-bold">{activeUserSlope}dB</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={ENHANCED_SLOPES.length - 1}
                    step="1"
                    value={Math.max(0, ENHANCED_SLOPES.indexOf(activeUserSlope))}
                    disabled={isRoundAnswered}
                    onChange={e => {
                      const idx = Number(e.target.value);
                      handleSlopeChange(ENHANCED_SLOPES[idx], activeFilterChoice);
                    }}
                    className="w-20 sm:w-24 h-1.5 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-studio-neonOrange mt-1"
                    aria-label="Filter Slope dB per octave"
                  />
                  <div className="flex justify-between w-20 sm:w-24 text-[8px] font-mono text-slate-500">
                    <span className={activeUserSlope === 6 ? 'text-amber-400 font-bold' : ''}>
                      6dB
                    </span>
                    <span className={activeUserSlope === 96 ? 'text-amber-400 font-bold' : ''}>
                      96dB
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmitGuess}
                disabled={isDailyLocked}
                className={`flex-1 min-w-0 py-3 px-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 text-center truncate ${
                  isDailyLocked
                    ? 'bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700'
                    : 'bg-studio-neonOrange text-studio-950 shadow-studio-neonOrange/25 hover:brightness-110 cursor-pointer'
                }`}
              >
                {isDailyLocked ? 'Daily Limit Reached' : `Submit Guess • ${maxPossiblePoints} PTS`}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubmitGuess}
              disabled={isDailyLocked}
              className={`px-6 py-3 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 w-full sm:w-auto text-center ${
                isDailyLocked
                  ? 'bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700'
                  : 'bg-studio-neonOrange text-studio-950 shadow-studio-neonOrange/25 hover:brightness-110 cursor-pointer'
              }`}
            >
              {isDailyLocked ? 'Daily Limit Reached' : `Submit Filter Guess • Up to ${maxPossiblePoints} PTS`}
            </button>
          )
        ) : (
          <>
            {/* Next Round button placed to the left of the points */}
            <button
              onClick={handleNextRound}
              className={`px-6 py-3 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-neonGreen text-studio-950 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-1.5 shadow-lg shadow-studio-neonGreen/20 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'}`}
            >
              <span>Next Round</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {lastRoundResult && (
              <>
                {/* Points Awarded */}
                <div className={`px-3 py-2 rounded-xl border font-bold font-mono text-xs flex items-center justify-center space-x-1.5 ${
                  lastRoundResult.score >= Math.round(maxPossiblePoints * 0.8)
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : lastRoundResult.score > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  <Award className="w-4 h-4 shrink-0" />
                  <span>
                    +{lastRoundResult.score.toLocaleString()} PTS
                    {lastRoundResult.score === maxPossiblePoints ? ' • BULLSEYE!' : ''}
                  </span>
                </div>

                {/* Target & Guess Readout */}
                <div className="text-xs font-mono bg-studio-950/80 px-3 py-2 rounded-xl border border-studio-800 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-slate-400">Target:</span>
                  <span className="text-emerald-400 font-bold">
                    {targetFilters.map(f => `${f.type === 'highpass' ? 'HPF' : 'LPF'} ${formatFrequency(f.frequency)}${isEnhancedMode ? ` (${f.slope || targetSlope} dB/oct)` : ''}`).join(' + ')}
                    {!isEnhancedMode && <span className="text-emerald-300/80 text-[11px] ml-1">({targetSlope} dB/oct)</span>}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">Your Cutoffs:</span>
                  <span className="text-amber-400 font-bold">
                    {currentUserFilters.map(f => `${f.type === 'highpass' ? 'HPF' : 'LPF'} ${formatFrequency(f.frequency)}${isEnhancedMode ? ` (${f.slope || (f.type === 'highpass' ? userHpfSlope : userLpfSlope)} dB/oct)` : ''}`).join(' + ')}
                    {!isEnhancedMode && <span className="text-amber-300/80 text-[11px] ml-1">({slope} dB/oct)</span>}
                  </span>
                  {isEnhancedMode && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-studio-800/80 text-studio-accent border border-studio-700">
                      {isDualRound
                        ? `HPF: ${userHpfSlope} vs ${targetFilters.find(f => f.type === 'highpass')?.slope || targetSlope} dB/oct | LPF: ${userLpfSlope} vs ${targetFilters.find(f => f.type === 'lowpass')?.slope || targetSlope} dB/oct`
                        : `${currentUserFilters[0]?.slope || userHpfSlope} dB/oct vs Target ${targetFilters[0]?.slope || targetSlope} dB/oct`}
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Daily Lockout Alert Banner */}
      {isDailyLocked && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2.5 text-amber-300">
            <Award className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Daily Training Goal Met!</span>
              <span className="text-slate-400 block sm:inline sm:ml-2">
                You've completed all 20 rounds for Filter Doctor today. Resets tomorrow at midnight!
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

      {/* Tactile Real-Time Cutoff Fader Controls (Replacing the static buttons) */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3.5' : 'p-5'} rounded-2xl space-y-4`}>
        <div className={`flex ${isMobile ? 'flex-col items-start gap-1' : 'items-center justify-between'} border-b border-studio-800 pb-3`}>
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-studio-accent shrink-0" />
            <span className="text-xs font-mono font-medium text-slate-300 uppercase tracking-wider">
              {isMobile ? 'Tactile Filter Cutoff Faders' : 'Tactile Filter Cutoff Controls (Click & hold frequency dots on spectrum, or adjust faders below)'}
            </span>
          </div>
          {!isMobile && (
            <span className="text-xs font-mono text-slate-400">
              Audition [C] while adjusting to hear changes live
            </span>
          )}
        </div>

        <div className={`grid gap-4 sm:gap-5 ${isMobile ? 'grid-cols-1' : isDualRound ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          
          {/* HPF Cutoff Fader (if active) */}
          {isHpfActive && (
            <div className="p-4 bg-studio-950 border border-cyan-500/30 rounded-xl space-y-3 shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span className="text-cyan-300 font-bold uppercase tracking-wider">High-Pass Filter (Low Cut)</span>
                </div>
                <span className="text-white font-bold text-sm bg-studio-900 px-2 py-0.5 rounded border border-studio-800">
                  {formatFrequency(userHpfFreq)}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="20"
                max={isDualRound ? Math.min(5000, userLpfFreq - 50) : 5000}
                step="1"
                value={userHpfFreq}
                disabled={isRoundAnswered}
                onChange={e => {
                  setUserHpfFreq(parseFloat(e.target.value));
                  audioEngine.setListeningMode('user');
                }}
                className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />

              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>20 Hz</span>
                <span>150 Hz</span>
                <span>600 Hz</span>
                <span>{isDualRound ? `${formatFrequency(userLpfFreq)} (LPF)` : '5 kHz'}</span>
              </div>

              {/* Nudge Buttons */}
              {!isRoundAnswered && (
                <div className="flex items-center justify-between pt-1 text-[11px] font-mono">
                  <span className="text-slate-500 text-[10px]">Fine Nudge:</span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleNudgeHpf(Math.pow(2, -1 / 3))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="-1/3 Octave"
                    >
                      &larr; -1/3 Oct
                    </button>
                    <button
                      onClick={() => handleNudgeHpf(Math.pow(2, -1 / 12))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="-1 Semitone"
                    >
                      -1 St
                    </button>
                    <button
                      onClick={() => handleNudgeHpf(Math.pow(2, 1 / 12))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="+1 Semitone"
                    >
                      +1 St
                    </button>
                    <button
                      onClick={() => handleNudgeHpf(Math.pow(2, 1 / 3))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="+1/3 Octave"
                    >
                      +1/3 Oct &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LPF Cutoff Fader (if active) */}
          {isLpfActive && (
            <div className="p-4 bg-studio-950 border border-amber-500/30 rounded-xl space-y-3 shadow-inner">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-amber-300 font-bold uppercase tracking-wider">Low-Pass Filter (High Cut)</span>
                </div>
                <span className="text-white font-bold text-sm bg-studio-900 px-2 py-0.5 rounded border border-studio-800">
                  {formatFrequency(userLpfFreq)}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={isDualRound ? Math.max(50, userHpfFreq + 50) : 50}
                max="20000"
                step="1"
                value={userLpfFreq}
                disabled={isRoundAnswered}
                onChange={e => {
                  setUserLpfFreq(parseFloat(e.target.value));
                  audioEngine.setListeningMode('user');
                }}
                className="w-full h-2 bg-studio-900 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />

              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>{isDualRound ? `${formatFrequency(userHpfFreq)} (HPF)` : '50 Hz'}</span>
                <span>1 kHz</span>
                <span>5 kHz</span>
                <span>20 kHz</span>
              </div>

              {/* Nudge Buttons */}
              {!isRoundAnswered && (
                <div className="flex items-center justify-between pt-1 text-[11px] font-mono">
                  <span className="text-slate-500 text-[10px]">Fine Nudge:</span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleNudgeLpf(Math.pow(2, -1 / 3))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="-1/3 Octave"
                    >
                      &larr; -1/3 Oct
                    </button>
                    <button
                      onClick={() => handleNudgeLpf(Math.pow(2, -1 / 12))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="-1 Semitone"
                    >
                      -1 St
                    </button>
                    <button
                      onClick={() => handleNudgeLpf(Math.pow(2, 1 / 12))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="+1 Semitone"
                    >
                      +1 St
                    </button>
                    <button
                      onClick={() => handleNudgeLpf(Math.pow(2, 1 / 3))}
                      className="px-2 py-1 bg-studio-900 hover:bg-studio-800 text-slate-300 hover:text-white rounded border border-studio-800 cursor-pointer"
                      title="+1/3 Octave"
                    >
                      +1/3 Oct &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
