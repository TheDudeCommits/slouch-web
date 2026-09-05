import { DEFAULT_COMFORT } from './core/movement.ts';
import { migrateSave, safeImport } from './core/save.ts';
import { nativeSave } from './platform/native.js';
// SLOUCH — persistent state (localStorage). No servers: scores, streaks,
// purchases, goals, reports and ghosts live on-device.

const KEY = 'slouch.save.v1';

export const DEFAULTS = {
  version: 2,
  points: 0,
  settings: { music: 35, sfx: 55, sensitivity: 100, mirror: true, ghost: false, reminders: false, input: 'camera', duration: 180, reducedMotion: false, vertical: true, turns: true, quality: 'auto', comfort: { ...DEFAULT_COMFORT } },
  streak: { count: 0, lastDay: null, freezes: 0 },
  owned: ['theme_space', 'skin_quadra', 'world_ocean', 'world_jungle', 'trail_theme', 'boom_ember', 'hero_clown', 'hero_bunny'],
  equippedTheme: 'theme_space',
  equippedWorld: 'ocean',            // space | ocean | jungle
  oceanHero: 'hero_clown',
  jungleHero: 'hero_bunny',
  equipped: { skin: 'skin_quadra', trail: 'trail_theme', boom: 'boom_ember' },
  upgrades: { hyperdur: 0, hyperregen: 0, magnet: 0 },   // levels 0..3
  revives: 0,                                            // consumable stock
  boards: { techneck: [], casual: [] },                  // [{tag, score, date}]
  best: { techneck: 0, casual: 0 },
  daily: { day: null, best: 0, runs: 0, rewarded: false, list: [] },
  goals: { day: null, moveSec: 0, tucks: 0, stretches: 0, rewarded: false },
  totals: { runs: 0, smashes: 0, gates: 0, bossKills: 0, duelsWon: 0, hyperSec: 0 },
  achievements: {},                                      // id -> dateStamp
  history: [],                                           // last 30 run reports
  xp: 0,
  lore: 0,                                               // unlocked lore shards
  missions: { day: null, ids: [], done: {} },
  weekly: { week: null, best: 0, list: [] },
  adaptive: { yawL: 25, yawR: 25, pitchU: 20, pitchD: 20, rollL: 20, rollR: 20 }, // EMA of per-run max ROM (deg)
  ghosts: {},                                            // mode -> {score, dt, path:[x,y,...] }
  calibrated: false,
  lastTag: 'ACE',
};

export const THEMES = {
  theme_space: {
    name: 'Deep Space', icon: '🚀', price: 0,
    desc: 'The original run. Cyan ion trails through the Cervical Belt.',
    sky: ['space', 'space2', 'space3'],
    planets: ['saturn', 'jupiter', 'moon', null], sun: 0xfff4e0,
    colors: { ship: 0x9fd8ff, engine: 0x4df3ff, accent: 0x4df3ff, fog: 0x05060f,
      rock: 0xf5efe4, rockEmissive: 0x4a5570 },
  },
  theme_crimson: {
    name: 'Crimson Nebula', icon: '🩸', price: 2000,
    desc: 'A dying star bleeds across the belt. Rocks glow ember-red.',
    sky: ['crimson'], planets: ['mars', 'jupiter', null], sun: 0xffc09a,
    colors: { ship: 0xffd0c0, engine: 0xff5a3c, accent: 0xff7a5c, fog: 0x0f0508,
      rock: 0xf5d6c4, rockEmissive: 0x6a4a3a },
  },
  theme_emerald: {
    name: 'Emerald Void', icon: '☄️', price: 2000,
    desc: 'Toxic auroras. Everything alive here wants you dead.',
    sky: ['emerald'], planets: ['jupiter', 'moon', null], sun: 0xd0ffda,
    colors: { ship: 0xd0ffd8, engine: 0x3cff8a, accent: 0x5cffa0, fog: 0x030f08,
      rock: 0xdff2dc, rockEmissive: 0x3a6a48 },
  },
  theme_neon: {
    name: 'Neon City', icon: '🌆', price: 3500,
    desc: 'Night courier run over an endless megacity. Hot pink everything.',
    sky: ['neon'], planets: ['moon', 'neptune', null], sun: 0xff9ae0,
    colors: { ship: 0xffc0f0, engine: 0xff3cd2, accent: 0xff5ce0, fog: 0x0d0314,
      rock: 0xeadcf8, rockEmissive: 0x6a3a80 },
  },
  theme_ocean: {
    name: 'Pelagic Blue', icon: '🌊', price: 3500,
    desc: 'The belt drowned. Dodge through bioluminescent deep-sea wreckage.',
    sky: ['ocean'], planets: ['neptune', 'moon', null], sun: 0xaad4ff,
    colors: { ship: 0xc0f0ff, engine: 0x2ca0ff, accent: 0x40c8ff, fog: 0x02121f,
      rock: 0xd8ecf8, rockEmissive: 0x3a6a90 },
  },
};

// ── expansion worlds: full visual swaps, downloaded only after purchase ──
export const WORLD_PACKS = {
  world_ocean: {
    name: 'Open Ocean', price: 0, world: 'ocean', size: 'included',
    desc: 'Swim the reef as a clownfish. Sharks, octopuses, and a whale with opinions.',
  },
  world_jungle: {
    name: 'Jungle Rush', price: 0, world: 'jungle', size: 'included',
    desc: 'Run the undergrowth as a bunny. Everything here is faster than you.',
  },
};

