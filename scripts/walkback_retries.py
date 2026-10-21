#!/usr/bin/env python3
"""
Walk back retry rounds after 3 lives were lost for Jack Brook and Tyler Kirby.
- Jack Brook: 
    * Pan Master: 34 retry rounds dropped (-7,945 pts)
    * Peak Master: 1 retry round dropped (-97 pts)
    * Total deduction: -8,042 pts (from 38,835 -> 30,793)
- Tyler Kirby:
    * Pan Master: 6 retry rounds dropped (-1,696 pts)
    * Total deduction: -1,696 pts (from 25,687 -> 23,991)
    (Optional --cap-all-20 also caps Filter Doctor rounds 21-38: -1,995 pts -> 21,996)
"""

import sys
import json
import urllib.request
import urllib.error

API_KEY = "AIzaSyC3lS45ktSv4Jou7cxv6Oi9gb8GKiNwN1Y"
BASE_URL = "https://firestore.googleapis.com/v1/projects/soniceq-96d91/databases/(default)/documents"

ACADEMIC_RANKS = [
    (10000000, "Legendary Golden Ears"),
    (9800000, "Grandmaster of EQ"),
    (9500000, "Spectral Virtuoso"),
    (9100000, "Mastering Engineer"),
    (8600000, "Acoustic Consultant"),
    (8000000, "Senior Mix Engineer"),
    (7400000, "Dynamic EQ Specialist"),
    (6800000, "Surgical EQ Specialist"),
    (6200000, "Harmonic Balancer"),
    (5600000, "Critical Listening Fellow"),
    (5000000, "Lead Mix Engineer"),
    (4400000, "Advanced Critical Listener"),
    (3800000, "Frequency Analyzer"),
    (3200000, "Sonic Sculptor"),
    (2700000, "Studio Tracking Engineer"),
    (2100000, "Spectral Apprentice"),
    (1600000, "Resonance Hunter"),
    (1100000, "Assistant Tracking Engineer"),
    (650000, "Patchbay Assistant"),
    (300000, "Acoustic Trainee"),
    (150000, "Tone Calibrator"),
    (50000, "Ear Cadet"),
    (10000, "Frequency Observer"),
    (0, "Audio Novice")
]

def get_rank_title(score):
    for min_score, title in ACADEMIC_RANKS:
        if score >= min_score:
            return title
    return "Audio Novice"

