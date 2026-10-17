import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { StudentProfile, LeaderboardEntry, DailyUsage, getTodayDateString, LeaderboardScope, getStudentModeStats, AppTheme } from '../utils/studentStorage';
import { validateName } from '../utils/nameValidator';
import { getRankTitle } from '../utils/frequencies';
import { mergeGlynJohnsIntoLeaderboard } from '../utils/glynJohns';
import { RoundResult, AudioSourceType, GameMode } from '../types';

// Stored config with fallback to user's provided project
const STORAGE_KEY_FIREBASE_KEY = 'soniceq_firebase_api_key';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC3lS45ktSv4Jou7cxv6Oi9gb8GKiNwN1Y",
  authDomain: "soniceq-96d91.firebaseapp.com",
  projectId: "soniceq-96d91",
  storageBucket: "soniceq-96d91.firebasestorage.app",
  messagingSenderId: "587742843893",
  appId: "1:587742843893:web:06182a8f05006f743246bc",
  measurementId: "G-NBPNQ8W171"
};

export function getActiveFirebaseApiKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FIREBASE_KEY);
    if (saved && saved.trim() && saved !== "YOUR_API_KEY") {
      return saved.trim();
    }
  } catch {}
  return DEFAULT_FIREBASE_CONFIG.apiKey;
}

export function saveFirebaseApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_FIREBASE_KEY, key.trim());
  } catch {}
}

export function isFirebaseReady(): boolean {
  const key = getActiveFirebaseApiKey();
  return Boolean(key && key !== "YOUR_API_KEY" && key.length > 10);
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseDb(): Firestore | null {
  if (!isFirebaseReady()) return null;

  try {
    if (!app) {
      const activeKey = getActiveFirebaseApiKey();
      const config = {
        ...DEFAULT_FIREBASE_CONFIG,
        apiKey: activeKey
      };

      if (!getApps().length) {
        app = initializeApp(config);
      } else {
        app = getApp();
      }
    }
    if (!db && app) {
      db = getFirestore(app);
    }
    return db;
  } catch (e) {
    console.warn("Firestore initialization notice:", e);
    return null;
  }
}

/**
 * Cloud Student Auth: Login or Register
 * Enforces: Single account creation per student name.
 * On subsequent logins / other devices: Student logs in with their established password.
 */
export async function cloudLoginOrRegisterStudent(
  name: string,
  password: string,
  cohortYear: string = '2026',
  defaultTrack: AudioSourceType = 'dance_pop',
  theme?: AppTheme
): Promise<{ success: boolean; profile?: StudentProfile; error?: string; isNewAccount?: boolean }> {
  const nameValidation = validateName(name);
  if (!nameValidation.isValid) {
    return { success: false, error: nameValidation.error };
  }
  const trimmedName = name.trim();
  if (!password.trim()) {
    return { success: false, error: 'Please enter your password.' };
  }

  const firestore = getFirebaseDb();
  if (!firestore) {
    return { success: false, error: 'Firebase is not yet configured with an active API Key.' };
  }

  const normalizedId = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const studentDocRef = doc(firestore, 'students', normalizedId);

  try {
    const docSnap = await getDoc(studentDocRef);

    if (docSnap.exists()) {
      // Existing student account -> Sign In
      const data = docSnap.data() as StudentProfile;
      if (data.password !== password) {
        return {
          success: false,
          error: 'An account with this name already exists. The password you entered is incorrect.'
        };
      }

      // Check dailyUsage rollover to today
      const today = getTodayDateString();
      if (!data.dailyUsage || data.dailyUsage.date !== today) {
        data.dailyUsage = {
          date: today,
          rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0 }
        };
      }

      // Update defaultTrack if selected on sign in
      if (defaultTrack) {
        data.defaultTrack = defaultTrack;
      } else if (!data.defaultTrack) {
        data.defaultTrack = 'dance_pop';
      }

      if (theme) {
        data.theme = theme;
      }

      await updateDoc(studentDocRef, {
        dailyUsage: data.dailyUsage,
        defaultTrack: data.defaultTrack,
        ...(data.theme ? { theme: data.theme } : {}),
        updatedAt: Date.now()
      });

      // Recalculate rankTitle dynamically
      data.stats.rankTitle = getRankTitle(data.stats.totalScore, data.stats.roundsPlayed);

      return { success: true, profile: data, isNewAccount: false };
    } else {
      // First-time creation -> Create single permanent account
      const today = getTodayDateString();
      const newProfile: StudentProfile = {
        id: normalizedId,
        name: trimmedName,
        password: password,
        avatarColor: getRandomAvatarColor(),
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
          rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0 }
        },
        defaultTrack: defaultTrack || 'dance_pop',
        theme: theme || 'cyber'
      };

      await setDoc(studentDocRef, {
        ...newProfile,
        cohortYear: cohortYear
      });

      return { success: true, profile: newProfile, isNewAccount: true };
    }
  } catch (err: any) {
    console.error("Firestore cloud auth error:", err);
    return {
      success: false,
      error: err.message || 'Unable to connect to cloud database. Please verify internet connection.'
    };
  }
}

