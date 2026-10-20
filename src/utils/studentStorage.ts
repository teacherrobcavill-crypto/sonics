import { GameMode, RoundResult, UserStats, AudioSourceType } from '../types';
import { getRankTitle } from './frequencies';
import { validateName } from './nameValidator';
import { mergeGlynJohnsIntoLeaderboard, GLYN_JOHNS_ID } from './glynJohns';

export const DAILY_ROUND_LIMIT = 20;

export const DAILY_RANKED_MODES: GameMode[] = [
  'peak_master',
  'filter_doctor',
  'pan_master',
  'db_master',
  'tye_match'
];

export function formatYearLabel(yearStr?: string): string {
  if (!yearStr) return '2026';
  return yearStr.replace(/Class of /i, '').replace(/Alumni \(/i, '').replace(/\)/g, '').trim();
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  rounds: {
    peak_master: number;
    filter_doctor: number;
    tye_match: number;
    pan_master?: number;
    db_master?: number;
    shelving_scout?: number;
  };
}

export interface StudentProfile {
  id: string;
  name: string;
  password: string; // basic classroom password
  avatarColor: string;
  createdAt: number;
  stats: UserStats;
  modeStats?: Partial<Record<GameMode, UserStats>>; // Per-game stats breakdown
  history: RoundResult[];
  dailyUsage: DailyUsage;
  cohortYear?: string; // e.g. "Class of 2026", "Alumni (2025)"
  defaultTrack?: AudioSourceType; // Student's unique default reference track
  theme?: AppTheme; // Student's custom UI studio visual theme
  email?: string; // Student's email for mailing list and daily updates
}

export type AppTheme = 'cyber' | 'warm_console' | 'slate_minimal' | 'midnight_tape' | 'synthwave';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  tagline: string;
  accentColor: string;
  borderClass: string;
  previewBg: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'cyber',
    name: 'Cyber Studio',
    tagline: 'Electric Cyan & Deep Obsidian',
    accentColor: '#00f0ff',
    borderClass: 'border-cyan-400',
    previewBg: 'from-cyan-500/30 via-slate-900 to-[#0a0d14]'
  },
  {
    id: 'warm_console',
    name: 'Neve Vintage',
    tagline: 'British Amber Gold & Warm Mocha',
    accentColor: '#f59e0b',
    borderClass: 'border-amber-400',
    previewBg: 'from-amber-500/30 via-stone-900 to-[#120f0d]'
  },
  {
    id: 'slate_minimal',
    name: 'SSL 4000-E',
    tagline: 'Oxford Cobalt & Dark Gunmetal',
    accentColor: '#38bdf8',
    borderClass: 'border-sky-400',
    previewBg: 'from-sky-500/30 via-slate-900 to-[#0b0f17]'
  },
  {
    id: 'midnight_tape',
    name: 'Abbey Road Tape',
    tagline: 'Analogue Meter Emerald & Forest',
    accentColor: '#10b981',
    borderClass: 'border-emerald-400',
    previewBg: 'from-emerald-500/30 via-emerald-950 to-[#06100d]'
  },
  {
    id: 'synthwave',
    name: 'Tokyo Synthwave',
    tagline: 'Neon Fuchsia & Midnight Violet',
    accentColor: '#f43f5e',
    borderClass: 'border-rose-400',
    previewBg: 'from-rose-500/30 via-purple-950 to-[#0f0a17]'
  }
];

export type LeaderboardScope = 'all' | 'peak_master' | 'filter_doctor' | 'pan_master' | 'db_master' | 'tye_match';

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  totalScore: number;
  roundsPlayed: number;
  bestStreak: number;
  averageAccuracyOctaves: number;
  rankTitle: string;
  isCurrentUser: boolean;
  avatarColor: string;
  cohortYear?: string;
  scope?: LeaderboardScope;
  email?: string;
}

