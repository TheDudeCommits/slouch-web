// Fixed simulation time prevents device frame rate from changing movement rules.
// Long stalls are interruptions, never a burst of unobserved gameplay.
export class SimulationClock {
  private remainder = 0;
  readonly step = 1 / 60;
  reset() { this.remainder = 0; }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 0.25) { this.reset(); return { steps: 0, interrupted: true }; }
    this.remainder += seconds;
    const steps = Math.floor((this.remainder + 1e-9) / this.step);
    this.remainder -= steps * this.step;
    return { steps, interrupted: false };
  }
}
