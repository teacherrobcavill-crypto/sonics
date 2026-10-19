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

    // Ballistics and envelope state
    this.envelopeDb = 0.0;
    this.preGainEnergy300 = 0.0;
    this.avgGr300 = 0.0;
    this.currentGrDb = 0.0;

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
        this.currentInputGainDb = p.inputGainDb;
        this.inputGainLinear = Math.pow(10.0, p.inputGainDb / 20.0);
        this.threshold = p.thresholdDb;
        this.ratio = Math.max(1.0, p.ratio);
        this.slope = (this.ratio >= 50.0) ? 0.0 : (1.0 / this.ratio);
        this.kneeWidth = Math.max(0.0, Math.min(24.0, p.kneeDb || 4.0));

        const attSec = Math.max(0.0001, (p.attackMs || 10.0) * 0.001);
        const relSec = Math.max(0.001, (p.releaseMs || 100.0) * 0.001);
        this.alphaAtt = Math.exp(-1.0 / (attSec * this.fs));
        this.alphaRel = Math.exp(-1.0 / (relSec * this.fs));

        this.makeupGainLinear = Math.pow(10.0, (p.makeupGainDb || 0.0) / 20.0);
        this.outputGainLinear = Math.pow(10.0, (p.outputGainDb || 0.0) / 20.0);
        this.bypassed = Boolean(p.bypassed);
        this.autoGain = Boolean(p.autoGain);
        this.attackMs = p.attackMs || 10.0;
        this.releaseMs = p.releaseMs || 100.0;
      } else if (msg.type === 'setSampleRate') {
        this.fs = msg.sampleRate || 44100;
        this.alpha300 = Math.exp(-1.0 / (0.300 * this.fs));
        this.telemetryInterval = Math.round(this.fs / 60); // 60 FPS update rate
      } else if (msg.type === 'reset') {
        this.envelopeDb = 0.0;
        this.preGainEnergy300 = 0.0;
        this.avgGr300 = 0.0;
        this.currentGrDb = 0.0;
      }
    };
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
      this.autoGainTargetDb = Math.min(24.0, predictedComp * 0.85);

      // Critically damped glide
      const diff = this.autoGainTargetDb - this.autoGainCurrentDb;
      const step = Math.sign(diff) * Math.min(Math.abs(diff * 0.09), 0.70 / (this.fs / 60));
      this.autoGainCurrentDb += step;
      autoGainLinear = Math.pow(10.0, this.autoGainCurrentDb / 20.0);
    } else {
      this.autoGainCurrentDb *= 0.95;
    }

    for (let i = 0; i < numSamples; ++i) {
      const rawL = chL[i];
      const rawR = chR[i];
      const pwrPre = 0.5 * (rawL * rawL + rawR * rawR);
      this.preGainEnergy300 = this.alpha300 * this.preGainEnergy300 + (1.0 - this.alpha300) * pwrPre;

      // 1. Input Trim Gain
      const inL = rawL * this.inputGainLinear;
      const inR = rawR * this.inputGainLinear;

      // Meter accumulators
      this.inPeakL = Math.max(this.inPeakL, Math.abs(inL));
      this.inPeakR = Math.max(this.inPeakR, Math.abs(inR));
      this.inRmsAccumL += inL * inL;
      this.inRmsAccumR += inR * inR;

      // 2. Feed-Forward Sidechain Detection (Stereo Maximum)
      const scLevel = Math.max(Math.abs(inL), Math.abs(inR));
      const scDb = 20.0 * Math.log10(Math.max(scLevel, 1e-6));

      // 3. Static Gain Computer with Soft-Knee
      const targetGrDb = this.computeTargetGainReduction(scDb);

      // 4. Branching Attack / Release Envelope Filter
      if (targetGrDb < this.envelopeDb) {
        this.envelopeDb = this.alphaAtt * this.envelopeDb + (1.0 - this.alphaAtt) * targetGrDb;
      } else {
        this.envelopeDb = this.alphaRel * this.envelopeDb + (1.0 - this.alphaRel) * targetGrDb;
      }

      blockGrAccum += this.envelopeDb;
      this.avgGr300 = this.alpha300 * this.avgGr300 + (1.0 - this.alpha300) * Math.abs(this.envelopeDb);

      // 5. Total VCA Gain
      const grLinear = Math.pow(10.0, this.envelopeDb / 20.0);
      const vcaGain = grLinear * this.makeupGainLinear * autoGainLinear;

      // 6. Output Trim Gain
      const resL = inL * vcaGain * this.outputGainLinear;
      const resR = inR * vcaGain * this.outputGainLinear;

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
          autoGainBoostDb: this.autoGainCurrentDb
        }
      });

      // Reset accumulators
      this.sampleCount = 0;
      this.inPeakL = 0; this.inPeakR = 0;
      this.inRmsAccumL = 0; this.inRmsAccumR = 0;
      this.outPeakL = 0; this.outPeakR = 0;
      this.outRmsAccumL = 0; this.outRmsAccumR = 0;
    }
  }
}

registerProcessor('${COMPRESSOR_WORKLET_NAME}', FeedForwardCompressorProcessor);
`;
