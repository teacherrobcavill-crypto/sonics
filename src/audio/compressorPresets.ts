import { CompressorParams } from '../types/compressor';

export interface CompressorPreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  params: Partial<CompressorParams>;
}

export const STEM_PRESETS: Record<string, CompressorPreset[]> = {
  kick: [
    {
      id: 'kick-punch',
      name: 'Punchy Beater Snap',
      tag: 'Slow Att • Snap',
      description: 'Slow 30ms attack lets the initial beater click crack through before clamping.',
      params: {
        thresholdDb: -16.0,
        ratio: 4.0,
        attackMs: 30.0,
        releaseMs: 55.0
      }
    },
    {
      id: 'kick-sub-slam',
      name: 'Heavy Sub Slam',
      tag: 'Fast Att • Low End',
      description: 'Clamps sharp transient peaks, pushing sub body and resonance forward.',
      params: {
        thresholdDb: -22.0,
        ratio: 6.0,
        attackMs: 1.8,
        releaseMs: 45.0
      }
    },
    {
      id: 'kick-tight',
      name: 'Tight Dynamic Control',
      tag: 'Moderate • Glue',
      description: 'Balanced leveling for a solid, consistent kick foundation in the mix.',
      params: {
        thresholdDb: -14.0,
        ratio: 3.0,
        attackMs: 12.0,
        releaseMs: 90.0
      }
    }
  ],

  snare: [
    {
      id: 'snare-crack',
      name: 'Rimshot Crack',
      tag: 'Slow Att • Punch',
      description: 'Preserves the sharp drumstick crack while tightening the ringing tail.',
      params: {
        thresholdDb: -18.0,
        ratio: 4.0,
        attackMs: 25.0,
        releaseMs: 75.0
      }
    },
    {
      id: 'snare-fat-body',
      name: 'Fat Smashed Body',
      tag: 'Fast Att • Weight',
      description: 'Arrests transient peaks to thicken and fatten the snare body and wires.',
      params: {
        thresholdDb: -24.0,
        ratio: 7.0,
        attackMs: 1.2,
        releaseMs: 140.0
      }
    },
    {
      id: 'snare-ghost-glue',
      name: 'Ghost Note Leveler',
      tag: 'Gentle • Consistency',
      description: 'Pulls subtle ghost notes up while transparently reining in hard hits.',
      params: {
        thresholdDb: -15.0,
        ratio: 3.0,
        attackMs: 8.0,
        releaseMs: 60.0
      }
    }
  ],

  bass: [
    {
      id: 'bass-opto-smooth',
      name: 'Opto Foundation Glue',
      tag: 'LA-2A Style • Level',
      description: 'Slow musical recovery provides a smooth, unshakeable low-end anchor.',
      params: {
        thresholdDb: -18.0,
        ratio: 3.2,
        attackMs: 20.0,
        releaseMs: 260.0
      }
    },
    {
      id: 'bass-finger-punch',
      name: 'Fingerstyle Attack',
      tag: 'Mid Att • Snap',
      description: 'Accentuates string plucks while taming boomy resonant notes.',
      params: {
        thresholdDb: -16.0,
        ratio: 4.5,
        attackMs: 9.0,
        releaseMs: 85.0
      }
    },
    {
      id: 'bass-brick-anchor',
      name: 'Sub Ceiling Clamp',
      tag: 'Heavy Ratio • Tight',
      description: 'Strict dynamic ceiling keeping modern sub-bass locked in place.',
      params: {
        thresholdDb: -20.0,
        ratio: 8.0,
        attackMs: 3.0,
        releaseMs: 120.0
      }
    }
  ],

  drums: [
    {
      id: 'bus-mix-glue',
      name: 'Classic 2-Buss Glue',
      tag: 'SSL Style • 2-3dB',
      description: 'Gently tickles the needle 2–3 dB to bind the kit into a cohesive groove.',
      params: {
        thresholdDb: -12.0,
        ratio: 2.0,
        attackMs: 30.0,
        releaseMs: 100.0
      }
    },
    {
      id: 'bus-room-smash',
      name: 'All-Buttons Room Crush',
      tag: '1176 Style • Slam',
      description: 'Aggressive squash pulling up explosive room reverb and cymbal bloom.',
      params: {
        thresholdDb: -25.0,
        ratio: 12.0,
        attackMs: 0.8,
        releaseMs: 35.0
      }
    },
    {
      id: 'bus-groove-pump',
      name: 'Rhythmic Beat Pump',
      tag: 'Fast Rel • Energy',
      description: 'Release timed to breathe with the tempo, injecting kinetic groove.',
      params: {
        thresholdDb: -19.0,
        ratio: 4.0,
        attackMs: 15.0,
        releaseMs: 55.0
      }
    }
  ],

  custom: [
    {
      id: 'custom-transparent',
      name: 'Transparent Dynamic Control',
      tag: 'Gentle • 2-4dB',
      description: 'Clean leveling suitable for vocals, acoustic guitars, and master busses.',
      params: {
        thresholdDb: -15.0,
        ratio: 2.5,
        attackMs: 25.0,
        releaseMs: 120.0
      }
    },
    {
      id: 'custom-punch',
      name: 'Transient Punch Shaper',
      tag: 'Slow Att • Snap',
      description: 'Emphasizes initial note impact and crack on percussive material.',
      params: {
        thresholdDb: -18.0,
        ratio: 4.0,
        attackMs: 35.0,
        releaseMs: 80.0
      }
    },
    {
      id: 'custom-density',
      name: 'High-Density Leveler',
      tag: 'Heavy • In-Your-Face',
      description: 'Pins dynamics down for continuous, modern up-front presence.',
      params: {
        thresholdDb: -22.0,
        ratio: 6.0,
        attackMs: 2.0,
        releaseMs: 90.0
      }
    }
  ]
};

export function getPresetsForStem(stemCategory: string): CompressorPreset[] {
  return STEM_PRESETS[stemCategory] || STEM_PRESETS.custom;
}
