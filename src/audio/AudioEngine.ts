import { AudioSourceType, FilterParams, FilterType, StemType, StemMixBalance } from '../types';
import {
  saveCustomAudioToStorage,
  getCustomAudioFromStorage,
  clearCustomAudioFromStorage
} from '../utils/audioStorage';
import { createPinkNoiseBuffer, createWhiteNoiseBuffer } from './NoiseGenerator';
import {
  createDrumLoopBuffer,
  createFullMixBuffer,
  createSynthGrooveBuffer,
  createEDMTrackBuffer,
  createRockTrackBuffer
} from './SynthLoops';

export type ListeningMode = 'bypass' | 'target' | 'user';

export const STEM_TYPES: StemType[] = ['drums', 'bass', 'other', 'vocals'];

export const STEM_FOLDER_MAP: Partial<Record<AudioSourceType, string>> = {
  dance_pop: 'dance-pop',
  alt_rock: 'alt-rock',
  electronic_pop: 'electronic-pop',
  hard_rock: 'hard-rock',
  hip_hop: 'hip-hop-rnb'
};

// Cloudflare R2 Bucket Public URL for audio stems and full tracks
export const R2_AUDIO_BASE_URL = 'https://pub-97abab3a449c46dbaf20a8bf14597f3e.r2.dev/';

const AUDIO_TRACK_FILENAMES: Record<Extract<AudioSourceType, 'dance_pop' | 'alt_rock' | 'electronic_pop' | 'hard_rock' | 'hip_hop'>, string> = {
  dance_pop: 'dance-pop.mp3',
  alt_rock: 'alt-rock.mp3',
  electronic_pop: 'electronic-pop.mp3',
  hard_rock: 'hard-rock.mp3',
  hip_hop: 'hip-hop-rnb.mp3'
};

