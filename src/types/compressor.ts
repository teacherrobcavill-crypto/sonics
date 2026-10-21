/**
 * Types and interfaces for Sonics Feed-Forward VU Compressor Lab
 * Based on C++ specs from plugin designs/vu-compressor
 */

export interface CompressorParams {
  thresholdDb: number;       // -60.0 dB to 0.0 dBFS (default: -18.0)
  ratio: number;             // 1.0 to 100.0 (default: 4.0, >= 50 is brickwall limiting)
  attackMs: number;          // 0.1 ms to 200.0 ms (default: 10.0)
  releaseMs: number;         // 10.0 ms to 1000.0 ms (default: 100.0)
  kneeDb: number;            // 0.0 dB to 24.0 dB (default: 4.0 dB quadratic soft-knee)
  makeupGainDb: number;      // -12.0 dB to +24.0 dB (default: 0.0 dB manual makeup gain)
  autoGain: boolean;         // Auto-gain compensation mode
  bypassed: boolean;         // Studio hardware bypass switch

  // Advanced Controls: Parallel Blender & Sidechain Filtering
  mixPercent: number;        // 0.0 to 100.0% (default: 100.0% wet)
  scHpfHz: number;           // 20.0 to 150.0 Hz (default: 80.0 Hz)
  scHpfActive: boolean;      // HPF sidechain filter toggle (default: false)
  scMidFreq: number;         // 200.0 to 8000.0 Hz (default: 2500.0 Hz)
  scMidGainDb: number;       // -12.0 to +12.0 dB (default: 0.0 dB)
  scMidActive: boolean;      // Mid band sidechain focus toggle (default: false)
  scMonitor: boolean;        // Sidechain listen / monitor switch (default: false)
  negativeRatio: boolean;    // Omnipressor-style negative ratio compression mode (default: false)
  lookaheadMs: number;       // 0.0 to 10.0 ms lookahead buffer (default: 0.0 ms)
  transientAttack: number;   // -100% to +100% transient attack shaping (default: 0)
  transientSustain: number;  // -100% to +100% transient sustain shaping (default: 0)
}

export const DEFAULT_COMPRESSOR_PARAMS: CompressorParams = {
  thresholdDb: -18.0,
  ratio: 4.0,
  attackMs: 10.0,
  releaseMs: 100.0,
  kneeDb: 4.0,
  makeupGainDb: 0.0,
  autoGain: true,
  bypassed: false,

  mixPercent: 100.0,
  scHpfHz: 80.0,
  scHpfActive: false,
  scMidFreq: 2500.0,
  scMidGainDb: 0.0,
  scMidActive: false,
  scMonitor: false,
  negativeRatio: false,
  lookaheadMs: 0.0,
  transientAttack: 0,
  transientSustain: 0
};

export interface CompressorTelemetry {
  inputPeakL: number;        // -60 to +12 dBFS
  inputPeakR: number;
  inputRmsL: number;
  inputRmsR: number;
  outputPeakL: number;
  outputPeakR: number;
  outputRmsL: number;
  outputRmsR: number;
  gainReductionDb: number;   // Instantaneous gain reduction in dB (<= 0)
  avgGainReductionDb: number;// 300ms averaged gain reduction in dB (>= 0)
  vuNeedlePosition: number;  // 0.0 (rest / 0dB on right) to 1.0 (full deflection / -20dB on left)

  // Real-time envelope detectors (Pre- vs Post-Compression)
  isSignalPresent: boolean;  // True if audio input exceeds -52 dBFS
  inputCrestDb: number;      // Peak - RMS before compression (crest factor in dB)
  outputCrestDb: number;     // Peak - RMS after compression (crest factor in dB)
  crestReductionDb: number;  // Input crest - Output crest (transient impact attenuation)
  envelopeSwingDb: number;   // Gain reduction modulation swing in recent window (pumping detection)
}

export type CompressorDisplayMode = 'vu' | 'bars' | 'wave';

export interface CompressorStem {
  id: string;
  name: string;
  category: 'kick' | 'snare' | 'bass' | 'drums' | 'custom';
  description: string;
  tips: string;
  suggestedParams: Partial<CompressorParams>;
  audioUrl?: string;
}
