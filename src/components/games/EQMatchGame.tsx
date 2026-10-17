import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { ChevronRight, Award, Sliders, Volume2, CheckCircle2, RotateCcw, Lightbulb, HelpCircle, Compass } from 'lucide-react';
import { FilterParams, FilterType, RoundResult } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumDisplay } from '../SpectrumDisplay';
import { InlineTransport } from '../InlineTransport';
import {
  ISO_OCTAVE_THIRD,
  formatFrequency,
  formatGain,
  freqDistanceInOctaves,
  freqDistanceInSemitones,
  calculateScore,
  getWeightedPeakMasterFrequency,
  getWeightedLowShelfFrequency,
  getWeightedHighShelfFrequency,
  MIN_FREQ,
  MAX_FREQ
} from '../../utils/frequencies';

export type FilterSelectionMode = 'auto' | 'peaking' | 'lowshelf' | 'highshelf';

function getFrequencyRegister(freq: number): { name: string; range: string } {
  if (freq < 120) return { name: 'Sub & Deep Bass', range: '50 Hz – 120 Hz' };
  if (freq < 350) return { name: 'Warmth & Low-Mids', range: '120 Hz – 350 Hz' };
  if (freq < 1500) return { name: 'Body & Midrange', range: '350 Hz – 1.5 kHz' };
  if (freq < 5000) return { name: 'Clarity & High-Mids', range: '1.5 kHz – 5 kHz' };
  return { name: 'Presence & Air / Highs', range: '5 kHz – 15 kHz' };
}

interface EQMatchGameProps {
  onRoundComplete: (result: RoundResult) => void;
  currentStreak: number;
  totalScore: number;
  remainingDailyRounds?: number;
  isCustomAudio?: boolean;
  onNavigateToSandbox?: () => void;
  onOpenLeaderboard?: () => void;
  isMobile?: boolean;
}

