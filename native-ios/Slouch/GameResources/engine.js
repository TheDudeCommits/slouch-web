// Generated from original Slouch. Run Scripts/prepare.mjs; do not edit.
define('rng', function(require,exports){
// SLOUCH — seeded PRNG so daily challenges and duels replay the same belt.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todaySeed() {
  const d = new Date();
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) ^ 0x51ec7;
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

Object.assign(exports,{mulberry32,todaySeed,hashSeed});
});
define('state', function(require,exports){
// SLOUCH — persistent state (localStorage). No servers: scores, streaks,
// purchases, goals, reports and ghosts live on-device.

const KEY = 'slouch.save.v1';

const DEFAULTS = {
  points: 0,
  settings: { music: 60, sfx: 80, sensitivity: 100, mirror: true, ghost: true, reminders: false },
  streak: { count: 0, lastDay: null, freezes: 0 },
  owned: ['theme_space', 'skin_crosswing', 'trail_theme', 'boom_ember', 'hero_clown', 'hero_bunny'],
  equippedTheme: 'theme_space',
  equippedWorld: 'space',            // space | ocean | jungle
  oceanHero: 'hero_clown',
  jungleHero: 'hero_bunny',
  equipped: { skin: 'skin_crosswing', trail: 'trail_theme', boom: 'boom_ember' },
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

const THEMES = {
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
    name: 'Ocean Dive', icon: '🌊', price: 3500,
    desc: 'The belt drowned. Dodge through bioluminescent deep-sea wreckage.',
    sky: ['ocean'], planets: ['neptune', 'moon', null], sun: 0xaad4ff,
    colors: { ship: 0xc0f0ff, engine: 0x2ca0ff, accent: 0x40c8ff, fog: 0x02121f,
      rock: 0xd8ecf8, rockEmissive: 0x3a6a90 },
  },
};

// ── expansion worlds: full visual swaps, downloaded only after purchase ──
const WORLD_PACKS = {
  world_ocean: {
    name: 'Open Ocean', price: 2500, world: 'ocean', size: '2 MB',
    desc: 'Swim the reef as a clownfish. Sharks, octopuses, and a whale with opinions.',
  },
  world_jungle: {
    name: 'Jungle Rush', price: 3000, world: 'jungle', size: '4 MB',
    desc: 'Run the undergrowth as a bunny. Everything here is faster than you.',
  },
};

// buyable runners once Jungle Rush is owned
const JUNGLE_HEROES = {
  hero_bunny: { name: 'Bunny', price: 0, model: 'hero_bunny', desc: 'Fast, fluffy, carries a carrot everywhere.' },
  hero_pig: { name: 'Piggy', price: 1500, model: 'hero_pig', desc: 'Bounds through the undergrowth with total joy.' },
};

// buyable hero fish once Open Ocean is owned
const OCEAN_HEROES = {
  hero_clown: { name: 'Clownfish', price: 0, model: 'hero_clown', desc: 'The reef\'s bravest stripe.' },
  hero_tang: { name: 'Yellow Tang', price: 1200, model: 'hero_tang', desc: 'A lemon with attitude.' },
  hero_mandarin: { name: 'Mandarin', price: 1800, model: 'hero_mandarin', desc: 'Psychedelic royalty of the reef.' },
};

// glTF hero starfighters (poly.pizza community models, CC-BY — see assets/ATTRIBUTION.txt)
const SKINS = {
  skin_crosswing: { name: 'Crosswing', price: 0, model: 'crosswing',
    desc: 'Four S-foils, locked in attack position. The factory hull.' },
  skin_viper: { name: 'Viper', price: 1500, model: 'viper',
    desc: 'Twin-cannon patrol fighter in rebel white-and-red.' },
  skin_lance: { name: 'Lance', price: 2200, model: 'lance',
    desc: 'A thrown spear with an engine. Nothing turns tighter.' },
  skin_quadra: { name: 'Quadra', price: 2800, model: 'quadra',
    desc: 'Quad-wing interceptor. Reads as trouble from every angle.' },
  skin_shadow: { name: 'Vanguard', price: 3500, model: 'shadow',
    desc: 'Heavy assault frame. Twin cannon housings, zero apologies.' },
};

const TRAILS = {
  trail_theme: { name: 'Theme Trail', icon: '✨', price: 0, desc: 'Matches your equipped theme.', color: null },
  trail_magma: { name: 'Magma', icon: '🔥', price: 900, desc: 'Leave a burning scar across the belt.', color: 0xff6a2c },
  trail_lime: { name: 'Gamma Lime', icon: '🟢', price: 900, desc: 'Radioactive? Probably fine.', color: 0x9dff3c },
  trail_violet: { name: 'Ultraviolet', icon: '🟣', price: 900, desc: 'Technically invisible. We made an exception.', color: 0xb44dff },
  trail_rainbow: { name: 'Prism', icon: '🌈', price: 2200, desc: 'Full-spectrum ion wake. Cycles every color.', color: 'rainbow' },
};

const BOOMS = {
  boom_ember: { name: 'Ember Burst', icon: '💥', price: 0, desc: 'Classic orange shrapnel.', color: 0xffaa55, size: 1 },
  boom_neon: { name: 'Neon Overload', icon: '⚡', price: 800, desc: 'Explode in your theme accent color.', color: 'accent', size: 1.1 },
  boom_nova: { name: 'Supernova', icon: '🌟', price: 1600, desc: 'Go out like a star: white, huge, dramatic.', color: 0xffffff, size: 1.7 },
};

const UPGRADES = {
  hyperdur: { name: 'Hyper Capacity', icon: '⚡', desc: 'Longer boost burns',
    prices: [800, 2000, 4500] },
  hyperregen: { name: 'Hyper Recharge', icon: '🔋', desc: 'Faster boost refills',
    prices: [700, 1800, 4000] },
  magnet: { name: 'Magnet Core', icon: '🧲', desc: 'Stronger coin pull',
    prices: [600, 1500, 3500] },
};

const STORE_EXTRAS = [
  { id: 'freeze', name: 'Streak Freeze', icon: '🧊', price: 500, repeat: true,
    desc: 'Protects one missed day' },
  { id: 'revive', name: 'Emergency Revive', icon: '💠', price: 1200, repeat: true, max: 3,
    desc: 'One auto-rescue per run' },
];

// Seasonal events: [monthStart, dayStart, monthEnd, dayEnd] inclusive
const EVENTS = [
  { id: 'perseids', name: 'Perseid Comet Festival', icon: '☄️', from: [8, 10], to: [8, 31],
    desc: '2× stardust on every run · extra crystal showers', stardustMult: 2, crystalBoost: true },
  { id: 'spooky', name: 'Haunted Belt', icon: '🎃', from: [10, 20], to: [10, 31],
    desc: '2× stardust · the belt got… weirder', stardustMult: 2, crystalBoost: false },
  { id: 'solstice', name: 'Solstice Lights', icon: '❄️', from: [12, 18], to: [12, 31],
    desc: '2× stardust · aurora season', stardustMult: 2, crystalBoost: true },
];

function activeEvent(d = new Date()) {
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
      for (const k of ['settings', 'streak', 'best', 'daily', 'goals', 'totals', 'adaptive', 'upgrades', 'equipped', 'missions', 'weekly']) {
        merged[k] = { ...d[k], ...(s[k] || {}) };
      }
      merged.boards = { ...structuredClone(d.boards), ...(s.boards || {}) };
      merged.ghosts = s.ghosts || {};
      merged.achievements = s.achievements || {};
      merged.history = s.history || [];
      for (const item of d.owned) if (!merged.owned.includes(item)) merged.owned.push(item);
      // migrate saves from older skin generations
      if (!SKINS[merged.equipped.skin]) merged.equipped.skin = 'skin_crosswing';
      if (!merged.owned.includes('skin_crosswing')) merged.owned.push('skin_crosswing');
      return merged;
    }
  } catch (e) { /* corrupted save — start fresh */ }
  return structuredClone(DEFAULTS);
}

function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function state() { return S; }
function resetAll() { S = structuredClone(DEFAULTS); save(); }

// ── points ──
function addPoints(n) { S.points += Math.round(n); save(); }
function spend(n) {
  if (S.points < n) return false;
  S.points -= n; save(); return true;
}

// ── day helpers ──
function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 864e5);
}

