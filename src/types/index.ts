export type FilterType = 'peaking' | 'highpass' | 'lowpass' | 'lowshelf' | 'highshelf' | 'notch';

export const BAND_COLORS = [
  '#00f0ff', // Band 1: Cyan
  '#10b981', // Band 2: Emerald
  '#f59e0b', // Band 3: Amber
  '#c084fc', // Band 4: Purple
  '#fb923c', // Band 5: Orange
  '#f43f5e', // Band 6: Rose
];

export interface FilterParams {
  type: FilterType;
  frequency: number;   // 20 - 20000 Hz
  gain: number;        // in dB (-18 to +18 dB, 0 for HPF/LPF)
  q: number;           // quality factor (0.4 to 10.0)
  slope?: number;      // for highpass/lowpass filters (6 to 96 dB/oct)
}

export type AudioSourceType =
  | 'dance_pop'
  | 'alt_rock'
  | 'electronic_pop'
  | 'hard_rock'
  | 'hip_hop'
  | 'pink_noise'
  | 'white_noise'
  | 'drum_beat'
  | 'synth_groove'
  | 'acoustic_funk'
  | 'edm_track'
  | 'rock_track'
  | 'custom_file';

export type GameMode =
  | 'peak_master'      // Parametric EQ boost/cut frequency identification
  | 'filter_doctor'    // HPF & LPF Cutoff training
  | 'tye_match'        // Interactive EQ Correct mode
  | 'pan_master'       // Interactive Stereo Field Panning
  | 'db_master'        // Interactive A/B dB Volume Level Training
  | 'sandbox';         // Free interactive EQ studio sandbox

export type BandGranularity = 'octave_1' | 'octave_half' | 'octave_third' | 'continuous';

export interface GameSettings {
  mode: GameMode;
  granularity: BandGranularity;
  qFactor: number;             // standard 1.41
  gainOptions: number[];       // e.g. [6, 9, 12] or [-12, -9, -6, 6, 9, 12]
  allowCuts: boolean;
  filterTypesEnabled: FilterType[];
  roundsPerSession: number;
}

export interface RoundResult {
  roundNumber: number;
  mode: GameMode;
  target: FilterParams;
  guess: FilterParams;
  freqDistanceOctaves: number;
  freqDistanceSemitones: number;
  gainDistanceDb: number;
  isFilterTypeCorrect: boolean;
  isDirectionCorrect: boolean;
  score: number;               // 0 to 1000
  timeSpentSeconds: number;
  timestamp: number;
  panTarget?: number;          // -100 to +100
  panGuess?: number;           // -100 to +100
  panDistance?: number;        // distance in percent
  target2?: FilterParams;      // optional second filter for dual filter mode
  guess2?: FilterParams;       // optional second filter guess for dual filter mode
  dbTarget?: number;           // dB delta target for db_master (-24 to +24)
  dbGuess?: number;            // dB delta guess for db_master (-24 to +24)
  targetStemBalance?: StemMixBalance; // Multi-stem target mix levels in dB
  guessStemBalance?: StemMixBalance;  // Multi-stem user mix levels in dB
  stemDeltas?: Record<StemType, number>; // Error in dB for each stem
  averageStemDeltaDb?: number; // Average dB deviation across active stems
}

export type StemType = 'drums' | 'bass' | 'other' | 'vocals';

export interface StemMixBalance {
  drums: number;
  bass: number;
  other: number;
  vocals: number;
}

export interface StemChannelState {
  volumeDb: number;
  isMuted: boolean;
  isSoloed: boolean;
}

export interface UserStats {
  totalScore: number;
  roundsPlayed: number;
  currentStreak: number;
  bestStreak: number;
  averageAccuracyOctaves: number;
  rankTitle: string;
}

