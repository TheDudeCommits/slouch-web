import { percentile } from './core/movement.ts';
import { weeklyActivity } from './core/history.ts';
import { isNative,shareNativeFile } from './platform/native.js';
// SLOUCH — posture reports: samples head pose during a run, computes range of
// motion / time-in-neutral / stretch score, and renders a shareable card.

import { head } from './head.js';
import { state, dayStamp, GOAL_TARGETS } from './state.js';

let acc = null;

export function beginReport(mode, options = {}) {
  acc = {
    mode, options, samples: [], lastPose:null, lastMotionAt:-1000, lastSample: 0, trackedT: 0, t: 0, neutralT: 0, moveT: 0, hyperT: 0,
    rom: { yawL: 0, yawR: 0, pitchU: 0, pitchD: 0, rollL: 0, rollR: 0, tuck: 0 },
    tucks: 0, gates: 0, slouchT: 0,
  };
}

// call every frame while alive
export function reportTick(dt, hyperActive, slouchActive) {
  if (!acc || head.usingTouch) { if (acc) acc.t += dt; return; }
  acc.t += dt;
  if (!head.hasFace) return;
  acc.trackedT += dt;
  if (head.timestamp !== acc.lastSample) {
    const previous=acc.lastPose;const elapsed=previous?(head.timestamp-previous.timestamp)/1000:0;
    if(elapsed>0&&elapsed<.3){const speed=Math.max(Math.abs(head.rYaw-previous.yaw),Math.abs(head.rPitch-previous.pitch),Math.abs(head.rRoll-previous.roll))/elapsed;if(speed>4)acc.lastMotionAt=head.timestamp;}
    acc.lastPose={yaw:head.rYaw,pitch:head.rPitch,roll:head.rRoll,timestamp:head.timestamp};
    acc.lastSample = head.timestamp;
    acc.samples.push({ yawL: Math.max(0,head.rYaw), yawR: Math.max(0,-head.rYaw), pitchD: Math.max(0,head.rPitch), pitchU: Math.max(0,-head.rPitch), rollR: Math.max(0,head.rRoll), rollL: Math.max(0,-head.rRoll), tuck: Math.max(0,-head.rZ) });
    if (acc.samples.length > 18000) acc.samples.shift();
  }
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
  if (head.timestamp-acc.lastMotionAt<150) acc.moveT += dt;
  if (hyperActive) acc.hyperT += dt;
  if (slouchActive) acc.slouchT += dt;
}

export function noteTuck() { if (acc) acc.tucks++; }
export function noteGate() { if (acc) acc.gates++; }

// Stretch score 0–100: rewards movement coverage in every direction, time
// spent actively moving, tucks and gates; penalizes sustained slouching.
export function buildReport(score, outcome = {}) {
  if (!acc) return null;
  const r = Object.fromEntries(Object.keys(acc.rom).map(k => [k, percentile(acc.samples.map(p => p[k]), 0.95)]));
  const stretchScore = Math.round(100 * acc.moveT / Math.max(1,acc.t)); // Legacy field: activity fraction only.

  const report = {
    version: 2, date: dayStamp(), mode: acc.mode, score, world: acc.options.world, provider: head.usingTouch ? head.source : head.provider, completed: !!outcome.completed,
    trackingPct: head.usingTouch ? 0 : Math.round(acc.trackedT / Math.max(1,acc.t) * 100),
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
  const w = weeklyActivity(state().history, dayStamp());
  return w.recent || w.previous ? w.delta : null;
}

// ── share card: 1080×1350 PNG rendered on a canvas ──
export function drawShareCard(report, opts = {}) {
  const c=document.createElement('canvas');c.width=1080;c.height=1350;const g=c.getContext('2d');
  const palette={ocean:['#143c36','#c8e2d1'],jungle:['#344c2c','#d4deb3'],space:['#444465','#d7d4e7']}[report.world]||['#143c36','#c8e2d1'];
  g.fillStyle='#f7f5ed';g.fillRect(0,0,c.width,c.height);g.fillStyle=palette[1];g.beginPath();g.arc(900,390,340,0,Math.PI*2);g.fill();
  g.fillStyle=palette[0];g.textAlign='left';g.font='500 76px Fraunces,Georgia';g.fillText('slouch.',90,150);
  g.font='500 88px Fraunces,Georgia';g.fillText(opts.duel?'A friendly challenge.':'A moment',90,340);if(!opts.duel)g.fillText('well spent.',90,440);
  g.font='500 30px "DM Sans",sans-serif';g.fillText({ocean:'Open Ocean',jungle:'Jungle Rush',space:'Deep Space'}[report.world]||'Slouch',90,540);
  g.fillStyle=palette[0];g.font='500 170px Fraunces,Georgia';g.fillText(opts.duel?report.score.toLocaleString():`${Math.floor(report.duration/60)}:${String(report.duration%60).padStart(2,'0')}`,90,800);
  g.font='500 26px "DM Sans",sans-serif';g.fillText(opts.duel?'ARCADE POINTS':'TIME FOR YOURSELF',98,860);
  const rows=report.touch?[['Controls','Touch / keys'],['Head movement','Not measured']]:[['Moving time',report.moveSec+' seconds'],['Gentle returns',String(report.tucks)],['Tracking coverage',report.trackingPct+'%']];
  let y=975;for(const [label,value]of rows){g.textAlign='left';g.fillText(label,90,y);g.textAlign='right';g.fillText(value,990,y);y+=58;}
  g.textAlign='left';g.font='400 22px "DM Sans",sans-serif';g.fillText(report.touch?'A little adventure. A change of scene.':'Camera-relative activity estimates, not a medical assessment.',90,1220);
  g.fillText(report.date+'  ·  A little movement. A world away.',90,1270);return c;
}

export async function shareCard(report, opts = {}) {
  const canvas = drawShareCard(report, opts);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if(isNative)return shareNativeFile(blob,'slouch-break.png');
  const file = new File([blob], 'slouch-run.png', { type: 'image/png' });
  const text = opts.duel
    ? `A friendly Slouch challenge: ${report.score.toLocaleString()} points. ${opts.url}`
    : `I took ${report.duration} seconds for a little Slouch adventure. A little movement. A world away.`;
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