const AUDIO_TRACK_URLS: Partial<Record<AudioSourceType, string>> = {
  dance_pop: `${R2_AUDIO_BASE_URL}dance-pop.mp3`,
  alt_rock: `${R2_AUDIO_BASE_URL}alt-rock.mp3`,
  electronic_pop: `${R2_AUDIO_BASE_URL}electronic-pop.mp3`,
  hard_rock: `${R2_AUDIO_BASE_URL}hard-rock.mp3`,
  hip_hop: `${R2_AUDIO_BASE_URL}hip-hop-rnb.mp3`
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Audio Buffers
  private buffers: Map<AudioSourceType, AudioBuffer> = new Map();
  private customBuffer: AudioBuffer | null = null;
  private customFileName: string | null = null;
  private currentSourceType: AudioSourceType = 'dance_pop';

  // Playback nodes
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;

  // Mono mode for clean, phase-pure spatial ear training (Pan Master)
  private isMonoMode = false;
  private monoBuffers: Map<AudioSourceType, AudioBuffer> = new Map();

  private getMonoBuffer(sourceType: AudioSourceType, rawBuffer: AudioBuffer): AudioBuffer {
    if (rawBuffer.numberOfChannels === 1) return rawBuffer;
    if (!this.ctx) return rawBuffer;

    const cached = this.monoBuffers.get(sourceType);
    if (cached && cached.length === rawBuffer.length) {
      return cached;
    }

    const monoBuffer = this.ctx.createBuffer(1, rawBuffer.length, rawBuffer.sampleRate);
    const monoData = monoBuffer.getChannelData(0);
    const numChannels = rawBuffer.numberOfChannels;
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(rawBuffer.getChannelData(c));
    }

    const scale = 1 / numChannels;
    for (let i = 0; i < rawBuffer.length; i++) {
      let sum = 0;
      for (let c = 0; c < numChannels; c++) {
        sum += channels[c][i];
      }
      monoData[i] = sum * scale;
    }

    this.monoBuffers.set(sourceType, monoBuffer);
    return monoBuffer;
  }

  // Signal Routing Nodes
  private sourceOutGain: GainNode | null = null;

  // Mode paths
  private bypassGain: GainNode | null = null;
  private targetGain: GainNode | null = null;
  private userGain: GainNode | null = null;
  private bypassLevel: number = 1.0;
  private targetLevel: number = 1.0;
  private userLevel: number = 1.0;

  // Filters
  // Target Filters (supports up to 16 cascaded biquads: 8 for Filter 1, 8 for Filter 2, for slopes up to 96dB/oct)
  private targetChain: BiquadFilterNode[] = [];
  private targetPanner: StereoPannerNode | null = null;
  private targetFilterActive = true;

  // Invert / Series Correction Mode (routes Target output into User chain for Correct/Invert ear training)
  private isSeriesCorrectionMode: boolean = false;
  private userSourceDirectGain: GainNode | null = null;
  private userSourceSeriesGain: GainNode | null = null;

  // User Filters (supports up to 16 cascaded biquads: 8 for Filter 1, 8 for Filter 2)
  private userChain: BiquadFilterNode[] = [];
  private userPanner: StereoPannerNode | null = null;

  // Current active settings (persisted so pre-init calls apply upon AudioContext start)
  private currentTargetFilters: FilterParams[] = [{
    type: 'peaking',
    frequency: 1000,
    gain: 0,
    q: 1.41
  }];
  private currentUserFilters: FilterParams[] = [{
    type: 'peaking',
    frequency: 1000,
    gain: 0,
    q: 1.41
  }];
  private currentTargetPan: number = 0;
  private currentUserPan: number = 0;

  // Master output
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Stem Balance Mode Infrastructure
  private isStemMode = false;
  private stemBuffers: Map<string, Record<StemType, AudioBuffer>> = new Map();
  private stemSourceNodes: Partial<Record<StemType, AudioBufferSourceNode>> = {};
  private stemTargetGainNodes: Partial<Record<StemType, GainNode>> = {};
  private stemUserGainNodes: Partial<Record<StemType, GainNode>> = {};
  private stemBypassGainNodes: Partial<Record<StemType, GainNode>> = {};
  private stemTargetMuteGains: Partial<Record<StemType, GainNode>> = {};
  private stemUserMuteGains: Partial<Record<StemType, GainNode>> = {};
  private stemBypassMuteGains: Partial<Record<StemType, GainNode>> = {};
  private stemAnalysers: Partial<Record<StemType, AnalyserNode>> = {};
  private stemTargetMixBus: GainNode | null = null;
  private stemUserMixBus: GainNode | null = null;
  private stemBypassMixBus: GainNode | null = null;
  private stemChannelStates: Record<StemType, { isMuted: boolean; isSoloed: boolean }> = {
    drums: { isMuted: false, isSoloed: false },
    bass: { isMuted: false, isSoloed: false },
    other: { isMuted: false, isSoloed: false },
    vocals: { isMuted: false, isSoloed: false }
  };
  private targetStemBalance: StemMixBalance = { drums: 0, bass: 0, other: 0, vocals: 0 };
  private userStemBalance: StemMixBalance = { drums: 0, bass: 0, other: 0, vocals: 0 };

  // Current active mode
  private activeListeningMode: ListeningMode = 'target';

  // State change listener
  private onStateChangeCallbacks: Array<(isPlaying: boolean, mode: ListeningMode, sourceType: AudioSourceType) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      getCustomAudioFromStorage().then(stored => {
        if (stored && stored.name) {
          this.customFileName = stored.name;
          this.notifyState();
        }
      }).catch(() => {});
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Master processing chain
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.85;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.limiter.knee.setValueAtTime(0, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Stem mixing buses
    this.stemTargetMixBus = this.ctx.createGain();
    this.stemTargetMixBus.gain.setValueAtTime(this.isStemMode && this.activeListeningMode === 'target' ? 1.0 : 0.0, this.ctx.currentTime);
    this.stemTargetMixBus.connect(this.limiter);

    this.stemUserMixBus = this.ctx.createGain();
    this.stemUserMixBus.gain.setValueAtTime(this.isStemMode && this.activeListeningMode === 'user' ? 1.0 : 0.0, this.ctx.currentTime);
    this.stemUserMixBus.connect(this.limiter);

    this.stemBypassMixBus = this.ctx.createGain();
    this.stemBypassMixBus.gain.setValueAtTime(this.isStemMode && this.activeListeningMode === 'bypass' ? 1.0 : 0.0, this.ctx.currentTime);
    this.stemBypassMixBus.connect(this.limiter);

    for (const stem of STEM_TYPES) {
      const targetGain = this.ctx.createGain();
      targetGain.gain.setValueAtTime(Math.pow(10, (this.targetStemBalance[stem] ?? 0) / 20), this.ctx.currentTime);
      const targetMute = this.ctx.createGain();
      targetMute.gain.setValueAtTime(1.0, this.ctx.currentTime);
      targetGain.connect(targetMute);
      targetMute.connect(this.stemTargetMixBus);
      this.stemTargetGainNodes[stem] = targetGain;
      this.stemTargetMuteGains[stem] = targetMute;

      const userGain = this.ctx.createGain();
      userGain.gain.setValueAtTime(Math.pow(10, (this.userStemBalance[stem] ?? 0) / 20), this.ctx.currentTime);
      const userMute = this.ctx.createGain();
      userMute.gain.setValueAtTime(1.0, this.ctx.currentTime);
      userGain.connect(userMute);
      userMute.connect(this.stemUserMixBus);
      this.stemUserGainNodes[stem] = userGain;
      this.stemUserMuteGains[stem] = userMute;

      const bypassGain = this.ctx.createGain();
      bypassGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      const bypassMute = this.ctx.createGain();
      bypassMute.gain.setValueAtTime(1.0, this.ctx.currentTime);
      bypassGain.connect(bypassMute);
      bypassMute.connect(this.stemBypassMixBus);
      this.stemBypassGainNodes[stem] = bypassGain;
      this.stemBypassMuteGains[stem] = bypassMute;

      const stemAnalyser = this.ctx.createAnalyser();
      stemAnalyser.fftSize = 128;
      stemAnalyser.smoothingTimeConstant = 0.6;
      this.stemAnalysers[stem] = stemAnalyser;
    }

    // Source output
    this.sourceOutGain = this.ctx.createGain();
    this.sourceOutGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Connect Analyser to raw source output so visualizer does NOT reveal mystery EQ boost/cut
    this.sourceOutGain.connect(this.analyser);

    // Path 1: Bypass
    this.bypassGain = this.ctx.createGain();
    this.bypassGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.sourceOutGain.connect(this.bypassGain);
    this.bypassGain.connect(this.limiter);

    // Path 2: Target Path (Mystery EQ, Sandbox EQ & Panning - supports up to 6 simultaneous EQ bands / dual filters up to 96dB/oct)
    this.targetChain = [];
    for (let i = 0; i < 32; i++) {
      const node = this.ctx.createBiquadFilter();
      this.setBiquadPassthrough(node, this.ctx.currentTime);
      this.targetChain.push(node);
    }
    this.targetPanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    this.targetGain = this.ctx.createGain();
    this.targetGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    let prevTarget: AudioNode = this.sourceOutGain;
    for (let i = 0; i < 32; i++) {
      prevTarget.connect(this.targetChain[i]);
      prevTarget = this.targetChain[i];
    }
    const targetOutputNode: AudioNode = this.targetPanner || prevTarget;
    if (this.targetPanner) {
      prevTarget.connect(this.targetPanner);
    }
    targetOutputNode.connect(this.targetGain);
    this.targetGain.connect(this.limiter);

    // Path 3: User Path (Match EQ, Sandbox EQ & Panning - supports up to 6 simultaneous EQ bands)
    this.userChain = [];
    for (let i = 0; i < 32; i++) {
      const node = this.ctx.createBiquadFilter();
      this.setBiquadPassthrough(node, this.ctx.currentTime);
      this.userChain.push(node);
    }
    this.userPanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    this.userGain = this.ctx.createGain();
    this.userGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // Dynamic input routing switches for User chain: Direct (clean source) vs Series (after Target EQ)
    this.userSourceDirectGain = this.ctx.createGain();
    this.userSourceDirectGain.gain.setValueAtTime(this.isSeriesCorrectionMode ? 0.0 : 1.0, this.ctx.currentTime);
    this.sourceOutGain.connect(this.userSourceDirectGain);
    this.userSourceDirectGain.connect(this.userChain[0]);

    this.userSourceSeriesGain = this.ctx.createGain();
    this.userSourceSeriesGain.gain.setValueAtTime(this.isSeriesCorrectionMode ? 1.0 : 0.0, this.ctx.currentTime);
    targetOutputNode.connect(this.userSourceSeriesGain);
    this.userSourceSeriesGain.connect(this.userChain[0]);

    let prevUser: AudioNode = this.userChain[0];
    for (let i = 1; i < 32; i++) {
      prevUser.connect(this.userChain[i]);
      prevUser = this.userChain[i];
    }
    if (this.userPanner) {
      prevUser.connect(this.userPanner);
      this.userPanner.connect(this.userGain);
    } else {
      prevUser.connect(this.userGain);
    }
    this.userGain.connect(this.limiter);

    // Apply current/pending filters and pans (so Round 1 target is immediately audible upon start)
    this.applyTargetFilterImmediate(this.currentTargetFilters);
    this.applyUserFilterImmediate(this.currentUserFilters);
    if (this.targetPanner) {
      this.targetPanner.pan.setValueAtTime(this.currentTargetPan, this.ctx.currentTime);
    }
    if (this.userPanner) {
      this.userPanner.pan.setValueAtTime(this.currentUserPan, this.ctx.currentTime);
    }

    // Set initial listening mode gains
    this.setListeningMode(this.activeListeningMode);

    // Generate procedural audio buffers in background
    this.generateStockBuffers();

    this.isInitialized = true;
  }

  /**
   * Decodes raw audio ArrayBuffer with complete cross-browser robustness.
   * Handles Safari WebKit buffer detaching, legacy callback APIs, and ensures
   * the AudioContext is resumed before decoding.
   */
  public async safeDecodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.ctx) await this.init();
    if (!this.ctx) throw new Error("AudioContext failed to initialize");

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("AudioContext resume notice:", e);
      }
    }

    // Clone the buffer to prevent WebKit detachment mutations if retried
    const copy = arrayBuffer.slice(0);

    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      try {
        const promise = this.ctx!.decodeAudioData(
          copy,
          (decoded) => {
            if (!settled) {
              settled = true;
              resolve(decoded);
            }
          },
          (err) => {
            if (!settled) {
              settled = true;
              reject(err || new Error("Browser audio decoder could not parse this audio file. Please ensure it is a standard MP3, WAV, or AAC file."));
            }
          }
        );

        if (promise && typeof promise.then === 'function') {
          promise.then(
            (decoded) => {
              if (!settled) {
                settled = true;
                resolve(decoded);
              }
            },
            (err) => {
              if (!settled) {
                settled = true;
                reject(err || new Error("Browser audio decoder could not parse this audio file."));
              }
            }
          );
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e);
        }
      }
    });
  }

  private async loadTrackFromUrl(url: string, fallbackLocalUrl?: string): Promise<AudioBuffer> {
    if (!this.ctx) await this.init();
    if (!this.ctx) throw new Error("AudioContext failed to initialize");

    try {
      // Ensure crossOrigin = 'anonymous' / CORS compliance when fetching external audio
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return await this.safeDecodeAudioData(arrayBuffer);
    } catch (err) {
      if (fallbackLocalUrl) {
        console.warn(`Primary audio load failed from ${url}, attempting local fallback:`, err);
        const fallbackResp = await fetch(fallbackLocalUrl);
        if (fallbackResp.ok) {
          const fallbackArr = await fallbackResp.arrayBuffer();
          return await this.safeDecodeAudioData(fallbackArr);
        }
      }
      throw err;
    }
  }

  private async generateStockBuffers(): Promise<void> {
    if (!this.ctx) return;
    try {
      const pink = createPinkNoiseBuffer(this.ctx, 8);
      this.buffers.set('pink_noise', pink);

      // Preload the 5 master music tracks from Cloudflare R2 in the background
      Object.entries(AUDIO_TRACK_URLS).forEach(([trackKey, url]) => {
        if (!url) return;
        const filename = AUDIO_TRACK_FILENAMES[trackKey as keyof typeof AUDIO_TRACK_FILENAMES];
        const fallbackUrl = filename ? `${import.meta.env.BASE_URL}audio/${filename}` : undefined;
        this.loadTrackFromUrl(url, fallbackUrl)
          .then(buf => {
            this.buffers.set(trackKey as AudioSourceType, buf);
          })
          .catch(err => {
            console.warn(`Failed preloading ${trackKey}:`, err);
          });
      });
    } catch (e) {
      console.warn("Error pre-generating buffers:", e);
    }
  }

  public async setAudioSource(type: AudioSourceType): Promise<void> {
    this.currentSourceType = type;
    this.pauseOffset = 0; // Reset offset on source change to prevent seek overflow

    // If switching to custom audio or a track without stems, exit stem mode
    if (type === 'custom_file' || !STEM_FOLDER_MAP[type]) {
      this.isStemMode = false;
    }

    if (type === 'custom_file') {
      if (!this.buffers.get('custom_file') && this.customBuffer) {
        this.buffers.set('custom_file', this.customBuffer);
      } else if (!this.hasCustomAudio()) {
        await this.restoreCustomAudioFromStorage();
      }
    }

    if (this.isPlaying) {
      this.stop();
      await this.play();
    }
    this.notifyState();
  }

  public async loadCustomAudioFile(file: File): Promise<string> {
    if (!this.ctx) await this.init();
    if (!this.ctx) throw new Error("AudioContext failed to initialize");

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.safeDecodeAudioData(arrayBuffer);

    this.customBuffer = audioBuffer;
    this.customFileName = file.name;
    this.buffers.set('custom_file', audioBuffer);
    this.monoBuffers.delete('custom_file');
    this.isStemMode = false;
    this.currentSourceType = 'custom_file';
    this.pauseOffset = 0;

    // Asynchronously persist to IndexedDB so it survives page reloads and browser restarts
    saveCustomAudioToStorage(file.name, file.type, arrayBuffer).catch(err => {
      console.warn("Notice: Audio persistence error:", err);
    });

    if (this.isPlaying) {
      this.stop();
      await this.play();
    }
    this.notifyState();

    return file.name;
  }

  /**
   * Attempts to restore the previously uploaded custom audio file from IndexedDB.
   */
  public async restoreCustomAudioFromStorage(): Promise<boolean> {
    if (this.customBuffer) return true;
    try {
      const stored = await getCustomAudioFromStorage();
      if (!stored || !stored.data) return false;

      if (!this.ctx) await this.init();
      if (!this.ctx) return false;

      const audioBuffer = await this.safeDecodeAudioData(stored.data);
      this.customBuffer = audioBuffer;
      this.customFileName = stored.name;
      this.buffers.set('custom_file', audioBuffer);
      this.monoBuffers.delete('custom_file');
      this.notifyState();
      return true;
    } catch (e) {
      console.warn("Notice: Could not restore stored custom audio:", e);
      return false;
    }
  }

  /**
   * Clears custom audio from memory and browser IndexedDB storage.
   */
  public async clearCustomAudio(): Promise<void> {
    this.customBuffer = null;
    this.customFileName = null;
    this.buffers.delete('custom_file');
    this.monoBuffers.delete('custom_file');
    await clearCustomAudioFromStorage();
    if (this.currentSourceType === 'custom_file') {
      await this.setAudioSource('dance_pop');
    } else {
      this.notifyState();
    }
  }

  public getCustomFileName(): string | null {
    return this.customFileName;
  }

  public hasCustomAudio(): boolean {
    return this.customBuffer !== null;
  }

  public getCurrentSourceType(): AudioSourceType {
    return this.currentSourceType;
  }

  public async play(): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) return;

    if (this.isStemMode) {
      await this.startStemPlayback();
      return;
    }

    let buffer = this.buffers.get(this.currentSourceType);
    if (!buffer && this.currentSourceType === 'custom_file') {
      if (this.customBuffer) {
        buffer = this.customBuffer;
        this.buffers.set('custom_file', buffer);
      } else {
        await this.restoreCustomAudioFromStorage();
        buffer = this.customBuffer || this.buffers.get('custom_file');
      }
    }

    if (!buffer) {
      const trackUrl = AUDIO_TRACK_URLS[this.currentSourceType];
      if (trackUrl) {
        try {
          const filename = AUDIO_TRACK_FILENAMES[this.currentSourceType as keyof typeof AUDIO_TRACK_FILENAMES];
          const fallbackUrl = filename ? `${import.meta.env.BASE_URL}audio/${filename}` : undefined;
          buffer = await this.loadTrackFromUrl(trackUrl, fallbackUrl);
          this.buffers.set(this.currentSourceType, buffer);
        } catch (err) {
          console.error(`Error loading track ${this.currentSourceType}:`, err);
          buffer = this.buffers.get('pink_noise') || createPinkNoiseBuffer(this.ctx, 8);
        }
      } else if (this.currentSourceType === 'pink_noise') {
        buffer = createPinkNoiseBuffer(this.ctx, 8);
        this.buffers.set('pink_noise', buffer);
      } else {
        buffer = this.buffers.get('pink_noise') || createPinkNoiseBuffer(this.ctx, 8);
      }
    }

    if (!buffer) {
      console.warn("Notice: No audio buffer available to play");
      return;
    }

    let activeBuffer = buffer;
    if (this.isMonoMode && buffer) {
      activeBuffer = this.getMonoBuffer(this.currentSourceType, buffer);
    }

    this.currentSourceNode = this.ctx.createBufferSource();
    this.currentSourceNode.buffer = activeBuffer;
    this.currentSourceNode.loop = true;

    if (this.sourceOutGain) {
      // Ensure single-track source output is active when not in stem mode
      this.sourceOutGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.015);
      this.currentSourceNode.connect(this.sourceOutGain);
    }

    const duration = (buffer && buffer.duration > 0) ? buffer.duration : 1;
    const safePause = (typeof this.pauseOffset === 'number' && isFinite(this.pauseOffset) && this.pauseOffset >= 0) ? this.pauseOffset : 0;
    const offset = safePause % duration;
    this.currentSourceNode.start(0, offset);
    this.startTime = this.ctx.currentTime - offset;
    this.isPlaying = true;

    this.notifyState();
  }

  public pause(): void {
    // Always stop and disconnect any single-track source node if present
    if (this.currentSourceNode) {
      if (this.ctx && !this.isStemMode) {
        this.pauseOffset = this.ctx.currentTime - this.startTime;
      }
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // ignore
      }
      this.currentSourceNode = null;
    }

    if (this.isStemMode) {
      this.pauseStemPlayback();
      return;
    }

    this.isPlaying = false;
    this.notifyState();
  }

  public stop(): void {
    // Always stop and disconnect both single-track and stem source nodes to prevent zombie audio
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // ignore
      }
      this.currentSourceNode = null;
    }

    if (this.isStemMode || Object.keys(this.stemSourceNodes).length > 0) {
      this.stopStemPlayback();
    }

    this.isPlaying = false;
    this.pauseOffset = 0;
    this.notifyState();
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Smooth, pop-free crossfade between Original (Bypass), Target EQ, and User Match EQ
   */
  public setListeningMode(mode: ListeningMode): void {
    if (this.isStemMode) {
      this.activeListeningMode = mode;
      this.updateListeningModeForStem();
      this.notifyState();
      return;
    }

    if (!this.ctx || !this.bypassGain || !this.targetGain || !this.userGain) {
      this.activeListeningMode = mode;
      return;
    }

    const t = this.ctx.currentTime;
    const fadeDuration = 0.015; // 15ms pop-free crossfade

    // Reset scheduled ramps
    this.bypassGain.gain.cancelScheduledValues(t);
    this.targetGain.gain.cancelScheduledValues(t);
    this.userGain.gain.cancelScheduledValues(t);

    const curBypass = this.bypassGain.gain.value;
    const curTarget = this.targetGain.gain.value;
    const curUser = this.userGain.gain.value;

    this.bypassGain.gain.setValueAtTime(curBypass, t);
    this.targetGain.gain.setValueAtTime(curTarget, t);
    this.userGain.gain.setValueAtTime(curUser, t);

    if (mode === 'bypass') {
      const effBypass = this.isMonoMode ? this.bypassLevel * 0.707107 : this.bypassLevel;
      this.bypassGain.gain.linearRampToValueAtTime(effBypass, t + fadeDuration);
      this.targetGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
      this.userGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
    } else if (mode === 'target') {
      this.bypassGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
      const targetPanComp = this.isMonoMode ? (1.0 + 0.18 * Math.abs(this.currentTargetPan)) : 1.0;
      this.targetGain.gain.linearRampToValueAtTime(this.targetLevel * targetPanComp, t + fadeDuration);
      this.userGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
    } else if (mode === 'user') {
      this.bypassGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
      this.targetGain.gain.linearRampToValueAtTime(0.0, t + fadeDuration);
      const userPanComp = this.isMonoMode ? (1.0 + 0.18 * Math.abs(this.currentUserPan)) : 1.0;
      this.userGain.gain.linearRampToValueAtTime(this.userLevel * userPanComp, t + fadeDuration);
    }

    this.activeListeningMode = mode;
    this.notifyState();
  }

  /**
   * Sets the comparative dB levels for A/B/C testing in dB Master.
   * To prevent digital clipping on positive dB boosts, any positive gain is
   * offset with automatic digital headroom attenuation, keeping the delta mathematically identical.
   */
  public setDbLevels(levelA_dB: number, levelB_dB: number, levelUser_dB: number = 0): void {
    const maxDb = Math.max(levelA_dB, levelB_dB, levelUser_dB);
    const headroomOffset = maxDb > 0 ? -maxDb : 0;
    this.bypassLevel = Math.pow(10, (levelA_dB + headroomOffset) / 20);
    this.targetLevel = Math.pow(10, (levelB_dB + headroomOffset) / 20);
    this.userLevel = Math.pow(10, (levelUser_dB + headroomOffset) / 20);

    if (this.ctx && this.bypassGain && this.targetGain && this.userGain) {
      const t = this.ctx.currentTime;
      if (this.activeListeningMode === 'bypass') {
        this.bypassGain.gain.setTargetAtTime(this.bypassLevel, t, 0.02);
      } else if (this.activeListeningMode === 'target') {
        this.targetGain.gain.setTargetAtTime(this.targetLevel, t, 0.02);
      } else if (this.activeListeningMode === 'user') {
        this.userGain.gain.setTargetAtTime(this.userLevel, t, 0.02);
      }
    }
  }

  /**
   * Real-time update for the interactive user fader in dB Master
   */
  public setUserDbLevel(levelUser_dB: number, levelA_dB: number = 0, levelB_dB: number = 0): void {
    const maxDb = Math.max(levelA_dB, levelB_dB, levelUser_dB);
    const headroomOffset = maxDb > 0 ? -maxDb : 0;
    this.bypassLevel = Math.pow(10, (levelA_dB + headroomOffset) / 20);
    this.targetLevel = Math.pow(10, (levelB_dB + headroomOffset) / 20);
    this.userLevel = Math.pow(10, (levelUser_dB + headroomOffset) / 20);

    if (this.ctx && this.userGain && this.activeListeningMode === 'user') {
      const t = this.ctx.currentTime;
      try {
        this.userGain.gain.cancelScheduledValues(t);
        this.userGain.gain.setTargetAtTime(this.userLevel, t, 0.02);
      } catch {
        this.userGain.gain.value = this.userLevel;
      }
    }
  }

  /**
   * Resets comparative dB levels to unity gain (1.0 / 0 dB)
   */
  public resetDbLevels(): void {
    this.bypassLevel = 1.0;
    this.targetLevel = 1.0;
    this.userLevel = 1.0;
    if (this.ctx && this.bypassGain && this.targetGain && this.userGain) {
      const t = this.ctx.currentTime;
      if (this.activeListeningMode === 'bypass') {
        this.bypassGain.gain.setTargetAtTime(1.0, t, 0.02);
      } else if (this.activeListeningMode === 'target') {
        this.targetGain.gain.setTargetAtTime(1.0, t, 0.02);
      } else if (this.activeListeningMode === 'user') {
        this.userGain.gain.setTargetAtTime(1.0, t, 0.02);
      }
    }
  }

  public getListeningMode(): ListeningMode {
    return this.activeListeningMode;
  }

  /**
   * Enables or disables mono mode across the audio engine.
   * In mono mode, tracks are cleanly summed to a single channel before entering
   * stereo panners, completely eliminating phase cancellation, stereo folding comb-filtering,
   * and timbral/EQ shifts when panning.
   */
  public setMonoMode(enabled: boolean): void {
    if (this.isMonoMode === enabled) return;
    this.isMonoMode = enabled;

    // Explicitly configure sourceOutGain channel count for hardware-level mono downmix
    if (this.sourceOutGain) {
      if (enabled) {
        this.sourceOutGain.channelCount = 1;
        this.sourceOutGain.channelCountMode = 'explicit';
      } else {
        this.sourceOutGain.channelCount = 2;
        this.sourceOutGain.channelCountMode = 'max';
      }
    }

    // If audio is currently playing, seamlessly swap to the mono/stereo buffer at current position
    if (this.isPlaying && this.ctx && this.currentSourceNode) {
      const offset = (this.ctx.currentTime - this.startTime) % (this.currentSourceNode.buffer?.duration || 1);
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {}

      const rawBuffer = this.buffers.get(this.currentSourceType);
      if (rawBuffer) {
        const activeBuffer = enabled ? this.getMonoBuffer(this.currentSourceType, rawBuffer) : rawBuffer;
        this.currentSourceNode = this.ctx.createBufferSource();
        this.currentSourceNode.buffer = activeBuffer;
        this.currentSourceNode.loop = true;
        if (this.sourceOutGain) {
          this.currentSourceNode.connect(this.sourceOutGain);
        }
        this.currentSourceNode.start(0, offset);
        this.startTime = this.ctx.currentTime - offset;
      }
    }
  }

  public getIsMonoMode(): boolean {
    return this.isMonoMode;
  }

  /**
   * Resets all Target and User biquad filter chains to flat passthrough (gain: 0 dB).
   * Ensures no residual EQ curves from other games color the audio in Pan Master or dB Master.
   */
  public resetFiltersToFlat(): void {
    const flatFilter: FilterParams[] = [{
      type: 'peaking',
      frequency: 1000,
      gain: 0,
      q: 1.0
    }];
    this.setTargetFilter(flatFilter);
    this.setUserFilter(flatFilter);
  }

  /**
   * Toggles series correction mode for Correct / Invert ear training.
   * When enabled, Path 3 ([C] User EQ) receives the output of Path 2 (Target EQ),
   * allowing the user's EQ to counteract and neutralize the rogue coloration in series.
   */
  public setCorrectionMode(enabled: boolean): void {
    this.isSeriesCorrectionMode = enabled;
    if (this.ctx && this.userSourceDirectGain && this.userSourceSeriesGain) {
      const t = this.ctx.currentTime;
      this.userSourceDirectGain.gain.setValueAtTime(enabled ? 0.0 : 1.0, t);
      this.userSourceSeriesGain.gain.setValueAtTime(enabled ? 1.0 : 0.0, t);
    }
  }

  public getCorrectionMode(): boolean {
    return this.isSeriesCorrectionMode;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1.5, vol));
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  private setBiquadNodeParams(node: BiquadFilterNode, params: FilterParams, t: number, smooth: boolean): void {
    node.type = params.type;
    if (smooth) {
      node.frequency.setTargetAtTime(params.frequency, t, 0.02);
      node.gain.setTargetAtTime(params.gain, t, 0.02);
      node.Q.setTargetAtTime(params.q, t, 0.02);
    } else {
      node.frequency.setValueAtTime(params.frequency, t);
      node.gain.setValueAtTime(params.gain, t);
      node.Q.setValueAtTime(params.q, t);
    }
  }

  private setBiquadPassthrough(node: BiquadFilterNode, t: number): void {
    node.type = 'allpass';
    node.frequency.setValueAtTime(1000, t);
  }

  private applyFilterToNodes(
    nodes: BiquadFilterNode[],
    filter: FilterParams | undefined,
    t: number,
    smooth: boolean
  ): void {
    if (!filter) {
      for (const node of nodes) {
        this.setBiquadPassthrough(node, t);
      }
      return;
    }

    const isCut = filter.type === 'highpass' || filter.type === 'lowpass';
    const slope = filter.slope || 12;

    if (!isCut) {
      this.setBiquadNodeParams(nodes[0], filter, t, smooth);
      for (let i = 1; i < nodes.length; i++) {
        this.setBiquadPassthrough(nodes[i], t);
      }
      return;
    }

    const is6dB = slope <= 6;
    const is18dB = slope === 18;
    const count = is6dB ? 1 : is18dB ? 2 : Math.min(nodes.length, Math.max(1, Math.round(slope / 12)));

    for (let i = 0; i < nodes.length; i++) {
      if (i < count) {
        let nodeQ = filter.q;
        if (is6dB) {
          nodeQ = 0.35;
        } else if (is18dB && i === 1) {
          nodeQ = 0.35;
        }
        this.setBiquadNodeParams(nodes[i], { ...filter, q: nodeQ }, t, smooth);
      } else {
        this.setBiquadPassthrough(nodes[i], t);
      }
    }
  }

  /**
   * Expands user-facing filter specifications into the exact cascaded biquad stages required.
   * - Cut filters (HPF/LPF): expanded into 1 to 8 cascaded stages to match the slope (6-96 dB/oct).
   * - Shelving filters (lowshelf/highshelf):
   *     - High Q (> 0.707): steep slope gradient modeled with base shelf + resonant corner peaking stage.
   *     - Low Q (< 0.707): natural shallow slope gradient modeled with staggered dual-shelf stages.
   *     - Standard Q (~ 0.707): single standard Butterworth shelf stage.
   * - Peaking / Notch: 1 stage.
   */
  private expandFilterStages(params: FilterParams | FilterParams[]): FilterParams[] {
    const filterList = Array.isArray(params) ? params : [params];
    const stages: FilterParams[] = [];

    for (const filter of filterList) {
      const isCut = filter.type === 'highpass' || filter.type === 'lowpass';
      const isShelf = filter.type === 'lowshelf' || filter.type === 'highshelf';

      if (isShelf) {
        const q = filter.q ?? 0.7071;
        // Natural Butterworth shelf slope transition
        if (Math.abs(q - 0.7071) < 0.05) {
          stages.push(filter);
        } else if (q < 0.7071) {
          // Shallow gradient: two staggered half-gain shelves spread across the transition frequency
          const spread = Math.min(2.5, Math.pow(0.7071 / Math.max(0.2, q), 0.75));
          const f1 = Math.max(20, Math.min(20000, filter.frequency / spread));
          const f2 = Math.max(20, Math.min(20000, filter.frequency * spread));
          const halfGain = filter.gain / 2;
          stages.push({ ...filter, frequency: f1, gain: halfGain });
          stages.push({ ...filter, frequency: f2, gain: halfGain });
        } else {
          // Steep gradient across the entire slope (NOT focused around the frequency point)
          // Uses base shelf + complementary inflection shaper pair so the whole slope steepens smoothly without any peak at f0
          stages.push(filter);
          if (Math.abs(filter.gain) > 0.1) {
            const qFactor = Math.min(1.0, (q - 0.7071) / 1.8);
            const gInflect = (filter.gain * 0.25) * qFactor;
            const r = 1.35;
            const peakQ = 1.25;
            const isLow = filter.type === 'lowshelf';
            const fPass = Math.max(20, Math.min(20000, isLow ? filter.frequency / r : filter.frequency * r));
            const fStop = Math.max(20, Math.min(20000, isLow ? filter.frequency * r : filter.frequency / r));

            stages.push({
              type: 'peaking',
              frequency: fPass,
              gain: gInflect,
              q: peakQ
            });
            stages.push({
              type: 'peaking',
              frequency: fStop,
              gain: -gInflect,
              q: peakQ
            });
          }
        }
      } else if (isCut) {
        const slope = filter.slope || 12;
        const is6dB = slope <= 6;
        const is18dB = slope === 18;
        const count = is6dB ? 1 : is18dB ? 2 : Math.min(8, Math.max(1, Math.round(slope / 12)));
        for (let i = 0; i < count; i++) {
          let nodeQ = filter.q;
          if (is6dB || (is18dB && i === 1)) {
            nodeQ = 0.35;
          }
          stages.push({ ...filter, q: nodeQ });
        }
      } else {
        stages.push(filter);
      }
    }

    return stages;
  }

  private applyFilterListToChain(
    chain: BiquadFilterNode[],
    params: FilterParams | FilterParams[] | undefined,
    t: number,
    smooth: boolean
  ): void {
    if (!params) {
      for (const node of chain) {
        this.setBiquadPassthrough(node, t);
      }
      return;
    }

    const stages = this.expandFilterStages(params);
    let nodeIndex = 0;

    for (const stage of stages) {
      if (nodeIndex >= chain.length) break;
      this.setBiquadNodeParams(chain[nodeIndex], stage, t, smooth);
      nodeIndex++;
    }

    // Set remaining unused nodes in the chain to passthrough
    while (nodeIndex < chain.length) {
      this.setBiquadPassthrough(chain[nodeIndex], t);
      nodeIndex++;
    }
  }

  private applyTargetFilter(params: FilterParams | FilterParams[], smooth: boolean): void {
    if (!this.ctx || this.targetChain.length === 0) return;
    const t = this.ctx.currentTime;
    this.applyFilterListToChain(this.targetChain, params, t, smooth);
  }

  private applyUserFilter(params: FilterParams | FilterParams[], smooth: boolean): void {
    if (!this.ctx || this.userChain.length === 0) return;
    const t = this.ctx.currentTime;
    this.applyFilterListToChain(this.userChain, params, t, smooth);
  }

  private applyTargetFilterImmediate(params: FilterParams | FilterParams[]): void {
    this.applyTargetFilter(params, false);
  }

  private applyTargetFilterSmooth(params: FilterParams | FilterParams[]): void {
    this.applyTargetFilter(params, true);
  }

  private applyUserFilterImmediate(params: FilterParams | FilterParams[]): void {
    this.applyUserFilter(params, false);
  }

  private applyUserFilterSmooth(params: FilterParams | FilterParams[]): void {
    this.applyUserFilter(params, true);
  }

  /**
   * Applies the target (mystery) filter to the audio (supports single or dual filters)
   */
  public setTargetFilter(params: FilterParams | FilterParams[]): void {
    this.currentTargetFilters = Array.isArray(params) ? params : [params];
    if (!this.ctx || this.targetChain.length === 0) return;
    this.applyTargetFilterSmooth(params);
  }

  /**
   * Applies user match filter (for Match, Correction, & Filter Doctor modes)
   */
  public setUserFilter(params: FilterParams | FilterParams[]): void {
    this.currentUserFilters = Array.isArray(params) ? params : [params];
    if (!this.ctx || this.userChain.length === 0) return;
    this.applyUserFilterSmooth(params);
  }

  /**
   * Sets stereo panning position (-1.0 = Full Left, 0 = Center, +1.0 = Full Right)
   */
  public setTargetPan(pan: number): void {
    this.currentTargetPan = pan;
    if (!this.ctx || !this.targetPanner) return;
    const clamped = Math.max(-1.0, Math.min(1.0, pan));
    this.targetPanner.pan.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);

    if (this.targetGain && this.isMonoMode && this.activeListeningMode === 'target') {
      const comp = this.targetLevel * (1.0 + 0.18 * Math.abs(clamped));
      this.targetGain.gain.setTargetAtTime(comp, this.ctx.currentTime, 0.02);
    }
  }

  public setUserPan(pan: number): void {
    this.currentUserPan = pan;
    if (!this.ctx || !this.userPanner) return;
    const clamped = Math.max(-1.0, Math.min(1.0, pan));
    this.userPanner.pan.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);

    if (this.userGain && this.isMonoMode && this.activeListeningMode === 'user') {
      const comp = this.userLevel * (1.0 + 0.18 * Math.abs(clamped));
      this.userGain.gain.setTargetAtTime(comp, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Calculates precise frequency response curve in dB for any filter settings (single or multi-filter)
   */
  public getFrequencyResponse(params: FilterParams | FilterParams[], frequencies: Float32Array): Float32Array {
    if (!this.ctx) return new Float32Array(frequencies.length).fill(0);

    const stages = this.expandFilterStages(params);
    const totalDbs = new Float32Array(frequencies.length);

    for (const stage of stages) {
      const tempBiquad = this.ctx.createBiquadFilter();
      tempBiquad.type = stage.type;
      tempBiquad.frequency.value = stage.frequency;
      tempBiquad.gain.value = stage.gain;
      tempBiquad.Q.value = stage.q;

      const magResponse = new Float32Array(frequencies.length);
      const phaseResponse = new Float32Array(frequencies.length);
      tempBiquad.getFrequencyResponse(frequencies as any, magResponse as any, phaseResponse as any);

      for (let i = 0; i < frequencies.length; i++) {
        const mag = magResponse[i];
        const db = mag > 0.00001 ? 20 * Math.log10(mag) : -100;
        totalDbs[i] += db;
      }
    }

    return totalDbs;
  }

  /**
   * Extract FFT data for live spectrum display
   */
  public getSpectrumData(outputArray: Uint8Array): void {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(outputArray as any);
    } else {
      outputArray.fill(0);
    }
  }

  /**
   * Returns a copy of the current FFT byte frequency data
   */
  public getAnalyserData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    if (this.isPlaying) {
      this.analyser.getByteFrequencyData(arr as any);
    }
    return arr;
  }

  public subscribeState(cb: (isPlaying: boolean, mode: ListeningMode, sourceType: AudioSourceType) => void): () => void {
    this.onStateChangeCallbacks.push(cb);
    return () => {
      this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter(c => c !== cb);
    };
  }

  private notifyState(): void {
    this.onStateChangeCallbacks.forEach(cb => cb(this.isPlaying, this.activeListeningMode, this.currentSourceType));
  }

  // =========================================================================
  // STEM MULTI-TRACK AUDIO ENGINE METHODS
  // =========================================================================

  /**
   * Preload 4 isolated stems (drums, bass, other, vocals) for the given reference track
   */
  public async loadStemBuffersForTrack(sourceType: AudioSourceType): Promise<boolean> {
    if (!this.ctx) await this.init();
    if (!this.ctx) return false;

    const folder = STEM_FOLDER_MAP[sourceType] || 'dance-pop';
    if (this.stemBuffers.has(folder)) {
      return true;
    }

    try {
      const stems: Partial<Record<StemType, AudioBuffer>> = {};
      const promises = STEM_TYPES.map(async (stem) => {
        const r2Url = `${R2_AUDIO_BASE_URL}stems/htdemucs/${folder}/${stem}.mp3`;
        const localUrl = `${import.meta.env.BASE_URL}audio/stems/htdemucs/${folder}/${stem}.mp3`;

        let resp: Response | null = null;
        try {
          const r = await fetch(r2Url);
          if (r.ok && r.headers.get('content-type')?.includes('audio')) {
            resp = r;
          }
        } catch {}

        if (!resp) {
          resp = await fetch(localUrl);
        }

        if (!resp || !resp.ok) throw new Error(`Failed fetching stem ${folder}/${stem}`);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
        stems[stem] = audioBuf;
      });

      await Promise.all(promises);
      this.stemBuffers.set(folder, stems as Record<StemType, AudioBuffer>);
      return true;
    } catch (e) {
      console.warn(`Could not load stems for ${sourceType} (${folder}):`, e);
      return false;
    }
  }

  /**
   * Toggles stem multi-track mixing mode on or off
   */
  public async setStemMode(enabled: boolean): Promise<void> {
    if (this.isStemMode === enabled) {
      // Even if already in the desired mode, ensure single-track is muted/stopped when in stem mode
      if (enabled && this.currentSourceNode) {
        try {
          this.currentSourceNode.stop();
          this.currentSourceNode.disconnect();
        } catch {}
        this.currentSourceNode = null;
      }
      if (enabled && this.ctx && this.sourceOutGain) {
        this.sourceOutGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      }
      return;
    }

    // Stop any active playback before switching routing
    if (this.isPlaying || this.currentSourceNode || Object.keys(this.stemSourceNodes).length > 0) {
      this.stop();
    }

    this.isStemMode = enabled;
    this.pauseOffset = 0;

    if (enabled) {
      await this.loadStemBuffersForTrack(this.currentSourceType);
    }

    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (!enabled) {
        this.stemTargetMixBus?.gain.setTargetAtTime(0, t, 0.015);
        this.stemUserMixBus?.gain.setTargetAtTime(0, t, 0.015);
        this.stemBypassMixBus?.gain.setTargetAtTime(0, t, 0.015);
        this.sourceOutGain?.gain.setTargetAtTime(1.0, t, 0.015);
      } else {
        // Mute single-track output chain completely while in stem mode
        this.sourceOutGain?.gain.setTargetAtTime(0, t, 0.015);
        this.bypassGain?.gain.setTargetAtTime(0, t, 0.015);
        this.targetGain?.gain.setTargetAtTime(0, t, 0.015);
        this.userGain?.gain.setTargetAtTime(0, t, 0.015);
        this.updateListeningModeForStem();
      }
    }
    this.notifyState();
  }

  public isStemModeActive(): boolean {
    return this.isStemMode;
  }

  public async startStemPlayback(): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) return;

    const folder = STEM_FOLDER_MAP[this.currentSourceType] || 'dance-pop';
    let stems = this.stemBuffers.get(folder);
    if (!stems) {
      await this.loadStemBuffersForTrack(this.currentSourceType);
      stems = this.stemBuffers.get(folder);
    }
    if (!stems) {
      console.warn("Stems unavailable for track:", this.currentSourceType);
      return;
    }

    // Guarantee any single-track source node is stopped and muted before starting stems
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {}
      this.currentSourceNode = null;
    }
    if (this.sourceOutGain) {
      this.sourceOutGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
    }

    // Stop and disconnect any existing stem source nodes
    for (const stem of STEM_TYPES) {
      const existing = this.stemSourceNodes[stem];
      if (existing) {
        try { existing.stop(); existing.disconnect(); } catch {}
      }
    }
    this.stemSourceNodes = {};

    const duration = stems.drums?.duration || stems.vocals?.duration || 30;
    const offset = this.pauseOffset % duration;
    const startTime = this.ctx.currentTime + 0.02;

    for (const stem of STEM_TYPES) {
      const buf = stems[stem];
      if (!buf) continue;

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = duration;

      const targetGain = this.stemTargetGainNodes[stem];
      if (targetGain) {
        const linearTgt = Math.pow(10, (this.targetStemBalance[stem] ?? 0) / 20);
        try {
          targetGain.gain.cancelScheduledValues(startTime);
          targetGain.gain.setValueAtTime(linearTgt, startTime);
        } catch {
          targetGain.gain.value = linearTgt;
        }
        src.connect(targetGain);
      }

      const userGain = this.stemUserGainNodes[stem];
      if (userGain) {
        const linearUser = Math.pow(10, (this.userStemBalance[stem] ?? 0) / 20);
        try {
          userGain.gain.cancelScheduledValues(startTime);
          userGain.gain.setValueAtTime(linearUser, startTime);
        } catch {
          userGain.gain.value = linearUser;
        }
        src.connect(userGain);
      }

      const bypassGain = this.stemBypassGainNodes[stem];
      if (bypassGain) {
        bypassGain.gain.setValueAtTime(1.0, startTime);
        src.connect(bypassGain);
      }

      const analyser = this.stemAnalysers[stem];
      if (analyser) src.connect(analyser);

      src.start(startTime, offset);
      this.stemSourceNodes[stem] = src;
    }

    this.startTime = startTime - offset;
    this.isPlaying = true;
    this.updateListeningModeForStem();
    this.updateStemMuteGains();
    this.notifyState();
  }

  public pauseStemPlayback(): void {
    if (!this.ctx || !this.isPlaying || !this.isStemMode) return;
    this.pauseOffset = this.ctx.currentTime - this.startTime;
    for (const stem of STEM_TYPES) {
      const src = this.stemSourceNodes[stem];
      if (src) {
        try { src.stop(); src.disconnect(); } catch {}
      }
    }
    this.stemSourceNodes = {};
    this.isPlaying = false;
    this.notifyState();
  }

  public stopStemPlayback(): void {
    for (const stem of STEM_TYPES) {
      const src = this.stemSourceNodes[stem];
      if (src) {
        try { src.stop(); src.disconnect(); } catch {}
      }
    }
    this.stemSourceNodes = {};
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.notifyState();
  }

  private updateListeningModeForStem(): void {
    if (!this.ctx || !this.stemTargetMixBus || !this.stemUserMixBus || !this.stemBypassMixBus) return;
    const t = this.ctx.currentTime;
    const mode = this.activeListeningMode;
    const isTarget = mode === 'target';
    const isUser = mode === 'user';
    const isBypass = mode === 'bypass';

    // Ensure single-track path is completely silent while stem mode is active
    this.sourceOutGain?.gain.setTargetAtTime(0.0, t, 0.015);
    this.bypassGain?.gain.setTargetAtTime(0.0, t, 0.015);
    this.targetGain?.gain.setTargetAtTime(0.0, t, 0.015);
    this.userGain?.gain.setTargetAtTime(0.0, t, 0.015);

    this.stemTargetMixBus.gain.setTargetAtTime(isTarget ? 1.0 : 0.0, t, 0.02);
    this.stemUserMixBus.gain.setTargetAtTime(isUser ? 1.0 : 0.0, t, 0.02);
    this.stemBypassMixBus.gain.setTargetAtTime(isBypass ? 1.0 : 0.0, t, 0.02);
  }

  public updateStemMuteGains(): void {
    if (!this.ctx) return;
    const anySoloed = Object.values(this.stemChannelStates).some(s => s.isSoloed);
    const t = this.ctx.currentTime;

    for (const st of STEM_TYPES) {
      const state = this.stemChannelStates[st];
      let shouldPlay = true;
      if (anySoloed) {
        shouldPlay = state.isSoloed && !state.isMuted;
      } else {
        shouldPlay = !state.isMuted;
      }

      const gainVal = shouldPlay ? 1.0 : 0.0;
      this.stemTargetMuteGains[st]?.gain.setTargetAtTime(gainVal, t, 0.015);
      this.stemUserMuteGains[st]?.gain.setTargetAtTime(gainVal, t, 0.015);
      this.stemBypassMuteGains[st]?.gain.setTargetAtTime(gainVal, t, 0.015);
    }
  }

  public setStemBalanceTarget(balance: StemMixBalance): void {
    this.targetStemBalance = { ...balance };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const stem of STEM_TYPES) {
      const db = balance[stem] ?? 0;
      const linear = Math.pow(10, db / 20);
      const node = this.stemTargetGainNodes[stem];
      if (node) {
        try {
          node.gain.cancelScheduledValues(t);
          node.gain.setTargetAtTime(linear, t, 0.015);
        } catch {
          node.gain.value = linear;
        }
      }
    }
  }

  public setUserStemGain(stem: StemType, db: number): void {
    this.userStemBalance[stem] = db;
    if (!this.ctx) return;
    const linear = Math.pow(10, db / 20);
    const node = this.stemUserGainNodes[stem];
    if (node) {
      try {
        node.gain.cancelScheduledValues(this.ctx.currentTime);
        node.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.015);
      } catch {
        node.gain.value = linear;
      }
    }
  }

  public setStemSoloMute(stem: StemType, isMuted: boolean, isSoloed: boolean): void {
    this.stemChannelStates[stem] = { isMuted, isSoloed };
    this.updateStemMuteGains();
  }

  public getStemRMS(stem: StemType): number {
    const analyser = this.stemAnalysers[stem];
    if (!analyser || !this.isPlaying || !this.isStemMode) return 0;
    const data = new Uint8Array(32);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / (data.length * 255);
    return Math.min(1.0, avg * 2.5);
  }

  public resetStemMix(): void {
    this.userStemBalance = { drums: 0, bass: 0, other: 0, vocals: 0 };
    if (this.ctx) {
      const t = this.ctx.currentTime;
      for (const stem of STEM_TYPES) {
        const node = this.stemUserGainNodes[stem];
        if (node) {
          try {
            node.gain.cancelScheduledValues(t);
            node.gain.setTargetAtTime(1.0, t, 0.015);
          } catch {
            node.gain.value = 1.0;
          }
        }
      }
    }
  }
}

// Global audio engine singleton
export const audioEngine = new AudioEngine();
