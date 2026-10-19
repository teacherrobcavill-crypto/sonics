import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  Volume1,
  Play,
  Pause,
  Heart,
  HeartCrack,
  Award,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Music,
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Radio,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Sliders,
  Target,
  Plus,
  Minus,
  SlidersHorizontal,
  Lock,
  Headphones
} from 'lucide-react';
import { GameMode, RoundResult, AudioSourceType, FilterParams } from '../../types';
import { audioEngine, ListeningMode } from '../../audio/AudioEngine';
import { StemBalanceConsole } from './StemBalanceConsole';

interface DbMasterGameProps {
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
}

interface TrackInfo {
  type: AudioSourceType;
  label: string;
  genre: string;
}

const TRACK_CYCLE: TrackInfo[] = [
  { type: 'dance_pop', label: 'Dance Pop', genre: 'Modern Pop' },
  { type: 'alt_rock', label: 'Alt Rock', genre: 'Alternative Rock' },
  { type: 'electronic_pop', label: 'Electronic Pop', genre: 'Synth Pop' },
  { type: 'hard_rock', label: 'Hard Rock', genre: 'Rock / Heavy' },
  { type: 'hip_hop', label: 'Hip Hop / R&B', genre: 'Urban / R&B' }
];

export const MIN_DB = -12.0;
export const MAX_DB = 6.0;
export const DB_STEP = 0.1;

/**
 * Generates a weighted target delta dB in increments of strictly 0.1 dB:
 * - Cuts range: -0.5 to -12.0 dB (~65% chance, 116 discrete 0.1dB values)
 * - Safe boosts range: +0.5 to +6.0 dB (~35% chance, 56 discrete 0.1dB values)
 * - The majority (~75%) of comparisons are within subtle to moderate 0.5 to 8.0 dB
 * - Higher drops (8.1 to 12.0 dB) make up the remaining ~25%
 */
function generateTargetDeltaDb(): number {
  const isBoost = Math.random() < 0.35;

  if (isBoost) {
    // Boost: +0.5 to +6.0 dB in 0.1 dB steps
    const isModerate = Math.random() < 0.75;
    if (isModerate) {
      // 0.5 to 4.0 dB (36 discrete values)
      const step = Math.floor(Math.random() * 36);
      return Math.round((0.5 + step * 0.1) * 10) / 10;
    } else {
      // 4.1 to 6.0 dB (20 discrete values)
      const step = Math.floor(Math.random() * 20);
      return Math.round((4.1 + step * 0.1) * 10) / 10;
    }
  }

  // Cut/Drop: -0.5 to -12.0 dB in 0.1 dB steps (MAX DROP IS STRICTLY 12 dB)
  const isSubtleToModerate = Math.random() < 0.75;
  if (isSubtleToModerate) {
    // -0.5 to -8.0 dB (76 discrete values)
    const step = Math.floor(Math.random() * 76);
    return Math.round((-0.5 - step * 0.1) * 10) / 10;
  } else {
    // -8.1 to -12.0 dB (40 discrete values)
    const step = Math.floor(Math.random() * 40);
    return Math.round((-8.1 - step * 0.1) * 10) / 10;
  }
}

/**
 * Scoring specifications (Single Fader dB Master):
 * - increments of 0.1 dB
 * - 75 points for spot on (diff === 0.0 dB, scaled back by 25% from 100)
 * - Rounds 1 to 10 (Single Fader): Strict precision tolerance:
 *   - diffDb <= 1.0 dB: Hit (scaled PTS)
 *   - diffDb > 1.0 dB: Miss (0 PTS, 1 Life Lost)
 * - Rounds 11 to 20: Standard curve (scaling down to 8 pts at 6.0 dB, >6.0 dB loses 1 life)
 */
export function calculateDbScore(guessDb: number, targetDb: number, roundNumber: number = 1): {
  score: number;
  diffDb: number;
  isHit: boolean;
  status: 'spot_on' | 'excellent' | 'good' | 'pass' | 'miss';
} {
  const diffDb = Math.round(Math.abs(guessDb - targetDb) * 10) / 10;

  if (diffDb === 0.0) {
    return { score: 75, diffDb, isHit: true, status: 'spot_on' };
  }

  // Single Fader Mode - Rounds 1 to 10: Precision tolerance (Life lost if diff > 1.0 dB)
  if (roundNumber <= 10) {
    if (diffDb <= 1.0) {
      const rawScore = 100 - (diffDb / 3.0) * 90;
      const score = Math.round(rawScore * 0.75);
      const status = diffDb <= 0.5 ? 'excellent' : 'good';
      return { score, diffDb, isHit: true, status };
    }
    // Out by more than 1.0 dB in first 10 rounds -> MISS (0 pts, 1 Life Lost)
    return { score: 0, diffDb, isHit: false, status: 'miss' };
  }

  // Rounds 11–20: Standard single fader curve
  if (diffDb <= 3.0) {
    // Scaled back by 25% (75 pts down to 8 pts)
    const rawScore = 100 - (diffDb / 3.0) * 90;
    const score = Math.round(rawScore * 0.75);
    const status = diffDb <= 1.0 ? 'excellent' : 'good';
    return { score, diffDb, isHit: true, status };
  }

  if (diffDb <= 6.0) {
    return { score: 8, diffDb, isHit: true, status: 'pass' };
  }

  return { score: 0, diffDb, isHit: false, status: 'miss' };
}

