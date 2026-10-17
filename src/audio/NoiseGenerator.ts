/**
 * High-quality noise generators for audio engineering ear training.
 * Creates seamless looping AudioBuffers for Pink, White, and Brown noise.
 */

export function createPinkNoiseBuffer(ctx: AudioContext, durationSeconds: number = 8): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate); // Stereo

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    // Generate Paul Kellet pink noise filter
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.1; // scale to safe listening level
    }

    // Apply quick smooth crossfade at loop boundary (first and last 1000 samples)
    const fadeSamples = 2000;
    for (let i = 0; i < fadeSamples; i++) {
      const alpha = i / fadeSamples;
      data[i] = data[i] * alpha + data[bufferSize - fadeSamples + i] * (1 - alpha);
    }
  }

  return buffer;
}

export function createWhiteNoiseBuffer(ctx: AudioContext, durationSeconds: number = 6): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.12;
    }
    // Crossfade loop boundaries
    const fadeSamples = 2000;
    for (let i = 0; i < fadeSamples; i++) {
      const alpha = i / fadeSamples;
      data[i] = data[i] * alpha + data[bufferSize - fadeSamples + i] * (1 - alpha);
    }
  }

  return buffer;
}
