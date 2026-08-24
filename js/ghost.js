// SLOUCH — ghost replay: records your ship path at 10 Hz; on a new best the
// path is saved and your next runs race a translucent ghost of it.

import { state, saveGhost } from './state.js';

const HZ = 10;
const MAX_SAMPLES = 2400; // 4 minutes

let rec = null;
let play = null;

export function beginGhost(mode) {
  rec = { mode, t: 0, next: 0, path: [] };
  const g = state().ghosts[mode];
  play = (state().settings.ghost && g?.path?.length) ? { ...g, t: 0 } : null;
}

export function ghostTick(dt, x, y) {
  if (!rec) return;
  rec.t += dt;
  if (rec.t >= rec.next && rec.path.length < MAX_SAMPLES * 2) {
    rec.path.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    rec.next += 1 / HZ;
  }
  if (play) play.t += dt;
}

// interpolated ghost position, or null if no ghost / replay ended
export function ghostPos() {
  if (!play) return null;
  const idx = play.t * HZ;
  const i0 = Math.floor(idx) * 2;
  if (i0 + 3 >= play.path.length) return null;
  const f = idx - Math.floor(idx);
  return {
    x: play.path[i0] + (play.path[i0 + 2] - play.path[i0]) * f,
    y: play.path[i0 + 1] + (play.path[i0 + 3] - play.path[i0 + 1]) * f,
  };
}

export function ghostBestScore() { return play?.score ?? null; }

// score the ghost "would have" at elapsed time t (linear proration)
export function ghostPace(t) {
  if (!play?.path?.length) return null;
  const dur = (play.path.length / 2) / HZ;
  if (dur < 5) return null;
  return play.score * Math.min(1, t / dur);
}

export function endGhost(score) {
  if (!rec) return;
  const prev = state().ghosts[rec.mode];
  if (rec.path.length > 20 && (!prev || score > prev.score)) {
    saveGhost(rec.mode, score, 1 / HZ, rec.path);
  }
  rec = null;
  play = null;
}
