/**
 * AudioWorkletProcessor code string for Feed-Forward VU Compressor
 * Ported sample-for-sample from plugin designs/vu-compressor/dsp/FeedForwardCompressor.hpp
 */

export const COMPRESSOR_WORKLET_NAME = 'feed-forward-compressor-processor';

export const COMPRESSOR_WORKLET_CODE = `
class FeedForwardCompressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.fs = 44100;
    this.alpha300 = Math.exp(-1.0 / (0.300 * 44100));

    // Compressor parameters
    this.inputGainLinear = 1.0;
    this.currentInputGainDb = 0.0;
    this.threshold = -18.0;
    this.ratio = 4.0;
    this.negativeRatio = false;
    this.slope = 1.0 / 4.0;
    this.kneeWidth = 4.0;
    this.alphaAtt = Math.exp(-1.0 / (0.010 * 44100));
    this.alphaRel = Math.exp(-1.0 / (0.100 * 44100));
    this.makeupGainDb = 0.0;
    this.makeupGainLinear = 1.0;
    this.outputGainLinear = 1.0;
    this.bypassed = false;
    this.autoGain = false;

    // Advanced: Parallel Blender & Sidechain Filtering
    this.mixLinear = 1.0;
    this.scHpfHz = 80.0;
    this.scHpfActive = false;
    this.scMidFreq = 2500.0;
    this.scMidGainDb = 0.0;
    this.scMidActive = false;
    this.scMonitor = false;

    // Lookahead Ring Buffer (up to 15ms at 96kHz = ~1440 samples, 2048 size)
    this.lookaheadMs = 0.0;
    this.lookaheadSamples = 0;
    this.lookaheadBufferL = new Float32Array(2048);
    this.lookaheadBufferR = new Float32Array(2048);
    this.lookaheadWriteIdx = 0;

    // Transient Designer DSP state (differential envelope followers)
    this.transientAttack = 0.0;  // -1.0 to +1.0
    this.transientSustain = 0.0; // -1.0 to +1.0
    this.transientRouting = 'post'; // 'pre' (before compressor) or 'post' (after compressor)
    this.tdEnvFast = 0.0;
    this.tdEnvSlow = 0.0;
    this.tdEnvSust = 0.0;
    this.alphaTdFast = Math.exp(-1.0 / (0.003 * 44100)); // 3ms fast transient attack
    this.alphaTdSlow = Math.exp(-1.0 / (0.025 * 44100)); // 25ms slower transient body
    this.alphaTdSust = Math.exp(-1.0 / (0.150 * 44100)); // 150ms sustain body

    // Sidechain Biquad Filter States (Direct Form II Transposed)
    this.hpfB0 = 1.0; this.hpfB1 = 0.0; this.hpfB2 = 0.0;
    this.hpfA1 = 0.0; this.hpfA2 = 0.0;
    this.hpfS1_L = 0.0; this.hpfS2_L = 0.0;
    this.hpfS1_R = 0.0; this.hpfS2_R = 0.0;

    this.midB0 = 1.0; this.midB1 = 0.0; this.midB2 = 0.0;
    this.midA1 = 0.0; this.midA2 = 0.0;
    this.midS1_L = 0.0; this.midS2_L = 0.0;
    this.midS1_R = 0.0; this.midS2_R = 0.0;

    this.updateHpfCoeffs();
    this.updateMidCoeffs();

    // Ballistics and envelope state
    this.envelopeDb = 0.0;
    this.preGainEnergy300 = 0.0;
    this.postGainEnergy300 = 0.0;
    this.avgGr300 = 0.0;
    this.currentGrDb = 0.0;
    this.grMinInInterval = 0.0;
    this.grMaxInInterval = 0.0;

    // Peak & RMS meter accumulators
    this.inPeakL = 0; this.inPeakR = 0;
    this.inRmsAccumL = 0; this.inRmsAccumR = 0;
    this.outPeakL = 0; this.outPeakR = 0;
    this.outRmsAccumL = 0; this.outRmsAccumR = 0;

    // 60Hz telemetry counter (every ~735 samples at 44.1k or ~800 at 48k)
    this.sampleCount = 0;
    this.telemetryInterval = 735;

    // Auto-gain smoothed glide state
    this.autoGainTargetDb = 0.0;
    this.autoGainCurrentDb = 0.0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'setParameters') {
        const p = msg.params;
        this.threshold = p.thresholdDb;
        this.negativeRatio = Boolean(p.negativeRatio);
        this.ratio = Math.max(1.0, Math.abs(p.ratio));

        if (this.negativeRatio) {
          // Negative Ratio Compression: slope = -1.0 / ratio (< 0)
          // Levels exceeding threshold drive output downward below threshold (transient inversion)
          this.slope = -1.0 / this.ratio;
        } else {
          this.slope = (this.ratio >= 50.0) ? 0.0 : (1.0 / this.ratio);
        }

        this.kneeWidth = Math.max(0.0, Math.min(24.0, p.kneeDb || 4.0));
        if (p.makeupGainDb !== undefined) {
          this.makeupGainDb = Math.max(-12.0, Math.min(24.0, p.makeupGainDb));
          this.makeupGainLinear = Math.pow(10.0, this.makeupGainDb / 20.0);
        }

        const attSec = Math.max(0.0001, (p.attackMs || 10.0) * 0.001);
        const relSec = Math.max(0.001, (p.releaseMs || 100.0) * 0.001);
        this.alphaAtt = Math.exp(-1.0 / (attSec * this.fs));
        this.alphaRel = Math.exp(-1.0 / (relSec * this.fs));

        this.bypassed = Boolean(p.bypassed);
        this.autoGain = Boolean(p.autoGain);
        this.attackMs = p.attackMs || 10.0;
        this.releaseMs = p.releaseMs || 100.0;

        // Advanced controls sync
        if (p.mixPercent !== undefined) {
          this.mixLinear = Math.max(0.0, Math.min(100.0, p.mixPercent)) / 100.0;
        }

        if (p.scHpfHz !== undefined && p.scHpfHz !== this.scHpfHz) {
          this.scHpfHz = Math.max(20.0, Math.min(150.0, p.scHpfHz));
          this.updateHpfCoeffs();
        }
        if (p.scHpfActive !== undefined) {
          this.scHpfActive = Boolean(p.scHpfActive);
        }

        let needMidUpdate = false;
        if (p.scMidFreq !== undefined && p.scMidFreq !== this.scMidFreq) {
          this.scMidFreq = Math.max(200.0, Math.min(8000.0, p.scMidFreq));
          needMidUpdate = true;
        }
        if (p.scMidGainDb !== undefined && p.scMidGainDb !== this.scMidGainDb) {
          this.scMidGainDb = Math.max(-12.0, Math.min(12.0, p.scMidGainDb));
          needMidUpdate = true;
        }
        if (needMidUpdate) {
          this.updateMidCoeffs();
        }
        if (p.scMidActive !== undefined) {
          this.scMidActive = Boolean(p.scMidActive);
        }

        if (p.scMonitor !== undefined) {
          this.scMonitor = Boolean(p.scMonitor);
        }

        // Lookahead sync
        if (p.lookaheadMs !== undefined) {
          this.lookaheadMs = Math.max(0.0, Math.min(10.0, p.lookaheadMs));
          this.lookaheadSamples = Math.round(this.lookaheadMs * 0.001 * this.fs);
        }

        // Transient Designer sync
        if (p.transientAttack !== undefined) {
          this.transientAttack = Math.max(-100.0, Math.min(100.0, p.transientAttack)) / 100.0;
        }
        if (p.transientSustain !== undefined) {
          this.transientSustain = Math.max(-100.0, Math.min(100.0, p.transientSustain)) / 100.0;
        }
        if (p.transientRouting !== undefined) {
          this.transientRouting = p.transientRouting === 'pre' ? 'pre' : 'post';
        }
      } else if (msg.type === 'setSampleRate') {
        this.fs = msg.sampleRate || 44100;
        this.alpha300 = Math.exp(-1.0 / (0.300 * this.fs));
        this.telemetryInterval = Math.round(this.fs / 60); // 60 FPS update rate
        this.lookaheadSamples = Math.round(this.lookaheadMs * 0.001 * this.fs);
        this.alphaTdFast = Math.exp(-1.0 / (0.003 * this.fs));
        this.alphaTdSlow = Math.exp(-1.0 / (0.025 * this.fs));
        this.alphaTdSust = Math.exp(-1.0 / (0.150 * this.fs));
        this.updateHpfCoeffs();
        this.updateMidCoeffs();
      } else if (msg.type === 'reset') {
        this.envelopeDb = 0.0;
        this.preGainEnergy300 = 0.0;
        this.avgGr300 = 0.0;
        this.currentGrDb = 0.0;
        this.hpfS1_L = 0; this.hpfS2_L = 0; this.hpfS1_R = 0; this.hpfS2_R = 0;
        this.midS1_L = 0; this.midS2_L = 0; this.midS1_R = 0; this.midS2_R = 0;
        this.tdEnvFast = 0; this.tdEnvSlow = 0; this.tdEnvSust = 0;
        this.lookaheadBufferL.fill(0);
        this.lookaheadBufferR.fill(0);
      }
    };
  }

  updateHpfCoeffs() {
    const fc = Math.max(20.0, Math.min(150.0, this.scHpfHz));
    const w0 = 2.0 * Math.PI * fc / this.fs;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2.0 * 0.7071);
    const b0 = (1.0 + cosw0) * 0.5;
    const b1 = -(1.0 + cosw0);
    const b2 = (1.0 + cosw0) * 0.5;
    const a0 = 1.0 + alpha;
    const a1 = -2.0 * cosw0;
    const a2 = 1.0 - alpha;
    this.hpfB0 = b0 / a0;
    this.hpfB1 = b1 / a0;
    this.hpfB2 = b2 / a0;
    this.hpfA1 = a1 / a0;
    this.hpfA2 = a2 / a0;
  }

  updateMidCoeffs() {
    const f0 = Math.max(200.0, Math.min(8000.0, this.scMidFreq));
    const gainDb = Math.max(-12.0, Math.min(12.0, this.scMidGainDb));
    const A = Math.pow(10.0, gainDb / 40.0);
    const w0 = 2.0 * Math.PI * f0 / this.fs;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const Q = 1.2;
    const alpha = sinw0 / (2.0 * Q);
    const b0 = 1.0 + alpha * A;
    const b1 = -2.0 * cosw0;
    const b2 = 1.0 - alpha * A;
    const a0 = 1.0 + alpha / A;
    const a1 = -2.0 * cosw0;
    const a2 = 1.0 - alpha / A;
    this.midB0 = b0 / a0;
    this.midB1 = b1 / a0;
    this.midB2 = b2 / a0;
    this.midA1 = a1 / a0;
    this.midA2 = a2 / a0;
  }

  processHpfL(x) {
    const y = this.hpfB0 * x + this.hpfS1_L;
    this.hpfS1_L = this.hpfB1 * x - this.hpfA1 * y + this.hpfS2_L;
    this.hpfS2_L = this.hpfB2 * x - this.hpfA2 * y;
    return y;
  }

  processHpfR(x) {
    const y = this.hpfB0 * x + this.hpfS1_R;
    this.hpfS1_R = this.hpfB1 * x - this.hpfA1 * y + this.hpfS2_R;
    this.hpfS2_R = this.hpfB2 * x - this.hpfA2 * y;
    return y;
  }

  processMidL(x) {
    const y = this.midB0 * x + this.midS1_L;
    this.midS1_L = this.midB1 * x - this.midA1 * y + this.midS2_L;
    this.midS2_L = this.midB2 * x - this.midA2 * y;
    return y;
  }

  processMidR(x) {
    const y = this.midB0 * x + this.midS1_R;
    this.midS1_R = this.midB1 * x - this.midA1 * y + this.midS2_R;
    this.midS2_R = this.midB2 * x - this.midA2 * y;
    return y;
  }

  computeTargetGainReduction(sidechainDb) {
    const halfKnee = this.kneeWidth * 0.5;
    let gr = 0.0;

    if (this.kneeWidth <= 0.001) {
      if (sidechainDb > this.threshold) {
        gr = (this.slope - 1.0) * (sidechainDb - this.threshold);
      }
    } else {
      const lowerBound = this.threshold - halfKnee;
      const upperBound = this.threshold + halfKnee;

      if (sidechainDb > lowerBound) {
        if (sidechainDb >= upperBound) {
          gr = (this.slope - 1.0) * (sidechainDb - this.threshold);
        } else {
          const delta = sidechainDb - lowerBound;
          gr = (this.slope - 1.0) * (delta * delta) / (2.0 * this.kneeWidth);
        }
      }
    }

    // Safety floor on maximum gain reduction: clamp to -48.0 dB to prevent complete silence on spikes
    return Math.max(-48.0, gr);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const numChannels = input.length;
    const numSamples = input[0].length;
    const chL = input[0];
    const chR = numChannels > 1 ? input[1] : chL;

    const outL = output[0];
    const outR = numChannels > 1 ? output[1] : outL;

    if (this.bypassed) {
      for (let i = 0; i < numSamples; ++i) {
        const sL = chL[i];
        const sR = chR[i];
        outL[i] = sL;
        if (numChannels > 1) outR[i] = sR;

        // Meter tracking while bypassed
        this.inPeakL = Math.max(this.inPeakL, Math.abs(sL));
        this.inPeakR = Math.max(this.inPeakR, Math.abs(sR));
        this.inRmsAccumL += sL * sL;
        this.inRmsAccumR += sR * sR;
        this.outPeakL = this.inPeakL;
        this.outPeakR = this.inPeakR;
        this.outRmsAccumL = this.inRmsAccumL;
        this.outRmsAccumR = this.inRmsAccumR;
      }
      this.currentGrDb = 0.0;
      this.grMinInInterval = 0.0;
      this.grMaxInInterval = 0.0;
      this.flushTelemetry(numSamples);
      return true;
    }

    let blockGrAccum = 0.0;

    // Auto-gain dynamic calculation: matches perceived loudness taking into account
    // compression depth, negative ratio transient inversion, and transient designer shaping.
    let autoGainLinear = 1.0;
    if (this.autoGain) {
      if (this.preGainEnergy300 > 1e-5 && this.postGainEnergy300 > 1e-7) {
        // True energy ratio between dry uncompressed input and shaped processed output
        const energyRatio = this.preGainEnergy300 / this.postGainEnergy300;
        const deficitDb = 10.0 * Math.log10(Math.max(1e-4, energyRatio));

        // When negative ratio or transient shaping causes heavy ducking or huge boosts,
        // deficitDb accurately reflects the loudness difference.
        // Also combine with feed-forward GR expectation for fast transient recovery:
        const etaAtt = 1.12 - 0.69 * (Math.log10(Math.max(0.1, this.attackMs)) / 3.0);
        const etaRel = Math.pow(Math.max(10.0, this.releaseMs) / 100.0, 0.22);
        const predictedComp = this.avgGr300 * Math.max(0.4, Math.min(1.6, etaAtt * etaRel));

        // Blend 70% true integrated energy matching + 30% feedforward GR prediction
        const blendedTarget = 0.70 * deficitDb + 0.30 * predictedComp;
        this.autoGainTargetDb = Math.max(-12.0, Math.min(24.0, blendedTarget));
      } else if (this.avgGr300 > 0.01) {
        const etaAtt = 1.12 - 0.69 * (Math.log10(Math.max(0.1, this.attackMs)) / 3.0);
        const etaRel = Math.pow(Math.max(10.0, this.releaseMs) / 100.0, 0.22);
        this.autoGainTargetDb = Math.min(24.0, this.avgGr300 * Math.max(0.4, Math.min(1.6, etaAtt * etaRel)));
      } else {
        this.autoGainTargetDb *= 0.98;
      }

      // Smooth glide (150ms time constant) to prevent clicking or rapid pumping
      const alphaGlide = Math.exp(-numSamples / (0.150 * this.fs));
      this.autoGainCurrentDb = alphaGlide * this.autoGainCurrentDb + (1.0 - alphaGlide) * this.autoGainTargetDb;
      autoGainLinear = Math.pow(10.0, this.autoGainCurrentDb / 20.0);
    } else {
      this.autoGainTargetDb = 0.0;
      this.autoGainCurrentDb *= 0.95;
      autoGainLinear = Math.pow(10.0, this.autoGainCurrentDb / 20.0);
    }

    for (let i = 0; i < numSamples; ++i) {
      const rawL = chL[i];
      const rawR = chR[i];
      const pwrPre = 0.5 * (rawL * rawL + rawR * rawR);
      this.preGainEnergy300 = this.alpha300 * this.preGainEnergy300 + (1.0 - this.alpha300) * pwrPre;

      // 1. Direct Input & Lookahead Ring Buffer Storage
      const inL = rawL;
      const inR = rawR;

      // Store in lookahead delay ring buffer for the audio path
      const bufLen = 2048;
      const wIdx = this.lookaheadWriteIdx;
      this.lookaheadBufferL[wIdx] = inL;
      this.lookaheadBufferR[wIdx] = inR;

      // Delayed audio read index for VCA application
      let delayedL = inL;
      let delayedR = inR;
      if (this.lookaheadSamples > 0) {
        const rIdx = (wIdx - this.lookaheadSamples + bufLen) % bufLen;
        delayedL = this.lookaheadBufferL[rIdx];
        delayedR = this.lookaheadBufferR[rIdx];
      }
      this.lookaheadWriteIdx = (wIdx + 1) % bufLen;

      // Meter accumulators
      this.inPeakL = Math.max(this.inPeakL, Math.abs(inL));
      this.inPeakR = Math.max(this.inPeakR, Math.abs(inR));
      this.inRmsAccumL += inL * inL;
      this.inRmsAccumR += inR * inR;

      // 2. Pre-Compressor Transient Designer (if routing is set to 'pre')
      let preCompL = delayedL;
      let preCompR = delayedR;
      let tdGainPre = 1.0;

      if (this.transientRouting === 'pre') {
        if (Math.abs(this.transientAttack) > 0.005 || Math.abs(this.transientSustain) > 0.005) {
          const monoAbs = 0.5 * (Math.abs(preCompL) + Math.abs(preCompR));
          this.tdEnvFast = this.alphaTdFast * this.tdEnvFast + (1.0 - this.alphaTdFast) * monoAbs;
          this.tdEnvSlow = this.alphaTdSlow * this.tdEnvSlow + (1.0 - this.alphaTdSlow) * monoAbs;
          this.tdEnvSust = this.alphaTdSust * this.tdEnvSust + (1.0 - this.alphaTdSust) * monoAbs;

          const attackDiff = Math.max(0.0, this.tdEnvFast - this.tdEnvSlow);
          const normalizedDiff = attackDiff / (this.tdEnvSlow + 1e-4);

          const signA = Math.sign(this.transientAttack);
          const shapedAttack = signA * Math.pow(Math.abs(this.transientAttack), 1.8);
          const attackGainMod = 1.0 + (shapedAttack * normalizedDiff * 1.5);
          const sustainGainMod = 1.0 + (this.transientSustain * (this.tdEnvSust / (this.tdEnvFast + 1e-4)) * 0.7);

          tdGainPre = Math.max(0.05, Math.min(3.0, attackGainMod * sustainGainMod));
          preCompL *= tdGainPre;
          preCompR *= tdGainPre;
        }
      }

      // 3. Feed-Forward Sidechain Filtering (HPF & Sweepable Mid Band)
      // When Transient Designer is PRE, the sidechain detector receives the shaped transients
      let scL = this.transientRouting === 'pre' ? inL * tdGainPre : inL;
      let scR = this.transientRouting === 'pre' ? inR * tdGainPre : inR;

      if (this.scHpfActive) {
        scL = this.processHpfL(scL);
        scR = this.processHpfR(scR);
      }

      if (this.scMidActive && Math.abs(this.scMidGainDb) > 0.05) {
        scL = this.processMidL(scL);
        scR = this.processMidR(scR);
      }

      // 4. Sidechain Detection (Stereo Maximum of Filtered Signal)
      const scLevel = Math.max(Math.abs(scL), Math.abs(scR));
      const scDb = 20.0 * Math.log10(Math.max(scLevel, 1e-6));

      // 5. Static Gain Computer with Soft-Knee
      const targetGrDb = this.computeTargetGainReduction(scDb);

      // 6. Branching Attack / Release Envelope Filter
      if (targetGrDb < this.envelopeDb) {
        this.envelopeDb = this.alphaAtt * this.envelopeDb + (1.0 - this.alphaAtt) * targetGrDb;
      } else {
        this.envelopeDb = this.alphaRel * this.envelopeDb + (1.0 - this.alphaRel) * targetGrDb;
      }

      blockGrAccum += this.envelopeDb;
      this.grMinInInterval = Math.min(this.grMinInInterval, this.envelopeDb);
      this.grMaxInInterval = Math.max(this.grMaxInInterval, this.envelopeDb);
      this.avgGr300 = this.alpha300 * this.avgGr300 + (1.0 - this.alpha300) * Math.abs(this.envelopeDb);

      // 7. Base VCA Gain Reduction (Linear factor)
      const grLinear = Math.pow(10.0, this.envelopeDb / 20.0);

      // 8. Process Wet Signal (Compressor VCA & Transient Designer)
      let wetL, wetR;
      if (this.transientRouting === 'pre') {
        // PRE mode: preCompL/R was shaped by TD, then compressed by VCA
        wetL = preCompL * grLinear;
        wetR = preCompR * grLinear;
      } else {
        // POST mode: delayedL/R compressed by VCA first
        let compL = delayedL * grLinear;
        let compR = delayedR * grLinear;

        // Then Transient Designer shapes the post-compressed audio
        if (Math.abs(this.transientAttack) > 0.005 || Math.abs(this.transientSustain) > 0.005) {
          const monoAbs = 0.5 * (Math.abs(compL) + Math.abs(compR));
          this.tdEnvFast = this.alphaTdFast * this.tdEnvFast + (1.0 - this.alphaTdFast) * monoAbs;
          this.tdEnvSlow = this.alphaTdSlow * this.tdEnvSlow + (1.0 - this.alphaTdSlow) * monoAbs;
          this.tdEnvSust = this.alphaTdSust * this.tdEnvSust + (1.0 - this.alphaTdSust) * monoAbs;

          const attackDiff = Math.max(0.0, this.tdEnvFast - this.tdEnvSlow);
          const normalizedDiff = attackDiff / (this.tdEnvSlow + 1e-4);

          const signA = Math.sign(this.transientAttack);
          const shapedAttack = signA * Math.pow(Math.abs(this.transientAttack), 1.8);
          const attackGainMod = 1.0 + (shapedAttack * normalizedDiff * 1.5);
          const sustainGainMod = 1.0 + (this.transientSustain * (this.tdEnvSust / (this.tdEnvFast + 1e-4)) * 0.7);

          const tdGainPost = Math.max(0.05, Math.min(3.0, attackGainMod * sustainGainMod));
          compL *= tdGainPost;
          compR *= tdGainPost;
        }

        wetL = compL;
        wetR = compR;
      }

      // 9. Parallel Blender: blends the combined (compression + transient designer) wet signal
      // with the original clean input signal (delayedL/R aligned with lookahead)
      let resL, resR;
      if (this.scMonitor) {
        // Monitor mode: engineer auditions the filtered sidechain detection path
        resL = scL;
        resR = scR;
      } else {
        if (this.mixLinear < 0.999) {
          resL = (1.0 - this.mixLinear) * delayedL + this.mixLinear * wetL;
          resR = (1.0 - this.mixLinear) * delayedR + this.mixLinear * wetR;
        } else {
          resL = wetL;
          resR = wetR;
        }
      }

      // Track uncompensated processed energy for Auto Level calculation
      const pwrPost = 0.5 * (resL * resL + resR * resR);
      this.postGainEnergy300 = this.alpha300 * this.postGainEnergy300 + (1.0 - this.alpha300) * pwrPost;

      // 9. Apply Auto-Gain and Manual Makeup Gain
      if (!this.scMonitor) {
        const totalGain = (this.autoGain ? autoGainLinear : 1.0) * this.makeupGainLinear;
        resL *= totalGain;
        resR *= totalGain;
      }

      // 10. Failsafe Ear-Protection Ceiling (-0.5 dBFS / 0.95 amplitude)
      resL = Math.max(-0.95, Math.min(0.95, resL));
      resR = Math.max(-0.95, Math.min(0.95, resR));

      outL[i] = resL;
      if (numChannels > 1) outR[i] = resR;

      this.outPeakL = Math.max(this.outPeakL, Math.abs(resL));
      this.outPeakR = Math.max(this.outPeakR, Math.abs(resR));
      this.outRmsAccumL += resL * resL;
      this.outRmsAccumR += resR * resR;
    }

    this.currentGrDb = blockGrAccum / numSamples;
    this.flushTelemetry(numSamples);

    return true;
  }

  flushTelemetry(numSamples) {
    this.sampleCount += numSamples;
    if (this.sampleCount >= this.telemetryInterval) {
      const inRmsL = 20.0 * Math.log10(Math.max(1e-5, Math.sqrt(this.inRmsAccumL / this.sampleCount)));
      const inRmsR = 20.0 * Math.log10(Math.max(1e-5, Math.sqrt(this.inRmsAccumR / this.sampleCount)));
      const outRmsL = 20.0 * Math.log10(Math.max(1e-5, Math.sqrt(this.outRmsAccumL / this.sampleCount)));
      const outRmsR = 20.0 * Math.log10(Math.max(1e-5, Math.sqrt(this.outRmsAccumR / this.sampleCount)));

      const inPeakDbL = 20.0 * Math.log10(Math.max(1e-5, this.inPeakL));
      const inPeakDbR = 20.0 * Math.log10(Math.max(1e-5, this.inPeakR));
      const outPeakDbL = 20.0 * Math.log10(Math.max(1e-5, this.outPeakL));
      const outPeakDbR = 20.0 * Math.log10(Math.max(1e-5, this.outPeakR));

      const inPeakMax = Math.max(inPeakDbL, inPeakDbR);
      const outPeakMax = Math.max(outPeakDbL, outPeakDbR);
      const inRmsMax = Math.max(inRmsL, inRmsR);
      const outRmsMax = Math.max(outRmsL, outRmsR);

      const isSignalPresent = inPeakMax > -52.0;
      const inputCrestDb = isSignalPresent ? Math.max(0.0, inPeakMax - inRmsMax) : 0.0;
      const outputCrestDb = isSignalPresent ? Math.max(0.0, outPeakMax - outRmsMax) : 0.0;
      const crestReductionDb = isSignalPresent ? (inputCrestDb - outputCrestDb) : 0.0;
      const envelopeSwingDb = isSignalPresent ? Math.abs(this.grMaxInInterval - this.grMinInInterval) : 0.0;

      this.port.postMessage({
        type: 'telemetry',
        data: {
          inputPeakL: inPeakDbL,
          inputPeakR: inPeakDbR,
          inputRmsL: inRmsL,
          inputRmsR: inRmsR,
          outputPeakL: outPeakDbL,
          outputPeakR: outPeakDbR,
          outputRmsL: outRmsL,
          outputRmsR: outRmsR,
          gainReductionDb: this.currentGrDb,
          avgGainReductionDb: this.avgGr300,
          autoGainBoostDb: this.autoGainCurrentDb,
          isSignalPresent,
          inputCrestDb,
          outputCrestDb,
          crestReductionDb,
          envelopeSwingDb
        }
      });

      // Reset accumulators
      this.sampleCount = 0;
      this.inPeakL = 0; this.inPeakR = 0;
      this.inRmsAccumL = 0; this.inRmsAccumR = 0;
      this.outPeakL = 0; this.outPeakR = 0;
      this.outRmsAccumL = 0; this.outRmsAccumR = 0;
      this.grMinInInterval = this.envelopeDb;
      this.grMaxInInterval = this.envelopeDb;
    }
  }
}

registerProcessor('${COMPRESSOR_WORKLET_NAME}', FeedForwardCompressorProcessor);
`;
