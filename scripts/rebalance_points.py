#!/usr/bin/env python3
"""
Points Rebalancing Script for Train Your Ears
Schedules or applies:
- Peak Master: +20% on all gain multipliers (cuts kept at +25% bonus)
- Pan Master: -20% scale down
- Filter Doctor: +20% scale up
- dB Master: scaled to 250 PTS max (~3x slower than Peak Master)
- Glyn Johns: bot benchmark averages adjusted proportionally
"""

import sys
import os
import time
from datetime import datetime, timezone, timedelta
import subprocess

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

EDITS = [
    {
        "file": "src/components/games/PeakMasterGame.tsx",
        "description": "Peak Master +20% gain multipliers",
        "target": """function getGainScoreMultiplier(gainDb: number): number {
  const absGain = Math.abs(gainDb);
  let baseMult = 0.35; // 12 dB
  if (absGain <= 3) baseMult = 1.0;
  else if (absGain <= 6) baseMult = 0.70;
  else if (absGain <= 9) baseMult = 0.50;

  return gainDb < 0 ? baseMult * CUT_BONUS_MULTIPLIER : baseMult;
}""",
        "replacement": """function getGainScoreMultiplier(gainDb: number): number {
  const absGain = Math.abs(gainDb);
  let baseMult = 0.42; // 12 dB (+20%)
  if (absGain <= 3) baseMult = 1.20;
  else if (absGain <= 6) baseMult = 0.84;
  else if (absGain <= 9) baseMult = 0.60;

  return gainDb < 0 ? baseMult * CUT_BONUS_MULTIPLIER : baseMult;
}"""
    },
    {
        "file": "src/components/games/PanMasterGame.tsx",
        "description": "Pan Master docstring and score curve (-20%)",
        "target": """/**
 * Returns the maximum score for a spot-on guess in Pan Master for a given round.
 * Rounds 1–10: 400 points max (scaled back 20% from 500).
 * Rounds 11–18: Scales up linearly from 400 to 800.
 * Rounds 19 & 20: 800 points max awarded for spot-on guesses in the final 2 rounds (scaled back 20% from 1,000).
 */
function getPanMasterMaxScore(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 10) return 400;
  if (r >= 19) return 800;
  const progress = (r - 10) / 9.0;
  return Math.round(400 + progress * 400);
}""",
        "replacement": """/**
 * Returns the maximum score for a spot-on guess in Pan Master for a given round.
 * Rounds 1–10: 320 points max (scaled down 20%).
 * Rounds 11–18: Scales up linearly from 320 to 640.
 * Rounds 19 & 20: 640 points max awarded for spot-on guesses in the final 2 rounds (scaled down 20%).
 */
function getPanMasterMaxScore(round: number): number {
  const r = Math.max(1, Math.min(20, round));
  if (r <= 10) return 320;
  if (r >= 19) return 640;
  const progress = (r - 10) / 9.0;
  return Math.round(320 + progress * 320);
}"""
    },
    {
        "file": "src/components/games/FilterDoctorGame.tsx",
        "description": "Filter Doctor base max score (+20%)",
        "target": """    const baseMaxScore = isDualRound ? 200 : 100;
    const maxScore = isEnhancedMode ? Math.round(baseMaxScore * 1.25) : baseMaxScore;""",
        "replacement": """    const baseMaxScore = isDualRound ? 240 : 120;
    const maxScore = isEnhancedMode ? Math.round(baseMaxScore * 1.25) : baseMaxScore;"""
    },
    {
        "file": "src/components/games/FilterDoctorGame.tsx",
        "description": "Filter Doctor halfMax component score (+20%)",
        "target": """      const halfMax = isEnhancedMode ? 125 : 100;""",
        "replacement": """      const halfMax = isEnhancedMode ? 150 : 120;"""
    },
    {
        "file": "src/components/games/FilterDoctorGame.tsx",
        "description": "Filter Doctor baseMaxPoints UI reference (+20%)",
        "target": """  const baseMaxPoints = isDualRound ? 200 : 100;
  const maxPossiblePoints = isEnhancedMode ? Math.round(baseMaxPoints * 1.25) : baseMaxPoints;""",
        "replacement": """  const baseMaxPoints = isDualRound ? 240 : 120;
  const maxPossiblePoints = isEnhancedMode ? Math.round(baseMaxPoints * 1.25) : baseMaxPoints;"""
    },
    {
        "file": "src/components/games/DbMasterGame.tsx",
        "description": "dB Master score scaling (~3x slower than Peak Master: 250 PTS max)",
        "target": """/**
 * Scoring specifications (Single Fader dB Master):
 * - increments of 0.1 dB
 * - 75 points for spot on (diff === 0.0 dB, scaled back by 25% from 100)
 * - Rounds 1 to 10 (Single Fader): Strict precision tolerance:
 *   - diffDb <= 0.5 dB: Hit (64 to 75 PTS)
 *   - diffDb > 0.5 dB: Miss (0 PTS, 1 Life Lost)
 * - Rounds 11 to 20: Standard curve (scaling down to 8 pts at 6.0 dB, >6.0 dB loses 1 life)
 */
export function calculateDbScore(guessDb: number, targetDb: number, roundNumber: number = 1): {
  score: number;
  diffDb: number;
  isHit: boolean;
  status: 'spot_on' | 'excellent' | 'good' | 'pass' | 'miss';
} {
  const diffDb = Math.round(Math.abs(guessDb - targetDb) * 10) / 10;

  if (diffDb === 0.0) {
    return { score: 75, diffDb, isHit: true, status: 'spot_on' };
  }

  // Single Fader Mode - Rounds 1 to 10: Strict pro tolerance (Life lost if diff > 0.5 dB)
  if (roundNumber <= 10) {
    if (diffDb <= 0.5) {
      const rawScore = 100 - (diffDb / 3.0) * 90;
      const score = Math.round(rawScore * 0.75);
      return { score, diffDb, isHit: true, status: 'excellent' };
    }
    // Out by more than 0.5 dB in first 10 rounds -> MISS (0 pts, 1 Life Lost)
    return { score: 0, diffDb, isHit: false, status: 'miss' };
  }

  // Rounds 11–20: Standard single fader curve
  if (diffDb <= 3.0) {
    // Scaled back by 25% (75 pts down to 8 pts)
    const rawScore = 100 - (diffDb / 3.0) * 90;
    const score = Math.round(rawScore * 0.75);
    const status = diffDb <= 1.0 ? 'excellent' : 'good';
    return { score, diffDb, isHit: true, status };
  }

  if (diffDb <= 6.0) {
    return { score: 8, diffDb, isHit: true, status: 'pass' };
  }

  return { score: 0, diffDb, isHit: false, status: 'miss' };
}""",
        "replacement": """/**
 * Scoring specifications (Single Fader dB Master):
 * - increments of 0.1 dB
 * - 250 points for spot on (diff === 0.0 dB, scaled to be ~3x slower than Peak Master)
 * - Rounds 1 to 10 (Single Fader): Strict precision tolerance:
 *   - diffDb <= 0.5 dB: Hit (213 to 250 PTS)
 *   - diffDb > 0.5 dB: Miss (0 PTS, 1 Life Lost)
 * - Rounds 11 to 20: Standard curve (scaling down to 25 pts at 6.0 dB, >6.0 dB loses 1 life)
 */
export function calculateDbScore(guessDb: number, targetDb: number, roundNumber: number = 1): {
  score: number;
  diffDb: number;
  isHit: boolean;
  status: 'spot_on' | 'excellent' | 'good' | 'pass' | 'miss';
} {
  const diffDb = Math.round(Math.abs(guessDb - targetDb) * 10) / 10;

  if (diffDb === 0.0) {
    return { score: 250, diffDb, isHit: true, status: 'spot_on' };
  }

  // Single Fader Mode - Rounds 1 to 10: Strict pro tolerance (Life lost if diff > 0.5 dB)
  if (roundNumber <= 10) {
    if (diffDb <= 0.5) {
      const rawScore = 100 - (diffDb / 3.0) * 90;
      const score = Math.round(rawScore * 2.5);
      return { score, diffDb, isHit: true, status: 'excellent' };
    }
    // Out by more than 0.5 dB in first 10 rounds -> MISS (0 pts, 1 Life Lost)
    return { score: 0, diffDb, isHit: false, status: 'miss' };
  }

  // Rounds 11–20: Standard single fader curve
  if (diffDb <= 3.0) {
    // Scaled to 250 max (250 pts down to 25 pts)
    const rawScore = 100 - (diffDb / 3.0) * 90;
    const score = Math.round(rawScore * 2.5);
    const status = diffDb <= 1.0 ? 'excellent' : 'good';
    return { score, diffDb, isHit: true, status };
  }

  if (diffDb <= 6.0) {
    return { score: 25, diffDb, isHit: true, status: 'pass' };
  }

  return { score: 0, diffDb, isHit: false, status: 'miss' };
}"""
    },
    {
        "file": "src/components/games/StemBalanceConsole.tsx",
        "description": "Stem Balance score scaling (250 PTS max)",
        "target": """    // Calculate score across all stems using the identical formula as single fader (max 75 pts)
    let totalScore = 0;
    let sumDelta = 0;
    for (const st of activeStems) {
      const diff = deltas[st];
      sumDelta += diff;
      let stemScore = 0;
      if (diff === 0.0) {
        stemScore = 75; // Spot on
      } else if (diff <= 3.0) {
        const rawScore = 100 - (diff / 3.0) * 90;
        stemScore = Math.round(rawScore * 0.75); // 75 down to 8 pts
      } else if (diff <= 6.0) {
        stemScore = 8;
      } else {
        stemScore = 0;
      }
      totalScore += stemScore;
    }""",
        "replacement": """    // Calculate score across all stems using the identical formula as single fader (max 250 pts)
    let totalScore = 0;
    let sumDelta = 0;
    for (const st of activeStems) {
      const diff = deltas[st];
      sumDelta += diff;
      let stemScore = 0;
      if (diff === 0.0) {
        stemScore = 250; // Spot on
      } else if (diff <= 3.0) {
        const rawScore = 100 - (diff / 3.0) * 90;
        stemScore = Math.round(rawScore * 2.5); // 250 down to 25 pts
      } else if (diff <= 6.0) {
        stemScore = 25;
      } else {
        stemScore = 0;
      }
      totalScore += stemScore;
    }"""
    },
    {
        "file": "src/utils/glynJohns.ts",
        "description": "Glyn Johns benchmark bot averages proportional update",
        "target": """const MODE_AVERAGES: Record<GameMode, ModeDailyAverage> = {
  peak_master: {
    regularPoints: 7800,
    regularRounds: 20,
    holidayPoints: 3900,
    holidayRounds: 10,
    averageAccuracyOctaves: 0.20,
    bestStreak: 6
  },
  pan_master: {
    regularPoints: 6600,
    regularRounds: 20,
    holidayPoints: 3300,
    holidayRounds: 10,
    averageAccuracyOctaves: 0.18,
    bestStreak: 7
  },
  tye_match: {
    regularPoints: 5700,
    regularRounds: 20,
    holidayPoints: 2850,
    holidayRounds: 10,
    averageAccuracyOctaves: 0.22,
    bestStreak: 5
  },
  filter_doctor: {
    regularPoints: 2000,
    regularRounds: 20,
    holidayPoints: 1000,
    holidayRounds: 10,
    averageAccuracyOctaves: 0.25,
    bestStreak: 5
  },
  db_master: {
    regularPoints: 1000,
    regularRounds: 20,
    holidayPoints: 500,
    holidayRounds: 10,
    averageAccuracyOctaves: 0.30,
    bestStreak: 6
  },""",
        "replacement": """const MODE_AVERAGES: Record<GameMode, ModeDailyAverage> = {
  peak_master: {
    regularPoints: 1000,
    regularRounds: 15,
    holidayPoints: 500,
    holidayRounds: 8,
    averageAccuracyOctaves: 0.35,
    bestStreak: 3
  },
  pan_master: {
    regularPoints: 1200,
    regularRounds: 15,
    holidayPoints: 600,
    holidayRounds: 8,
    averageAccuracyOctaves: 0.28,
    bestStreak: 3
  },
  tye_match: {
    regularPoints: 500,
    regularRounds: 10,
    holidayPoints: 250,
    holidayRounds: 5,
    averageAccuracyOctaves: 0.32,
    bestStreak: 2
  },
  filter_doctor: {
    regularPoints: 600,
    regularRounds: 12,
    holidayPoints: 300,
    holidayRounds: 6,
    averageAccuracyOctaves: 0.38,
    bestStreak: 2
  },
  db_master: {
    regularPoints: 100,
    regularRounds: 8,
    holidayPoints: 50,
    holidayRounds: 4,
    averageAccuracyOctaves: 0.45,
    bestStreak: 2
  },"""
    }
]

