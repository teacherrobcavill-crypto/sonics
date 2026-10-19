import { CompressorStem } from '../types/compressor';

export const COMPRESSOR_STEMS: CompressorStem[] = [
  {
    id: 'kick',
    name: 'Acoustic Kick Drum',
    category: 'kick',
    description: 'Dynamic 24" punchy acoustic kick with beater click and sub decay.',
    tips: 'Use slow attack (20–40ms) to let the transient click snap through before clamping the sub resonance.',
    suggestedParams: {
      thresholdDb: -16,
      ratio: 4.0,
      attackMs: 25.0,
      releaseMs: 80.0,
      makeupGainDb: 3.5
    }
  },
  {
    id: 'snare',
    name: 'Rock Snare Drum',
    category: 'snare',
    description: 'Crisp rimshot with brass shell ring and loose bottom wire sizzle.',
    tips: 'Faster attack (5–12ms) controls peak rimshot transients; medium release (120ms) emphasizes snare ring.',
    suggestedParams: {
      thresholdDb: -14,
      ratio: 5.0,
      attackMs: 8.0,
      releaseMs: 140.0,
      makeupGainDb: 4.0
    }
  },
  {
    id: 'bass',
    name: 'Electric Fingerstyle Bass',
    category: 'bass',
    description: 'Warm P-bass groove with dynamic fret finger-plucks and varying note velocities.',
    tips: 'Moderate attack (15ms) preserves finger pluck articulation while leveling out inconsistent note sustain.',
    suggestedParams: {
      thresholdDb: -20,
      ratio: 4.0,
      attackMs: 15.0,
      releaseMs: 200.0,
      makeupGainDb: 5.0
    }
  },
  {
    id: 'vocal',
    name: 'Lead Studio Vocal',
    category: 'vocal',
    description: 'Dynamic pop/rock vocal passage moving from intimate verses to belted chorus peaks.',
    tips: 'Smooth soft-knee with medium-fast attack (5–10ms) and ~150ms release keeps vocals upfront without audible breathing.',
    suggestedParams: {
      thresholdDb: -22,
      ratio: 3.5,
      attackMs: 6.0,
      releaseMs: 160.0,
      makeupGainDb: 6.0
    }
  },
  {
    id: 'guitar',
    name: 'Strummed Acoustic Guitar',
    category: 'guitar',
    description: 'Steel-string acoustic rhythm guitar strumming with sharp plectrum peaks.',
    tips: 'Slow attack (30ms) allows pick strum texture to sparkle while compressing body boominess.',
    suggestedParams: {
      thresholdDb: -18,
      ratio: 3.0,
      attackMs: 30.0,
      releaseMs: 120.0,
      makeupGainDb: 3.0
    }
  },
  {
    id: 'drums',
    name: 'Complete Stereo Drum Bus',
    category: 'drums',
    description: 'Full acoustic drum kit performance with room ambience and cymbal wash.',
    tips: 'Classic glue compression: 30ms attack lets transients pass, auto-release breathes with tempo, 2–4dB GR maximum.',
    suggestedParams: {
      thresholdDb: -15,
      ratio: 2.5,
      attackMs: 30.0,
      releaseMs: 100.0,
      makeupGainDb: 2.5
    }
  }
];

/**
 * Procedural Studio Stem Synthesizer
 * Generates rich, authentic, loopable uncompressed audio buffers in memory.
 */