const STORAGE_KEY_PROFILES = 'soniceq_student_profiles_v1';
const STORAGE_KEY_CURRENT_USER = 'soniceq_active_student_id_v1';

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const AVATAR_COLORS = [
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-purple-500 to-pink-600',
  'from-rose-500 to-red-600',
  'from-indigo-500 to-violet-600'
];

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Monday 19 October 2026 Fresh Launch Cutoff (post-testing wipe)
export const PRE_LAUNCH_WIPE_TIMESTAMP = 1792445300000;

export function isPreLaunchPeriod(): boolean {
  return Date.now() < PRE_LAUNCH_WIPE_TIMESTAMP;
}

// Default initial classmates (Empty so only real students populate the roster)
const DEFAULT_CLASSMATES: StudentProfile[] = [];

export function purgePreLaunchStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PROFILES);
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  } catch {}
}

export function getStoredProfiles(): Record<string, StudentProfile> {
  try {
    // If pre-launch period is active, actively wipe any local storage test accounts
    if (isPreLaunchPeriod()) {
      purgePreLaunchStorage();
      return {};
    }

    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (!raw) {
      return {};
    }
    const parsed: Record<string, StudentProfile> = JSON.parse(raw);
    let modified = false;

    for (const id of Object.keys(parsed)) {
      const p = parsed[id];
      // Strip legacy mock classmates and any pre-launch test accounts
      if (id.startsWith("classmate_") || !p.createdAt || p.createdAt < PRE_LAUNCH_WIPE_TIMESTAMP) {
        delete parsed[id];
        modified = true;
      }
    }

    if (modified) {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(parsed));
      const activeId = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
      if (activeId && !parsed[activeId]) {
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveStoredProfiles(profiles: Record<string, StudentProfile>) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save student profiles', e);
  }
}

export function getActiveStudentId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_CURRENT_USER);
  } catch {
    return null;
  }
}

export function setActiveStudentId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, id);
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
    }
  } catch (e) {
    console.error('Failed to save active student ID', e);
  }
}

export function saveStudentProfile(profile: StudentProfile): void {
  try {
    const profiles = getStoredProfiles();
    profiles[profile.id] = profile;
    saveStoredProfiles(profiles);
    setActiveStudentId(profile.id);
  } catch (e) {
    console.error('Failed to save student profile', e);
  }
}

export function getActiveStudent(): StudentProfile | null {
  const activeId = getActiveStudentId();
  if (!activeId) return null;
  const profiles = getStoredProfiles();
  const profile = profiles[activeId];
  if (!profile) return null;

  // Ensure dailyUsage is updated for today
  const today = getTodayDateString();
  if (!profile.dailyUsage || profile.dailyUsage.date !== today) {
    profile.dailyUsage = {
      date: today,
      rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0, pan_master: 0, db_master: 0 }
    };
    profiles[activeId] = profile;
    saveStoredProfiles(profiles);
  }

  // Ensure rankTitle reflects 2-year academic scale
  profile.stats.rankTitle = getRankTitle(profile.stats.totalScore, profile.stats.roundsPlayed);

  // Ensure defaultTrack fallback
  if (!profile.defaultTrack) {
    profile.defaultTrack = 'dance_pop';
  }

  return profile;
}

export function signInStudent(
  name: string,
  password: string
): { success: boolean; profile?: StudentProfile; error?: string } {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { success: false, error: 'Please enter your name.' };
  }
  if (!password.trim()) {
    return { success: false, error: 'Please enter your password.' };
  }

  const profiles = getStoredProfiles();
  const normalizedKey = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const existing = profiles[normalizedKey];

  if (!existing) {
    return {
      success: false,
      error: 'No account found for this name on this device. If you are new, please switch to the "Create Account" tab.'
    };
  }

  if (existing.password !== password) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  existing.stats.rankTitle = getRankTitle(existing.stats.totalScore, existing.stats.roundsPlayed);
  if (existing.theme) {
    saveTheme(existing.theme);
  }
  setActiveStudentId(existing.id);
  return { success: true, profile: existing };
}