export const EQMatchGame: React.FC<EQMatchGameProps> = ({
  onRoundComplete,
  currentStreak,
  totalScore,
  remainingDailyRounds,
  isCustomAudio = false,
  onNavigateToSandbox,
  onOpenLeaderboard,
  isMobile = false
}) => {
  const isDailyLocked = !isCustomAudio && remainingDailyRounds !== undefined && remainingDailyRounds <= 0;
  const [filterType, setFilterType] = useState<FilterType>('peaking');

  // Hints state: up to 3 hints per round, -33% score penalty per hint
  const [hintsUsed, setHintsUsed] = useState<number>(0);

  // Target Filter
  const [targetFilter, setTargetFilter] = useState<FilterParams | null>(null);

  // User Live Interactive Filter
  const [userFreq, setUserFreq] = useState<number>(1000);
  const [userGain, setUserGain] = useState<number>(0);
  const [userQ, setUserQ] = useState<number>(1.41);

  const [isRoundAnswered, setIsRoundAnswered] = useState(false);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [roundCount, setRoundCount] = useState(1);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Generate new challenge (80% parametric bell, 10% low shelf, 10% high shelf)
  const generateNewRound = useCallback(() => {
    let nextType: FilterType;

    // Skewed: 80% parametric (peaking), 10% low shelf, 10% high shelf
    const rand = Math.random();
    if (rand < 0.80) {
      nextType = 'peaking';
    } else if (rand < 0.90) {
      nextType = 'lowshelf';
    } else {
      nextType = 'highshelf';
    }

    setFilterType(nextType);

    let randomFreq: number;
    if (nextType === 'lowshelf') {
      // Strictly 50 Hz to 1000 Hz (no sub 50Hz options)
      randomFreq = getWeightedLowShelfFrequency(50, 1000);
    } else if (nextType === 'highshelf') {
      // Strictly 1000 Hz to 15000 Hz (no above 15kHz options)
      randomFreq = getWeightedHighShelfFrequency(1000, 15000);
    } else {
      // Parametric: strictly 50 Hz to 15000 Hz
      const candidates = ISO_OCTAVE_THIRD.filter(f => f >= 50 && f <= 15000);
      randomFreq = getWeightedPeakMasterFrequency(candidates);
    }
    
    // Pick gain between +/- 6 and +/- 12 dB (strictly capped at 12 dB)
    const gainMagnitudes = [6, 9, 12];
    const magnitude = Math.min(12, gainMagnitudes[Math.floor(Math.random() * gainMagnitudes.length)]);
    const sign = Math.random() > 0.4 ? 1 : -1;
    const gain = Math.max(-12, Math.min(12, magnitude * sign));

    const target: FilterParams = {
      type: nextType,
      frequency: randomFreq,
      gain: gain,
      q: 1.41
    };

    setTargetFilter(target);
    audioEngine.setTargetFilter(target);

    // Initial user settings matching valid bounds
    const initialFreq = nextType === 'lowshelf' ? 250 : nextType === 'highshelf' ? 4000 : 1000;
    setUserFreq(initialFreq);
    setUserGain(0);
    setUserQ(1.41);

    const initialUser: FilterParams = {
      type: nextType,
      frequency: initialFreq,
      gain: 0,
      q: 1.41
    };
    audioEngine.setUserFilter(initialUser);

    // Set listening to Target EQ first
    audioEngine.setListeningMode('target');

    setHintsUsed(0);
    setIsRoundAnswered(false);
    setLastRoundResult(null);
    setStartTime(Date.now());
  }, []);

  const handleRequestHint = () => {
    if (isRoundAnswered || hintsUsed >= 3) return;
    setHintsUsed(prev => prev + 1);
  };

  useEffect(() => {
    generateNewRound();
  }, [generateNewRound]);

  useEffect(() => {
    audioEngine.setCorrectionMode(true);
    return () => {
      audioEngine.setCorrectionMode(false);
    };
  }, []);

  // Update user filter in real-time as they adjust sliders or drag
  const handleUserFilterChange = (params: { frequency: number; gain: number; q?: number }) => {
    if (isRoundAnswered) return;
    let nextFreq = params.frequency;
    const minBound = 50;
    const maxBound = 15000;
    // Bound user frequency based on filter type
    if (filterType === 'lowshelf') {
      nextFreq = Math.min(1000, Math.max(minBound, nextFreq));
    } else if (filterType === 'highshelf') {
      nextFreq = Math.max(1000, Math.min(maxBound, nextFreq));
    } else {
      nextFreq = Math.max(minBound, Math.min(maxBound, nextFreq));
    }

    const nextGain = Math.max(-12, Math.min(12, params.gain));
    const nextQ = params.q !== undefined ? params.q : userQ;

    setUserFreq(nextFreq);
    setUserGain(nextGain);
    if (params.q !== undefined) {
      setUserQ(nextQ);
    }

    const updated: FilterParams = {
      type: filterType,
      frequency: nextFreq,
      gain: nextGain,
      q: nextQ
    };

    audioEngine.setUserFilter(updated);
    audioEngine.setListeningMode('user');
  };

  const handleSliderFreqChange = (freq: number) => {
    handleUserFilterChange({ frequency: freq, gain: userGain });
  };

  const handleSliderGainChange = (gain: number) => {
    handleUserFilterChange({ frequency: userFreq, gain: Math.max(-12, Math.min(12, gain)) });
  };

  const handleSliderQChange = (q: number) => {
    setUserQ(q);
    const updated: FilterParams = {
      type: filterType,
      frequency: userFreq,
      gain: userGain,
      q: q
    };
    audioEngine.setUserFilter(updated);
  };

  const handleSubmit = () => {
    if (!targetFilter || isRoundAnswered || isDailyLocked) return;

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    
    // Ideal user gain is opposite of rogue anomaly to neutralize it back to flat (make C sound like A)
    const expectedGain = -targetFilter.gain;
    const expectedFreq = targetFilter.frequency;

    const distOctaves = freqDistanceInOctaves(userFreq, expectedFreq);
    const distSemitones = freqDistanceInSemitones(userFreq, expectedFreq);
    const gainError = Math.abs(userGain - expectedGain);

    const minF = filterType === 'highshelf' ? 1000 : 50;
    const maxF = filterType === 'lowshelf' ? 1000 : 15000;
    const maxPossibleDist = Math.max(
      freqDistanceInOctaves(expectedFreq, minF),
      freqDistanceInOctaves(expectedFreq, maxF),
      1.0
    );

    // Max points: 250 PTS for shelving (lowshelf/highshelf), 500 PTS for parametric (peaking)
    const maxScore = (filterType === 'lowshelf' || filterType === 'highshelf') ? 250 : 500;
    const rawScore = calculateScore(distOctaves, gainError, true, maxPossibleDist);
    // 33% penalty per hint used (1 hint = 67%, 2 hints = 34%, 3 hints = 1% floor)
    const hintMultiplier = Math.max(0.01, 1 - hintsUsed * 0.33);
    const score = Math.round((rawScore / 1000) * maxScore * hintMultiplier);

    const userFinal: FilterParams = {
      type: filterType,
      frequency: userFreq,
      gain: userGain,
      q: userQ
    };

    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'tye_match',
      target: targetFilter,
      guess: userFinal,
      freqDistanceOctaves: distOctaves,
      freqDistanceSemitones: distSemitones,
      gainDistanceDb: gainError,
      isFilterTypeCorrect: true,
      isDirectionCorrect: (userGain > 0 && expectedGain > 0) || (userGain < 0 && expectedGain < 0),
      score: score,
      timeSpentSeconds: elapsedSeconds,
      timestamp: Date.now()
    };

    setIsRoundAnswered(true);
    setLastRoundResult(result);
    onRoundComplete(result);

    const effectiveMax = Math.round(maxScore * hintMultiplier);
    if (score >= Math.round(effectiveMax * 0.85)) {
      confetti({
        particleCount: score === effectiveMax ? 70 : 35,
        spread: 60,
        origin: { y: 0.6 }
      });
    }
  };

  const handleNextRound = () => {
    setRoundCount(prev => prev + 1);
    generateNewRound();
  };

  return (
    <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
      {/* Settings Header */}
      <div className={`flex ${isMobile ? 'flex-col items-stretch gap-3 p-3.5' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl`}>
        <div>
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none pb-0.5">
            <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider bg-studio-accent/20 text-studio-accent rounded-lg border border-studio-accent/30 shrink-0`}>
              {isMobile ? `Rd ${roundCount}` : `Round ${roundCount}`}
            </span>
            <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border shrink-0 ${
              filterType === 'peaking'
                ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                : 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30'
            }`}>
              {filterType === 'peaking' ? 'Parametric (Bell)' : filterType === 'lowshelf' ? 'Low Shelf (≤1k)' : 'High Shelf (≥1k)'}
            </span>
            {isCustomAudio ? (
              <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1.5 shadow-sm shrink-0`}>
                📁 Custom Audio {isMobile ? '' : '(Unlimited • Unranked)'}
              </span>
            ) : (
              remainingDailyRounds !== undefined && (
                <span className={`${isMobile ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold uppercase tracking-wider rounded-lg border shrink-0 ${
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
          <h2 className={`${isMobile ? 'text-lg mt-2' : 'text-xl mt-1.5'} font-bold text-white flex flex-wrap items-baseline gap-2`}>
            <span>EQ Correct</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            The audio in [B] has an unwanted EQ coloration. Adjust your EQ [C] to counteract it until [C] sounds identical to [A] (FLAT)!
          </p>
        </div>

        {/* Auto Rotation (80% Bell / 10% Low Shelf / 10% High Shelf) - Desktop Only */}
        {!isMobile && (
          <div className="flex items-center">
            <div
              className="bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 text-xs font-mono text-studio-accent font-bold flex items-center justify-center gap-1.5 shadow-sm"
              title="Auto rotation: 80% Bell (500 PTS), 10% Low Shelf (250 PTS), 10% High Shelf (250 PTS)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-studio-accent shrink-0" />
              <span>Auto (80% Bell)</span>
            </div>
          </div>
        )}
      </div>

      {/* Interactive EQ Spectrum Display (Click & Drag enabled!) */}
      <SpectrumDisplay
        targetFilter={targetFilter ? { ...targetFilter, gain: -targetFilter.gain } : null}
        targetLegendLabel="Target Invert"
        userFilter={{
          type: filterType,
          frequency: userFreq,
          gain: userGain,
          q: userQ
        }}
        showTargetCurve={isRoundAnswered}
        interactive={!isRoundAnswered}
        currentQ={userQ}
        onQChange={handleSliderQChange}
        onFilterChange={handleUserFilterChange}
        height={isMobile ? 210 : 280}
        isMobile={isMobile}
        maxGain={12}
        showMobileQSlider={isMobile}
      />

      {/* Unified Control Strip: Play / Flat / EQ On / Your EQ + Action Button + Points + Target/Match in a line */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3 flex-col items-stretch gap-2.5' : 'p-2.5 flex-wrap items-center gap-3 sm:gap-4'} rounded-2xl shadow-xl flex`}>
        {/* Play controls */}
        <InlineTransport
          showUserMatch={true}
          isMobile={isMobile}
          bypassLabel="[A] FLAT"
          targetLabel="[B] ROGUE EQ"
          userMatchLabel="[C] YOUR INVERT"
        />

        {!isMobile && <div className="hidden sm:block h-6 w-px bg-studio-800" />}

        {/* Submit EQ Invert OR Next Round (to the left of Points Awarded) */}
        {!isRoundAnswered ? (
          isDailyLocked ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700/50 w-full text-center"
            >
              Daily Limit Reached (20/20)
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className={`px-6 py-3 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 bg-amber-400 text-studio-950 shadow-amber-400/25 hover:brightness-110 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'} text-center`}
            >
              Submit EQ Invert &bull; Up to {Math.round(((filterType === 'peaking' ? 500 : 250)) * Math.max(0.01, 1 - hintsUsed * 0.33))} PTS{hintsUsed > 0 ? ` (-${hintsUsed * 33}%)` : ''}
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
                  lastRoundResult.score >= Math.round(((filterType === 'lowshelf' || filterType === 'highshelf') ? 250 : 500) * 0.8 * Math.max(0.01, 1 - hintsUsed * 0.33))
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : lastRoundResult.score >= Math.round(((filterType === 'lowshelf' || filterType === 'highshelf') ? 250 : 500) * 0.5 * Math.max(0.01, 1 - hintsUsed * 0.33))
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  <Award className="w-4 h-4 shrink-0" />
                  <span>
                    +{lastRoundResult.score.toLocaleString()} PTS
                    {hintsUsed > 0 && <span className="text-[10px] opacity-80 ml-1">(-{hintsUsed * 33}% hints)</span>}
                    {lastRoundResult.score === Math.round(((filterType === 'lowshelf' || filterType === 'highshelf') ? 250 : 500) * Math.max(0.01, 1 - hintsUsed * 0.33)) ? ' • BULLSEYE!' : ''}
                  </span>
                </div>

                {/* Target & Match Result */}
                <div className="text-xs font-mono bg-studio-950/80 px-3 py-2 rounded-xl border border-studio-800 text-center">
                  <span className="text-slate-400">Target Invert: </span>
                  <span className="text-emerald-400 font-bold">
                    {formatFrequency(lastRoundResult.target.frequency)} @ {formatGain(-lastRoundResult.target.gain)}
                  </span>
                  <span className="text-slate-500 mx-2">|</span>
                  <span className="text-slate-400">Your Invert: </span>
                  <span className="text-amber-400 font-bold">{formatFrequency(lastRoundResult.guess.frequency)} @ {formatGain(lastRoundResult.guess.gain)}</span>
                  <span className="text-slate-400 text-[11px] block sm:inline sm:ml-2">
                    (Rogue anomaly was {formatGain(lastRoundResult.target.gain)})
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Educational Hint System for Correct / Invert Mode */}
      {targetFilter && (
        <div className={`bg-studio-900/90 border ${hintsUsed > 0 ? 'border-amber-500/40' : 'border-studio-800'} ${isMobile ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'} rounded-2xl transition-all shadow-md`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2.5">
              <div className={`p-1.5 rounded-lg ${hintsUsed > 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-studio-800 text-slate-400'}`}>
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Invert Assistance & Hint System
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold ${
                    hintsUsed === 0
                      ? 'bg-studio-800 text-slate-400'
                      : hintsUsed === 1
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : hintsUsed === 2
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    {hintsUsed === 0 ? '0 / 3 Hints' : `${hintsUsed} / 3 Hints (-${hintsUsed * 33}% PTS)`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {hintsUsed === 0
                    ? 'Struggling to locate the rogue EQ coloration? Reveal guided hints (-33% score penalty per hint).'
                    : `Max available round score: ${Math.round(((filterType === 'lowshelf' || filterType === 'highshelf') ? 250 : 500) * Math.max(0.01, 1 - hintsUsed * 0.33))} PTS`}
                </p>
              </div>
            </div>

            {!isRoundAnswered && (
              <button
                onClick={handleRequestHint}
                disabled={hintsUsed >= 3}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  hintsUsed >= 3
                    ? 'bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700/40'
                    : 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 active:scale-95 shadow-sm'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>
                  {hintsUsed === 0
                    ? 'Request Hint 1 (-33%)'
                    : hintsUsed === 1
                    ? 'Request Hint 2 (-33%)'
                    : hintsUsed === 2
                    ? 'Reveal Full Solution (-33%)'
                    : 'All 3 Hints Unlocked'}
                </span>
              </button>
            )}
          </div>

          {/* Render Unlocked Hints */}
          {hintsUsed > 0 && (
            <div className="space-y-2 pt-2 border-t border-studio-800/80">
              {/* Hint 1: Problem Diagnosis & Direction */}
              <div className="bg-studio-950/70 border border-blue-500/20 rounded-xl p-2.5 text-xs font-mono flex items-start space-x-2.5">
                <div className="p-1 rounded bg-blue-500/20 text-blue-400 mt-0.5 shrink-0">
                  <Volume2 className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-blue-300 font-bold flex items-center gap-1.5">
                    <span>Hint 1: Anomaly Diagnosis & Counter-Action</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    The rogue coloration in [B] is an unwanted <span className="font-bold text-amber-400">{targetFilter.gain > 0 ? 'BOOST (+dB)' : 'CUT (-dB)'}</span>. To counteract it and make [C] sound identical to [A] (FLAT), you should set your EQ gain to a <span className="font-bold text-emerald-400">{targetFilter.gain > 0 ? 'CUT (-dB)' : 'BOOST (+dB)'}</span>!
                  </p>
                </div>
              </div>

              {/* Hint 2: Register, Narrowed Range & Required Gain Adjustment */}
              {hintsUsed >= 2 && (
                <div className="bg-studio-950/70 border border-amber-500/20 rounded-xl p-2.5 text-xs font-mono flex items-start space-x-2.5">
                  <div className="p-1 rounded bg-amber-500/20 text-amber-400 mt-0.5 shrink-0">
                    <Compass className="w-3.5 h-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-amber-300 font-bold flex items-center gap-1.5">
                      <span>Hint 2: Frequency Band & Gain Amount</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      The rogue frequency sits in the <span className="font-bold text-amber-300">{getFrequencyRegister(targetFilter.frequency).name}</span> ({getFrequencyRegister(targetFilter.frequency).range}). Narrowed target search window: <span className="font-bold text-emerald-400">{formatFrequency(Math.max(50, Math.round(targetFilter.frequency * Math.pow(2, -0.45))))}</span> &ndash; <span className="font-bold text-emerald-400">{formatFrequency(Math.min(15000, Math.round(targetFilter.frequency * Math.pow(2, 0.45))))}</span>. Gain adjustment needed: approximately <span className="font-bold text-emerald-400">{formatGain(-targetFilter.gain)}</span> ({Math.abs(targetFilter.gain)} dB {targetFilter.gain > 0 ? 'cut' : 'boost'}).
                    </p>
                  </div>
                </div>
              )}

              {/* Hint 3: Full Invert Solution */}
              {hintsUsed >= 3 && (
                <div className="bg-studio-950/70 border border-emerald-500/30 rounded-xl p-2.5 text-xs font-mono flex items-start space-x-2.5">
                  <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-emerald-300 font-bold flex items-center gap-1.5">
                      <span>Hint 3: Complete Target Solution</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Exact Invert Solution: Frequency <span className="font-bold text-emerald-400">{formatFrequency(targetFilter.frequency)}</span> &bull; Gain <span className="font-bold text-emerald-400">{formatGain(-targetFilter.gain)}</span> &bull; Q: <span className="font-bold text-emerald-400">{targetFilter.q.toFixed(2)}</span> (counters rogue {formatGain(targetFilter.gain)}).
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Daily Lockout Alert Banner */}
      {isDailyLocked && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2.5 text-amber-300">
            <Award className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Daily Training Goal Met!</span>
              <span className="text-slate-400 block sm:inline sm:ml-2">
                You've completed all 20 rounds for EQ Correct today. Resets tomorrow at midnight!
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
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

      {/* Interactive Knob / Slider Rack Controls */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3.5 space-y-4' : 'p-5 space-y-6'} rounded-2xl`}>
        <div className={`flex ${isMobile ? 'flex-col items-start gap-2' : 'items-center justify-between'} border-b border-studio-800 pb-3`}>
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-mono font-medium text-slate-300 uppercase tracking-wider">
              {isMobile ? 'Your Interactive EQ Controls' : 'Your Interactive EQ Controls (Drag on spectrum above or use knobs below)'}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="text-amber-400 font-bold">Freq: {formatFrequency(userFreq)}</span>
            <span className="text-amber-400 font-bold">Gain: {formatGain(userGain)}</span>
            <span className="text-slate-400">Q: {userQ.toFixed(2)}</span>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-3 gap-6'}`}>
          
          {/* Frequency Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Frequency:</span>
              <span className="text-white font-bold">{formatFrequency(userFreq)}</span>
            </div>
            <input
              type="range"
              min={filterType === 'highshelf' ? '1000' : '50'}
              max={filterType === 'lowshelf' ? '1000' : '15000'}
              step="1"
              value={userFreq}
              disabled={isRoundAnswered}
              onChange={e => handleSliderFreqChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-studio-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{filterType === 'highshelf' ? '1 kHz (Min)' : '50 Hz'}</span>
              <span>{filterType === 'lowshelf' ? '250 Hz' : filterType === 'highshelf' ? '4 kHz' : '1 kHz'}</span>
              <span>{filterType === 'lowshelf' ? '1 kHz (Max)' : '15 kHz'}</span>
            </div>
          </div>

          {/* Gain Control */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Gain (Boost / Cut):</span>
              <span className={`font-bold ${userGain > 0 ? 'text-emerald-400' : userGain < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {formatGain(userGain)}
              </span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={userGain}
              disabled={isRoundAnswered}
              onChange={e => handleSliderGainChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-studio-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>-12 dB</span>
              <span>0 dB</span>
              <span>+12 dB</span>
            </div>
          </div>

          {/* Q / Bandwidth Control (Desktop only; on mobile it is embedded inside the graph next to Your Guess / EQ) */}
          {!isMobile && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Q (Bandwidth):</span>
                <span className="text-white font-bold">{userQ.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="6.0"
                step="0.1"
                value={userQ}
                disabled={isRoundAnswered || filterType !== 'peaking'}
                onChange={e => handleSliderQChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-studio-950 rounded-lg appearance-none cursor-pointer accent-amber-400 disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>Wide (0.5)</span>
                <span>Standard (1.4)</span>
                <span>Sharp (6.0)</span>
              </div>
            </div>
          )}

        </div>

        {/* Shortcut hint */}
        <div className="pt-3 border-t border-studio-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>Shortcut: Space (Play/Pause) &bull; 1/A (Flat) &bull; 2/B (Rogue EQ) &bull; 3/C (Your Invert)</span>
          </div>
        </div>

      </div>
    </div>
  );
};
