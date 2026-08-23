// SLOUCH — core game loop: control mapping (Casual / Tech Neck), spawning,
// collisions, scoring, tuck shield, slouch watchdog and stretch gates.

import { world, updateWorld, render, explodeAt, setShieldVisual, setHyper } from './world.js';
import { head, updateHead } from './head.js';
import { state } from './state.js';
import { sfx } from './audio.js';

export const game = {
  running: false, paused: false, over: false,
  mode: 'techneck',
  score: 0, mult: 1, dist: 0, time: 0,
  speed: 60,
  hooks: {},
};

const ship = { x: 0, y: 0, vx: 0, vy: 0 };

// tuck shield
const shield = { active: false, energy: 1, cooldown: 0 };
// slouch watchdog
const slouch = { t: 0, active: false };
// stretch gate state
const gate = { obj: null, pose: null, dwell: 0, announced: false };

let spawnT = 0, enemyT = 0, crystalT = 0, gateT = 0, biasT = 0;
let bias = { x: 0, y: 0 };
let lastFrame = 0;
let deathT = -1;
let raf = 0;

export function startGame(mode, hooks) {
  game.mode = mode;
  game.hooks = hooks;
  game.running = true; game.paused = false; game.over = false;
  game.score = 0; game.mult = 1; game.dist = 0; game.time = 0; game.speed = 60;
  ship.x = 0; ship.y = 0; ship.vx = 0; ship.vy = 0;
  shield.active = false; shield.energy = 1; shield.cooldown = 0;
  slouch.t = 0; slouch.active = false;
  gate.obj = null; gate.pose = null; gate.dwell = 0;
  spawnT = 0.5; enemyT = 20; crystalT = 4; gateT = 12; biasT = 0;
  deathT = -1;
  for (const pool of [world.asteroids, world.enemies, world.gates, world.crystals]) {
    for (const o of pool) { o.userData.active = false; o.visible = false; }
  }
  world.ship.visible = true;
  lastFrame = performance.now();
  cancelAnimationFrame(raf);
  loop(lastFrame);
}

export function stopGame() {
  game.running = false;
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
  if (!head.hasFace) { damp(dt); return; }

  const s = state().settings;
  const sens = s.sensitivity / 100;
  const mir = s.mirror ? 1 : -1;
  let tx = 0, ty = 0;

  // Sign convention (verified on device): rYaw>0 = head turned LEFT,
  // rPitch>0 = head DOWN, rRoll>0 = head tilted RIGHT. Ship mirrors the
  // player: head right → ship right, head down → ship down.
  if (game.mode === 'casual') {
    // ship follows the head: small yaw/pitch movements, narrow deadzone
    tx = clampMap(-head.rYaw * mir, 1.2, 13 / sens);
    ty = clampMap(-head.rPitch, 1.2, 11 / sens);
  } else {
    // tech neck: lateral tilt steers (ear→shoulder), extension/flexion climbs.
    // Wide deadzones make you commit to a real stretch, not a twitch.
    tx = clampMap(head.rRoll * mir, 4.5, 20 / sens);
    ty = clampMap(-head.rPitch, 4, 16 / sens);
  }

  const targX = tx * world.bounds.x;
  const targY = ty * world.bounds.y;
  // exponential approach: fluid, fast, and cannot overshoot or oscillate
  const rate = Math.min(1, (game.mode === 'casual' ? 11 : 8.5) * dt);
  const nx = clamp(ship.x + (targX - ship.x) * rate, -world.bounds.x, world.bounds.x);
  const ny = clamp(ship.y + (targY - ship.y) * rate, -world.bounds.y, world.bounds.y);
  ship.vx = (nx - ship.x) / Math.max(dt, 1e-4);
  ship.vy = (ny - ship.y) / Math.max(dt, 1e-4);
  ship.x = nx; ship.y = ny;
}

function damp(dt) {
  ship.vx *= Math.pow(0.01, dt);
  ship.vy *= Math.pow(0.01, dt);
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
// map |v| in [dead, full] → 0..1 with sign
function clampMap(v, dead, full) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (full - dead));
}

// ── HYPERDRIVE: hold a chin tuck (head glides straight BACK, chin level) to
// surge forward — big speed boost, 2× scoring, and you smash through rocks.
// Available in both modes; it's the game's signature move.
function updateHyper(dt) {
  const zBack = -head.rZ;
  const tucking = zBack > 2.8 && Math.abs(head.rPitch) < 14;
  if (tucking && shield.cooldown <= 0 && shield.energy > 0.05) {
    if (!shield.active) { shield.active = true; sfx.shieldUp(); game.hooks.onToast?.('⚡ HYPERDRIVE ⚡'); }
    shield.energy = Math.max(0, shield.energy - dt / 4.5);
    if (shield.energy <= 0.01) { shield.active = false; shield.cooldown = 4; sfx.shieldDown(); }
  } else if (shield.active) {
    shield.active = false;
    shield.cooldown = 1.5;
    sfx.shieldDown();
  } else {
    shield.cooldown = Math.max(0, shield.cooldown - dt);
    if (shield.cooldown <= 0) shield.energy = Math.min(1, shield.energy + dt / 6);
  }
  game.hooks.onShield?.(shield.energy, shield.active);
}

