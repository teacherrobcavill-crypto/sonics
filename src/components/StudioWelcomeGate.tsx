import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  Flame,
  Zap,
  Activity,
  Disc,
  Radio,
  CheckCircle2,
  AlertCircle,
  Trophy,
  ShieldCheck,
  Headphones
} from 'lucide-react';
import {
  StudentProfile,
  signInStudent,
  registerStudent,
  getStoredProfiles,
  saveStudentProfile,
  saveTheme,
  AppTheme
} from '../utils/studentStorage';
import { validateName } from '../utils/nameValidator';
import { GLYN_JOHNS_ID } from '../utils/glynJohns';
import {
  cloudLoginOrRegisterStudent,
  isFirebaseReady
} from '../services/firebase';
import { AudioSourceType } from '../types';

interface StudioWelcomeGateProps {
  onAuthenticated: (student: StudentProfile) => void;
  onContinueAsGuest: () => void;
  onThemeChanged?: (theme: AppTheme) => void;
  isMobile?: boolean;
}

const TRACK_PREVIEWS: { id: AudioSourceType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dance_pop', label: 'Dance Pop', icon: Sparkles },
  { id: 'alt_rock', label: 'Alt Rock', icon: Flame },
  { id: 'electronic_pop', label: 'Electro Pop', icon: Zap },
  { id: 'hard_rock', label: 'Hard Rock', icon: Activity },
  { id: 'hip_hop', label: 'Hip-Hop', icon: Disc },
  { id: 'pink_noise', label: 'Pink Noise', icon: Radio },
];