export function registerStudent(
  name: string,
  password: string,
  cohortYear: string = '2026',
  defaultTrack: AudioSourceType = 'dance_pop',
  theme?: AppTheme,
  email?: string
): { success: boolean; profile?: StudentProfile; error?: string } {
  const nameValidation = validateName(name);
  if (!nameValidation.isValid) {
    return { success: false, error: nameValidation.error };
  }

  const trimmedEmail = (email || '').trim().toLowerCase();
  if (!trimmedEmail) {
    return { success: false, error: 'Please enter your email address.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, error: 'Please enter a valid email address (e.g. name@example.com).' };
  }

  const trimmedName = name.trim();
  if (!password.trim()) {
    return { success: false, error: 'Please choose a password.' };
  }
  if (password.length < 3) {
    return { success: false, error: 'Password must be at least 3 characters long.' };
  }

  const profiles = getStoredProfiles();
  const normalizedKey = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (profiles[normalizedKey]) {
    return {
      success: false,
      error: 'An account with this name already exists. Each person may only create one account. Please switch to the "Sign In" tab.'
    };
  }

  const today = getTodayDateString();
  const selectedTheme = theme || getSavedTheme() || 'cyber';
  const newProfile: StudentProfile = {
    id: normalizedKey,
    name: trimmedName,
    password: password,
    email: trimmedEmail,
    avatarColor: getRandomColor(),
    createdAt: Date.now(),
    stats: {
      totalScore: 0,
      roundsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      averageAccuracyOctaves: 0,
      rankTitle: 'Audio Novice'
    },
    history: [],
    dailyUsage: {
      date: today,
      rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0, pan_master: 0, db_master: 0 }
    },
    cohortYear: cohortYear,
    defaultTrack: defaultTrack || 'dance_pop',
    theme: selectedTheme
  };

  saveTheme(selectedTheme);
  profiles[normalizedKey] = newProfile;
  saveStoredProfiles(profiles);
  setActiveStudentId(newProfile.id);

  return { success: true, profile: newProfile };
}

export function updateStudentDefaultTrack(
  studentId: string,
  track: AudioSourceType
): StudentProfile | null {
  const profiles = getStoredProfiles();
  const profile = profiles[studentId];
  if (!profile) return null;

  profile.defaultTrack = track;
  profiles[studentId] = profile;
  saveStoredProfiles(profiles);

  return profile;
}

export function getSavedTheme(): AppTheme {
  try {
    const saved = localStorage.getItem('soniceq_theme_v1');
    if (saved && THEME_OPTIONS.some(t => t.id === saved)) {
      return saved as AppTheme;
    }
  } catch {}
  return 'cyber';
}

export function saveTheme(theme: AppTheme): void {
  try {
    localStorage.setItem('soniceq_theme_v1', theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {}
}

export function updateStudentTheme(
  studentId: string,
  theme: AppTheme
): StudentProfile | null {
  const profiles = getStoredProfiles();
  const profile = profiles[studentId];
  if (!profile) return null;

  profile.theme = theme;
  profiles[studentId] = profile;
  saveStoredProfiles(profiles);
  saveTheme(theme);

  return profile;
}

export function resetStudentAccount(studentId: string): StudentProfile | null {
  const profiles = getStoredProfiles();
  const profile = profiles[studentId];
  if (!profile) return null;

  profile.stats = {
    totalScore: 0,
    roundsPlayed: 0,
    currentStreak: 0,
    bestStreak: 0,
    averageAccuracyOctaves: 0,
    rankTitle: 'Audio Novice'
  };
  profile.modeStats = {};
  profile.history = [];

  profiles[studentId] = profile;
  saveStoredProfiles(profiles);

  return profile;
}

export function getStudentModeStats(profile: StudentProfile, mode: GameMode): UserStats {
  if (profile.modeStats && profile.modeStats[mode]) {
    const s = profile.modeStats[mode]!;
    return {
      ...s,
      rankTitle: getRankTitle(s.totalScore, s.roundsPlayed)
    };
  }

  // Fallback: derive from profile.history if available
  if (profile.history && profile.history.length > 0) {
    const modeRounds = profile.history.filter(r => r.mode === mode);
    if (modeRounds.length > 0) {
      const roundsPlayed = modeRounds.length;
      const totalScore = modeRounds.reduce((acc, r) => acc + r.score, 0);
      let streak = 0;
      let bestStreak = 0;
      let totalOctErr = 0;

      for (const r of modeRounds) {
        if (r.score >= 600) {
          streak++;
          if (streak > bestStreak) bestStreak = streak;
        } else {
          streak = 0;
        }
        totalOctErr += (r.freqDistanceOctaves || 0);
      }

      return {
        totalScore,
        roundsPlayed,
        currentStreak: streak,
        bestStreak,
        averageAccuracyOctaves: totalOctErr / roundsPlayed,
        rankTitle: getRankTitle(totalScore, roundsPlayed)
      };
    }
  }

  return {
    totalScore: 0,
    roundsPlayed: 0,
    currentStreak: 0,
    bestStreak: 0,
    averageAccuracyOctaves: 0,
    rankTitle: 'Audio Novice'
  };
}

export function loginOrRegisterStudent(
  name: string,
  password: string
): { success: boolean; profile?: StudentProfile; error?: string } {
  const trimmedName = name.trim();
  const profiles = getStoredProfiles();
  const normalizedKey = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (profiles[normalizedKey]) {
    return signInStudent(name, password);
  }
  return registerStudent(name, password);
}

const STORAGE_KEY_GUEST_USAGE = 'soniceq_guest_daily_usage_v1';

export function getGuestDailyUsage(): DailyUsage {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GUEST_USAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && parsed.rounds) {
        return parsed;
      }
    }
  } catch {}
  return {
    date: today,
    rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0, pan_master: 0, db_master: 0 }
  };
}

