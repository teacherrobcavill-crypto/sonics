import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  Flame,
  Target,
  User,
  TrendingUp,
  Sparkles,
  Medal,
  Filter,
  Calendar,
  Activity,
  Layers,
  Compass,
  Volume2,
  Sliders,
  Mail
} from 'lucide-react';
import {
  getLeaderboard,
  LeaderboardEntry,
  StudentProfile,
  LeaderboardScope,
  getStudentModeStats,
  formatYearLabel,
  exportMailingListCSV
} from '../utils/studentStorage';
import { cloudFetchLeaderboard, isFirebaseReady } from '../services/firebase';
import { mergeGlynJohnsIntoLeaderboard } from '../utils/glynJohns';
import { RankLadderModal } from './RankLadderModal';
import { GameMode } from '../types';

interface LeaderboardProps {
  currentStudent: StudentProfile | null;
  onOpenAuth: () => void;
  isMobile?: boolean;
}

const LEADERBOARD_GAMES: {
  id: LeaderboardScope;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  activeBg: string;
  borderActive: string;
  description: string;
}[] = [
  {
    id: 'all',
    label: 'Overall All-Stars',
    shortLabel: 'Overall',
    icon: Trophy,
    color: 'text-amber-400',
    activeBg: 'bg-amber-500 text-studio-950 font-black shadow-amber-500/25',
    borderActive: 'border-amber-400',
    description: 'All-Time Competition • Ranked by precision accuracy, points, and ear training mastery.'
  },
  {
    id: 'peak_master',
    label: 'Peak Master',
    shortLabel: 'Peak Master',
    icon: Activity,
    color: 'text-studio-accent',
    activeBg: 'bg-studio-accent text-studio-950 font-black shadow-studio-accent/25',
    borderActive: 'border-studio-accent',
    description: 'Parametric EQ boost & cut identification precision and frequency memory.'
  },
  {
    id: 'filter_doctor',
    label: 'Filter Doctor',
    shortLabel: 'Filter Doctor',
    icon: Layers,
    color: 'text-studio-neonOrange',
    activeBg: 'bg-studio-neonOrange text-studio-950 font-black shadow-studio-neonOrange/25',
    borderActive: 'border-studio-neonOrange',
    description: 'High-Pass (HPF) and Low-Pass (LPF) cutoff recognition & slope matching.'
  },
  {
    id: 'pan_master',
    label: 'Pan Master',
    shortLabel: 'Pan Master',
    icon: Compass,
    color: 'text-studio-neonBlue',
    activeBg: 'bg-studio-neonBlue text-studio-950 font-black shadow-studio-neonBlue/25',
    borderActive: 'border-studio-neonBlue',
    description: 'Stereo image localization and precision pan positioning.'
  },
  {
    id: 'db_master',
    label: 'dB Master',
    shortLabel: 'dB Master',
    icon: Volume2,
    color: 'text-emerald-400',
    activeBg: 'bg-emerald-500 text-studio-950 font-black shadow-emerald-500/25',
    borderActive: 'border-emerald-400',
    description: 'Critical gain detection and volume level matching in fine dB increments.'
  },
  {
    id: 'tye_match',
    label: 'EQ Correct',
    shortLabel: 'EQ Correct',
    icon: Sliders,
    color: 'text-studio-neonGreen',
    activeBg: 'bg-studio-neonGreen text-studio-950 font-black shadow-studio-neonGreen/25',
    borderActive: 'border-studio-neonGreen',
    description: 'Interactive corrective EQ curve neutralizing and audio surgery.'
  }
];

