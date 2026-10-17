/**
 * Procedural Audio Synthesizers rendered into seamless looping AudioBuffers
 * using Web Audio OfflineAudioContext.
 * 
 * Provides rich musical frequency content:
 * - Sub & Lows (40 - 200 Hz): Kick fundamental, deep bassline
 * - Mids & High-Mids (250 - 4000 Hz): Snare body, synth chords, organ overtones
 * - Highs (5000 - 18000 Hz): Hi-hat sizzle, shaker, harmonic sparkle
 */

export async function createDrumLoopBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const bpm = 116;
  const beats = 8; // 2 bars of 4/4
  const secondsPerBeat = 60 / bpm;
  const totalDuration = beats * secondsPerBeat;
  const sampleRate = ctx.sampleRate;

  const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  // Helper for kick drum
  const playKick = (time: number) => {
    const osc = offline.createOscillator();
    const gain = offline.createGain();

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(offline.destination);

    osc.start(time);
    osc.stop(time + 0.36);
  };

  // Helper for snare drum
  const playSnare = (time: number, velocity: number = 0.8) => {
    // Tone
    const osc = offline.createOscillator();
    const oscGain = offline.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.1);
    oscGain.gain.setValueAtTime(velocity * 0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(oscGain);
    oscGain.connect(offline.destination);
    osc.start(time);
    osc.stop(time + 0.2);

    // Noise snap
    const bufferSize = sampleRate * 0.25;
    const noiseBuffer = offline.createBuffer(1, bufferSize, sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = offline.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(800, time);

    const noiseGain = offline.createGain();
    noiseGain.gain.setValueAtTime(velocity * 0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(offline.destination);

    noise.start(time);
    noise.stop(time + 0.25);
  };

  // Helper for hi-hat
  const playHat = (time: number, isOpen: boolean = false, velocity: number = 0.5) => {
    const dur = isOpen ? 0.35 : 0.06;
    const bufferSize = sampleRate * dur;
    const noiseBuffer = offline.createBuffer(1, bufferSize, sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = offline.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(9500, time);
    filter.Q.setValueAtTime(2.5, time);

    const gain = offline.createGain();
    gain.gain.setValueAtTime(velocity * 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(offline.destination);

    noise.start(time);
    noise.stop(time + dur);
  };

  // Compose 2-bar beat pattern (16 steps per bar = 32 steps)
  const stepDur = secondsPerBeat / 4;
  for (let bar = 0; bar < 2; bar++) {
    const barTime = bar * 4 * secondsPerBeat;

    // Kick pattern: 1, 2.5, 3.75
    playKick(barTime + 0 * secondsPerBeat);
    playKick(barTime + 1.5 * secondsPerBeat);
    playKick(barTime + 2.75 * secondsPerBeat);
    if (bar === 1) {
      playKick(barTime + 3.5 * secondsPerBeat);
    }

    // Snare on 2 and 4
    playSnare(barTime + 1 * secondsPerBeat, 0.85);
    playSnare(barTime + 3 * secondsPerBeat, 0.9);
    // Ghost notes
    playSnare(barTime + 2.25 * secondsPerBeat, 0.25);

    // 16th Hi-hats
    for (let s = 0; s < 16; s++) {
      const t = barTime + s * stepDur;
      const isOpen = s === 6 || s === 14;
      const vel = s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.4 : 0.25;
      playHat(t, isOpen, vel);
    }
  }

  return await offline.startRendering();
}

export async function createSynthGrooveBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const bpm = 116;
  const beats = 8;
  const secondsPerBeat = 60 / bpm;
  const totalDuration = beats * secondsPerBeat;
  const sampleRate = ctx.sampleRate;

  const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  // Chords: Dm9 (D3, F3, A3, C4, E4), G13 (G2, F3, B3, E4), Cmaj9 (C3, E3, G3, B3, D4), Am7 (A2, G3, C4, E4)
  const chords = [
    { time: 0 * secondsPerBeat, dur: 1.8 * secondsPerBeat, freqs: [146.83, 174.61, 220.00, 261.63, 329.63] },
    { time: 2 * secondsPerBeat, dur: 1.8 * secondsPerBeat, freqs: [98.00, 174.61, 246.94, 329.63, 440.00] },
    { time: 4 * secondsPerBeat, dur: 1.8 * secondsPerBeat, freqs: [130.81, 164.81, 196.00, 246.94, 293.66] },
    { time: 6 * secondsPerBeat, dur: 1.8 * secondsPerBeat, freqs: [110.00, 196.00, 261.63, 329.63, 392.00] }
  ];

  chords.forEach(ch => {
    ch.freqs.forEach((f, idx) => {
      // 2 detuned sawtooths per voice
      [-3, 3].forEach(detune => {
        const osc = offline.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, ch.time);
        osc.detune.setValueAtTime(detune, ch.time);

        const filter = offline.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3500, ch.time);
        filter.Q.setValueAtTime(1.5, ch.time);

        const gain = offline.createGain();
        gain.gain.setValueAtTime(0.001, ch.time);
        gain.gain.linearRampToValueAtTime(0.05 / (idx + 1), ch.time + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ch.time + ch.dur);

        // Panning stereo spread
        const panner = offline.createStereoPanner ? offline.createStereoPanner() : null;
        if (panner) {
          panner.pan.setValueAtTime((detune > 0 ? 0.3 : -0.3) + (idx % 2 === 0 ? 0.2 : -0.2), ch.time);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(panner);
          panner.connect(offline.destination);
        } else {
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(offline.destination);
        }

        osc.start(ch.time);
        osc.stop(ch.time + ch.dur);
      });
    });
  });

  return await offline.startRendering();
}