// buyable runners once Jungle Rush is owned
export const JUNGLE_HEROES = {
  hero_bunny: { name: 'Bunny', price: 0, model: 'hero_bunny', desc: 'Fast, fluffy, carries a carrot everywhere.' },
  hero_pig: { name: 'Piggy', price: 1500, model: 'hero_pig', desc: 'Bounds through the undergrowth with total joy.' },
};

// buyable hero fish once Open Ocean is owned
export const OCEAN_HEROES = {
  hero_clown: { name: 'Clownfish', price: 0, model: 'hero_clown', desc: 'The reef\'s bravest stripe.' },
  hero_tang: { name: 'Yellow Tang', price: 1200, model: 'hero_tang', desc: 'A lemon with attitude.' },
  hero_mandarin: { name: 'Mandarin', price: 1800, model: 'hero_mandarin', desc: 'Psychedelic royalty of the reef.' },
};

// glTF hero starfighters (poly.pizza community models, CC-BY — see assets/ATTRIBUTION.txt)
export const SKINS = {
  skin_viper: { name: 'Viper', price: 1500, model: 'viper',
    desc: 'Twin-cannon patrol fighter in rebel white-and-red.' },
  skin_lance: { name: 'Lance', price: 2200, model: 'lance',
    desc: 'A thrown spear with an engine. Nothing turns tighter.' },
  skin_quadra: { name: 'Quadra', price: 0, model: 'quadra',
    desc: 'Quad-wing interceptor. Reads as trouble from every angle.' },
  skin_shadow: { name: 'Vanguard', price: 3500, model: 'shadow',
    desc: 'Heavy assault frame. Twin cannon housings, zero apologies.' },
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
  hyperdur: { name: 'Trail Luminance', icon: '⚡', desc: 'A brighter trail in Ocean and Space, with the same comfortable boost',
    prices: [800, 2000, 4500] },
  hyperregen: { name: 'Impact Sparkles', icon: '🔋', desc: 'Wider sparkles when you break through a hazard',
    prices: [700, 1800, 4000] },
  magnet: { name: 'Magnet Core', icon: '🧲', desc: 'Stronger coin pull',
    prices: [600, 1500, 3500] },
};

export const STORE_EXTRAS = [
  { id: 'freeze', name: 'Streak Freeze', icon: '🧊', price: 500, repeat: true,
    desc: 'Protects one missed day' },
  { id: 'revive', name: 'Emergency Revive', icon: '💠', price: 1200, repeat: true, max: 3,
    desc: 'One auto-rescue per run' },
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
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    if (parsed.version !== 2) localStorage.setItem('slouch.save.v1.backup', raw);
    return migrateSave(parsed, DEFAULTS);
  } catch { return structuredClone(DEFAULTS); }
}
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    nativeSave(JSON.stringify(S)).catch(() => {});
  } catch { window.dispatchEvent(new CustomEvent('slouch-storage-error')); }
}
export function importSave(text) { S = migrateSave(safeImport(text), DEFAULTS); save(); }
export function exportSave() { return JSON.stringify({ format: 'slouch-save', exportedAt: new Date().toISOString(), save: S }, null, 2); }
export function restoreNative(text) { if (text) { S = migrateSave(safeImport(text), DEFAULTS); save(); } }
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

// ── XP ──
export function addXp(n) { S.xp += Math.round(n); save(); }

// ── weekly tournament (ISO week key) ──
export function isoWeek(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${Math.ceil(((x - y0) / 864e5 + 1) / 7)}`;
}
export function weeklyNow() {
  const wk = isoWeek();
  if (S.weekly.week !== wk) {
    S.weekly = { week: wk, best: 0, list: [] };
    save();
  }
  return S.weekly;
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
export function scoreScope(mode, report=null) {
  const world=report?.world||currentWorld();
  const input=report?(report.touch?'manual':'camera'):(S.settings.input==='camera'?'camera':'manual');
  const key=`v2:${world}:${input}:${mode}`;
  S.boards[key] ||= [];S.best[key] ||= 0;return key;
}
export function dailyScores(report=null) { const d=dailyToday();d.scopes ||= {};return d.scopes[scoreScope('daily',report)] ||= {best:0,runs:0,list:[]}; }
export function weeklyScores(report=null) { const w=weeklyNow();w.scopes ||= {};return w.scopes[scoreScope('weekly',report)] ||= {best:0,list:[]}; }
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
  S.history = S.history.slice(0, 365);
  // Comfort targets are explicit settings; incidental maxima never raise them.
  save();
}

// ── ghosts ──
export function saveGhost(mode, score, dt, path, scores) {
  S.ghosts[mode] = { score, dt, path, scores };
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
export function equipWorld(world) {
  if (world === 'space' ||
      S.owned.includes(Object.keys(WORLD_PACKS).find(k => WORLD_PACKS[k].world === world))) {
    S.equippedWorld = world; save(); return true;
  }
  return false;
}
export function currentWorld() { return S.equippedWorld || 'ocean'; }
export function equipCosmetic(slot, id) {
  if (S.owned.includes(id)) { S.equipped[slot] = id; save(); return true; }
  return false;
}
export function themeColors() { return THEMES[S.equippedTheme]?.colors ?? THEMES.theme_space.colors; }
export function cosmetics() {
  return {
    skin: SKINS[S.equipped.skin] ?? SKINS.skin_quadra,
    trail: TRAILS[S.equipped.trail] ?? TRAILS.trail_theme,
    boom: BOOMS[S.equipped.boom] ?? BOOMS.boom_ember,
  };
}
