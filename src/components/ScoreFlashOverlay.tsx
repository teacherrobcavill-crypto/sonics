import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Star, Sparkles, Award } from 'lucide-react';
import { RoundResult } from '../types';

interface ScoreFlashOverlayProps {
  result: RoundResult | null;
  onDismiss?: () => void;
  isCustomAudioPractice?: boolean;
}

export const ScoreFlashOverlay: React.FC<ScoreFlashOverlayProps> = ({
  result,
  onDismiss,
  isCustomAudioPractice = false
}) => {
  const [visible, setVisible] = useState(false);
  const [currentResult, setCurrentResult] = useState<RoundResult | null>(null);

  useEffect(() => {
    if (!result) return;

    setCurrentResult(result);
    setVisible(true);

    // Launch explosive starry effect
    triggerStarryExplosion(result.score);

    // Auto dismiss after 1.8 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, 1800);

    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  const triggerStarryExplosion = (score: number) => {
    const starColors = ['#ffd700', '#ffb703', '#00f0ff', '#00ff88', '#ff0077', '#ffffff'];

    // Burst 1: Immediate radial starry explosion from center
    confetti({
      particleCount: score >= 900 ? 120 : score >= 500 ? 80 : 45,
      spread: 360,
      startVelocity: 38,
      ticks: 120,
      origin: { x: 0.5, y: 0.48 },
      shapes: ['star'],
      colors: starColors,
      scalar: 1.4,
      gravity: 0.8,
      disableForReducedMotion: true
    });

    // Burst 2: Staggered secondary sparkling shower (+120ms)
    setTimeout(() => {
      confetti({
        particleCount: score >= 800 ? 60 : 30,
        angle: 90,
        spread: 160,
        startVelocity: 28,
        ticks: 140,
        origin: { x: 0.5, y: 0.52 },
        shapes: ['star', 'circle'],
        colors: ['#ffffff', '#ffd700', '#00f0ff'],
        scalar: 1.1,
        gravity: 0.9
      });
    }, 120);

    // Burst 3: Golden crescendo for near-perfect and perfect hits (+250ms)
    if (score >= 900) {
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 360,
          startVelocity: 42,
          ticks: 100,
          origin: { x: 0.5, y: 0.45 },
          shapes: ['star'],
          colors: ['#ffe600', '#ffaa00', '#ffffff'],
          scalar: 1.6,
          gravity: 0.7
        });
      }, 250);
    }
  };

  if (!visible || !currentResult) return null;

  const score = currentResult.score;

  let title = "CLOSE!";
  let badgeBorder = "border-amber-400/60 shadow-amber-500/30";
  let textColor = "text-amber-300";
  let bgGradient = "from-amber-500/20 via-studio-900/90 to-studio-950/95";

  if (score >= 980) {
    title = "⭐ PERFECT HIT! ⭐";
    badgeBorder = "border-yellow-400 shadow-yellow-500/50 ring-4 ring-yellow-400/30";
    textColor = "text-yellow-300";
    bgGradient = "from-yellow-500/30 via-studio-900/95 to-studio-950/98";
  } else if (score >= 800) {
    title = "✨ EXCELLENT EAR! ✨";
    badgeBorder = "border-emerald-400 shadow-emerald-500/40 ring-2 ring-emerald-400/30";
    textColor = "text-emerald-300";
    bgGradient = "from-emerald-500/25 via-studio-900/95 to-studio-950/98";
  } else if (score >= 500) {
    title = "GREAT GUESS!";
    badgeBorder = "border-cyan-400 shadow-cyan-500/30";
    textColor = "text-cyan-300";
    bgGradient = "from-cyan-500/20 via-studio-900/95 to-studio-950/98";
  } else if (score > 0) {
    title = "NICE TRY!";
    badgeBorder = "border-amber-500/40 shadow-amber-500/20";
    textColor = "text-amber-400";
    bgGradient = "from-amber-600/15 via-studio-900/95 to-studio-950/98";
  } else {
    title = "MISSED!";
    badgeBorder = "border-red-500/40 shadow-red-500/20";
    textColor = "text-red-400";
    bgGradient = "from-red-600/15 via-studio-900/95 to-studio-950/98";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
      {/* Radiant Backdrop Flash */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 animate-fadeIn" />

      {/* Main Animated Score Card */}
      <div className={`relative z-10 px-8 py-7 sm:px-12 sm:py-9 rounded-3xl border-2 bg-gradient-to-b ${bgGradient} ${badgeBorder} shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center text-center transform animate-scorePop`}>
        
        {/* Glow Ring Behind */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-studio-accent via-yellow-400 to-studio-neonPink opacity-20 blur-xl animate-pulse" />

        {/* Top Title */}
        <div className="flex items-center space-x-2 text-xs sm:text-sm font-mono font-extrabold tracking-widest uppercase mb-1 drop-shadow">
          <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
          <span className={textColor}>{title}</span>
          <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
        </div>

        {/* Big Giant Score */}
        <div className="flex items-baseline space-x-1 my-1">
          <span className={`text-6xl sm:text-7xl font-black font-mono tracking-tight drop-shadow-2xl ${textColor}`}>
            +{score.toLocaleString()}
          </span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-slate-300 opacity-80">
            PTS
          </span>
        </div>

        {/* Feedback Sub-pill */}
        <div className="mt-2 inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-studio-950/80 border border-slate-700/60 text-xs font-mono text-slate-300 shadow">
          {score === 1000 ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-current" />
              100% Exact Frequency Hit!
            </span>
          ) : (
            <span>
              Error: <strong className="text-white">{currentResult.freqDistanceSemitones.toFixed(1)} semitones</strong> ({currentResult.freqDistanceOctaves.toFixed(2)} octaves)
            </span>
          )}
        </div>

        {/* Custom Audio Practice Notice */}
        {isCustomAudioPractice && (
          <div className="mt-2 text-[10px] sm:text-xs font-mono font-medium text-cyan-300 bg-cyan-950/80 px-3 py-1 rounded-full border border-cyan-500/40 shadow">
            📁 Custom Audio Mode &bull; Score Displayed (Not Recorded on Leaderboard)
          </div>
        )}

      </div>

      <style>{`
        @keyframes scorePop {
          0% {
            opacity: 0;
            transform: scale(0.4) translateY(20px);
          }
          45% {
            opacity: 1;
            transform: scale(1.08) translateY(-4px);
          }
          65% {
            transform: scale(0.98) translateY(0);
          }
          85% {
            opacity: 1;
            transform: scale(1.0) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(1.04) translateY(-10px);
          }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          20% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-scorePop {
          animation: scorePop 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fadeIn {
          animation: fadeIn 1.8s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
};