export async function createFullMixBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const bpm = 116;
  const beats = 8;
  const secondsPerBeat = 60 / bpm;
  const totalDuration = beats * secondsPerBeat;
  const sampleRate = ctx.sampleRate;

  const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  // Mix in drums
  const drumBuffer = await createDrumLoopBuffer(ctx);
  const drumSrc = offline.createBufferSource();
  drumSrc.buffer = drumBuffer;
  const drumGain = offline.createGain();
  drumGain.gain.setValueAtTime(0.7, 0);
  drumSrc.connect(drumGain);
  drumGain.connect(offline.destination);
  drumSrc.start(0);

  // Mix in synth chords
  const synthBuffer = await createSynthGrooveBuffer(ctx);
  const synthSrc = offline.createBufferSource();
  synthSrc.buffer = synthBuffer;
  const synthGain = offline.createGain();
  synthGain.gain.setValueAtTime(0.65, 0);
  synthSrc.connect(synthGain);
  synthGain.connect(offline.destination);
  synthSrc.start(0);

  // Add rich funk bassline
  const bassNotes = [
    { t: 0, d: 0.6, f: 73.42 },   // D2
    { t: 0.75, d: 0.4, f: 82.41 }, // E2
    { t: 1.25, d: 0.5, f: 87.31 }, // F2
    { t: 2.0, d: 0.8, f: 98.00 },  // G2
    { t: 3.0, d: 0.7, f: 65.41 },  // C2
    { t: 4.0, d: 0.9, f: 65.41 },  // C2
    { t: 5.25, d: 0.5, f: 73.42 }, // D2
    { t: 6.0, d: 0.8, f: 55.00 },  // A1
    { t: 7.0, d: 0.7, f: 65.41 }   // C2
  ];

  bassNotes.forEach(note => {
    const time = note.t * secondsPerBeat;
    const dur = note.d * secondsPerBeat;

    const osc = offline.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(note.f, time);

    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, time);
    filter.Q.setValueAtTime(3.0, time);

    const gain = offline.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.4, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(offline.destination);

    osc.start(time);
    osc.stop(time + dur);
  });

  return await offline.startRendering();
}

/**
 * Generates an S-curve soft-clipping distortion lookup table for guitar overdrive.
 */
function makeDistortionCurve(amount: number = 18, n_samples: number = 44100): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(n_samples * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve as Float32Array<ArrayBuffer>;
}

/**
 * Helper to safely create and connect a stereo panner in OfflineAudioContext.
 */
