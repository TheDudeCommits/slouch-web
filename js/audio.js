// SLOUCH — procedural WebAudio: an ambient synthwave loop plus arcade SFX.
// Zero audio assets; everything is synthesized, so it loads instantly offline.

import { state } from './state.js';

let ctx = null;
let musicGain, sfxGain, master;
let musicTimer = null;
let step = 0;
let intensity = 0; // 0..1, driven by the in-game flow meter

export function setMusicIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  sfxGain = ctx.createGain();
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

// ── music: minor-key arp over a slow pad, 112 BPM 16th-note scheduler ──
const ROOTS = [110, 110, 87.31, 130.81];          // A, A, F, C
const ARP = [0, 3, 7, 10, 12, 10, 7, 3];          // minor 7 shape (semitones)
const BAR = 8;                                     // arp steps per chord

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

function scheduleMusicStep(t) {
  const chord = Math.floor(step / BAR) % ROOTS.length;
  const root = ROOTS[chord];
  const semi = ARP[step % ARP.length];
  const freq = root * 2 * Math.pow(2, semi / 12);
  note(freq, t, 0.22, 'sawtooth', 0.16, musicGain);
  if (step % BAR === 0) {                                    // pad swell on chord change
    note(root, t, 2.2, 'triangle', 0.22, musicGain);
    note(root * Math.pow(2, 7 / 12), t, 2.2, 'triangle', 0.13, musicGain);
  }
  if (step % 4 === 0) {                                      // soft kick
    note(120, t, 0.16, 'sine', 0.5, musicGain, 40);
  }
  // flow layers: hats come in at medium intensity, octave arp + extra kicks at high
  if (intensity > 0.35 && step % 2 === 1) {
    hat(t, 0.05 + intensity * 0.06);
  }
  if (intensity > 0.7) {
    note(freq * 2, t + 0.02, 0.14, 'square', 0.06, musicGain);
    if (step % 4 === 2) note(120, t, 0.12, 'sine', 0.3, musicGain, 45);
  }
  step++;
}

function hat(t, gain) {
  const dur = 0.05;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(musicGain);
  src.start(t);
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  step = 0;
  let nextT = ctx.currentTime + 0.1;
  const interval = 60 / 112 / 4; // 16ths at 112bpm
  musicTimer = setInterval(() => {
    while (nextT < ctx.currentTime + 0.25) {
      scheduleMusicStep(nextT);
      nextT += interval;
    }
  }, 90);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

// ── SFX ──
function now() { return ctx?.currentTime ?? 0; }

export const sfx = {
  ui() { if (!ctx) return; note(660, now(), 0.08, 'square', 0.12, sfxGain, 880); },
  buy() { if (!ctx) return; note(523, now(), 0.1, 'square', 0.15, sfxGain);
    note(784, now() + 0.09, 0.14, 'square', 0.15, sfxGain); },
  denied() { if (!ctx) return; note(180, now(), 0.18, 'square', 0.15, sfxGain, 120); },
  nearMiss() { if (!ctx) return; note(1200, now(), 0.1, 'sine', 0.2, sfxGain, 1800); },
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
