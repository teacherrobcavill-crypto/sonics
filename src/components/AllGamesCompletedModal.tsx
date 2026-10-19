import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Sparkles, Headphones, X, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

interface AllGamesCompletedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewLeaderboard: () => void;
  onContinuePractice: () => void;
  studentName?: string;
  totalScore?: number;
  rankTitle?: string;
  isMobile?: boolean;
}

export const AllGamesCompletedModal: React.FC<AllGamesCompletedModalProps> = ({
  isOpen,
  onClose,
  onViewLeaderboard,
  onContinuePractice,
  studentName,
  totalScore = 0,
  rankTitle = 'Audio Novice',
  isMobile = false
}) => {
  useEffect(() => {
    if (!isOpen) return;

    // Multi-burst fireworks celebration
    const fireCelebration = () => {
      const colors = ['#fbbf24', '#f59e0b', '#10b981', '#00f0ff', '#ec4899', '#ffffff'];

      // Center explosion
      confetti({
        particleCount: 90,
        spread: 100,
        origin: { x: 0.5, y: 0.45 },
        colors,
        disableForReducedMotion: true
      });

      // Left blast
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 70,
          origin: { x: 0.2, y: 0.6 },
          colors,
          disableForReducedMotion: true
        });
      }, 180);

      // Right blast
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 70,
          origin: { x: 0.8, y: 0.6 },
          colors,
          disableForReducedMotion: true
        });
      }, 360);
    };

    fireCelebration();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      {/* Blurred Studio Backdrop */}
      <div 
        className="absolute inset-0 bg-studio-950/85 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className={`relative z-10 w-full ${isMobile ? 'max-w-sm p-4' : 'max-w-lg p-6 sm:p-8'} bg-gradient-to-b from-studio-900/95 via-studio-950 to-studio-950 border-2 border-amber-400/40 rounded-3xl shadow-2xl shadow-amber-500/10 flex flex-col items-center text-center`}>
        
        {/* Subtle Ambient Glow Behind */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-amber-500/20 via-studio-accent/15 to-emerald-500/20 opacity-40 blur-2xl pointer-events-none" />

        {/* Close Icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-studio-900/80 hover:bg-studio-800 border border-studio-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Celebratory Trophy Badge */}
        <div className="relative my-2 flex items-center justify-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-amber-400/30 to-yellow-300/20 border-2 border-amber-400/60 flex items-center justify-center shadow-[0_0_40px_rgba(251,191,36,0.35)] animate-bounce">
            <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
          </div>
          <span className="absolute -top-1.5 -right-2 px-2.5 py-0.5 rounded-full bg-emerald-400 text-studio-950 font-mono font-black text-xs shadow-lg flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> 100/100
          </span>
        </div>

        {/* Header Title */}
        <div className="flex items-center space-x-2 text-xs font-mono font-extrabold tracking-widest uppercase text-amber-400 mt-2">
          <Sparkles className="w-3.5 h-3.5 animate-spin" />
          <span>DAILY TRAINING COMPLETED</span>
          <Sparkles className="w-3.5 h-3.5 animate-spin" />
        </div>

        <h2 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black text-white tracking-tight mt-1`}>
          Outstanding Ear Mastery!
        </h2>

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-300 font-sans mt-2 max-w-md leading-relaxed">
          {studentName ? <strong className="text-white">{studentName}</strong> : 'You have'}, congratulations! You conquered all 20 daily rounds across all 5 training games today. Your scores are officially locked onto the leaderboard.
        </p>

        {/* Snapshot Stats Pills */}
        <div className="grid grid-cols-2 gap-2.5 w-full my-4 text-left">
          <div className="bg-studio-900/90 border border-studio-800 p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">All 5 Games</div>
              <div className="text-xs sm:text-sm font-bold text-white truncate">100 / 100 Rounds</div>
            </div>
          </div>

          <div className="bg-studio-900/90 border border-studio-800 p-2.5 sm:p-3 rounded-2xl flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-studio-accent/10 border border-studio-accent/30 flex items-center justify-center text-studio-accent shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Rank Status</div>
              <div className="text-xs sm:text-sm font-bold text-studio-accent truncate">{rankTitle}</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2.5 pt-1">
          {/* Primary: View Leaderboard */}
          <button
            onClick={onViewLeaderboard}
            className="w-full flex items-center justify-center space-x-2 px-5 py-3.5 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-studio-950 font-bold font-mono text-xs sm:text-sm uppercase tracking-wider rounded-2xl hover:brightness-110 shadow-lg shadow-amber-400/25 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Trophy className="w-4 h-4" />
            <span>View Leaderboard</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          {/* Secondary: Continue in Practice Mode */}
          <button
            onClick={onContinuePractice}
            className="w-full flex flex-col items-center justify-center px-4 py-2.5 bg-studio-900/90 hover:bg-studio-850 text-slate-200 hover:text-white border border-studio-700/80 hover:border-purple-500/50 rounded-2xl transition-all cursor-pointer group"
          >
            <div className="flex items-center space-x-2 font-mono text-xs font-bold text-purple-300 group-hover:text-purple-200">
              <Headphones className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              <span>Continue in Practice Mode</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
              Unlimited rounds &bull; No lives lost &bull; Zero points added
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