// ── streaks ──
function tickStreak(playedNow = false) {
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
const GOAL_TARGETS = { moveSec: 90, tucks: 10, stretches: 6 };

function goalsToday() {
  const today = dayStamp();
  if (S.goals.day !== today) {
    S.goals = { day: today, moveSec: 0, tucks: 0, stretches: 0, rewarded: false };
    save();
  }
  return S.goals;
}
function addGoalProgress({ moveSec = 0, tucks = 0, stretches = 0 }) {
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
function addXp(n) { S.xp += Math.round(n); save(); }

// ── weekly tournament (ISO week key) ──
function isoWeek(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${Math.ceil(((x - y0) / 864e5 + 1) / 7)}`;
}
function weeklyNow() {
  const wk = isoWeek();
  if (S.weekly.week !== wk) {
    S.weekly = { week: wk, best: 0, list: [] };
    save();
  }
  return S.weekly;
}

// ── daily challenge ──
function dailyToday() {
  const today = dayStamp();
  if (S.daily.day !== today) {
    S.daily = { day: today, best: 0, runs: 0, rewarded: false, list: [] };
    save();
  }
  return S.daily;
}

// ── leaderboards ──
function submitScore(mode, tag, score) {
  const board = S.boards[mode];
  board.push({ tag, score, date: dayStamp() });
  board.sort((a, b) => b.score - a.score);
  S.boards[mode] = board.slice(0, 10);
  if (score > S.best[mode]) S.best[mode] = score;
  S.lastTag = tag;
  save();
}
function qualifiesForBoard(mode, score) {
  if (score <= 0) return false;
  const b = S.boards[mode];
  return b.length < 10 || score > b[b.length - 1].score;
}

// ── run history / posture reports (keep 30) ──
function addReport(r) {
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
function saveGhost(mode, score, dt, path) {
  S.ghosts[mode] = { score, dt, path };
  save();
}

// ── store ──
function buy(id, price) {
  if (id === 'revive' && S.revives >= 3) return false;
  if (!spend(price)) return false;
  if (id === 'freeze') S.streak.freezes += 1;
  else if (id === 'revive') S.revives += 1;
  else if (!S.owned.includes(id)) S.owned.push(id);
  save(); return true;
}
function buyUpgrade(id) {
  const u = UPGRADES[id];
  const lvl = S.upgrades[id];
  if (lvl >= u.prices.length) return false;
  if (!spend(u.prices[lvl])) return false;
  S.upgrades[id] = lvl + 1;
  save(); return true;
}
function equipTheme(id) {
  if (S.owned.includes(id)) { S.equippedTheme = id; save(); return true; }
  return false;
}
function equipWorld(world) {
  if (world === 'space' ||
      S.owned.includes(Object.keys(WORLD_PACKS).find(k => WORLD_PACKS[k].world === world))) {
    S.equippedWorld = world; save(); return true;
  }
  return false;
}
function currentWorld() { return S.equippedWorld || 'space'; }
function equipCosmetic(slot, id) {
  if (S.owned.includes(id)) { S.equipped[slot] = id; save(); return true; }
  return false;
}
function themeColors() { return THEMES[S.equippedTheme]?.colors ?? THEMES.theme_space.colors; }
function cosmetics() {
  return {
    skin: SKINS[S.equipped.skin] ?? SKINS.skin_crosswing,
    trail: TRAILS[S.equipped.trail] ?? TRAILS.trail_theme,
    boom: BOOMS[S.equipped.boom] ?? BOOMS.boom_ember,
  };
}

Object.assign(exports,{THEMES,WORLD_PACKS,JUNGLE_HEROES,OCEAN_HEROES,SKINS,TRAILS,BOOMS,UPGRADES,STORE_EXTRAS,EVENTS,activeEvent,save,state,resetAll,addPoints,spend,dayStamp,tickStreak,GOAL_TARGETS,goalsToday,addGoalProgress,addXp,isoWeek,weeklyNow,dailyToday,submitScore,qualifiesForBoard,addReport,saveGhost,buy,buyUpgrade,equipTheme,equipWorld,currentWorld,equipCosmetic,themeColors,cosmetics});
});
define('content', function(require,exports){
// SLOUCH — designed content: run boons, daily mutators, missions, lore, ranks.

// ── wormhole boons: pick one of two at each wormhole exit; last for the run ──
const BOONS = [
  { id: 'overdrive', name: 'OVERDRIVE', desc: 'Hyperdrive burns 40% slower' },
  { id: 'magnetize', name: 'MAGNETIZE', desc: 'Passive stardust pull, all run' },
  { id: 'greed', name: 'GREED', desc: 'Stardust ×2 · rocks drift faster' },
  { id: 'gatecrash', name: 'GATECRASH', desc: 'Stretch gates pay double' },
  { id: 'guardian', name: 'GUARDIAN', desc: '+1 free revive this run' },
  { id: 'flowstate', name: 'FLOWSTATE', desc: 'Flow decays half as fast' },
];

// ── daily mutators, keyed by weekday (0=Sunday) ──
const MUTATORS = [
  { id: 'slowsunday', name: 'SLOW-MO SUNDAY', desc: 'everything at 80% speed — thread the needle' },
  { id: 'meteor', name: 'METEOR MONDAY', desc: 'the belt runs 25% hotter' },
  { id: 'tuck', name: 'TUCK TUESDAY', desc: 'hyperdrive scores quadruple' },
  { id: 'wall', name: 'WALL WEDNESDAY', desc: 'laser fences everywhere' },
  { id: 'thicket', name: 'THICKET THURSDAY', desc: 'wall gaps are narrower' },
  { id: 'flux', name: 'FLUX FRIDAY', desc: 'controls 40% more sensitive' },
  { id: 'swarm', name: 'SWARM SATURDAY', desc: 'double enemy patrols' },
];

// ── daily missions: 3 rotate per day, 150 stardust each ──
const MISSION_POOL = [
  { id: 'smash3burn', desc: 'Smash 3 rocks in one hyper burn', stat: 'burnSmash', target: 3 },
  { id: 'thread2', desc: 'Thread 2 laser walls in one run', stat: 'threads', target: 2 },
  { id: 'gates3', desc: 'Pass 3 stretch gates in one run', stat: 'gates', target: 3 },
  { id: 'graze8', desc: 'Build a graze train of 8', stat: 'bestTrain', target: 8 },
  { id: 'crystals15', desc: 'Collect 15 stardust crystals in one run', stat: 'crystals', target: 15 },
  { id: 'tucks6', desc: 'Fire the hyperdrive 6 times in one run', stat: 'tucks', target: 6 },
  { id: 'boss1', desc: 'Survive a dreadnought encounter', stat: 'bossKills', target: 1 },
  { id: 'score3k', desc: 'Score 3,000 in a single run', stat: 'score', target: 3000 },
  { id: 'hyper20', desc: 'Spend 20 seconds in hyperdrive in one run', stat: 'hyperSec', target: 20 },
  { id: 'powerups3', desc: 'Grab 3 power-ups in one run', stat: 'powerups', target: 3 },
];

// ── lore codex: unlocked one shard at a time ──
const LORE = [
  { t: 'SIGNAL 001 — THE FOLD', p: 'They called it the Great Fold. Eight billion heads, bowed in unison, year after year. The satellites watched us shrink two centimeters and said nothing.' },
  { t: 'SIGNAL 002 — THE BELT', p: 'When the data-star collapsed, everything we ever scrolled fell into orbit with it. Dead servers. Fossilized office chairs. A trillion unread notifications, frozen mid-ping. The Cervical Belt.' },
  { t: 'SIGNAL 003 — THE SHIP', p: 'The S.S. Posture was the last hull out of the Atlas shipyards. No stick. No throttle. The engineers wired the controls straight into the pilot\'s spine and called it honesty.' },
  { t: 'SIGNAL 004 — FIRST FLIGHT', p: 'Test pilot Yara Chen flew the first calibration run sitting perfectly tall for nine minutes. When she landed she cried. Not from fear — her neck just hadn\'t felt that good in eleven years.' },
  { t: 'SIGNAL 005 — THE TUCK', p: 'The hyperdrive doesn\'t burn fuel. It burns alignment. Glide the skull back over the spine and the ship remembers what a straight line is. That\'s the whole trick.' },
  { t: 'SIGNAL 006 — THE GATES', p: 'The Stretch Gates were left by whoever came before us. Gold rings, older than the Fold, that only open for a head turned all the way. As if someone knew we\'d forget how.' },
  { t: 'SIGNAL 007 — THE DREADNOUGHT', p: 'The Dreadnought was a posture-clinic ship once. It corrected necks with lasers, gently. Its last software update removed the word "gently."' },
  { t: 'SIGNAL 008 — THE WATCHDOG', p: 'Your ship sputters when you slouch because Yara Chen wrote the watchdog herself. The commit message read: "she deserves a pilot who sits like they mean it."' },
  { t: 'SIGNAL 009 — THE CORE', p: 'The Atlas Core is real. It is the last machine that holds a complete recording of a human standing upright, unhurried, unbent. Every gate you pass, it pings once. It is counting.' },
  { t: 'SIGNAL 010 — THE RIVALS', p: 'The red darts are chiropractic drones that went feral. They do not hate you. They just remember quotas.' },
  { t: 'SIGNAL 011 — THE WORMHOLES', p: 'The wormholes are not holes. They are the Belt exhaling. Ride the breath, and it will offer you a gift. It always offers two. It always means one.' },
  { t: 'SIGNAL 012 — THE PILOT', p: 'The Core finished counting. The last signal is addressed to you, by name it does not know: "Whoever taught this species to look up again — the sky noticed. Fly far. Sit tall."' },
];

// ── pilot ranks ──
const RANKS = [
  'CADET', 'ENSIGN', 'PILOT', 'ACE', 'VETERAN',
  'COMMANDER', 'CAPTAIN', 'WING LEADER', 'ATLAS GUARD', 'LEGEND',
];

function levelFromXp(xp) {
  let level = 0, need = 150, total = 0;
  while (xp >= total + need && level < 99) {
    total += need;
    level++;
    need = Math.round(150 * Math.pow(level + 1, 1.35));
  }
  return { level, into: xp - total, need, rank: RANKS[Math.min(RANKS.length - 1, Math.floor(level / 5))] };
}

Object.assign(exports,{BOONS,MUTATORS,MISSION_POOL,LORE,RANKS,levelFromXp});
});
define('achievements', function(require,exports){
// SLOUCH — achievements. Checked after each run (and a few live moments);
// unlocks are stored on-device and surfaced as toasts + a trophy room screen.

const { state, save, dayStamp } = require('state');

const ACHIEVEMENTS = [
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
function checkAchievements(runReport = null) {
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

Object.assign(exports,{ACHIEVEMENTS,checkAchievements});
});
define('report', function(require,exports){
// SLOUCH — posture reports: samples head pose during a run, computes range of
// motion / time-in-neutral / stretch score, and renders a shareable card.

const { head } = require('head');
const { state, dayStamp, GOAL_TARGETS } = require('state');

let acc = null;

function beginReport(mode) {
  acc = {
    mode, t: 0, neutralT: 0, moveT: 0, hyperT: 0,
    rom: { yawL: 0, yawR: 0, pitchU: 0, pitchD: 0, rollL: 0, rollR: 0, tuck: 0 },
    tucks: 0, gates: 0, slouchT: 0,
  };
}

// call every frame while alive
function reportTick(dt, hyperActive, slouchActive) {
  if (!acc || head.usingTouch) { if (acc) acc.t += dt; return; }
  acc.t += dt;
  const r = acc.rom;
  // rYaw>0 = left, rPitch>0 = down, rRoll>0 = right tilt
  r.yawL = Math.max(r.yawL, head.rYaw);
  r.yawR = Math.max(r.yawR, -head.rYaw);
  r.pitchD = Math.max(r.pitchD, head.rPitch);
  r.pitchU = Math.max(r.pitchU, -head.rPitch);
  r.rollR = Math.max(r.rollR, head.rRoll);
  r.rollL = Math.max(r.rollL, -head.rRoll);
  r.tuck = Math.max(r.tuck, -head.rZ);

  const mag = Math.max(Math.abs(head.rYaw), Math.abs(head.rPitch), Math.abs(head.rRoll));
  if (mag < 6 && Math.abs(head.rZ) < 3) acc.neutralT += dt;
  if (mag > 8) acc.moveT += dt;
  if (hyperActive) acc.hyperT += dt;
  if (slouchActive) acc.slouchT += dt;
}

function noteTuck() { if (acc) acc.tucks++; }
function noteGate() { if (acc) acc.gates++; }

// Stretch score 0–100: rewards movement coverage in every direction, time
// spent actively moving, tucks and gates; penalizes sustained slouching.
function buildReport(score) {
  if (!acc) return null;
  const r = acc.rom;
  const dirScore = (v, target) => Math.min(1, v / target);
  const coverage = (
    dirScore(r.yawL, 25) + dirScore(r.yawR, 25) +
    dirScore(r.pitchU, 18) + dirScore(r.pitchD, 18) +
    dirScore(r.rollL, 18) + dirScore(r.rollR, 18)) / 6;
  const activity = Math.min(1, acc.moveT / Math.max(30, acc.t * 0.35));
  const tucks = Math.min(1, acc.tucks / 6);
  const gates = Math.min(1, acc.gates / 3);
  const slouchPenalty = Math.min(0.3, acc.slouchT / Math.max(1, acc.t) * 1.5);
  const stretchScore = Math.round(Math.max(0,
    (coverage * 45 + activity * 25 + tucks * 15 + gates * 15) * (1 - slouchPenalty)));

  const report = {
    date: dayStamp(), mode: acc.mode, score,
    duration: Math.round(acc.t),
    rom: { yawL: Math.round(r.yawL), yawR: Math.round(r.yawR),
      pitchU: Math.round(r.pitchU), pitchD: Math.round(r.pitchD),
      rollL: Math.round(r.rollL), rollR: Math.round(r.rollR), tuck: Math.round(r.tuck * 10) / 10 },
    neutralPct: acc.t > 0 ? Math.round(acc.neutralT / acc.t * 100) : 0,
    moveSec: Math.round(acc.moveT),
    hyperSec: Math.round(acc.hyperT),
    tucks: acc.tucks, gates: acc.gates,
    stretchScore,
    touch: head.usingTouch,
  };
  acc = null;
  return report;
}

// weekly average stretch score from history, for "improving?" context
function weeklyTrend() {
  const h = state().history;
  if (h.length < 2) return null;
  const recent = h.slice(0, 7), prior = h.slice(7, 14);
  const avg = arr => arr.reduce((a, r) => a + (r.stretchScore || 0), 0) / Math.max(1, arr.length);
  if (!prior.length) return null;
  return Math.round(avg(recent) - avg(prior));
}

// ── share card: 1080×1350 PNG rendered on a canvas ──
function drawShareCard(report, opts = {}) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const bg = g.createRadialGradient(W / 2, H * 0.3, 80, W / 2, H * 0.45, H);
  bg.addColorStop(0, '#141b3e');
  bg.addColorStop(1, '#05060f');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(207,228,255,${0.2 + Math.random() * 0.6})`;
    g.beginPath();
    g.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2, 0, 7);
    g.fill();
  }

  g.textAlign = 'center';
  g.fillStyle = '#5ce1ff';
  g.font = '400 120px "Zen Dots", system-ui';
  g.shadowColor = '#5ce1ff'; g.shadowBlur = 40;
  g.fillText('SLOUCH', W / 2, 190);
  g.shadowBlur = 0;
  g.fillStyle = '#5c6a8a';
  g.font = '600 34px "Chakra Petch", system-ui';
  g.fillText(opts.duel ? 'DUEL CHALLENGE' : (report.mode === 'daily' ? 'DAILY CHALLENGE' : 'FLIGHT REPORT'), W / 2, 250);

  g.fillStyle = '#ffffff';
  g.font = '400 150px "Zen Dots", system-ui';
  g.shadowColor = '#5ce1ff'; g.shadowBlur = 26;
  g.fillText(report.score.toLocaleString(), W / 2, 470);
  g.shadowBlur = 0;
  g.fillStyle = '#e9f1ff';
  g.font = '800 40px "Chakra Petch", system-ui';
  g.fillText((opts.tag || state().lastTag) + ' · ' + ({ techneck: 'TECH NECK', casual: 'CASUAL', daily: 'DAILY', duel: 'DUEL', weekly: 'WEEKLY' }[report.mode] || 'FLIGHT'), W / 2, 540);

  // stretch ring
  const cx = W / 2, cy = 800, R = 150;
  g.lineWidth = 26; g.lineCap = 'round';
  g.strokeStyle = 'rgba(122,132,173,0.25)';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#5ce1ff';
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (report.stretchScore / 100) * Math.PI * 2);
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '400 84px "Zen Dots", system-ui';
  g.fillText(String(report.stretchScore), cx, cy + 20);
  g.fillStyle = '#5c6a8a';
  g.font = '700 30px "Chakra Petch", system-ui';
  g.fillText('STRETCH SCORE', cx, cy + 70);

  const rows = report.touch
    ? [['MODE', 'TOUCH'], ['TIME', report.duration + 's']]
    : [
      ['↔ ROTATION', `${report.rom.yawL}° / ${report.rom.yawR}°`],
      ['↕ FLEX / EXT', `${report.rom.pitchD}° / ${report.rom.pitchU}°`],
      ['⤿ SIDE BEND', `${report.rom.rollL}° / ${report.rom.rollR}°`],
      ['CHIN TUCKS', String(report.tucks)],
      ['STRETCH GATES', String(report.gates)],
    ];
  g.font = '700 34px "Chakra Petch", system-ui';
  let y = 1030;
  for (const [k, v] of rows) {
    g.textAlign = 'left'; g.fillStyle = '#5c6a8a'; g.fillText(k, 140, y);
    g.textAlign = 'right'; g.fillStyle = '#e8ecff'; g.fillText(v, W - 140, y);
    y += 56;
  }
  g.textAlign = 'center';
  g.fillStyle = '#5ce1ff';
  g.font = '700 30px "Chakra Petch", system-ui';
  g.fillText(opts.duel ? 'Beat my score → slouch. fix your neck.' : 'fix your neck · save the galaxy', W / 2, 1300);
  return c;
}

