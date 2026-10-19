#!/usr/bin/env python3
"""
SonicEQ Daily Rank Reminder & Console Briefing Dispatcher
Presents a 1:1 authentic SonicEQ studio hardware rack console UI in rich HTML.
Cycles through game-specific point accumulation tips and dispatches via Apple Mail.
"""

import subprocess
import html
import sys
import datetime
import random

# Curated rotating pool of game-specific point accumulation options and tips
POINT_ACCUMULATION_TIPS = [
    {
        "title": "Speed Multipliers (Peak Master & Filter Doctor)",
        "module": "Peak Master / Filter Doctor",
        "tip": "Lock in your frequency answer within 5 seconds! Fast, decisive identification triggers the speed bonus multiplier, awarding up to <strong>+150 extra points</strong> on top of accuracy.",
        "badge": "SPEED MULTIPLIER"
    },
    {
        "title": "Unity Precision Target (dB Master)",
        "module": "dB Master",
        "tip": "Matching the level within 0.1 dB awards the maximum <strong>75 Spot-On Points</strong>. Use the &plusmn;0.1 dB nudge buttons rather than dragging the fader to nail exact unity!",
        "badge": "PRECISION FADER"
    },
    {
        "title": "Unbroken Streak Multipliers",
        "module": "All Ranked Modules",
        "tip": "String together 5+ consecutive correct hits to activate the Streak Multiplier. Every subsequent hit while your streak remains alive adds an exponential multiplier to your daily total.",
        "badge": "STREAK BONUS"
    },
    {
        "title": "Subtle Cut Detection Over Boosts",
        "module": "Peak Master",
        "tip": "Cuts are harder to identify than boosts but train superior analytical frequency retention. Focus on the scooped band where instrument presence or body thins out.",
        "badge": "FREQUENCY MEMORY"
    },
    {
        "title": "Slope Steepness Matching (Filter Doctor)",
        "module": "Filter Doctor",
        "tip": "Listen carefully to the resonance and skirt steepness: 12 dB/oct allows gentle bleed, while 24 dB/oct creates a surgical brickwall cut. Nailing both slope and corner yields full tier points.",
        "badge": "SLOPE MASTERY"
    },
    {
        "title": "Fine Stereo Localization (Pan Master)",
        "module": "Pan Master",
        "tip": "Subtle off-center positions (10% to 25% L/R) carry the highest scoring weight. Close your eyes and focus on the phantom center shift before locking in your stereo angle.",
        "badge": "STEREO FIELD"
    },
    {
        "title": "Daily 20-Round Maximum Yield",
        "module": "All Games",
        "tip": "You have a fresh bank of 20 ranked rounds per game every day. Playing your full quota daily is the #1 proven driver for climbing through the 24 academic rank ladder tiers.",
        "badge": "DAILY QUOTA"
    },
    {
        "title": "Practice Mode Ear Warmup",
        "module": "Pre-Session Drill",
        "tip": "Always warm up your ears in Practice Mode before using your daily ranked lives. Get your room acoustics and listening volume dialed in with zero risk to your streak or score.",
        "badge": "PRACTICE DRILL"
    },
    {
        "title": "Reference Track Consistency",
        "module": "Audio Profile",
        "tip": "Set your Audio Profile default track to a genre you know inside out (or load your own reference track). Familiar transients make frequency variations instantly recognizable.",
        "badge": "ACOUSTIC MEMORY"
    }
]

def get_todays_focus(day_offset: int = 0) -> dict:
    """Cycles deterministically through tips based on calendar day of year."""
    day_num = (datetime.date.today().timetuple().tm_yday + day_offset) % len(POINT_ACCUMULATION_TIPS)
    return POINT_ACCUMULATION_TIPS[day_num]

