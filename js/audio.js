// SLOUCH — audio: real synthwave soundtrack (see assets/ATTRIBUTION.txt),
// streamed lazily per track through a flow-driven low-pass filter, plus
// procedurally synthesized arcade SFX.

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
}

export function applyVolumes() {
  if (!ctx) return;
  const s = state().settings;
  musicGain.gain.value = (s.music / 100) * 0.5;
  sfxGain.gain.value = (s.sfx / 100) * 0.9;
}

export function resumeAudio() { if (ctx?.state === 'suspended') ctx.resume(); }

function note(freq, t, dur, type, gain, dest, glideTo) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

// ── SFX ──
function now() { return ctx?.currentTime ?? 0; }

export const sfx = {
  ui() { if (!ctx) return; note(660, now(), 0.08, 'square', 0.12, sfxGain, 880); },
  buy() { if (!ctx) return; note(523, now(), 0.1, 'square', 0.15, sfxGain);
    note(784, now() + 0.09, 0.14, 'square', 0.15, sfxGain); },
  denied() { if (!ctx) return; note(180, now(), 0.18, 'square', 0.15, sfxGain, 120); },
  // graze/pickup ladder: each consecutive step climbs a pentatonic scale
  nearMiss(step = 0) {
    if (!ctx) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const semi = scale[Math.min(scale.length - 1, step)];
    const f = 880 * Math.pow(2, semi / 12);
    note(f, now(), 0.1, 'sine', 0.2, sfxGain, f * 1.5);
  },
  gate() { if (!ctx) return; [523, 659, 784, 1047].forEach((f, i) =>
    note(f, now() + i * 0.07, 0.16, 'triangle', 0.2, sfxGain)); },
  shieldUp() { if (!ctx) return; note(300, now(), 0.3, 'sawtooth', 0.14, sfxGain, 900); },
  shieldDown() { if (!ctx) return; note(900, now(), 0.25, 'sawtooth', 0.12, sfxGain, 300); },
  warn() { if (!ctx) return; note(220, now(), 0.12, 'square', 0.14, sfxGain);
    note(220, now() + 0.16, 0.12, 'square', 0.14, sfxGain); },
  powerup() { if (!ctx) return; [440, 660, 880, 1320].forEach((f, i) =>
    note(f, now() + i * 0.05, 0.12, 'sine', 0.18, sfxGain)); },
  bossWarn() { if (!ctx) return; [0, 0.3, 0.6].forEach(o => {
    note(160, now() + o, 0.22, 'sawtooth', 0.2, sfxGain);
    note(164, now() + o, 0.22, 'sawtooth', 0.2, sfxGain); }); },
  bossDown() { if (!ctx) return; [392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
    note(f, now() + i * 0.09, 0.22, 'triangle', 0.2, sfxGain)); },
  laser() { if (!ctx) return; note(2200, now(), 0.18, 'sawtooth', 0.08, sfxGain, 300); },
  revive() { if (!ctx) return; [220, 330, 440, 660, 880].forEach((f, i) =>
    note(f, now() + i * 0.06, 0.3, 'triangle', 0.16, sfxGain)); },
  levelup() { if (!ctx) return; [523, 784].forEach((f, i) =>
    note(f, now() + i * 0.08, 0.2, 'square', 0.12, sfxGain)); },
  crash() {
    if (!ctx) return;
    // filtered noise burst
    const dur = 0.7;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 1.6;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, now());
    f.frequency.exponentialRampToValueAtTime(120, now() + dur);
    const g = ctx.createGain();
    g.gain.value = 0.8;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
    note(80, now(), 0.6, 'sine', 0.6, sfxGain, 30);
  },
};