/**
 * Record a round score to Firestore cloud
 */
export async function cloudRecordStudentRound(
  studentId: string,
  mode: string,
  result: RoundResult
): Promise<StudentProfile | null> {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const studentDocRef = doc(firestore, 'students', studentId);

  try {
    const docSnap = await getDoc(studentDocRef);
    if (!docSnap.exists()) return null;

    const profile = docSnap.data() as StudentProfile;
    const today = getTodayDateString();

    if (!profile.dailyUsage || profile.dailyUsage.date !== today) {
      profile.dailyUsage = {
        date: today,
        rounds: { peak_master: 0, filter_doctor: 0, tye_match: 0 }
      };
    }

    if (mode !== 'sandbox') {
      const key = mode as keyof DailyUsage['rounds'];
      profile.dailyUsage.rounds[key] = (profile.dailyUsage.rounds[key] || 0) + 1;
    }

    const prev = profile.stats;
    const newRounds = prev.roundsPlayed + 1;
    const isGood = result.score >= 600;
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

    // Update game-specific modeStats if not sandbox
    if (mode !== 'sandbox') {
      if (!profile.modeStats) profile.modeStats = {};
      const prevMode = profile.modeStats[mode as GameMode] || {
        totalScore: 0,
        roundsPlayed: 0,
        currentStreak: 0,
        bestStreak: 0,
        averageAccuracyOctaves: 0,
        rankTitle: 'Audio Novice'
      };
      const newModeRounds = prevMode.roundsPlayed + 1;
      const newModeStreak = isGood ? prevMode.currentStreak + 1 : 0;
      const newModeBestStreak = Math.max(prevMode.bestStreak, newModeStreak);
      const newModeScore = prevMode.totalScore + result.score;
      const newModeAvgOct = (prevMode.averageAccuracyOctaves * prevMode.roundsPlayed + result.freqDistanceOctaves) / newModeRounds;

      profile.modeStats[mode as GameMode] = {
        totalScore: newModeScore,
        roundsPlayed: newModeRounds,
        currentStreak: newModeStreak,
        bestStreak: newModeBestStreak,
        averageAccuracyOctaves: newModeAvgOct,
        rankTitle: getRankTitle(newModeScore, newModeRounds)
      };
    }

    // Keep last 30 rounds in history for compact performance
    profile.history = [...(profile.history || []).slice(-29), result];

    await updateDoc(studentDocRef, {
      stats: profile.stats,
      modeStats: profile.modeStats || {},
      dailyUsage: profile.dailyUsage,
      history: profile.history,
      updatedAt: Date.now()
    });

    // Also write an immutable public score submission entry into the 'scores' collection
    try {
      await addDoc(collection(firestore, 'scores'), {
        nickname: profile.name,
        studentId: studentId,
        score: result.score,
        totalScore: profile.stats.totalScore,
        mode: mode,
        rankTitle: profile.stats.rankTitle,
        cohortYear: profile.cohortYear || 'Class of 2026',
        timestamp: Date.now()
      });
    } catch (scoreErr) {
      console.warn("Notice: optional scores record write:", scoreErr);
    }

    return profile;
  } catch (e) {
    console.error("Failed to record round to cloud:", e);
    return null;
  }
}

