import React, { useState } from 'react';
import { X, Award, CheckCircle2, ChevronRight, Sparkles, Calendar, BookOpen, Star } from 'lucide-react';
import { ACADEMIC_RANKS, RankInfo, getRankDetails } from '../utils/frequencies';

interface RankLadderModalProps {
  isOpen: boolean;
  onClose: () => void;
  userScore: number;
  isMobile?: boolean;
}

export const RankLadderModal: React.FC<RankLadderModalProps> = ({
  isOpen,
  onClose,
  userScore,
  isMobile = false
}) => {
  const [activeYear, setActiveYear] = useState<1 | 2>(1);

  if (!isOpen) return null;

  const rankDetails = getRankDetails(userScore);
  const currentTier = rankDetails.currentRank.tier;

  const year1Ranks = ACADEMIC_RANKS.filter(r => r.year === 1);
  const year2Ranks = ACADEMIC_RANKS.filter(r => r.year === 2);
  const displayedRanks = activeYear === 1 ? year1Ranks : year2Ranks;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-studio-950/80 backdrop-blur-md animate-fadeIn">
      <div className={`bg-studio-900 border border-studio-800 rounded-2xl sm:rounded-3xl w-full max-w-3xl ${isMobile ? 'max-h-[95vh]' : 'max-h-[90vh]'} flex flex-col shadow-2xl overflow-hidden`}>
        
        {/* Modal Header */}
        <div className="p-3.5 sm:p-6 border-b border-studio-800 flex items-center justify-between bg-studio-950/40 gap-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <Award className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-bold text-white flex items-center gap-1.5 truncate">
                {isMobile ? '2-Year Rank Ladder' : '2-Year Audio Engineering Rank Ladder'}
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
                Curriculum Progression (July to May) &bull; Calibrated for 20 daily practice rounds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-studio-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Current Student Standing Strip */}
        <div className={`bg-gradient-to-r from-studio-950 via-studio-900 to-studio-950 px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b border-studio-800 flex ${isMobile ? 'flex-col gap-1.5' : 'flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3'} text-xs font-mono`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400">Current Standing:</span>
            <span className="font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-xs">
              Tier {rankDetails.currentRank.tier}: {rankDetails.currentRank.title}
            </span>
            <span className="text-slate-500 text-[11px]">({userScore.toLocaleString()} pts)</span>
          </div>

          {rankDetails.nextRank ? (
            <div className="text-slate-400 flex flex-wrap items-center gap-1 text-xs">
              <span>Next:</span>
              <span className="text-emerald-400 font-bold">{rankDetails.nextRank.title}</span>
              <span className="text-slate-500 text-[11px]">({rankDetails.scoreNeededForNext.toLocaleString()} pts left)</span>
            </div>
          ) : (
            <div className="text-yellow-400 font-bold flex items-center space-x-1 text-xs">
              <Star className="w-3.5 h-3.5 fill-yellow-400" />
              <span>PINNACLE RANK ACHIEVED!</span>
            </div>
          )}
        </div>

        {/* Year Selector Tabs */}
        <div className="flex border-b border-studio-800 bg-studio-950/60 p-1.5 sm:p-2 gap-1.5 sm:gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveYear(1)}
            className={`flex-1 py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
              activeYear === 1
                ? 'bg-studio-accent text-studio-950 shadow-lg shadow-studio-accent/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-studio-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{isMobile ? 'Year 1: Foundations' : 'YEAR 1: Foundations & Studio Tracking (July – May)'}</span>
          </button>
          <button
            onClick={() => setActiveYear(2)}
            className={`flex-1 py-2 sm:py-2.5 px-2.5 sm:px-4 rounded-xl font-bold transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
              activeYear === 2
                ? 'bg-studio-neonGreen text-studio-950 shadow-lg shadow-studio-neonGreen/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-studio-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{isMobile ? 'Year 2: Adv. Mixing' : 'YEAR 2: Advanced Mixing & Mastering (July – May)'}</span>
          </button>
        </div>

        {/* Ranks List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-2.5 sm:space-y-3 font-mono">
          <div className="text-[10px] sm:text-xs text-slate-400 mb-1 sm:mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>
              {activeYear === 1
                ? 'Year 1 spans Month 1 (July) to Month 11 (May) &bull; Tiers 1 to 15'
                : 'Year 2 spans Month 12 (July) to Month 22 (May) &bull; Tiers 16 to 24 (Pinnacle)'}
            </span>
            <span className="text-slate-500">Scale: 20 rounds/day @ ~750 avg pts</span>
          </div>

          {displayedRanks.map((rank) => {
            const isCurrent = rank.tier === currentTier;
            const isUnlocked = userScore >= rank.minScore;
            const isPinnacle = rank.tier === 24;

            return (
              <div
                key={rank.tier}
                className={`p-3 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${
                  isCurrent
                    ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/10'
                    : isUnlocked
                    ? 'bg-studio-950/70 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-studio-950/30 border-studio-800/80 opacity-65'
                }`}
              >
                <div className="flex items-start space-x-2.5 sm:space-x-3.5 min-w-0">
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] sm:text-xs font-bold ${
                    isCurrent
                      ? 'bg-amber-400 text-studio-950'
                      : isUnlocked
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-studio-800 text-slate-500'
                  }`}>
                    #{rank.tier}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`font-bold text-xs sm:text-base ${
                        isCurrent
                          ? 'text-amber-300'
                          : isUnlocked
                          ? 'text-slate-100'
                          : 'text-slate-400'
                      }`}>
                        {rank.title}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full bg-amber-400 text-studio-950">
                          Current Rank
                        </span>
                      )}
                      {isPinnacle && (
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full bg-yellow-400 text-studio-950 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-studio-950" />
                          Final Award
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                      {rank.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-studio-800/80 flex-shrink-0">
                  <div className="text-xs font-bold text-slate-200">
                    {rank.minScore.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">pts</span>
                  </div>
                  <div className="text-[11px] text-studio-accent font-semibold sm:mt-0.5">
                    {rank.approxTimeline}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-studio-800 bg-studio-950/60 flex items-center justify-between text-xs font-mono text-slate-400 gap-2">
          <div className="flex items-center space-x-2 truncate">
            <BookOpen className="w-4 h-4 text-studio-accent shrink-0" />
            <span className="hidden sm:inline">Training Program: Progressive Ranking Schedule</span>
            <span className="sm:hidden text-[11px] truncate">Progressive Ear Training Ranks</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-studio-800 text-slate-200 hover:text-white hover:bg-studio-700 transition-colors cursor-pointer shrink-0 text-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
