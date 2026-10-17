// Standard ISO Frequency Bands for Audio Engineering & Ear Training

export const ISO_OCTAVE_1: number[] = [
  63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
];

export const ISO_OCTAVE_HALF: number[] = [
  40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000
];

export const ISO_OCTAVE_THIRD: number[] = [
  31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
];

export const HPF_CUTOFFS: number[] = [
  30, 45, 60, 80, 120, 180, 250, 350, 500, 750, 1000, 1500, 2200, 3300, 5000
];

export const LPF_CUTOFFS: number[] = [
  50, 80, 150, 250, 350, 500, 750, 1000, 1500, 2200, 3300, 5000, 7000, 10000, 14000, 18000
];

/**
 * Weighted probability generator for Filter Doctor cutoffs.
 * Significantly skews occurrences so extreme edges (30 Hz HPF, 50 Hz LPF, and 18 kHz LPF)
 * occur far less often (~1.2% - 1.5% each) while practical studio mixing
 * ranges occur much more frequently.
 * Supports HPF up to 5 kHz and LPF down to 50 Hz.
 */
export function getWeightedFilterCutoff(type: 'highpass' | 'lowpass'): number {
  if (type === 'highpass') {
    // 30 Hz heavily diminished, core mixing points (80 Hz - 500 Hz) favored, extending up to 5 kHz
    const weights: Record<number, number> = {
      30: 1,    // Extremely rare sub-bass rumble (<1.5% probability)
      45: 3,
      60: 6,
      80: 10,
      120: 10,
      180: 10,
      250: 10,
      350: 10,
      500: 8,
      750: 7,
      1000: 6,
      1500: 5,
      2200: 4,
      3300: 3,
      5000: 2
    };
    return pickWeightedNumber(HPF_CUTOFFS, weights);
  } else {
    // 50 Hz & 18 kHz heavily diminished, core audible points (1 kHz - 10 kHz) favored, extending down to 50 Hz
    const weights: Record<number, number> = {
      50: 1,    // Extremely deep sub low-pass (<1.5% probability)
      80: 2,
      150: 3,
      250: 4,
      350: 5,
      500: 6,
      750: 7,
      1000: 8,
      1500: 9,
      2200: 10,
      3300: 10,
      5000: 10,
      7000: 10,
      10000: 10,
      14000: 4,
      18000: 1   // Extremely rare ultrasonic edge (<1.5% probability)
    };
    return pickWeightedNumber(LPF_CUTOFFS, weights);
  }
}

/**
 * Weighted probability generator for Peak Master target frequencies.
 * Drastically reduces occurrences of frequencies below 50 Hz (31.5 Hz, 40 Hz)
 * and above 15 kHz (16 kHz, 20 kHz) to < 1% combined chance, focusing training
 * on the critical audible and mixing spectrum (50 Hz to 12.5 kHz).
 */
export function getWeightedPeakMasterFrequency(candidateBands: number[] = ISO_OCTAVE_THIRD): number {
  const weights: Record<number, number> = {};

  candidateBands.forEach(freq => {
    if (freq < 50) {
      weights[freq] = 1; // Drastically reduced extreme sub-bass (< 0.4% chance each)
    } else if (freq > 15000) {
      weights[freq] = 1; // Drastically reduced extreme ultra-highs (< 0.4% chance each)
    } else {
      weights[freq] = 20; // Core audible studio mixing frequencies
    }
  });

  return pickWeightedNumber(candidateBands, weights);
}

function pickWeightedNumber(items: number[], weights: Record<number, number>): number {
  let totalWeight = 0;
  for (const item of items) {
    totalWeight += weights[item] ?? 1;
  }
  let random = Math.random() * totalWeight;
  for (const item of items) {
    const weight = weights[item] ?? 1;
    if (random < weight) {
      return item;
    }
    random -= weight;
  }
  return items[items.length - 1];
}

export const LOW_SHELF_FREQS: number[] = [
  60, 100, 150, 250, 400, 600, 1000
];

export const HIGH_SHELF_FREQS: number[] = [
  2500, 4000, 6000, 8000, 10000, 12500, 16000
];

export const LOWSHELF_FREQUENCIES: number[] = [
  31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000
];

export const HIGHSHELF_FREQUENCIES: number[] = [
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
];

/**
 * Weighted shelf frequency generator for Low Shelf.
 * Drastically downweights the extremes near 20 Hz (31.5 Hz, 40 Hz) and near 1 kHz (800 Hz, 1000 Hz),
 * favoring common studio mixing low shelf frequencies (63 Hz - 315 Hz).
 */
