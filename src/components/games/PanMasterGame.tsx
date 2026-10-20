import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Compass,
  Heart,
  HeartCrack,
  Award,
  ChevronRight,
  Crosshair,
  RotateCcw,
  Sparkles,
  Sliders,
  Layers,
  Music,
  Trophy,
  Activity,
  Volume2,
  Radio,
  Headphones
} from 'lucide-react';
import { FilterParams, GameMode, RoundResult } from '../../types';
import { audioEngine } from '../../audio/AudioEngine';
import { InlineTransport } from '../InlineTransport';
import {
  getPersistedGameSession,
  savePersistedGameSession
} from '../../utils/studentStorage';

interface PanMasterGameProps {
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
 * Calculates tolerance half-width in pan percentage (-100 to +100 scale) for round (1 to 20).
 * Matches soundstage grid intervals:
 * - Round 1:  ±25% (balanced starting soundstage window, 1 grid division left/right)
 * - Rounds 1–18: Scales smoothly down to ±10% in an inverse-log style decay
 * - Rounds 19 & 20: Only the last 2 rounds narrow to pinpoint precision (±6% and ±3%)
 */
function getRoundPanTolerance(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 18) {
    const progress = (r - 1) / 17.0;
    // Gentle inverse-log decay from ±25% down to ±10%
    return 25 - Math.pow(progress, 1.5) * (25 - 10);
  } else if (r === 19) {
    // Round 19: narrow (±6%)
    return 6;
  } else {
    // Round 20: pinpoint (±3%)
    return 3;
  }
}

/**
 * Returns the maximum score for a spot-on guess in Pan Master for a given round.
 * Rounds 1–10: 400 points max (scaled back 20% from 500).
 * Rounds 11–18: Scales up linearly from 400 to 800.
 * Rounds 19 & 20: 800 points max awarded for spot-on guesses in the final 2 rounds (scaled back 20% from 1,000).
 */
function getPanMasterMaxScore(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 10) return 400;
  if (r >= 19) return 800;
  const progress = (r - 10) / 9.0;
  return Math.round(400 + progress * 400);
}

/**
 * Formats a pan value (-100 to +100) into a clean user-facing string
 */
function formatPan(pan: number): string {
  const rounded = Math.round(pan);
  if (rounded === 0) return 'Center (0%)';
  if (rounded < 0) return `${Math.abs(rounded)}% Left`;
  return `${rounded}% Right`;
}