const getMobileGameLabel = (id: LeaderboardScope): string => {
  switch (id) {
    case 'all': return 'Overall';
    case 'peak_master': return 'Peak';
    case 'filter_doctor': return 'Filter Doc';
    case 'pan_master': return 'Pan';
    case 'db_master': return 'dB';
    case 'tye_match': return 'Correct';
  }
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  currentStudent,
  onOpenAuth,
  isMobile = false
}) => {
  const [isLadderOpen, setIsLadderOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<LeaderboardScope>('all');
  const [selectedCohort, setSelectedCohort] = useState<string>('all');
  const [cloudEntries, setCloudEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    if (isFirebaseReady()) {
      cloudFetchLeaderboard(currentStudent?.id, selectedGame).then(entries => {
        if (entries && entries.length > 0) {
          setCloudEntries(entries);
        } else {
          setCloudEntries([]);
        }
      });
    }
  }, [currentStudent, selectedGame]);

  const localLeaderboard = getLeaderboard(selectedGame);
  
  // Combine cloud entries with local student's live stats
  let baseLeaderboard: LeaderboardEntry[];
  if (cloudEntries.length === 0) {
    baseLeaderboard = localLeaderboard;
  } else {
    baseLeaderboard = [...cloudEntries];
    if (currentStudent && currentStudent.id !== 'participant_glyn_johns' && !currentStudent.id.toLowerCase().includes('glyn') && !currentStudent.name.toLowerCase().includes('glyn')) {
      const studentStats = selectedGame === 'all'
        ? currentStudent.stats
        : (currentStudent.modeStats?.[selectedGame as GameMode] || getStudentModeStats(currentStudent, selectedGame as GameMode));

      const idx = baseLeaderboard.findIndex(e => e.id === currentStudent.id);
      if (idx >= 0) {
        baseLeaderboard[idx] = {
          ...baseLeaderboard[idx],
          totalScore: Math.max(baseLeaderboard[idx].totalScore, studentStats.totalScore),
          roundsPlayed: Math.max(baseLeaderboard[idx].roundsPlayed, studentStats.roundsPlayed),
          bestStreak: Math.max(baseLeaderboard[idx].bestStreak, studentStats.bestStreak),
          averageAccuracyOctaves: studentStats.averageAccuracyOctaves || baseLeaderboard[idx].averageAccuracyOctaves,
          rankTitle: studentStats.rankTitle || baseLeaderboard[idx].rankTitle,
          isCurrentUser: true,
          email: currentStudent.email || baseLeaderboard[idx].email
        };
      } else {
        baseLeaderboard.push({
          rank: 0,
          id: currentStudent.id,
          name: currentStudent.name,
          totalScore: studentStats.totalScore,
          roundsPlayed: studentStats.roundsPlayed,
          bestStreak: studentStats.bestStreak,
          averageAccuracyOctaves: studentStats.averageAccuracyOctaves,
          rankTitle: studentStats.rankTitle,
          isCurrentUser: true,
          avatarColor: currentStudent.avatarColor || 'from-cyan-500 to-blue-600',
          cohortYear: currentStudent.cohortYear || 'Class of 2026',
          scope: selectedGame,
          email: currentStudent.email
        });
      }
    }
  }

  const rawLeaderboard = mergeGlynJohnsIntoLeaderboard(baseLeaderboard, selectedGame, currentStudent?.id);

  // Dynamic available years starting with game birth year (2026) up to current calendar year
  const GAME_LAUNCH_YEAR = 2026;
  const currentCalendarYear = new Date().getFullYear();
  const maxYear = Math.max(GAME_LAUNCH_YEAR, currentCalendarYear);
  const availableYears: string[] = [];
  for (let y = GAME_LAUNCH_YEAR; y <= maxYear; y++) {
    availableYears.push(y.toString());
  }
  
  // Filter by selected year
  const filteredLeaderboard = selectedCohort === 'all'
    ? rawLeaderboard
    : rawLeaderboard.filter(e => formatYearLabel(e.cohortYear) === formatYearLabel(selectedCohort));

  const topThree = filteredLeaderboard.slice(0, 3);
  const currentGameConfig = LEADERBOARD_GAMES.find(g => g.id === selectedGame) || LEADERBOARD_GAMES[0];
  const CurrentGameIcon = currentGameConfig.icon;

  const currentStudentStats = currentStudent
    ? (selectedGame === 'all'
        ? currentStudent.stats
        : getStudentModeStats(currentStudent, selectedGame as GameMode))
    : null;

  return (
    <div className={isMobile ? 'space-y-3.5' : 'space-y-5'}>
      {/* Leaderboard Header */}
      <div className={`flex flex-col ${isMobile ? 'gap-3 p-3' : 'sm:flex-row items-start sm:items-center justify-between gap-3.5 sm:gap-4 p-5'} bg-studio-900 border border-studio-800 rounded-2xl shadow-xl`}>
        <div className="flex items-center space-x-3 w-full sm:w-auto min-w-0">
          <div className={`${isMobile ? 'w-9 h-9 rounded-xl' : 'w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl'} bg-studio-950 flex items-center justify-center border border-studio-800 shadow-lg ${currentGameConfig.color} shrink-0`}>
            <CurrentGameIcon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`${isMobile ? 'text-base' : 'text-base sm:text-xl'} font-bold text-white flex items-center gap-1.5 truncate`}>
              <span>{currentGameConfig.label} Leaderboard</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
              {currentGameConfig.description}
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 ${isMobile ? 'w-full' : 'w-full sm:w-auto justify-between sm:justify-end'}`}>
          <button
            onClick={() => setIsLadderOpen(true)}
            className={`flex items-center justify-center px-3 py-2 rounded-xl bg-studio-950 hover:bg-studio-850 border border-studio-800 text-slate-300 hover:text-white text-xs font-mono transition-all cursor-pointer shadow-sm ${isMobile ? 'flex-1' : 'shrink-0'}`}
          >
            <span className="truncate">Rank Ladder (24 Ranks)</span>
          </button>

          <button
            onClick={() => exportMailingListCSV(rawLeaderboard)}
            title="Download CSV mailing list with student names, emails, and standings"
            className={`flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-studio-950 hover:bg-studio-850 border border-studio-800 text-slate-300 hover:text-white text-xs font-mono transition-all cursor-pointer shadow-sm ${isMobile ? 'flex-1' : 'shrink-0'}`}
          >
            <Mail className="w-3.5 h-3.5 text-studio-accent shrink-0" />
            <span className="truncate">Mailing List</span>
          </button>

          {currentStudent && currentStudentStats ? (
            <div className={`flex items-center space-x-2 bg-studio-950 px-2.5 py-1.5 rounded-xl border border-studio-800 shadow-inner min-w-0 ${isMobile ? 'flex-1' : ''}`}>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr ${currentStudent.avatarColor} flex items-center justify-center font-bold text-xs text-white shrink-0`}>
                {currentStudent.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white flex items-center gap-1 truncate">
                  <span className="truncate">{currentStudent.name}</span>
                  <span className="text-[9px] font-mono text-studio-accent font-semibold shrink-0">(You)</span>
                </div>
                <div className="text-[10px] sm:text-[11px] font-mono text-amber-400 truncate">
                  {currentStudentStats.totalScore.toLocaleString()} pts &bull; {currentStudentStats.rankTitle}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className={`flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-studio-accent text-studio-950 font-bold font-mono text-xs uppercase tracking-wider shadow-lg shadow-studio-accent/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer ${isMobile ? 'flex-1' : 'shrink-0'}`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Game Mode Selector Bar: Overall + 5 Game Options */}
      <div className={`bg-studio-900 border border-studio-800 ${isMobile ? 'p-1.5' : 'p-2'} rounded-2xl shadow-lg`}>
        <div className={isMobile ? 'grid grid-cols-3 gap-1.5' : 'flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5'}>
          {LEADERBOARD_GAMES.map(game => {
            const Icon = game.icon;
            const isSelected = selectedGame === game.id;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => setSelectedGame(game.id)}
                className={`py-2 px-1 rounded-xl font-mono text-[11px] font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 ${
                  isMobile ? 'w-full' : 'flex-1 min-w-[110px] sm:min-w-0 sm:py-2.5 sm:px-3 sm:text-xs shrink-0 sm:shrink'
                } ${
                  isSelected
                    ? `${game.activeBg} ring-1 ${game.borderActive} shadow-lg`
                    : 'bg-studio-950/80 hover:bg-studio-800 text-slate-400 hover:text-white border border-studio-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-inherit' : game.color}`} />
                <span className="truncate">{isMobile ? getMobileGameLabel(game.id) : game.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Year Toggle: All-Time Hall of Fame vs Selected Year */}
      <div className={`flex flex-col ${isMobile ? 'gap-2 p-2' : 'sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2.5'} bg-studio-950/90 rounded-2xl border border-studio-800 font-mono text-xs shadow-md`}>
        <div className={`flex items-center gap-1.5 ${isMobile ? 'w-full' : 'space-x-1.5 sm:space-x-2 w-full sm:w-auto'} p-1 bg-studio-900 rounded-xl border border-studio-800`}>
          <button
            onClick={() => setSelectedCohort('all')}
            className={`flex-1 flex items-center justify-center space-x-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold transition-all cursor-pointer ${
              selectedCohort === 'all'
                ? 'bg-amber-500 text-studio-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isMobile ? '⭐ All-Time' : '⭐ All-Time Hall of Fame'}</span>
          </button>

          <button
            onClick={() => setSelectedCohort(maxYear.toString())}
            className={`flex-1 flex items-center justify-center space-x-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold transition-all cursor-pointer ${
              selectedCohort === maxYear.toString()
                ? 'bg-studio-accent text-studio-950 shadow-md shadow-studio-accent/25 ring-1 ring-studio-accent'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isMobile ? `📅 Year ${maxYear}` : `📅 Year ${maxYear}`}</span>
          </button>
        </div>

        {/* Year Filter selector */}
        <div className={`flex items-center ${isMobile ? 'w-full gap-2 px-1' : 'justify-between sm:justify-end space-x-2 w-full sm:w-auto text-[11px] pt-1 sm:pt-0 border-t sm:border-t-0 border-studio-800/60'} text-slate-400 text-xs`}>
          <span className="text-slate-400 font-mono text-[11px] shrink-0">Choose Year:</span>
          <select
            value={selectedCohort}
            onChange={(e) => {
              if (e.target.value) setSelectedCohort(e.target.value);
            }}
            className="bg-studio-900 border border-studio-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-studio-accent cursor-pointer text-xs font-mono min-w-0 flex-1 truncate"
          >
            <option value="all">⭐ All-Time</option>
            {availableYears.map(yr => (
              <option key={yr} value={yr}>
                Year {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Podium for Top 3 */}
      {topThree.length >= 3 && (
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-2.5' : 'grid-cols-1 md:grid-cols-3 gap-4'} pt-1 sm:pt-2`}>
          
          {/* #2 Silver (Left) */}
          <div className={`order-2 md:order-1 bg-studio-900/90 border border-slate-700/60 ${isMobile ? 'p-3.5' : 'p-5'} rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-lg`}>
            <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-700/60 text-slate-300 flex items-center space-x-1">
              <Medal className="w-3 h-3 text-slate-300" />
              <span>#2 SILVER</span>
            </div>
            <div className={`${isMobile ? 'w-11 h-11 text-base my-1 mt-4' : 'w-14 h-14 text-xl my-2 mt-4'} rounded-2xl bg-gradient-to-tr ${topThree[1].avatarColor} flex items-center justify-center font-bold text-white shadow-md`}>
              {topThree[1].name.charAt(0).toUpperCase()}
            </div>
            <div className={`font-bold ${isMobile ? 'text-sm' : 'text-base'} text-white flex items-center gap-1.5`}>
              <span>{topThree[1].name}</span>
              {topThree[1].isCurrentUser && <span className="text-[10px] font-mono bg-studio-accent/20 text-studio-accent px-1 rounded">YOU</span>}
            </div>
            <div className={`${isMobile ? 'text-base' : 'text-xl'} font-bold font-mono text-slate-200 mt-0.5 sm:mt-1`}>
              {topThree[1].totalScore.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pts</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 mt-0.5 sm:mt-1">
              {topThree[1].rankTitle}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1.5 sm:mt-2 flex items-center space-x-3">
              <span>{topThree[1].roundsPlayed} rounds</span>
              <span>&bull;</span>
              <span>Streak: {topThree[1].bestStreak}</span>
            </div>
          </div>

          {/* #1 Gold (Center, Elevated) */}
          <div className={`order-1 md:order-2 bg-gradient-to-b from-amber-500/15 via-studio-900 to-studio-900 border-2 border-amber-500/50 ${isMobile ? 'p-4' : 'p-6'} rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-2xl md:-mt-2`}>
            <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/30 text-amber-300 flex items-center space-x-1 border border-amber-500/40 max-w-[calc(100%-20px)] truncate">
              <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">#1 {selectedGame === 'all' ? 'CLASS' : (isMobile ? getMobileGameLabel(selectedGame).toUpperCase() : currentGameConfig.shortLabel.toUpperCase())} CHAMPION</span>
            </div>
            <div className={`${isMobile ? 'w-13 h-13 text-xl my-1.5 mt-4 ring-2' : 'w-16 h-16 text-2xl my-2 mt-4 ring-4'} rounded-2xl bg-gradient-to-tr ${topThree[0].avatarColor} flex items-center justify-center font-bold text-white shadow-xl ring-amber-400/40`}>
              {topThree[0].name.charAt(0).toUpperCase()}
            </div>
            <div className={`font-bold ${isMobile ? 'text-base' : 'text-lg'} text-white flex items-center gap-1.5`}>
              <span>{topThree[0].name}</span>
              {topThree[0].isCurrentUser && <span className="text-[10px] font-mono bg-studio-accent/20 text-studio-accent px-1 rounded">YOU</span>}
            </div>
            <div className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black font-mono text-amber-300 mt-0.5 sm:mt-1`}>
              {topThree[0].totalScore.toLocaleString()} <span className="text-xs text-amber-400/80 font-normal">pts</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 font-bold mt-0.5 sm:mt-1">
              {topThree[0].rankTitle}
            </div>
            <div className="text-[11px] font-mono text-slate-300 mt-1.5 sm:mt-2 flex items-center space-x-3">
              <span>{topThree[0].roundsPlayed} rounds</span>
              <span>&bull;</span>
              <span className="flex items-center space-x-1 text-red-400">
                <Flame className="w-3.5 h-3.5" />
                <span>Streak: {topThree[0].bestStreak}</span>
              </span>
            </div>
          </div>

          {/* #3 Bronze (Right) */}
          <div className={`order-3 bg-studio-900/90 border border-amber-800/40 ${isMobile ? 'p-3.5' : 'p-5'} rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-lg`}>
            <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-800/40 text-amber-400 flex items-center space-x-1">
              <Medal className="w-3 h-3 text-amber-500" />
              <span>#3 BRONZE</span>
            </div>
            <div className={`${isMobile ? 'w-11 h-11 text-base my-1 mt-4' : 'w-14 h-14 text-xl my-2 mt-4'} rounded-2xl bg-gradient-to-tr ${topThree[2].avatarColor} flex items-center justify-center font-bold text-white shadow-md`}>
              {topThree[2].name.charAt(0).toUpperCase()}
            </div>
            <div className={`font-bold ${isMobile ? 'text-sm' : 'text-base'} text-white flex items-center gap-1.5`}>
              <span>{topThree[2].name}</span>
              {topThree[2].isCurrentUser && <span className="text-[10px] font-mono bg-studio-accent/20 text-studio-accent px-1 rounded">YOU</span>}
            </div>
            <div className={`${isMobile ? 'text-base' : 'text-xl'} font-bold font-mono text-amber-200 mt-0.5 sm:mt-1`}>
              {topThree[2].totalScore.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pts</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 mt-0.5 sm:mt-1">
              {topThree[2].rankTitle}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1.5 sm:mt-2 flex items-center space-x-3">
              <span>{topThree[2].roundsPlayed} rounds</span>
              <span>&bull;</span>
              <span>Streak: {topThree[2].bestStreak}</span>
            </div>
          </div>

        </div>
      )}

      {/* Full Leaderboard Table & Mobile List View */}
      <div className="bg-studio-900 border border-studio-800 rounded-2xl overflow-hidden shadow-xl">
        <div className={`p-3.5 sm:p-4 border-b border-studio-800 flex items-center justify-between`}>
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-studio-accent shrink-0" />
            <span className="font-bold text-xs sm:text-sm text-white truncate">
              {currentGameConfig.label} Standings ({filteredLeaderboard.length} Players)
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-mono text-slate-400 shrink-0">
            Real time
          </span>
        </div>

        {isMobile ? (
          /* Mobile View: Clean, zero-overflow student list */
          <div className="divide-y divide-studio-800/60 font-mono">
            {filteredLeaderboard.map((student, idx) => {
              const rankNum = idx + 1;
              return (
                <div
                  key={student.id}
                  className={`p-3 transition-colors flex items-center justify-between gap-2.5 ${
                    student.isCurrentUser
                      ? 'bg-studio-accent/10 border-l-4 border-studio-accent'
                      : 'hover:bg-studio-850/40'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    {/* Rank badge */}
                    <div className="font-bold text-xs shrink-0 w-6 text-center">
                      {rankNum === 1 ? (
                        <span className="text-amber-400 font-bold">#1</span>
                      ) : rankNum === 2 ? (
                        <span className="text-slate-300 font-bold">#2</span>
                      ) : rankNum === 3 ? (
                        <span className="text-amber-600 font-bold">#3</span>
                      ) : (
                        <span className="text-slate-500">#{rankNum}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${student.avatarColor} flex items-center justify-center font-bold text-xs text-white shadow-sm shrink-0`}>
                      {student.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Student Name & Rank Title */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white font-sans text-xs truncate max-w-[130px]">{student.name}</span>
                        {student.isCurrentUser && (
                          <span className="px-1 py-0.2 text-[8px] bg-studio-accent text-studio-950 font-bold rounded shrink-0">YOU</span>
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-400 truncate mt-0.5">
                        {student.rankTitle}
                      </div>
                    </div>
                  </div>

                  {/* Score & Streak on Right */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-xs text-amber-300">
                      {student.totalScore.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">pts</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-end space-x-1.5">
                      <span>{student.roundsPlayed} rds</span>
                      <span>&bull;</span>
                      <span className="text-red-400 font-bold">🔥{student.bestStreak}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop View: Full 7-column spreadsheet table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-studio-950/70 border-b border-studio-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Total Score</th>
                  <th className="py-3 px-4">Rank Title</th>
                  <th className="py-3 px-4">Rounds</th>
                  <th className="py-3 px-4">Best Streak</th>
                  <th className="py-3 px-4">Avg Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-800/60">
                {filteredLeaderboard.map((student, idx) => {
                  const rankNum = idx + 1;
                  return (
                    <tr
                      key={student.id}
                      className={`transition-colors ${
                        student.isCurrentUser
                          ? 'bg-studio-accent/10 border-l-4 border-studio-accent'
                          : 'hover:bg-studio-850/50'
                      }`}
                    >
                      <td className="py-3 px-4 font-bold">
                        {rankNum === 1 ? (
                          <span className="text-amber-400 flex items-center space-x-1">
                            <Trophy className="w-3.5 h-3.5 inline" />
                            <span>1</span>
                          </span>
                        ) : rankNum === 2 ? (
                          <span className="text-slate-300">#2</span>
                        ) : rankNum === 3 ? (
                          <span className="text-amber-600">#3</span>
                        ) : (
                          <span className="text-slate-500">#{rankNum}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${student.avatarColor} flex items-center justify-center font-bold text-xs text-white shadow-sm flex-shrink-0`}>
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white font-sans text-xs">{student.name}</span>
                              {student.isCurrentUser && (
                                <span className="px-1.5 py-0.2 text-[9px] bg-studio-accent text-studio-950 font-bold rounded">YOU</span>
                              )}
                              {student.cohortYear && (
                                <span className="px-1.5 py-0.2 text-[9px] bg-studio-950 text-slate-400 border border-studio-800 rounded">
                                  {formatYearLabel(student.cohortYear)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    <td className="py-3 px-4 font-bold text-amber-300">
                      {student.totalScore.toLocaleString()} pts
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-medium">
                      {student.rankTitle}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {student.roundsPlayed}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center space-x-1 text-red-400">
                        <Flame className="w-3.5 h-3.5" />
                        <span>{student.bestStreak}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {student.roundsPlayed > 0 ? `${(student.averageAccuracyOctaves * 12).toFixed(1)} st` : '—'}
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2-Year Rank Ladder Modal */}
      <RankLadderModal
        isOpen={isLadderOpen}
        onClose={() => setIsLadderOpen(false)}
        userScore={currentStudent ? currentStudent.stats.totalScore : 0}
        isMobile={isMobile}
      />
    </div>
  );
};
