import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Activity,
  Layers,
  HelpCircle,
  Flame,
  Award,
  Music,
  BarChart2,
  Trophy,
  User,
  Sparkles,
  Compass,
  Volume2,
  VolumeX,
  Palette
} from 'lucide-react';
import { GameMode, RoundResult, UserStats, AudioSourceType } from './types';
import { audioEngine } from './audio/AudioEngine';
import { AudioTransport } from './components/AudioTransport';
import { PeakMasterGame } from './components/games/PeakMasterGame';
import { PanMasterGame } from './components/games/PanMasterGame';
import { DbMasterGame } from './components/games/DbMasterGame';
import { FilterDoctorGame } from './components/games/FilterDoctorGame';
import { EQMatchGame } from './components/games/EQMatchGame';
import { SandboxEQ } from './components/games/SandboxEQ';
import { SessionStats } from './components/SessionStats';
import { ScoreFlashOverlay } from './components/ScoreFlashOverlay';
import { Leaderboard } from './components/Leaderboard';
import { StudentAuthModal } from './components/StudentAuthModal';
import { getRankTitle } from './utils/frequencies';
import {
  StudentProfile,
  getActiveStudent,
  getRemainingDailyRounds,
  recordStudentRound,
  recordGuestRound,
  addStudentBonusPoints,
  updateStudentDefaultTrack,
  AppTheme,
  THEME_OPTIONS,
  getSavedTheme,
  saveTheme,
  updateStudentTheme
} from './utils/studentStorage';
import {
  cloudUpdateStudentDefaultTrack,
  cloudUpdateStudentTheme,
  isFirebaseReady
} from './services/firebase';