async function shareCard(report, opts = {}) {
  const canvas = drawShareCard(report, opts);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'slouch-run.png', { type: 'image/png' });
  const text = opts.duel
    ? `⚔️ I scored ${report.score.toLocaleString()} in SLOUCH — beat me: ${opts.url}`
    : `I scored ${report.score.toLocaleString()} in SLOUCH 🚀 stretch score ${report.stretchScore}/100`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return true; } catch { /* cancelled */ }
  } else if (navigator.share) {
    try { await navigator.share({ text, url: opts.url || location.href }); return true; } catch { /* cancelled */ }
  }
  // fallback: download the card
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'slouch-run.png';
  a.click();
  return true;
}

Object.assign(exports,{beginReport,reportTick,noteTuck,noteGate,buildReport,weeklyTrend,drawShareCard,shareCard});
});
define('ghost', function(require,exports){
// SLOUCH — ghost replay: records your ship path at 10 Hz; on a new best the
// path is saved and your next runs race a translucent ghost of it.

const { state, saveGhost } = require('state');

const HZ = 10;
const MAX_SAMPLES = 2400; // 4 minutes

let rec = null;
let play = null;

// The ghost is invisible — it only powers the pace comparison ("+400 vs best").
function beginGhost(mode) {
  rec = { mode, t: 0, next: 0, path: [] };
  const g = state().ghosts[mode];
  play = g?.path?.length ? { ...g, t: 0 } : null;
}

function ghostTick(dt, x, y) {
  if (!rec) return;
  rec.t += dt;
  if (rec.t >= rec.next && rec.path.length < MAX_SAMPLES * 2) {
    rec.path.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    rec.next += 1 / HZ;
  }
  if (play) play.t += dt;
}

// interpolated ghost position, or null if no ghost / replay ended
function ghostPos() {
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

function ghostBestScore() { return play?.score ?? null; }

// score the ghost "would have" at elapsed time t (linear proration)
function ghostPace(t) {
  if (!play?.path?.length) return null;
  const dur = (play.path.length / 2) / HZ;
  if (dur < 5) return null;
  return play.score * Math.min(1, t / dur);
}

function endGhost(score) {
  if (!rec) return;
  const prev = state().ghosts[rec.mode];
  if (rec.path.length > 20 && (!prev || score > prev.score)) {
    saveGhost(rec.mode, score, 1 / HZ, rec.path);
  }
  rec = null;
  play = null;
}

Object.assign(exports,{beginGhost,ghostTick,ghostPos,ghostBestScore,ghostPace,endGhost});
});
define('game', function(require,exports){
// SLOUCH — core game loop: control mapping, sectors, power-ups, boss fights,
// flow/graze trains, slow-mo, boons, mutators, missions, ghost racing.

const { world, updateWorld, render, explodeAt, setShieldVisual, setHyper, armWall, kickCamera, setGateArrow, randomizeBackdrop, setHeroMotion, setHeroSpeed, POWERUP_TYPES } = require('world');
const { head, updateHead } = require('head');
const { state, activeEvent } = require('state');
const { sfx, setMusicIntensity, musicEvent } = require('audio');
const { mulberry32 } = require('rng');
const { BOONS, MUTATORS, LORE } = require('content');
const { WORLD_TEXT } = require('packs');

function TXT() { return WORLD_TEXT[world.packMode] || WORLD_TEXT.space; }
const { beginReport, reportTick, noteTuck, noteGate, buildReport } = require('report');
const { beginGhost, ghostTick, ghostPace, endGhost } = require('ghost');

const game = {
  running: false, paused: false, over: false,
  mode: 'techneck',          // techneck | casual | daily | duel | weekly
  seed: null, duelTarget: 0,
  score: 0, mult: 1, flow: 0, dist: 0, time: 0,
  speed: 60,
  sector: 'belt',
  mutator: null,             // active daily mutator object
  boons: {},                 // id -> true for this run
  runStats: null,            // mission counters
  hooks: {},
};

const ship = { x: 0, y: 0, vx: 0, vy: 0 };
const shield = { active: false, energy: 1, cooldown: 0 }; // hyperdrive
const slouch = { t: 0, active: false };
const gate = { obj: null, pose: null, dwell: 0, announced: false };
const boss = { phase: 'idle', t: 0, wallsLeft: 0, wallT: 0, count: 0 };
const power = { magnet: 0, focus: 0, doubler: 0 };
const graze = { combo: 0, t: 0 };
const boon = { offer: null, chooseT: 0, cooldown: 0 };
let R = Math.random;

let spawnT = 0, enemyT = 0, crystalT = 0, gateT = 0, biasT = 0, powerT = 0, wallT = 0, sectorT = 0, shardT = 0, patternT = 0;
let seenHint = {};   // one-time explanations per run session
let hintQueue = [];  // [t, text] first-run tutorial toasts
let bias = { x: 0, y: 0 };
let lastFrame = 0;
let deathT = -1;
let invulnT = 0;
let slowmoT = 0;     // near-miss time dilation
let hitStop = 0;     // impact freeze
let burnSmash = 0;   // rocks smashed in current hyper burn
let freeRevives = 0; // from GUARDIAN boon
let usedRevive = false;
let raf = 0;

const SECTORS = ['belt', 'debris', 'lasers', 'wormhole'];
const SECTOR_NAMES = {
  belt: null, debris: 'DEBRIS FIELD', lasers: 'LASER FENCE GRID', wormhole: 'WORMHOLE',
};

function techStyle() { return game.mode !== 'casual'; }
function vib(p) { if (navigator.vibrate) navigator.vibrate(p); }

function startGame(mode, hooks, opts = {}) {
  game.mode = mode;
  game.hooks = hooks;
  game.seed = opts.seed ?? null;
  game.duelTarget = opts.duelTarget ?? 0;
  R = game.seed != null ? mulberry32(game.seed) : Math.random;
  game.running = true; game.paused = false; game.over = false;
  game.score = 0; game.mult = 1; game.flow = 0; game.dist = 0; game.time = 0; game.speed = 60;
  game.sector = 'belt';
  game.boons = {};
  game.mutator = mode === 'daily' ? MUTATORS[new Date().getDay()] : null;
  game.runStats = { burnSmash: 0, threads: 0, gates: 0, bestTrain: 0, crystals: 0,
    tucks: 0, bossKills: 0, score: 0, hyperSec: 0, powerups: 0 };
  ship.x = 0; ship.y = 0; ship.vx = 0; ship.vy = 0;
  shield.active = false; shield.energy = 1; shield.cooldown = 0;
  slouch.t = 0; slouch.active = false;
  gate.obj = null; gate.pose = null; gate.dwell = 0;
  boss.phase = 'idle'; boss.t = 120; boss.count = 0;
  power.magnet = 0; power.focus = 0; power.doubler = 0;
  graze.combo = 0; graze.t = 0;
  boon.offer = null; boon.chooseT = 0; boon.cooldown = 0;
  spawnT = 0.5; enemyT = 20; crystalT = 4; gateT = 12; biasT = 0; powerT = 14; wallT = 0;
  sectorT = 26; shardT = 40; patternT = 5;
  deathT = -1; invulnT = 0; slowmoT = 0; hitStop = 0; burnSmash = 0;
  freeRevives = 0; usedRevive = false;
  for (const pool of [world.asteroids, world.enemies, world.gates, world.crystals, world.powerups, world.walls]) {
    for (const o of pool) { o.userData.active = false; o.visible = false; }
  }
  world.boss.visible = false;
  world.ship.visible = true;
  document.body.classList.remove('focus-active');
  randomizeBackdrop();
  beginReport(mode);
  beginGhost(mode);
  seenHint = {};
  hintQueue = state().totals.runs === 0 ? [
    [2, mode === 'casual' ? 'MOVE YOUR HEAD — THE SHIP FOLLOWS' : 'TILT YOUR HEAD TO STEER'],
    [6, world.grounded ? (TXT().jumpHint || 'CHIN UP = JUMP') : 'CHIN UP / DOWN TO CLIMB AND DIVE'],
    [11, TXT().hyperHint],
    [17, 'SHAVE PAST ROCKS FOR GRAZE COMBOS'],
  ] : [];
  if (game.mutator) hooks.onToast?.(game.mutator.name);
  lastFrame = performance.now();
  cancelAnimationFrame(raf);
  loop(lastFrame);
}

function stopGame() {
  game.running = false;
  document.body.classList.remove('focus-active');
  setMusicIntensity(0);
  cancelAnimationFrame(raf);
}

function pauseGame(p) {
  game.paused = p;
  if (!p) lastFrame = performance.now();
}

// ── control mapping ──
function readControls(dt) {
  updateHead();
  game.hooks.onFaceLost?.(!head.hasFace && !head.usingTouch);
  if (!head.hasFace) return;

  const s = state().settings;
  let sens = s.sensitivity / 100;
  if (game.mutator?.id === 'flux') sens *= 1.4;
  const mir = s.mirror ? 1 : -1;
  let tx = 0, ty = 0;

  // Sign convention: rYaw>0 = head LEFT, rPitch>0 = head DOWN, rRoll>0 = tilt RIGHT.
  if (game.mode === 'casual') {
    tx = clampMap(-head.rYaw * mir, 1.2, 13 / sens);
    ty = clampMap(-head.rPitch, 1.2, 11 / sens);
  } else {
    tx = clampMap(head.rRoll * mir, 4.5, 20 / sens);
    ty = clampMap(-head.rPitch, 4, 16 / sens);
  }

  const targX = tx * world.bounds.x;
  const rate = Math.min(1, (game.mode === 'casual' ? 11 : 8.5) * dt);
  const nx = clamp(ship.x + (targX - ship.x) * rate, -world.bounds.x, world.bounds.x);

  let ny;
  if (world.grounded) {
    // real runner physics: a jump is ballistic — chin up launches, gravity
    // ALWAYS brings you back down. No hovering, no flying.
    const ground = world.groundY + 1.1;
    const onGround = ship.y <= ground + 0.05;
    if (onGround && heroState.jumpArmed && ty > 0.15) {
      heroState.jumpVel = 19 + Math.min(1, ty) * 13;   // bigger chin lift = bigger hop
      heroState.jumpArmed = false;
      vib(12);
    }
    if (ty < 0.1) heroState.jumpArmed = true;          // must reset the chin to hop again
    heroState.jumpVel -= 46 * dt;                       // gravity
    let yNext = ship.y + heroState.jumpVel * dt;
    if (yNext <= ground) { yNext = ground; heroState.jumpVel = 0; }
    ny = Math.min(yNext, ground + 12);
    heroState.ducking = ty < -0.35 && onGround;
  } else {
    const targY = ty * world.bounds.y;
    ny = clamp(ship.y + (targY - ship.y) * rate, -world.bounds.y, world.bounds.y);
  }
  ship.vx = (nx - ship.x) / Math.max(dt, 1e-4);
  ship.vy = (ny - ship.y) / Math.max(dt, 1e-4);
  ship.x = nx; ship.y = ny;
}

// hero animation state machine (pack worlds)
const heroState = { airborne: false, ducking: false, jumpVel: 0, jumpArmed: true };
function updateHeroAnim() {
  if (world.packMode === 'space') return;
  if (world.grounded) {
    const ground = world.groundY + 1.1;
    const inAir = ship.y > ground + 0.9;
    if (inAir && !heroState.airborne) setHeroMotion('jump');
    else if (!inAir && heroState.airborne) setHeroMotion('land');
    else if (!inAir && heroState.ducking) setHeroMotion('duck');
    else if (!inAir) setHeroMotion('base');
    heroState.airborne = inAir;
    setHeroSpeed(0.8 + game.speed / 90);
  } else {
    setHeroMotion(shield.active ? 'fast' : 'base');
    setHeroSpeed(shield.active ? 1.8 : 0.9 + game.speed / 160);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampMap(v, dead, full) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (full - dead));
}

// ── flow / graze trains ──
function addFlow(n) { game.flow = Math.min(1, game.flow + n); }

function onGraze() {
  graze.combo++;
  graze.t = 2;
  game.runStats.bestTrain = Math.max(game.runStats.bestTrain, graze.combo);
  addFlow(0.1 + graze.combo * 0.02);
  slowmoT = Math.max(slowmoT, 0.3);
  kickCamera(0.18);
  sfx.nearMiss(graze.combo);
  vib(10);
  if (graze.combo >= 2) game.hooks.onToast?.(`GRAZE ×${graze.combo}`);
}

function updateFlow(dt) {
  if (graze.t > 0) {
    graze.t -= dt;
    if (graze.t <= 0) {
      if (graze.combo >= 5) game.hooks.onToast?.('TRAIN LOST');
      graze.combo = 0;
    }
  }
  const decay = game.boons.flowstate ? 0.017 : 0.035;
  game.flow = Math.max(0, game.flow - dt * decay);
  game.mult = 1 + game.flow * 5;
  if (slouch.active) game.mult = Math.max(1, game.mult * 0.5);
  setMusicIntensity(bossActive() ? 0.9 : game.flow);
  game.hooks.onFlow?.(game.flow);
}

// ── HYPERDRIVE (chin tuck) ──
function updateHyper(dt) {
  const up = state().upgrades;
  const zBack = -head.rZ;
  const tucking = zBack > 2.8 && Math.abs(head.rPitch) < 14;
  let drain = 4.5 + up.hyperdur * 1.5;
  if (game.boons.overdrive) drain *= 1.4;
  const regen = 6 - up.hyperregen * 1.2;
  if (tucking && shield.cooldown <= 0 && shield.energy > 0.05) {
    if (!shield.active) {
      shield.active = true; sfx.shieldUp(); noteTuck();
      burnSmash = 0;
      game.runStats.tucks++;
      game.hooks.onToast?.(TXT().hyper);
      vib([15, 30, 15]);
    }
    shield.energy = Math.max(0, shield.energy - dt / drain);
    state().totals.hyperSec += dt;
    game.runStats.hyperSec += dt;
    if (shield.energy <= 0.01) { shield.active = false; shield.cooldown = 4; sfx.shieldDown(); }
  } else if (shield.active) {
    shield.active = false;
    shield.cooldown = 1.5;
    sfx.shieldDown();
  } else {
    shield.cooldown = Math.max(0, shield.cooldown - dt);
    if (shield.cooldown <= 0) shield.energy = Math.min(1, shield.energy + dt / Math.max(2, regen));
  }
  game.hooks.onShield?.(shield.energy, shield.active);
}

// ── slouch watchdog ──
function updateSlouch(dt) {
  const slouching = head.rZ > 4.2;
  slouch.t = slouching ? slouch.t + dt : Math.max(0, slouch.t - dt * 2);
  const wasActive = slouch.active;
  slouch.active = slouch.t > 2.5;
  if (slouch.active && !wasActive) sfx.warn();
  game.hooks.onSlouch?.(slouch.active);
}

// ── stretch gates: thresholds adapt to measured range of motion ──
function gatePoses() {
  const a = state().adaptive;
  const th = v => clamp(v * 0.7, 12, 28);
  return [
    { id: 'left', label: 'LOOK LEFT · HOLD', test: () => head.rYaw > th(a.yawL) },
    { id: 'right', label: 'LOOK RIGHT · HOLD', test: () => head.rYaw < -th(a.yawR) },
    { id: 'up', label: 'CHIN UP · HOLD', test: () => head.rPitch < -th(a.pitchU) },
  ];
}

function spawnGate() {
  const g = world.gates.find(o => !o.userData.active);
  if (!g) return;
  const poses = gatePoses();
  const pose = poses[Math.floor(R() * poses.length)];
  g.userData.active = true;
  g.userData.passed = false;
  g.position.set(0, world.grounded ? world.groundY + 5.4 : 0, world.spawnZ);
  g.visible = true;
  setGateArrow(g, pose.id);
  gate.obj = g; gate.pose = pose; gate.dwell = 0; gate.announced = false;
}

function updateGate(dt) {
  const g = gate.obj;
  if (!g || !g.userData.active) return;
  g.position.z += game.speed * dt;
  // chevrons pulse toward the player instead of spinning
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.07;
  g.userData.holder?.scale.setScalar(pulse);
  if (g.position.z > -260 && !gate.announced) {
    gate.announced = true;
    game.hooks.onGate?.(gate.pose.label);
    if (!seenHint.gate) {
      seenHint.gate = true;
      game.hooks.onToast?.(TXT().gateHint);
    }
  }
  if (gate.announced && !g.userData.passed) {
    if (gate.pose.test()) gate.dwell += dt;
    game.hooks.onGateProgress?.(Math.min(1, gate.dwell / 1.2));
  }
  if (g.position.z > 0 && !g.userData.passed) {
    g.userData.passed = true;
    game.hooks.onGate?.(null);
    if (gate.dwell >= 1.2) {
      const base = game.boons.gatecrash ? 1000 : 500;
      const pts = Math.round(base * game.mult);
      game.score += pts;
      addFlow(0.22);
      noteGate();
      state().totals.gates++;
      game.runStats.gates++;
      sfx.gate();
      vib([20, 40, 20]);
      game.hooks.onToast?.(`${TXT().gate} +${pts}`);
    } else {
      game.hooks.onToast?.('gate missed');
    }
  }
  if (g.position.z > world.killZ) { g.userData.active = false; g.visible = false; gate.obj = null; }
}

// ── sectors ──
function nextSector() {
  const leaving = game.sector;
  const pool = SECTORS.filter(s => s !== game.sector);
  game.sector = pool[Math.floor(R() * pool.length)];
  if (game.mutator?.id === 'wall' && game.sector === 'belt') game.sector = 'lasers';
  sectorT = game.sector === 'wormhole' ? 12 : 24 + R() * 10;
  const label = SECTOR_NAMES[game.sector];
  if (label) game.hooks.onToast?.(label);
  if (game.sector === 'lasers') wallT = 2;
  if (game.sector === 'wormhole') musicEvent('wormhole');
  else if (leaving === 'wormhole') musicEvent('restore');
  // wormhole exit gift: offer a boon
  if (leaving === 'wormhole' && boon.cooldown <= 0) offerBoon();
}

// ── boons: tilt (or tap) to choose; world runs at 25% while deciding ──
function offerBoon() {
  const pool = BOONS.filter(b => !game.boons[b.id]);
  if (pool.length < 2) return;
  const a = pool.splice(Math.floor(R() * pool.length), 1)[0];
  const b = pool.splice(Math.floor(R() * pool.length), 1)[0];
  boon.offer = [a, b];
  boon.chooseT = 0;
  game.hooks.onBoonOffer?.(a, b);
}

function updateBoon(dt) {
  boon.cooldown = Math.max(0, boon.cooldown - dt);
  if (!boon.offer) return;
  // roll left/right (or touch x in fallback) picks a side
  const dir = head.usingTouch ? Math.sign(head.touchX || 0) : Math.sign(clampMap(head.rRoll, 8, 20));
  if (dir !== 0) {
    boon.chooseT += dt;
    game.hooks.onBoonLean?.(dir, Math.min(1, boon.chooseT / 0.9));
    if (boon.chooseT >= 0.9) chooseBoon(dir < 0 ? 0 : 1);
  } else {
    boon.chooseT = Math.max(0, boon.chooseT - dt * 2);
    game.hooks.onBoonLean?.(0, 0);
  }
}

function chooseBoon(index) {
  if (!boon.offer) return;
  const chosen = boon.offer[index];
  game.boons[chosen.id] = true;
  if (chosen.id === 'guardian') freeRevives++;
  boon.offer = null;
  boon.cooldown = 8;
  sfx.powerup();
  vib([20, 30, 20]);
  game.hooks.onBoonOffer?.(null);
  game.hooks.onToast?.(chosen.name);
}

// ── boss ──
function updateBoss(dt) {
  boss.t -= dt;
  if (boss.phase === 'idle' && boss.t <= 0 && game.sector !== 'wormhole' && !boon.offer) {
    boss.phase = 'warn';
    boss.wallsLeft = 4 + Math.min(3, boss.count);
    boss.wallT = 3;
    sfx.bossWarn();
    musicEvent('boss');
    vib([80, 60, 80]);
    game.hooks.onBoss?.(TXT().bossIn);
    world.boss.visible = true;
    world.boss.position.set(0, 2, -190);
    return;
  }
  if (boss.phase === 'warn') {
    boss.wallT -= dt;
    if (boss.wallT <= 0) { boss.phase = 'fight'; boss.wallT = 0.5; }
  }
  if (boss.phase === 'fight') {
    game.hooks.onBoss?.(`${TXT().bossTag} · ${boss.wallsLeft}`);
    boss.wallT -= dt;
    if (boss.wallT <= 0 && boss.wallsLeft > 0) {
      spawnWall(true);
      boss.wallsLeft--;
      boss.wallT = 3.2;
      sfx.laser();
    }
    if (boss.wallsLeft <= 0 && !world.walls.some(w => w.userData.active)) {
      boss.phase = 'idle';
      boss.count++;
      boss.t = 100;
      state().totals.bossKills++;
      game.runStats.bossKills++;
      const pts = Math.round(2000 * game.mult);
      game.score += pts;
      addFlow(0.5);
      sfx.bossDown();
      musicEvent('restore');
      game.hooks.onBoss?.(null);
      game.hooks.onToast?.(`${TXT().bossClear} +${pts}`);
      world.boss.visible = false;
    }
  }
}

function bossActive() { return boss.phase !== 'idle'; }

// ── laser walls ──
function spawnWall(fromBoss) {
  const w = world.walls.find(o => !o.userData.active);
  if (!w) return;
  const gapAxis = world.grounded ? 'x' : (R() < 0.55 ? 'x' : 'y');
  const gapCenter = gapAxis === 'x' ? (R() * 2 - 1) * 10 : (R() * 2 - 1) * 5.5;
  armWall(w, gapAxis, gapCenter);
  if (game.mutator?.id === 'thicket') w.userData.gapHalf = 2.4;
  w.userData.active = true;
  w.userData.fromBoss = !!fromBoss;
  w.position.set(0, 0, fromBoss ? -180 : world.spawnZ);
  w.visible = true;
}

function updateWalls(dt) {
  for (const w of world.walls) {
    if (!w.userData.active) continue;
    w.position.z += game.speed * dt;
    w.userData.mat.opacity = 0.55 + Math.sin(performance.now() * 0.02) * 0.3;
    if (Math.abs(w.position.z) < 1.6) {
      const off = w.userData.gapAxis === 'x' ? ship.x - w.userData.gapCenter : ship.y - w.userData.gapCenter;
      if (Math.abs(off) > w.userData.gapHalf) {
        if (shield.active) {
          w.userData.active = false; w.visible = false;
          explodeAt(world.ship.position);
          const pts = Math.round(300 * game.mult);
          game.score += pts;
          state().totals.smashes++;
          hitStop = 0.06;
          kickCamera(0.4);
          sfx.smash();
          game.hooks.onToast?.(`${TXT().breach} +${pts}`);
        } else if (invulnT <= 0) {
          die();
        }
      } else if (!w.userData.scored) {
        w.userData.scored = true;
        game.runStats.threads++;
        const pts = Math.round(150 * game.mult);
        game.score += pts;
        addFlow(0.15);
        onGraze();
        game.hooks.onToast?.(`${TXT().thread} +${pts}`);
      }
    }
    if (w.position.z > world.killZ) { w.userData.active = false; w.userData.scored = false; w.visible = false; }
  }
}

// ── power-ups & lore shards ──
function spawnPowerup(forceType) {
  const p = world.powerups.find(o => !o.userData.active);
  if (!p) return;
  const types = Object.keys(POWERUP_TYPES);
  const type = forceType || types[Math.floor(R() * types.length)];
  const def = type === 'shard'
    ? { color: 0xffffff }
    : POWERUP_TYPES[type];
  p.userData.active = true;
  p.userData.type = type;
  p.userData.setType(type);
  p.userData.mat.color.setHex(def.color);
  p.userData.glowMat.color.setHex(def.color);
  const py = world.grounded ? world.groundY + 1.6 + R() * 6 : (R() * 2 - 1) * 6;
  p.position.set((R() * 2 - 1) * 11, py, world.spawnZ);
  p.visible = true;
}

function activatePowerup(type) {
  const up = state().upgrades;
  if (type === 'shard') {
    const s = state();
    if (s.lore < LORE.length) {
      s.lore++;
      const entry = LORE[s.lore - 1];
      game.score += 300;
      game.hooks.onToast?.(`DATA SHARD · ${entry.t}`);
    }
    sfx.gate();
    vib([30, 50, 30]);
    game.runStats.powerups++;
    return;
  }
  if (type === 'magnet') power.magnet = 8 + up.magnet * 2.5;
  if (type === 'focus') { power.focus = 5; document.body.classList.add('focus-active'); }
  if (type === 'doubler') power.doubler = 10;
  game.runStats.powerups++;
  sfx.powerup();
  vib(30);
  // first grab of each type this session explains what it does
  const EXPLAIN = {
    magnet: 'MAGNET — coins fly to you',
    focus: 'HOURGLASS — time slows down',
    doubler: 'CROWN — score doubled',
  };
  if (!seenHint[type]) {
    seenHint[type] = true;
    game.hooks.onToast?.(EXPLAIN[type]);
  } else {
    game.hooks.onToast?.(POWERUP_TYPES[type].label);
  }
}

function updatePowerups(dt) {
  for (const k of Object.keys(power)) {
    if (power[k] > 0) {
      power[k] -= dt;
      if (power[k] <= 0 && k === 'focus') document.body.classList.remove('focus-active');
    }
  }
  game.hooks.onPowerups?.(power);
  for (const p of world.powerups) {
    if (!p.userData.active) continue;
    p.position.z += game.speed * dt;
    p.rotation.y += dt * 2.5;
    p.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.12);
    if (Math.abs(p.position.z) < 2.5) {
      const d = Math.hypot(p.position.x - ship.x, p.position.y - ship.y);
      if (d < p.userData.radius + 1.3) {
        p.userData.active = false; p.visible = false;
        activatePowerup(p.userData.type);
      }
    }
    if (p.position.z > world.killZ) { p.userData.active = false; p.visible = false; }
  }
}

// ── spawning ──
function spawnAsteroid(smallOnly = false) {
  const bx = bias.x * 7, by = bias.y * 4;
  placeRock(
    clamp(bx + (R() - 0.5) * 30, -17, 17),
    clamp(by + (R() - 0.5) * 17, -9.5, 9.5),
    R() * 60, { smallOnly, drift: true });
}

function placeRock(x, y, dz, opts = {}) {
  const pool = world.asteroids.filter(o => !o.userData.active &&
    (!opts.smallOnly || o.userData.radius < 2.6));
  const a = pool[Math.floor(R() * pool.length)];
  if (!a) return;
  a.userData.active = true;
  a.visible = true;
  // world placement rules (see packs.js header): grounded worlds root everything
  // on the surface; ocean floor-anchored props grow from the sand; only true
  // floaters keep their free y.
  const anchored = world.grounded ||
    (world.packMode === 'ocean' && a.userData.anchor === 'floor');
  if (anchored) {
    const base = world.grounded ? world.groundY : world.floorY;
    y = base + (a.userData.halfH ?? a.userData.radius);
  }
  a.position.set(x, y, world.spawnZ - dz);
  let driftMul = (opts.drift && world.packMode === 'space') ? (game.sector === 'debris' ? 2.2 : 1) : 0.12;
  if (game.boons.greed) driftMul *= 1.15;
  a.userData.vx = anchored ? 0 : (R() - 0.5) * 2.5 * driftMul;
  a.userData.vy = anchored ? 0 : world.packMode === 'space' ? (R() - 0.5) * 1.5 * driftMul : 0;
  a.userData.missed = false;
  if (world.spinObstacles) a.rotation.set(R() * 3, R() * 3, 0);
  else a.rotation.set(0, R() * Math.PI * 2, 0);
}

// ── rock choreography: formations that prescribe real neck movement.
// Each pattern is a held or rhythmic stretch, not random noise.
function spawnPattern() {
  const kinds = ['slalom', 'sideWall', 'ceiling', 'floor', 'corridor'];
  const kind = kinds[Math.floor(R() * kinds.length)];
  const big = () => 1.5 + R() * 2;   // spacing jitter

  if (kind === 'slalom') {
    // alternating side clusters → rhythmic lateral tilts
    const first = R() < 0.5 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      const side = first * (i % 2 === 0 ? 1 : -1);
      for (let j = 0; j < 3; j++) {
        placeRock(side * (7 + R() * 5), (R() - 0.5) * 13, i * 62 + R() * 14);
      }
    }
  } else if (kind === 'sideWall') {
    // a long wall blocking one side → hold the tilt to the open lane
    const open = R() < 0.5 ? -1 : 1; // open side
    for (let i = 0; i < 9; i++) {
      placeRock(-open * (2 + R() * 12), (R() - 0.5) * 15, i * 34 + R() * 10);
    }
    // a couple of rocks guarding the open lane edge to keep it honest
    placeRock(open * 13, (R() - 0.5) * 10, 90 + R() * 60);
  } else if (kind === 'ceiling') {
    // roof of rocks → hold the dive (chin down)
    for (let i = 0; i < 8; i++) {
      placeRock((R() - 0.5) * 26, 3 + R() * 5.5, i * 36 + R() * 12);
    }
  } else if (kind === 'floor') {
    // floor of rocks → hold the climb (chin up, the anti-tech-neck direction)
    for (let i = 0; i < 8; i++) {
      placeRock((R() - 0.5) * 26, -3 - R() * 5.5, i * 36 + R() * 12);
    }
  } else {
    // corridor: paired rocks form a channel that drifts across → follow it
    const phase = R() * Math.PI * 2;
    const vertical = R() < 0.4;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      if (vertical) {
        const cy = Math.sin(phase + t * 2.4) * 4.5;
        placeRock((R() - 0.5) * 22, cy + 5.5 + big(), i * 44);
        placeRock((R() - 0.5) * 22, cy - 5.5 - big(), i * 44);
      } else {
        const cx = Math.sin(phase + t * 2.4) * 8;
        placeRock(cx + 6.5 + big(), (R() - 0.5) * 12, i * 44);
        placeRock(cx - 6.5 - big(), (R() - 0.5) * 12, i * 44);
      }
    }
  }
}

