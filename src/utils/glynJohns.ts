import { getRankTitle } from './frequencies';
import { LeaderboardEntry, LeaderboardScope, StudentProfile, AppTheme, getTodayDateString } from './studentStorage';
import { GameMode, UserStats } from '../types';

export const GLYN_JOHNS_ID = 'participant_glyn_johns';
export const GLYN_JOHNS_NAME = 'Glyn Johns';

// Simulation starts on Wednesday, 21st October 2026
// Note: Month 9 in JavaScript Date is October (0-indexed)
export const GLYN_START_DATE = new Date(2026, 9, 21, 0, 0, 0);

// UK Academic School Holidays (2026 - 2027)
export interface HolidayWindow {
  name: string;
  start: Date; // Inclusive
  end: Date;   // Inclusive
}

export const SCHOOL_HOLIDAYS: HolidayWindow[] = [
  // Autumn Half Term 2026: Mon 26 Oct – Fri 30 Oct 2026
  { name: 'Autumn Half Term 2026', start: new Date(2026, 9, 26), end: new Date(2026, 9, 30) },
  // Christmas Holiday 2026–2027: Mon 21 Dec 2026 – Fri 1 Jan 2027
  { name: 'Christmas Holiday 2026-2027', start: new Date(2026, 11, 21), end: new Date(2027, 0, 1) },
  // Spring Half Term 2027: Mon 15 Feb – Fri 19 Feb 2027
  { name: 'Spring Half Term 2027', start: new Date(2027, 1, 15), end: new Date(2027, 1, 19) },
  // Easter Holiday 2027: Fri 26 Mar – Fri 9 Apr 2027
  { name: 'Easter Holiday 2027', start: new Date(2027, 2, 26), end: new Date(2027, 3, 9) },
  // Summer Half Term 2027: Mon 31 May – Fri 4 Jun 2027
  { name: 'Summer Half Term 2027', start: new Date(2027, 4, 31), end: new Date(2027, 5, 4) },
  // Summer Holiday 2027: Mon 26 Jul – Fri 3 Sep 2027
  { name: 'Summer Holiday 2027', start: new Date(2027, 6, 26), end: new Date(2027, 8, 3) },
];

export function isDateInSchoolHoliday(date: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return SCHOOL_HOLIDAYS.some(h => d >= h.start && d <= h.end);
}

// Below-average daily statistics for each game
interface ModeDailyAverage {
  regularPoints: number;
  regularRounds: number;
  holidayPoints: number;
  holidayRounds: number;
  averageAccuracyOctaves: number;
  bestStreak: number;
}

const MODE_AVERAGES: Record<GameMode, ModeDailyAverage> = {
  peak_master: {
    regularPoints: 1000,
    regularRounds: 15,
    holidayPoints: 500,
    holidayRounds: 8,
    averageAccuracyOctaves: 0.35,
    bestStreak: 3
  },
  pan_master: {
    regularPoints: 1400,
    regularRounds: 15,
    holidayPoints: 700,
    holidayRounds: 8,
    averageAccuracyOctaves: 0.28,
    bestStreak: 3
  },
  tye_match: {
    regularPoints: 1100,
    regularRounds: 10,
    holidayPoints: 550,
    holidayRounds: 5,
    averageAccuracyOctaves: 0.32,
    bestStreak: 2
  },
  filter_doctor: {
    regularPoints: 700,
    regularRounds: 12,
    holidayPoints: 350,
    holidayRounds: 6,
    averageAccuracyOctaves: 0.38,
    bestStreak: 2
  },
  db_master: {
    regularPoints: 300,
    regularRounds: 8,
    holidayPoints: 150,
    holidayRounds: 4,
    averageAccuracyOctaves: 0.45,
    bestStreak: 2
  },
  sandbox: {
    regularPoints: 0,
    regularRounds: 0,
    holidayPoints: 0,
    holidayRounds: 0,
    averageAccuracyOctaves: 0,
    bestStreak: 0
  }
};

/**
 * Calculates Glyn Johns' accumulated stats up to a target date.
 * - Starts: 21st October 2026.
 * - Plays Monday through Friday only (weekends off).
 * - On regular school weekdays: plays all 5 games at absolute average (~23,100 pts / 100 rounds).
 * - During school holidays: logs in for exactly half the weekdays, scoring half as good (~11,550 pts / 50 rounds).
 */