// ── slouch watchdog (Tech Neck mode): head creeping FORWARD of neutral ──
function updateSlouch(dt) {
  const slouching = head.rZ > 4.2;
  slouch.t = slouching ? slouch.t + dt : Math.max(0, slouch.t - dt * 2);
  const wasActive = slouch.active;
  slouch.active = slouch.t > 2.5;
  if (slouch.active && !wasActive) sfx.warn();
  if (slouch.active) game.mult = Math.max(1, game.mult - dt * 1.5);
  game.hooks.onSlouch?.(slouch.active);
}

// ── stretch gates ──
// rYaw>0 = head turned LEFT, rPitch>0 = head DOWN (see readControls)
const GATE_POSES = [
  { id: 'left', label: 'LOOK LEFT ⟲ & HOLD', test: () => head.rYaw > 20 },
  { id: 'right', label: 'LOOK RIGHT ⟳ & HOLD', test: () => head.rYaw < -20 },
  { id: 'up', label: 'CHIN UP ↑ & HOLD', test: () => head.rPitch < -16 },
];

function spawnGate() {
  const g = world.gates.find(o => !o.userData.active);
  if (!g) return;
  const pose = GATE_POSES[Math.floor(Math.random() * GATE_POSES.length)];
  g.userData.active = true;
  g.userData.passed = false;
  g.userData.pose = pose;
  g.position.set(0, 0, world.spawnZ);
  g.visible = true;
  gate.obj = g; gate.pose = pose; gate.dwell = 0; gate.announced = false;
}

function updateGate(dt) {
  const g = gate.obj;
  if (!g || !g.userData.active) return;
  g.position.z += game.speed * dt;
  g.rotation.z += dt * 0.4;
  if (g.position.z > -260 && !gate.announced) {
    gate.announced = true;
    game.hooks.onGate?.(gate.pose.label);
  }
  if (gate.announced && !g.userData.passed) {
    if (gate.pose.test()) gate.dwell += dt;
    game.hooks.onGateProgress?.(Math.min(1, gate.dwell / 1.2));
  }
  if (g.position.z > 0 && !g.userData.passed) {
    g.userData.passed = true;
    game.hooks.onGate?.(null);
    if (gate.dwell >= 1.2) {
      const pts = Math.round(500 * game.mult);
      game.score += pts;
      game.mult = Math.min(6, game.mult + 0.5);
      sfx.gate();
      game.hooks.onToast?.(`STRETCH GATE +${pts}`);
    } else {
      game.hooks.onToast?.('gate missed…');
    }
  }
  if (g.position.z > world.killZ) { g.userData.active = false; g.visible = false; gate.obj = null; }
}

// ── spawning ──
function spawnAsteroid() {
  const a = world.asteroids.find(o => !o.userData.active);
  if (!a) return;
  a.userData.active = true;
  a.visible = true;
  const bx = bias.x * 7, by = bias.y * 4;
  a.position.set(
    clamp(bx + (Math.random() - 0.5) * 30, -17, 17),
    clamp(by + (Math.random() - 0.5) * 17, -9.5, 9.5),
    world.spawnZ - Math.random() * 60);
  a.userData.vx = (Math.random() - 0.5) * 2.5;
  a.userData.vy = (Math.random() - 0.5) * 1.5;
  a.userData.missed = false;
  a.rotation.set(Math.random() * 3, Math.random() * 3, 0);
}

function spawnEnemy() {
  const e = world.enemies.find(o => !o.userData.active);
  if (!e) return;
  e.userData.active = true;
  e.visible = true;
  const side = Math.random() < 0.5 ? -1 : 1;
  e.position.set(side * 20, (Math.random() - 0.5) * 12, world.spawnZ * 0.7);
  e.userData.vx = -side * (6 + Math.random() * 5);
  e.userData.vy = (Math.random() - 0.5) * 2;
  e.userData.missed = false;
  e.lookAt(e.position.x + e.userData.vx, e.position.y, e.position.z + game.speed);
}

function spawnCrystalLine() {
  const x = (Math.random() - 0.5) * 20;
  const y = (Math.random() - 0.5) * 11;
  let placed = 0;
  for (const c of world.crystals) {
    if (c.userData.active || placed >= 5) continue;
    c.userData.active = true;
    c.visible = true;
    c.position.set(x, y, world.spawnZ - placed * 9);
    placed++;
  }
}