function spawnEnemy() {
  const e = world.enemies.find(o => !o.userData.active);
  if (!e) return;
  e.userData.active = true;
  e.visible = true;
  const side = R() < 0.5 ? -1 : 1;
  const y = world.grounded
    ? world.groundY + (e.userData.halfH ?? 1.2)   // predators run ON the ground
    : (R() - 0.5) * 12;
  e.position.set(side * 20, y, world.spawnZ * 0.7);
  e.userData.vx = -side * (6 + R() * 5);
  e.userData.vy = world.grounded ? 0 : (R() - 0.5) * 2;
  e.userData.missed = false;
  e.lookAt(e.position.x + e.userData.vx, e.position.y, e.position.z + game.speed);
}

// crystal lines spawn near the obstacle bias — greed lives on the dangerous side
function spawnCrystalLine() {
  const x = clamp(bias.x * 6 + (R() - 0.5) * 14, -10, 10);
  let y = clamp(bias.y * 3 + (R() - 0.5) * 8, -6, 6);
  if (world.grounded) y = world.groundY + 1.4 + R() * 6.5;
  let placed = 0;
  for (const c of world.crystals) {
    if (c.userData.active || placed >= 5) continue;
    c.userData.active = true;
    c.visible = true;
    c.position.set(x, y, world.spawnZ - placed * 9);
    placed++;
  }
}