export function generateProceduralStemAudio(ctx: AudioContext, stemId: string): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bpm = 120;
  const beatSec = 60 / bpm;
  const loopBars = 4;
  const totalDuration = loopBars * 4 * beatSec; // 8 seconds
  const totalSamples = Math.floor(sampleRate * totalDuration);

  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  if (stemId === 'kick') {
    // 4-on-the-floor acoustic kick with varying dynamics
    for (let beat = 0; beat < loopBars * 4; beat++) {
      const startSample = Math.floor(beat * beatSec * sampleRate);
      const accent = (beat % 4 === 0) ? 1.0 : (beat % 2 === 0 ? 0.88 : 0.75);
      const hitSamples = Math.floor(0.45 * sampleRate);

      for (let i = 0; i < hitSamples && (startSample + i) < totalSamples; ++i) {
        const t = i / sampleRate;
        // Pitch envelope: drops rapidly from 160Hz to 48Hz
        const freq = 48 + 120 * Math.exp(-t * 35.0);
        const sub = Math.sin(2.0 * Math.PI * freq * t) * Math.exp(-t * 9.0);
        // Beater click (high-frequency snap)
        const click = (Math.random() * 2 - 1) * Math.exp(-t * 80.0) * 0.45;
        const sample = (sub + click) * accent * 0.85;

        left[startSample + i] += sample;
        right[startSample + i] += sample;
      }
    }
  } else if (stemId === 'snare') {
    // Snare hits on beats 2 and 4 with ghost notes
    for (let bar = 0; bar < loopBars; bar++) {
      const barStart = bar * 4 * beatSec;
      const hits = [
        { time: barStart + beatSec * 1.0, vol: 0.95 },
        { time: barStart + beatSec * 2.5, vol: 0.35 }, // ghost
        { time: barStart + beatSec * 3.0, vol: 1.0 },
        { time: barStart + beatSec * 3.75, vol: 0.45 } // ghost
      ];

      for (const hit of hits) {
        const startSample = Math.floor(hit.time * sampleRate);
        const hitSamples = Math.floor(0.5 * sampleRate);

        for (let i = 0; i < hitSamples && (startSample + i) < totalSamples; ++i) {
          const t = i / sampleRate;
          // Body tone: drops from 240Hz to 180Hz
          const freq = 180 + 60 * Math.exp(-t * 40.0);
          const body = Math.sin(2.0 * Math.PI * freq * t) * Math.exp(-t * 16.0) * 0.6;
          // White noise wire rattle with stereo spread
          const noiseL = (Math.random() * 2 - 1) * Math.exp(-t * 12.0) * 0.7;
          const noiseR = (Math.random() * 2 - 1) * Math.exp(-t * 12.0) * 0.7;

          left[startSample + i] += (body + noiseL) * hit.vol * 0.8;
          right[startSample + i] += (body + noiseR) * hit.vol * 0.8;
        }
      }
    }
  } else if (stemId === 'bass') {
    // P-bass line in A minor (A1, C2, D2, E2, G2)
    const notes = [
      { time: 0.0, freq: 55.0, dur: 0.8, vel: 0.95 }, // A1
      { time: 1.0, freq: 55.0, dur: 0.4, vel: 0.75 },
      { time: 1.5, freq: 65.4, dur: 0.4, vel: 0.85 }, // C2
      { time: 2.0, freq: 73.4, dur: 0.8, vel: 0.90 }, // D2
      { time: 3.0, freq: 82.4, dur: 0.5, vel: 0.80 }, // E2
      { time: 3.5, freq: 98.0, dur: 0.4, vel: 0.70 }, // G2
    ];

    for (let bar = 0; bar < loopBars; bar++) {
      const barOffset = bar * 4 * beatSec;
      for (const n of notes) {
        const startSample = Math.floor((barOffset + n.time * beatSec) * sampleRate);
        const noteSamples = Math.floor(n.dur * beatSec * sampleRate);

        for (let i = 0; i < noteSamples && (startSample + i) < totalSamples; ++i) {
          const t = i / sampleRate;
          // Rich bass harmonics (fundamental + 2nd + 3rd harmonic)
          const f = n.freq;
          const h1 = Math.sin(2.0 * Math.PI * f * t);
          const h2 = Math.sin(4.0 * Math.PI * f * t) * 0.45;
          const h3 = Math.sin(6.0 * Math.PI * f * t) * 0.20;
          const pluck = Math.exp(-t * 2.5);
          const sample = (h1 + h2 + h3) * pluck * n.vel * 0.75;

          left[startSample + i] += sample;
          right[startSample + i] += sample;
        }
      }
    }
  } else if (stemId === 'guitar') {
    // Strummed acoustic rhythm chords (Am - C - G - D)
    const chords = [
      [110, 164.8, 220, 261.6, 329.6], // Am
      [130.8, 164.8, 196, 261.6, 329.6], // C
      [98.0, 123.5, 146.8, 196, 293.7], // G
      [146.8, 220, 293.7, 369.9, 440]   // D
    ];

    for (let bar = 0; bar < loopBars; bar++) {
      const chord = chords[bar % chords.length];
      const strums = [0.0, 0.75, 1.5, 2.0, 2.5, 3.25];

      for (const sTime of strums) {
        const startSample = Math.floor((bar * 4 * beatSec + sTime * beatSec) * sampleRate);
        const strumSamples = Math.floor(0.7 * sampleRate);

        for (let stringIdx = 0; stringIdx < chord.length; stringIdx++) {
          const stringDelay = stringIdx * 0.008 * sampleRate;
          const f = chord[stringIdx];

          for (let i = 0; i < strumSamples && (startSample + stringDelay + i) < totalSamples; ++i) {
            const t = i / sampleRate;
            const wave = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 4.5);
            const pick = (Math.random() * 2 - 1) * Math.exp(-t * 60.0) * 0.25;
            const sig = (wave + pick) * 0.18;

            left[Math.floor(startSample + stringDelay + i)] += sig * 0.9;
            right[Math.floor(startSample + stringDelay + i)] += sig * 1.1;
          }
        }
      }
    }
  } else if (stemId === 'vocal') {
    // Vocal-like dynamic formant synthesis with vibrato and syllables
    for (let bar = 0; bar < loopBars; bar++) {
      const baseTime = bar * 4 * beatSec;
      const pitches = [220, 261.6, 293.7, 329.6, 293.7]; // A3, C4, D4, E4, D4

      for (let pIdx = 0; pIdx < pitches.length; pIdx++) {
        const startSample = Math.floor((baseTime + pIdx * 0.75 * beatSec) * sampleRate);
        const durSamples = Math.floor(0.7 * beatSec * sampleRate);
        const targetPitch = pitches[pIdx];

        for (let i = 0; i < durSamples && (startSample + i) < totalSamples; ++i) {
          const t = i / sampleRate;
          const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 4.0;
          const f = targetPitch + (t > 0.15 ? vibrato : 0);

          // Formant approximation (Ah sound: ~800Hz & ~1200Hz)
          const fundamental = Math.sin(2 * Math.PI * f * t);
          const formant1 = Math.sin(2 * Math.PI * 800 * t) * 0.4 * Math.sin(2 * Math.PI * f * t);
          const formant2 = Math.sin(2 * Math.PI * 1200 * t) * 0.25 * Math.sin(2 * Math.PI * f * t);
          const env = Math.sin((Math.PI * i) / durSamples);

          const sample = (fundamental * 0.5 + formant1 + formant2) * env * 0.55;
          left[startSample + i] += sample;
          right[startSample + i] += sample;
        }
      }
    }
  } else {
    // Default Drum Bus (Kick + Snare + HiHats + Ride)
    const kickBuf = generateProceduralStemAudio(ctx, 'kick');
    const snareBuf = generateProceduralStemAudio(ctx, 'snare');
    const kL = kickBuf.getChannelData(0);
    const sL = snareBuf.getChannelData(0);
    const sR = snareBuf.getChannelData(1);

    for (let i = 0; i < totalSamples; i++) {
      left[i] = (kL[i] * 0.85) + (sL[i] * 0.85);
      right[i] = (kL[i] * 0.85) + (sR[i] * 0.85);

      // Add 16th-note Hi-Hats
      const beatProgress = (i % Math.floor(beatSec * 0.25 * sampleRate)) / sampleRate;
      const hat = (Math.random() * 2 - 1) * Math.exp(-beatProgress * 70.0) * 0.12;
      left[i] += hat * 0.8;
      right[i] += hat * 1.2;
    }
  }

  // Smooth loop boundary crossfade (5ms) to guarantee zero click when looping
  const fadeSamples = Math.floor(0.005 * sampleRate);
  for (let i = 0; i < fadeSamples; ++i) {
    const fade = i / fadeSamples;
    left[i] *= fade;
    right[i] *= fade;
    left[totalSamples - 1 - i] *= fade;
    right[totalSamples - 1 - i] *= fade;
  }

  return buffer;
}