export function calculateGlynJohnsStats(targetDate: Date = new Date()): {
  totalScore: number;
  roundsPlayed: number;
  daysActive: number;
  modeStats: Record<GameMode, UserStats>;
  overallStats: UserStats;
} {
  const current = new Date(GLYN_START_DATE.getFullYear(), GLYN_START_DATE.getMonth(), GLYN_START_DATE.getDate());
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  let totalScore = 0;
  let totalRounds = 0;
  let daysActive = 0;
  let holidayWeekdayCount = 0;

  const modeTotals: Record<GameMode, { score: number; rounds: number }> = {
    peak_master: { score: 0, rounds: 0 },
    pan_master: { score: 0, rounds: 0 },
    tye_match: { score: 0, rounds: 0 },
    filter_doctor: { score: 0, rounds: 0 },
    db_master: { score: 0, rounds: 0 },
    sandbox: { score: 0, rounds: 0 }
  };

  if (end >= current) {
    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      if (isWeekday) {
        const inHoliday = isDateInSchoolHoliday(current);

        if (inHoliday) {
          holidayWeekdayCount++;
          // Logs in for half the school holiday weekdays (alternating days)
          const logsInToday = holidayWeekdayCount % 2 === 1;

          if (logsInToday) {
            daysActive++;
            (Object.keys(MODE_AVERAGES) as GameMode[]).forEach(mode => {
              const avg = MODE_AVERAGES[mode];
              modeTotals[mode].score += avg.holidayPoints;
              modeTotals[mode].rounds += avg.holidayRounds;
              totalScore += avg.holidayPoints;
              totalRounds += avg.holidayRounds;
            });
          }
        } else {
          // Regular school weekday: full average practice
          daysActive++;
          (Object.keys(MODE_AVERAGES) as GameMode[]).forEach(mode => {
            const avg = MODE_AVERAGES[mode];
            modeTotals[mode].score += avg.regularPoints;
            modeTotals[mode].rounds += avg.regularRounds;
            totalScore += avg.regularPoints;
            totalRounds += avg.regularRounds;
          });
        }
      }

      current.setDate(current.getDate() + 1);
    }
  }

  const modeStats = {} as Record<GameMode, UserStats>;
  (Object.keys(MODE_AVERAGES) as GameMode[]).forEach(mode => {
    const avg = MODE_AVERAGES[mode];
    const s = modeTotals[mode];
    modeStats[mode] = {
      totalScore: s.score,
      roundsPlayed: s.rounds,
      currentStreak: daysActive > 0 ? avg.bestStreak : 0,
      bestStreak: daysActive > 0 ? avg.bestStreak : 0,
      averageAccuracyOctaves: avg.averageAccuracyOctaves,
      rankTitle: getRankTitle(s.score, s.rounds)
    };
  });

  const overallStats: UserStats = {
    totalScore,
    roundsPlayed: totalRounds,
    currentStreak: daysActive > 0 ? 3 : 0,
    bestStreak: daysActive > 0 ? 3 : 0,
    averageAccuracyOctaves: 0.35,
    rankTitle: getRankTitle(totalScore, totalRounds)
  };

  return {
    totalScore,
    roundsPlayed: totalRounds,
    daysActive,
    modeStats,
    overallStats
  };
}

/**
 * Returns a complete StudentProfile for Glyn Johns
 */
export function getGlynJohnsProfile(targetDate: Date = new Date()): StudentProfile {
  const { totalScore, roundsPlayed, modeStats, overallStats } = calculateGlynJohnsStats(targetDate);

  return {
    id: GLYN_JOHNS_ID,
    name: GLYN_JOHNS_NAME,
    password: 'simulation_only',
    avatarColor: 'from-amber-600 to-yellow-500',
    createdAt: GLYN_START_DATE.getTime(),
    cohortYear: '2026',
    defaultTrack: 'alt_rock',
    theme: 'warm_console',
    stats: overallStats,
    modeStats,
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 20, filter_doctor: 20, tye_match: 20, pan_master: 20, db_master: 20 }
    }
  };
}

/**
 * Generates the LeaderboardEntry for Glyn Johns for any leaderboard view
 */
export function getGlynJohnsLeaderboardEntry(
  scope: LeaderboardScope = 'all',
  activeStudentId?: string | null,
  targetDate: Date = new Date()
): LeaderboardEntry {
  const stats = calculateGlynJohnsStats(targetDate);
  const userStats = scope === 'all'
    ? stats.overallStats
    : stats.modeStats[scope as GameMode] || stats.overallStats;

  return {
    rank: 0,
    id: GLYN_JOHNS_ID,
    name: GLYN_JOHNS_NAME,
    totalScore: userStats.totalScore,
    roundsPlayed: userStats.roundsPlayed,
    bestStreak: userStats.bestStreak,
    averageAccuracyOctaves: userStats.averageAccuracyOctaves,
    rankTitle: getRankTitle(userStats.totalScore, userStats.roundsPlayed),
    isCurrentUser: activeStudentId === GLYN_JOHNS_ID,
    avatarColor: 'from-amber-600 to-yellow-500',
    cohortYear: '2026',
    scope
  };
}

/**
 * Injects or updates Glyn Johns in a list of LeaderboardEntry items,
 * re-sorting and re-ranking the entire list cleanly.
 */
export function mergeGlynJohnsIntoLeaderboard(
  entries: LeaderboardEntry[],
  scope: LeaderboardScope = 'all',
  activeStudentId?: string | null,
  targetDate: Date = new Date()
): LeaderboardEntry[] {
  const glynEntry = getGlynJohnsLeaderboardEntry(scope, activeStudentId, targetDate);

  // Remove existing Glyn Johns if already in the list
  const filtered = entries.filter(e => e.id !== GLYN_JOHNS_ID && e.name.toLowerCase() !== GLYN_JOHNS_NAME.toLowerCase());

  // Add the newly calculated Glyn Johns entry
  filtered.push(glynEntry);

  // Re-sort: highest score first, ties broken by best streak
  filtered.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.bestStreak - a.bestStreak;
  });

  // Re-assign ranks 1, 2, 3...
  return filtered.map((entry, idx) => ({
    ...entry,
    rank: idx + 1
  }));
}