// value scales with how dangerous the pickup spot is (nearby active rocks)
function crystalValue() {
  let nearby = 0;
  for (const a of world.asteroids) {
    if (!a.userData.active) continue;
    if (a.position.z > -60 &&
        Math.hypot(a.position.x - ship.x, a.position.y - ship.y) < 10) nearby++;
  }
  const danger = 1 + Math.min(4, nearby) * 0.5;
  const boons = game.boons.greed ? 2 : 1;
  return Math.round(50 * danger * boons * game.mult * (power.doubler > 0 ? 2 : 1));
}

// ── collisions ──
function updateObstacles(dt) {
  const sx = ship.x, sy = ship.y;
  const shipR = 1.1;
  const passiveMagnet = game.boons.magnetize ? 5 : 0;
  const magnetR = power.magnet > 0 ? 6 + state().upgrades.magnet * 1.5 : passiveMagnet;

  for (const a of world.asteroids) {
    if (!a.userData.active) continue;
    a.position.z += game.speed * dt;
    a.position.x += a.userData.vx * dt;
    a.position.y += a.userData.vy * dt;
    if (world.spinObstacles) {
      a.rotation.x += a.userData.rx * dt;
      a.rotation.y += a.userData.ry * dt;
    }
    collideCheck(a, sx, sy, shipR);
  }
  for (const e of world.enemies) {
    if (!e.userData.active) continue;
    e.position.z += game.speed * dt * 1.25;
    e.position.x += e.userData.vx * dt;
    e.position.y += e.userData.vy * dt;
    collideCheck(e, sx, sy, shipR);
  }
  for (const c of world.crystals) {
    if (!c.userData.active) continue;
    c.position.z += game.speed * dt;
    c.rotation.y += c.userData.spin * dt;
    c.rotation.x += c.userData.spin * 0.6 * dt;
    if (magnetR > 0 && c.position.z > -60) {
      const d = Math.hypot(c.position.x - sx, c.position.y - sy);
      if (d < magnetR + 4) {
        c.position.x += (sx - c.position.x) * Math.min(1, dt * 6);
        c.position.y += (sy - c.position.y) * Math.min(1, dt * 6);
      }
    }
    if (Math.abs(c.position.z) < 2.5) {
      const d = Math.hypot(c.position.x - sx, c.position.y - sy);
      if (d < c.userData.radius + shipR + 0.6) {
        c.userData.active = false; c.visible = false;
        const pts = crystalValue();
        game.score += pts;
        game.runStats.crystals++;
        addFlow(0.05);
        sfx.nearMiss(Math.min(10, game.runStats.crystals % 11));
        if (!seenHint.coin) {
          seenHint.coin = true;
          game.hooks.onToast?.(`+${pts} ${TXT().coinHint}`);
        } else {
          game.hooks.onToast?.(`+${pts}`);
        }
      }
    }
    if (c.position.z > world.killZ) { c.userData.active = false; c.visible = false; }
  }
}