export function recordGuestRound(mode: GameMode): { remaining: number; used: number; max: number } {
  const usage = getGuestDailyUsage();
  if (mode !== 'sandbox') {
    const key = mode as keyof DailyUsage['rounds'];
    usage.rounds[key] = (usage.rounds[key] || 0) + 1;
    try {
      localStorage.setItem(STORAGE_KEY_GUEST_USAGE, JSON.stringify(usage));
    } catch {}
  }
  const used = usage.rounds[mode as keyof DailyUsage['rounds']] || 0;
  return {
    remaining: Math.max(0, DAILY_ROUND_LIMIT - used),
    used,
    max: DAILY_ROUND_LIMIT
  };
}

export function getRemainingDailyRounds(student: StudentProfile | null, mode: GameMode): { remaining: number; used: number; max: number } {
  if (mode === 'sandbox') {
    return { remaining: 999, used: 0, max: 999 };
  }

  const max = DAILY_ROUND_LIMIT;
  const today = getTodayDateString();

  if (!student) {
    const guestUsage = getGuestDailyUsage();
    const used = guestUsage.rounds[mode as keyof DailyUsage['rounds']] || 0;
    const remaining = Math.max(0, max - used);
    return { remaining, used, max };
  }

  if (!student.dailyUsage || student.dailyUsage.date !== today) {
    return { remaining: max, used: 0, max };
  }

  const used = student.dailyUsage.rounds[mode as keyof DailyUsage['rounds']] || 0;
  const remaining = Math.max(0, max - used);
  return { remaining, used, max };
}

export function areAllDailyGamesCompleted(student: StudentProfile | null): boolean {
  return DAILY_RANKED_MODES.every(mode => {
    const { remaining } = getRemainingDailyRounds(student, mode);
    return remaining <= 0;
  });
}