type AppTab = GameMode | 'leaderboard';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('peak_master');
  const [showStats, setShowStats] = useState(false);
  const [latestResult, setLatestResult] = useState<RoundResult | null>(null);
  const [, setGuestUsageTick] = useState(0);

  // Master Volume State (shared between top mobile bar & desktop AudioTransport)
  const [volume, setVolume] = useState(0.75);
  const [isMuted, setIsMuted] = useState(false);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (!isMuted) {
      audioEngine.setMasterVolume(newVol);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      audioEngine.setMasterVolume(volume);
      setIsMuted(false);
    } else {
      audioEngine.setMasterVolume(0);
      setIsMuted(true);
    }
  };

  // Automatic Mobile / Desktop Device & Viewport Detection
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isSmallScreen = window.innerWidth < 768;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isSmallScreen || (isTouchDevice && window.innerWidth < 850) || (isMobileUA && window.innerWidth < 900);
  });

  useEffect(() => {
    const checkMobile = () => {
      const isSmallScreen = window.innerWidth < 768;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isSmallScreen || (isTouchDevice && window.innerWidth < 850) || (isMobileUA && window.innerWidth < 900));
    };

    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);

  // Audio Source Tracking (detect custom uploaded file for unranked unlimited practice)
  const [audioSource, setAudioSource] = useState<AudioSourceType>(() => audioEngine.getCurrentSourceType());

  useEffect(() => {
    const unsubscribe = audioEngine.subscribeState((_isPlaying, _mode, sourceType) => {
      setAudioSource(sourceType);
    });
    return unsubscribe;
  }, []);

  const isCustomAudio = audioSource === 'custom_file';

  // Student Authentication & State
  const [currentStudent, setCurrentStudent] = useState<StudentProfile | null>(() => getActiveStudent());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // User Stats & History (synced with student profile if logged in)
  const [stats, setStats] = useState<UserStats>(() => {
    const student = getActiveStudent();
    if (student) return student.stats;
    return {
      totalScore: 0,
      roundsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      averageAccuracyOctaves: 0,
      rankTitle: "Audio Novice"
    };
  });
  const [history, setHistory] = useState<RoundResult[]>(() => {
    const student = getActiveStudent();
    return student ? student.history : [];
  });

  // Console UI Theme State
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    const initial = currentStudent?.theme || getSavedTheme() || 'cyber';
    saveTheme(initial);
    return initial;
  });

  useEffect(() => {
    if (currentStudent?.theme) {
      setCurrentTheme(currentStudent.theme);
      saveTheme(currentStudent.theme);
    }
  }, [currentStudent]);

  const handleCycleTheme = async () => {
    const currentIndex = THEME_OPTIONS.findIndex(t => t.id === currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
    const nextTheme = THEME_OPTIONS[nextIndex].id;
    setCurrentTheme(nextTheme);
    saveTheme(nextTheme);

    if (currentStudent) {
      const updated = updateStudentTheme(currentStudent.id, nextTheme);
      if (updated) {
        setCurrentStudent({ ...updated });
      }
      if (isFirebaseReady()) {
        await cloudUpdateStudentTheme(currentStudent.id, nextTheme);
      }
    }
  };

  // Apply student's unique default reference track on launch
  useEffect(() => {
    if (currentStudent?.defaultTrack) {
      audioEngine.setAudioSource(currentStudent.defaultTrack);
    }
  }, []);

  const handleStudentChanged = (student: StudentProfile | null) => {
    setCurrentStudent(student);
    if (student) {
      setStats(student.stats);
      setHistory(student.history);
      if (student.defaultTrack) {
        audioEngine.setAudioSource(student.defaultTrack);
      }
      if (student.theme) {
        setCurrentTheme(student.theme);
        saveTheme(student.theme);
      }
    } else {
      setStats({
        totalScore: 0,
        roundsPlayed: 0,
        currentStreak: 0,
        bestStreak: 0,
        averageAccuracyOctaves: 0,
        rankTitle: "Audio Novice"
      });
      setHistory([]);
      audioEngine.setAudioSource('dance_pop');
    }
  };

  const handleSetDefaultTrack = async (track: AudioSourceType) => {
    if (!currentStudent) return;
    const updated = updateStudentDefaultTrack(currentStudent.id, track);
    if (updated) {
      setCurrentStudent({ ...updated });
    }
    await audioEngine.setAudioSource(track);
    if (isFirebaseReady()) {
      await cloudUpdateStudentDefaultTrack(currentStudent.id, track);
    }
  };

  // Update stats on each completed round
  const handleRoundComplete = (result: RoundResult) => {
    // Starry explosion and score popup always triggers for learning feedback
    setLatestResult(result);

    // If practicing on custom uploaded audio, rounds are unranked & not recorded to leaderboard or daily usage
    if (isCustomAudio) {
      return;
    }

    if (currentStudent && activeTab !== 'leaderboard') {
      const recorded = recordStudentRound(currentStudent.id, activeTab as GameMode, result);
      if (recorded) {
        setCurrentStudent({ ...recorded.updatedProfile });
        setStats({ ...recorded.updatedProfile.stats });
        setHistory([...recorded.updatedProfile.history]);
        return;
      }
    }

    // Guest fallback
    if (activeTab !== 'leaderboard') {
      recordGuestRound(activeTab as GameMode);
      setGuestUsageTick(t => t + 1);
    }

    setHistory(prev => [...prev, result]);
    setStats(prev => {
      const newRounds = prev.roundsPlayed + 1;
      const isGood = result.mode === 'db_master' ? result.score >= 50 : result.score >= 600;
      const newStreak = isGood ? prev.currentStreak + 1 : 0;
      const newBestStreak = Math.max(prev.bestStreak, newStreak);
      const newScore = prev.totalScore + result.score;
      const newAvgOctaves = (prev.averageAccuracyOctaves * prev.roundsPlayed + result.freqDistanceOctaves) / newRounds;

      return {
        totalScore: newScore,
        roundsPlayed: newRounds,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        averageAccuracyOctaves: newAvgOctaves,
        rankTitle: getRankTitle(newScore, newRounds)
      };
    });
  };

  const handleBonusPoints = (bonusPoints: number) => {
    if (isCustomAudio || bonusPoints <= 0) return;

    if (currentStudent) {
      const updated = addStudentBonusPoints(currentStudent.id, bonusPoints);
      if (updated) {
        setCurrentStudent({ ...updated });
        setStats({ ...updated.stats });
        return;
      }
    }

    setStats(prev => {
      const newScore = prev.totalScore + bonusPoints;
      return {
        ...prev,
        totalScore: newScore,
        rankTitle: getRankTitle(newScore, prev.roundsPlayed)
      };
    });
  };

  const handleResetStats = () => {
    setStats({
      totalScore: 0,
      roundsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      averageAccuracyOctaves: 0,
      rankTitle: "Audio Novice"
    });
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-studio-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Studio Header */}
      <header className="border-b border-studio-800/80 bg-studio-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className={`${isMobile ? 'max-w-md px-2.5 h-14' : 'max-w-7xl px-4 sm:px-6 h-16'} mx-auto flex items-center justify-between gap-1.5`}>
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-2 min-w-0">
            <div className={`${isMobile ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl'} bg-gradient-to-tr from-cyan-500 via-studio-accent to-emerald-400 p-0.5 shadow-lg shadow-studio-accent/20 flex-shrink-0`}>
              <div className="w-full h-full bg-studio-950 rounded-[7px] flex items-center justify-center">
                <Sliders className={`${isMobile ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-studio-accent`} />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className={`font-extrabold ${isMobile ? 'text-sm' : 'text-xl'} tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent truncate`}>
                Sonics
              </h1>
              {!isMobile && (
                <div className="text-[10px] font-mono text-studio-accent tracking-wider uppercase truncate">
                  Precision Audio Ear Training
                </div>
              )}
            </div>
          </div>

          {/* User Account, Theme & Controls */}
          <div className={`flex items-center ${isMobile ? 'space-x-1' : 'space-x-1.5 sm:space-x-2.5'} flex-shrink-0`}>

            {/* Quick Studio Theme Switcher */}
            <button
              type="button"
              onClick={handleCycleTheme}
              className={`flex items-center space-x-1.5 ${isMobile ? 'px-1.5 py-1' : 'px-2.5 py-1.5'} bg-studio-950/90 rounded-xl border border-studio-800 hover:border-slate-600 transition-all text-xs font-mono group cursor-pointer shadow-sm`}
              title={`Console Theme: ${THEME_OPTIONS.find(t => t.id === currentTheme)?.name || 'Cyber Studio'}. Click to cycle themes.`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/30 flex-shrink-0 group-hover:scale-110 transition-transform"
                style={{ backgroundColor: THEME_OPTIONS.find(t => t.id === currentTheme)?.accentColor || '#00f0ff' }}
              />
              <Palette className="w-3.5 h-3.5 text-slate-400 group-hover:text-studio-accent transition-colors" />
              {!isMobile && (
                <span className="text-[11px] font-semibold text-slate-300 hidden md:inline">
                  {THEME_OPTIONS.find(t => t.id === currentTheme)?.name.split(' ')[0]}
                </span>
              )}
            </button>

            {/* Compact Master Volume Slider (Mobile Only - moved up next to Login) */}
            {isMobile && (
              <div className="flex items-center space-x-1 bg-studio-950/90 px-1.5 py-1 rounded-xl border border-studio-800">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-studio-accent" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-12 h-1.5 bg-studio-800 rounded-lg appearance-none cursor-pointer accent-studio-accent"
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            )}

            {/* Student Profile Pill / Login Button */}
            {currentStudent ? (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className={`flex items-center ${isMobile ? 'p-1' : 'space-x-2.5 px-3 py-1.5'} bg-studio-950/90 rounded-xl border border-studio-800 hover:border-slate-700 transition-all text-xs font-mono group cursor-pointer`}
                title="Switch student profile or sign out"
              >
                <div className={`${isMobile ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg bg-gradient-to-tr ${currentStudent.avatarColor} flex items-center justify-center font-bold text-xs text-white shadow-sm flex-shrink-0`}>
                  {currentStudent.name.charAt(0).toUpperCase()}
                </div>
                {!isMobile && (
                  <div className="text-left hidden sm:block">
                    <div className="text-white font-bold leading-tight flex items-center gap-1">
                      <span>{currentStudent.name}</span>
                    </div>
                    <div className="text-[10px] text-studio-accent font-semibold">
                      {stats.totalScore.toLocaleString()} pts &bull; {stats.rankTitle}
                    </div>
                  </div>
                )}
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className={`flex items-center space-x-1 bg-studio-accent text-studio-950 ${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 sm:px-3.5 py-1.5 text-xs'} rounded-xl font-bold font-mono uppercase tracking-wider shadow-md shadow-studio-accent/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer`}
              >
                <User className="w-3 h-3" />
                <span>{isMobile ? 'Login' : 'Student Login'}</span>
              </button>
            )}

            {/* Quick Stats Pill */}
            <button
              onClick={() => setShowStats(!showStats)}
              className={`flex items-center ${isMobile ? 'space-x-1 px-1.5 py-1 text-[11px]' : 'space-x-2 sm:space-x-3 px-2.5 sm:px-3.5 py-1.5 text-xs'} bg-studio-950/80 rounded-xl border border-studio-800 hover:border-slate-700 transition-all font-mono cursor-pointer`}
            >
              <div className="flex items-center space-x-0.5 text-amber-400">
                <Award className="w-3.5 h-3.5" />
                <span className="font-bold">{stats.totalScore.toLocaleString()}</span>
                {!isMobile && <span className="hidden sm:inline font-bold">pts</span>}
              </div>
              <div className="flex items-center space-x-0.5 text-red-400">
                <Flame className="w-3.5 h-3.5" />
                <span className="font-bold">{stats.currentStreak}</span>
              </div>
              {!isMobile && (
                <div className="hidden md:block text-emerald-400 font-semibold border-l border-studio-800 pl-2">
                  {stats.rankTitle}
                </div>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className={`flex-1 w-full mx-auto transition-all duration-300 ${
        isMobile
          ? 'max-w-md px-3 py-3 space-y-3 pb-24 border-x border-studio-800/40 bg-studio-950/60 shadow-2xl'
          : 'max-w-7xl px-4 sm:px-6 py-6 space-y-6'
      }`}>

        {/* Global Master Audio Sources & Volume Bar */}
        <AudioTransport
          isMobile={isMobile}
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          currentStudent={currentStudent}
        />

        {/* Navigation Tabs for Training Modes + Leaderboard (Desktop Only - Mobile uses bottom nav) */}
        {!isMobile && (
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
            
            <button
              onClick={() => { setActiveTab('peak_master'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'peak_master' && !showStats
                  ? 'bg-studio-accent text-studio-950 font-bold shadow-lg shadow-studio-accent/20'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Peak Master</span>
            </button>

            <button
              onClick={() => { setActiveTab('filter_doctor'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'filter_doctor' && !showStats
                  ? 'bg-studio-neonOrange text-studio-950 font-bold shadow-lg shadow-studio-neonOrange/20'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Filter Doctor</span>
            </button>

            <button
              onClick={() => { setActiveTab('pan_master'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'pan_master' && !showStats
                  ? 'bg-studio-neonBlue text-studio-950 font-bold shadow-lg shadow-studio-neonBlue/20'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Pan Master</span>
            </button>

            <button
              onClick={() => { setActiveTab('db_master'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'db_master' && !showStats
                  ? 'bg-studio-accent text-studio-950 font-bold shadow-lg shadow-studio-accent/20'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>dB Master</span>
            </button>

            <button
              onClick={() => { setActiveTab('tye_match'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'tye_match' && !showStats
                  ? 'bg-studio-neonGreen text-studio-950 font-bold shadow-lg shadow-studio-neonGreen/20'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>EQ Correct</span>
            </button>

            <button
              onClick={() => { setActiveTab('sandbox'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'sandbox' && !showStats
                  ? 'bg-slate-200 text-studio-950 font-bold shadow'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>EQ Sandbox (Unlimited)</span>
            </button>

            {/* Leaderboard Tab */}
            <button
              onClick={() => { setActiveTab('leaderboard'); setShowStats(false); }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'leaderboard' && !showStats
                  ? 'bg-amber-400 text-studio-950 font-bold shadow-lg shadow-amber-400/20'
                  : 'bg-studio-900 border border-studio-800 text-amber-400 hover:text-amber-300 hover:bg-studio-850'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Leaderboard</span>
            </button>

            {/* Session Stats Button */}
            <button
              onClick={() => setShowStats(!showStats)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold whitespace-nowrap transition-all ml-auto cursor-pointer ${
                showStats
                  ? 'bg-indigo-500 text-white font-bold shadow'
                  : 'bg-studio-900 border border-studio-800 text-slate-400 hover:text-white hover:bg-studio-850'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>Session Stats</span>
            </button>

          </div>
        )}

        {/* View Routing */}
        {showStats ? (
          <SessionStats
            stats={stats}
            history={history}
            onResetStats={handleResetStats}
          />
        ) : (
          <>
            {activeTab === 'leaderboard' && (
              <Leaderboard
                currentStudent={currentStudent}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'peak_master' && (
              <PeakMasterGame
                onRoundComplete={handleRoundComplete}
                onBonusPoints={handleBonusPoints}
                currentStreak={stats.currentStreak}
                totalScore={stats.totalScore}
                remainingDailyRounds={getRemainingDailyRounds(currentStudent, 'peak_master').remaining}
                isCustomAudio={isCustomAudio}
                onNavigateToSandbox={() => { setActiveTab('sandbox'); setShowStats(false); }}
                onOpenLeaderboard={() => { setActiveTab('leaderboard'); setShowStats(false); }}
                onNavigateToMode={(mode) => { setActiveTab(mode); setShowStats(false); }}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'filter_doctor' && (
              <FilterDoctorGame
                onRoundComplete={handleRoundComplete}
                currentStreak={stats.currentStreak}
                totalScore={stats.totalScore}
                remainingDailyRounds={getRemainingDailyRounds(currentStudent, 'filter_doctor').remaining}
                isCustomAudio={isCustomAudio}
                onNavigateToSandbox={() => { setActiveTab('sandbox'); setShowStats(false); }}
                onOpenLeaderboard={() => { setActiveTab('leaderboard'); setShowStats(false); }}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'pan_master' && (
              <PanMasterGame
                onRoundComplete={handleRoundComplete}
                onBonusPoints={handleBonusPoints}
                currentStreak={stats.currentStreak}
                totalScore={stats.totalScore}
                remainingDailyRounds={getRemainingDailyRounds(currentStudent, 'pan_master').remaining}
                isCustomAudio={isCustomAudio}
                onNavigateToSandbox={() => { setActiveTab('sandbox'); setShowStats(false); }}
                onOpenLeaderboard={() => { setActiveTab('leaderboard'); setShowStats(false); }}
                onNavigateToMode={(mode) => { setActiveTab(mode); setShowStats(false); }}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'db_master' && (
              <DbMasterGame
                onRoundComplete={handleRoundComplete}
                onBonusPoints={handleBonusPoints}
                currentStreak={stats.currentStreak}
                totalScore={stats.totalScore}
                remainingDailyRounds={getRemainingDailyRounds(currentStudent, 'db_master').remaining}
                isCustomAudio={isCustomAudio}
                onNavigateToSandbox={() => { setActiveTab('sandbox'); setShowStats(false); }}
                onOpenLeaderboard={() => { setActiveTab('leaderboard'); setShowStats(false); }}
                onNavigateToMode={(mode) => { setActiveTab(mode); setShowStats(false); }}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'tye_match' && (
              <EQMatchGame
                onRoundComplete={handleRoundComplete}
                currentStreak={stats.currentStreak}
                totalScore={stats.totalScore}
                remainingDailyRounds={getRemainingDailyRounds(currentStudent, 'tye_match').remaining}
                isCustomAudio={isCustomAudio}
                onNavigateToSandbox={() => { setActiveTab('sandbox'); setShowStats(false); }}
                onOpenLeaderboard={() => { setActiveTab('leaderboard'); setShowStats(false); }}
                isMobile={isMobile}
              />
            )}

            {activeTab === 'sandbox' && (
              <SandboxEQ isMobile={isMobile} />
            )}
          </>
        )}

        {/* Pro Audio Reference Guide Footer (Hidden on Ranks / Leaderboard tab) */}
        {activeTab !== 'leaderboard' && (
          <section className="bg-studio-900/60 border border-studio-800/60 rounded-2xl p-4 text-xs text-slate-400 space-y-2.5">
            <div className="font-bold text-slate-300 flex items-center space-x-2 text-xs sm:text-sm">
              <HelpCircle className="w-4 h-4 text-studio-accent flex-shrink-0" />
              <span>EQ Cheat Sheet & Frequency Landmarks</span>
            </div>
            <div className={`grid ${isMobile ? 'grid-cols-2 gap-2.5' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'} pt-1 font-mono text-[11px]`}>
              <div className="bg-studio-950/60 p-2.5 rounded-xl border border-studio-850">
                <span className="text-cyan-400 font-bold block mb-0.5">Sub Bass (20 - 60 Hz)</span>
                Rumble, kick fundamental, sub synths.
              </div>
              <div className="bg-studio-950/60 p-2.5 rounded-xl border border-studio-850">
                <span className="text-emerald-400 font-bold block mb-0.5">Bass (60 - 250 Hz)</span>
                Kick body, bass warmth, or &ldquo;mud&rdquo;.
              </div>
              <div className="bg-studio-950/60 p-2.5 rounded-xl border border-studio-850">
                <span className="text-amber-400 font-bold block mb-0.5">Mids (250 Hz - 2 kHz)</span>
                Boxiness (400Hz) & nasal honk (1kHz).
              </div>
              <div className="bg-studio-950/60 p-2.5 rounded-xl border border-studio-850">
                <span className="text-pink-400 font-bold block mb-0.5">Air (2k - 20 kHz)</span>
                Presence (3kHz), sibilance & air.
              </div>
            </div>
          </section>
        )}

      </main>

      {/* Explosive Starry Score Popup in Center of Screen */}
      <ScoreFlashOverlay
        result={latestResult}
        onDismiss={() => setLatestResult(null)}
        isCustomAudioPractice={isCustomAudio}
      />

      {/* Student Authentication & Profile Switcher Modal */}
      <StudentAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentStudent={currentStudent}
        onStudentChanged={handleStudentChanged}
        onUpdateDefaultTrack={handleSetDefaultTrack}
        onThemeChanged={(newTheme) => setCurrentTheme(newTheme)}
      />

      {/* Sticky Mobile Bottom Navigation Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-studio-950/95 backdrop-blur-lg border-t border-studio-800/90 shadow-2xl">
          <div className="max-w-md mx-auto px-1 py-1.5 grid grid-cols-7 gap-0.5 text-[10px] font-mono">
            <button
              onClick={() => { setActiveTab('peak_master'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'peak_master' && !showStats
                  ? 'bg-studio-accent/15 text-studio-accent font-bold border border-studio-accent/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Peak</span>
            </button>

            <button
              onClick={() => { setActiveTab('filter_doctor'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'filter_doctor' && !showStats
                  ? 'bg-studio-neonOrange/15 text-studio-neonOrange font-bold border border-studio-neonOrange/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Filter</span>
            </button>

            <button
              onClick={() => { setActiveTab('pan_master'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'pan_master' && !showStats
                  ? 'bg-studio-neonBlue/15 text-studio-neonBlue font-bold border border-studio-neonBlue/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Pan</span>
            </button>

            <button
              onClick={() => { setActiveTab('db_master'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'db_master' && !showStats
                  ? 'bg-studio-accent/15 text-studio-accent font-bold border border-studio-accent/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Volume2 className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">dB</span>
            </button>

            <button
              onClick={() => { setActiveTab('tye_match'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'tye_match' && !showStats
                  ? 'bg-studio-neonGreen/15 text-studio-neonGreen font-bold border border-studio-neonGreen/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Correct</span>
            </button>

            <button
              onClick={() => { setActiveTab('sandbox'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'sandbox' && !showStats
                  ? 'bg-white/10 text-white font-bold border border-white/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Sandbox</span>
            </button>

            <button
              onClick={() => { setActiveTab('leaderboard'); setShowStats(false); }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'leaderboard' && !showStats
                  ? 'bg-amber-400/15 text-amber-400 font-bold border border-amber-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-4 h-4 mb-0.5" />
              <span className="text-[9px] tracking-tight">Ranks</span>
            </button>
          </div>
        </nav>
      )}

    </div>
  );
};
