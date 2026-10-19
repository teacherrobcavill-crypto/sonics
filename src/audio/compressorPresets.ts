import { CompressorParams } from '../types/compressor';

export interface CompressorPreset {
  id: string;
  name: string;
  params: Partial<CompressorParams>;
}

export const STEM_PRESETS: Record<string, CompressorPreset[]> = {
  kick: [
    {
      id: 'kick-punch',
      name: 'Beater Snap',
      params: { thresholdDb: -16.0, ratio: 4.0, attackMs: 30.0, releaseMs: 55.0 }
    },
    {
      id: 'kick-sub-slam',
      name: 'Heavy Sub Slam',
      params: { thresholdDb: -22.0, ratio: 6.0, attackMs: 1.8, releaseMs: 45.0 }
    },
    {
      id: 'kick-tight',
      name: 'Tight Dynamic Glue',
      params: { thresholdDb: -14.0, ratio: 3.0, attackMs: 12.0, releaseMs: 90.0 }
    },
    {
      id: 'kick-click-accent',
      name: 'Click Accent',
      params: { thresholdDb: -18.0, ratio: 4.5, attackMs: 50.0, releaseMs: 40.0 }
    },
    {
      id: 'kick-metal-slam',
      name: 'Modern Metal Slam',
      params: { thresholdDb: -24.0, ratio: 8.0, attackMs: 0.8, releaseMs: 30.0 }
    },
    {
      id: 'kick-vintage-round',
      name: 'Vintage Rounding',
      params: { thresholdDb: -12.0, ratio: 2.5, attackMs: 20.0, releaseMs: 120.0 }
    }
  ],

  snare: [
    {
      id: 'snare-crack',
      name: 'Rimshot Crack',
      params: { thresholdDb: -18.0, ratio: 4.0, attackMs: 25.0, releaseMs: 75.0 }
    },
    {
      id: 'snare-fat-body',
      name: 'Fat Smashed Body',
      params: { thresholdDb: -24.0, ratio: 7.0, attackMs: 1.2, releaseMs: 140.0 }
    },
    {
      id: 'snare-ghost-glue',
      name: 'Ghost Note Leveler',
      params: { thresholdDb: -15.0, ratio: 3.0, attackMs: 8.0, releaseMs: 60.0 }
    },
    {
      id: 'snare-stick-punch',
      name: 'Stick Punch',
      params: { thresholdDb: -20.0, ratio: 5.0, attackMs: 40.0, releaseMs: 80.0 }
    },
    {
      id: 'snare-warm-shell',
      name: 'Warm Shell Tone',
      params: { thresholdDb: -13.0, ratio: 2.8, attackMs: 15.0, releaseMs: 120.0 }
    },
    {
      id: 'snare-wire-bloom',
      name: 'Snare Wire Bloom',
      params: { thresholdDb: -26.0, ratio: 10.0, attackMs: 0.5, releaseMs: 50.0 }
    }
  ],

  bass: [
    {
      id: 'bass-opto-smooth',
      name: 'Opto Foundation',
      params: { thresholdDb: -18.0, ratio: 3.2, attackMs: 20.0, releaseMs: 260.0 }
    },
    {
      id: 'bass-finger-punch',
      name: 'Fingerstyle Attack',
      params: { thresholdDb: -16.0, ratio: 4.5, attackMs: 9.0, releaseMs: 85.0 }
    },
    {
      id: 'bass-brick-anchor',
      name: 'Sub Ceiling Clamp',
      params: { thresholdDb: -20.0, ratio: 8.0, attackMs: 3.0, releaseMs: 120.0 }
    },
    {
      id: 'bass-rock-growl',
      name: 'Pick Rock Growl',
      params: { thresholdDb: -17.0, ratio: 5.0, attackMs: 14.0, releaseMs: 70.0 }
    },
    {
      id: 'bass-slap-leveler',
      name: 'Slap & Pop Leveler',
      params: { thresholdDb: -21.0, ratio: 4.0, attackMs: 5.0, releaseMs: 140.0 }
    },
    {
      id: 'bass-motown-warm',
      name: 'Warm Vintage Thump',
      params: { thresholdDb: -14.0, ratio: 2.5, attackMs: 35.0, releaseMs: 300.0 }
    }
  ],

  drums: [
    {
      id: 'bus-mix-glue',
      name: 'Classic 2-Buss Glue',
      params: { thresholdDb: -12.0, ratio: 2.0, attackMs: 30.0, releaseMs: 100.0 }
    },
    {
      id: 'bus-room-smash',
      name: 'Room All-Buttons Crush',
      params: { thresholdDb: -25.0, ratio: 12.0, attackMs: 0.8, releaseMs: 35.0 }
    },
    {
      id: 'bus-groove-pump',
      name: 'Rhythmic Beat Pump',
      params: { thresholdDb: -19.0, ratio: 4.0, attackMs: 15.0, releaseMs: 55.0 }
    },
    {
      id: 'bus-parallel-punch',
      name: 'Parallel Punch',
      params: { thresholdDb: -22.0, ratio: 6.0, attackMs: 40.0, releaseMs: 60.0 }
    },
    {
      id: 'bus-master-polish',
      name: 'Master Bus Polish',
      params: { thresholdDb: -10.0, ratio: 1.8, attackMs: 50.0, releaseMs: 150.0 }
    },
    {
      id: 'bus-aggro-slam',
      name: 'Aggressive Kit Slam',
      params: { thresholdDb: -23.0, ratio: 8.0, attackMs: 1.5, releaseMs: 40.0 }
    }
  ],

  custom: [
    {
      id: 'custom-transparent',
      name: 'Transparent Control',
      params: { thresholdDb: -15.0, ratio: 2.5, attackMs: 25.0, releaseMs: 120.0 }
    },
    {
      id: 'custom-punch',
      name: 'Transient Punch',
      params: { thresholdDb: -18.0, ratio: 4.0, attackMs: 35.0, releaseMs: 80.0 }
    },
    {
      id: 'custom-density',
      name: 'High-Density Leveler',
      params: { thresholdDb: -22.0, ratio: 6.0, attackMs: 2.0, releaseMs: 90.0 }
    },
    {
      id: 'custom-polish',
      name: 'Gentle Mix Polish',
      params: { thresholdDb: -11.0, ratio: 1.8, attackMs: 45.0, releaseMs: 160.0 }
    },
    {
      id: 'custom-peak-tamer',
      name: 'Fast Peak Tamer',
      params: { thresholdDb: -20.0, ratio: 8.0, attackMs: 1.0, releaseMs: 60.0 }
    },
    {
      id: 'custom-analog-warmth',
      name: 'Analog Tube Warmth',
      params: { thresholdDb: -14.0, ratio: 3.0, attackMs: 18.0, releaseMs: 220.0 }
    }
  ]
};

export function getPresetsForStem(stemCategory: string): CompressorPreset[] {
  return STEM_PRESETS[stemCategory] || STEM_PRESETS.custom;
}
