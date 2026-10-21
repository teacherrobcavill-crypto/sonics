#!/usr/bin/env python3
"""
Comprehensive Audit & Enforcement Script:
1. Scans ALL 48 student profiles in Firestore.
2. Checks whether ANY student exceeded the 20-round cap on any day or any game mode.
3. Removes all rounds exceeding the 20-round daily limit and retries after 3 lives lost.
4. Recalculates stats, modeStats, streaks, accuracy, rankTitle, and dailyUsage.
5. Commits clean profiles to Firestore.
"""

import sys
import json
import ssl
import urllib.request
import urllib.error
import datetime

SSL_CTX = ssl._create_unverified_context()

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

def fetch_all_students():
    url = f"{BASE_URL}/students?pageSize=100&key={API_KEY}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("documents", [])

def update_firestore(student_id, updated_fields):
    field_paths = ["stats", "modeStats", "dailyUsage", "history", "updatedAt"]
    mask_query = "&".join(f"updateMask.fieldPaths={fp}" for fp in field_paths)
    url = f"{BASE_URL}/students/{student_id}?{mask_query}&key={API_KEY}"
    
    payload = json.dumps({"fields": updated_fields}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PATCH", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=SSL_CTX) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        print(f"HTTPError {e.code}: {error_msg}")
        raise

def process_student(doc, cap_all_historical=True):
    fields = doc.get("fields", {})
    student_id = fields.get("id", {}).get("stringValue")
    name = fields.get("name", {}).get("stringValue", "Unknown")
    history_raw = fields.get("history", {}).get("arrayValue", {}).get("values", [])
    old_stats = fields.get("stats", {}).get("mapValue", {}).get("fields", {})
    old_total_score = int(old_stats.get("totalScore", {}).get("integerValue", 0))
    
    # Parse history entries with date
    parsed_entries = []
    for i, h in enumerate(history_raw):
        hf = h.get("mapValue", {}).get("fields", {})
        m = hf.get("mode", {}).get("stringValue", "unknown")
        score = int(hf.get("score", {}).get("integerValue", 0))
        ts = int(hf.get("timestamp", {}).get("integerValue", 0))
        oct_val = hf.get("freqDistanceOctaves", {})
        oct_dist = float(oct_val.get("doubleValue", oct_val.get("integerValue", 0.0)))
        round_num = int(hf.get("roundNumber", {}).get("integerValue", 0))
        dt = datetime.datetime.fromtimestamp(ts/1000.0, datetime.timezone.utc).strftime("%Y-%m-%d")
        parsed_entries.append({
            "orig_idx": i,
            "dt": dt,
            "mode": m,
            "roundNumber": round_num,
            "score": score,
            "freqDistanceOctaves": oct_dist,
            "timestamp": ts,
            "raw": h
        })
    parsed_entries.sort(key=lambda x: x["timestamp"])
    
    # Group by (date, mode)
    by_date_mode = {}
    for e in parsed_entries:
        k = (e["dt"], e["mode"])
        if k not in by_date_mode:
            by_date_mode[k] = []
        by_date_mode[k].append(e)
        
    valid_entries = []
    dropped_entries = []
    
    for (d, m), r_list in by_date_mode.items():
        is_today = (d == "2026-10-21")
        
        # Determine rules for this day & mode
        # If student is jack_brook or tyler_kirby, enforce lives tracking on 2026-10-21
        count = 0
        lives = 3
        died = False
        
        for item in r_list:
            # Rule 1: On 2026-10-21, cut off retries after losing 3 lives
            if is_today and m in ["pan_master", "peak_master"]:
                if student_id == "jack_brook":
                    # Pan Master session 1 ended at round 14 (14 rounds). Peak Master ended at round 7 (7 rounds).
                    if m == "pan_master" and count >= 14:
                        dropped_entries.append((item, "Pan Master retry after 3 lives lost"))
                        continue
                    if m == "peak_master" and count >= 7:
                        dropped_entries.append((item, "Peak Master retry after 3 lives lost"))
                        continue
                elif student_id == "tyler_kirby":
                    # Pan Master session 1 ended at round 7 (7 rounds).
                    if m == "pan_master" and count >= 7:
                        dropped_entries.append((item, "Pan Master retry after 3 lives lost"))
                        continue
            
            # Rule 2: Strictly cap any day & mode to max 20 rounds
            if count >= 20:
                dropped_entries.append((item, f">20 daily round cap on {d} ({count+1})"))
                continue
                
            count += 1
            valid_entries.append(item)
            
    if not dropped_entries:
        return None, None
        
    valid_entries.sort(key=lambda x: x["timestamp"])
    
    # Bonus points check (difference between old totalScore and sum of all history)
    old_history_score_sum = sum(e["score"] for e in parsed_entries)
    milestone_bonus = max(0, old_total_score - old_history_score_sum)
    
    # Recalculate modeStats
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
    
    # Calculate today's daily rounds
    today_rounds = {}
    for m in ["peak_master", "filter_doctor", "tye_match", "pan_master", "db_master"]:
        today_rounds[m] = len([e for e in valid_entries if e["dt"] == "2026-10-21" and e["mode"] == m])
        
    today_game_over = {}
    for m, cnt in today_rounds.items():
        if cnt >= 20:
            today_game_over[m] = True
    if student_id == "jack_brook":
        today_game_over["pan_master"] = True
        today_game_over["peak_master"] = True
    elif student_id == "tyler_kirby":
        today_game_over["pan_master"] = True
        today_game_over["peak_master"] = True
        today_game_over["filter_doctor"] = True
        
    summary = {
        "studentId": student_id,
        "name": name,
        "oldRounds": len(parsed_entries),
        "newRounds": new_rounds_played,
        "droppedRoundsCount": len(dropped_entries),
        "oldScore": old_total_score,
        "newScore": new_total_score,
        "deductedScore": old_total_score - new_total_score,
        "oldRank": old_stats.get("rankTitle", {}).get("stringValue", "Unknown"),
        "newRank": new_rank_title,
        "todayRounds": today_rounds,
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
                                m: {"integerValue": str(today_rounds.get(m, 0))}
                                for m in ["peak_master", "filter_doctor", "tye_match", "pan_master", "db_master"]
                            }
                        }
                    },
                    "gameOver": {
                        "mapValue": {
                            "fields": {
                                m: {"booleanValue": True}
                                for m, flag in today_game_over.items()
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

def main():
    apply_changes = "--apply" in sys.argv
    print("Fetching all students from Firestore...")
    docs = fetch_all_students()
    print(f"Total students: {len(docs)}")
    
    modified_count = 0
    for doc in docs:
        summary, updated_fields = process_student(doc)
        if not summary:
            continue
            
        modified_count += 1
        s_id = summary["studentId"]
        print(f"\n========================================================")
        print(f"FOUND VIOLATIONS: {summary['name']} ({s_id})")
        print(f"========================================================")
        print(f"Rounds: {summary['oldRounds']} -> {summary['newRounds']} (-{summary['droppedRoundsCount']} rounds dropped)")
        print(f"Score:  {summary['oldScore']:,} -> {summary['newScore']:,} (-{summary['deductedScore']:,} pts deducted)")
        print(f"Rank:   {summary['oldRank']} -> {summary['newRank']}")
        print(f"Today's Valid Rounds: {summary['todayRounds']}")
        print(f"Recalculated Mode Breakdown:")
        for m, d in summary["modeBreakdown"].items():
            print(f"  - {m:<14}: {d['rounds']:>3} rounds | {d['score']:>6,d} pts")
            
        if apply_changes:
            print(f"Applying update to Firestore for {s_id}...")
            update_firestore(s_id, updated_fields)
            print(f"✅ Successfully updated {s_id} in Firestore!")
        else:
            print(f"[DRY RUN] Run with --apply to commit update.")
            
    if modified_count == 0:
        print("\nAll students are within the 20-round cap and rules. No adjustments needed.")
    else:
        print(f"\nProcessed {modified_count} student(s) requiring enforcement.")

if __name__ == "__main__":
    main()