function createStereoPannerSafe(offline: OfflineAudioContext, pan: number): StereoPannerNode | null {
  if (offline.createStereoPanner) {
    const panner = offline.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), 0);
    return panner;
  }
  return null;
}

/**
 * Creates a reusable white noise AudioBuffer for drum synthesis.
 */
function createOfflineNoiseBuffer(offline: OfflineAudioContext, duration: number): AudioBuffer {
  const sampleRate = offline.sampleRate;
  const bufferSize = Math.max(1, Math.ceil(sampleRate * duration));
  const buffer = offline.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * High-Energy EDM / Festival House Track (128 BPM, 4 Bars / 16 Beats)
 * - 4-on-the-floor punchy club kick (35 - 150 Hz)
 * - Sidechained pumping supersaw chords (Am -> F -> C -> G) with stereo width
 * - Driving 16th rolling sub-bass
 * - Offbeat open sizzling hi-hats (10 - 14 kHz) and stereo claps on beats 2 & 4
 * - Arpeggiated high-mid pluck synth lead (2 - 6 kHz)
 */
export async function createEDMTrackBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const bpm = 128;
  const beats = 16; // 4 bars of 4/4
  const secondsPerBeat = 60 / bpm;
  const totalDuration = beats * secondsPerBeat;
  const sampleRate = ctx.sampleRate;

  const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  // Master bus compressor / limiter for maximum punch without clipping
  const masterLimiter = offline.createDynamicsCompressor();
  masterLimiter.threshold.setValueAtTime(-1.5, 0);
  masterLimiter.knee.setValueAtTime(0, 0);
  masterLimiter.ratio.setValueAtTime(14, 0);
  masterLimiter.attack.setValueAtTime(0.003, 0);
  masterLimiter.release.setValueAtTime(0.05, 0);
  masterLimiter.connect(offline.destination);

  // Reusable noise buffer for percussions
  const noiseBuff = createOfflineNoiseBuffer(offline, 1.0);

  // 1. Kick Drum (4-on-the-floor on every beat)
  const playEDMKick = (time: number) => {
    // Sub/body drop
    const osc = offline.createOscillator();
    const gain = offline.createGain();
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

    osc.connect(gain);
    gain.connect(masterLimiter);
    osc.start(time);
    osc.stop(time + 0.4);

    // Beater transient click
    const click = offline.createBufferSource();
    click.buffer = noiseBuff;
    const clickFilter = offline.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.setValueAtTime(3200, time);
    const clickGain = offline.createGain();
    clickGain.gain.setValueAtTime(0.4, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(masterLimiter);
    click.start(time);
    click.stop(time + 0.025);
  };

  // 2. EDM Clap / Snare on beats 2 and 4 of each bar
  const playEDMClap = (time: number) => {
    // Pre-clap transients
    [-0.022, -0.011, 0].forEach((offset, idx) => {
      const src = offline.createBufferSource();
      src.buffer = noiseBuff;
      const f = offline.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1400, time + offset);
      f.Q.setValueAtTime(1.8, time + offset);
      const g = offline.createGain();
      const vol = idx === 2 ? 0.65 : 0.25;
      const dur = idx === 2 ? 0.28 : 0.015;
      g.gain.setValueAtTime(vol, time + offset);
      g.gain.exponentialRampToValueAtTime(0.001, time + offset + dur);

      src.connect(f);
      f.connect(g);
      g.connect(masterLimiter);
      src.start(time + offset);
      src.stop(time + offset + dur + 0.01);
    });
  };

  // 3. Offbeat Open Hi-Hat (on the "&" of every beat)
  const playEDMOpenHat = (time: number) => {
    const src = offline.createBufferSource();
    src.buffer = noiseBuff;
    const filter = offline.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(10500, time);
    filter.Q.setValueAtTime(3.0, time);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(0.42, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterLimiter);
    src.start(time);
    src.stop(time + 0.18);
  };

  // 4. 16th Shaker / Closed Hat rhythm
  const playEDMShaker = (time: number, accent: boolean) => {
    const src = offline.createBufferSource();
    src.buffer = noiseBuff;
    const filter = offline.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8500, time);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(accent ? 0.18 : 0.09, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterLimiter);
    src.start(time);
    src.stop(time + 0.05);
  };

  // Populate drum events across 16 beats
  for (let b = 0; b < beats; b++) {
    const beatTime = b * secondsPerBeat;

    // 4-on-the-floor kick
    playEDMKick(beatTime);

    // Claps on beats 2 & 4 (b % 4 === 1 or 3)
    if (b % 4 === 1 || b % 4 === 3) {
      playEDMClap(beatTime);
    }

    // Offbeat open hat on beat + 0.5
    playEDMOpenHat(beatTime + 0.5 * secondsPerBeat);

    // 16th shaker
    for (let s = 0; s < 4; s++) {
      playEDMShaker(beatTime + s * 0.25 * secondsPerBeat, s === 2);
    }
  }

  // 5. Sidechained Supersaw Chords
  // 4-Bar progression: Am7 -> Fmaj7 -> C -> G
  const chordProgression = [
    { bar: 0, freqs: [220.00, 261.63, 329.63, 392.00] }, // Am7
    { bar: 1, freqs: [174.61, 220.00, 261.63, 329.63] }, // Fmaj7
    { bar: 2, freqs: [130.81, 164.81, 196.00, 293.66] }, // C (with D4)
    { bar: 3, freqs: [196.00, 246.94, 293.66, 392.00] }  // G
  ];

  // Master Chord Sidechain Gain Bus
  const chordSidechainGain = offline.createGain();
  chordSidechainGain.connect(masterLimiter);

  // Apply classic EDM "pumping" sidechain ducking on every beat
  for (let b = 0; b < beats; b++) {
    const t = b * secondsPerBeat;
    chordSidechainGain.gain.setValueAtTime(0.12, t);
    chordSidechainGain.gain.linearRampToValueAtTime(0.14, t + 0.05);
    chordSidechainGain.gain.exponentialRampToValueAtTime(0.65, t + 0.32);
    chordSidechainGain.gain.setValueAtTime(0.65, t + secondsPerBeat - 0.01);
  }

  chordProgression.forEach(ch => {
    const barStart = ch.bar * 4 * secondsPerBeat;
    const barDur = 4 * secondsPerBeat;

    ch.freqs.forEach((freq, vIdx) => {
      // 4 detuned sawtooth oscillators per chord voice for wide supersaw
      [-12, -4, 4, 12].forEach((detuneVal, oIdx) => {
        const osc = offline.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, barStart);
        osc.detune.setValueAtTime(detuneVal, barStart);

        const filter = offline.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4200, barStart);
        filter.Q.setValueAtTime(1.6, barStart);

        const voiceGain = offline.createGain();
        voiceGain.gain.setValueAtTime(0.045 / (vIdx + 1), barStart);

        const pan = createStereoPannerSafe(offline, oIdx < 2 ? -0.55 : 0.55);
        osc.connect(filter);
        filter.connect(voiceGain);

        if (pan) {
          voiceGain.connect(pan);
          pan.connect(chordSidechainGain);
        } else {
          voiceGain.connect(chordSidechainGain);
        }

        osc.start(barStart);
        osc.stop(barStart + barDur);
      });
    });
  });

  // 6. Driving 16th Rolling Sub-Bass (with kick sidechain)
  const bassRoots = [
    55.00,  // Bar 1: A1
    43.65,  // Bar 2: F1
    65.41,  // Bar 3: C2
    49.00   // Bar 4: G1
  ];

  const bassBus = offline.createGain();
  bassBus.connect(masterLimiter);

  // Bass sidechain ducking on downbeats
  for (let b = 0; b < beats; b++) {
    const t = b * secondsPerBeat;
    bassBus.gain.setValueAtTime(0.18, t);
    bassBus.gain.exponentialRampToValueAtTime(0.55, t + 0.18);
  }

  for (let bar = 0; bar < 4; bar++) {
    const rootFreq = bassRoots[bar];
    const barTime = bar * 4 * secondsPerBeat;

    for (let step = 0; step < 16; step++) {
      const stepTime = barTime + step * 0.25 * secondsPerBeat;
      const stepDur = 0.22 * secondsPerBeat;

      // Saw + sub sine
      const saw = offline.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(rootFreq, stepTime);

      const sub = offline.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(rootFreq, stepTime);

      const bassFilter = offline.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(280, stepTime);
      bassFilter.Q.setValueAtTime(2.2, stepTime);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.35, stepTime);
      g.gain.exponentialRampToValueAtTime(0.001, stepTime + stepDur);

      saw.connect(bassFilter);
      sub.connect(bassFilter);
      bassFilter.connect(g);
      g.connect(bassBus);

      saw.start(stepTime);
      sub.start(stepTime);
      saw.stop(stepTime + stepDur);
      sub.stop(stepTime + stepDur);
    }
  }

  // 7. Arpeggiated High-Mid Pluck Synth Lead (2 - 6 kHz harmonic sparkle)
  const arpNotes = [
    [440, 523.25, 659.25, 783.99], // Am
    [349.23, 440, 523.25, 659.25], // F
    [523.25, 659.25, 783.99, 1046.50], // C
    [392, 493.88, 587.33, 783.99]  // G
  ];

  for (let bar = 0; bar < 4; bar++) {
    const notes = arpNotes[bar];
    const barTime = bar * 4 * secondsPerBeat;

    for (let s = 0; s < 16; s++) {
      const t = barTime + s * 0.25 * secondsPerBeat;
      const f = notes[s % notes.length];

      const osc = offline.createOscillator();
      osc.type = s % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, t);

      const filter = offline.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4500, t);
      filter.Q.setValueAtTime(2.0, t);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      const pan = createStereoPannerSafe(offline, s % 2 === 0 ? -0.35 : 0.35);
      osc.connect(filter);
      filter.connect(g);

      if (pan) {
        g.connect(pan);
        pan.connect(masterLimiter);
      } else {
        g.connect(masterLimiter);
      }

      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  return await offline.startRendering();
}

