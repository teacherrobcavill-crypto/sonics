import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  LogOut,
  Users,
  RotateCcw,
  ShieldAlert,
  GraduationCap,
  Star,
  Sparkles,
  Flame,
  Zap,
  Activity,
  Disc,
  Radio,
  Palette
} from 'lucide-react';
import {
  StudentProfile,
  signInStudent,
  registerStudent,
  resetStudentAccount,
  getStoredProfiles,
  setActiveStudentId,
  updateStudentDefaultTrack,
  AppTheme,
  THEME_OPTIONS,
  getSavedTheme,
  saveTheme,
  updateStudentTheme
} from '../utils/studentStorage';
import { validateName } from '../utils/nameValidator';
import {
  cloudLoginOrRegisterStudent,
  cloudResetStudentAccount,
  cloudUpdateStudentDefaultTrack,
  cloudUpdateStudentTheme,
  isFirebaseReady
} from '../services/firebase';
import { AudioSourceType } from '../types';

interface StudentAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: StudentProfile | null;
  onStudentChanged: (student: StudentProfile | null) => void;
  onUpdateDefaultTrack?: (track: AudioSourceType) => Promise<void> | void;
  onThemeChanged?: (theme: AppTheme) => void;
}

const TRACK_OPTIONS: { id: AudioSourceType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dance_pop', label: 'Dance Pop', icon: Sparkles },
  { id: 'alt_rock', label: 'Alt Rock', icon: Flame },
  { id: 'electronic_pop', label: 'Electro Pop', icon: Zap },
  { id: 'hard_rock', label: 'Hard Rock', icon: Activity },
  { id: 'hip_hop', label: 'Hip-Hop', icon: Disc },
  { id: 'pink_noise', label: 'Pink Noise', icon: Radio },
];

