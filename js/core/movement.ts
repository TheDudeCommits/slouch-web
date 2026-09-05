export type Pose = { yaw: number; pitch: number; roll: number; z: number; timestamp: number; valid: boolean };
export type Comfort = { roll: number; pitch: number; yaw: number; tuck: number };
export const DEFAULT_COMFORT: Comfort = { roll: 14, pitch: 12, yaw: 18, tuck: 2.4 };
export const RULES_VERSION = 2;
export const median = (a: number[]) => percentile(a, 0.5);
export function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
export function fresh(p: Pose, now: number) {
  return p.valid && now >= p.timestamp && now - p.timestamp <= 300 &&
    [p.yaw, p.pitch, p.roll, p.z, p.timestamp].every(Number.isFinite);
}
export function stablePose(samples: Pose[], now: number): boolean {
  const s = samples.filter(p => fresh(p, p.timestamp) && now - p.timestamp < 1200);
  if (s.length < 12 || !fresh(s[s.length - 1], now) || s[s.length - 1].timestamp - s[0].timestamp < 700) return false;
  return (['yaw', 'pitch', 'roll', 'z'] as const).every(k =>
    percentile(s.map(p => p[k]), 0.9) - percentile(s.map(p => p[k]), 0.1) < (k === 'z' ? 0.7 : 2.5));
}
export function neutralPose(samples: Pose[]) {
  return Object.fromEntries((['yaw', 'pitch', 'roll', 'z'] as const).map(k => [k, median(samples.map(p => p[k]))])) as Omit<Pose, 'timestamp' | 'valid'>;
}
export function axis(value: number, full: number, dead = 2) {
  if (Math.abs(value) < dead) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - dead) / Math.max(1, full - dead));
}
// A boost requires a modest retraction followed by a return. Holding cannot retrigger it.
export class TuckCycle {
  private phase: 'neutral' | 'back' | 'cooldown' = 'neutral';
  private held = 0;
  private elapsed = 0;
  reset() { this.phase = 'neutral'; this.held = 0; this.elapsed = 0; }
  update(z: number, pitch: number, dt: number, valid: boolean, threshold = 2.4) {
    if (!valid || !Number.isFinite(z) || !Number.isFinite(pitch)) { this.reset(); return false; }
    this.elapsed += dt;
    if (this.phase === 'cooldown') {
      if (this.elapsed > 3 && Math.abs(z) < threshold * 0.45) this.reset();
      return false;
    }
    if (Math.abs(pitch) > 10) { this.reset(); return false; }
    if (this.phase === 'neutral') {
      this.held = z < -threshold ? this.held + dt : 0;
      if (this.held >= 0.25) { this.phase = 'back'; this.elapsed = 0; }
    } else if (this.elapsed > 3) {
      this.phase = 'cooldown'; this.elapsed = 0;
    } else if (Math.abs(z) < threshold * 0.45) {
      this.phase = 'cooldown'; this.elapsed = 0; return true;
    }
    return false;
  }
}
// Continuous holds tolerate a short tracking wobble, never accumulate disconnected attempts.
export class PoseHold {
  elapsed = 0;
  private gap = 0;
  update(matching: boolean, dt: number, valid: boolean) {
    if (!valid) { this.elapsed = 0; this.gap = 0; return 0; }
    if (matching) { this.elapsed += dt; this.gap = 0; }
    else { this.gap += dt; if (this.gap > 0.15) this.elapsed = 0; }
    return this.elapsed;
  }
  reset() { this.elapsed = 0; this.gap = 0; }
}
