import React, { useState } from 'react';
import { Award, Flame, Target, TrendingUp, History, CheckCircle, XCircle, ChevronRight, Sparkles, BookOpen } from 'lucide-react';
import { RoundResult, UserStats } from '../types';
import { formatFrequency, formatGain, getRankTitle, getRankDetails } from '../utils/frequencies';
import { RankLadderModal } from './RankLadderModal';

interface SessionStatsProps {
  stats: UserStats;
  history: RoundResult[];
  onResetStats: () => void;
}

export const SessionStats: React.FC<SessionStatsProps> = ({
  stats,
  history,
  onResetStats
}) => {
  const [isLadderOpen, setIsLadderOpen] = useState(false);
  const rankDetails = getRankDetails(stats.totalScore);

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Total Score */}
        <div className="bg-studio-900 border border-studio-800 p-4 rounded-2xl flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400 uppercase">Score</div>
            <div className="text-xl font-bold font-mono text-white">{stats.totalScore.toLocaleString()}</div>
          </div>
        </div>

        {/* Current & Best Streak */}
        <div className="bg-studio-900 border border-studio-800 p-4 rounded-2xl flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400 uppercase">Streak</div>
            <div className="text-xl font-bold font-mono text-white">
              {stats.currentStreak} <span className="text-xs text-slate-400 font-normal">(Best: {stats.bestStreak})</span>
            </div>
          </div>
        </div>

        {/* Average Accuracy */}
        <div className="bg-studio-900 border border-studio-800 p-4 rounded-2xl flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-studio-accent/20 text-studio-accent flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400 uppercase">Avg Error</div>
            <div className="text-xl font-bold font-mono text-white">
              {stats.roundsPlayed > 0 ? `${(stats.averageAccuracyOctaves * 12).toFixed(1)} st` : '0 st'}
            </div>
          </div>
        </div>

        {/* Engineer Rank Title */}
        <div
          onClick={() => setIsLadderOpen(true)}
          className="bg-studio-900 border border-studio-800 p-4 rounded-2xl flex items-center space-x-3.5 hover:border-slate-700 transition-all cursor-pointer group"
          title="Click to view Rank Ladder (24 Ranks)"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-mono text-slate-400 uppercase flex items-center gap-1">
              <span>Rank (Tier {rankDetails.currentRank.tier})</span>
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400 truncate">
              {rankDetails.currentRank.title}
            </div>
          </div>
        </div>

      </div>

      {/* Rank Ladder Progress Card */}
      <div className="bg-gradient-to-r from-studio-900 via-studio-900 to-studio-950 border border-studio-800 p-5 rounded-2xl shadow-xl space-y-3 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-lg border bg-amber-500/20 text-amber-300 border-amber-500/30">
              Tier {rankDetails.currentRank.tier} / 24
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {rankDetails.currentRank.minScore.toLocaleString()} pts
            </span>
          </div>

          <button
            onClick={() => setIsLadderOpen(true)}
            className="text-xs text-studio-accent hover:text-white flex items-center space-x-1 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>View Progressive Rank Ladder (24 Ranks)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress Bar */}
        {rankDetails.nextRank ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Next Rank: <strong className="text-emerald-400">{rankDetails.nextRank.title}</strong>
              </span>
              <span className="text-slate-400">
                {rankDetails.scoreNeededForNext.toLocaleString()} pts to promote ({rankDetails.progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-studio-950 rounded-full overflow-hidden border border-studio-800">
              <div
                className="h-full bg-gradient-to-r from-studio-accent to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${rankDetails.progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span>
              <strong>Pinnacle Achievement:</strong> You have reached <strong>Legendary Golden Ears</strong> (10,000,000 pts) &ndash; the highest honor awarded at the completion of Year Two!
            </span>
          </div>
        )}
      </div>

      {/* History Log Table */}
      <div className="bg-studio-900 border border-studio-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-studio-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-studio-accent" />
            <span className="font-bold text-sm text-white">Recent Round Performance ({history.length})</span>
          </div>
          {history.length > 0 && (
            <button
              onClick={onResetStats}
              className="text-xs text-slate-400 hover:text-red-400 font-mono transition-colors"
            >
              Reset Session
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono text-sm">
            No rounds completed yet this session. Pick a training mode and start listening!
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-studio-800/60 font-mono text-xs">
            {history.slice().reverse().map((r, i) => (
              <div key={r.timestamp + i} className="p-3.5 flex items-center justify-between hover:bg-studio-850/50 transition-colors">
                <div className="flex items-center space-x-3">
                  {r.score >= 700 ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-slate-200 uppercase">{r.mode.replace('_', ' ')}</span>
                    <span className="text-slate-500 ml-2">Round #{r.roundNumber}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div>
                    <span className="text-slate-400">Target: </span>
                    <span className="text-emerald-400 font-semibold">{formatFrequency(r.target.frequency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Guess: </span>
                    <span className="text-amber-400 font-semibold">{formatFrequency(r.guess.frequency)}</span>
                  </div>
                  <div className="hidden sm:block text-slate-400">
                    Error: <span className="text-slate-200">{r.freqDistanceSemitones.toFixed(1)} st</span>
                  </div>
                  <div className={`font-bold px-2 py-0.5 rounded ${
                    r.score >= 700 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-studio-800 text-slate-300'
                  }`}>
                    +{r.score.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2-Year Rank Ladder Modal */}
      <RankLadderModal
        isOpen={isLadderOpen}
        onClose={() => setIsLadderOpen(false)}
        userScore={stats.totalScore}
      />
    </div>
  );
};