export function hasSeenDailyCompletionModalToday(studentId?: string): boolean {
  const today = getTodayDateString();
  const key = `soniceq_daily_complete_modal_${today}_${studentId || 'guest'}`;
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function markDailyCompletionModalSeenToday(studentId?: string): void {
  const today = getTodayDateString();
  const key = `soniceq_daily_complete_modal_${today}_${studentId || 'guest'}`;
  try {
    localStorage.setItem(key, 'true');
  } catch {}
}

export function recordStudentRound(
  studentId: string,
  mode: GameMode,
  result: RoundResult,
  fallbackProfile?: StudentProfile | null
): { updatedProfile: StudentProfile; remainingDaily: number } | null {
  const profiles = getStoredProfiles();
  let profile = profiles[studentId];
  if (!profile && fallbackProfile && fallbackProfile.id === studentId) {
    profile = { ...fallbackProfile };
    profiles[studentId] = profile;
  }
  if (!profile) return null;

  const today = getTodayDateString();
  if (!profile.dailyUsage || profile.dailyUsage.date !== today) {
    profile.dailyUsage = {
      date: today,
      rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0, pan_master: 0, db_master: 0 }
    };
  } else if (!profile.dailyUsage.rounds) {
    profile.dailyUsage.rounds = { peak_master: 0, filter_doctor: 0, tye_match: 0, pan_master: 0, db_master: 0 };
  }

  // Increment usage if not sandbox
  if (mode !== 'sandbox') {
    const key = mode as keyof DailyUsage['rounds'];
    profile.dailyUsage.rounds[key] = (profile.dailyUsage.rounds[key] || 0) + 1;
  }

  // Update stats
  const prev = profile.stats;
  const newRounds = prev.roundsPlayed + 1;
  const isGood = mode === 'db_master' ? result.score >= 50 : result.score >= 600;
  const newStreak = isGood ? prev.currentStreak + 1 : 0;
  const newBestStreak = Math.max(prev.bestStreak, newStreak);
  const newScore = prev.totalScore + result.score;
  const newAvgOctaves = (prev.averageAccuracyOctaves * prev.roundsPlayed + result.freqDistanceOctaves) / newRounds;

  profile.stats = {
    totalScore: newScore,
    roundsPlayed: newRounds,
    currentStreak: newStreak,
    bestStreak: newBestStreak,
    averageAccuracyOctaves: newAvgOctaves,
    rankTitle: getRankTitle(newScore, newRounds)
  };

  // Update mode-specific stats if not sandbox
  if (mode !== 'sandbox') {
    if (!profile.modeStats) {
      profile.modeStats = {};
    }
    const prevMode = getStudentModeStats(profile, mode);
    const newModeRounds = prevMode.roundsPlayed + 1;
    const isGoodMode = mode === 'db_master' ? result.score >= 50 : result.score >= 600;
    const newModeStreak = isGoodMode ? prevMode.currentStreak + 1 : 0;
    const newModeBestStreak = Math.max(prevMode.bestStreak, newModeStreak);
    const newModeScore = prevMode.totalScore + result.score;
    const newModeAvgOct = (prevMode.averageAccuracyOctaves * prevMode.roundsPlayed + result.freqDistanceOctaves) / newModeRounds;

    profile.modeStats[mode] = {
      totalScore: newModeScore,
      roundsPlayed: newModeRounds,
      currentStreak: newModeStreak,
      bestStreak: newModeBestStreak,
      averageAccuracyOctaves: newModeAvgOct,
      rankTitle: getRankTitle(newModeScore, newModeRounds)
    };
  }

  profile.history = [...(profile.history || []), result];

  profiles[studentId] = profile;
  saveStoredProfiles(profiles);

  const usedRounds = (mode !== 'sandbox' && profile.dailyUsage.rounds[mode as keyof DailyUsage['rounds']]) || 0;
  const remaining = mode === 'sandbox' ? 999 : Math.max(0, DAILY_ROUND_LIMIT - usedRounds);

  return { updatedProfile: profile, remainingDaily: remaining };
}

export function addStudentBonusPoints(
  studentId: string,
  bonusPoints: number,
  fallbackProfile?: StudentProfile | null
): StudentProfile | null {
  if (bonusPoints <= 0) return null;
  const profiles = getStoredProfiles();
  let profile = profiles[studentId];
  if (!profile && fallbackProfile && fallbackProfile.id === studentId) {
    profile = { ...fallbackProfile };
    profiles[studentId] = profile;
  }
  if (!profile) return null;

  const newScore = profile.stats.totalScore + bonusPoints;
  profile.stats = {
    ...profile.stats,
    totalScore: newScore,
    rankTitle: getRankTitle(newScore, profile.stats.roundsPlayed)
  };

  profiles[studentId] = profile;
  saveStoredProfiles(profiles);

  return profile;
}

