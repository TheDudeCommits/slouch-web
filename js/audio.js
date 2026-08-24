// SLOUCH — audio: real synthwave soundtrack streamed through a flow-driven
// low-pass filter, plus sampled 8-bit / interface SFX (see assets/ATTRIBUTION.txt).

import { state } from './state.js';

let ctx = null;
let musicGain, sfxGain, master, musicFilter;
let intensity = 0; // 0..1, driven by the in-game flow meter

// ── track pools ──
const POOLS = {
  menu: ['eighties', 'spaceranger', 'chillwave'],
  run: ['retrowave', 'synthwave', 'retro80s', 'neondrive', 'arcadenights', 'midnight'],
  calm: ['calmambient', 'chillwave', 'spaceranger'],
  loops: ['loop1', 'loop2', 'loop3', 'loop4', 'loop5'],   // wormhole + boss
};
const tracks = {};        // name -> {el, gain}
let current = null;       // active {name, t}
let stashed = null;       // run track paused during a temp (boss/wormhole) layer
let lastPick = {};        // pool -> last track name (avoid repeats)

function getTrack(name) {
  if (tracks[name]) return tracks[name];
  const el = new Audio(`assets/music/${name}.m4a`);
  el.loop = true;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.style.display = 'none';
  document.body.appendChild(el);
  const src = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain);
  gain.connect(musicFilter);
  tracks[name] = { el, gain };
  return tracks[name];
}

function fadeTo(track, v, dur = 0.8) {
  track.gain.gain.cancelScheduledValues(ctx.currentTime);
  track.gain.gain.setValueAtTime(track.gain.gain.value, ctx.currentTime);
  track.gain.gain.linearRampToValueAtTime(v, ctx.currentTime + dur);
}

function pickFrom(pool) {
  const list = POOLS[pool].filter(n => n !== lastPick[pool]);
  const name = list[Math.floor(Math.random() * list.length)] ?? POOLS[pool][0];
  lastPick[pool] = name;
  return name;
}

function playTrack(name, fade = 0.9) {
  if (!ctx) return;
  if (current?.name === name) return;
  if (current) {
    const old = tracks[current.name];
    fadeTo(old, 0, fade);
    setTimeout(() => { if (current?.name !== old._n) old.el.pause(); }, fade * 1000 + 100);
  }
  const t = getTrack(name);
  t._n = name;
  t.el.play().catch(() => { /* needs a user gesture; retried on next action */ });
  fadeTo(t, 1, fade);
  current = { name };
}

// kind: 'menu' | 'run' | 'gameover'; opts.theme biases ocean runs to calm tracks
export function startMusic(kind = 'run', opts = {}) {
  if (!ctx) return;
  stashed = null;
  if (kind === 'menu' || kind === 'gameover') {
    playTrack(pickFrom('menu'), 1.2);
  } else {
    const calm = opts.theme === 'theme_ocean' && Math.random() < 0.65;
    playTrack(pickFrom(calm ? 'calm' : 'run'));
  }
}

export function stopMusic() {
  if (!ctx || !current) return;
  fadeTo(tracks[current.name], 0, 0.7);
  const c = current;
  setTimeout(() => tracks[c.name]?.el.pause(), 900);
  current = null;
  stashed = null;
}

// temp layers: boss & wormhole swap in a retro loop, then restore the run track
export function musicEvent(ev) {
  if (!ctx) return;
  if (ev === 'boss' || ev === 'wormhole') {
    if (!stashed && current) stashed = current.name;
    playTrack(pickFrom('loops'), 0.6);
  } else if (ev === 'restore' && stashed) {
    playTrack(stashed, 0.9);
    stashed = null;
  }
}

export function setMusicIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
  if (musicFilter) {
    // low flow = muffled dream; high flow = full spectrum
    const f = 900 + Math.pow(intensity, 1.4) * 15000;
    musicFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.25);
  }
}

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  sfxGain = ctx.createGain();
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 16000;
  musicFilter.connect(musicGain);
  musicGain.connect(master);
  sfxGain.connect(master);
  applyVolumes();
  loadSfx();
}

export function applyVolumes() {
  if (!ctx) return;
  const s = state().settings;
  musicGain.gain.value = (s.music / 100) * 0.5;
  sfxGain.gain.value = (s.sfx / 100) * 0.9;
}

export function resumeAudio() { if (ctx?.state === 'suspended') ctx.resume(); }

// ── SFX: sampled sounds — Juhani Junkala's 8-bit collection (CC0) for game
// moments, Kenney Interface Sounds (CC0) for UI. Loaded once, ~180KB total.
const SFX_FILES = ['ui', 'buy', 'denied', 'near', 'gate', 'shieldup', 'shielddown',
  'warn', 'crash', 'smash', 'powerup', 'bosswarn', 'bossdown', 'laser', 'revive', 'levelup'];
const sfxBufs = {};

async function loadSfx() {
  await Promise.all(SFX_FILES.map(async (name) => {
    try {
      const res = await fetch(`assets/sfx/${name}.m4a`);
      sfxBufs[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { /* sound stays silent if it fails to load */ }
  }));
}

function play(name, { rate = 1, gain = 1 } = {}) {
  const buf = sfxBufs[name];
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(sfxGain);
  src.start();
}

export const sfx = {
  ui() { play('ui', { gain: 0.7 }); },
  buy() { play('buy', { gain: 0.8 }); },
  denied() { play('denied', { gain: 0.7 }); },
  // graze/pickup ladder: the same coin blip climbing a pentatonic scale
  nearMiss(step = 0) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const semi = scale[Math.min(scale.length - 1, step)];
    play('near', { rate: Math.pow(2, semi / 12), gain: 0.65 });
  },
  gate() { play('gate', { gain: 0.85 }); },
  shieldUp() { play('shieldup', { gain: 0.8 }); },
  shieldDown() { play('shielddown', { gain: 0.6 }); },
  warn() { play('warn', { gain: 0.7 }); },
  crash() { play('crash', { gain: 0.9 }); },
  smash() { play('smash', { rate: 0.9 + Math.random() * 0.25, gain: 0.75 }); },
  powerup() { play('powerup', { gain: 0.8 }); },
  bossWarn() { play('bosswarn', { rate: 0.85, gain: 0.85 }); },
  bossDown() { play('bossdown', { gain: 0.9 }); },
  laser() { play('laser', { gain: 0.55 }); },
  revive() { play('revive', { gain: 0.9 }); },
  levelup() { play('levelup', { gain: 0.85 }); },
};