function formatDeltaDb(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} dB`;
}

export const DbMasterGame: React.FC<DbMasterGameProps> = ({
  onRoundComplete,
  onBonusPoints,
  totalScore,
  remainingDailyRounds,
  isCustomAudio = false,
  onNavigateToSandbox,
  onOpenLeaderboard,
  onNavigateToMode,
  isMobile = false,
  isPracticeMode = false,
  onTogglePracticeMode
}) => {
  const isDailyLocked = !isPracticeMode && !isCustomAudio && remainingDailyRounds !== undefined && remainingDailyRounds <= 0;

  // Session state
  const [roundCount, setRoundCount] = useState<number>(1);
  const [lives, setLives] = useState<number>(3);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [isVictory, setIsVictory] = useState<boolean>(false);
  const [sessionScore, setSessionScore] = useState<number>(0);
  const [round10Milestone, setRound10Milestone] = useState<'extra_life' | 'bonus_points' | null>(null);

  // Sub-Mode: 'single_fader' (Single Gain Fader, Default) vs 'stem_balance' (4-Stem Desk)
  const [subMode, setSubMode] = useState<'stem_balance' | 'single_fader'>('single_fader');
  const [livesLostInFirst10, setLivesLostInFirst10] = useState<number>(0);
  const [isStemBalanceUnlocked, setIsStemBalanceUnlocked] = useState<boolean>(false);
  const [stemUnlockedMilestone, setStemUnlockedMilestone] = useState<'unlocked' | 'failed' | null>(null);

  const handleStemRoundComplete = (result: RoundResult) => {
    if (isPracticeMode) {
      result.score = 0;
    }
    setSessionScore(prev => prev + result.score);

    // If one track is more than 3 dB off from the target, a life is lost (max 1 life lost per round)
    const hasStemOver3Db = result.stemDeltas
      ? Object.values(result.stemDeltas).some(delta => delta > 3.0)
      : result.score === 0;

    if (hasStemOver3Db && !isPracticeMode) {
      const nextLives = lives - 1;
      setLives(nextLives);
      if (roundCount <= 10) {
        setLivesLostInFirst10(prev => prev + 1);
      }
      if (nextLives <= 0) {
        setIsGameOver(true);
      }
    }

    onRoundComplete(result);
  };

  // Round parameters
  const [targetDelta, setTargetDelta] = useState<number>(-3.0);
  const [userFaderDb, setUserFaderDb] = useState<number>(0.0);
  const [isRoundAnswered, setIsRoundAnswered] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Audio state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [listeningMode, setListeningMode] = useState<ListeningMode>('bypass');
  const [currentTrack, setCurrentTrack] = useState<TrackInfo>(TRACK_CYCLE[0]);

  // DOM Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to Audio Engine state
  useEffect(() => {
    const unsub = audioEngine.subscribeState((playing, mode) => {
      setIsPlaying(playing);
      setListeningMode(mode);
    });
    return unsub;
  }, []);

  // Cleanup on unmount: reset dB levels to unity
  useEffect(() => {
    generateNewRound(1);
    return () => {
      audioEngine.resetDbLevels();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Generate a new round
  const generateNewRound = useCallback((round: number) => {
    const track = TRACK_CYCLE[(round - 1) % TRACK_CYCLE.length];
    setCurrentTrack(track);

    if (subMode === 'stem_balance') {
      // In stem balance mode, StemBalanceConsole handles multi-stem buffer loading and targets
      return;
    }

    if (!isCustomAudio) {
      audioEngine.setAudioSource(track.type).catch(err => {
        console.warn('Track switch notice:', err);
      });
    }

    // Ensure filter chains and pan are flat/transparent for accurate dB ear training
    const flatFilter: FilterParams[] = [{
      type: 'peaking',
      frequency: 1000,
      gain: 0,
      q: 1.0
    }];
    audioEngine.setTargetFilter(flatFilter);
    audioEngine.setUserFilter(flatFilter);
    audioEngine.setTargetPan(0);
    audioEngine.setUserPan(0);

    // Generate Target dB in 0.1 dB increments
    const targetDb = generateTargetDeltaDb();
    setTargetDelta(targetDb);

    // Default user fader starts at 0.0 dB (Unity reference)
    setUserFaderDb(0.0);

    // Apply the dB levels to the AudioEngine:
    // Level [A] (Bypass) is 0 dB reference
    // Level [B] (Target) is targetDb
    // Level [C] (User) is 0.0 dB initially
    audioEngine.setDbLevels(0, targetDb, 0.0);

    // Reset round states
    setIsRoundAnswered(false);
    setStartTime(Date.now());

    // Audition Reference Level [A] by default
    audioEngine.setListeningMode('bypass');
  }, [isCustomAudio, subMode]);

  // Sub-mode audio engine switching (fires only when user or game changes subMode)
  useEffect(() => {
    if (subMode === 'stem_balance') {
      audioEngine.setStemMode(true);
    } else {
      audioEngine.setStemMode(false);
      generateNewRound(roundCount);
    }
  }, [subMode]);


  // Animated Stereo VU Activity Bar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let peakL = 0;
    let peakR = 0;

    const render = () => {
      const data = audioEngine.getAnalyserData();
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      let sum = 0;
      let maxVal = 0;
      for (let i = 0; i < data.length; i++) {
        const val = data[i] / 255;
        sum += val * val;
        if (val > maxVal) maxVal = val;
      }
      const rms = isPlaying ? Math.sqrt(sum / data.length) : 0;
      const instantaneousPeak = isPlaying ? maxVal : 0;

      peakL = Math.max(instantaneousPeak * 0.95, peakL * 0.92);
      peakR = Math.max(instantaneousPeak * 0.98, peakR * 0.93);

      const levelL = Math.min(1.0, rms * 1.6);
      const levelR = Math.min(1.0, rms * 1.55);

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, w, h);

      const barHeight = Math.max(6, Math.floor((h - 18) / 2));
      const bars = [
        { y: 3, level: levelL, peak: peakL, label: 'L' },
        { y: barHeight + 5, level: levelR, peak: peakR, label: 'R' }
      ];

      const startX = 22;
      const meterW = w - startX - 8;
      const numSegments = 32;
      const segGap = 2;
      const segW = (meterW - (numSegments - 1) * segGap) / numSegments;

      bars.forEach(b => {
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.fillText(b.label, 4, b.y + barHeight - 2);

        const activeSegments = Math.round(b.level * numSegments);
        const peakSegment = Math.round(b.peak * numSegments);

        for (let s = 0; s < numSegments; s++) {
          const segX = startX + s * (segW + segGap);
          const isLit = s < activeSegments;
          const isPeak = s === Math.min(numSegments - 1, peakSegment) && b.peak > 0.05;

          const normSeg = s / (numSegments - 1);
          let litColor = '#10b981';
          if (normSeg > 0.85) {
            litColor = '#f59e0b';
          } else if (normSeg > 0.65) {
            litColor = '#06b6d4';
          }

          if (isLit) {
            ctx.fillStyle = litColor;
          } else if (isPeak) {
            ctx.fillStyle = '#fbbf24';
          } else {
            ctx.fillStyle = '#111827';
          }

          ctx.fillRect(segX, b.y, segW, barHeight - 2);
        }
      });

      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.fillText('AUDIO ACTIVITY MONITOR • UNCALIBRATED (USE YOUR EARS TO IDENTIFY LEVEL)', w / 2, h - 2);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Fader positioning helper (0% bottom to 100% top)
  const getDbPercentFromBottom = useCallback((db: number) => {
    const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
    return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  }, []);

  // Updates fader value from pointer clientY
  const updateFaderFromPointerY = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
    const fractionFromBottom = 1 - (clampedY - rect.top) / rect.height;
    const rawDb = MIN_DB + fractionFromBottom * (MAX_DB - MIN_DB);
    const snapped = Math.round(rawDb * 10) / 10;
    const clamped = Math.max(MIN_DB, Math.min(MAX_DB, snapped));
    setUserFaderDb(clamped);
    audioEngine.setUserDbLevel(clamped, 0, targetDelta);
  }, [targetDelta]);

  // Pointer drag handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFaderFromPointerY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isRoundAnswered || isGameOver || isDailyLocked) return;
    updateFaderFromPointerY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Nudge fader by delta
  const nudgeFader = useCallback((delta: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    setUserFaderDb(prev => {
      const next = Math.max(MIN_DB, Math.min(MAX_DB, Math.round((prev + delta) * 10) / 10));
      audioEngine.setUserDbLevel(next, 0, targetDelta);
      return next;
    });
  }, [isRoundAnswered, isGameOver, isDailyLocked, targetDelta]);

  // Set explicit fader value
  const setFaderDirect = useCallback((value: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    const next = Math.max(MIN_DB, Math.min(MAX_DB, Math.round(value * 10) / 10));
    setUserFaderDb(next);
    audioEngine.setUserDbLevel(next, 0, targetDelta);
  }, [isRoundAnswered, isGameOver, isDailyLocked, targetDelta]);

  // Handle guess submission / lock-in
  const handleLockInGuess = useCallback(() => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;

    setIsRoundAnswered(true);
    const scoreResult = calculateDbScore(userFaderDb, targetDelta, roundCount);
    if (isPracticeMode) {
      scoreResult.score = 0;
    }
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    setSessionScore(prev => prev + scoreResult.score);

    if (scoreResult.isHit) {
      if (scoreResult.diffDb === 0.0) {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.65 },
          colors: ['#00f0ff', '#10b981', '#3b82f6', '#ffffff', '#fbbf24']
        });
      } else if (scoreResult.diffDb <= 0.5) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#00f0ff', '#10b981', '#ffffff']
        });
      }
    }

    let finalLives = lives;
    let finalLivesLost = livesLostInFirst10;

    if (!scoreResult.isHit && !isPracticeMode) {
      // Miss: in Rounds 1-10, diff > 0.5 dB; in Rounds 11-20, diff > 6.0 dB
      finalLives = lives - 1;
      setLives(finalLives);
      if (roundCount <= 10) {
        finalLivesLost = livesLostInFirst10 + 1;
        setLivesLostInFirst10(finalLivesLost);
      }
      if (finalLives <= 0) {
        setIsGameOver(true);
      }
    }

    // Stem Balance Qualification Check: Trigger immediately upon completing Round 10!
    if (roundCount === 10 && finalLives > 0) {
      const qualifies = finalLives >= 2 || finalLivesLost <= 1;
      if (qualifies) {
        setIsStemBalanceUnlocked(true);
        setStemUnlockedMilestone('unlocked');
        confetti({
          particleCount: 110,
          spread: 90,
          origin: { y: 0.5 },
          colors: ['#00f0ff', '#f59e0b', '#10b981', '#c084fc', '#ffffff']
        });
      } else {
        setIsStemBalanceUnlocked(false);
        setStemUnlockedMilestone('failed');
      }
    }

    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'db_master',
      target: {
        type: 'peaking',
        frequency: 1000,
        gain: targetDelta,
        q: 1.0
      },
      guess: {
        type: 'peaking',
        frequency: 1000,
        gain: userFaderDb,
        q: 1.0
      },
      freqDistanceOctaves: 0,
      freqDistanceSemitones: 0,
      gainDistanceDb: scoreResult.diffDb,
      isFilterTypeCorrect: true,
      isDirectionCorrect: Math.sign(userFaderDb) === Math.sign(targetDelta),
      score: scoreResult.score,
      timeSpentSeconds: elapsedSeconds,
      timestamp: Date.now(),
      dbTarget: targetDelta,
      dbGuess: userFaderDb
    };

    onRoundComplete(result);
  }, [
    isRoundAnswered,
    isGameOver,
    isDailyLocked,
    isPracticeMode,
    userFaderDb,
    targetDelta,
    startTime,
    lives,
    roundCount,
    livesLostInFirst10,
    onRoundComplete
  ]);

  // Next Round Handler
  const handleNextRound = useCallback(() => {
    if (roundCount >= 20 && !isPracticeMode) {
      setIsVictory(true);
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#00f0ff', '#f59e0b', '#10b981', '#ef4444', '#ffffff']
      });
      return;
    }

    const nextRound = roundCount + 1;
    setRoundCount(nextRound);

    // Round 10 Milestone Check (entering Round 10)
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
          particleCount: 85,
          spread: 90,
          origin: { y: 0.5 },
          colors: ['#fbbf24', '#f59e0b', '#10b981', '#00f0ff', '#ffffff']
        });
      }
    }

    // Moving from Round 10 to Round 11:
    if (nextRound === 11) {
      const qualifies = isStemBalanceUnlocked || lives >= 2 || livesLostInFirst10 <= 1;
      if (qualifies) {
        setIsStemBalanceUnlocked(true);
        setSubMode('stem_balance');
        return; // StemBalanceConsole mounts and handles multi-stem buffer loading
      } else {
        setSubMode('single_fader');
      }
    }

    if (subMode === 'single_fader' || (nextRound === 11 && !isStemBalanceUnlocked)) {
      generateNewRound(nextRound);
    }
  }, [roundCount, lives, livesLostInFirst10, isStemBalanceUnlocked, onBonusPoints, generateNewRound, subMode]);

  // Proceed to Stem Balance (Round 11) automatically when unlocked
  const handleProceedToStemBalance = useCallback(() => {
    setStemUnlockedMilestone(null);
    setRound10Milestone(null);
    setIsStemBalanceUnlocked(true);
    setSubMode('stem_balance');
    setRoundCount(11);
    setIsRoundAnswered(false);
    setUserFaderDb(0);
    audioEngine.stop();
  }, []);

  // Proceed to Single Fader (Round 11) if stem challenge locked
  const handleProceedToSingleFader = useCallback(() => {
    setStemUnlockedMilestone(null);
    setRound10Milestone(null);
    setIsStemBalanceUnlocked(false);
    setSubMode('single_fader');
    setRoundCount(11);
    setIsRoundAnswered(false);
    setUserFaderDb(0);
    generateNewRound(11);
  }, [generateNewRound]);

  // Restart Session Handler
  const handleRestartSession = () => {
    setRoundCount(1);
    setLives(3);
    setLivesLostInFirst10(0);
    setIsStemBalanceUnlocked(false);
    setStemUnlockedMilestone(null);
    setSubMode('single_fader');
    setIsGameOver(false);
    setIsVictory(false);
    setSessionScore(0);
    setRound10Milestone(null);
    generateNewRound(1);
  };

  // Keyboard shortcut listener (Single Fader mode only)
  useEffect(() => {
    if (subMode !== 'single_fader') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // Milestone dismiss / proceed handlers for Enter & Spacebar
      if (stemUnlockedMilestone) {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (stemUnlockedMilestone === 'unlocked') {
            handleProceedToStemBalance();
          } else {
            handleProceedToSingleFader();
          }
          return;
        }
      }

      // Spacebar: Toggle Play/Pause OR Advance to next round if answered
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRoundAnswered && !isGameOver && !isVictory) {
          if (roundCount === 10 && isStemBalanceUnlocked) {
            handleProceedToStemBalance();
          } else {
            handleNextRound();
          }
        } else {
          audioEngine.togglePlay();
        }
        return;
      }

      // Enter key: Lock in guess or next round
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRoundAnswered && !isGameOver && !isVictory) {
          if (roundCount === 10 && isStemBalanceUnlocked) {
            handleProceedToStemBalance();
          } else {
            handleNextRound();
          }
        } else if (!isRoundAnswered && !isGameOver && !isDailyLocked) {
          handleLockInGuess();
        }
        return;
      }

      // A / Q: Switch to Level A (Reference)
      if (key === 'a' || key === 'q') {
        e.preventDefault();
        audioEngine.setListeningMode('bypass');
        return;
      }

      // B / W: Switch to Level B (Target Shift)
      if (key === 'b' || key === 'w') {
        e.preventDefault();
        audioEngine.setListeningMode('target');
        return;
      }

      // C / E: Switch to Level C (Your Fader Match)
      if (key === 'c' || key === 'e') {
        e.preventDefault();
        audioEngine.setListeningMode('user');
        return;
      }

      // Arrow keys: Nudge fader (Shift for 1.0 dB, otherwise 0.1 dB)
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeFader(e.shiftKey ? 1.0 : 0.1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeFader(e.shiftKey ? -1.0 : -0.1);
        return;
      }

      // 0 key: Reset to 0.0 dB
      if (key === '0') {
        e.preventDefault();
        setFaderDirect(0.0);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    subMode,
    roundCount,
    isStemBalanceUnlocked,
    stemUnlockedMilestone,
    isRoundAnswered,
    isGameOver,
    isVictory,
    isDailyLocked,
    handleLockInGuess,
    handleNextRound,
    handleProceedToStemBalance,
    handleProceedToSingleFader,
    nudgeFader,
    setFaderDirect
  ]);

  // Current evaluation metrics (when answered)
  const currentResult = useMemo(() => {
    if (!isRoundAnswered) return null;
    return calculateDbScore(userFaderDb, targetDelta, roundCount);
  }, [isRoundAnswered, userFaderDb, targetDelta, roundCount]);

  // Major scale calibration ticks for console fader
  const scaleMarks = [
    { db: 6.0, label: '+6' },
    { db: 3.0, label: '+3' },
    { db: 0.0, label: '0' },
    { db: -3.0, label: '-3' },
    { db: -6.0, label: '-6' },
    { db: -9.0, label: '-9' },
    { db: -12.0, label: '-12' }
  ];

  const userFaderBottomPct = getDbPercentFromBottom(userFaderDb);
  const targetBottomPct = getDbPercentFromBottom(targetDelta);
  const unityBottomPct = getDbPercentFromBottom(0);

  return (
    <div className={isMobile ? 'space-y-3' : 'space-y-6'}>

      {/* Top Header & Status Bar */}
      <div className={`flex ${isMobile ? 'flex-col gap-2 p-2.5' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl shadow-lg`}>
        {isMobile ? (
          <>
            {/* Row 1 (Mobile): Round, 20/20 Left, Lives & Score directly next to each other */}
            <div className="flex items-center justify-between gap-1.5 w-full flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-studio-accent/20 text-studio-accent rounded-lg border border-studio-accent/30 shadow-sm">
                  {isPracticeMode ? `Rd ${roundCount} (Prac)` : `Rd ${roundCount}/20`}
                </span>
                {isPracticeMode ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm">
                    <Headphones className="w-3 h-3 text-purple-400" /> Practice
                  </span>
                ) : isCustomAudio ? (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm">
                    📁 Custom
                  </span>
                ) : (
                  remainingDailyRounds !== undefined && (
                    <span className={`px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border shadow-sm ${
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

                {/* Mobile Lives directly next to 20/20 Left */}
                {isPracticeMode ? (
                  <div className="flex items-center space-x-1 bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-500/40" title="Lives protected in Practice Mode">
                    <Heart className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
                    <span className="text-[9px] font-mono font-bold text-purple-200">PROTECTED</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 bg-studio-950 px-2 py-0.5 rounded-lg border border-studio-800">
                    {[1, 2, 3].map(heartIndex => (
                      heartIndex <= lives ? (
                        <Heart
                          key={heartIndex}
                          className="w-3.5 h-3.5 text-red-500 fill-red-500 filter drop-shadow-[0_0_4px_rgba(239,68,68,0.7)]"
                        />
                      ) : (
                        <HeartCrack
                          key={heartIndex}
                          className="w-3.5 h-3.5 text-slate-600 fill-slate-700/40"
                        />
                      )
                    ))}
                  </div>
                )}

                {/* Mobile Score directly next to 20/20 Left */}
                <span className="px-2 py-0.5 bg-studio-950 rounded-lg border border-studio-800 font-mono text-[11px] font-bold text-emerald-400">
                  +{sessionScore} PTS
                </span>
              </div>
            </div>

            {/* Row 2 (Mobile): Sub-Mode Toggle & Track Info */}
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="inline-flex p-0.5 bg-studio-950 rounded-xl border border-studio-800 shadow-sm font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setSubMode('single_fader')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg transition-all cursor-pointer font-bold ${
                    subMode === 'single_fader'
                      ? 'bg-studio-accent text-studio-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Single</span>
                </button>
                {isStemBalanceUnlocked ? (
                  <button
                    type="button"
                    onClick={() => setSubMode('stem_balance')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg transition-all cursor-pointer font-bold ${
                      subMode === 'stem_balance'
                        ? 'bg-studio-accent text-studio-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Stem</span>
                  </button>
                ) : (roundCount < 10 || (roundCount === 10 && !isRoundAnswered)) ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 text-slate-500 font-bold opacity-70">
                    <Lock className="w-3 h-3 text-slate-500" />
                    <span>Stem (Rd 11)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-0.5 text-slate-600 font-bold opacity-50">
                    <Lock className="w-3 h-3 text-slate-600" />
                    <span>Stem (Locked)</span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-1.5 bg-studio-950 px-2 py-1 rounded-xl border border-studio-800 font-mono text-[10px] truncate max-w-[150px]">
                <Music className="w-3 h-3 text-studio-accent animate-pulse shrink-0" />
                <span className="text-white font-bold truncate">{currentTrack.label}</span>
              </div>
            </div>
          </>
        ) : (
          /* Desktop Header */
          <>
            {/* Title & Badge */}
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider bg-studio-accent/20 text-studio-accent rounded-lg border border-studio-accent/30 shadow-sm">
                {isPracticeMode ? `Round ${roundCount} (Practice)` : `Round ${roundCount}/20`}
              </span>
              {isPracticeMode ? (
                <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                  <Headphones className="w-3.5 h-3.5 text-purple-400" /> Practice Mode (Lives Protected &bull; 0 PTS)
                </span>
              ) : isCustomAudio ? (
                <span className="px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1 shadow-sm">
                  📁 Custom Audio (Unlimited)
                </span>
              ) : (
                remainingDailyRounds !== undefined && (
                  <span className={`px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border shadow-sm ${
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

              {/* Sub-Mode Toggle */}
              <div className="inline-flex p-0.5 bg-studio-950 rounded-xl border border-studio-800 shadow-sm font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setSubMode('single_fader')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer font-bold ${
                    subMode === 'single_fader'
                      ? 'bg-studio-accent text-studio-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Single Track Level Matching"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Single Track</span>
                </button>
                {isStemBalanceUnlocked ? (
                  <button
                    type="button"
                    onClick={() => setSubMode('stem_balance')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer font-bold ${
                      subMode === 'stem_balance'
                        ? 'bg-studio-accent text-studio-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="4-Stem Balance Mixing Desk"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Stem Balance</span>
                  </button>
                ) : (roundCount < 10 || (roundCount === 10 && !isRoundAnswered)) ? (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 text-slate-500 font-bold cursor-help opacity-70"
                    title="Stem Balance unlocks for rounds 11–20 if you lose ≤ 1 life in the first 10 rounds"
                  >
                    <Lock className="w-3 h-3 text-slate-500" />
                    <span>Stem Balance (Rd 11)</span>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 text-slate-600 font-bold cursor-help opacity-50"
                    title="Stem Balance locked: Lost more than 1 life in the first 10 rounds"
                  >
                    <Lock className="w-3 h-3 text-slate-600" />
                    <span>Stem Balance (Locked)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Middle: Now Playing Track Chip */}
            <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 font-mono text-xs">
              <Music className="w-3.5 h-3.5 text-studio-accent animate-pulse" />
              <span className="text-slate-400">Track:</span>
              <span className="text-white font-bold">{currentTrack.label}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">({currentTrack.genre})</span>
            </div>

            {/* Right: Lives & Score */}
            <div className="flex items-center space-x-4">
              {isPracticeMode ? (
                <div className="flex items-center space-x-1.5 bg-purple-950/60 px-3 py-1.5 rounded-xl border border-purple-500/40" title="Lives protected in Practice Mode">
                  <Heart className="w-4 h-4 text-purple-400 fill-purple-400" />
                  <span className="text-xs font-mono font-bold text-purple-200 uppercase">Lives Protected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800">
                  {[1, 2, 3].map(heartIndex => (
                    heartIndex <= lives ? (
                      <Heart
                        key={heartIndex}
                        className="w-4 h-4 text-red-500 fill-red-500 filter drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]"
                      />
                    ) : (
                      <HeartCrack
                        key={heartIndex}
                        className="w-4 h-4 text-slate-600 fill-slate-700/40"
                      />
                    )
                  ))}
                </div>
              )}

              <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800 font-mono text-xs">
                <span className="text-slate-400">Score:</span>
                <span className="text-emerald-400 font-bold">+{sessionScore} PTS</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sub-Mode Console Display */}
      {subMode === 'stem_balance' ? (
        <StemBalanceConsole
          roundCount={roundCount}
          lives={lives}
          onRoundComplete={handleStemRoundComplete}
          onNextRound={handleNextRound}
          isDailyLocked={isDailyLocked}
          isCustomAudio={isCustomAudio}
          currentSourceType={currentTrack.type}
          isMobile={isMobile}
        />
      ) : (
        /* Main Audition & Comparison Console */
        <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'rounded-2xl p-3' : 'rounded-3xl p-4 sm:p-6'} shadow-2xl relative overflow-hidden`}>
        
        {/* Subtle Background Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-studio-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className={`max-w-3xl mx-auto ${isMobile ? 'space-y-3' : 'space-y-5'}`}>
          
          {/* Instructions Banner */}
          <div className="text-center space-y-1">
            <h2 className={`${isMobile ? 'text-base font-bold' : 'text-lg sm:text-2xl font-black'} text-white tracking-tight flex items-center justify-center gap-2`}>
              <SlidersHorizontal className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6'} text-studio-accent`} />
              <span>dB Master: Precision Level Matching</span>
            </h2>
            {!isMobile && (
              <p className="text-xs sm:text-sm text-slate-400 font-mono">
                Listen to the <strong className="text-slate-200">[A] Reference</strong> & <strong className="text-studio-accent">[B] Changed Level</strong>, move the fader to match in 0.1 dB steps, then lock in your guess! {roundCount <= 10 && <span className="text-amber-400 font-bold">(Rounds 1–10: lose a life if diff &gt; 1.0 dB)</span>}
              </p>
            )}
          </div>

          {/* Real-time Dynamic Audio Activity Monitor Bar (Desktop Only) */}
          {!isMobile && (
            <div className="bg-studio-950/90 border border-studio-800 rounded-2xl p-3 shadow-inner">
              <div className="flex items-center justify-between mb-1.5 font-mono text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-studio-accent" />
                  <span>Audio Activity Monitor</span>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">(Uncalibrated • Use your ears)</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  listeningMode === 'bypass'
                    ? 'bg-slate-800 text-slate-200 border border-slate-700'
                    : listeningMode === 'target'
                    ? 'bg-studio-accent/20 text-studio-accent border border-studio-accent/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  Auditioning:{' '}
                  {listeningMode === 'bypass'
                    ? 'Level [A] Reference (0.0 dB)'
                    : listeningMode === 'target'
                    ? 'Level [B] Mystery Target'
                    : `Level [C] Your Fader (${formatDeltaDb(userFaderDb)})`}
                </span>
              </div>

              <canvas
                ref={canvasRef}
                width={640}
                height={44}
                className="w-full h-11 rounded-lg bg-studio-950 block"
              />
            </div>
          )}

          {/* 3-Way Audition Switcher & Playback Transport (Desktop Only - Above Fader Box) */}
          {!isMobile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              
              {/* Play/Pause Button */}
              <button
                type="button"
                onClick={() => audioEngine.togglePlay()}
                className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-mono text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer ${
                  isPlaying
                    ? 'bg-studio-neonPink text-white shadow-studio-neonPink/30 ring-2 ring-studio-neonPink/50'
                    : 'bg-studio-accent text-studio-950 shadow-studio-accent/30 hover:brightness-110'
                }`}
                title="Play / Pause Audio (Spacebar)"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>

              {/* Level [A] Reference Button */}
              <button
                type="button"
                onClick={() => audioEngine.setListeningMode('bypass')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-mono text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  listeningMode === 'bypass'
                    ? 'bg-slate-700 text-white shadow-xl shadow-slate-900/60 border-slate-400 ring-2 ring-slate-400'
                    : 'bg-studio-950/80 text-slate-400 border-studio-800 hover:text-white hover:bg-studio-850'
                }`}
                title="Audition Reference [A] (Shortcut: A or Q)"
              >
                <Volume1 className={`w-4 h-4 ${listeningMode === 'bypass' ? 'text-white' : 'text-slate-500'}`} />
                <div className="text-left">
                  <span className="block leading-none">[A] REF</span>
                  <span className="text-[10px] font-normal opacity-70">0.0 dB</span>
                </div>
              </button>

              {/* Level [B] Shifted Level Button */}
              <button
                type="button"
                onClick={() => audioEngine.setListeningMode('target')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-mono text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  listeningMode === 'target'
                    ? 'bg-studio-accent text-studio-950 shadow-xl shadow-studio-accent/30 border-cyan-300 ring-2 ring-studio-accent/70'
                    : 'bg-studio-950/80 text-slate-400 border-studio-800 hover:text-white hover:bg-studio-850'
                }`}
                title="Audition Changed Level [B] (Shortcut: B or W)"
              >
                <Volume2 className={`w-4 h-4 ${listeningMode === 'target' ? 'text-studio-950' : 'text-studio-accent'}`} />
                <div className="text-left">
                  <span className="block leading-none">[B] TARGET</span>
                  <span className="text-[10px] font-normal opacity-70">
                    {isRoundAnswered ? formatDeltaDb(targetDelta) : '? Shifted'}
                  </span>
                </div>
              </button>

              {/* Level [C] User Fader Live Match Button */}
              <button
                type="button"
                onClick={() => audioEngine.setListeningMode('user')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-mono text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  listeningMode === 'user'
                    ? 'bg-emerald-500 text-studio-950 shadow-xl shadow-emerald-500/30 border-emerald-300 ring-2 ring-emerald-400'
                    : 'bg-studio-950/80 text-slate-400 border-studio-800 hover:text-white hover:bg-studio-850'
                }`}
                title="Audition Your Live Fader [C] (Shortcut: C or E)"
              >
                <Sliders className={`w-4 h-4 ${listeningMode === 'user' ? 'text-studio-950' : 'text-emerald-400'}`} />
                <div className="text-left">
                  <span className="block leading-none">[C] YOURS</span>
                  <span className="text-[10px] font-normal opacity-70">
                    {formatDeltaDb(userFaderDb)}
                  </span>
                </div>
              </button>

            </div>
          )}

          {/* Interactive Console Fader Section */}
          <div className={`bg-studio-950/90 border border-studio-800 ${isMobile ? 'rounded-2xl p-2.5 space-y-2.5' : 'rounded-3xl p-4 sm:p-6'} shadow-inner`}>
            
            {/* Mobile: 3-Way Audition Switcher & Playback Transport inside Fader Box */}
            {isMobile && (
              <div className="grid grid-cols-4 gap-1.5 w-full">
                {/* Play/Pause Button */}
                <button
                  type="button"
                  onClick={() => audioEngine.togglePlay()}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl font-mono text-[10px] font-bold transition-all shadow-md active:scale-95 cursor-pointer ${
                    isPlaying
                      ? 'bg-studio-neonPink text-white shadow-studio-neonPink/30'
                      : 'bg-studio-accent text-studio-950 hover:brightness-110'
                  }`}
                  title="Play / Pause Audio"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                  <span className="mt-0.5 leading-none">{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                </button>

                {/* Level [A] Reference Button */}
                <button
                  type="button"
                  onClick={() => audioEngine.setListeningMode('bypass')}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl font-mono text-[10px] font-bold transition-all cursor-pointer active:scale-95 border ${
                    listeningMode === 'bypass'
                      ? 'bg-slate-700 text-white shadow-md border-slate-400 ring-1 ring-slate-400'
                      : 'bg-studio-900/90 text-slate-400 border-studio-800 hover:text-white'
                  }`}
                  title="Audition Reference [A]"
                >
                  <div className="flex items-center gap-1">
                    <Volume1 className={`w-3 h-3 ${listeningMode === 'bypass' ? 'text-white' : 'text-slate-500'}`} />
                    <span>[A] REF</span>
                  </div>
                  <span className="text-[9px] font-normal opacity-70 mt-0.5">0.0 dB</span>
                </button>

                {/* Level [B] Shifted Level Button */}
                <button
                  type="button"
                  onClick={() => audioEngine.setListeningMode('target')}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl font-mono text-[10px] font-bold transition-all cursor-pointer active:scale-95 border ${
                    listeningMode === 'target'
                      ? 'bg-studio-accent text-studio-950 shadow-md border-cyan-300 ring-1 ring-studio-accent/70'
                      : 'bg-studio-900/90 text-slate-400 border-studio-800 hover:text-white'
                  }`}
                  title="Audition Changed Level [B]"
                >
                  <div className="flex items-center gap-1">
                    <Volume2 className={`w-3 h-3 ${listeningMode === 'target' ? 'text-studio-950' : 'text-studio-accent'}`} />
                    <span>[B] TGT</span>
                  </div>
                  <span className="text-[9px] font-normal opacity-70 mt-0.5">
                    {isRoundAnswered ? formatDeltaDb(targetDelta) : '? Shift'}
                  </span>
                </button>

                {/* Level [C] User Fader Live Match Button */}
                <button
                  type="button"
                  onClick={() => audioEngine.setListeningMode('user')}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl font-mono text-[10px] font-bold transition-all cursor-pointer active:scale-95 border ${
                    listeningMode === 'user'
                      ? 'bg-emerald-500 text-studio-950 shadow-md border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-studio-900/90 text-slate-400 border-studio-800 hover:text-white'
                  }`}
                  title="Audition Your Live Fader [C]"
                >
                  <div className="flex items-center gap-1">
                    <Sliders className={`w-3 h-3 ${listeningMode === 'user' ? 'text-studio-950' : 'text-emerald-400'}`} />
                    <span>[C] YOU</span>
                  </div>
                  <span className="text-[9px] font-normal opacity-70 mt-0.5">
                    {formatDeltaDb(userFaderDb)}
                  </span>
                </button>
              </div>
            )}

            <div className={`grid ${isMobile ? 'grid-cols-12 gap-2' : 'grid-cols-1 md:grid-cols-12 gap-6'} items-center`}>
              
              {/* Left / Center: Studio Hardware Vertical Fader */}
              <div className={`${isMobile ? 'col-span-5' : 'md:col-span-6'} flex items-center justify-center select-none py-1`}>
                
                <div className={`flex items-center ${isMobile ? 'space-x-1.5' : 'space-x-4 sm:space-x-6'}`}>
                  
                  {/* Calibrated dB Scale Labels (Left) */}
                  <div
                    className={`flex flex-col justify-between text-right font-mono ${isMobile ? 'text-[9px]' : 'text-[11px]'} font-bold text-slate-400`}
                    style={{ height: isMobile ? '200px' : '300px' }}
                  >
                    {scaleMarks.map(mark => (
                      <button
                        key={mark.db}
                        type="button"
                        disabled={isRoundAnswered || isGameOver || isDailyLocked}
                        onClick={() => setFaderDirect(mark.db)}
                        className={`transition-colors hover:text-studio-accent cursor-pointer ${
                          mark.db === 0.0 ? 'text-studio-accent font-black' : ''
                        } ${Math.abs(userFaderDb - mark.db) < 0.15 ? 'text-white' : ''}`}
                        title={`Snap to ${mark.label} dB`}
                      >
                        {mark.label}
                      </button>
                    ))}
                  </div>

                  {/* Vertical Fader Track Container */}
                  <div
                    ref={trackRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{ height: isMobile ? '200px' : '300px', touchAction: 'none' }}
                    className={`relative ${isMobile ? 'w-12' : 'w-14 sm:w-16'} bg-studio-900 border-2 border-studio-700/80 rounded-2xl p-1 shadow-2xl flex items-center justify-center cursor-pointer group`}
                  >
                    
                    {/* Metal Track Slot (Center groove) */}
                    <div className="absolute inset-y-4 w-3 bg-black/90 rounded-full border border-studio-800 shadow-inner" />

                    {/* Scale Hash Marks inside the slot */}
                    <div className="absolute inset-y-4 inset-x-2 pointer-events-none flex flex-col justify-between py-1 opacity-40">
                      {scaleMarks.map(m => (
                        <div
                          key={'hash-' + m.db}
                          className={`w-full border-t ${m.db === 0 ? 'border-studio-accent border-t-2' : 'border-slate-500'}`}
                        />
                      ))}
                    </div>

                    {/* Unity 0 dB Reference Center Marker */}
                    <div
                      className="absolute w-full pointer-events-none border-t border-dashed border-studio-accent/60"
                      style={{ bottom: `${unityBottomPct}%` }}
                    />

                    {/* Active Fader Level Fill (Glow strip from 0dB to user level) */}
                    {userFaderDb >= 0 ? (
                      <div
                        className="absolute w-2 bg-gradient-to-t from-emerald-500/40 to-emerald-400 rounded-full pointer-events-none"
                        style={{
                          bottom: `${unityBottomPct}%`,
                          height: `${Math.max(0, userFaderBottomPct - unityBottomPct)}%`
                        }}
                      />
                    ) : (
                      <div
                        className="absolute w-2 bg-gradient-to-b from-cyan-500/40 to-cyan-400 rounded-full pointer-events-none"
                        style={{
                          bottom: `${userFaderBottomPct}%`,
                          height: `${Math.max(0, unityBottomPct - userFaderBottomPct)}%`
                        }}
                      />
                    )}

                    {/* REVEAL TARGET INDICATOR (Displayed when round answered) */}
                    {isRoundAnswered && (
                      <div
                        className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-500 animate-milestonePop"
                        style={{ bottom: `calc(${targetBottomPct}% - 7px)` }}
                      >
                        <div className="w-full h-3.5 bg-emerald-500/90 border border-emerald-300 rounded shadow-[0_0_12px_rgba(16,185,129,0.9)] flex items-center justify-center">
                          <span className="font-mono text-[9px] font-black text-studio-950 uppercase tracking-tight">
                            Target {formatDeltaDb(targetDelta)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* USER FADER CAP / KNOB */}
                    <div
                      className={`absolute left-1 right-1 h-9 rounded-xl z-10 transition-transform duration-75 shadow-2xl border flex flex-col items-center justify-center cursor-grab active:cursor-grabbing ${
                        isRoundAnswered
                          ? currentResult?.isHit
                            ? 'bg-gradient-to-b from-emerald-400 via-emerald-600 to-emerald-800 border-emerald-300 text-studio-950 shadow-emerald-500/40'
                            : 'bg-gradient-to-b from-rose-400 via-rose-600 to-rose-800 border-rose-300 text-white shadow-rose-500/40'
                          : isDragging
                          ? 'bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 border-studio-accent ring-2 ring-studio-accent shadow-[0_0_20px_rgba(0,240,255,0.6)]'
                          : 'bg-gradient-to-b from-slate-300 via-slate-400 to-slate-600 border-slate-200 hover:border-studio-accent shadow-black/80'
                      }`}
                      style={{
                        bottom: `calc(${userFaderBottomPct}% - 18px)`
                      }}
                    >
                      {/* Fader Handle Grip Ridges */}
                      <div className="w-6 h-0.5 bg-slate-900/60 rounded-full mb-0.5" />
                      {/* Center Indicator Line */}
                      <div className={`w-8 h-1 rounded-full ${isRoundAnswered ? 'bg-white' : 'bg-studio-accent shadow-[0_0_6px_#00f0ff]'}`} />
                      <div className="w-6 h-0.5 bg-slate-900/60 rounded-full mt-0.5" />
                    </div>

                  </div>

                  {/* Quick Scale Click Ticks (Right) */}
                  <div
                    className={`flex flex-col justify-between font-mono ${isMobile ? 'text-[8px]' : 'text-[10px]'} text-slate-500`}
                    style={{ height: isMobile ? '200px' : '300px' }}
                  >
                    <span className="text-[8px] sm:text-[9px] font-bold text-emerald-400 uppercase">Boost</span>
                    <span className="text-[8px] sm:text-[9px] font-bold text-studio-accent uppercase">Unity</span>
                    <span className="text-[8px] sm:text-[9px] font-bold text-cyan-400 uppercase">Cut</span>
                  </div>

                </div>

              </div>

              {/* Right: Digital Readout, Nudge Controls & Lock-In Button (Scaled down on mobile) */}
              <div className={`${isMobile ? 'col-span-7 space-y-2' : 'md:col-span-6 space-y-4'}`}>
                
                {/* Big Digital LED Display (Scaled down on mobile) */}
                <div className={`${isMobile ? 'p-1.5 rounded-xl space-y-0.5' : 'p-4 rounded-2xl space-y-2'} bg-studio-900/90 border border-studio-800 shadow-lg text-center`}>
                  <div className={`flex items-center justify-between font-mono text-slate-400 px-1 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                    <span>POSITION</span>
                    <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} ${roundCount <= 10 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                      {roundCount <= 10 ? '±1.0 dB Max' : '0.1 dB Res'}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <span className={`font-mono ${isMobile ? 'text-2xl' : 'text-4xl sm:text-5xl'} font-black tracking-tight ${
                      userFaderDb > 0
                        ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                        : userFaderDb < 0
                        ? 'text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                        : 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]'
                    }`}>
                      {formatDeltaDb(userFaderDb)}
                    </span>

                    {userFaderDb > 0 ? (
                      <span className={`${isMobile ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1`}>
                        <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Boost
                      </span>
                    ) : userFaderDb < 0 ? (
                      <span className={`${isMobile ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1`}>
                        <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Cut
                      </span>
                    ) : (
                      <span className={`${isMobile ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} font-mono font-bold rounded-lg bg-slate-800 text-slate-300 border border-slate-700`}>
                        Unity
                      </span>
                    )}
                  </div>
                </div>

                {/* Micro-Step Buttons (-1.0, -0.1, 0, +0.1, +1.0) (Scaled down on mobile) */}
                <div className={isMobile ? 'space-y-0.5' : 'space-y-1.5'}>
                  <span className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} font-mono text-slate-400 block text-center`}>
                    Fine-Tuning Controls
                  </span>
                  
                  <div className={`grid grid-cols-5 ${isMobile ? 'gap-1' : 'gap-1.5'}`}>
                    <button
                      type="button"
                      disabled={isRoundAnswered || isGameOver || isDailyLocked}
                      onClick={() => nudgeFader(-1.0)}
                      className={`${isMobile ? 'py-1.5 rounded-lg text-[10px]' : 'py-2.5 rounded-xl text-xs'} bg-studio-900 border border-studio-800 font-mono font-bold text-slate-300 hover:text-white hover:bg-studio-850 hover:border-studio-700 transition-all active:scale-95 cursor-pointer disabled:opacity-40`}
                      title="Nudge down 1.0 dB"
                    >
                      -1.0
                    </button>
                    <button
                      type="button"
                      disabled={isRoundAnswered || isGameOver || isDailyLocked}
                      onClick={() => nudgeFader(-0.1)}
                      className={`${isMobile ? 'py-1.5 rounded-lg text-[10px]' : 'py-2.5 rounded-xl text-xs'} bg-studio-900 border border-studio-800 font-mono font-bold text-slate-300 hover:text-white hover:bg-studio-850 hover:border-studio-700 transition-all active:scale-95 cursor-pointer disabled:opacity-40`}
                      title="Nudge down 0.1 dB (Arrow Down)"
                    >
                      -0.1
                    </button>
                    <button
                      type="button"
                      disabled={isRoundAnswered || isGameOver || isDailyLocked}
                      onClick={() => setFaderDirect(0.0)}
                      className={`${isMobile ? 'py-1.5 rounded-lg text-[10px]' : 'py-2.5 rounded-xl text-xs'} bg-studio-800 border border-studio-700 font-mono font-bold text-studio-accent hover:brightness-110 transition-all active:scale-95 cursor-pointer disabled:opacity-40`}
                      title="Reset to Unity (0.0 dB)"
                    >
                      0.0
                    </button>
                    <button
                      type="button"
                      disabled={isRoundAnswered || isGameOver || isDailyLocked}
                      onClick={() => nudgeFader(0.1)}
                      className={`${isMobile ? 'py-1.5 rounded-lg text-[10px]' : 'py-2.5 rounded-xl text-xs'} bg-studio-900 border border-studio-800 font-mono font-bold text-slate-300 hover:text-white hover:bg-studio-850 hover:border-studio-700 transition-all active:scale-95 cursor-pointer disabled:opacity-40`}
                      title="Nudge up 0.1 dB (Arrow Up)"
                    >
                      +0.1
                    </button>
                    <button
                      type="button"
                      disabled={isRoundAnswered || isGameOver || isDailyLocked}
                      onClick={() => nudgeFader(1.0)}
                      className={`${isMobile ? 'py-1.5 rounded-lg text-[10px]' : 'py-2.5 rounded-xl text-xs'} bg-studio-900 border border-studio-800 font-mono font-bold text-slate-300 hover:text-white hover:bg-studio-850 hover:border-studio-700 transition-all active:scale-95 cursor-pointer disabled:opacity-40`}
                      title="Nudge up 1.0 dB"
                    >
                      +1.0
                    </button>
                  </div>
                </div>

                {/* LOCK IN GUESS BUTTON (Scaled down on mobile) */}
                {!isRoundAnswered && !isGameOver && !isVictory && (
                  <button
                    type="button"
                    disabled={isDailyLocked}
                    onClick={handleLockInGuess}
                    className={`w-full ${isMobile ? 'py-2 px-3 rounded-xl text-xs' : 'py-4 px-6 rounded-2xl text-sm'} bg-gradient-to-r from-cyan-400 via-studio-accent to-emerald-400 text-studio-950 font-mono font-black uppercase tracking-wider shadow-lg shadow-studio-accent/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center space-x-1.5 cursor-pointer`}
                  >
                    <Target className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-studio-950 shrink-0`} />
                    <span>{isMobile ? `LOCK IN: ${formatDeltaDb(userFaderDb)}` : `LOCK IN GUESS: ${formatDeltaDb(userFaderDb)}`}</span>
                    {!isMobile && <span className="text-[10px] opacity-75 font-normal">(Enter)</span>}
                  </button>
                )}

                {/* Mobile Only: NEXT ROUND BUTTON directly under fine-tuning controls when round is answered */}
                {isMobile && isRoundAnswered && !isGameOver && !isVictory && (
                  <button
                    type="button"
                    onClick={roundCount === 10 && isStemBalanceUnlocked ? handleProceedToStemBalance : handleNextRound}
                    className="w-full py-2 px-3 bg-studio-accent text-studio-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-studio-accent/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer animate-milestonePop"
                  >
                    <span>
                      {roundCount === 10
                        ? isStemBalanceUnlocked
                          ? 'PROCEED TO STEM (RD 11)'
                          : 'CONTINUE (RD 11)'
                        : 'NEXT ROUND'}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                )}

              </div>

            </div>

          </div>

          {/* Feedback & Next Round Controls */}
          {isRoundAnswered && !isGameOver && !isVictory && currentResult && (
            <div className={`rounded-2xl bg-studio-950 border border-studio-800 flex flex-col sm:flex-row items-center justify-between gap-4 animate-milestonePop ${isMobile ? 'p-2.5 gap-2' : 'p-4 gap-4'}`}>
              
              <div className="space-y-1 text-left w-full sm:w-auto font-mono">
                <div className="flex items-center space-x-2 text-sm sm:text-base font-bold">
                  {currentResult.status === 'spot_on' ? (
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <Sparkles className="w-5 h-5 text-emerald-300 animate-spin" />
                      <span>🎯 SPOT ON! Exact level match! (+{currentResult.score} PTS)</span>
                    </div>
                  ) : currentResult.status === 'excellent' ? (
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>⚡ EXCELLENT! Out by only {currentResult.diffDb.toFixed(1)} dB (+{currentResult.score} PTS)</span>
                    </div>
                  ) : currentResult.status === 'good' ? (
                    <div className="flex items-center space-x-2 text-cyan-400">
                      <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                      <span>👍 GOOD EAR! Out by {currentResult.diffDb.toFixed(1)} dB (+{currentResult.score} PTS)</span>
                    </div>
                  ) : currentResult.status === 'pass' ? (
                    <div className="flex items-center space-x-2 text-amber-400">
                      <Award className="w-5 h-5 text-amber-400" />
                      <span>⚠️ OVER 3 dB OUT! ({currentResult.diffDb.toFixed(1)} dB diff) (+{currentResult.score} PTS)</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-rose-400">
                      <HeartCrack className="w-5 h-5 text-rose-400" />
                      <span>❌ MISS! Out by {currentResult.diffDb.toFixed(1)} dB ({roundCount <= 10 ? '>1.0 dB' : '>6.0 dB'} = 0 PTS, 1 Life Lost)</span>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-400">
                  Target: <strong className="text-white">{formatDeltaDb(targetDelta)}</strong> &bull; Your Guess: <strong className="text-studio-accent">{formatDeltaDb(userFaderDb)}</strong> &bull; Difference: <strong className="text-slate-200">{currentResult.diffDb.toFixed(1)} dB</strong>
                </div>
              </div>

              {!isMobile && (
                <button
                  type="button"
                  onClick={roundCount === 10 && isStemBalanceUnlocked ? handleProceedToStemBalance : handleNextRound}
                  className="w-full sm:w-auto px-6 py-3 bg-studio-accent text-studio-950 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-studio-accent/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-2 cursor-pointer flex-shrink-0"
                >
                  <span>
                    {roundCount === 10
                      ? isStemBalanceUnlocked
                        ? 'PROCEED TO STEM BALANCE (RD 11)'
                        : 'CONTINUE SINGLE TRACK (RD 11)'
                      : 'NEXT ROUND'}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-[10px] opacity-75 font-normal">(Enter)</span>
                </button>
              )}

            </div>
          )}

          {/* Keyboard Shortcuts Hint Bar */}
          <div className="pt-2 text-center text-[11px] font-mono text-slate-500">
            Shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">A</kbd> Ref &bull;{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">B</kbd> Target &bull;{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">C</kbd> Your Fader &bull;{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">&uarr;/&darr;</kbd> &plusmn;0.1dB &bull;{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">Enter</kbd> Lock In &bull;{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-studio-950 border border-studio-800 text-slate-300">Space</kbd> Play/Pause
          </div>

        </div>

      </div>
      )}

      {/* Game Over Screen */}
      {isGameOver && (
        <div className="bg-gradient-to-r from-red-950/80 via-studio-900 to-studio-950 border-2 border-red-500/50 p-6 rounded-3xl shadow-2xl animate-milestonePop">
          <div className="max-w-xl mx-auto text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/30 animate-bounce">
              <HeartCrack className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black font-sans text-white">
                GAME OVER &bull; ALL LIVES EXHAUSTED
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-mono">
                You reached Round {roundCount} with a final score of <strong className="text-emerald-400">+{sessionScore} PTS</strong>.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestartSession}
                className="flex items-center space-x-2 px-6 py-3 bg-studio-accent text-studio-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-studio-accent/25 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              {onOpenLeaderboard && (
                <button
                  type="button"
                  onClick={onOpenLeaderboard}
                  className="flex items-center space-x-2 px-5 py-3 bg-studio-800 border border-studio-700 text-slate-200 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:bg-studio-750 cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Leaderboard</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Victory Screen (Round 20 Completed) */}
      {isVictory && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-studio-900 to-studio-950 border-2 border-emerald-500/50 p-6 rounded-3xl shadow-2xl animate-milestonePop">
          <div className="max-w-xl mx-auto text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/30 animate-bounce">
              <Trophy className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black font-sans text-white">
                🏆 dB Master Challenge Complete!
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-mono">
                Outstanding ear training! You conquered all 20 rounds with <strong className="text-red-400">{lives} of 3 Lives</strong> remaining! Final Score: <strong className="text-emerald-400">+{sessionScore} PTS</strong>.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestartSession}
                className="flex items-center space-x-2 px-6 py-3 bg-emerald-400 text-studio-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-emerald-400/25 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Play New Session</span>
              </button>

              {onOpenLeaderboard && (
                <button
                  type="button"
                  onClick={onOpenLeaderboard}
                  className="flex items-center space-x-2 px-5 py-3 bg-amber-400 text-studio-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-amber-400/25 cursor-pointer"
                >
                  <Trophy className="w-4 h-4" />
                  <span>View Leaderboard</span>
                </button>
              )}
            </div>
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
                You've completed all 20 rounds for dB Master today. Resets tomorrow at midnight!
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-milestoneFade" />

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
        </div>
      )}

      {/* STEM BALANCE UNLOCKED / LOCKED OVERLAY (ROUNDS 11–20) */}
      {stemUnlockedMilestone && (
        <div
          onClick={stemUnlockedMilestone === 'unlocked' ? handleProceedToStemBalance : handleProceedToSingleFader}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm animate-milestoneFade" />

          {stemUnlockedMilestone === 'unlocked' ? (
            <div className="relative z-10 max-w-md w-full px-8 py-8 rounded-3xl border-2 border-cyan-400/80 bg-gradient-to-b from-cyan-500/25 via-studio-900/95 to-studio-950/98 shadow-2xl shadow-cyan-500/40 ring-4 ring-cyan-500/20 flex flex-col items-center text-center animate-milestonePop">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-cyan-500 via-emerald-400 to-purple-500 opacity-25 blur-xl animate-pulse" />

              <div className="relative flex items-center space-x-2 text-xs sm:text-sm font-mono font-extrabold tracking-widest uppercase text-cyan-300 mb-3">
                <Sparkles className="w-4 h-4 text-cyan-300 animate-spin" />
                <span>ROUNDS 11–20 ACTIVATED!</span>
                <Sparkles className="w-4 h-4 text-cyan-300 animate-spin" />
              </div>

              <div className="relative my-3 flex items-center justify-center">
                <div className="w-20 h-20 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400/60 flex items-center justify-center shadow-[0_0_35px_rgba(6,182,212,0.6)] animate-bounce text-cyan-300">
                  <Sliders className="w-10 h-10" />
                </div>
              </div>

              <h3 className="relative text-2xl sm:text-3xl font-black font-mono tracking-tight text-white mt-1 drop-shadow-lg">
                4-STEM BALANCE DESK UNLOCKED!
              </h3>

              <p className="relative text-xs sm:text-sm font-mono text-cyan-200/90 mt-2">
                Outstanding precision! You cleared the first 10 rounds losing <strong className="text-white font-bold">{livesLostInFirst10 === 1 ? 'only 1 life' : `${livesLostInFirst10} lives`}</strong>! You've unlocked the 4-Stem mixing challenge for Rounds 11–20.
              </p>

              <button
                type="button"
                onClick={handleProceedToStemBalance}
                className="relative mt-6 px-6 py-3 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-studio-950 font-mono font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/30 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer"
              >
                <span>ENTER STEM BALANCE (ROUND 11)</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="relative mt-3 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                (or tap anywhere to begin)
              </span>
            </div>
          ) : (
            <div className="relative z-10 max-w-md w-full px-8 py-8 rounded-3xl border-2 border-amber-500/70 bg-gradient-to-b from-amber-500/20 via-studio-900/95 to-studio-950/98 shadow-2xl shadow-amber-500/30 ring-4 ring-amber-500/20 flex flex-col items-center text-center animate-milestonePop">
              <div className="relative flex items-center space-x-2 text-xs sm:text-sm font-mono font-extrabold tracking-widest uppercase text-amber-300 mb-3">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>STEM BALANCE CHALLENGE LOCKED</span>
              </div>

              <div className="relative my-3 flex items-center justify-center">
                <div className="w-18 h-18 rounded-2xl bg-amber-500/15 border-2 border-amber-400/50 flex items-center justify-center shadow-lg text-amber-400">
                  <Lock className="w-9 h-9" />
                </div>
              </div>

              <h3 className="relative text-xl sm:text-2xl font-black font-mono tracking-tight text-white mt-1 drop-shadow-lg">
                CONTINUING SINGLE TRACK GAIN
              </h3>

              <p className="relative text-xs sm:text-sm font-mono text-slate-300 mt-2">
                You lost <strong className="text-rose-400 font-bold">{livesLostInFirst10} lives</strong> in the first 10 rounds (maximum 1 allowed to qualify for Stem Balance). Continuing with Single Track Gain for Rounds 11–20.
              </p>

              <button
                type="button"
                onClick={handleProceedToSingleFader}
                className="relative mt-6 px-6 py-3 bg-amber-400 hover:bg-amber-300 text-studio-950 font-mono font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/30 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer"
              >
                <span>CONTINUE SINGLE TRACK (ROUND 11)</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="relative mt-3 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                (or tap anywhere to continue)
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