def check_all_targets():
    all_ok = True
    for item in EDITS:
        path = os.path.join(WORKSPACE_DIR, item["file"])
        if not os.path.exists(path):
            print(f"❌ File not found: {path}")
            all_ok = False
            continue
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        if item["target"] in content:
            print(f"✅ Ready: {item['description']} ({item['file']})")
        elif item["replacement"] in content:
            print(f"ℹ️ Already applied: {item['description']} ({item['file']})")
        else:
            print(f"❌ Target text not found in {item['file']} for {item['description']}")
            all_ok = False
    return all_ok

def apply_edits():
    for item in EDITS:
        path = os.path.join(WORKSPACE_DIR, item["file"])
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        if item["target"] in content:
            new_content = content.replace(item["target"], item["replacement"])
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f" Applied edit: {item['description']}")
        elif item["replacement"] in content:
            print(f" Already applied: {item['description']}")
        else:
            print(f" Warning: target not matched for {item['description']}")

def commit_git():
    try:
        subprocess.run(["git", "add", "src/"], cwd=WORKSPACE_DIR, check=True)
        commit_msg = (
            "feat: rebalance points across Peak Master, Pan Master, Filter Doctor, and dB Master\n\n"
            "- Peak Master: scale up all gain options by 20% (preserve +25% cuts bonus)\n"
            "- Pan Master: scale down points by 20% (320-640 PTS)\n"
            "- Filter Doctor: scale up points by 20% (120/240 PTS base)\n"
            "- dB Master: scale up spot-on to 250 PTS (~3x slower than Peak Master)\n"
            "- Glyn Johns: update benchmark bot averages proportionally"
        )
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=WORKSPACE_DIR, check=True)
        print("✅ Git commit successful!")
    except Exception as e:
        print(f"Git commit error (or no changes to commit): {e}")

