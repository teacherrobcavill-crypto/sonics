import { GameMode, RoundResult, UserStats, AudioSourceType } from '../types';
import { getRankTitle } from './frequencies';
import { validateName } from './nameValidator';
import { mergeGlynJohnsIntoLeaderboard } from './glynJohns';

export const DAILY_ROUND_LIMIT = 20;

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

// Default initial classmates for a fun, competitive leaderboard out of the box
const DEFAULT_CLASSMATES: StudentProfile[] = [
  {
    id: 'classmate_david',
    name: 'David O. (Studio TA)',
    password: 'demo',
    avatarColor: 'from-amber-500 to-orange-600',
    createdAt: Date.now() - 86400000 * 365,
    cohortYear: '2026',
    defaultTrack: 'dance_pop',
    stats: {
      totalScore: 9450000,
      roundsPlayed: 12600,
      currentStreak: 12,
      bestStreak: 21,
      averageAccuracyOctaves: 0.08,
      rankTitle: 'Grandmaster of EQ'
    },
    modeStats: {
      peak_master: {
        totalScore: 2850000,
        roundsPlayed: 3800,
        currentStreak: 8,
        bestStreak: 19,
        averageAccuracyOctaves: 0.07,
        rankTitle: 'Grandmaster of EQ'
      },
      filter_doctor: {
        totalScore: 2400000,
        roundsPlayed: 3200,
        currentStreak: 6,
        bestStreak: 17,
        averageAccuracyOctaves: 0.08,
        rankTitle: 'Grandmaster of EQ'
      },
      pan_master: {
        totalScore: 1600000,
        roundsPlayed: 2100,
        currentStreak: 5,
        bestStreak: 14,
        averageAccuracyOctaves: 0.08,
        rankTitle: 'Spectral Maestro'
      },
      db_master: {
        totalScore: 1400000,
        roundsPlayed: 1900,
        currentStreak: 7,
        bestStreak: 15,
        averageAccuracyOctaves: 0.09,
        rankTitle: 'Spectral Maestro'
      },
      tye_match: {
        totalScore: 1200000,
        roundsPlayed: 1600,
        currentStreak: 4,
        bestStreak: 12,
        averageAccuracyOctaves: 0.09,
        rankTitle: 'Spectral Maestro'
      }
    },
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0 }
    }
  },
  {
    id: 'classmate_sarah',
    name: 'Sarah M. (Audio TA)',
    password: 'demo',
    avatarColor: 'from-purple-500 to-pink-600',
    createdAt: Date.now() - 86400000 * 200,
    cohortYear: '2026',
    defaultTrack: 'electronic_pop',
    stats: {
      totalScore: 6350000,
      roundsPlayed: 8200,
      currentStreak: 8,
      bestStreak: 14,
      averageAccuracyOctaves: 0.12,
      rankTitle: 'Frequency Adept'
    },
    modeStats: {
      filter_doctor: {
        totalScore: 2100000,
        roundsPlayed: 2700,
        currentStreak: 7,
        bestStreak: 14,
        averageAccuracyOctaves: 0.09,
        rankTitle: 'Spectral Maestro'
      },
      peak_master: {
        totalScore: 1750000,
        roundsPlayed: 2300,
        currentStreak: 5,
        bestStreak: 12,
        averageAccuracyOctaves: 0.11,
        rankTitle: 'Spectral Maestro'
      },
      db_master: {
        totalScore: 1100000,
        roundsPlayed: 1400,
        currentStreak: 4,
        bestStreak: 10,
        averageAccuracyOctaves: 0.13,
        rankTitle: 'Frequency Virtuoso'
      },
      tye_match: {
        totalScore: 850000,
        roundsPlayed: 1100,
        currentStreak: 3,
        bestStreak: 9,
        averageAccuracyOctaves: 0.13,
        rankTitle: 'Frequency Virtuoso'
      },
      pan_master: {
        totalScore: 550000,
        roundsPlayed: 700,
        currentStreak: 4,
        bestStreak: 8,
        averageAccuracyOctaves: 0.14,
        rankTitle: 'Frequency Adept'
      }
    },
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 15, filter_doctor: 12, tye_match: 10, pan_master: 0 }
    }
  },
  {
    id: 'classmate_marcus',
    name: 'Marcus K.',
    password: 'demo',
    avatarColor: 'from-cyan-500 to-blue-600',
    createdAt: Date.now() - 86400000 * 4,
    cohortYear: 'Class of 2026',
    defaultTrack: 'alt_rock',
    stats: {
      totalScore: 4620000,
      roundsPlayed: 6100,
      currentStreak: 5,
      bestStreak: 9,
      averageAccuracyOctaves: 0.24,
      rankTitle: 'Balance Specialist'
    },
    modeStats: {
      pan_master: {
        totalScore: 1550000,
        roundsPlayed: 2050,
        currentStreak: 6,
        bestStreak: 11,
        averageAccuracyOctaves: 0.18,
        rankTitle: 'Spectral Maestro'
      },
      peak_master: {
        totalScore: 1250000,
        roundsPlayed: 1650,
        currentStreak: 5,
        bestStreak: 8,
        averageAccuracyOctaves: 0.22,
        rankTitle: 'Spectral Maestro'
      },
      filter_doctor: {
        totalScore: 820000,
        roundsPlayed: 1100,
        currentStreak: 4,
        bestStreak: 7,
        averageAccuracyOctaves: 0.25,
        rankTitle: 'Frequency Virtuoso'
      },
      db_master: {
        totalScore: 600000,
        roundsPlayed: 800,
        currentStreak: 3,
        bestStreak: 6,
        averageAccuracyOctaves: 0.27,
        rankTitle: 'Frequency Adept'
      },
      tye_match: {
        totalScore: 400000,
        roundsPlayed: 500,
        currentStreak: 2,
        bestStreak: 5,
        averageAccuracyOctaves: 0.28,
        rankTitle: 'Balance Specialist'
      }
    },
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 18, filter_doctor: 10, tye_match: 7, pan_master: 0 }
    }
  },
  {
    id: 'classmate_liam',
    name: 'Liam Chen',
    password: 'demo',
    avatarColor: 'from-amber-500 to-orange-600',
    createdAt: Date.now() - 86400000 * 3,
    cohortYear: 'Class of 2026',
    defaultTrack: 'hip_hop',
    stats: {
      totalScore: 2150000,
      roundsPlayed: 2800,
      currentStreak: 4,
      bestStreak: 6,
      averageAccuracyOctaves: 0.38,
      rankTitle: 'Spectral Apprentice'
    },
    modeStats: {
      db_master: {
        totalScore: 750000,
        roundsPlayed: 980,
        currentStreak: 4,
        bestStreak: 7,
        averageAccuracyOctaves: 0.32,
        rankTitle: 'Frequency Virtuoso'
      },
      peak_master: {
        totalScore: 550000,
        roundsPlayed: 720,
        currentStreak: 3,
        bestStreak: 5,
        averageAccuracyOctaves: 0.35,
        rankTitle: 'Frequency Adept'
      },
      filter_doctor: {
        totalScore: 420000,
        roundsPlayed: 550,
        currentStreak: 2,
        bestStreak: 4,
        averageAccuracyOctaves: 0.38,
        rankTitle: 'Balance Specialist'
      },
      tye_match: {
        totalScore: 250000,
        roundsPlayed: 320,
        currentStreak: 2,
        bestStreak: 4,
        averageAccuracyOctaves: 0.42,
        rankTitle: 'Tone Shaper'
      },
      pan_master: {
        totalScore: 180000,
        roundsPlayed: 230,
        currentStreak: 1,
        bestStreak: 3,
        averageAccuracyOctaves: 0.45,
        rankTitle: 'Audio Apprentice'
      }
    },
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 10, filter_doctor: 6, tye_match: 4, pan_master: 0 }
    }
  },
  {
    id: 'classmate_emma',
    name: 'Emma Watson',
    password: 'demo',
    avatarColor: 'from-emerald-500 to-teal-600',
    createdAt: Date.now() - 86400000 * 2,
    cohortYear: 'Class of 2026',
    defaultTrack: 'dance_pop',
    stats: {
      totalScore: 680000,
      roundsPlayed: 910,
      currentStreak: 2,
      bestStreak: 5,
      averageAccuracyOctaves: 0.45,
      rankTitle: 'Patchbay Assistant'
    },
    modeStats: {
      tye_match: {
        totalScore: 220000,
        roundsPlayed: 290,
        currentStreak: 3,
        bestStreak: 5,
        averageAccuracyOctaves: 0.40,
        rankTitle: 'Tone Shaper'
      },
      peak_master: {
        totalScore: 180000,
        roundsPlayed: 240,
        currentStreak: 2,
        bestStreak: 4,
        averageAccuracyOctaves: 0.44,
        rankTitle: 'Audio Apprentice'
      },
      filter_doctor: {
        totalScore: 140000,
        roundsPlayed: 190,
        currentStreak: 2,
        bestStreak: 3,
        averageAccuracyOctaves: 0.46,
        rankTitle: 'Audio Apprentice'
      },
      pan_master: {
        totalScore: 80000,
        roundsPlayed: 110,
        currentStreak: 1,
        bestStreak: 3,
        averageAccuracyOctaves: 0.48,
        rankTitle: 'Patchbay Assistant'
      },
      db_master: {
        totalScore: 60000,
        roundsPlayed: 80,
        currentStreak: 1,
        bestStreak: 2,
        averageAccuracyOctaves: 0.50,
        rankTitle: 'Patchbay Assistant'
      }
    },
    history: [],
    dailyUsage: {
      date: getTodayDateString(),
      rounds: { peak_master: 7, filter_doctor: 4, tye_match: 2, pan_master: 0 }
    }
  }
];