export function getWeightedLowShelfFrequency(minFreq: number = 20, maxFreq: number = 1000): number {
  const candidates = LOWSHELF_FREQUENCIES.filter(f => f >= minFreq && f <= maxFreq);
  const weights: Record<number, number> = {
    31.5: 1,  // extreme near 20 Hz
    40: 2,    // extreme near 20 Hz
    50: 5,
    63: 12,
    80: 15,
    100: 18,
    125: 18,
    160: 18,
    200: 15,
    250: 12,
    315: 10,
    400: 6,
    500: 4,
    630: 3,
    800: 2,   // extreme near 1 kHz
    1000: 1   // extreme at 1 kHz
  };
  return pickWeightedNumber(candidates, weights);
}

/**
 * Weighted shelf frequency generator for High Shelf.
 * Drastically downweights the extremes near 1 kHz (1000 Hz, 1250 Hz) and near 20 kHz (16 kHz, 20 kHz),
 * favoring core musical top-end shelving frequencies (3.15 kHz - 10 kHz).
 */
export function getWeightedHighShelfFrequency(minFreq: number = 1000, maxFreq: number = 20000): number {
  const candidates = HIGHSHELF_FREQUENCIES.filter(f => f >= minFreq && f <= maxFreq);
  const weights: Record<number, number> = {
    1000: 1,   // extreme at 1 kHz
    1250: 2,   // extreme near 1 kHz
    1600: 5,
    2000: 8,
    2500: 12,
    3150: 16,
    4000: 18,
    5000: 18,
    6300: 18,
    8000: 16,
    10000: 12,
    12500: 6,
    16000: 2,  // extreme near 20 kHz
    20000: 1   // extreme at 20 kHz
  };
  return pickWeightedNumber(candidates, weights);
}

export const MIN_FREQ = 20;
export const MAX_FREQ = 20000;

