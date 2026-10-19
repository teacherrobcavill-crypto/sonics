#!/usr/bin/env python3
"""
SonicEQ Daily Rank Reminder & Encouragement Dispatcher
Sends lighthearted, audio-themed daily updates to registered students.
"""

import subprocess
import html
import sys

def create_email_html(student_name: str, rank: int, total_students: int, score: int, rank_title: str) -> str:
    # Tailored audio-themed copy based on standing
    if rank <= 3:
        status_headline = "🔥 You're Red-Lining the Studio Meters!"
        encouragement = (
            f"Sensational work, <strong>{html.escape(student_name)}</strong>! You're currently ranked "
            f"<strong>#{rank}</strong> out of {total_students} sound engineers with a massive <strong>{score:,} points</strong>. "
            f"Your ears are tuned to surgical perfection. The rest of the class is gunning for your crown—hop in today and protect your top spot on the console!"
        )
        badge_style = "background: linear-gradient(135deg, #f59e0b, #d97706); color: #000;"
    elif rank <= max(4, total_students // 2):
        status_headline = "🎛️ Crisp Highs & Solid Mids: Great Progress!"
        encouragement = (
            f"Solid ear training, <strong>{html.escape(student_name)}</strong>! You're sitting pretty at "
            f"<strong>#{rank}</strong> out of {total_students} on the leaderboard with <strong>{score:,} points</strong> ({rank_title}). "
            f"You're right on the heels of the top tier. Just a couple of clean boost/cut rounds today could catapult you straight onto the podium!"
        )
        badge_style = "background: linear-gradient(135deg, #06b6d4, #0284c7); color: #000;"
    else:
        status_headline = "🎧 Time to Calibrate: The Faders Are Waiting!"
        encouragement = (
            f"Hey <strong>{html.escape(student_name)}</strong>, every legendary producer started with raw frequencies! "
            f"You're currently at <strong>#{rank}</strong> ({score:,} pts). Don't let your ears go cold! "
            f"Jump into today's quick 5-minute training session, dial in those 1kHz cuts, and watch your rank soar up the ladder."
        )
        badge_style = "background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;"

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Daily SonicEQ Ear Training Briefing</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #111827; border: 1px solid #1f293d; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #06b6d4, #3b82f6); padding: 28px 30px; text-align: left;">
              <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #021a24; margin-bottom: 4px;">Studio Dispatch &bull; Ear Training Daily</div>
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">SonicEQ Daily Briefing</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 30px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #38bdf8; font-weight: 700;">{status_headline}</h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                {encouragement}
              </p>

              <!-- Rank Stat Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 18px; text-align: center; border-right: 1px solid #1e293b;" width="33%">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px;">Your Rank</div>
                    <div style="font-size: 22px; font-weight: 900; color: #38bdf8;">#{rank} <span style="font-size: 12px; color: #64748b;">/ {total_students}</span></div>
                  </td>
                  <td style="padding: 18px; text-align: center; border-right: 1px solid #1e293b;" width="34%">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px;">Total Score</div>
                    <div style="font-size: 22px; font-weight: 900; color: #fbbf24;">{score:,}</div>
                  </td>
                  <td style="padding: 18px; text-align: center;" width="33%">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px;">Rank Title</div>
                    <div style="font-size: 13px; font-weight: 800; color: #a78bfa; margin-top: 4px;">{rank_title}</div>
                  </td>
                </tr>
              </table>

              <!-- Call To Action Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://sonics.rjcmusicproduction.co.uk" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #06b6d4, #0284c7); color: #04121c; text-decoration: none; font-size: 15px; font-weight: 800; padding: 14px 34px; border-radius: 12px; box-shadow: 0 4px 15px rgba(6,182,212,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      Launch Studio Session &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin-top: 14px;">
                <span style="font-size: 12px; color: #64748b;">Direct link: <a href="https://sonics.rjcmusicproduction.co.uk" style="color: #38bdf8; text-decoration: none;">sonics.rjcmusicproduction.co.uk</a></span>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #080c14; padding: 20px 30px; border-top: 1px solid #1a2233; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
                Keep your monitoring volume safe &bull; Practice daily for maximum frequency retention.<br>
                Sent with &hearts; from Bobby Cavill &bull; Audio Music Production
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

def send_via_apple_mail(to_email: str, subject: str, html_content: str):
    escaped_subject = subject.replace('"', '\\"')
    escaped_html = html_content.replace('\\', '\\\\').replace('"', '\\"')
    
    script = f'''
    tell application "Mail"
        set newMsg to make new outgoing message with properties {{subject:"{escaped_subject}", visible:false}}
        tell newMsg
            make new to recipient at end of to recipients with properties {{address:"{to_email}"}}
            set html content to "{escaped_html}"
            send
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error sending to {to_email}: {res.stderr}", file=sys.stderr)
        return False
    return True

if __name__ == "__main__":
    recipient = sys.argv[1] if len(sys.argv) > 1 else "bobbycavill@icloud.com"
    print(f"Sending daily briefing test to {recipient}...")
    sample_html = create_email_html(
        student_name="Bobby Cavill",
        rank=1,
        total_students=24,
        score=2450,
        rank_title="Console Commander"
    )
    if send_via_apple_mail(recipient, "🎛️ Your SonicEQ Daily Ear Training Briefing & Leaderboard Rank", sample_html):
        print("Successfully dispatched via Apple Mail!")
    else:
        print("Failed to dispatch.")
