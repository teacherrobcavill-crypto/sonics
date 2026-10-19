/**
 * ANSI C16.5 / IEC 60268-10 Analog VU Meter Ballistics Engine
 * Ported directly from plugin designs/vu-compressor/dsp/VUMeterBallistics.hpp
 * 
 * Simulates a physical moving-coil galvanometer needle:
 * - 2nd-order damped mass-spring-damper mechanical dynamics
 * - Resonant frequency ~2.2 Hz (omega0 = 14.0), damping ratio zeta = 0.75
 * - Matches ANSI C16.5 standards (~300ms integration time, ~1.5% mechanical needle bounce)
 */

export class VUMeterBallistics {
  private position: number = 0.0;
  private velocity: number = 0.0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.position = 0.0;
    this.velocity = 0.0;
  }

  /**
   * Update the VU needle with a new target value (normalized 0.0 to 1.0).
   * @param targetValue Normalized target (0.0 = 0 dB rest, 1.0 = -20 dB full deflection)
   * @param dt Elapsed time in seconds (e.g. 1.0 / 60.0 for 60 FPS)
   */
  public update(targetValue: number, dt: number): void {
    const omega0 = 14.0; // ~2.2 Hz mechanical natural frequency
    const zeta = 0.75;   // slightly underdamped for organic physical needle bounce
    const steps = 10;    // numerical sub-stepping for integration stability
    const subDt = dt / steps;

    for (let i = 0; i < steps; ++i) {
      const acceleration = (omega0 * omega0) * (targetValue - this.position) - 2.0 * zeta * omega0 * this.velocity;
      this.velocity += acceleration * subDt;
      this.position += this.velocity * subDt;
    }

    // Mechanical needle stop pins
    this.position = Math.max(-0.05, Math.min(1.08, this.position));
  }

  public getPosition(): number {
    return this.position;
  }

  /**
   * Map gain reduction (in dB, where 0 dB is rest and -20 dB is full scale)
   * to normalized needle position [0.0 = 0 dB, 1.0 = -20 dB or more].
   */
  public static mapGainReductionToNormalized(grDb: number): number {
    const grMag = Math.max(0.0, -grDb);
    if (grMag <= 0.0) return 0.0;
    if (grMag >= 20.0) return 1.0;

    // Power curve matching classic printed VU meter dial markings:
    // 0 dB at 0.0, -3 dB at ~0.25, -7 dB at ~0.50, -10 dB at ~0.65, -20 dB at 1.0
    return Math.pow(grMag / 20.0, 0.75);
  }

  /**
   * Converts normalized needle position (0.0 to 1.0) to needle angle in radians
   * for a +/- 43 degree sweep on an analog meter face.
   */
  public static positionToAngle(normalizedPos: number): number {
    const maxAngleDeg = 43.0;
    // 0.0 -> -43 deg (pointing to 0 dB / rest on left), 1.0 -> +43 deg (pointing to -20 dB on right)
    // Note: On gain reduction meters, 0 dB is typically on the left and -20 dB is on the right
    const angleDeg = -maxAngleDeg + (normalizedPos * (2.0 * maxAngleDeg));
    return (angleDeg * Math.PI) / 180.0;
  }
}
