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
    this.slope = 1.0 / 4.0;
    this.kneeWidth = 4.0;
    this.alphaAtt = Math.exp(-1.0 / (0.010 * 44100));
    this.alphaRel = Math.exp(-1.0 / (0.100 * 44100));
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
        this.ratio = Math.max(1.0, p.ratio);
        this.slope = (this.ratio >= 50.0) ? 0.0 : (1.0 / this.ratio);
        this.kneeWidth = Math.max(0.0, Math.min(24.0, p.kneeDb || 4.0));

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
      } else if (msg.type === 'setSampleRate') {
        this.fs = msg.sampleRate || 44100;
        this.alpha300 = Math.exp(-1.0 / (0.300 * this.fs));
        this.telemetryInterval = Math.round(this.fs / 60); // 60 FPS update rate
        this.updateHpfCoeffs();
        this.updateMidCoeffs();
      } else if (msg.type === 'reset') {
        this.envelopeDb = 0.0;
        this.preGainEnergy300 = 0.0;
        this.avgGr300 = 0.0;
        this.currentGrDb = 0.0;
        this.hpfS1_L = 0; this.hpfS2_L = 0; this.hpfS1_R = 0; this.hpfS2_R = 0;
        this.midS1_L = 0; this.midS2_L = 0; this.midS1_R = 0; this.midS2_R = 0;
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
    if (this.kneeWidth <= 0.001) {
      if (sidechainDb > this.threshold) {
        return (this.slope - 1.0) * (sidechainDb - this.threshold);
      }
      return 0.0;
    }

    const lowerBound = this.threshold - halfKnee;
    const upperBound = this.threshold + halfKnee;

    if (sidechainDb <= lowerBound) return 0.0;
    if (sidechainDb >= upperBound) return (this.slope - 1.0) * (sidechainDb - this.threshold);

    const delta = sidechainDb - lowerBound;
    return (this.slope - 1.0) * (delta * delta) / (2.0 * this.kneeWidth);
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

    // Auto-gain dynamic calculation
    let autoGainLinear = 1.0;
    if (this.autoGain && this.avgGr300 > 0.01) {
      // Attack efficiency factor: fast attack catches 100% of transients, slow lets spikes through
      const etaAtt = 1.12 - 0.69 * (Math.log10(Math.max(0.1, this.attackMs)) / 3.0);
      // Release density factor: slow release clamps continuously
      const etaRel = Math.pow(Math.max(10.0, this.releaseMs) / 100.0, 0.22);
      const predictedComp = this.avgGr300 * Math.max(0.4, Math.min(1.6, etaAtt * etaRel));
      this.autoGainTargetDb = Math.min(18.0, predictedComp * 0.90);

      // Critically damped glide: smooth 150ms time constant
      const diff = this.autoGainTargetDb - this.autoGainCurrentDb;
      const step = Math.sign(diff) * Math.min(Math.abs(diff * 0.06), 0.50 / (this.fs / 60));
      this.autoGainCurrentDb += step;
      autoGainLinear = Math.pow(10.0, this.autoGainCurrentDb / 20.0);
    } else {
      this.autoGainCurrentDb *= 0.92;
    }

    for (let i = 0; i < numSamples; ++i) {
      const rawL = chL[i];
      const rawR = chR[i];
      const pwrPre = 0.5 * (rawL * rawL + rawR * rawR);
      this.preGainEnergy300 = this.alpha300 * this.preGainEnergy300 + (1.0 - this.alpha300) * pwrPre;

      // 1. Direct Input
      const inL = rawL;
      const inR = rawR;

      // Meter accumulators
      this.inPeakL = Math.max(this.inPeakL, Math.abs(inL));
      this.inPeakR = Math.max(this.inPeakR, Math.abs(inR));
      this.inRmsAccumL += inL * inL;
      this.inRmsAccumR += inR * inR;

      // 2. Feed-Forward Sidechain Filtering (HPF & Sweepable Mid Band)
      let scL = inL;
      let scR = inR;

      if (this.scHpfActive) {
        scL = this.processHpfL(scL);
        scR = this.processHpfR(scR);
      }

      if (this.scMidActive && Math.abs(this.scMidGainDb) > 0.05) {
        scL = this.processMidL(scL);
        scR = this.processMidR(scR);
      }

      // 3. Sidechain Detection (Stereo Maximum of Filtered Signal)
      const scLevel = Math.max(Math.abs(scL), Math.abs(scR));
      const scDb = 20.0 * Math.log10(Math.max(scLevel, 1e-6));

      // 4. Static Gain Computer with Soft-Knee
      const targetGrDb = this.computeTargetGainReduction(scDb);

      // 5. Branching Attack / Release Envelope Filter
      if (targetGrDb < this.envelopeDb) {
        this.envelopeDb = this.alphaAtt * this.envelopeDb + (1.0 - this.alphaAtt) * targetGrDb;
      } else {
        this.envelopeDb = this.alphaRel * this.envelopeDb + (1.0 - this.alphaRel) * targetGrDb;
      }

      blockGrAccum += this.envelopeDb;
      this.grMinInInterval = Math.min(this.grMinInInterval, this.envelopeDb);
      this.grMaxInInterval = Math.max(this.grMaxInInterval, this.envelopeDb);
      this.avgGr300 = this.alpha300 * this.avgGr300 + (1.0 - this.alpha300) * Math.abs(this.envelopeDb);

      // 6. Total VCA Gain
      const grLinear = Math.pow(10.0, this.envelopeDb / 20.0);
      const vcaGain = grLinear * autoGainLinear;

      // 7. Parallel Blender (NY style) & Sidechain Monitor Routing
      let resL, resR;
      if (this.scMonitor) {
        // Monitor mode: engineer auditions the filtered sidechain detection path
        resL = scL;
        resR = scR;
      } else {
        const wetL = inL * vcaGain;
        const wetR = inR * vcaGain;

        if (this.mixLinear < 0.999) {
          // Parallel blend: dry uncompressed + wet compressed
          resL = (1.0 - this.mixLinear) * inL + this.mixLinear * wetL;
          resR = (1.0 - this.mixLinear) * inR + this.mixLinear * wetR;
        } else {
          resL = wetL;
          resR = wetR;
        }
      }

      // 8. Failsafe Ear-Protection Ceiling (-0.5 dBFS / 0.95 amplitude)
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
