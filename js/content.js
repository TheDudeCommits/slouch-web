// SLOUCH — designed content: run boons, daily mutators, missions, lore, ranks.

// ── wormhole boons: pick one of two at each wormhole exit; last for the run ──
export const BOONS = [
  { id: 'overdrive', name: 'OVERDRIVE', desc: 'Hyperdrive burns 40% slower' },
  { id: 'magnetize', name: 'MAGNETIZE', desc: 'Passive stardust pull, all run' },
  { id: 'greed', name: 'GREED', desc: 'Stardust ×2 · rocks drift faster' },
  { id: 'gatecrash', name: 'GATECRASH', desc: 'Stretch gates pay double' },
  { id: 'guardian', name: 'GUARDIAN', desc: '+1 free revive this run' },
  { id: 'flowstate', name: 'FLOWSTATE', desc: 'Flow decays half as fast' },
];

// ── daily mutators, keyed by weekday (0=Sunday) ──
export const MUTATORS = [
  { id: 'slowsunday', name: 'SLOW-MO SUNDAY', desc: 'everything at 80% speed — thread the needle' },
  { id: 'meteor', name: 'METEOR MONDAY', desc: 'the belt runs 25% hotter' },
  { id: 'tuck', name: 'TUCK TUESDAY', desc: 'hyperdrive scores quadruple' },
  { id: 'wall', name: 'WALL WEDNESDAY', desc: 'laser fences everywhere' },
  { id: 'thicket', name: 'THICKET THURSDAY', desc: 'wall gaps are narrower' },
  { id: 'flux', name: 'FLUX FRIDAY', desc: 'controls 40% more sensitive' },
  { id: 'swarm', name: 'SWARM SATURDAY', desc: 'double enemy patrols' },
];

// ── daily missions: 3 rotate per day, 150 stardust each ──
export const MISSION_POOL = [
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
export const LORE = [
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
export const RANKS = [
  'CADET', 'ENSIGN', 'PILOT', 'ACE', 'VETERAN',
  'COMMANDER', 'CAPTAIN', 'WING LEADER', 'ATLAS GUARD', 'LEGEND',
];

export function levelFromXp(xp) {
  let level = 0, need = 150, total = 0;
  while (xp >= total + need && level < 99) {
    total += need;
    level++;
    need = Math.round(150 * Math.pow(level + 1, 1.35));
  }
  return { level, into: xp - total, need, rank: RANKS[Math.min(RANKS.length - 1, Math.floor(level / 5))] };
}