export function getStoredProfiles(): Record<string, StudentProfile> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (!raw) {
      // Seed initial classmates
      const initialMap: Record<string, StudentProfile> = {};
      DEFAULT_CLASSMATES.forEach(c => {
        initialMap[c.id] = c;
      });
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(initialMap));
      return initialMap;
    }
    const parsed = JSON.parse(raw);
    let needsSave = false;
    DEFAULT_CLASSMATES.forEach(c => {
      if (parsed[c.id] && (!parsed[c.id].modeStats || Object.keys(parsed[c.id].modeStats).length === 0)) {
        parsed[c.id].modeStats = c.modeStats;
        needsSave = true;
      }
    });
    if (needsSave) {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(parsed));
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
  theme?: AppTheme
): { success: boolean; profile?: StudentProfile; error?: string } {
  const nameValidation = validateName(name);
  if (!nameValidation.isValid) {
    return { success: false, error: nameValidation.error };
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

export function recordStudentRound(
  studentId: string,
  mode: GameMode,
  result: RoundResult
): { updatedProfile: StudentProfile; remainingDaily: number } | null {
  const profiles = getStoredProfiles();
  const profile = profiles[studentId];
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

  profile.history = [...profile.history, result];

  profiles[studentId] = profile;
  saveStoredProfiles(profiles);

  const usedRounds = (mode !== 'sandbox' && profile.dailyUsage.rounds[mode as keyof DailyUsage['rounds']]) || 0;
  const remaining = mode === 'sandbox' ? 999 : Math.max(0, DAILY_ROUND_LIMIT - usedRounds);

  return { updatedProfile: profile, remainingDaily: remaining };
}

export function addStudentBonusPoints(studentId: string, bonusPoints: number): StudentProfile | null {
  if (bonusPoints <= 0) return null;
  const profiles = getStoredProfiles();
  const profile = profiles[studentId];
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
      scope
    };
  });

  // Re-sort and merge benchmark participant Glyn Johns
  return mergeGlynJohnsIntoLeaderboard(entries, scope, activeId);
}
