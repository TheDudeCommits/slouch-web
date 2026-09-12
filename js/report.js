// SLOUCH — posture reports: samples head pose during a run, computes range of
// motion / time-in-neutral / stretch score, and renders a shareable card.

import { head } from './head.js';
import { state, dayStamp, GOAL_TARGETS } from './state.js';

let acc = null;

export function beginReport(mode) {
  acc = {
    mode, t: 0, neutralT: 0, moveT: 0, hyperT: 0,
    rom: { yawL: 0, yawR: 0, pitchU: 0, pitchD: 0, rollL: 0, rollR: 0, tuck: 0 },
    tucks: 0, gates: 0, slouchT: 0,
  };
}

// call every frame while alive
export function reportTick(dt, hyperActive, slouchActive) {
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

export function noteTuck() { if (acc) acc.tucks++; }
export function noteGate() { if (acc) acc.gates++; }

// Stretch score 0–100: rewards movement coverage in every direction, time
// spent actively moving, tucks and gates; penalizes sustained slouching.
export function buildReport(score) {
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
export function weeklyTrend() {
  const h = state().history;
  if (h.length < 2) return null;
  const recent = h.slice(0, 7), prior = h.slice(7, 14);
  const avg = arr => arr.reduce((a, r) => a + (r.stretchScore || 0), 0) / Math.max(1, arr.length);
  if (!prior.length) return null;
  return Math.round(avg(recent) - avg(prior));
}

// ── share card: 1080×1350 PNG rendered on a canvas ──
export function drawShareCard(report, opts = {}) {
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

export async function shareCard(report, opts = {}) {
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
