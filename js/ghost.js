// SLOUCH — ghost replay: records your ship path at 10 Hz; on a new best the
// path is saved and your next runs race a translucent ghost of it.

import { state, saveGhost } from './state.js';

const HZ = 10;
const MAX_SAMPLES = 9000; // 15 minutes; longer runs are not stored as truncated ghosts

let rec = null;
let play = null;

// The ghost is invisible — it only powers the pace comparison ("+400 vs best").
export function beginGhost(mode) {
  rec = { mode, t: 0, next: 0, path: [],scores:[] };
  const g = state().ghosts[mode];
  play = state().settings.ghost && g?.scores?.length ? { ...g,t:0 } : null;
}

export function ghostTick(dt, x, y, score) {
  if (!rec) return;
  rec.t += dt;
  if (rec.t >= rec.next && rec.path.length < MAX_SAMPLES * 2) {
    rec.path.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    rec.scores.push(Math.floor(score));
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

// Interpolate recorded scores; a final score cannot describe an earlier moment.
export function ghostPace(t) {
  if(!play?.scores?.length)return null;
  const i=t*HZ,a=Math.floor(i);if(a>=play.scores.length-1)return null;
  return play.scores[a]+(play.scores[a+1]-play.scores[a])*(i-a);
}

export function endGhost(score) {
  if (!rec) return;
  const prev = state().ghosts[rec.mode];
  if (rec.t <= MAX_SAMPLES/HZ && rec.path.length > 20 && (!prev || score > prev.score)) {
    saveGhost(rec.mode, score, 1 / HZ, rec.path,rec.scores);
  }
  rec = null;
  play = null;
}