export const StudioWelcomeGate: React.FC<StudioWelcomeGateProps> = ({
  onAuthenticated,
  onContinueAsGuest,
  onThemeChanged,
  isMobile = false
}) => {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [selectedTrack, setSelectedTrack] = useState<AudioSourceType>('dance_pop');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cohortYear = 'Class of 2026';
  const cloudActive = isFirebaseReady();

  // Reset errors when switching tab
  const handleSwitchTab = (newTab: 'signin' | 'register') => {
    setTab(newTab);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    if (!name.trim()) {
      setError('Please enter your name.');
      setIsSubmitting(false);
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password.');
      setIsSubmitting(false);
      return;
    }

    const nameValidation = validateName(name);
    if (!nameValidation.isValid) {
      setError(nameValidation.error || 'Please enter a valid name.');
      setIsSubmitting(false);
      return;
    }

    if (tab === 'register') {
      if (!email.trim() || !email.includes('@') || !email.includes('.')) {
        setError('Please enter a valid college email address (e.g. your @qmc.ac.uk email).');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      if (cloudActive) {
        const cloudRes = await cloudLoginOrRegisterStudent(
          name,
          password,
          cohortYear,
          selectedTrack,
          'cyber',
          tab === 'register' ? email.trim() : undefined
        );

        if (!cloudRes.success || !cloudRes.profile) {
          setError(cloudRes.error || 'Authentication failed. Please check your credentials.');
          setIsSubmitting(false);
          return;
        }

        if (tab === 'register' && !cloudRes.isNewAccount) {
          setError('An account with this name already exists. Each student has one account. Please switch to "Sign In".');
          setIsSubmitting(false);
          return;
        }

        if (tab === 'signin' && cloudRes.isNewAccount) {
          setError('No account found with this name. If you are new, switch to "Create Account".');
          setIsSubmitting(false);
          return;
        }

        const profile = cloudRes.profile;
        if (profile.theme) {
          saveTheme(profile.theme);
          if (onThemeChanged) onThemeChanged(profile.theme);
        }

        saveStudentProfile(profile);
        setSuccessMsg(
          tab === 'register'
            ? `Welcome to Sonics, ${profile.name}! Initializing console...`
            : `Welcome back, ${profile.name}! Initializing console...`
        );

        setTimeout(() => {
          setIsSubmitting(false);
          onAuthenticated(profile);
        }, 500);
        return;
      }

      // Local fallback if cloud is offline
      if (tab === 'register') {
        const res = registerStudent(name, password, cohortYear, selectedTrack, 'cyber', email.trim());
        if (!res.success || !res.profile) {
          setError(res.error || 'Failed to create account.');
          setIsSubmitting(false);
          return;
        }
        setSuccessMsg(`Welcome to Sonics, ${res.profile.name}! Initializing console...`);
        setTimeout(() => {
          setIsSubmitting(false);
          onAuthenticated(res.profile!);
        }, 500);
      } else {
        const res = signInStudent(name, password);
        if (!res.success || !res.profile) {
          setError(res.error || 'Invalid student credentials.');
          setIsSubmitting(false);
          return;
        }
        setSuccessMsg(`Welcome back, ${res.profile.name}! Initializing console...`);
        setTimeout(() => {
          setIsSubmitting(false);
          onAuthenticated(res.profile!);
        }, 500);
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err?.message || 'A network error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-studio-950 flex flex-col items-center justify-center p-3 sm:p-6 selection:bg-studio-accent selection:text-black">
      {/* Background Glow Accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center opacity-30">
        <div className="w-[500px] h-[500px] rounded-full bg-studio-accent/20 blur-[130px] -translate-y-12"></div>
        <div className="w-[400px] h-[400px] rounded-full bg-blue-600/15 blur-[120px] translate-y-32"></div>
      </div>

      <div className="w-full max-w-lg relative z-10 space-y-4 sm:space-y-6">
        
        {/* Sonics Hardware Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-2 bg-studio-900/90 border border-studio-800 px-3.5 py-1.5 rounded-full shadow-inner mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-300">
              CLASS OF 2026 &bull; AES/EBU STATION
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <Headphones className="w-8 h-8 sm:w-9 sm:h-9 text-studio-accent" />
            <span>SONICS</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 font-mono max-w-md mx-auto">
            Precision Audio Ear Training &bull; Frequency, Panorama & Gain Mastery
          </p>
        </div>

        {/* Studio Console Rack Chassis */}
        <div className="bg-studio-900/90 backdrop-blur-xl border-2 border-studio-800 rounded-3xl overflow-hidden shadow-2xl">
          
          {/* Top Chassis Bar with Screws */}
          <div className="bg-studio-950/80 px-4 py-3 border-b border-studio-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3.5 h-3.5 rounded-full bg-studio-800 border border-studio-700 flex items-center justify-center text-[9px] font-mono text-slate-400 select-none">+</div>
              <span className="text-[11px] font-mono font-extrabold tracking-wider text-studio-accent uppercase">
                STUDIO CONSOLE LOGIN GATE
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                48 kHz / 24-BIT
              </span>
              <div className="w-3.5 h-3.5 rounded-full bg-studio-800 border border-studio-700 flex items-center justify-center text-[9px] font-mono text-slate-400 select-none">+</div>
            </div>
          </div>

          {/* Mode Tabs (Sign In vs Create Account) */}
          <div className="p-4 sm:p-6 pb-2">
            <div className="grid grid-cols-2 p-1 bg-studio-950/90 border border-studio-800 rounded-2xl">
              <button
                type="button"
                onClick={() => handleSwitchTab('signin')}
                className={`py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
                  tab === 'signin'
                    ? 'bg-studio-accent text-studio-950 shadow-lg font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                <span>SIGN IN</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('register')}
                className={`py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2 ${
                  tab === 'register'
                    ? 'bg-studio-accent text-studio-950 shadow-lg font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>CREATE ACCOUNT</span>
              </button>
            </div>
          </div>

          {/* Main Form Body */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 pt-2 space-y-4">
            
            {/* Why Log In? Info Callout */}
            <div className="bg-studio-950/70 border border-studio-800/90 rounded-2xl p-3 sm:p-3.5 flex items-start space-x-3 text-left">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 font-mono leading-relaxed">
                <span className="font-bold text-amber-300">Save Your Progress & Standings:</span> Log in before playing so your daily 20 lives, streak bonuses, and points are recorded on the live class leaderboard.
              </div>
            </div>

            {/* Error & Success Alerts */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start space-x-2 text-red-400 text-xs font-mono animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-start space-x-2 text-emerald-400 text-xs font-mono animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{successMsg}</span>
              </div>
            )}

            {/* Field 1: Student Name */}
            <div className="space-y-1.5 text-left">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                Student Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ruben, Beck Murphy, Chester"
                  autoFocus
                  required
                  className="w-full bg-studio-950 border border-studio-800 rounded-xl px-4 py-3 pl-10 text-white placeholder-slate-600 font-mono text-sm focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-all"
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Field 2: Password */}
            <div className="space-y-1.5 text-left">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your student password"
                  required
                  className="w-full bg-studio-950 border border-studio-800 rounded-xl px-4 py-3 pl-10 text-white placeholder-slate-600 font-mono text-sm focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-all"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Field 3: College Email (Only in Registration Mode) */}
            {tab === 'register' && (
              <div className="space-y-1.5 text-left animate-fadeIn">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block flex items-center justify-between">
                  <span>College Email Address</span>
                  <span className="text-[10px] text-studio-accent font-normal">For morning briefings</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. s12345@qmc.ac.uk"
                    required
                    className="w-full bg-studio-950 border border-studio-800 rounded-xl px-4 py-3 pl-10 text-white placeholder-slate-600 font-mono text-sm focus:outline-none focus:border-studio-accent focus:ring-1 focus:ring-studio-accent transition-all"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Default Track Picker (Registration Mode Only) */}
            {tab === 'register' && (
              <div className="space-y-1.5 text-left animate-fadeIn">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                  Default Reference Track
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {TRACK_PREVIEWS.map(t => {
                    const Icon = t.icon;
                    const isSelected = selectedTrack === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTrack(t.id)}
                        className={`p-2 rounded-xl text-left border font-mono text-xs transition-all flex items-center space-x-2 cursor-pointer ${
                          isSelected
                            ? 'bg-studio-accent/20 border-studio-accent text-white shadow'
                            : 'bg-studio-950/70 border-studio-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-studio-accent' : 'text-slate-500'}`} />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-studio-accent hover:brightness-110 active:scale-[0.99] text-studio-950 font-black font-mono text-sm uppercase tracking-wider transition-all shadow-xl shadow-studio-accent/20 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-studio-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>INITIALIZING CONSOLE...</span>
                </>
              ) : (
                <>
                  <span>{tab === 'signin' ? 'ENTER STUDIO CONSOLE' : 'CREATE ACCOUNT & ENTER'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Discrete Secondary Action: Continue as Guest */}
            <div className="pt-2 text-center border-t border-studio-800/80">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-xs font-mono text-slate-400 hover:text-slate-200 underline decoration-slate-600 hover:decoration-slate-300 transition-all cursor-pointer py-1"
              >
                Continue as Unranked Guest (Scores will NOT be recorded)
              </button>
            </div>

          </form>

          {/* Bottom Chassis Screws Bar */}
          <div className="bg-studio-950/80 px-4 py-2.5 border-t border-studio-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
            <div className="w-3.5 h-3.5 rounded-full bg-studio-800 border border-studio-700 flex items-center justify-center text-[9px] select-none">+</div>
            <span>Maintain safe SPL monitor levels &bull; RJC Music Production</span>
            <div className="w-3.5 h-3.5 rounded-full bg-studio-800 border border-studio-700 flex items-center justify-center text-[9px] select-none">+</div>
          </div>

        </div>

      </div>
    </div>
  );
};