export function getLeaderboard(scope: LeaderboardScope = 'all'): LeaderboardEntry[] {
  const profiles = getStoredProfiles();
  const activeId = getActiveStudentId();

  const entries: LeaderboardEntry[] = Object.values(profiles).map(p => {
    const userStats = scope === 'all' ? p.stats : getStudentModeStats(p, scope as GameMode);
    return {
      rank: 0,
      id: p.id,
      name: p.name,
      totalScore: userStats.totalScore,
      roundsPlayed: userStats.roundsPlayed,
      bestStreak: userStats.bestStreak,
      averageAccuracyOctaves: userStats.averageAccuracyOctaves,
      rankTitle: getRankTitle(userStats.totalScore, userStats.roundsPlayed),
      isCurrentUser: p.id === activeId,
      avatarColor: p.avatarColor || 'from-cyan-500 to-blue-600',
      cohortYear: p.cohortYear || 'Class of 2026',
      scope,
      email: p.email
    };
  });

  // Re-sort and merge benchmark participant Glyn Johns
  return mergeGlynJohnsIntoLeaderboard(entries, scope, activeId);
}

/**
 * Exports registered student email addresses and standings as a CSV file.
 */
export function exportMailingListCSV(entries: LeaderboardEntry[]): void {
  const headers = ['Name', 'Email Address', 'Cohort Year', 'Rank Title', 'Total Score', 'Rounds Played', 'Best Streak'];
  const validRows = entries
    .filter(e => e.id !== GLYN_JOHNS_ID)
    .map(e => [
      `"${(e.name || '').replace(/"/g, '""')}"`,
      `"${(e.email || '').replace(/"/g, '""')}"`,
      `"${(e.cohortYear || 'Class of 2026').replace(/"/g, '""')}"`,
      `"${(e.rankTitle || 'Audio Novice').replace(/"/g, '""')}"`,
      e.totalScore ?? 0,
      e.roundsPlayed ?? 0,
      e.bestStreak ?? 0
    ]);

  const csvContent = [headers.join(','), ...validRows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `SonicEQ_Student_Mailing_List_${getTodayDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Persistent daily game session state (lives, round, score, game over/victory)
 * Prevents resetting lives by refreshing the page or switching tabs.
 */
export interface PersistedGameSession {
  roundCount: number;
  lives: number;
  isGameOver: boolean;
  isVictory: boolean;
  sessionScore: number;
  livesLostInFirst10?: number;
  isStemBalanceUnlocked?: boolean;
  subMode?: 'stem_balance' | 'single_fader';
}

const STORAGE_KEY_GAME_SESSIONS = 'soniceq_daily_game_sessions_v1';

interface StoredDailySessions {
  date: string;
  userId: string;
  modes: Partial<Record<GameMode, PersistedGameSession>>;
}

export function getPersistedGameSession(mode: GameMode, studentId?: string | null): PersistedGameSession | null {
  const today = getTodayDateString();
  const userKey = studentId || getActiveStudentId() || 'guest';
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GAME_SESSIONS);
    if (!raw) return null;
    const parsed: StoredDailySessions = JSON.parse(raw);
    if (parsed && parsed.date === today && parsed.userId === userKey && parsed.modes && parsed.modes[mode]) {
      return parsed.modes[mode] || null;
    }
  } catch {}
  return null;
}

export function savePersistedGameSession(mode: GameMode, session: PersistedGameSession, studentId?: string | null): void {
  const today = getTodayDateString();
  const userKey = studentId || getActiveStudentId() || 'guest';
  try {
    let container: StoredDailySessions = {
      date: today,
      userId: userKey,
      modes: {}
    };
    const raw = localStorage.getItem(STORAGE_KEY_GAME_SESSIONS);
    if (raw) {
      const parsed: StoredDailySessions = JSON.parse(raw);
      if (parsed && parsed.date === today && parsed.userId === userKey && parsed.modes) {
        container = parsed;
      }
    }
    container.modes[mode] = session;
    localStorage.setItem(STORAGE_KEY_GAME_SESSIONS, JSON.stringify(container));
  } catch {}
}

