# Sonics

An audio frequency and EQ ear-training web application. Built with **Web Audio API**, **React**, **TypeScript**, and **Tailwind CSS**.

---

## Features & Training Modes

### 1. **Peak Master (Parametric EQ)**
- **Parametric Bell Filter** boost or cut at mystery frequencies.
- Multiple difficulty granularities:
  - **1-Octave** (9 standard ISO bands: 63 Hz to 16 kHz)
  - **2/3-Octave** (14 ISO bands)
  - **1/3-Octave** (30 ISO bands)
- Selectable boost/cut gains (+/- 6 dB, +/- 9 dB, +/- 12 dB) and optional cuts.
- Instant score up to 1,000 points, error calculation in **semitones** and **octaves**, and visual curve comparison.

### 2. **Filter Doctor (HPF & LPF Cutoff Training)**
- Focuses specifically on **High-Pass Filters** (Low Cut) and **Low-Pass Filters** (High Cut).
- Two slope settings: **12 dB/octave** (smooth 2nd-order) and **24 dB/octave** (steep 4th-order).
- Train your ears to detect low-end mud removal (30 Hz - 1 kHz) and high-end air roll-off (1 kHz - 18 kHz).

### 3. **Shelving Scout (Low Shelf & High Shelf EQ)**
- Identifies broad tone shaping with **Low Shelf** (bass body) and **High Shelf** (treble brilliance).
- Identifies shelf type, direction (Boost vs. Cut), and corner turnover frequency.

### 4. **Interactive EQ Match & Correct Mode**
- **Match EQ**: An unknown EQ curve is applied to the track. Use interactive knobs or drag directly on the frequency spectrum to dial in an identical curve.
- **Correct / Invert EQ**: An unwanted resonant spike or dip is added to the track. Use your EQ to counteract it and restore flat response!
- Audition between **[A] Flat**, **[B] Target EQ**, and **[C] Your EQ**.

### 5. **EQ Laboratory & Sandbox**
- 5-band interactive parametric/shelving/filter testing bench with real-time 60 FPS FFT spectrum visualizer.
- Practice sweeping resonant peaks across any sound to develop intuitive frequency memory.

---

## Built-In Audio Sources & Custom File Loader

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause audio playback |
| `1` or `A` | Audition **[A] FLAT** (Clean / Bypass) |
| `2` or `B` | Audition **[B] EQ ON** (Target Mystery EQ) |
| `3` or `C` | Audition **[C] YOUR EQ** (Interactive Match EQ) |

---

## Running the App

```bash
# Start Vite development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```
