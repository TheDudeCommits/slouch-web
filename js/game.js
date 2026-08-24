// SLOUCH — core game loop: control mapping, sectors, power-ups, boss fights,
// flow/graze trains, slow-mo, boons, mutators, missions, ghost racing.

import { world, updateWorld, render, explodeAt, setShieldVisual, setHyper, armWall, kickCamera, setGateArrow, randomizeBackdrop, POWERUP_TYPES } from './world.js';
import { head, updateHead } from './head.js';
import { state, activeEvent } from './state.js';
import { sfx, setMusicIntensity } from './audio.js';
import { mulberry32 } from './rng.js';
import { BOONS, MUTATORS, LORE } from './content.js';
import { beginReport, reportTick, noteTuck, noteGate, buildReport } from './report.js';
import { beginGhost, ghostTick, ghostPace, endGhost } from './ghost.js';

export const game = {
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

let spawnT = 0, enemyT = 0, crystalT = 0, gateT = 0, biasT = 0, powerT = 0, wallT = 0, sectorT = 0, shardT = 0;
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

export function startGame(mode, hooks, opts = {}) {
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
  sectorT = 26; shardT = 40;
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
    [6, 'CHIN UP / DOWN TO CLIMB AND DIVE'],
    [11, 'GLIDE YOUR CHIN STRAIGHT BACK = HYPERDRIVE'],
    [17, 'SHAVE PAST ROCKS FOR GRAZE COMBOS'],
  ] : [];
  if (game.mutator) hooks.onToast?.(game.mutator.name);
  lastFrame = performance.now();
  cancelAnimationFrame(raf);
  loop(lastFrame);
}

export function stopGame() {
  game.running = false;
  document.body.classList.remove('focus-active');
  setMusicIntensity(0);
  cancelAnimationFrame(raf);
}

export function pauseGame(p) {
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
  const targY = ty * world.bounds.y;
  const rate = Math.min(1, (game.mode === 'casual' ? 11 : 8.5) * dt);
  const nx = clamp(ship.x + (targX - ship.x) * rate, -world.bounds.x, world.bounds.x);
  const ny = clamp(ship.y + (targY - ship.y) * rate, -world.bounds.y, world.bounds.y);
  ship.vx = (nx - ship.x) / Math.max(dt, 1e-4);
  ship.vy = (ny - ship.y) / Math.max(dt, 1e-4);
  ship.x = nx; ship.y = ny;
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
      game.hooks.onToast?.('HYPERDRIVE');
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
  g.position.set(0, 0, world.spawnZ);
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
      game.hooks.onToast?.('GOLD RING — HOLD THE POSE TO OPEN IT');
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
      game.hooks.onToast?.(`STRETCH GATE +${pts}`);
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

export function chooseBoon(index) {
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
    vib([80, 60, 80]);
    game.hooks.onBoss?.('DREADNOUGHT INBOUND');
    world.boss.visible = true;
    world.boss.position.set(0, 2, -190);
    return;
  }
  if (boss.phase === 'warn') {
    boss.wallT -= dt;
    if (boss.wallT <= 0) { boss.phase = 'fight'; boss.wallT = 0.5; }
  }
  if (boss.phase === 'fight') {
    game.hooks.onBoss?.(`DREADNOUGHT · ${boss.wallsLeft}`);
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
      game.hooks.onBoss?.(null);
      game.hooks.onToast?.(`DREADNOUGHT CLEARED +${pts}`);
      world.boss.visible = false;
    }
  }
}

function bossActive() { return boss.phase !== 'idle'; }