export function formatFrequency(hz: number): string {
  if (hz >= 10000) {
    return `${(hz / 1000).toFixed(1)} kHz`;
  }
  if (hz >= 1000) {
    const val = hz / 1000;
    return val % 1 === 0 ? `${val.toFixed(0)} kHz` : `${val.toFixed(1)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export function formatGain(db: number): string {
  if (db > 0) return `+${db.toFixed(1)} dB`;
  if (db < 0) return `${db.toFixed(1)} dB`;
  return `0 dB`;
}

export function freqToLogScale(freq: number): number {
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  const curLog = Math.log10(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  return (curLog - minLog) / (maxLog - minLog);
}

export function logScaleToFreq(norm: number): number {
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  const logVal = minLog + Math.max(0, Math.min(1, norm)) * (maxLog - minLog);
  return Math.pow(10, logVal);
}

export function freqDistanceInOctaves(f1: number, f2: number): number {
  return Math.abs(Math.log2(f1 / f2));
}

export function freqDistanceInSemitones(f1: number, f2: number): number {
  return freqDistanceInOctaves(f1, f2) * 12;
}

export function findClosestIsoBand(freq: number, bands: number[]): number {
  let closest = bands[0];
  let minDiff = freqDistanceInOctaves(freq, closest);
  for (let i = 1; i < bands.length; i++) {
    const diff = freqDistanceInOctaves(freq, bands[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = bands[i];
    }
  }
  return closest;
}

/**
 * Calculates a precision ear training score from 0 to 1,000 points:
 * - Exact frequency hit: 1,000 points
 * - Very close (within 1 semitone): 900 - 990 points
 * - Close (within 1/3 octave): 750 - 900 points
 * - Moderate (within 2/3 octave): 500 - 750 points
 * - 1 octave off: 350 - 500 points
 * - 2 octaves off: 100 - 300 points
 * - Farthest options (>= 3.5 - 4.0 octaves away): 0 points
 */
export function calculateScore(
  freqDistanceOctaves: number,
  gainErrorDb: number = 0,
  isTypeCorrect: boolean = true,
  maxOctavesLimit: number = 4.0
): number {
  if (!isTypeCorrect) return 0;

  // If at or beyond the maximum distance away, award 0 points
  if (freqDistanceOctaves >= maxOctavesLimit) {
    return 0;
  }

  // Smooth quadratic/exponential curve from 1000 down to 0
  // normalized distance from 0 (exact) to 1 (farthest)
  const normDist = Math.min(1, freqDistanceOctaves / maxOctavesLimit);
  
  // Power curve gives a rewarding steep peak for exactness and smooth decline to 0
  // (1 - normDist)^2.2 * 1000
  let rawScore = Math.pow(1 - normDist, 2.0) * 1000;

  // Exact hit bonus
  if (freqDistanceOctaves <= 0.04) {
    rawScore = 1000;
  }

  // Deduct penalty for gain mismatch if gain was tested (up to 200 pts)
  if (gainErrorDb > 0) {
    const gainPenalty = Math.min(200, gainErrorDb * 20);
    rawScore -= gainPenalty;
  }

  return Math.max(0, Math.min(1000, Math.round(rawScore)));
}

export interface RankInfo {
  tier: number;
  title: string;
  minScore: number;
  year: 1 | 2;
  approxTimeline: string;
  description: string;
}

/**
 * 2-Year Audio Engineering Ear Training Curriculum Ladder (July to May each year = 22 months total)
 * Calibrated for a student completing 20 rounds per day averaging ~750 pts/round (~15,000 pts/day, ~450k/month).
 * Year 1 culminates in May with Certified Studio Engineer (5.6M pts).
 * Year 2 culminates towards May with Legendary Golden Ears (10M pts).
 */
export const ACADEMIC_RANKS: RankInfo[] = [
  {
    tier: 1,
    title: "Audio Novice",
    minScore: 0,
    year: 1,
    approxTimeline: "Year 1 • Day 1",
    description: "Welcome to the studio. Your ears are beginning their critical listening journey."
  },
  {
    tier: 2,
    title: "Frequency Observer",
    minScore: 25000,
    year: 1,
    approxTimeline: "Year 1 • July (Week 1)",
    description: "Beginning to identify tonal shifts across broad frequency registers."
  },
  {
    tier: 3,
    title: "Harmonic Scout",
    minScore: 75000,
    year: 1,
    approxTimeline: "Year 1 • July (Week 2)",
    description: "Distinguishing octaves and fundamental instrument overtones."
  },
  {
    tier: 4,
    title: "Tone Calibrator",
    minScore: 150000,
    year: 1,
    approxTimeline: "Year 1 • July (Week 3)",
    description: "Calibrating pitch and tonal balance with increasing speed and consistency."
  },
  {
    tier: 5,
    title: "Acoustic Trainee",
    minScore: 300000,
    year: 1,
    approxTimeline: "Year 1 • End of July (Month 1)",
    description: "Recognizing bass warmth versus low-end mud, rumble, and sub clutter."
  },
  {
    tier: 6,
    title: "Patchbay Assistant",
    minScore: 650000,
    year: 1,
    approxTimeline: "Year 1 • August (Month 2)",
    description: "Spotting EQ discrepancies in tracking monitors with increasing precision."
  },
  {
    tier: 7,
    title: "Assistant Tracking Engineer",
    minScore: 1100000,
    year: 1,
    approxTimeline: "Year 1 • September (Month 3)",
    description: "Identifying boxy midrange build-ups and vocal sibilance during live tracking."
  },
  {
    tier: 8,
    title: "Resonance Hunter",
    minScore: 1600000,
    year: 1,
    approxTimeline: "Year 1 • October (Month 4)",
    description: "Targeting narrow resonant frequencies and harsh acoustic room modes."
  },
  {
    tier: 9,
    title: "Spectral Apprentice",
    minScore: 2100000,
    year: 1,
    approxTimeline: "Year 1 • November (Month 5)",
    description: "Pinpointing 1/3-octave EQ variations with reliable consistency."
  },
  {
    tier: 10,
    title: "Studio Tracking Engineer",
    minScore: 2700000,
    year: 1,
    approxTimeline: "Year 1 • December (Mid-Year 1)",
    description: "A trusted ear on instrument tracking sessions, mic selection, and preamp tonal balance."
  },
  {
    tier: 11,
    title: "Filter Technician",
    minScore: 3300000,
    year: 1,
    approxTimeline: "Year 1 • January (Month 7)",
    description: "Accurately diagnosing high-pass and low-pass filter slopes and cutoff points."
  },
  {
    tier: 12,
    title: "Tone Architect",
    minScore: 3900000,
    year: 1,
    approxTimeline: "Year 1 • February (Month 8)",
    description: "Carving frequency pockets to give competing instruments clean separation."
  },
  {
    tier: 13,
    title: "Balance Specialist",
    minScore: 4500000,
    year: 1,
    approxTimeline: "Year 1 • March (Month 9)",
    description: "Critical evaluation of spectral tilt, bass headroom, and vocal presence."
  },
  {
    tier: 14,
    title: "Junior Mix Engineer",
    minScore: 5100000,
    year: 1,
    approxTimeline: "Year 1 • April (Month 10)",
    description: "Reliably detecting subtle EQ boosts and cuts under 3dB across multi-track audio."
  },
  {
    tier: 15,
    title: "Certified Studio Engineer",
    minScore: 5600000,
    year: 1,
    approxTimeline: "Year 1 • May (Year 1 Graduation)",
    description: "Year One Completed! Proven critical listening and studio analytical accuracy."
  },
  {
    tier: 16,
    title: "Frequency Adept",
    minScore: 6200000,
    year: 2,
    approxTimeline: "Year 2 • July (Year 2 Begins)",
    description: "Year Two advanced training: discerning complex multi-instrument EQ interactions."
  },
  {
    tier: 17,
    title: "Critical Listening Specialist",
    minScore: 6800000,
    year: 2,
    approxTimeline: "Year 2 • August (Month 13)",
    description: "Pinpoint accuracy in extreme low-end (sub-bass) and high-end air."
  },
  {
    tier: 18,
    title: "Dynamic EQ Specialist",
    minScore: 7400000,
    year: 2,
    approxTimeline: "Year 2 • September (Month 14)",
    description: "Instinctive recognition of frequency spikes across dynamic program material."
  },
  {
    tier: 19,
    title: "Senior Mix Engineer",
    minScore: 8000000,
    year: 2,
    approxTimeline: "Year 2 • October-November (Months 15-16)",
    description: "Master of sonic depth, masking resolution, and multi-track balance."
  },
  {
    tier: 20,
    title: "Acoustic Consultant",
    minScore: 8600000,
    year: 2,
    approxTimeline: "Year 2 • December (Mid-Year 2)",
    description: "Dissecting comb filtering, room resonances, and phase relationships."
  },
  {
    tier: 21,
    title: "Mastering Engineer",
    minScore: 9100000,
    year: 2,
    approxTimeline: "Year 2 • January-February (Months 18-19)",
    description: "Precision mastering ear: detecting microscopic 0.5dB to 1dB spectral adjustments."
  },
  {
    tier: 22,
    title: "Spectral Virtuoso",
    minScore: 9500000,
    year: 2,
    approxTimeline: "Year 2 • March (Month 20)",
    description: "Near-flawless intuition across full-range multi-genre audio masters."
  },
  {
    tier: 23,
    title: "Grandmaster of EQ",
    minScore: 9800000,
    year: 2,
    approxTimeline: "Year 2 • April (Month 21)",
    description: "Elite studio mastery. Top echelon of audio critical listening."
  },
  {
    tier: 24,
    title: "Legendary Golden Ears",
    minScore: 10000000,
    year: 2,
    approxTimeline: "Year 2 • May (End of Year 2 Grand Finale!)",
    description: "The Pinnacle of Ear Training: The highest honor awarded at the completion of Year Two!"
  }
];

export function getRankDetails(score: number): {
  currentRank: RankInfo;
  nextRank: RankInfo | null;
  progressPercent: number;
  scoreInTier: number;
  scoreNeededForNext: number;
} {
  let currentIndex = 0;
  for (let i = ACADEMIC_RANKS.length - 1; i >= 0; i--) {
    if (score >= ACADEMIC_RANKS[i].minScore) {
      currentIndex = i;
      break;
    }
  }

  const currentRank = ACADEMIC_RANKS[currentIndex];
  const nextRank = currentIndex < ACADEMIC_RANKS.length - 1 ? ACADEMIC_RANKS[currentIndex + 1] : null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      progressPercent: 100,
      scoreInTier: score - currentRank.minScore,
      scoreNeededForNext: 0
    };
  }

  const tierSpan = nextRank.minScore - currentRank.minScore;
  const scoreInTier = Math.max(0, score - currentRank.minScore);
  const progressPercent = Math.min(100, Math.max(0, Math.round((scoreInTier / tierSpan) * 100)));
  const scoreNeededForNext = Math.max(0, nextRank.minScore - score);

  return {
    currentRank,
    nextRank,
    progressPercent,
    scoreInTier,
    scoreNeededForNext
  };
}

export function getRankTitle(score: number, _roundsPlayed: number = 0): string {
  const details = getRankDetails(score);
  return details.currentRank.title;
}

