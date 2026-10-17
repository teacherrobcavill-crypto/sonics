import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, ChevronRight, HelpCircle, RefreshCw, Zap, Award } from 'lucide-react';
import { FilterParams, BandGranularity, RoundResult } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumDisplay } from '../SpectrumDisplay';
import { InlineTransport } from '../InlineTransport';
import {
  ISO_OCTAVE_1,
  ISO_OCTAVE_HALF,
  ISO_OCTAVE_THIRD,
  formatFrequency,
  formatGain,
  freqDistanceInOctaves,
  freqDistanceInSemitones,
  calculateScore
} from '../../utils/frequencies';

interface PeakMasterGameProps {
  onRoundComplete: (result: RoundResult) => void;
  currentStreak: number;
  totalScore: number;
  remainingDailyRounds?: number;
  isCustomAudio?: boolean;
  onNavigateToSandbox?: () => void;
  onOpenLeaderboard?: () => void;
}

export const PeakMasterGame: React.FC<PeakMasterGameProps> = ({
  onRoundComplete,
  currentStreak,
  totalScore,
  remainingDailyRounds,
  isCustomAudio = false,
  onNavigateToSandbox,
  onOpenLeaderboard
}) => {
  const isDailyLocked = !isCustomAudio && remainingDailyRounds !== undefined && remainingDailyRounds <= 0;
  const [granularity, setGranularity] = useState<BandGranularity>('octave_1');
  const [includeCuts, setIncludeCuts] = useState(false);
  const [fixedGain, setFixedGain] = useState<number>(9); // +9 dB by default
  const [qFactor, setQFactor] = useState<number>(1.41);

  // Target mystery filter
  const [targetFilter, setTargetFilter] = useState<FilterParams | null>(null);

  // User guess state
  const [guessedFreq, setGuessedFreq] = useState<number | null>(null);
  const [isRoundAnswered, setIsRoundAnswered] = useState(false);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [roundCount, setRoundCount] = useState(1);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Band list based on selected granularity
  const currentBands = granularity === 'octave_1'
    ? ISO_OCTAVE_1
    : granularity === 'octave_half'
    ? ISO_OCTAVE_HALF
    : ISO_OCTAVE_THIRD;

  // Generate new random challenge
  const generateNewRound = useCallback(() => {
    const bands = granularity === 'octave_1'
      ? ISO_OCTAVE_1
      : granularity === 'octave_half'
      ? ISO_OCTAVE_HALF
      : ISO_OCTAVE_THIRD;

    const randomFreq = bands[Math.floor(Math.random() * bands.length)];
    const isCut = includeCuts && Math.random() > 0.5;
    const gain = isCut ? -fixedGain : fixedGain;

    const filter: FilterParams = {
      type: 'peaking',
      frequency: randomFreq,
      gain: gain,
      q: qFactor
    };

    setTargetFilter(filter);
    audioEngine.setTargetFilter(filter);
    audioEngine.setListeningMode('target');

    setGuessedFreq(null);
    setIsRoundAnswered(false);
    setLastRoundResult(null);
    setStartTime(Date.now());
  }, [granularity, includeCuts, fixedGain, qFactor]);

  // Start initial round
  useEffect(() => {
    generateNewRound();
  }, [generateNewRound]);

  // Handle user frequency choice
  const handleSelectFrequency = (freq: number) => {
    if (isRoundAnswered) return;
    setGuessedFreq(freq);
  };

  // Submit guess
  const handleSubmitGuess = () => {
    if (!targetFilter || guessedFreq === null || isRoundAnswered || isDailyLocked) return;

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const distOctaves = freqDistanceInOctaves(guessedFreq, targetFilter.frequency);
    const distSemitones = freqDistanceInSemitones(guessedFreq, targetFilter.frequency);

    // Calculate maximum possible distance in current band set from target
    const minBand = currentBands[0];
    const maxBand = currentBands[currentBands.length - 1];
    const maxPossibleDist = Math.max(
      freqDistanceInOctaves(targetFilter.frequency, minBand),
      freqDistanceInOctaves(targetFilter.frequency, maxBand),
      1.0
    );

    const score = calculateScore(distOctaves, 0, true, maxPossibleDist);

    const userFilterParam: FilterParams = {
      type: 'peaking',
      frequency: guessedFreq,
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
    onRoundComplete(result);
  };

  const handleNextRound = () => {
    setRoundCount(prev => prev + 1);
    generateNewRound();
  };

  return (
    <div className="space-y-6">
      {/* Settings & Game Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-studio-900 border border-studio-800 p-4 rounded-2xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider bg-studio-accent/20 text-studio-accent rounded-lg border border-studio-accent/30">
              Round {roundCount}
            </span>
            {isCustomAudio ? (
              <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                📁 Custom Audio (Unlimited • Unranked)
              </span>
            ) : (
              remainingDailyRounds !== undefined && (
                <span className={`px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border ${
                  remainingDailyRounds > 10
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : remainingDailyRounds > 3
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-red-500/20 text-red-300 border-red-500/30'
                }`}>
                  🎯 {remainingDailyRounds}/20 Left Today
                </span>
              )
            )}
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Peak Master <span className="text-xs font-normal text-slate-400">(Parametric Boost & Cut)</span>
            </h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Listen to the altered audio [B] vs flat [A]. Identify which frequency is {targetFilter && targetFilter.gain < 0 ? 'cut' : 'boosted'}.
          </p>
        </div>

        {/* Difficulty Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5 bg-studio-950 p-1 rounded-xl border border-studio-800 text-xs font-mono">
            <button
              onClick={() => { setGranularity('octave_1'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                granularity === 'octave_1' ? 'bg-studio-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1-Octave (9 bands)
            </button>
            <button
              onClick={() => { setGranularity('octave_half'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                granularity === 'octave_half' ? 'bg-studio-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2/3-Octave (14 bands)
            </button>
            <button
              onClick={() => { setGranularity('octave_third'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                granularity === 'octave_third' ? 'bg-studio-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1/3-Octave (30 bands)
            </button>
          </div>

          <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 text-xs">
            <span className="text-slate-400">Gain:</span>
            {[6, 9, 12].map(g => (
              <button
                key={g}
                onClick={() => setFixedGain(g)}
                className={`px-2 py-0.5 rounded font-mono ${fixedGain === g ? 'bg-studio-accent text-studio-950 font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                {g}dB
              </button>
            ))}
          </div>

          <label className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCuts}
              onChange={e => setIncludeCuts(e.target.checked)}
              className="accent-studio-accent rounded"
            />
            <span className="text-slate-300">Allow Cuts</span>
          </label>
        </div>
      </div>

      {/* Visual Spectrum Display */}
      <SpectrumDisplay
        targetFilter={targetFilter}
        userFilter={guessedFreq && isRoundAnswered ? {
          type: 'peaking',
          frequency: guessedFreq,
          gain: targetFilter?.gain || 9,
          q: qFactor
        } : null}
        showTargetCurve={isRoundAnswered}
        highlightFreq={isRoundAnswered ? guessedFreq : null}
        height={260}
      />

      {/* Unified Control Strip: Play / Flat / EQ On + Action Button + Points + Target/Guess in a line */}
      <div className="bg-studio-900 border border-studio-800 p-2.5 rounded-2xl shadow-xl flex flex-wrap items-center gap-3 sm:gap-4">
        {/* Play controls */}
        <InlineTransport />

        <div className="hidden sm:block h-6 w-px bg-studio-800" />

        {/* Submit Guess OR Next Round (to the left of Points Awarded) */}
        {!isRoundAnswered ? (
          isDailyLocked ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-800 text-slate-500 cursor-not-allowed border border-studio-700/50"
            >
              Daily Limit Reached (20/20)
            </button>
          ) : (
            <button
              onClick={handleSubmitGuess}
              disabled={guessedFreq === null}
              className={`px-7 py-2.5 rounded-xl font-bold font-mono text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95 ${
                guessedFreq !== null
                  ? 'bg-studio-accent text-studio-950 shadow-studio-accent/25 hover:brightness-110 cursor-pointer'
                  : 'bg-studio-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Submit Guess
            </button>
          )
        ) : (
          <>
            {/* Next Round button placed to the left of the points */}
            <button
              onClick={handleNextRound}
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-sm uppercase tracking-wider bg-studio-neonGreen text-studio-950 hover:brightness-110 active:scale-95 transition-all flex items-center space-x-1.5 shadow-lg shadow-studio-neonGreen/20 cursor-pointer"
            >
              <span>Next Round</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {lastRoundResult && (
              <>
                {/* Points Awarded */}
                <div className={`px-3 py-1.5 rounded-xl border font-bold font-mono text-xs sm:text-sm flex items-center space-x-1.5 ${
                  lastRoundResult.score >= 800
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : lastRoundResult.score >= 500
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  <Award className="w-4 h-4" />
                  <span>+{lastRoundResult.score.toLocaleString()} PTS</span>
                </div>

                {/* Target & Guess */}
                <div className="text-xs sm:text-sm font-mono bg-studio-950/80 px-3 py-1.5 rounded-xl border border-studio-800">
                  <span className="text-slate-400">Target: </span>
                  <span className="text-emerald-400 font-bold">{formatFrequency(lastRoundResult.target.frequency)}</span>
                  <span className="text-slate-500 mx-2">|</span>
                  <span className="text-slate-400">Guess: </span>
                  <span className="text-amber-400 font-bold">{formatFrequency(lastRoundResult.guess.frequency)}</span>
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
                You've completed all 20 rounds for Peak Master today. Resets tomorrow at midnight!
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

      {/* Frequency Guessing Buttons Grid */}
      <div className="bg-studio-900 border border-studio-800 p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">
            Select Your Frequency Guess:
          </span>
          <span className="text-xs font-mono text-studio-accent">
            Current Filter: {targetFilter ? `${formatGain(targetFilter.gain)} Peak (Q=${targetFilter.q})` : ''}
          </span>
        </div>

        {/* Frequency Buttons */}
        <div className={`grid gap-2 ${
          granularity === 'octave_1'
            ? 'grid-cols-3 sm:grid-cols-5 md:grid-cols-9'
            : granularity === 'octave_half'
            ? 'grid-cols-4 sm:grid-cols-7 md:grid-cols-14'
            : 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-15 text-[11px]'
        }`}>
          {currentBands.map((freq) => {
            const isSelected = guessedFreq === freq;
            const isTarget = isRoundAnswered && targetFilter?.frequency === freq;

            let btnStyle = "bg-studio-950 text-slate-300 border-studio-800 hover:border-slate-600 hover:bg-studio-850";
            if (isSelected && !isRoundAnswered) {
              btnStyle = "bg-amber-500/20 text-amber-300 border-amber-400 ring-2 ring-amber-400/40 font-bold";
            } else if (isRoundAnswered) {
              if (isTarget) {
                btnStyle = "bg-emerald-500/30 text-emerald-300 border-emerald-400 font-bold shadow-lg shadow-emerald-500/20";
              } else if (isSelected) {
                btnStyle = "bg-red-500/20 text-red-300 border-red-500 line-through";
              } else {
                btnStyle = "bg-studio-950/60 text-slate-600 border-studio-900 opacity-60";
              }
            }

            return (
              <button
                key={freq}
                onClick={() => handleSelectFrequency(freq)}
                disabled={isRoundAnswered}
                className={`py-3 px-1 rounded-xl border text-center font-mono font-semibold transition-all active:scale-95 ${btnStyle}`}
              >
                {formatFrequency(freq)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