/**
 * Driving Modern Rock Track (120 BPM, 4 Bars / 16 Beats)
 * - Acoustic rock drum kit: heavy kick, crack snare (beats 2 & 4), straight 8th rock hats & crash cymbal
 * - Dual-tracked overdriven electric guitars with waveshaped power chords and 4x12 cab emulation
 * - Punchy picked rock bass guitar locked in with the groove
 */
export async function createRockTrackBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const bpm = 120;
  const beats = 16; // 4 bars of 4/4
  const secondsPerBeat = 60 / bpm;
  const totalDuration = beats * secondsPerBeat;
  const sampleRate = ctx.sampleRate;

  const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  // Master bus compressor / limiter for rock glue and transient control
  const masterLimiter = offline.createDynamicsCompressor();
  masterLimiter.threshold.setValueAtTime(-1.5, 0);
  masterLimiter.knee.setValueAtTime(0, 0);
  masterLimiter.ratio.setValueAtTime(10, 0);
  masterLimiter.attack.setValueAtTime(0.004, 0);
  masterLimiter.release.setValueAtTime(0.06, 0);
  masterLimiter.connect(offline.destination);

  const noiseBuff = createOfflineNoiseBuffer(offline, 2.5);
  const distortionCurve = makeDistortionCurve(16);

  // 1. Rock Kick Drum (Heavy low punch + beater click)
  const playRockKick = (time: number) => {
    const osc = offline.createOscillator();
    const gain = offline.createGain();
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(52, time + 0.14);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(masterLimiter);
    osc.start(time);
    osc.stop(time + 0.3);

    // Beater click
    const click = offline.createBufferSource();
    click.buffer = noiseBuff;
    const clickFilter = offline.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(2600, time);
    clickFilter.Q.setValueAtTime(2.0, time);
    const clickGain = offline.createGain();
    clickGain.gain.setValueAtTime(0.45, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(masterLimiter);
    click.start(time);
    click.stop(time + 0.025);
  };

  // 2. Rock Snare Drum (Fat 185Hz body + crisp wire sizzle)
  const playRockSnare = (time: number) => {
    // Body tone
    const osc = offline.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, time);
    osc.frequency.exponentialRampToValueAtTime(125, time + 0.09);
    const oscGain = offline.createGain();
    oscGain.gain.setValueAtTime(0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(oscGain);
    oscGain.connect(masterLimiter);
    osc.start(time);
    osc.stop(time + 0.18);

    // Snare wires
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuff;
    const filter = offline.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, time);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterLimiter);
    noise.start(time);
    noise.stop(time + 0.26);
  };

  // 3. Rock Hi-Hats (Driving straight 8th notes)
  const playRockHat = (time: number, isOpen: boolean) => {
    const dur = isOpen ? 0.15 : 0.05;
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuff;
    const filter = offline.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isOpen ? 7500 : 8800, time);
    filter.Q.setValueAtTime(2.2, time);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(isOpen ? 0.35 : 0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterLimiter);
    noise.start(time);
    noise.stop(time + dur + 0.01);
  };

  // 4. Crash Cymbal on beat 0 (loop downbeat)
  const playRockCrash = (time: number) => {
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuff;
    const filter = offline.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3800, time);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(0.65, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterLimiter);
    noise.start(time);
    noise.stop(time + 2.1);
  };

  // Populate rock drum track
  playRockCrash(0);

  for (let bar = 0; bar < 4; bar++) {
    const barTime = bar * 4 * secondsPerBeat;

    // Rock kick pattern: 1, 2.5, 3, 3.75
    playRockKick(barTime + 0 * secondsPerBeat);
    playRockKick(barTime + 1.5 * secondsPerBeat);
    playRockKick(barTime + 2.0 * secondsPerBeat);
    if (bar % 2 === 1) {
      playRockKick(barTime + 3.5 * secondsPerBeat);
    }

    // Snare on 2 and 4
    playRockSnare(barTime + 1.0 * secondsPerBeat);
    playRockSnare(barTime + 3.0 * secondsPerBeat);

    // Straight 8th-note rock hats
    for (let step = 0; step < 8; step++) {
      const hatTime = barTime + step * 0.5 * secondsPerBeat;
      const isOpen = step % 2 === 1; // Open wash on the "&" of each beat
      playRockHat(hatTime, isOpen);
    }
  }

  // 5. Overdriven Dual-Tracked Electric Rock Guitars
  // 4-Bar progression: A5 -> C5 -> D5 -> F5 / G5
  const guitarBars = [
    { freqs: [110.00, 164.81, 220.00] }, // Bar 1: A5 Power Chord
    { freqs: [130.81, 196.00, 261.63] }, // Bar 2: C5 Power Chord
    { freqs: [146.83, 220.00, 293.66] }, // Bar 3: D5 Power Chord
    { freqs: [87.31, 130.81, 174.61], freqs2: [98.00, 146.83, 196.00] } // Bar 4: F5 -> G5
  ];

  // Rhythmic 8th-note strum pattern per bar:
  // [startBeat, durationBeats, accent]
  const strumPattern: Array<[number, number, boolean]> = [
    [0.0, 0.9, true],   // Downbeat accent strike
    [1.0, 0.4, false],  // 8th chug
    [1.5, 0.4, false],  // 8th chug
    [2.0, 0.8, true],   // Beat 3 accent downstroke
    [2.5, 0.4, false],  // 8th chug
    [3.0, 0.4, false],  // 8th chug
    [3.5, 0.45, true]   // Push into next bar
  ];

  // Create Left and Right guitar channels for dual-tracked stereo wall
  const guitarSides = [
    { pan: -0.72, detuneOffset: 4, gainMult: 0.18 },
    { pan: 0.72, detuneOffset: -4, gainMult: 0.18 }
  ];

  guitarSides.forEach(side => {
    guitarBars.forEach((gBar, barIdx) => {
      const barStart = barIdx * 4 * secondsPerBeat;

      strumPattern.forEach(([strumBeat, strumDur, isAccent]) => {
        const strumTime = barStart + strumBeat * secondsPerBeat;
        const dur = strumDur * secondsPerBeat;

        // In bar 4, switch from F5 to G5 on beat 2
        let chordFreqs = gBar.freqs;
        if (barIdx === 3 && strumBeat >= 2.0 && gBar.freqs2) {
          chordFreqs = gBar.freqs2;
        }

        chordFreqs.forEach((freq, stringIdx) => {
          const osc = offline.createOscillator();
          osc.type = stringIdx === 0 ? 'sawtooth' : 'square';
          osc.frequency.setValueAtTime(freq, strumTime);
          osc.detune.setValueAtTime(side.detuneOffset + (stringIdx % 2 === 0 ? 3 : -3), strumTime);

          // Overdrive distortion stage
          const shaper = offline.createWaveShaper();
          shaper.curve = distortionCurve;
          shaper.oversample = '2x';

          // 4x12 Guitar Cabinet EQ Simulation
          const cabHighpass = offline.createBiquadFilter();
          cabHighpass.type = 'highpass';
          cabHighpass.frequency.setValueAtTime(95, strumTime);

          const cabLowpass = offline.createBiquadFilter();
          cabLowpass.type = 'lowpass';
          cabLowpass.frequency.setValueAtTime(4600, strumTime);
          cabLowpass.Q.setValueAtTime(1.5, strumTime);

          const cabMid = offline.createBiquadFilter();
          cabMid.type = 'peaking';
          cabMid.frequency.setValueAtTime(2400, strumTime);
          cabMid.gain.setValueAtTime(3.5, strumTime);
          cabMid.Q.setValueAtTime(1.8, strumTime);

          // Strum envelope
          const g = offline.createGain();
          const peakVol = side.gainMult * (isAccent ? 1.0 : 0.65) / (stringIdx + 1);
          g.gain.setValueAtTime(0.001, strumTime);
          g.gain.linearRampToValueAtTime(peakVol, strumTime + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, strumTime + dur);

          const pan = createStereoPannerSafe(offline, side.pan);

          osc.connect(shaper);
          shaper.connect(cabHighpass);
          cabHighpass.connect(cabMid);
          cabMid.connect(cabLowpass);
          cabLowpass.connect(g);

          if (pan) {
            g.connect(pan);
            pan.connect(masterLimiter);
          } else {
            g.connect(masterLimiter);
          }

          osc.start(strumTime);
          osc.stop(strumTime + dur + 0.01);
        });
      });
    });
  });

  // 6. Driving Picked Rock Bass Guitar
  const bassNotes = [
    55.00,  // Bar 1: A1
    65.41,  // Bar 2: C2
    73.42,  // Bar 3: D2
    43.65   // Bar 4: F1 -> G1
  ];

  for (let bar = 0; bar < 4; bar++) {
    const barStart = bar * 4 * secondsPerBeat;
    const baseFreq = bassNotes[bar];

    for (let step = 0; step < 8; step++) {
      const noteTime = barStart + step * 0.5 * secondsPerBeat;
      const noteDur = 0.44 * secondsPerBeat;
      const freq = (bar === 3 && step >= 4) ? 49.00 : baseFreq; // G1 on beat 3 of bar 4

      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, noteTime);

      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, noteTime);
      filter.Q.setValueAtTime(2.2, noteTime);

      // Pick attack transient click
      const pick = offline.createOscillator();
      pick.type = 'triangle';
      pick.frequency.setValueAtTime(1800, noteTime);
      const pickGain = offline.createGain();
      pickGain.gain.setValueAtTime(0.2, noteTime);
      pickGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.03);
      pick.connect(pickGain);
      pickGain.connect(masterLimiter);
      pick.start(noteTime);
      pick.stop(noteTime + 0.035);

      const g = offline.createGain();
      g.gain.setValueAtTime(0.42, noteTime);
      g.gain.exponentialRampToValueAtTime(0.001, noteTime + noteDur);

      osc.connect(filter);
      filter.connect(g);
      g.connect(masterLimiter);

      osc.start(noteTime);
      osc.stop(noteTime + noteDur + 0.01);
    }
  }

  return await offline.startRendering();
}