/**
 * Reset an account: clears scores and streaks back to Audio Novice
 */
export async function cloudResetStudentAccount(studentId: string): Promise<StudentProfile | null> {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const studentDocRef = doc(firestore, 'students', studentId);

  try {
    const docSnap = await getDoc(studentDocRef);
    if (!docSnap.exists()) return null;

    const profile = docSnap.data() as StudentProfile;
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

    await updateDoc(studentDocRef, {
      stats: profile.stats,
      modeStats: {},
      history: [],
      updatedAt: Date.now()
    });

    return profile;
  } catch (e) {
    console.error("Failed to reset account in cloud:", e);
    return null;
  }
}

/**
 * Update student default track preference in Firestore cloud
 */
export async function cloudUpdateStudentDefaultTrack(
  studentId: string,
  track: AudioSourceType
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  const studentDocRef = doc(firestore, 'students', studentId);
  try {
    await updateDoc(studentDocRef, {
      defaultTrack: track,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error("Failed to update default track in cloud:", e);
    return false;
  }
}

/**
 * Update student UI theme preference in Firestore cloud
 */
export async function cloudUpdateStudentTheme(
  studentId: string,
  theme: AppTheme
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  const studentDocRef = doc(firestore, 'students', studentId);
  try {
    await updateDoc(studentDocRef, {
      theme: theme,
      updatedAt: Date.now()
    });
    return true;
  } catch (e) {
    console.error("Failed to update theme in cloud:", e);
    return false;
  }
}

// Pre-launch wipe threshold: Monday 19 October 2026 at 06:00:00 BST
export const PRE_LAUNCH_WIPE_TIMESTAMP = 1792386000000;

export function isPreLaunchPeriod(): boolean {
  return Date.now() < PRE_LAUNCH_WIPE_TIMESTAMP;
}

/**
 * Actively purge any pre-launch test accounts and score entries from Firestore.
 * Active automatically during pre-launch (prior to Mon 19 Oct 2026 06:00 BST).
 */
export async function cloudPurgePreLaunchData(): Promise<{ deletedStudents: number; deletedScores: number }> {
  const firestore = getFirebaseDb();
  if (!firestore) return { deletedStudents: 0, deletedScores: 0 };

  let deletedStudents = 0;
  let deletedScores = 0;

  try {
    const studentsSnap = await getDocs(collection(firestore, 'students'));
    for (const d of studentsSnap.docs) {
      const data = d.data();
      if (Date.now() < PRE_LAUNCH_WIPE_TIMESTAMP || !data.createdAt || data.createdAt < PRE_LAUNCH_WIPE_TIMESTAMP) {
        await deleteDoc(d.ref);
        deletedStudents++;
      }
    }

    const scoresSnap = await getDocs(collection(firestore, 'scores'));
    for (const d of scoresSnap.docs) {
      const data = d.data();
      if (Date.now() < PRE_LAUNCH_WIPE_TIMESTAMP || !data.timestamp || data.timestamp < PRE_LAUNCH_WIPE_TIMESTAMP) {
        await deleteDoc(d.ref);
        deletedScores++;
      }
    }
  } catch (e) {
    console.warn("Notice in cloudPurgePreLaunchData:", e);
  }

  return { deletedStudents, deletedScores };
}

/**
 * Fetch live classroom leaderboard across all cohorts (including alumni)
 */
export async function cloudFetchLeaderboard(
  activeStudentId?: string | null,
  scope: LeaderboardScope = 'all'
): Promise<LeaderboardEntry[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  try {
    // During pre-launch (prior to Monday 19 Oct 2026 06:00 BST), continuously sweep all test players
    if (isPreLaunchPeriod()) {
      await cloudPurgePreLaunchData();
      return mergeGlynJohnsIntoLeaderboard([], scope, activeStudentId);
    }

    const q = query(collection(firestore, 'students'), orderBy('stats.totalScore', 'desc'));
    const querySnapshot = await getDocs(q);

    const entries: LeaderboardEntry[] = [];
    for (const doc of querySnapshot.docs) {
      const p = doc.data() as StudentProfile & { cohortYear?: string };
      // Safety: purge any account created before launch
      if (p.createdAt && p.createdAt < PRE_LAUNCH_WIPE_TIMESTAMP) {
        await deleteDoc(doc.ref);
        continue;
      }

      const userStats = (scope === 'all' || !p.modeStats)
        ? p.stats
        : (p.modeStats[scope as GameMode] || getStudentModeStats(p, scope as GameMode));

      entries.push({
        rank: 0,
        id: p.id,
        name: p.name,
        totalScore: userStats.totalScore,
        roundsPlayed: userStats.roundsPlayed,
        bestStreak: userStats.bestStreak,
        averageAccuracyOctaves: userStats.averageAccuracyOctaves,
        rankTitle: getRankTitle(userStats.totalScore, userStats.roundsPlayed),
        isCurrentUser: p.id === activeStudentId,
        avatarColor: p.avatarColor || 'from-cyan-500 to-blue-600',
        cohortYear: p.cohortYear || 'Class of 2026',
        scope
      });
    }

    if (entries.length > 0) {
      return mergeGlynJohnsIntoLeaderboard(entries, scope, activeStudentId);
    }

    // Fallback: Query from 'scores' collection if students collection has no documents
    const scoresQuery = query(collection(firestore, 'scores'), orderBy('score', 'desc'), limit(50));
    const scoresSnapshot = await getDocs(scoresQuery);
    const scoreMap = new Map<string, LeaderboardEntry>();

    for (const docSnap of scoresSnapshot.docs) {
      const data = docSnap.data();
      if (data.timestamp && data.timestamp < PRE_LAUNCH_WIPE_TIMESTAMP) {
        await deleteDoc(docSnap.ref);
        continue;
      }
      if (scope !== 'all' && data.mode !== scope) continue;
      const studentId = data.studentId || docSnap.id;
      const nickname = data.nickname || 'Student';
      const score = Number(data.score) || 0;
      if (!scoreMap.has(studentId) || (scoreMap.get(studentId)!.totalScore < score)) {
        scoreMap.set(studentId, {
          rank: 0,
          id: studentId,
          name: nickname,
          totalScore: Number(data.totalScore) || score,
          roundsPlayed: 1,
          bestStreak: 1,
          averageAccuracyOctaves: 0.1,
          rankTitle: data.rankTitle || 'Frequency Adept',
          isCurrentUser: studentId === activeStudentId,
          avatarColor: 'from-cyan-500 to-blue-600',
          cohortYear: data.cohortYear || 'Class of 2026',
          scope
        });
      }
    }

    const fallbackEntries = Array.from(scoreMap.values());
    return mergeGlynJohnsIntoLeaderboard(fallbackEntries, scope, activeStudentId);
  } catch (e) {
    console.error("Failed to fetch cloud leaderboard:", e);
    return mergeGlynJohnsIntoLeaderboard([], scope, activeStudentId);
  }
}

function getRandomAvatarColor(): string {
  const colors = [
    'from-cyan-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-purple-500 to-pink-600',
    'from-rose-500 to-red-600',
    'from-indigo-500 to-violet-600'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