def build_console_email_html(
    student_name: str,
    rank: int = 1,
    total_students: int = 24,
    score: int = 2450,
    rank_title: str = "Audio Alchemist",
    cohort_year: str = "2026",
    day_offset: int = 0
) -> str:
    focus = get_todays_focus(day_offset)

    # Dynamic studio copy based on standing
    if rank <= 3:
        standing_badge = "PODIUM LEADER • GOLDEN EARS"
        standing_color = "#fbbf24"
        standing_headline = "Master Console Commander: Your Ears Are Razor Sharp"
        standing_body = (
            f"Sensational work, <strong>{html.escape(student_name)}</strong>. You are currently holding "
            f"<strong style='color:#fbbf24;'>Rank #{rank}</strong> on the {cohort_year} leaderboard with "
            f"<strong>{score:,} points</strong> ({rank_title}). Your frequency accuracy is setting the standard "
            f"for the entire class. Defend your top spot on the console today!"
        )
    elif rank <= max(4, total_students // 2):
        standing_badge = "TOP TIER CONTENDER"
        standing_color = "#38bdf8"
        standing_headline = "Solid Calibration: You're in Striking Distance"
        standing_body = (
            f"Great ears, <strong>{html.escape(student_name)}</strong>. You are currently ranked "
            f"<strong style='color:#38bdf8;'>Rank #{rank}</strong> out of {total_students} with "
            f"<strong>{score:,} points</strong> ({rank_title}). A clean, high-accuracy run across "
            f"today's modules will launch you straight onto the podium!"
        )
    else:
        standing_badge = "CALIBRATION READY"
        standing_color = "#a78bfa"
        standing_headline = "Faders Ready: Time to Train Your Frequency Memory"
        standing_body = (
            f"Welcome back to the console, <strong>{html.escape(student_name)}</strong>. You are currently at "
            f"<strong>Rank #{rank}</strong> with <strong>{score:,} points</strong>. Ear training is pure muscle "
            f"memory—spend 5 minutes at the console today, bank your points, and climb the rank ladder!"
        )

    # Build 1:1 authentic SonicEQ studio UI email
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sonics Studio Console Dispatch</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">

  <!-- Outer Canvas -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 30px 10px;">
    <tr>
      <td align="center">

        <!-- Main Studio Rack Chassis -->
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #0b1120; border: 2px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);">
          
          <!-- Rack Top Bar with Screws & Audio Specs -->
          <tr>
            <td style="background: linear-gradient(180deg, #162033 0%, #0d1527 100%); padding: 14px 20px; border-bottom: 2px solid #1e293b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Left Rack Screw & Title -->
                  <td align="left" style="vertical-align: middle;">
                    <div style="display: inline-block; vertical-align: middle; width: 14px; height: 14px; border-radius: 50%; background: #334155; border: 1px solid #64748b; color: #94a3b8; font-family: monospace; font-size: 10px; line-height: 14px; text-align: center; margin-right: 10px;">+</div>
                    <span style="display: inline-block; vertical-align: middle; font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #38bdf8; text-transform: uppercase;">SONICS &bull; STUDIO CONSOLE</span>
                  </td>
                  <!-- Right Audio Clock & Status LED -->
                  <td align="right" style="vertical-align: middle;">
                    <span style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; color: #10b981; font-weight: 700; background: rgba(16,185,129,0.12); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3);">
                      ● 48 kHz / 24-BIT &bull; ONLINE
                    </span>
                    <div style="display: inline-block; vertical-align: middle; width: 14px; height: 14px; border-radius: 50%; background: #334155; border: 1px solid #64748b; color: #94a3b8; font-family: monospace; font-size: 10px; line-height: 14px; text-align: center; margin-left: 10px;">+</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- LED Peak Meter Bar -->
          <tr>
            <td style="background-color: #070c18; padding: 8px 24px; border-bottom: 1px solid #1a2336;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 9px; color: #475569; letter-spacing: 2px;">VU METER</td>
                  <td align="right" style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; letter-spacing: 3px;">
                    <span style="color: #10b981;">■■■■■■■■</span><span style="color: #fbbf24;">■■■■■</span><span style="color: #f43f5e;">■■</span>
                    <span style="color: #64748b; font-size: 9px; margin-left: 6px;">0 dB</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Console Body -->
          <tr>
            <td style="padding: 28px 26px;">

              <!-- Standing Status Card -->
              <div style="margin-bottom: 22px;">
                <div style="display: inline-block; font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; font-weight: 800; color: {standing_color}; letter-spacing: 1px; text-transform: uppercase; background: rgba(15,23,42,0.8); border: 1px solid {standing_color}; padding: 4px 10px; border-radius: 6px; margin-bottom: 12px;">
                  {standing_badge}
                </div>
                <h2 style="margin: 0 0 10px; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">
                  {standing_headline}
                </h2>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                  {standing_body}
                </p>
              </div>

              <!-- HUD Digital Readout Box (Like in-game profile) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #050811; border: 1px solid #1e293b; border-radius: 14px; margin-bottom: 24px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);">
                <!-- Station Callsign Header -->
                <tr>
                  <td colspan="3" style="padding: 10px 16px; background-color: #0a0f1d; border-bottom: 1px solid #1e293b; border-radius: 14px 14px 0 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                          STUDIO CALLSIGN: <strong style="color: #e2e8f0;">{html.escape(student_name).upper()}</strong>
                        </td>
                        <td align="right" style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; color: #38bdf8; font-weight: 700;">
                          COHORT {cohort_year}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- 3 Metric Cells -->
                <tr>
                  <td style="padding: 16px 12px; text-align: center; border-right: 1px solid #1e293b;" width="33%">
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px;">CLASS RANK</div>
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 24px; font-weight: 900; color: #38bdf8;">
                      #{rank}
                      <span style="font-size: 11px; color: #64748b; font-weight: 400;">/{total_students}</span>
                    </div>
                  </td>
                  <td style="padding: 16px 12px; text-align: center; border-right: 1px solid #1e293b;" width="34%">
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px;">TOTAL SCORE</div>
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 24px; font-weight: 900; color: #fbbf24;">
                      {score:,}
                    </div>
                  </td>
                  <td style="padding: 16px 12px; text-align: center;" width="33%">
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px;">CURRENT TITLE</div>
                    <div style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 13px; font-weight: 800; color: #34d399; margin-top: 4px;">
                      {rank_title}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- TODAY'S CONSOLE FOCUS BOX (Cycling Point Accumulation Tips) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #0d1527 0%, #070d1a 100%); border: 1px solid #25334d; border-left: 4px solid #00f0ff; border-radius: 12px; margin-bottom: 26px; overflow: hidden;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;">
                      <tr>
                        <td align="left">
                          <span style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 10px; font-weight: 900; color: #00f0ff; letter-spacing: 1.5px; text-transform: uppercase;">
                            TODAY'S CONSOLE FOCUS &bull; {focus['badge']}
                          </span>
                        </td>
                        <td align="right">
                          <span style="font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 9px; color: #64748b; text-transform: uppercase;">
                            {focus['module']}
                          </span>
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">
                      {focus['title']}
                    </div>
                    <div style="font-size: 13px; line-height: 1.6; color: #cbd5e1;">
                      {focus['tip']}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Main Game Launch CTA Button (In-Game Style) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="https://sonics.rjcmusicproduction.co.uk" target="_blank" style="display: block; background: #00f0ff; color: #040914; font-family: 'SF Mono', Menlo, Monaco, monospace; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; padding: 16px 28px; border-radius: 12px; text-decoration: none; box-shadow: 0 0 25px rgba(0, 240, 255, 0.45); border: 1px solid #7df9ff; text-align: center;">
                      [ LAUNCH STUDIO CONSOLE &bull; START SESSION ]
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct URL Subtext -->
              <div style="text-align: center; font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 11px; color: #64748b;">
                Direct Station Link: <a href="https://sonics.rjcmusicproduction.co.uk" style="color: #38bdf8; text-decoration: none;">sonics.rjcmusicproduction.co.uk</a>
              </div>

            </td>
          </tr>

          <!-- Studio Chassis Bottom Bar with Screws & Safety Notice -->
          <tr>
            <td style="background-color: #060a14; padding: 16px 20px; border-top: 2px solid #1e293b; text-align: center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" width="20">
                    <div style="width: 14px; height: 14px; border-radius: 50%; background: #334155; border: 1px solid #64748b; color: #94a3b8; font-family: monospace; font-size: 10px; line-height: 14px; text-align: center;">+</div>
                  </td>
                  <td align="center" style="font-size: 11px; color: #475569; line-height: 1.5;">
                    SONICS &bull; AES/EBU MONITORED EAR TRAINING CONSOLE<br>
                    Maintain safe SPL monitor levels (85 dBA reference) &bull; RJC Music Production
                  </td>
                  <td align="right" width="20">
                    <div style="width: 14px; height: 14px; border-radius: 50%; background: #334155; border: 1px solid #64748b; color: #94a3b8; font-family: monospace; font-size: 10px; line-height: 14px; text-align: center;">+</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>"""

def send_via_apple_mail(
    to_email: str,
    subject: str,
    html_content: str,
    sender: str = "Sonics <sonics@rjcmusicproduction.co.uk>"
) -> bool:
    """
    Sends rich HTML email via macOS Mail using the official 'set html content' command
    from Sonics <sonics@rjcmusicproduction.co.uk>.
    """
    escaped_subject = subject.replace('\\', '\\\\').replace('"', '\\"')
    escaped_sender = sender.replace('\\', '\\\\').replace('"', '\\"')
    escaped_html = html_content.replace('\\', '\\\\').replace('"', '\\"')
    
    applescript = f'''
    tell application "Mail"
        set newMsg to make new outgoing message with properties {{subject:"{escaped_subject}", sender:"{escaped_sender}", visible:false}}
        tell newMsg
            set html content to "{escaped_html}"
            make new to recipient at end of to recipients with properties {{address:"{to_email}"}}
            send
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error dispatching via Mail.app: {res.stderr}", file=sys.stderr)
        return False
    return True

if __name__ == "__main__":
    recipient = sys.argv[1] if len(sys.argv) > 1 else "bobbycavill@icloud.com"
    day_offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    print(f"Generating authentic Sonics Studio Console dispatch for {recipient}...")
    sample_html = build_console_email_html(
        student_name="Bobby Cavill",
        rank=1,
        total_students=24,
        score=2450,
        rank_title="Console Commander",
        cohort_year="2026",
        day_offset=day_offset
    )

    focus = get_todays_focus(day_offset)
    subject = f"🎛️ Sonics Studio Console: Today's Standing & {focus['badge']}"

    print(f"Subject: {subject}")
    print(f"Today's Focus: {focus['title']} ({focus['module']})")
    print(f"Dispatching to {recipient} via macOS Mail...")

    if send_via_apple_mail(recipient, subject, sample_html):
        print("Success! Dispatched authentic SonicEQ console email.")
    else:
        print("Failed to dispatch.")
        sys.exit(1)