def fetch_student(student_id):
    url = f"{BASE_URL}/students/{student_id}?key={API_KEY}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def walkback_student(doc_data, cap_filter_doctor=False):
    fields = doc_data.get("fields", {})
    student_id = fields.get("id", {}).get("stringValue")
    name = fields.get("name", {}).get("stringValue")
    history_raw = fields.get("history", {}).get("arrayValue", {}).get("values", [])
    
    parsed_entries = []
    for i, h in enumerate(history_raw):
        hf = h.get("mapValue", {}).get("fields", {})
        mode = hf.get("mode", {}).get("stringValue", "unknown")
        score = int(hf.get("score", {}).get("integerValue", 0))
        ts = int(hf.get("timestamp", {}).get("integerValue", 0))
        oct_val = hf.get("freqDistanceOctaves", {})
        oct_dist = float(oct_val.get("doubleValue", oct_val.get("integerValue", 0.0)))
        round_num = int(hf.get("roundNumber", {}).get("integerValue", 0))
        parsed_entries.append({
            "orig_index": i,
            "timestamp": ts,
            "mode": mode,
            "roundNumber": round_num,
            "score": score,
            "freqDistanceOctaves": oct_dist,
            "raw": h
        })
    
    valid_entries = []
    dropped_entries = []
    
    # Mode round counters for today (2026-10-21)
    daily_round_counts = {}
    game_over_flags = {}
    
    for entry in parsed_entries:
        i = entry["orig_index"]
        m = entry["mode"]
        ts = entry["timestamp"]
        
        # Check if entry is from today (ts >= 1792500000000)
        is_today = ts >= 1792500000000
        
        should_drop = False
        drop_reason = ""
        
        if student_id == "jack_brook" and is_today:
            # Pan Master: Session 1 is idx 162..175 (14 rounds). Retries are idx 176..192, 216..231, 241
            if m == "pan_master" and i >= 176:
                should_drop = True
                drop_reason = f"Pan Master retry after 3 lives lost (idx {i}, round {entry['roundNumber']})"
            # Peak Master: Session 1 is idx 193..196, 205..207 (7 rounds). Retry is idx 240
            elif m == "peak_master" and i == 240:
                should_drop = True
                drop_reason = f"Peak Master retry after 3 lives lost (idx {i}, round {entry['roundNumber']})"
                
        elif student_id == "tyler_kirby" and is_today:
            # Pan Master: Session 1 is idx 224..230 (7 rounds). Retry is idx 231..236
            if m == "pan_master" and i >= 231:
                should_drop = True
                drop_reason = f"Pan Master retry after 3 lives lost (idx {i}, round {entry['roundNumber']})"
            # Filter Doctor: if cap_filter_doctor is enabled, drop rounds 21..38
            elif m == "filter_doctor" and cap_filter_doctor and i >= 206:
                should_drop = True
                drop_reason = f"Filter Doctor beyond 20 round limit (idx {i}, round {entry['roundNumber']})"
                
        if should_drop:
            dropped_entries.append((entry, drop_reason))
        else:
            valid_entries.append(entry)
            if is_today:
                daily_round_counts[m] = daily_round_counts.get(m, 0) + 1
                
    if student_id == "jack_brook":
        game_over_flags["pan_master"] = True
        game_over_flags["peak_master"] = True
    elif student_id == "tyler_kirby":
        game_over_flags["pan_master"] = True
        game_over_flags["peak_master"] = True
        if cap_filter_doctor:
            game_over_flags["filter_doctor"] = True

    # Check for bonus points (difference between old stats.totalScore and sum of all history scores)
    old_stats = fields.get("stats", {}).get("mapValue", {}).get("fields", {})
    old_total_score = int(old_stats.get("totalScore", {}).get("integerValue", 0))
    old_history_score_sum = sum(e["score"] for e in parsed_entries)
    milestone_bonus = max(0, old_total_score - old_history_score_sum)
    
    # Recalculate mode stats
    mode_stats_recalc = {}
    for m in ["peak_master", "pan_master", "filter_doctor", "db_master", "tye_match"]:
        m_entries = [e for e in valid_entries if e["mode"] == m]
        if not m_entries:
            continue
        m_rounds = len(m_entries)
        m_score = sum(e["score"] for e in m_entries)
        m_avg_oct = (sum(e["freqDistanceOctaves"] for e in m_entries) / m_rounds) if m_rounds > 0 else 0.0
        
        curr_strk = 0
        best_strk = 0
        for e in m_entries:
            is_good = e["score"] >= 50 if m == "db_master" else e["score"] >= 600
            if is_good:
                curr_strk += 1
                best_strk = max(best_strk, curr_strk)
            else:
                curr_strk = 0
                
        mode_stats_recalc[m] = {
            "roundsPlayed": m_rounds,
            "totalScore": m_score,
            "averageAccuracyOctaves": m_avg_oct,
            "currentStreak": curr_strk,
            "bestStreak": best_strk,
            "rankTitle": get_rank_title(m_score)
        }
        
    # Recalculate overall stats
    new_rounds_played = len(valid_entries)
    new_valid_score_sum = sum(e["score"] for e in valid_entries)
    new_total_score = new_valid_score_sum + milestone_bonus
    new_avg_octaves = (sum(e["freqDistanceOctaves"] for e in valid_entries) / new_rounds_played) if new_rounds_played > 0 else 0.0
    
    overall_curr_strk = 0
    overall_best_strk = 0
    for e in valid_entries:
        is_good = e["score"] >= 50 if e["mode"] == "db_master" else e["score"] >= 600
        if is_good:
            overall_curr_strk += 1
            overall_best_strk = max(overall_best_strk, overall_curr_strk)
        else:
            overall_curr_strk = 0
            
    new_rank_title = get_rank_title(new_total_score)
    
    summary = {
        "studentId": student_id,
        "name": name,
        "oldRounds": len(parsed_entries),
        "newRounds": new_rounds_played,
        "droppedRoundsCount": len(dropped_entries),
        "droppedDetails": dropped_entries,
        "oldScore": old_total_score,
        "newScore": new_total_score,
        "deductedScore": old_total_score - new_total_score,
        "oldRank": old_stats.get("rankTitle", {}).get("stringValue", "Unknown"),
        "newRank": new_rank_title,
        "dailyRoundCounts": daily_round_counts,
        "modeBreakdown": {m: {"rounds": ms["roundsPlayed"], "score": ms["totalScore"]} for m, ms in mode_stats_recalc.items()}
    }
    
    updated_fields = {
        "stats": {
            "mapValue": {
                "fields": {
                    "totalScore": {"integerValue": str(new_total_score)},
                    "roundsPlayed": {"integerValue": str(new_rounds_played)},
                    "currentStreak": {"integerValue": str(overall_curr_strk)},
                    "bestStreak": {"integerValue": str(overall_best_strk)},
                    "averageAccuracyOctaves": {"doubleValue": new_avg_octaves},
                    "rankTitle": {"stringValue": new_rank_title}
                }
            }
        },
        "modeStats": {
            "mapValue": {
                "fields": {
                    m: {
                        "mapValue": {
                            "fields": {
                                "roundsPlayed": {"integerValue": str(ms["roundsPlayed"])},
                                "totalScore": {"integerValue": str(ms["totalScore"])},
                                "currentStreak": {"integerValue": str(ms["currentStreak"])},
                                "bestStreak": {"integerValue": str(ms["bestStreak"])},
                                "averageAccuracyOctaves": {"doubleValue": ms["averageAccuracyOctaves"]},
                                "rankTitle": {"stringValue": ms["rankTitle"]}
                            }
                        }
                    }
                    for m, ms in mode_stats_recalc.items()
                }
            }
        },
        "dailyUsage": {
            "mapValue": {
                "fields": {
                    "date": {"stringValue": "2026-10-21"},
                    "rounds": {
                        "mapValue": {
                            "fields": {
                                m: {"integerValue": str(daily_round_counts.get(m, 0))}
                                for m in ["peak_master", "filter_doctor", "tye_match", "pan_master", "db_master"]
                            }
                        }
                    },
                    "gameOver": {
                        "mapValue": {
                            "fields": {
                                m: {"booleanValue": True}
                                for m, flag in game_over_flags.items()
                                if flag
                            }
                        }
                    }
                }
            }
        },
        "history": {
            "arrayValue": {
                "values": [e["raw"] for e in valid_entries]
            }
        },
        "updatedAt": {"integerValue": str(int(valid_entries[-1]["timestamp"]) if valid_entries else 1792500000000)}
    }
    
    return summary, updated_fields