function collideCheck(o, sx, sy, shipR) {
  // hitboxes are deliberately smaller than the visuals — you die when you
  // truly run into something, not when you brush past it
  const r = o.userData.radius * 0.72;
  if (Math.abs(o.position.z) < r + 1.6) {
    const d = Math.hypot(o.position.x - sx, o.position.y - sy);
    if (d < r + shipR * 0.8) {
      if (shield.active) {
        explodeAt(o.position);
        o.userData.active = false; o.visible = false;
        const pts = Math.round(100 * game.mult);
        game.score += pts;
        state().totals.smashes++;
        burnSmash++;
        game.runStats.burnSmash = Math.max(game.runStats.burnSmash, burnSmash);
        addFlow(0.1);
        hitStop = 0.05;
        kickCamera(0.3);
        sfx.smash();
        game.hooks.onToast?.(`${TXT().smash} +${pts}`);
        return;
      }
      if (invulnT > 0) return;
      die();
      return;
    }
    if (!o.userData.missed && d < r + shipR + 2.6) {
      o.userData.missed = true;
      const pts = Math.round(25 * game.mult);
      game.score += pts;
      onGraze();
    }
  }
  if (o.position.z > world.killZ) { o.userData.active = false; o.visible = false; }
}

function die() {
  if (game.over) return;
  if ((!usedRevive && state().revives > 0) || freeRevives > 0) {
    if (freeRevives > 0) freeRevives--;
    else { usedRevive = true; state().revives--; }
    invulnT = 2.5;
    explodeAt(world.ship.position);
    for (const pool of [world.asteroids, world.enemies, world.walls]) {
      for (const o of pool) {
        if (o.userData.active && o.position.z > -70) { o.userData.active = false; o.visible = false; }
      }
    }
    sfx.revive();
    game.hooks.onToast?.('REVIVED');
    vib(60);
    return;
  }
  game.over = true;
  deathT = 0;
  hitStop = 0.09;
  explodeAt(world.ship.position);
  kickCamera(0.7);
  world.ship.visible = false;
  world.shipShield.visible = false;
  sfx.crash();
  vib(120);
}