def main():
    if "--dry-run" in sys.argv:
        print("[DRY RUN] Validating all replacement targets...")
        ok = check_all_targets()
        if ok:
            print("\nAll edits verified and ready to apply!")
            sys.exit(0)
        else:
            print("\nDry run failed!")
            sys.exit(1)

    if "--apply" in sys.argv:
        print("Applying point rebalance edits...")
        apply_edits()
        if "--commit" in sys.argv:
            commit_git()
        print("Done!")
        sys.exit(0)

    if "--schedule-at-11pm" in sys.argv:
        # Target time: Today at 23:00 BST (+01:00)
        # Using local time
        now = datetime.now()
        target = now.replace(hour=23, minute=0, second=0, microsecond=0)
        if target < now:
            print(f"Target 23:00 has already passed today ({now}). Exiting.")
            sys.exit(1)
        wait_seconds = (target - now).total_seconds()
        print(f"🕒 Standalone scheduler armed. Waiting {int(wait_seconds)} seconds until 23:00 BST ({target.strftime('%Y-%m-%d %H:%M:%S')})...")
        time.sleep(wait_seconds)
        print(f"⏰ Target time reached: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}. Applying edits...")
        apply_edits()
        commit_git()
        print("🎉 Points rebalance deployed successfully at 23:00 BST!")
        sys.exit(0)

    print("Usage: python3 scripts/rebalance_points.py [--dry-run | --apply [--commit] | --schedule-at-11pm]")

if __name__ == "__main__":
    main()