export const PanMasterGame: React.FC<PanMasterGameProps> = ({
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

  // Game session state (restored from daily persistence if available)
  const [roundCount, setRoundCount] = useState<number>(() => {
    const saved = getPersistedGameSession('pan_master');
    return saved ? saved.roundCount : 1;
  });
  const [lives, setLives] = useState<number>(() => {
    const saved = getPersistedGameSession('pan_master');
    return saved ? saved.lives : 3;
  });
  const [isGameOver, setIsGameOver] = useState<boolean>(() => {
    const saved = getPersistedGameSession('pan_master');
    return saved ? saved.isGameOver : false;
  });
  const [isVictory, setIsVictory] = useState<boolean>(() => {
    const saved = getPersistedGameSession('pan_master');
    return saved ? saved.isVictory : false;
  });
  const [sessionScore, setSessionScore] = useState<number>(() => {
    const saved = getPersistedGameSession('pan_master');
    return saved ? saved.sessionScore : 0;
  });
  const [round10Milestone, setRound10Milestone] = useState<'extra_life' | 'bonus_points' | null>(null);

  // Persist session state so switching tabs or refreshing never resets lives
  useEffect(() => {
    savePersistedGameSession('pan_master', {
      roundCount,
      lives,
      isGameOver,
      isVictory,
      sessionScore
    });
  }, [roundCount, lives, isGameOver, isVictory, sessionScore]);

  // Target mystery pan (-100 to +100)
  const [targetPan, setTargetPan] = useState<number>(0);

  // User guess pan (-100 to +100), default starts at Center (0%)
  const [hoverPan, setHoverPan] = useState<number | null>(0);
  const [pinnedPan, setPinnedPan] = useState<number | null>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isRoundAnswered, setIsRoundAnswered] = useState<boolean>(false);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [lastHitStatus, setLastHitStatus] = useState<'hit' | 'miss' | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Current round tolerance width (in percentage)
  const currentTolerance = useMemo(() => {
    return getRoundPanTolerance(roundCount);
  }, [roundCount]);

  // Active aiming position (defaults to Center 0%)
  const activePan = pinnedPan ?? hoverPan ?? 0;

  // Tolerance window boundaries
  const toleranceLeft = Math.max(-100, Math.round(activePan - currentTolerance));
  const toleranceRight = Math.min(100, Math.round(activePan + currentTolerance));

  // Generate new random target pan
  const generateNewRound = useCallback(() => {
    // Generate random pan between -95 and +95 (avoid dead zero to ensure audible panning challenge)
    const sign = Math.random() > 0.5 ? 1 : -1;
    // Weighted slightly away from dead center: 10% to 95%
    const magnitude = Math.round(10 + Math.random() * 85);
    const newTarget = sign * magnitude;

    setTargetPan(newTarget);
    if (isActive) {
      audioEngine.resetFiltersToFlat();
      audioEngine.resetDbLevels();
      audioEngine.setTargetPan(newTarget / 100);
      audioEngine.setUserPan(0);
      audioEngine.setListeningMode('target');
    }

    // Default start point is explicitly Center (0%) every round
    setPinnedPan(0);
    setHoverPan(0);
    setIsRoundAnswered(false);
    setLastRoundResult(null);
    setLastHitStatus(null);
    setStartTime(Date.now());
  }, [isActive]);

  // Initial load: generate round 1 target
  useEffect(() => {
    generateNewRound();
    return () => {
      audioEngine.setMonoMode(false);
      audioEngine.setTargetPan(0);
      audioEngine.setUserPan(0);
    };
  }, []);

  // Re-sync AudioEngine when Pan Master becomes the active tab
  useEffect(() => {
    if (isActive) {
      audioEngine.setCorrectionMode(false);
      audioEngine.setStemMode(false);
      audioEngine.resetFiltersToFlat();
      audioEngine.resetDbLevels();
      audioEngine.setMonoMode(true);
      audioEngine.setTargetPan(targetPan / 100);
      audioEngine.setUserPan((pinnedPan ?? hoverPan ?? 0) / 100);
      audioEngine.setListeningMode('target');
    } else {
      audioEngine.setMonoMode(false);
      audioEngine.setTargetPan(0);
      audioEngine.setUserPan(0);
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

  // Pointer hover, click, and drag on canvas
  const panFromPointerEvent = (e: React.PointerEvent<HTMLCanvasElement>): number => {
    if (!canvasRef.current) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const norm = x / rect.width; // 0 to 1
    const pan = -100 + norm * 200; // -100 to +100
    return Math.max(-100, Math.min(100, Math.round(pan)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const pan = panFromPointerEvent(e);
    setPinnedPan(pan);
    setHoverPan(pan);
    audioEngine.setUserPan(pan / 100);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    const pan = panFromPointerEvent(e);
    setHoverPan(pan);
    if (isDragging) {
      setPinnedPan(pan);
      audioEngine.setUserPan(pan / 100);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Micro-nudges
  const handleNudge = (delta: number) => {
    if (isRoundAnswered || isGameOver || isDailyLocked) return;
    const current = pinnedPan ?? hoverPan ?? 0;
    const nextPan = Math.max(-100, Math.min(100, current + delta));
    setPinnedPan(nextPan);
    setHoverPan(nextPan);
    audioEngine.setUserPan(nextPan / 100);
  };

  // Submit guess
  const handleSubmitGuess = () => {
    if (isRoundAnswered || isDailyLocked || isGameOver) return;

    const guess = activePan;
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const distPercent = Math.abs(guess - targetPan);

    // Hit test: Is target inside the current round's tolerance window?
    const isHit = distPercent <= currentTolerance;
    const maxPossibleScore = getPanMasterMaxScore(roundCount);

    let score = 0;
    if (isHit) {
      if (distPercent <= 2) {
        // Bullseye (within 2% of true stereo placement)
        score = maxPossibleScore;
      } else {
        const ratio = 1 - (distPercent / currentTolerance);
        const minHitScore = Math.round(maxPossibleScore * 0.25);
        score = Math.round(minHitScore + (maxPossibleScore - minHitScore) * Math.pow(ratio, 1.25));
      }
    } else {
      score = 0;
    }

    if (isPracticeMode) {
      score = 0;
    }

    const dummyFilter: FilterParams = {
      type: 'peaking',
      frequency: 1000,
      gain: 0,
      q: 1.41
    };

    const result: RoundResult = {
      roundNumber: roundCount,
      mode: 'pan_master',
      target: dummyFilter,
      guess: dummyFilter,
      freqDistanceOctaves: 0,
      freqDistanceSemitones: 0,
      gainDistanceDb: 0,
      isFilterTypeCorrect: true,
      isDirectionCorrect: Math.sign(guess) === Math.sign(targetPan),
      score: score,
      timeSpentSeconds: elapsedSeconds,
      timestamp: Date.now(),
      panTarget: targetPan,
      panGuess: guess,
      panDistance: distPercent
    };

    setIsRoundAnswered(true);
    setLastRoundResult(result);
    setLastHitStatus(isHit ? 'hit' : 'miss');
    setSessionScore(prev => prev + score);

    // Lives & game over handling (Lives protected in Practice Mode)
    if (isHit) {
      if (distPercent <= 2 || (score >= Math.round(maxPossibleScore * 0.85) && !isPracticeMode)) {
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
      }
    }

    onRoundComplete(result);
  };

  // Next Round
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
        setSessionScore(prev => prev + 80);
        onBonusPoints?.(80);
        setRound10Milestone('bonus_points');
        confetti({
          particleCount: 80,
          spread: 90,
          origin: { y: 0.5 },
          colors: ['#fbbf24', '#f59e0b', '#10b981', '#00f0ff', '#ffffff']
        });
      }
    }

    generateNewRound();
  };

  // Restart session
  const handleRestartSession = () => {
    setRoundCount(1);
    setLives(3);
    setIsGameOver(false);
    setIsVictory(false);
    setSessionScore(0);
    setRound10Milestone(null);
    generateNewRound();
  };

  // Canvas 60fps Stereo Soundstage Render Loop
  useEffect(() => {
    let animationId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, w, h);

      // Soundstage curved arc & perspective grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#141c2e';

      // Perspective convergence to listener bottom-center
      const listenerX = w / 2;
      const listenerY = h - 20;

      // Radial perspective rays
      [-100, -75, -50, -25, 0, 25, 50, 75, 100].forEach(tickPan => {
        const norm = (tickPan + 100) / 200;
        const x = norm * w;
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(listenerX, listenerY);
        ctx.strokeStyle = tickPan === 0 ? '#1f2d4a' : '#121827';
        ctx.stroke();
      });

      // Horizontal soundstage track bar
      const barY = 75;
      const barHeight = 8;
      ctx.fillStyle = '#161f36';
      ctx.beginPath();
      ctx.roundRect(0, barY, w, barHeight, 4);
      ctx.fill();

      // Division tick lines & labels
      const tickMarks = [
        { pan: -100, label: '100% L' },
        { pan: -75, label: '75% L' },
        { pan: -50, label: '50% L' },
        { pan: -25, label: '25% L' },
        { pan: 0, label: 'CENTER' },
        { pan: 25, label: '25% R' },
        { pan: 50, label: '50% R' },
        { pan: 75, label: '75% R' },
        { pan: 100, label: '100% R' }
      ];

      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';

      tickMarks.forEach(({ pan, label }) => {
        const norm = (pan + 100) / 200;
        const x = norm * w;

        ctx.strokeStyle = pan === 0 ? '#00f0ff' : '#2a3b63';
        ctx.lineWidth = pan === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, barY - 10);
        ctx.lineTo(x, barY + barHeight + 10);
        ctx.stroke();

        ctx.fillStyle = pan === 0 ? '#00f0ff' : '#64748b';
        ctx.fillText(label, Math.max(25, Math.min(w - 25, x)), barY + barHeight + 25);
      });

      // Tolerance Shaded Band
      const normCenter = (activePan + 100) / 200;
      const normStart = (toleranceLeft + 100) / 200;
      const normEnd = (toleranceRight + 100) / 200;

      const xCenter = normCenter * w;
      const xStart = normStart * w;
      const xEnd = normEnd * w;
      const bandWidth = Math.max(3, xEnd - xStart);

      let fillColor = 'rgba(0, 240, 255, 0.14)';
      let borderColor = '#00f0ff';
      let centerColor = '#00f0ff';

      if (isRoundAnswered) {
        if (lastHitStatus === 'hit') {
          fillColor = 'rgba(0, 255, 136, 0.22)';
          borderColor = '#00ff88';
          centerColor = '#00ff88';
        } else {
          fillColor = 'rgba(239, 68, 68, 0.22)';
          borderColor = '#ef4444';
          centerColor = '#ef4444';
        }
      } else if (pinnedPan !== null) {
        fillColor = 'rgba(255, 183, 3, 0.18)';
        borderColor = '#ffb703';
        centerColor = '#ffb703';
      }

      // Draw shaded area
      ctx.fillStyle = fillColor;
      ctx.fillRect(xStart, 20, bandWidth, h - 45);

      // Boundary vertical lines
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isRoundAnswered ? 2 : 1.5;
      ctx.setLineDash(lastHitStatus === 'miss' ? [5, 4] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(xStart, 20);
      ctx.lineTo(xStart, h - 25);
      ctx.moveTo(xEnd, 20);
      ctx.lineTo(xEnd, h - 25);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top and bottom bracket caps
      const capW = Math.min(10, bandWidth / 2);
      ctx.fillStyle = borderColor;
      ctx.fillRect(xStart, 20, capW, 4);
      ctx.fillRect(Math.max(xStart, xEnd - capW), 20, capW, 4);
      ctx.fillRect(xStart, h - 29, capW, 4);
      ctx.fillRect(Math.max(xStart, xEnd - capW), h - 29, capW, 4);

      // Center Aiming Hairline
      ctx.strokeStyle = centerColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xCenter, 15);
      ctx.lineTo(xCenter, h - 20);
      ctx.stroke();

      // Aiming Knob on Soundstage Track
      ctx.fillStyle = centerColor;
      ctx.beginPath();
      ctx.arc(xCenter, barY + barHeight / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 2;
      ctx.stroke();

      // If round is answered: Reveal target position in Neon Green
      if (isRoundAnswered) {
        const normTarget = (targetPan + 100) / 200;
        const xTarget = normTarget * w;

        // Target vertical dashed line
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xTarget, 10);
        ctx.lineTo(xTarget, h - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Target Beacon Pin
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(xTarget, 18, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillStyle = '#00ff88';
        ctx.fillText(`TARGET: ${formatPan(targetPan)}`, Math.max(50, Math.min(w - 50, xTarget)), 34);
      }

      // Listener icon at bottom center
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(listenerX, listenerY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText('LISTENER (HEADPHONES / MONITORS)', listenerX, h - 6);

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [activePan, toleranceLeft, toleranceRight, isRoundAnswered, lastHitStatus, pinnedPan, targetPan]);

  // Handle Resize (both window resize and container width changes when switching viewMode)
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = isMobile ? 190 : 240;
      }
    };
    handleResize();

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isMobile]);

  return (
    <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
      
      {/* Settings & Game Header */}
      <div className={`flex ${isMobile ? 'flex-col items-stretch gap-3 p-3.5' : 'flex-col sm:flex-row items-center justify-between gap-4 p-4'} bg-studio-900 border border-studio-800 rounded-2xl shadow-lg`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider bg-studio-neonBlue/20 text-studio-neonBlue rounded-lg border border-studio-neonBlue/30 flex items-center gap-1.5 shadow-sm">
              <Compass className="w-3.5 h-3.5" />
              {isPracticeMode ? `Round ${roundCount} (Practice)` : `Round ${roundCount} / 20`}
            </span>

            {/* Lives Indicator */}
            {isPracticeMode ? (
              <div className="flex items-center space-x-1 px-2.5 py-1 bg-purple-950/60 border border-purple-500/40 rounded-lg shadow-inner" title="Lives protected in Practice Mode">
                <span className="text-[11px] font-mono text-purple-300 mr-1 font-semibold uppercase">Lives:</span>
                <Heart className="w-4 h-4 text-purple-400 fill-purple-400" />
                <span className="text-[10px] font-mono font-bold text-purple-200 uppercase">Protected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 px-2.5 py-1 bg-studio-950 border border-studio-800 rounded-lg shadow-inner">
                <span className="text-[11px] font-mono text-slate-400 mr-1 font-semibold uppercase">Lives:</span>
                {[1, 2, 3].map(heartIdx => (
                  <span key={heartIdx} className="transition-transform duration-300">
                    {heartIdx <= lives ? (
                      <Heart className="w-4 h-4 text-red-500 fill-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                    ) : (
                      <HeartCrack className="w-4 h-4 text-slate-600/70" />
                    )}
                  </span>
                ))}
              </div>
            )}

            {isPracticeMode ? (
              <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                <Headphones className="w-3.5 h-3.5 text-purple-400" /> Practice Mode {isMobile ? '' : '(Lives Protected • 0 PTS)'}
              </span>
            ) : isCustomAudio ? (
              <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-1.5 shadow-sm">
                📁 Custom Audio {isMobile ? '' : '(Unlimited • Unranked)'}
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
                  🎯 {remainingDailyRounds}/20 Left
                </span>
              )
            )}

            {/* Mono Mode Badge (Compact, right next to 20/20 Left) */}
            <span
              className="px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border bg-cyan-500/15 text-cyan-300 border-cyan-500/30 flex items-center gap-1.5 shadow-sm"
              title="Clean mono summing prevents phase cancellation and timbral changes when panning"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mono</span>
            </span>
          </div>
          <h2 className={`${isMobile ? 'text-lg mt-2' : 'text-xl mt-1.5'} font-bold text-white flex flex-wrap items-baseline gap-2`}>
            <span>Pan Master</span>
            <span className="text-xs font-normal text-slate-400">(Stereo Soundstage Placement)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {isMobile
              ? 'Compare [B] Target Pan vs [A] Center • Tap soundstage to aim!'
              : 'Audition [B] Target Pan vs [A] Center • Click where the sound is placed • Scoring scales from 400 up to 800 PTS as tolerance tightens!'}
          </p>
        </div>

        {/* Headphones Recommendation Badge */}
        <div className={`flex items-center justify-center space-x-2 bg-studio-950 px-3 py-2 rounded-xl border border-studio-800 text-xs font-mono text-slate-300 ${isMobile ? 'w-full' : 'shrink-0'}`}>
          <Volume2 className="w-4 h-4 text-studio-accent animate-pulse shrink-0" />
          <span>{isMobile ? 'Headphones Recommended' : 'Headphones or Studio Monitors Recommended'}</span>
        </div>
      </div>

      {/* Interactive Soundstage Stereo Field Canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-2xl overflow-hidden border border-studio-800 bg-studio-950 shadow-2xl select-none"
        style={{ height: isMobile ? 190 : 240 }}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full block touch-none ${!isRoundAnswered && !isGameOver && !isDailyLocked ? 'cursor-crosshair' : 'cursor-default'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Helper Hint */}
        {!isRoundAnswered && !isGameOver && !isDailyLocked && !isMobile && (
          <div className="pointer-events-none absolute bottom-3 left-4 text-[10px] font-mono text-slate-400 bg-studio-950/80 px-2.5 py-1 rounded border border-studio-800/80 flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-studio-accent animate-ping" />
            <span>Click or drag across soundstage to aim &bull; Starts at Center (0%)</span>
          </div>
        )}

        {/* Speaker Icons & Channel Badges */}
        <div className={`pointer-events-none absolute top-2.5 left-3 flex items-center space-x-1.5 ${isMobile ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} font-mono text-cyan-400 bg-studio-900/80 rounded border border-cyan-500/30`}>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>{isMobile ? 'LEFT (100% L)' : 'LEFT SPEAKER (100% L)'}</span>
        </div>

        <div className={`pointer-events-none absolute top-2.5 right-3 flex items-center space-x-1.5 ${isMobile ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} font-mono text-amber-400 bg-studio-900/80 rounded border border-amber-500/30`}>
          <span>{isMobile ? 'RIGHT (100% R)' : 'RIGHT SPEAKER (100% R)'}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
      </div>

      {/* Interactive Tolerance & Precision Gauge (Desktop Only) */}
      {!isMobile && (
        <div className="bg-studio-900 border border-studio-800 p-4 flex-col md:flex-row items-center justify-between gap-4 rounded-2xl shadow-xl flex">
          
          {/* Left: Active Aiming Readout & Micro-Nudges */}
          <div className="flex flex-wrap items-center justify-between gap-2 w-full md:w-auto">
            <div className="flex items-center space-x-2 bg-studio-950 px-3 py-2 rounded-xl border border-studio-800">
              <Crosshair className="w-4 h-4 text-studio-accent shrink-0" />
              <div className="font-mono text-xs">
                <span className="text-slate-400">Aiming: </span>
                <span className="text-white font-bold text-sm">{formatPan(activePan)}</span>
                {pinnedPan !== null && (
                  <span className="ml-2 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                    Locked
                  </span>
                )}
              </div>
            </div>

            {/* Micro Nudges */}
            {!isRoundAnswered && !isGameOver && !isDailyLocked && (
              <div className="flex items-center space-x-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => handleNudge(-2)}
                  className="px-2.5 py-1.5 bg-studio-950 hover:bg-studio-800 text-slate-300 hover:text-white rounded-lg border border-studio-800 cursor-pointer"
                  title="Nudge 2% Left"
                >
                  &larr; L 2%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinnedPan(0);
                    setHoverPan(0);
                    audioEngine.setUserPan(0);
                  }}
                  className="px-2.5 py-1.5 bg-studio-950 hover:bg-studio-800 text-studio-accent hover:brightness-110 rounded-lg border border-studio-800 cursor-pointer font-bold"
                  title="Reset to Center (0%)"
                >
                  Center
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge(2)}
                  className="px-2.5 py-1.5 bg-studio-950 hover:bg-studio-800 text-slate-300 hover:text-white rounded-lg border border-studio-800 cursor-pointer"
                  title="Nudge 2% Right"
                >
                  R 2% &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Center: Tolerance Gauge Meter */}
          <div className="w-full md:w-80 bg-studio-950/80 p-2.5 rounded-xl border border-studio-800 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Tolerance:</span>
              <span className="text-studio-accent font-bold">
                &plusmn;{currentTolerance.toFixed(0)}% ({formatPan(toleranceLeft)} &ndash; {formatPan(toleranceRight)})
              </span>
            </div>

            {/* Dynamic Gauge Meter */}
            <div className="w-full h-2 bg-studio-900 rounded-full overflow-hidden border border-studio-800/80">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  currentTolerance > 15
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : currentTolerance > 8
                    ? 'bg-gradient-to-r from-teal-400 to-amber-400'
                    : 'bg-gradient-to-r from-amber-400 to-red-500'
                }`}
                style={{
                  width: `${Math.max(8, (currentTolerance / 25) * 100)}%`
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
              <span>Tight (&plusmn;3%)</span>
              <span>Round {roundCount} of 20</span>
              <span>Wide (&plusmn;25%)</span>
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
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-3 flex-col items-stretch gap-2.5' : 'p-2.5 flex-wrap items-center gap-3 sm:gap-4'} rounded-2xl shadow-xl flex`}>
        {/* Play controls configured for Panning Comparison */}
        <InlineTransport
          bypassLabel={isMobile ? '[A] CENTER' : '[A] CENTER (0%)'}
          targetLabel={isMobile ? '[B] TARGET' : '[B] TARGET PAN'}
          showUserMatch={false}
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
          ) : isGameOver ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-red-950/40 text-red-400 cursor-not-allowed border border-red-800/40 w-full text-center"
            >
              Out of Lives (0/3)
            </button>
          ) : (
            <button
              onClick={handleSubmitGuess}
              className={`px-6 py-3 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 bg-studio-accent text-studio-950 shadow-studio-accent/25 hover:brightness-110 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'} text-center`}
            >
              Submit Guess ({formatPan(activePan)}) &bull; Up to {getPanMasterMaxScore(roundCount)} PTS
            </button>
          )
        ) : (
          <>
            {/* Next Round or Finish */}
            {!isGameOver && !isVictory && (
              <button
                onClick={handleNextRound}
                className={`px-6 py-3 rounded-xl font-bold font-mono text-xs uppercase tracking-wider bg-studio-neonGreen text-studio-950 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-1.5 shadow-lg shadow-studio-neonGreen/20 cursor-pointer ${isMobile ? 'w-full' : 'w-full sm:w-auto'}`}
              >
                <span>{roundCount >= 20 ? 'Complete Run' : 'Next Round'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {lastRoundResult && (
              <>
                {/* Result Status & Score */}
                <div className={`px-3.5 py-2 rounded-xl border font-bold font-mono text-xs flex items-center justify-center space-x-1.5 ${
                  lastHitStatus === 'hit'
                    ? (lastRoundResult.panDistance !== undefined && lastRoundResult.panDistance <= 2)
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10 shadow-lg'
                      : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                }`}>
                  <Award className="w-4 h-4 shrink-0" />
                  <span>
                    {lastHitStatus === 'hit'
                      ? (lastRoundResult.panDistance !== undefined && lastRoundResult.panDistance <= 2)
                        ? `+${lastRoundResult.score.toLocaleString()} PTS • BULLSEYE!`
                        : `+${lastRoundResult.score.toLocaleString()} PTS (HIT!)`
                      : 'MISS • 1 LIFE LOST (-1 ❤️)'}
                  </span>
                </div>

                {/* Target vs Guess readout */}
                <div className="text-xs font-mono bg-studio-950/80 px-3 py-2 rounded-xl border border-studio-800 text-center">
                  <span className="text-slate-400">Target: </span>
                  <span className="text-emerald-400 font-bold">{formatPan(targetPan)}</span>
                  <span className="text-slate-500 mx-1.5">|</span>
                  <span className="text-slate-400">Aim: </span>
                  <span className={lastHitStatus === 'hit' ? 'text-teal-300 font-bold' : 'text-red-400 font-bold'}>
                    {formatPan(activePan)}
                  </span>
                  <span className="text-slate-500 mx-1.5">&bull;</span>
                  <span className="text-slate-400 text-[11px]">
                    Offset: {Math.abs(activePan - targetPan)}% (Max: &plusmn;{currentTolerance.toFixed(0)}%)
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* GAME OVER CARD: When 3 lives lost before round 20 */}
      {isGameOver && (
        <div className={`${isMobile ? 'p-4' : 'p-6'} bg-red-950/30 border border-red-500/40 rounded-3xl space-y-4 shadow-2xl backdrop-blur-md animate-fade-in`}>
          <div className={`flex ${isMobile ? 'flex-col items-stretch' : 'flex-col sm:flex-row items-center justify-between'} gap-4`}>
            <div className="flex items-center space-x-3 text-red-400">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                <HeartCrack className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white font-sans">
                  Out of Lives &bull; Pan Master Session Ended
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  You survived to <strong className="text-white">Round {roundCount} of 20</strong> and banked <strong className="text-emerald-400">+{sessionScore.toLocaleString()} PTS</strong>.
                </p>
              </div>
            </div>

            {/* If custom audio, allow instant replay */}
            {isCustomAudio && (
              <button
                onClick={handleRestartSession}
                className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-studio-accent text-studio-950 font-bold font-mono text-xs rounded-xl hover:brightness-110 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry (Custom Audio)</span>
              </button>
            )}
          </div>

          <div className="border-t border-red-900/60 pt-4">
            <span className="text-xs font-mono text-slate-300 block mb-3 font-semibold">
              Move on to other available training games for today:
            </span>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'} gap-2.5`}>
              <button
                onClick={() => onNavigateToMode?.('peak_master')}
                className="flex items-center justify-center space-x-2 p-3 bg-studio-900 hover:bg-studio-800 border border-studio-700/80 rounded-xl text-xs font-mono font-bold text-studio-accent transition-all cursor-pointer shadow"
              >
                <Activity className="w-4 h-4" />
                <span>Peak Master</span>
              </button>

              <button
                onClick={() => onNavigateToMode?.('tye_match')}
                className="flex items-center justify-center space-x-2 p-3 bg-studio-900 hover:bg-studio-800 border border-studio-700/80 rounded-xl text-xs font-mono font-bold text-studio-neonGreen transition-all cursor-pointer shadow"
              >
                <Sliders className="w-4 h-4" />
                <span>EQ Correct</span>
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
        <div className={`${isMobile ? 'p-4' : 'p-6'} bg-emerald-950/40 border border-emerald-500/50 rounded-3xl space-y-4 shadow-2xl backdrop-blur-md animate-fade-in`}>
          <div className={`flex ${isMobile ? 'flex-col items-stretch' : 'flex-col sm:flex-row items-center justify-between'} gap-4`}>
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/20 shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-sans flex items-center gap-2">
                  <span>🏆 Pan Master Challenge Complete!</span>
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-1">
                  You conquered all 20 rounds of stereo placement with <strong className="text-red-400">{lives} of 3 Lives</strong> remaining! Final Run Score: <strong className="text-emerald-400">+{sessionScore.toLocaleString()} PTS</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenLeaderboard}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-amber-400 text-studio-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg shadow-amber-400/20 cursor-pointer"
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
                You've completed all 20 rounds for Pan Master today. Resets tomorrow at midnight!
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
                  +80
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
