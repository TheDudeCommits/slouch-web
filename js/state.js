// SLOUCH — persistent state (localStorage). No servers: scores, streaks,
// purchases, goals, reports and ghosts live on-device.

const KEY = 'slouch.save.v1';

const DEFAULTS = {
  points: 0,
  settings: { music: 60, sfx: 80, sensitivity: 100, mirror: true, ghost: true, reminders: false },
  streak: { count: 0, lastDay: null, freezes: 0 },
  owned: ['theme_space', 'skin_silver', 'trail_theme', 'boom_ember'],
  equippedTheme: 'theme_space',
  equipped: { skin: 'skin_silver', trail: 'trail_theme', boom: 'boom_ember' },
  upgrades: { hyperdur: 0, hyperregen: 0, magnet: 0 },   // levels 0..3
  revives: 0,                                            // consumable stock
  boards: { techneck: [], casual: [] },                  // [{tag, score, date}]
  best: { techneck: 0, casual: 0 },
  daily: { day: null, best: 0, runs: 0, rewarded: false, list: [] },
  goals: { day: null, moveSec: 0, tucks: 0, stretches: 0, rewarded: false },
  totals: { runs: 0, smashes: 0, gates: 0, bossKills: 0, duelsWon: 0, hyperSec: 0 },
  achievements: {},                                      // id -> dateStamp
  history: [],                                           // last 30 run reports
  adaptive: { yawL: 25, yawR: 25, pitchU: 20, pitchD: 20, rollL: 20, rollR: 20 }, // EMA of per-run max ROM (deg)
  ghosts: {},                                            // mode -> {score, dt, path:[x,y,...] }
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
  theme_neon: {
    name: 'Neon City', icon: '🌆', price: 3500,
    desc: 'Night courier run over an endless megacity. Hot pink everything.',
    colors: { ship: 0xffc0f0, engine: 0xff3cd2, accent: 0xff5ce0, fog: 0x0d0314,
      nebula1: 0xa02a8f, nebula2: 0x2a4fa0, rock: 0x6a5a80, rockEmissive: 0x38104a },
  },
  theme_ocean: {
    name: 'Ocean Dive', icon: '🌊', price: 3500,
    desc: 'The belt drowned. Dodge through bioluminescent deep-sea wreckage.',
    colors: { ship: 0xc0f0ff, engine: 0x2ca0ff, accent: 0x40c8ff, fog: 0x02121f,
      nebula1: 0x0a4f8a, nebula2: 0x0a8a7a, rock: 0x4a6a7a, rockEmissive: 0x0a2a40 },
  },
  theme_jungle: {
    name: 'Jungle Rush 🐇', icon: '🌴', price: 0, soon: true,
    desc: 'COMING SOON — a rabbit, a jungle, and everything that eats rabbits.',
    colors: null,
  },
};

export const SKINS = {
  skin_silver: { name: 'Silver Fang', icon: '🛸', price: 0, desc: 'Factory hull. Reliable. Unkillable-ish.', color: null },
  skin_void: { name: 'Void Black', icon: '🖤', price: 1200, desc: 'Stealth composite. The belt barely sees you coming.', color: 0x22242e },
  skin_gold: { name: 'Gold Rush', icon: '🏆', price: 2500, desc: 'For pilots who want the leaderboard to see them first.', color: 0xffd54d },
  skin_rose: { name: 'Rose Titanium', icon: '🌹', price: 1800, desc: 'Aerospace-grade. Suspiciously fashionable.', color: 0xffa0b8 },
};

export const TRAILS = {
  trail_theme: { name: 'Theme Trail', icon: '✨', price: 0, desc: 'Matches your equipped theme.', color: null },
  trail_magma: { name: 'Magma', icon: '🔥', price: 900, desc: 'Leave a burning scar across the belt.', color: 0xff6a2c },
  trail_lime: { name: 'Gamma Lime', icon: '🟢', price: 900, desc: 'Radioactive? Probably fine.', color: 0x9dff3c },
  trail_violet: { name: 'Ultraviolet', icon: '🟣', price: 900, desc: 'Technically invisible. We made an exception.', color: 0xb44dff },
  trail_rainbow: { name: 'Prism', icon: '🌈', price: 2200, desc: 'Full-spectrum ion wake. Cycles every color.', color: 'rainbow' },
};

export const BOOMS = {
  boom_ember: { name: 'Ember Burst', icon: '💥', price: 0, desc: 'Classic orange shrapnel.', color: 0xffaa55, size: 1 },
  boom_neon: { name: 'Neon Overload', icon: '⚡', price: 800, desc: 'Explode in your theme accent color.', color: 'accent', size: 1.1 },
  boom_nova: { name: 'Supernova', icon: '🌟', price: 1600, desc: 'Go out like a star: white, huge, dramatic.', color: 0xffffff, size: 1.7 },
};

export const UPGRADES = {
  hyperdur: { name: 'Hyper Capacity', icon: '⚡', desc: 'Hyperdrive drains slower. Longer burns per tuck.',
    prices: [800, 2000, 4500] },
  hyperregen: { name: 'Hyper Recharge', icon: '🔋', desc: 'Hyperdrive energy refills faster between tucks.',
    prices: [700, 1800, 4000] },
  magnet: { name: 'Magnet Core', icon: '🧲', desc: 'Magnet power-ups last longer and pull from farther away.',
    prices: [600, 1500, 3500] },
};