def update_firestore(student_id, updated_fields):
    field_paths = ["stats", "modeStats", "dailyUsage", "history", "updatedAt"]
    mask_query = "&".join(f"updateMask.fieldPaths={fp}" for fp in field_paths)
    url = f"{BASE_URL}/students/{student_id}?{mask_query}&key={API_KEY}"
    
    payload = json.dumps({"fields": updated_fields}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PATCH", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        print(f"HTTPError {e.code}: {error_msg}")
        raise

def main():
    apply_changes = "--apply" in sys.argv
    cap_all_20 = "--cap-all-20" in sys.argv
    target_ids = ["jack_brook", "tyler_kirby"]
    
    for s_id in target_ids:
        print(f"\n========================================================")
        print(f"PROCESSING STUDENT: {s_id}")
        print(f"========================================================")
        doc = fetch_student(s_id)
        
        # Save backup
        backup_filename = f"{s_id}_backup_oct21.json"
        with open(backup_filename, "w") as f:
            json.dump(doc, f, indent=2)
        print(f"Backed up {s_id} raw profile to {backup_filename}")
        
        summary, updated_fields = walkback_student(doc, cap_filter_doctor=cap_all_20)
        
        print(f"Name: {summary['name']} ({summary['studentId']})")
        print(f"Rounds: {summary['oldRounds']} -> {summary['newRounds']} (-{summary['droppedRoundsCount']} rounds removed)")
        print(f"Points: {summary['oldScore']:,} -> {summary['newScore']:,} (-{summary['deductedScore']:,} points deducted)")
        print(f"Rank:   {summary['oldRank']} -> {summary['newRank']}")
        print(f"Today's Adjusted Rounds:")
        for m, count in summary['dailyRoundCounts'].items():
            print(f"  - {m}: {count} rounds")
        print(f"\nDropped Rounds Summary:")
        dropped_by_mode = {}
        for entry, reason in summary['droppedDetails']:
            m = entry['mode']
            dropped_by_mode[m] = dropped_by_mode.get(m, 0) + 1
        for m, cnt in dropped_by_mode.items():
            print(f"  - {m}: {cnt} rounds dropped")
            
        if apply_changes:
            print(f"\nApplying update to Firestore for {s_id}...")
            res = update_firestore(s_id, updated_fields)
            print(f"✅ Successfully updated {s_id} in Firestore!")
        else:
            print(f"\n[DRY RUN] Run with --apply to commit these adjustments to Firestore.")

if __name__ == "__main__":
    main()