export const StudentAuthModal: React.FC<StudentAuthModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  onStudentChanged,
  onUpdateDefaultTrack,
  onThemeChanged
}) => {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const cohortYear = '2026';
  const [sessionDefaultTrack, setSessionDefaultTrack] = useState<AudioSourceType>(() => {
    return currentStudent?.defaultTrack || 'dance_pop';
  });
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(() => {
    return currentStudent?.theme || getSavedTheme() || 'cyber';
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (currentStudent?.theme) {
      setSelectedTheme(currentStudent.theme);
    } else {
      setSelectedTheme(getSavedTheme());
    }
  }, [currentStudent, isOpen]);

  const handleSelectTheme = async (themeId: AppTheme) => {
    setSelectedTheme(themeId);
    saveTheme(themeId);
    if (onThemeChanged) {
      onThemeChanged(themeId);
    }
    if (currentStudent) {
      const updated = updateStudentTheme(currentStudent.id, themeId);
      if (updated) {
        onStudentChanged(updated);
      }
      if (isFirebaseReady()) {
        await cloudUpdateStudentTheme(currentStudent.id, themeId);
      }
    }
  };

  if (!isOpen) return null;

  const storedProfiles = getStoredProfiles();
  const allProfiles = Object.values(storedProfiles);
  const cloudActive = isFirebaseReady();

  const handleNameChange = (newName: string) => {
    setName(newName);
    const matching = allProfiles.find(p => p.name.trim().toLowerCase() === newName.trim().toLowerCase());
    if (matching?.defaultTrack) {
      setSessionDefaultTrack(matching.defaultTrack);
    }
    if (matching?.theme) {
      setSelectedTheme(matching.theme);
      saveTheme(matching.theme);
      if (onThemeChanged) onThemeChanged(matching.theme);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const nameValidation = validateName(name);
    if (!nameValidation.isValid) {
      setError(nameValidation.error || 'Please enter a valid name.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (cloudActive) {
        // Try Cloud Firestore Authentication
        const cloudRes = await cloudLoginOrRegisterStudent(
          name,
          password,
          cohortYear,
          tab === 'signin' ? sessionDefaultTrack : 'dance_pop',
          selectedTheme
        );
        if (!cloudRes.success || !cloudRes.profile) {
          setError(cloudRes.error || 'Cloud authentication failed.');
          setIsSubmitting(false);
          return;
        }

        // Check single-account rule on cloud
        if (tab === 'register' && !cloudRes.isNewAccount) {
          setError('An account with this name already exists. Each person only gets one account. Please use the "Sign In" tab.');
          setIsSubmitting(false);
          return;
        }

        if (tab === 'signin' && cloudRes.isNewAccount) {
          setError('No account found with this name. If you are new, please switch to the "Create Account" tab.');
          setIsSubmitting(false);
          return;
        }

        if (tab === 'signin') {
          updateStudentDefaultTrack(cloudRes.profile.id, sessionDefaultTrack);
          if (onUpdateDefaultTrack) {
            await onUpdateDefaultTrack(sessionDefaultTrack);
          }
        }

        const activeTheme = cloudRes.profile.theme || selectedTheme;
        saveTheme(activeTheme);
        if (onThemeChanged) onThemeChanged(activeTheme);

        setActiveStudentId(cloudRes.profile.id);
        onStudentChanged(cloudRes.profile);
        const trackLabel = TRACK_OPTIONS.find(t => t.id === sessionDefaultTrack)?.label || sessionDefaultTrack;
        setSuccessMsg(
          tab === 'register'
            ? `Account created! Welcome, ${cloudRes.profile.name}!`
            : `Welcome back, ${cloudRes.profile.name}! Track set to ${trackLabel}.`
        );
        setTimeout(() => {
          setIsSubmitting(false);
          onClose();
        }, 500);
        return;
      }

      // Local Fallback Authentication
      if (tab === 'register') {
        const res = registerStudent(name, password, cohortYear, 'dance_pop', selectedTheme);
        if (!res.success || !res.profile) {
          setError(res.error || 'Failed to create account.');
          setIsSubmitting(false);
          return;
        }
        saveTheme(selectedTheme);
        if (onThemeChanged) onThemeChanged(selectedTheme);
        setSuccessMsg(`Account created! Welcome, ${res.profile.name}!`);
        setTimeout(() => {
          onStudentChanged(res.profile!);
          setIsSubmitting(false);
          onClose();
        }, 500);
      } else {
        const res = signInStudent(name, password);
        if (!res.success || !res.profile) {
          setError(res.error || 'Invalid credentials.');
          setIsSubmitting(false);
          return;
        }
        // Save and apply student's chosen default track for this session
        const updated = updateStudentDefaultTrack(res.profile.id, sessionDefaultTrack);
        let finalProfile = updated || res.profile;

        if (finalProfile.theme) {
          saveTheme(finalProfile.theme);
          setSelectedTheme(finalProfile.theme);
          if (onThemeChanged) onThemeChanged(finalProfile.theme);
        } else {
          const updatedTheme = updateStudentTheme(res.profile.id, selectedTheme);
          if (updatedTheme) finalProfile = updatedTheme;
        }

        if (onUpdateDefaultTrack) {
          await onUpdateDefaultTrack(sessionDefaultTrack);
        }
        const trackLabel = TRACK_OPTIONS.find(t => t.id === sessionDefaultTrack)?.label || sessionDefaultTrack;
        setSuccessMsg(`Welcome back, ${finalProfile.name}! Track set to ${trackLabel}.`);
        setTimeout(() => {
          onStudentChanged(finalProfile);
          setIsSubmitting(false);
          onClose();
        }, 400);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const handleSelectQuickStudent = (student: StudentProfile) => {
    setName(student.name);
    setPassword('');
    setTab('signin');
    if (student.defaultTrack) {
      setSessionDefaultTrack(student.defaultTrack);
    }
    if (student.theme) {
      setSelectedTheme(student.theme);
      saveTheme(student.theme);
      if (onThemeChanged) onThemeChanged(student.theme);
    }
    setError(null);
  };

  const handleLogout = () => {
    setActiveStudentId(null);
    onStudentChanged(null);
    onClose();
  };

  const handleConfirmReset = async () => {
    if (!currentStudent) return;
    setIsSubmitting(true);

    try {
      if (cloudActive) {
        await cloudResetStudentAccount(currentStudent.id);
      }
      const updated = resetStudentAccount(currentStudent.id);
      onStudentChanged(updated);
      setIsResetConfirmOpen(false);
      setSuccessMsg(`Account reset: ${currentStudent.name} is now Audio Novice (0 pts).`);
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset account.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-studio-900 border border-studio-700/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-slate-100 max-h-[92vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-xl bg-studio-800/80 text-slate-400 hover:text-white hover:bg-studio-700 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-studio-accent/20 text-studio-accent flex items-center justify-center border border-studio-accent/30">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white font-sans">
              Audio Profile
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Syncs scores and training progress across phone, laptop, and desktop computers.
          </p>
        </div>


        {/* Current Logged In Banner */}
        {currentStudent && (
          <div className="p-4 rounded-2xl bg-studio-950/80 border border-studio-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${currentStudent.avatarColor} flex items-center justify-center font-bold text-base text-white shadow-md`}>
                  {currentStudent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{currentStudent.name}</span>
                  </div>
                  <div className="text-xs font-mono text-amber-400 mt-0.5">
                    {currentStudent.stats.totalScore.toLocaleString()} pts &bull; {currentStudent.stats.rankTitle}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 hover:text-white hover:bg-studio-800 transition-colors border border-studio-700 cursor-pointer"
                title="Sign out of this account on this machine"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            {/* Default Audio Track Selection (Unique to this student login) */}
            <div className="pt-3 border-t border-studio-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-white">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>My Default Audio Track</span>
                </div>
                <span className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Unique to your login
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Choose the track you want to hear first whenever you log in or train:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-0.5">
                {TRACK_OPTIONS.map(opt => {
                  const isSelected = (currentStudent.defaultTrack || 'dance_pop') === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={async () => {
                        if (onUpdateDefaultTrack) {
                          await onUpdateDefaultTrack(opt.id);
                        }
                      }}
                      className={`px-2 py-1.5 rounded-xl text-xs font-mono flex items-center space-x-1.5 transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold shadow-sm'
                          : 'bg-studio-900 border-studio-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Studio Console Theme Selection */}
            <div className="pt-3 border-t border-studio-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-white">
                  <Palette className="w-3.5 h-3.5 text-studio-accent" />
                  <span>Studio Console Theme</span>
                </div>
                <span className="text-[10px] font-mono text-studio-accent bg-studio-accent/10 px-1.5 py-0.5 rounded border border-studio-accent/20">
                  Instant switch
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Choose your preferred hardware visual aesthetic:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                {THEME_OPTIONS.map(theme => {
                  const isSelected = selectedTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleSelectTheme(theme.id)}
                      className={`p-2.5 rounded-xl text-left transition-all border cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? 'bg-studio-800/80 border-studio-accent shadow-md shadow-studio-accent/15 ring-1 ring-studio-accent'
                          : 'bg-studio-950/70 border-studio-800/80 hover:border-slate-600 hover:bg-studio-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                            style={{ backgroundColor: theme.accentColor }}
                          />
                          <span className={`text-xs font-bold font-mono ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {theme.name}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-studio-accent/20 text-studio-accent border border-studio-accent/30">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {theme.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account Reset Option */}
            <div className="pt-2 border-t border-studio-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Want to start over from scratch?</span>
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                className="text-red-400 hover:text-red-300 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Account</span>
              </button>
            </div>
          </div>
        )}

        {/* Reset Confirmation Dialog */}
        {isResetConfirmOpen && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3 font-mono text-xs">
            <div className="flex items-start space-x-2.5 text-red-300">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
              <div>
                <strong className="font-bold text-red-200 block text-sm">Warning: Reset Account Progress</strong>
                <span className="text-slate-300 block mt-1">
                  This will erase all your points, streaks, and ranks back to <strong>Audio Novice (0 pts)</strong>. Your name and password will remain yours.
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-studio-800 text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 cursor-pointer"
              >
                {isSubmitting ? 'Resetting...' : 'Yes, Reset to 0'}
              </button>
            </div>
          </div>
        )}

        {/* Navigation Tabs: Sign In vs Create Account */}
        <div className="flex p-1 bg-studio-950 rounded-xl border border-studio-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              tab === 'signin'
                ? 'bg-studio-800 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In (Existing Account)
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              tab === 'register'
                ? 'bg-studio-800 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account (One Time)
          </button>
        </div>

        {/* Single Account Notice for Register Tab */}
        {tab === 'register' && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start space-x-2">
            <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <span>
              <strong>One Account Policy:</strong> The first account you create is your permanent ID. Remember your password to log in on phone, laptop, and desktop computers.
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-300 font-semibold block">
              Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g. Alex Morgan"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-studio-950 border border-studio-800 rounded-xl text-sm font-sans text-white placeholder-slate-500 focus:outline-none focus:border-studio-accent transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-300 font-semibold block">
              {tab === 'register' ? 'Choose Password' : 'Password'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'Choose a memorable password' : 'Enter your password'}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-studio-950 border border-studio-800 rounded-xl text-sm font-sans text-white placeholder-slate-500 focus:outline-none focus:border-studio-accent transition-colors"
              />
            </div>
          </div>

          {/* Default Audio Track Selection (on Sign In tab) */}
          {tab === 'signin' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-mono text-slate-300 font-semibold block flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>My Default Track for this Session</span>
                </span>
                <span className="text-[10px] text-amber-400 font-normal">Loads automatically</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TRACK_OPTIONS.map(opt => {
                  const isSelected = sessionDefaultTrack === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSessionDefaultTrack(opt.id)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-mono flex items-center space-x-1.5 transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400 font-bold shadow-sm'
                          : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          {/* Studio Console Theme Selection for Sign In / Register */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-mono text-slate-300 font-semibold block flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-studio-accent" />
                <span>Studio Console Theme</span>
              </span>
              <span className="text-[10px] text-studio-accent font-normal">Click to preview</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {THEME_OPTIONS.map(theme => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectTheme(theme.id)}
                    className={`p-2 rounded-xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-studio-800/80 border-studio-accent shadow-sm ring-1 ring-studio-accent'
                        : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className="w-3 h-3 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                          style={{ backgroundColor: theme.accentColor }}
                        />
                        <span className={`text-xs font-bold font-mono ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                          {theme.name}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-studio-accent/20 text-studio-accent border border-studio-accent/30">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {theme.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback */}
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center space-x-2 text-xs text-red-300 font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center space-x-2 text-xs text-emerald-300 font-mono">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl font-bold font-mono text-sm uppercase tracking-wider bg-studio-accent text-studio-950 shadow-lg shadow-studio-accent/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60"
          >
            <span>{tab === 'register' ? 'Register Single Account' : 'Sign In & Sync'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Existing profiles list for quick switch on shared workstation */}
        {allProfiles.length > 0 && (
          <div className="pt-2 border-t border-studio-800/80 space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-mono text-slate-400">
              <Users className="w-3.5 h-3.5 text-studio-accent" />
              <span>Known people on this session:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-none">
              {allProfiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectQuickStudent(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                    name.toLowerCase() === p.name.toLowerCase()
                      ? 'bg-studio-accent/20 border-studio-accent text-studio-accent font-bold'
                      : 'bg-studio-950 border-studio-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