export const STORE_EXTRAS = [
  { id: 'freeze', name: 'Streak Freeze', icon: '🧊', price: 500, repeat: true,
    desc: 'Miss a day without losing your streak. Consumed automatically.' },
  { id: 'revive', name: 'Emergency Revive', icon: '💠', price: 1200, repeat: true, max: 3,
    desc: 'Auto-resurrect once per run when you crash. Stock up to 3.' },
];

// Seasonal events: [monthStart, dayStart, monthEnd, dayEnd] inclusive
export const EVENTS = [
  { id: 'perseids', name: 'Perseid Comet Festival', icon: '☄️', from: [8, 10], to: [8, 31],
    desc: '2× stardust on every run · extra crystal showers', stardustMult: 2, crystalBoost: true },
  { id: 'spooky', name: 'Haunted Belt', icon: '🎃', from: [10, 20], to: [10, 31],
    desc: '2× stardust · the belt got… weirder', stardustMult: 2, crystalBoost: false },
  { id: 'solstice', name: 'Solstice Lights', icon: '❄️', from: [12, 18], to: [12, 31],
    desc: '2× stardust · aurora season', stardustMult: 2, crystalBoost: true },
];

export function activeEvent(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  return EVENTS.find(e => {
    const a = e.from[0] * 100 + e.from[1], b = e.to[0] * 100 + e.to[1], x = m * 100 + day;
    return x >= a && x <= b;
  }) || null;
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = structuredClone(DEFAULTS);
      const merged = { ...d, ...s };
      for (const k of ['settings', 'streak', 'best', 'daily', 'goals', 'totals', 'adaptive', 'upgrades', 'equipped']) {
        merged[k] = { ...d[k], ...(s[k] || {}) };
      }
      merged.boards = { ...structuredClone(d.boards), ...(s.boards || {}) };
      merged.ghosts = s.ghosts || {};
      merged.achievements = s.achievements || {};
      merged.history = s.history || [];
      for (const item of d.owned) if (!merged.owned.includes(item)) merged.owned.push(item);
      return merged;
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

// ── day helpers ──
export function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 864e5);
}

// ── streaks ──
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
  if (playedNow && st.lastDay !== today) {
    st.count += 1;
    st.lastDay = today;
  }
  save();
  return { count: st.count, usedFreeze, broken };
}

// ── daily goals: three rings — Move / Tucks / Stretches ──
export const GOAL_TARGETS = { moveSec: 90, tucks: 10, stretches: 6 };

export function goalsToday() {
  const today = dayStamp();
  if (S.goals.day !== today) {
    S.goals = { day: today, moveSec: 0, tucks: 0, stretches: 0, rewarded: false };
    save();
  }
  return S.goals;
}
export function addGoalProgress({ moveSec = 0, tucks = 0, stretches = 0 }) {
  const g = goalsToday();
  g.moveSec += moveSec; g.tucks += tucks; g.stretches += stretches;
  let justCompleted = false;
  if (!g.rewarded && g.moveSec >= GOAL_TARGETS.moveSec && g.tucks >= GOAL_TARGETS.tucks &&
      g.stretches >= GOAL_TARGETS.stretches) {
    g.rewarded = true;
    S.points += 200;
    justCompleted = true;
  }
  save();
  return justCompleted;
}

// ── daily challenge ──
export function dailyToday() {
  const today = dayStamp();
  if (S.daily.day !== today) {
    S.daily = { day: today, best: 0, runs: 0, rewarded: false, list: [] };
    save();
  }
  return S.daily;
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

// ── run history / posture reports (keep 30) ──
export function addReport(r) {
  S.history.unshift(r);
  S.history = S.history.slice(0, 30);
  // adaptive ROM: EMA of per-run maxima, floors keep gates reachable
  const a = S.adaptive, k = 0.25;
  for (const [key, val, floor] of [
    ['yawL', r.rom.yawL, 12], ['yawR', r.rom.yawR, 12],
    ['pitchU', r.rom.pitchU, 10], ['pitchD', r.rom.pitchD, 10],
    ['rollL', r.rom.rollL, 10], ['rollR', r.rom.rollR, 10]]) {
    if (val > 2) a[key] = Math.max(floor, a[key] + (val - a[key]) * k);
  }
  save();
}

// ── ghosts ──
export function saveGhost(mode, score, dt, path) {
  S.ghosts[mode] = { score, dt, path };
  save();
}

// ── store ──
export function buy(id, price) {
  if (id === 'revive' && S.revives >= 3) return false;
  if (!spend(price)) return false;
  if (id === 'freeze') S.streak.freezes += 1;
  else if (id === 'revive') S.revives += 1;
  else if (!S.owned.includes(id)) S.owned.push(id);
  save(); return true;
}
export function buyUpgrade(id) {
  const u = UPGRADES[id];
  const lvl = S.upgrades[id];
  if (lvl >= u.prices.length) return false;
  if (!spend(u.prices[lvl])) return false;
  S.upgrades[id] = lvl + 1;
  save(); return true;
}
export function equipTheme(id) {
  if (S.owned.includes(id)) { S.equippedTheme = id; save(); return true; }
  return false;
}
export function equipCosmetic(slot, id) {
  if (S.owned.includes(id)) { S.equipped[slot] = id; save(); return true; }
  return false;
}
export function themeColors() { return THEMES[S.equippedTheme]?.colors ?? THEMES.theme_space.colors; }
export function cosmetics() {
  return {
    skin: SKINS[S.equipped.skin] ?? SKINS.skin_silver,
    trail: TRAILS[S.equipped.trail] ?? TRAILS.trail_theme,
    boom: BOOMS[S.equipped.boom] ?? BOOMS.boom_ember,
  };
}
