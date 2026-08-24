// SLOUCH — achievements. Checked after each run (and a few live moments);
// unlocks are stored on-device and surfaced as toasts + a trophy room screen.

import { state, save, dayStamp } from './state.js';

export const ACHIEVEMENTS = [
  { id: 'first_flight', icon: '🛫', name: 'First Flight', desc: 'Complete your first run.',
    test: s => s.totals.runs >= 1 },
  { id: 'score_1k', icon: '⭐', name: 'Belt Runner', desc: 'Score 1,000 in a single run.',
    test: (s, r) => r?.score >= 1000 },
  { id: 'score_5k', icon: '🌟', name: 'Asteroid Whisperer', desc: 'Score 5,000 in a single run.',
    test: (s, r) => r?.score >= 5000 },
  { id: 'score_20k', icon: '💫', name: 'Atlas Core Candidate', desc: 'Score 20,000 in a single run.',
    test: (s, r) => r?.score >= 20000 },
  { id: 'gates_10', icon: '🚪', name: 'Gate Keeper', desc: 'Pass 10 Stretch Gates (lifetime).',
    test: s => s.totals.gates >= 10 },
  { id: 'gates_50', icon: '⛩️', name: 'Full Range', desc: 'Pass 50 Stretch Gates (lifetime).',
    test: s => s.totals.gates >= 50 },
  { id: 'smash_100', icon: '🔨', name: 'Rock Crusher', desc: 'Smash 100 asteroids in hyperdrive (lifetime).',
    test: s => s.totals.smashes >= 100 },
  { id: 'hyper_5min', icon: '⚡', name: 'Deep Cervical Engine', desc: '5 total minutes in hyperdrive.',
    test: s => s.totals.hyperSec >= 300 },
  { id: 'boss_1', icon: '👑', name: 'Dreadnought Down', desc: 'Survive a dreadnought encounter.',
    test: s => s.totals.bossKills >= 1 },
  { id: 'boss_5', icon: '🏴‍☠️', name: 'Fleet Nightmare', desc: 'Survive 5 dreadnought encounters.',
    test: s => s.totals.bossKills >= 5 },
  { id: 'streak_7', icon: '🔥', name: 'One Week Tall', desc: 'A 7-day streak.',
    test: s => s.streak.count >= 7 },
  { id: 'streak_30', icon: '🌋', name: 'Posture Monk', desc: 'A 30-day streak.',
    test: s => s.streak.count >= 30 },
  { id: 'daily_1', icon: '📅', name: 'Today\'s Special', desc: 'Complete a Daily Challenge run.',
    test: s => s.daily.runs >= 1 },
  { id: 'duel_1', icon: '⚔️', name: 'Duelist', desc: 'Win a duel.',
    test: s => s.totals.duelsWon >= 1 },
  { id: 'collector', icon: '🎨', name: 'Curator of the Void', desc: 'Own every theme.',
    test: s => ['theme_crimson', 'theme_emerald', 'theme_neon', 'theme_ocean'].every(t => s.owned.includes(t)) },
  { id: 'stretch_80', icon: '🧘', name: 'Certified Un-Sloucher', desc: 'Earn a stretch score of 80+ in a run.',
    test: (s, r) => r?.stretchScore >= 80 },
  { id: 'runs_50', icon: '🎖️', name: 'Belt Veteran', desc: 'Fly 50 runs.',
    test: s => s.totals.runs >= 50 },
  { id: 'goals_1', icon: '💍', name: 'Ring Closer', desc: 'Complete all three daily goals in one day.',
    test: s => s.goals.rewarded === true },
];

// Returns the list of freshly unlocked achievements (for toasts).
export function checkAchievements(runReport = null) {
  const s = state();
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(s, runReport); } catch { ok = false; }
    if (ok) {
      s.achievements[a.id] = dayStamp();
      fresh.push(a);
    }
  }
  if (fresh.length) save();
  return fresh;
}
