export type Activity = { date: string; version?: number; touch?: boolean; trackingPct?: number; provider?: string; duration: number; moveSec: number; mode: string; world?: string; stretchScore?: number };
function utcDay(date: string) { return Date.parse(`${date}T12:00:00Z`) / 86400000; }
export function weeklyActivity(history: Activity[], today: string) {
  const day = utcDay(today);
  const totals = [0, 0];
  for (const r of history) {
    const age = day - utcDay(r.date);
    if (age < 0 || age >= 14 || !Number.isFinite(age) || r.touch || r.version !== 2 || (r.trackingPct ?? 0) < 80) continue;
    totals[age < 7 ? 0 : 1] += r.moveSec;
  }
  return { recent: totals[0], previous: totals[1], delta: totals[0] - totals[1] };
}