// ── main loop ──
function loop(t) {
  if (!game.running) return;
  raf = requestAnimationFrame(loop);
  const rawDt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (game.paused) return;

  // impact hit-stop: the world freezes for a few frames
  if (hitStop > 0) {
    hitStop -= rawDt;
    render();
    return;
  }

  // time dilation: near-miss slow-mo, focus, boon-choice, daily mutator
  slowmoT = Math.max(0, slowmoT - rawDt);
  let timeScale = 1;
  if (slowmoT > 0) timeScale = 0.45;
  if (boon.offer) timeScale = Math.min(timeScale, 0.25);
  if (game.mutator?.id === 'slowsunday') timeScale *= 0.8;
  const dt = rawDt * timeScale;

  game.time += dt;

  if (!game.over) {
    game.speed = 60 + Math.min(90, game.time * 0.45);
    if (game.sector === 'wormhole') game.speed *= 1.3;
    if (game.mutator?.id === 'meteor') game.speed *= 1.25;
    readControls(rawDt);       // controls always run at real time
    updateHeroAnim();
    updateHyper(rawDt);
    if (techStyle()) updateSlouch(rawDt);
    updateFlow(dt);
    updateBoon(rawDt);
    if (power.focus > 0) game.speed *= 0.55;
    if (shield.active) game.speed *= 1.75;
    setHyper(shield.active);
    invulnT = Math.max(0, invulnT - dt);
    world.ship.visible = invulnT <= 0 || Math.floor(t / 90) % 2 === 0;

    reportTick(rawDt, shield.active, slouch.active);
    ghostTick(dt, ship.x, ship.y);

    const hyperScore = shield.active ? (game.mutator?.id === 'tuck' ? 4 : 2) : 1;
    const scoreMul = hyperScore * (power.doubler > 0 ? 2 : 1);
    game.dist += game.speed * dt;
    game.score += game.speed * dt * 0.18 * game.mult * scoreMul;
    game.runStats.score = Math.floor(game.score);
    game.hooks.onScore?.(Math.floor(game.score), game.mult);
    game.hooks.onPace?.(ghostPace(game.time), Math.floor(game.score));

    if (!bossActive()) {
      sectorT -= dt;
      if (sectorT <= 0) nextSector();
    }
    updateBoss(dt);

    const inWormhole = game.sector === 'wormhole';
    const inLasers = game.sector === 'lasers';
    const inDebris = game.sector === 'debris';
    if (!bossActive() && !inWormhole) {
      // hyperdrive gamble: spawns come 80% faster while burning
      spawnT -= dt * (shield.active ? 1.8 : 1);
      if (spawnT <= 0) {
        spawnAsteroid(inDebris);
        if ((inDebris || game.time > 30) && R() < 0.55) spawnAsteroid(inDebris);
        const base = inDebris ? 0.42 : inLasers ? 1.4 : 0.85;
        spawnT = Math.max(inDebris ? 0.14 : 0.24, base - game.time * 0.004);
      }
      // choreographed formations in open belt: the real neck workout
      if (!inDebris && !inLasers) {
        patternT -= dt;
        if (patternT <= 0) { spawnPattern(); patternT = 7 + R() * 5; }
      }
      enemyT -= dt * (game.mutator?.id === 'swarm' ? 2 : 1);
      if (enemyT <= 0 && game.time > 20) { spawnEnemy(); enemyT = 7 + R() * 6; }
      if (inLasers) {
        wallT -= dt;
        if (wallT <= 0) { spawnWall(false); wallT = 4.5; }
      }
    }
    crystalT -= dt;
    if (crystalT <= 0) {
      spawnCrystalLine();
      const ev = activeEvent();
      const boost = (inWormhole ? 0.35 : 1) * (ev?.crystalBoost ? 0.6 : 1);
      crystalT = (6 + R() * 5) * boost;
    }
    if (!bossActive() && !inWormhole) {
      powerT -= dt;
      if (powerT <= 0) { spawnPowerup(); powerT = 16 + R() * 8; }
      // lore shards: rare, only while the codex is incomplete
      if (state().lore < LORE.length) {
        shardT -= dt;
        if (shardT <= 0) {
          if (R() < 0.3) spawnPowerup('shard');
          shardT = 45;
        }
      }
    }

    if (techStyle() && !bossActive()) {
      gateT -= dt;
      if (gateT <= 0 && !gate.obj) { spawnGate(); gateT = 16 + R() * 8; }
      biasT -= dt;
      if (biasT <= 0) {
        bias.x = [-1, 0, 1][Math.floor(R() * 3)];
        bias.y = [-0.5, 0, 0.7][Math.floor(R() * 3)];
        biasT = 14;
      }
    }
    updateGate(dt);
    updatePowerups(dt);
    updateWalls(dt);

    // first-run tutorial hints
    if (hintQueue.length && game.time >= hintQueue[0][0]) {
      game.hooks.onToast?.(hintQueue.shift()[1]);
    }
  } else {
    deathT += dt;
    setHyper(false);
    game.speed = Math.max(10, game.speed - dt * 60);
    if (deathT > 1.4) {
      stopGame();
      const score = Math.floor(game.score);
      const pace = ghostPace(game.time);
      endGhost(score);
      const report = buildReport(score);
      game.hooks.onGameOver?.(score, report, { pace, runStats: game.runStats, boons: Object.keys(game.boons) });
      return;
    }
  }

  updateObstacles(dt);

  const S = world.ship;
  S.position.set(ship.x, ship.y, 0);
  if (world.grounded) {
    // runners lean into turns and pitch through jumps, but never roll like a ship
    S.rotation.z = clamp(-ship.vx * 0.012, -0.2, 0.2);
    S.rotation.x = clamp(-ship.vy * 0.015, -0.3, 0.15);
    S.rotation.y = clamp(-ship.vx * 0.03, -0.5, 0.5);
  } else {
    S.rotation.z = clamp(-ship.vx * 0.06, -0.7, 0.7);
    S.rotation.x = clamp(-ship.vy * 0.035, -0.45, 0.45);
    S.rotation.y = clamp(-ship.vx * 0.02, -0.3, 0.3);
  }
  world.shipShield.visible = shield.active;
  if (shield.active) setShieldVisual(shield.energy);

  updateWorld(dt, game.speed, ship);
  render();
}