// ── laser walls ──
function spawnWall(fromBoss) {
  const w = world.walls.find(o => !o.userData.active);
  if (!w) return;
  const gapAxis = R() < 0.55 ? 'x' : 'y';
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
          sfx.crash();
          game.hooks.onToast?.(`WALL BREACH +${pts}`);
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
        game.hooks.onToast?.(`THREADED +${pts}`);
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
  p.position.set((R() * 2 - 1) * 11, (R() * 2 - 1) * 6, world.spawnZ);
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
  const pool = world.asteroids.filter(o => !o.userData.active &&
    (!smallOnly || o.userData.radius < 2.2));
  const a = pool[Math.floor(R() * pool.length)];
  if (!a) return;
  a.userData.active = true;
  a.visible = true;
  const bx = bias.x * 7, by = bias.y * 4;
  a.position.set(
    clamp(bx + (R() - 0.5) * 30, -17, 17),
    clamp(by + (R() - 0.5) * 17, -9.5, 9.5),
    world.spawnZ - R() * 60);
  let driftMul = game.sector === 'debris' ? 2.2 : 1;
  if (game.boons.greed) driftMul *= 1.15;
  a.userData.vx = (R() - 0.5) * 2.5 * driftMul;
  a.userData.vy = (R() - 0.5) * 1.5 * driftMul;
  a.userData.missed = false;
  a.rotation.set(R() * 3, R() * 3, 0);
}

function spawnEnemy() {
  const e = world.enemies.find(o => !o.userData.active);
  if (!e) return;
  e.userData.active = true;
  e.visible = true;
  const side = R() < 0.5 ? -1 : 1;
  e.position.set(side * 20, (R() - 0.5) * 12, world.spawnZ * 0.7);
  e.userData.vx = -side * (6 + R() * 5);
  e.userData.vy = (R() - 0.5) * 2;
  e.userData.missed = false;
  e.lookAt(e.position.x + e.userData.vx, e.position.y, e.position.z + game.speed);
}

// crystal lines spawn near the obstacle bias — greed lives on the dangerous side
function spawnCrystalLine() {
  const x = clamp(bias.x * 6 + (R() - 0.5) * 14, -10, 10);
  const y = clamp(bias.y * 3 + (R() - 0.5) * 8, -6, 6);
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
    a.rotation.x += a.userData.rx * dt;
    a.rotation.y += a.userData.ry * dt;
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
          game.hooks.onToast?.(`+${pts} STARDUST — buy upgrades in the store`);
        } else {
          game.hooks.onToast?.(`+${pts}`);
        }
      }
    }
    if (c.position.z > world.killZ) { c.userData.active = false; c.visible = false; }
  }
}

function collideCheck(o, sx, sy, shipR) {
  const r = o.userData.radius;
  if (Math.abs(o.position.z) < r + 2) {
    const d = Math.hypot(o.position.x - sx, o.position.y - sy);
    if (d < r + shipR) {
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
        sfx.crash();
        game.hooks.onToast?.(`SMASH +${pts}`);
        return;
      }
      if (invulnT > 0) return;
      die();
      return;
    }
    if (!o.userData.missed && d < r + shipR + 2.2) {
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
        if ((inDebris || game.time > 45) && R() < 0.45) spawnAsteroid(inDebris);
        const base = inDebris ? 0.5 : inLasers ? 1.6 : 1.1;
        spawnT = Math.max(inDebris ? 0.16 : 0.28, base - game.time * 0.004);
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
  S.rotation.z = clamp(-ship.vx * 0.06, -0.7, 0.7);
  S.rotation.x = clamp(-ship.vy * 0.035, -0.45, 0.45);
  S.rotation.y = clamp(-ship.vx * 0.02, -0.3, 0.3);
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
export function startIdle() {
  cancelAnimationFrame(idleRaf);
  world.boss.visible = false;
  let last = performance.now();
  function idle(t) {
    if (game.running) return;
    idleRaf = requestAnimationFrame(idle);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    ship.x = Math.sin(t * 0.0004) * 3;
    ship.y = Math.cos(t * 0.0006) * 1.5;
    world.ship.position.set(ship.x, ship.y, 0);
    world.ship.rotation.z = Math.sin(t * 0.0004 + 1) * 0.15;
    world.ship.visible = true;
    world.shipShield.visible = false;
    updateWorld(dt, 30, { x: 0, y: 0 });
    render();
  }
  idle(last);
}
export function stopIdle() { cancelAnimationFrame(idleRaf); }
