import { CompressorParams, CompressorTelemetry, DEFAULT_COMPRESSOR_PARAMS } from '../../types/compressor';
import { COMPRESSOR_WORKLET_CODE, COMPRESSOR_WORKLET_NAME } from './compressorWorkletCode';
import { VUMeterBallistics } from '../../utils/compressorBallistics';

export class FeedForwardCompressorNode {
  private ctx: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private ballistics: VUMeterBallistics;
  private telemetryCallback: ((t: CompressorTelemetry) => void) | null = null;
  private lastTelemetryTime: number = 0;
  private currentParams: CompressorParams = { ...DEFAULT_COMPRESSOR_PARAMS };
  private isReady: boolean = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.ballistics = new VUMeterBallistics();
    this.lastTelemetryTime = performance.now();
  }

  public async initialize(): Promise<void> {
    if (this.isReady && this.workletNode) return;

    try {
      // Create worklet blob URL to ensure sample-accurate execution without cross-origin issues
      const blob = new Blob([COMPRESSOR_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      this.workletNode = new AudioWorkletNode(this.ctx, COMPRESSOR_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.workletNode.port.postMessage({
        type: 'setSampleRate',
        sampleRate: this.ctx.sampleRate
      });

      this.workletNode.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'telemetry') {
          const now = performance.now();
          const dt = Math.max(0.001, (now - this.lastTelemetryTime) * 0.001);
          this.lastTelemetryTime = now;

          // Physical VU needle galvanometer update
          const targetNeedle = VUMeterBallistics.mapGainReductionToNormalized(msg.data.gainReductionDb);
          this.ballistics.update(targetNeedle, dt);

          const telemetry: CompressorTelemetry = {
            ...msg.data,
            vuNeedlePosition: this.ballistics.getPosition()
          };

          if (this.telemetryCallback) {
            this.telemetryCallback(telemetry);
          }
        }
      };

      this.setParameters(this.currentParams);
      this.isReady = true;
    } catch (err) {
      console.error('Failed to initialize FeedForwardCompressorNode:', err);
    }
  }

  public getInputNode(): AudioNode | null {
    return this.workletNode;
  }

  public getOutputNode(): AudioNode | null {
    return this.workletNode;
  }

  public setParameters(params: Partial<CompressorParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setParameters',
        params: this.currentParams
      });
    }
  }

  public setBypassed(bypassed: boolean): void {
    this.setParameters({ bypassed });
  }

  public setAutoGain(autoGain: boolean): void {
    this.setParameters({ autoGain });
  }

  public onTelemetry(callback: (t: CompressorTelemetry) => void): void {
    this.telemetryCallback = callback;
  }

  public reset(): void {
    this.ballistics.reset();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'reset' });
    }
  }
}
