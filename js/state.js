// SLOUCH — persistent state (localStorage). No servers: scores, streaks and
// purchases live on-device.

const KEY = 'slouch.save.v1';

const DEFAULTS = {
  points: 0,
  settings: { music: 60, sfx: 80, sensitivity: 100, mirror: true },
  streak: { count: 0, lastDay: null, freezes: 0 },
  owned: ['theme_space'],
  equippedTheme: 'theme_space',
  boards: { techneck: [], casual: [] }, // [{tag, score, date}]
  best: { techneck: 0, casual: 0 },
  calibrated: false,
  lastTag: 'ACE',
};

export const THEMES = {
  theme_space: {
    name: 'Deep Space', icon: '🚀', price: 0,
    desc: 'The original run. Cyan ion trails through the Cervical Belt.',
    colors: { ship: 0x9fd8ff, engine: 0x4df3ff, accent: 0x4df3ff, fog: 0x05060f,
      nebula1: 0x2a3fa0, nebula2: 0x7a2fa0, rock: 0x8a8fa0, rockEmissive: 0x1a2040 },
  },
  theme_crimson: {
    name: 'Crimson Nebula', icon: '🩸', price: 2000,
    desc: 'A dying star bleeds across the belt. Rocks glow ember-red.',
    colors: { ship: 0xffd0c0, engine: 0xff5a3c, accent: 0xff7a5c, fog: 0x0f0508,
      nebula1: 0xa02a2f, nebula2: 0xa06a2f, rock: 0x7a5a55, rockEmissive: 0x401a10 },
  },
  theme_emerald: {
    name: 'Emerald Void', icon: '☄️', price: 2000,
    desc: 'Toxic auroras. Everything alive here wants you dead.',
    colors: { ship: 0xd0ffd8, engine: 0x3cff8a, accent: 0x5cffa0, fog: 0x030f08,
      nebula1: 0x1a7a4f, nebula2: 0x2a9a2f, rock: 0x5a7a60, rockEmissive: 0x0f3018 },
  },
  theme_jungle: {
    name: 'Jungle Rush 🐇', icon: '🌴', price: 0, soon: true,
    desc: 'COMING SOON — a rabbit, a jungle, and everything that eats rabbits.',
    colors: null,
  },
};

export const STORE_EXTRAS = [
  { id: 'freeze', name: 'Streak Freeze', icon: '🧊', price: 500, repeat: true,
    desc: 'Miss a day without losing your streak. Consumed automatically.' },
];

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...structuredClone(DEFAULTS), ...s,
        settings: { ...DEFAULTS.settings, ...s.settings },
        streak: { ...DEFAULTS.streak, ...s.streak },
        boards: { ...structuredClone(DEFAULTS.boards), ...s.boards },
        best: { ...DEFAULTS.best, ...s.best } };
    }
  } catch (e) { /* corrupted save — start fresh */ }
  return structuredClone(DEFAULTS);
}

export function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
export function state() { return S; }
export function resetAll() { S = structuredClone(DEFAULTS); save(); }

// ── points ──
export function addPoints(n) { S.points += Math.round(n); save(); }
export function spend(n) {
  if (S.points < n) return false;
  S.points -= n; save(); return true;
}

// ── streaks: playing on consecutive calendar days builds the flame ──
function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 864e5);
}

// Called on app open and after each run. Returns {broken, used Freeze} info for UI.
export function tickStreak(playedNow = false) {
  const today = dayStamp();
  const st = S.streak;
  let usedFreeze = false, broken = false;
  if (st.lastDay && st.lastDay !== today) {
    const gap = daysBetween(st.lastDay, today);
    if (gap > 1) {
      const missed = gap - 1;
      if (st.freezes >= missed) { st.freezes -= missed; usedFreeze = true; }
      else { if (st.count > 0) broken = true; st.count = 0; }
    }
  }
  if (playedNow) {
    if (st.lastDay !== today) {
      st.count += 1;
      st.lastDay = today;
    }
  }
  save();
  return { count: st.count, usedFreeze, broken };
}

// ── leaderboards ──
export function submitScore(mode, tag, score) {
  const board = S.boards[mode];
  board.push({ tag, score, date: dayStamp() });
  board.sort((a, b) => b.score - a.score);
  S.boards[mode] = board.slice(0, 10);
  if (score > S.best[mode]) S.best[mode] = score;
  S.lastTag = tag;
  save();
}
export function qualifiesForBoard(mode, score) {
  if (score <= 0) return false;
  const b = S.boards[mode];
  return b.length < 10 || score > b[b.length - 1].score;
}

// ── store ──
export function buy(id, price) {
  if (!spend(price)) return false;
  if (id === 'freeze') S.streak.freezes += 1;
  else if (!S.owned.includes(id)) S.owned.push(id);
  save(); return true;
}
export function equipTheme(id) {
  if (S.owned.includes(id)) { S.equippedTheme = id; save(); return true; }
  return false;
}
export function themeColors() { return THEMES[S.equippedTheme]?.colors ?? THEMES.theme_space.colors; }