// ── collisions & motion of obstacles ──
function updateObstacles(dt) {
  const sx = ship.x, sy = ship.y;
  const shipR = 1.1;

  for (const a of world.asteroids) {
    if (!a.userData.active) continue;
    a.position.z += game.speed * dt;
    a.position.x += a.userData.vx * dt;
    a.position.y += a.userData.vy * dt;
    a.rotation.x += a.userData.rx * dt;
    a.rotation.y += a.userData.ry * dt;
    collideCheck(a, sx, sy, shipR, dt);
  }
  for (const e of world.enemies) {
    if (!e.userData.active) continue;
    e.position.z += game.speed * dt * 1.25;
    e.position.x += e.userData.vx * dt;
    e.position.y += e.userData.vy * dt;
    collideCheck(e, sx, sy, shipR, dt);
  }
  for (const c of world.crystals) {
    if (!c.userData.active) continue;
    c.position.z += game.speed * dt;
    c.rotation.y += c.userData.spin * dt;
    c.rotation.x += c.userData.spin * 0.6 * dt;
    if (Math.abs(c.position.z) < 2.5) {
      const d = Math.hypot(c.position.x - sx, c.position.y - sy);
      if (d < c.userData.radius + shipR + 0.6) {
        c.userData.active = false; c.visible = false;
        const pts = Math.round(50 * game.mult);
        game.score += pts;
        game.mult = Math.min(6, game.mult + 0.1);
        sfx.nearMiss();
        game.hooks.onToast?.(`✦ +${pts}`);
      }
    }
    if (c.position.z > world.killZ) { c.userData.active = false; c.visible = false; }
  }
}

function collideCheck(o, sx, sy, shipR, dt) {
  const r = o.userData.radius;
  if (Math.abs(o.position.z) < r + 2) {
    const d = Math.hypot(o.position.x - sx, o.position.y - sy);
    if (d < r + shipR) {
      if (shield.active) {
        explodeAt(o.position);
        o.userData.active = false; o.visible = false;
        const pts = Math.round(100 * game.mult);
        game.score += pts;
        sfx.crash();
        game.hooks.onToast?.(`HYPER SMASH +${pts}`);
        return;
      }
      die();
      return;
    }
    // near miss
    if (!o.userData.missed && d < r + shipR + 2.2) {
      o.userData.missed = true;
      const pts = Math.round(25 * game.mult);
      game.score += pts;
      game.mult = Math.min(6, game.mult + 0.15);
      sfx.nearMiss();
    }
  }
  if (o.position.z > world.killZ) { o.userData.active = false; o.visible = false; }
}

function die() {
  if (game.over) return;
  game.over = true;
  deathT = 0;
  explodeAt(world.ship.position);
  world.ship.visible = false;
  world.shipShield.visible = false;
  sfx.crash();
  if (navigator.vibrate) navigator.vibrate(120);
}

// ── main loop ──
function loop(t) {
  if (!game.running) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (game.paused) return;

  game.time += dt;

  if (!game.over) {
    // difficulty ramp: 60 → 150 over ~3.5 min
    game.speed = 60 + Math.min(90, game.time * 0.45);
    readControls(dt);
    updateHyper(dt);
    if (game.mode === 'techneck') updateSlouch(dt);
    if (shield.active) game.speed *= 1.75; // HYPERDRIVE
    setHyper(shield.active);

    // distance score (doubled while in hyperdrive)
    game.dist += game.speed * dt;
    game.score += game.speed * dt * 0.18 * game.mult * (shield.active ? 2 : 1);
    game.hooks.onScore?.(Math.floor(game.score), game.mult);

    // spawn cadence
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnAsteroid();
      if (game.time > 45 && Math.random() < 0.4) spawnAsteroid();
      spawnT = Math.max(0.28, 1.1 - game.time * 0.004);
    }
    enemyT -= dt;
    if (enemyT <= 0 && game.time > 20) { spawnEnemy(); enemyT = 7 + Math.random() * 6; }
    crystalT -= dt;
    if (crystalT <= 0) { spawnCrystalLine(); crystalT = 6 + Math.random() * 5; }

    if (game.mode === 'techneck') {
      gateT -= dt;
      if (gateT <= 0 && !gate.obj) { spawnGate(); gateT = 16 + Math.random() * 8; }
      // corridor bias: drift obstacle clusters so you must hold a side (hold the stretch)
      biasT -= dt;
      if (biasT <= 0) {
        bias.x = [-1, 0, 1][Math.floor(Math.random() * 3)];
        bias.y = [-0.5, 0, 0.7][Math.floor(Math.random() * 3)];
        biasT = 14;
      }
    }
    updateGate(dt);
  } else {
    deathT += dt;
    setHyper(false);
    game.speed = Math.max(10, game.speed - dt * 60);
    if (deathT > 1.4) {
      stopGame();
      game.hooks.onGameOver?.(Math.floor(game.score));
      return;
    }
  }

  updateObstacles(dt);

  // ship transform + banking
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

// idle menu background: slow drift, no obstacles
let idleRaf = 0;
export function startIdle() {
  cancelAnimationFrame(idleRaf);
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