// test/debug handle
game._debug = {
  boss, power, shield, slouch, graze, boon,
  forceBoss() { boss.t = 0.1; },
  forceSector(s) { game.sector = s; sectorT = 99; if (s === 'lasers') wallT = 0.5; },
  forcePowerup(type) { activatePowerup(type); },
  forceBoon() { offerBoon(); },
  god() { invulnT = 1e9; },
};

// idle menu background
let idleRaf = 0;
function startIdle() {
  cancelAnimationFrame(idleRaf);
  world.boss.visible = false;
  let last = performance.now();
  function idle(t) {
    if (game.running) return;
    idleRaf = requestAnimationFrame(idle);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    ship.x = Math.sin(t * 0.0004) * 3;
    ship.y = world.grounded ? world.groundY + 1.1 : Math.cos(t * 0.0006) * 1.5;
    world.ship.position.set(ship.x, ship.y, 0);
    world.ship.rotation.z = Math.sin(t * 0.0004 + 1) * 0.15;
    world.ship.visible = true;
    world.shipShield.visible = false;
    updateWorld(dt, 30, { x: 0, y: 0 });
    render();
  }
  idle(last);
}
function stopIdle() { cancelAnimationFrame(idleRaf); }

Object.assign(exports,{game,startGame,stopGame,pauseGame,chooseBoon,startIdle,stopIdle});
});
define('packs',function(require,exports){const WORLD_TEXT = {
  space: {
    hyper: 'HYPERDRIVE', retry: 'FLY AGAIN', death: 'SHIP DOWN',
    bossIn: 'DREADNOUGHT INBOUND', bossTag: 'DREADNOUGHT', bossClear: 'DREADNOUGHT CLEARED',
    smash: 'SMASH', breach: 'WALL BREACH', thread: 'THREADED', gate: 'STRETCH GATE',
    coinHint: 'STARDUST — buy upgrades in the store', gateHint: 'GOLD RING — HOLD THE POSE TO OPEN IT',
    hyperHint: 'GLIDE YOUR CHIN STRAIGHT BACK = HYPERDRIVE',
  },
  ocean: {
    hyper: 'RIPTIDE', retry: 'SWIM AGAIN', death: 'WASHED OUT',
    bossIn: 'THE GREAT WHALE APPROACHES', bossTag: 'GREAT WHALE', bossClear: 'WHALE OUTSWUM',
    smash: 'SPLASH', breach: 'KELP BREAK', thread: 'THREADED', gate: 'STRETCH RING',
    coinHint: 'COINS — buy upgrades in the store', gateHint: 'GOLD RING — HOLD THE POSE TO OPEN IT',
    hyperHint: 'CHIN BACK = RIPTIDE BOOST',
  },
  jungle: {
    hyper: 'SUPERHOP', retry: 'HOP AGAIN', death: 'BUNNY DOWN',
    bossIn: 'BEAR CHARGE INCOMING', bossTag: 'THE BEAR', bossClear: 'BEAR OUTRUN',
    smash: 'THUMP', breach: 'VINE BREAK', thread: 'THREADED', gate: 'STRETCH ARCH',
    coinHint: 'CARROTS — buy upgrades in the store', gateHint: 'GOLD ARCH — HOLD THE POSE TO OPEN IT',
    hyperHint: 'CHIN BACK = SUPERHOP', jumpHint: 'CHIN UP = JUMP',
  },
};
const PACKS = {
  ocean: {
    base: 'assets/packs/ocean/',
    grounded: false,
    env: {
      // bright tropical reef, not the abyss
      bg: ['#b8f0fa', '#5fd0ea', '#1e9ac4', '#0a6a92'],
      fogColor: 0x3fb0d4, fogDensity: 0.0044,
      floor: 'floor.jpg', floorTint: 0xffF8e0, floorY: -9.5,
      ray: 0xffffff, rayOpacity: 0.14, particle: 0xe8fbff, accent: 0x3fd4ff,
      hemi: [0xf0ffff, 0x3a7a90, 1.5],
      exposure: 1.24,
      decorCount: 36, sway: true, surface: true, swimmerCount: 13, dunes: true, danger: 0xff5470,
      swimmers: ['hero_tang.glb', 'hero_mandarin.glb', 'hero_clown.glb'],
    },
    heroes: {
      hero_clown: { file: 'hero_clown.glb', len: 3.6, yaw: Math.PI },
      hero_tang: { file: 'hero_tang.glb', len: 3.4, yaw: Math.PI },
      hero_mandarin: { file: 'hero_mandarin.glb', len: 3.6, yaw: Math.PI },
    },
    heroClips: { base: 'Swimming_Normal', fast: 'Swimming_Fast' },
    obstacles: [
      { file: 'coral1.glb', anchor: 'floor', tall: true },
      { file: 'coral2.glb', anchor: 'floor', tall: true },
      { file: 'coral3.glb', anchor: 'floor', tall: true },
      { file: 'urchin.glb', anchor: 'floor', low: true },
      { file: 'puffer.glb', anchor: 'free', bob: true },   // pufferfish guard the upper water
      { file: 'puffer.glb', anchor: 'free', bob: true },
      { file: 'octo1.glb', anchor: 'floor', low: true },   // octopuses lurk on the seabed
      { file: 'octo2.glb', anchor: 'floor', low: true },
      { file: 'kelp.glb', anchor: 'floor', tall: true },
    ],
    enemies: [
      { file: 'shark.glb', len: 6.5, yaw: 0, clip: null },
      { file: 'shark2.glb', len: 6.5, yaw: 0, clip: 'Swim' },
      { file: 'angler.glb', len: 4.5, yaw: 0, clip: 'Swimming_Normal' },
      { file: 'octo1.glb', len: 4, yaw: 0, clip: null, bob: true },
      { file: 'octo2.glb', len: 4.5, yaw: 0, clip: null, bob: true },
    ],
    boss: { file: 'whale.glb', len: 30, yaw: 0 },
    decor: ['coral1.glb', 'coral2.glb', 'coral3.glb'],   // coral only on the seabed
    coin: null,   // keeps the gold coin
    wallColor: 0x2fae72,   // kelp-green energy fences
  },
  jungle: {
    base: 'assets/packs/jungle/',
    grounded: true,
    groundY: -6.5,
    env: {
      // pleasant storybook daylight: readable, lush, never blinding
      bg: ['#9fd8f2', '#cfeab8', '#9cd478', '#6fbc60'],
      treeline: true,
      fogColor: 0x9fcc80, fogDensity: 0.0026,
      floor: 'floor.jpg', floorTint: 0xf0ffb8, floorY: -7.2,
      ray: 0xfff6d0, rayOpacity: 0.07, particle: 0xffe9a0, accent: 0x7ddf4a,
      hemi: [0xfff4d0, 0x5a8a3a, 1.4],
      exposure: 1.18,
      decorCount: 30, path: true, danger: 0xff8a3c,
    },
    heroes: {
      hero_bunny: { file: 'hero_bunny.glb', len: 2.6, yaw: Math.PI },
      // the pig has no run cycle — its looping Jump clip reads as a happy bound
      hero_pig: { file: 'hero_pig.glb', len: 2.9, yaw: Math.PI, animSpeed: 2.3, bounce: true,
        clips: { base: 'Jump', fast: 'Jump', jump: 'Jump', land: 'Idle', duck: 'Idle' } },
    },
    heroClips: { base: 'Run', fast: 'Run', jump: 'Jump_Idle', land: 'Jump_Land', duck: 'Duck' },
    obstacles: [
      { file: 'tree1.glb', tall: true }, { file: 'tree2.glb', tall: true },
      { file: 'tree3.glb', tall: true }, { file: 'tree4.glb', tall: true },
      { file: 'log.glb', low: true }, { file: 'stump.glb', low: true },
      { file: 'snake.glb', low: true },
    ],
    enemies: [
      { file: 'wolf.glb', len: 4.5, yaw: 0, clip: 'Gallop', grounded: true },
      { file: 'tiger.glb', len: 5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'jaguar.glb', len: 4.5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'cheetah.glb', len: 4.5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'lion.glb', len: 5, yaw: 0, clip: null, grounded: true, bob: true },
    ],
    boss: { file: 'bear.glb', len: 18, yaw: 0 },
    decor: ['tree1.glb', 'tree2.glb', 'tree3.glb', 'tree4.glb', 'palms.glb'],
    coin: { file: 'carrot.glb', r: 1.6 },
    wallColor: 0x8a5a2a,   // vine-brown fences
  },
};
Object.assign(exports,{WORLD_TEXT,PACKS});});
