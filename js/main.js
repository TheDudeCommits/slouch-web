import { packStatus, downloadPack, clearDownloads } from './platform/downloads.js';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/fraunces/latin-500.css';
import '@fontsource/fraunces/latin-400-italic.css';
import { nativeLoad, reminder, isNative, shareNativeFile } from './platform/native.js';
import { DEFAULT_COMFORT } from './core/movement.ts';
// SLOUCH — app shell: screens, HUD wiring, store, ranks, missions, codex.

import { initWorld, applyTheme, loadHeroShip, applyWorldPack, applyGraphics, world } from './world.js';
import { initHead, startCamera, cameraRunning, calibrate, drawPreview, enableTouchFallback, head, updateHead, stopCamera, calibrationStable, setInputEnabled, setTrackingPreview, acceptPose } from './head.js';
import { startGame, stopGame, pauseGame, startIdle, stopIdle, game, chooseBoon, endSession, skipGate } from './game.js';
import { initAudio, resumeAudio, applyVolumes, startMusic, stopMusic, sfx, setAmbience, setSfxWorld } from './audio.js';
import { todaySeed, hashSeed, mulberry32 } from './rng.js';
import { shareCard, weeklyTrend } from './report.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { MISSION_POOL, MUTATORS, LORE, levelFromXp } from './content.js';
import { WORLD_TEXT } from './packs.js';
import * as ST from './state.js';

// restyle the whole UI to match the equipped world: colors, font, labels
function applyWorldSkin() {
  const w = ST.currentWorld();
  document.body.classList.toggle('world-space', w === 'space');
  document.body.dataset.world = w;
  const names = { ocean: ['01 / OPEN OCEAN','A change of current.','Sunlit reefs. Small discoveries. Room to drift.','Open Ocean'], jungle: ['02 / JUNGLE RUSH','Take the scenic route.','A leafy trail. A little hop. A lighter day.','Jungle Rush'], space: ['03 / DEEP SPACE','A little breathing room.','Beyond the atmosphere. Back to yourself.','Deep Space'] }[w];
  ['world-index','world-heading','world-subtitle','world-name'].forEach((id,i)=>$(id).textContent=names[i]);
  document.body.classList.toggle('world-ocean', w === 'ocean');
  document.body.classList.toggle('world-jungle', w === 'jungle');
  $('btn-retry').textContent = (WORLD_TEXT[w] || WORLD_TEXT.space).retry;
  setSfxWorld(w);
  setAmbience(w);
}

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];

function show(...ids) {
  for (const s of screens) { const active = ids.includes(s.id); s.classList.toggle('active',active); s.inert = !active; s.setAttribute('aria-hidden',String(!active)); }
  if (world) world.inMenu = ids.includes('screen-menu');
  const target = $(ids[ids.length - 1]); if(target && target.id !== 'hud') { target.tabIndex=-1; target.focus({preventScroll:true}); }
}
function icon(name, cls = 'ic') {
  return `<svg class="${cls}"><use href="#${name}"/></svg>`;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

let pendingMode = 'break';
let resumeAfterCalibration = false, setupOnly = false;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pendingOpts = {};
let calibratedThisSession = false;
let camPreviewRaf = 0;
let duelIncoming = null;

// ── boot ──
async function boot() {
  try {
    const saved = await nativeLoad(); if (saved) ST.restoreNative(saved);
    ST.save(); initWorld();
    $('loader-msg').textContent = 'Finding your little escape';
    await applyWorldPack(p => $('loader-fill').style.width = (15 + p * 80) + '%');
    applyWorldSkin(); applyGraphics(); startIdle(); ST.tickStreak(false); refreshMenu(); parseDuelLink(); registerSW();
    show(duelIncoming ? 'screen-duel' : 'screen-menu');
    if (duelIncoming) showDuelBanner();
  } catch (error) {
    $('load-error-message').textContent = 'Reconnect to download your world, then try again.';
    show('screen-load-error'); console.error(error);
  }
}

// ── daily missions ──
function missionsToday() {
  const s = ST.state();
  const today = ST.dayStamp();
  if (s.missions.day !== today) {
    const rand = mulberry32(todaySeed() ^ 0x9e37);
    const pool = [...MISSION_POOL];
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    s.missions = { day: today, ids, done: {} };
    ST.save();
  }
  return s.missions;
}

function renderMissions(el, runStats = null) {
  const m = missionsToday();
  el.innerHTML = m.ids.map(id => {
    const def = MISSION_POOL.find(x => x.id === id);
    const done = !!m.done[id];
    const cur = runStats ? Math.min(def.target, runStats[def.stat] ?? 0) : null;
    return `<div class="mission ${done ? 'done' : ''}"><span class="dot"></span>
      <span>${def.desc}</span>
      <span class="prog">${done ? '' : cur != null ? `${cur}/${def.target}` : ''}</span></div>`;
  }).join('');
}

// ── menu ──
function refreshMenu() {
  const s = ST.state();
  $('set-motion').checked = s.settings.reducedMotion; $('set-vertical').checked = s.settings.vertical; $('set-turns').checked = s.settings.turns;
  $('set-quality').value = s.settings.quality; $('set-comfort').value = s.settings.comfort.roll < 13 ? 'gentle' : 'standard';
  document.querySelectorAll('[data-duration]').forEach(b=>{const selected=Number(b.dataset.duration)===s.settings.duration;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  $('btn-break').firstChild.textContent = `Take a ${s.settings.duration / 60}-minute break `;
  $('btn-input').firstChild.textContent = s.settings.input === 'camera' ? 'Move with your camera ' : 'Play with touch or keys ';
  $('points-count').textContent = s.points;
  $('streak-count').textContent = s.streak.count;
  const bestAll = Math.max(s.best[ST.scoreScope('techneck')],s.best[ST.scoreScope('casual')]);
  $('menu-best').textContent = bestAll > 0 ? bestAll.toLocaleString() : '';
  $('set-music').value = s.settings.music;
  $('set-sfx').value = s.settings.sfx;
  $('set-sens').value = s.settings.sensitivity;
  $('set-mirror').checked = s.settings.mirror;
  $('set-reminders').checked = s.settings.reminders;

  const lv = levelFromXp(s.xp);
  $('rank-chevrons').innerHTML = '<i></i>'.repeat(Math.min(5, 1 + Math.floor(lv.level / 5)));
  $('rank-name').textContent = `${lv.rank} · LV ${lv.level}`;

  const ev = ST.activeEvent();
  const banner = $('event-banner');
  banner.classList.toggle('hidden', !ev);
  if (ev) banner.textContent = `${ev.name} — ${ev.desc}`;

  const daily = ST.dailyScores();
  const mut = MUTATORS[new Date().getDay()];
  $('daily-label').textContent = mut.name;
  $('daily-status').textContent = daily.best > 0 ? `best ${daily.best.toLocaleString()}` : mut.desc;

  const g = ST.goalsToday(), T = ST.GOAL_TARGETS;
  setRing('ring-move', 17, Math.min(1, g.moveSec / T.moveSec));
  setRing('ring-tuck', 12, Math.min(1, g.tucks / T.tucks));
  setRing('ring-stretch', 7, Math.min(1, g.stretches / T.stretches));

  renderMissions($('menu-missions'));
}

function setRing(id, r, frac) {
  const c = 2 * Math.PI * r;
  const el = $(id);
  el.style.strokeDasharray = c;
  el.style.strokeDashoffset = c * (1 - Math.min(1, frac));
}

// ── duel links ──
function parseDuelLink() {
  const p = new URLSearchParams(location.search);
  if (p.has('duel') && p.get('rules')==='2' && ['ocean','jungle','space'].includes(p.get('world'))) {
    duelIncoming = {
      seed: Number(p.get('duel')) || todaySeed(),
      score: Number(p.get('s')) || 0,
      mutatorId:p.get('mutator'),world:p.get('world'),input:p.get('input')==='manual'?'pointer':'camera',
      tag: (p.get('by') || 'RIVAL').slice(0, 8).toUpperCase(),
    };
    history.replaceState(null, '', location.pathname);
  }
}
function showDuelBanner() {
  $('duel-tag').textContent = duelIncoming.tag;
  $('duel-score').textContent = duelIncoming.score.toLocaleString();
  show('screen-duel');
}

// ── play flow ──
async function requestPlay(mode, opts = {}) {
  pendingMode = mode; pendingOpts = { ...opts, duration: ST.state().settings.duration };
  setupOnly = false; refreshSetup(); show('screen-setup');
}
function refreshSetup() {
  document.querySelectorAll('[data-input]').forEach(b=>{ const selected=ST.state().settings.input===b.dataset.input; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); });
  $('setup-note').textContent = ST.state().settings.input === 'camera'
    ? 'Your camera stays on your device. Move within a comfortable range; skip anything that hurts.'
    : 'Drag to move, or use the arrow keys. Release to return to centre. This mode does not record head movement.';
  $('btn-setup-start').firstChild.textContent = setupOnly ? 'Save controls ' : ST.state().settings.input === 'camera' ? 'Get comfortable ' : 'Start your adventure ';
}
async function startPrepared() {
  if (setupOnly) { refreshMenu(); show('screen-menu'); return; }
  initAudio(); resumeAudio(); applyVolumes();
  if (ST.state().settings.input !== 'camera') { enableTouchFallback(); launch(); return; }
  const b=$('btn-setup-start'); b.disabled=true;
  try {
    await initHead(m=>{$('setup-note').textContent=m;});
    if (!cameraRunning()) await startCamera();
    openCalibration();
  } catch (e) {
    stopCamera(); $('camerr-msg').textContent='The camera is unavailable. Allow camera access to use head controls, or continue with touch and keys.';
    show('screen-camerr');
  } finally { b.disabled=false; }
}

// Hands-free calibration: as soon as a face is stable in frame it captures
// the neutral pose and launches. No button.
let calState = 'idle';
function openCalibration(resume = false) {
  resumeAfterCalibration = resume;
  show('screen-calibrate'); $('cal-count').textContent='';
  setTrackingPreview(true).catch(console.warn); const canvas=$('cal-preview'); cancelAnimationFrame(camPreviewRaf); calState='watching';
  (async function draw() {
    if (calState !== 'watching') return;
    updateHead(); drawPreview(canvas);
    $('cal-msg').textContent=head.hasFace ? 'Settle into a comfortable position' : 'Centre your face · add a little light';
    if (head.provider==='arkit') $('cal-msg').textContent=head.hasFace ? 'Face found · settle into a comfortable position' : 'Look toward your screen';
    if (calibrationStable()) {
      calState='capturing'; const ok=await calibrate();
      if (ok) {
        calState='done'; calibratedThisSession=true; $('cal-count').textContent='Ready'; sfx.gate();
        setTimeout(()=>{
          if(calState!=='done')return;
          if(resumeAfterCalibration) { setTrackingPreview(false).catch(console.warn); show('hud'); game.interrupted=false; pauseGame(false); }
          else launch();
        },700);
        return;
      }
      calState='watching';
    }
    camPreviewRaf=requestAnimationFrame(draw);
  })();
}

function launch() {
  setTrackingPreview(false).catch(console.warn);
  stopIdle();
  document.body.classList.toggle('is-break',pendingMode==='break');
  document.body.classList.toggle('manual-input',head.usingTouch);
  show('hud');
  startMusic('run');
  for (const id of ['hud-slouch', 'hud-gate', 'hud-boss', 'boon-offer', 'hud-pace']) $(id).classList.add('hidden');
  $('hud-powerups').innerHTML = '';
  const duel = pendingMode === 'duel';
  $('hud-duel-target').classList.toggle('hidden', !duel);
  if (duel) $('hud-duel-target').textContent = `BEAT ${pendingOpts.duelTarget.toLocaleString()}`;
  startGame(pendingMode, hooks, pendingOpts);
}

// ── HUD hooks ──
let toastTimer = 0;
const hooks = {
  onPerformancePause() {
    $('pause-title').textContent='A little breathing room.'; $('pause-message').textContent='The device needed a moment. Your session is paused; resume when ready.';
    $('btn-resume').textContent='Resume'; show('hud','screen-pause');
  },
  onTrackingPause() {
    $('pause-title').textContent='Let’s find you again.'; $('pause-message').textContent='Your adventure is safely paused. Re-centre when you’re ready.';
    $('btn-resume').textContent='Re-centre & resume'; show('hud','screen-pause');
  },
  onJourney(route) {
    $('hud-section').textContent=route.title; $('hud-time').textContent=`${Math.floor(route.remaining/60)}:${String(route.remaining%60).padStart(2,'0')}`;
    $('hud-session-fill').style.width=route.progress*100+'%';
    $('movement-cue-text').textContent=head.usingTouch ? (route.phase==='arrive' ? 'Drag gently · release to centre' : route.safe ? 'A moment to enjoy the view' : 'Follow the trail · space to boost') : route.cue;
    $('movement-cue').dataset.phase=route.phase;
  },
  onScore(score, mult) {
    $('hud-score').textContent = score.toLocaleString();
    $('hud-mult').textContent = '×' + mult.toFixed(1).replace(/\.0$/, '');
  },
  onShield(energy, active) {
    $('hud-shield-fill').style.width = (energy * 100) + '%';
    $('hud-shield-fill').style.background = active ? 'var(--ink)' : 'var(--acc)';
  },
  onFlow(flow) { $('hud-flow-fill').style.width = (flow * 100) + '%'; },
  onPace(ghostScore, score) {
    const el = $('hud-pace');
    if (ghostScore == null) { el.classList.add('hidden'); return; }
    const d = score - Math.round(ghostScore);
    el.classList.remove('hidden');
    el.classList.toggle('behind', d < 0);
    el.textContent = (d >= 0 ? '+' : '') + d.toLocaleString() + ' GHOST';
  },
  onPowerups(power) {
    const parts = [];
    if (power.magnet > 0) parts.push(icon('i-magnet', 'ic tiny') + Math.ceil(power.magnet));
    if (power.focus > 0) parts.push(icon('i-clock', 'ic tiny') + Math.ceil(power.focus));
    if (power.doubler > 0) parts.push(icon('i-double', 'ic tiny') + Math.ceil(power.doubler));
    const html = parts.map(p => `<span class="pu">${p}</span>`).join('');
    const el = $('hud-powerups');
    if (el.innerHTML !== html) el.innerHTML = html;
  },
  onBoss(label) {
    const el = $('hud-boss');
    if (label) { el.textContent = label; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  },
  onSlouch(active) { $('hud-slouch').classList.toggle('hidden', !active); },
  onFaceLost(lost) { $('hud-face-lost').classList.toggle('hidden', !lost); },
  onGate(label) {
    $('btn-skip-gate').classList.toggle('hidden',!label);
    const el = $('hud-gate');
    if (label) { el.textContent = label; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  },
  onGateProgress(f) {
    if (f > 0) $('hud-gate').style.opacity = String(0.6 + f * 0.4);
  },
  onBoonOffer(a, b) {
    const el = $('boon-offer');
    if (!a) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    for (const [side, boonDef] of [['boon-left', a], ['boon-right', b]]) {
      const card = $(side);
      card.querySelector('b').textContent = boonDef.name;
      card.querySelector('span').textContent = boonDef.desc;
      card.querySelector('i').style.setProperty('--p', '0');
    }
  },
  onBoonLean(dir, frac) {
    const l = $('boon-left'), r = $('boon-right');
    l.classList.toggle('leaning', dir < 0);
    r.classList.toggle('leaning', dir > 0);
    l.querySelector('i').firstElementChild ?? null;
    l.querySelector('i').style.cssText = dir < 0 ? `background:linear-gradient(90deg,var(--acc) ${frac * 100}%,rgba(92,106,138,.4) 0)` : '';
    r.querySelector('i').style.cssText = dir > 0 ? `background:linear-gradient(90deg,var(--acc) ${frac * 100}%,rgba(92,106,138,.4) 0)` : '';
  },
  onToast(text) {
    const el = $('hud-toast');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1300);
  },
  onGameOver(score, report, extra) {
    startMusic('gameover');
    stopCamera(); calibratedThisSession=false; finishRun(score, report, extra || {});
  },
};

// menu music starts on the first interaction (mobile autoplay rules)
addEventListener('pointerdown', function firstTap() {
  removeEventListener('pointerdown', firstTap);
  initAudio(); resumeAudio(); applyVolumes();
  if (!game.running) startMusic('menu');
  setSfxWorld(ST.currentWorld());
  setAmbience(ST.currentWorld());
}, { once: true });

// touch fallback for boon choice
addEventListener('touchstart', (e) => {
  if (!$('boon-offer').classList.contains('hidden')) {
    chooseBoon(e.touches[0].clientX < innerWidth / 2 ? 0 : 1);
  }
}, { passive: true });

// ── game over ──
let lastRun = { score: 0, mode: 'techneck', submitted: false, report: null };
function finishRun(score, report, extra) {
  const mode = game.mode;
  const s = ST.state();
  s.totals.runs++;

  const ev = ST.activeEvent();
  const evMult = ev?.stardustMult ?? 1;
  let earned = mode === 'break' ? Math.round((report?.duration || 0)/3) + (extra.completed ? 100 : 0) : Math.round(score/10)*evMult;
  if ((report?.duration || 0)>=30) ST.tickStreak(true);
  lastRun = { score, mode, submitted: false, report };

  if (report && !report.touch) {
    ST.addGoalProgress({ moveSec: report.moveSec, tucks: report.tucks, stretches: report.gates });
  }
  if (report) ST.addReport(report);

  // missions
  const m = missionsToday();
  let missionBonus = 0;
  const freshMissions = [];
  for (const id of m.ids) {
    if (m.done[id]) continue;
    const def = MISSION_POOL.find(x => x.id === id);
    if ((extra.runStats?.[def.stat] ?? 0) >= def.target) {
      m.done[id] = true;
      missionBonus += 150;
      freshMissions.push(def);
    }
  }
  earned += missionBonus;
  ST.addPoints(earned);
  $('go-event-bonus').textContent = (evMult > 1 ? `(×${evMult} event)` : '') +
    (missionBonus ? ` +${missionBonus} missions` : '');

  // XP + rank
  const before = levelFromXp(s.xp);
  const xpGain = mode === 'break' ? (extra.completed ? 50 : 10) : Math.round(score / 100) + freshMissions.length * 50;
  ST.addXp(xpGain);
  const after = levelFromXp(s.xp);
  $('go-xp').textContent = '+' + xpGain;
  const ranked = after.level > before.level;
  $('go-rankup').classList.toggle('hidden', !ranked);
  if (ranked) {
    $('go-rankup').textContent = `LEVEL ${after.level} · ${after.rank}`;
    sfx.levelup();
  }

  // boards
  const boardMode = ['casual','techneck'].includes(mode)?ST.scoreScope(mode,report):null;
  let isBest = false;
  if (boardMode) {
    isBest = score > s.best[boardMode];
  } else if (mode === 'daily') {
    const d = ST.dailyScores(report);
    d.runs++;
    isBest = score > d.best;
    if (isBest) d.best = score;
    d.list = d.list || [];
    d.list.push({ tag: s.lastTag, score });
    d.list.sort((a, b) => b.score - a.score);
    d.list = d.list.slice(0, 10);
    ST.save();
  } else if (mode === 'weekly') {
    const w = ST.weeklyScores(report);
    isBest = score > w.best;
    if (isBest) w.best = score;
    w.list.push({ tag: s.lastTag, score });
    w.list.sort((a, b) => b.score - a.score);
    w.list = w.list.slice(0, 10);
    ST.save();
  }

  // "so close" framing
  const best = boardMode ? s.best[boardMode] : mode === 'daily' ? ST.dailyScores(report).best : ST.weeklyScores(report).best;
  const closeEl = $('go-close');
  if (!isBest && best > 0 && score > best * 0.35) {
    closeEl.classList.remove('hidden');
    const pct = Math.min(99, Math.round(score / best * 100));
    $('go-close-text').textContent = `${pct}% OF YOUR BEST`;
    requestAnimationFrame(() => { $('go-close-fill').style.width = pct + '%'; });
  } else closeEl.classList.add('hidden');

  // ghost pace at death
  const paceEl = $('go-pace');
  if (extra.pace != null && !isBest) {
    const d = score - Math.round(extra.pace);
    paceEl.classList.remove('hidden');
    paceEl.style.color = d >= 0 ? 'var(--acc)' : 'var(--mut)';
    paceEl.textContent = d >= 0
      ? `${d.toLocaleString()} AHEAD OF YOUR GHOST AT THE END`
      : `${Math.abs(d).toLocaleString()} BEHIND YOUR GHOST`;
  } else paceEl.classList.add('hidden');

  // duel outcome
  const duelEl = $('go-duel-result');
  duelEl.classList.add('hidden');
  if (mode === 'duel') {
    const won = score > (game.duelTarget || 0);
    if (won) { s.totals.duelsWon++; ST.save(); }
    duelEl.textContent = won ? 'DUEL WON' : 'DUEL LOST — REMATCH?';
    duelEl.className = won ? 'win' : 'lose';
    duelEl.classList.remove('hidden');
  }

  const fresh = checkAchievements({ score, stretchScore: report?.stretchScore ?? 0 });
  $('go-unlocks').innerHTML = fresh.map(a =>
    `<div class="unlock">${icon('i-trophy', 'ic tiny')}${a.name}</div>`).join('');
  if (fresh.length) sfx.levelup();

  renderMissions($('go-missions'), extra.runStats);

  $('go-score').textContent = score.toLocaleString();
  $('go-points').textContent = earned;
  $('go-best').classList.toggle('hidden', !isBest);
  $('go-title').textContent = { daily: 'DAILY RUN COMPLETE', duel: 'DUEL OVER', weekly: 'WEEKLY RUN LOGGED' }[mode]
    || (WORLD_TEXT[ST.currentWorld()] || WORLD_TEXT.space).death;

  $('go-summary').textContent = mode==='break' ? (extra.completed ? 'A little less screen. A little more you.' : 'Every little break counts. Come back whenever you like.') : 'Good exploring. Your next adventure is waiting.';
  $('break-stats').innerHTML = report ? `<div><b>${Math.floor(report.duration/60)}:${String(report.duration%60).padStart(2,'0')}</b><span>time away</span></div><div><b>${report.touch ? '—' : report.moveSec+'s'}</b><span>${report.touch ? 'touch / keys' : 'moving'}</span></div><div><b>${earned}</b><span>stardust earned</span></div>` : '';
  if(mode==='break') $('go-title').textContent=extra.completed ? 'Break complete.' : 'A moment well spent.';
  $('btn-retry').textContent=mode==='break' ? 'Another little escape' : 'Play again';
  const qualifies = boardMode && ST.qualifiesForBoard(boardMode, score);
  $('go-name-entry').classList.toggle('hidden', !qualifies);
  if (qualifies) $('go-name').value = s.lastTag;
  $('btn-duel-send').classList.toggle('hidden',game.seed==null||mode==='break');
  show('screen-gameover');
}

function submitPendingScore() {
  if (lastRun.submitted) return;
  lastRun.submitted = true;
  const boardMode=['casual','techneck'].includes(lastRun.mode)?ST.scoreScope(lastRun.mode,lastRun.report):null;
  if (!boardMode) return;
  if (ST.qualifiesForBoard(boardMode, lastRun.score)) {
    const tag = ($('go-name').value.trim().toUpperCase() || 'ACE').slice(0, 8);
    ST.submitScore(boardMode, tag, lastRun.score);
  } else if (lastRun.score > ST.state().best[boardMode]) {
    ST.state().best[boardMode] = lastRun.score;
    ST.save();
  }
}

// ── posture report ──
function renderReport() {
  const r = lastRun.report;
  if (!r) return;
  setRing('report-ring',52,r.touch?0:r.moveSec/Math.max(1,r.duration));
  $('report-stretch').textContent=r.touch?'—':r.moveSec+'s';
  const trend = weeklyTrend();
  $('report-trend').textContent = trend == null ? 'Your activity will appear here as you play'
    : trend >= 0 ? `+${trend}s moving over the previous 7 days` : `${trend}s moving over the previous 7 days`;

  const rows = r.touch ? [['Touch / keys · no head movement measured', '', 0]] : [
    ['ROTATION L', `${r.rom.yawL}°`, r.rom.yawL / 40],
    ['ROTATION R', `${r.rom.yawR}°`, r.rom.yawR / 40],
    ['CHIN UP', `${r.rom.pitchU}°`, r.rom.pitchU / 30],
    ['CHIN DOWN', `${r.rom.pitchD}°`, r.rom.pitchD / 30],
    ['SIDE BEND L', `${r.rom.rollL}°`, r.rom.rollL / 30],
    ['SIDE BEND R', `${r.rom.rollR}°`, r.rom.rollR / 30],
    ['IN NEUTRAL', `${r.neutralPct}%`, r.neutralPct / 100],
    ['MOVING', `${r.moveSec}s`, Math.min(1, r.moveSec / 120)],
    ['VALID TRACKING', `${r.trackingPct}%`, r.trackingPct/100],
  ];
  $('report-rows').innerHTML = rows.map(([k, v, f]) => `
    <div class="report-row"><span class="k">${k}</span>
    <span class="bar"><i style="width:${Math.round(Math.min(1, f) * 100)}%"></i></span>
    <span class="v">${v}</span></div>`).join('');

  const g = ST.goalsToday(), T = ST.GOAL_TARGETS;
  const goal = (label, val, target) => `
    <div class="g ${val >= target ? 'done' : ''}"><b>${Math.min(Math.round(val), target)}/${target}</b>${label}</div>`;
  $('report-goals').innerHTML =
    goal('MOVE', g.moveSec, T.moveSec) + goal('RETURNS', g.tucks, T.tucks) + goal('GATES', g.stretches, T.stretches);
}

// ── flight log + ROM progress ──
function renderHistory() {
  const h = ST.state().history;
  const romEl = $('rom-progress');
  const trend=weeklyTrend();
  romEl.innerHTML=`<div class="rom-line"><span class="mut">Moving time · last 7 days</span><span>${trend==null ? 'Start a camera break to begin' : (trend>=0?'+':'')+trend+'s vs previous 7 days'}</span></div><p class="privacy-note">Only valid camera sessions from this version are compared. Your earlier sessions are preserved below.</p>`;
  $('history-list').innerHTML = h.length === 0
    ? '<p class="mut small center">Your next little break starts your story</p>'
    : h.map(r => `<div class="hist-row">
        <span class="h-date">${escapeText(r.date)}</span>
        <span class="h-mode">${{ break:'BREAK', techneck: 'ARCADE', casual: 'CASUAL', daily: 'DAILY', duel: 'DUEL', weekly: 'WEEK' }[r.mode] || ''}</span>
        <span class="h-score">${r.score.toLocaleString()}</span>
        <span class="h-stretch">${r.touch ? 'touch / keys' : (r.moveSec||0)+'s moving'}</span>
      </div>`).join('');
}

// ── store ──
let storeCat = 'themes';
function renderStore() {
  $('store-points').textContent = ST.state().points;
  const wrap = $('store-items');
  wrap.innerHTML = '';
  const s = ST.state();

  const addRow = (art, name, desc, btn, soon = false) => {
    const div = document.createElement('div');
    div.className = 'row' + (soon ? ' soon' : '');
    div.innerHTML = `<div class="art">${art}</div>
      <div class="info"><div class="name">${name}</div><div class="desc">${desc}</div></div>`;
    div.appendChild(btn);
    wrap.appendChild(div);
  };
  const mkBtn = (label, cls, onclick, disabled = false) => {
    const b = document.createElement('button');
    b.className = 'act' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    b.disabled = disabled;
    if (onclick) b.onclick = onclick;
    return b;
  };
  const price = (p) => `${icon('i-star', 'ic tiny')} ${p}`;

  const cosmeticRow = (slot, id, item, art) => {
    const owned = s.owned.includes(id);
    const equipped = s.equipped[slot] === id;
    const equipIt = () => {
      ST.equipCosmetic(slot, id); applyTheme();
      if (slot === 'skin') loadHeroShip();
    };
    let btn;
    if (equipped) btn = mkBtn('ON', 'equipped');
    else if (owned) btn = mkBtn('EQUIP', 'owned', () => { equipIt(); sfx.buy(); renderStore(); });
    else btn = mkBtn(price(item.price), '', () => {
      if (ST.buy(id, item.price)) { equipIt(); sfx.buy(); } else sfx.denied();
      renderStore(); refreshMenu();
    }, s.points < item.price);
    addRow(art, item.name, item.desc, btn);
  };

  if (storeCat === 'themes') {
    // expansion worlds first: full visual swaps, downloaded on purchase
    const equipWorldNow = async (worldId) => {
      ST.equipWorld(worldId);
      sfx.buy();
      renderStore();
      hooks.onToast?.('Finding your world…');
      await applyWorldPack();
      applyWorldSkin();
      renderStore();
    };
    const spaceOn = ST.currentWorld() === 'space';
    addRow(icon('i-ship'), 'Deep Space', 'The original belt. Base game.',
      spaceOn ? mkBtn('ON', 'equipped') : mkBtn('EQUIP', 'owned', () => equipWorldNow('space')));
    for (const [id, wp] of Object.entries(ST.WORLD_PACKS)) {
      const owned = s.owned.includes(id);
      const on = ST.currentWorld() === wp.world;
      let btn;
      if (on) btn = mkBtn('ON', 'equipped');
      else if (owned) btn = mkBtn('EQUIP', 'owned', () => equipWorldNow(wp.world));
      else btn = mkBtn(price(wp.price), '', () => {
        if (ST.buy(id, wp.price)) equipWorldNow(wp.world);
        else { sfx.denied(); renderStore(); }
        refreshMenu();
      }, s.points < wp.price);
      addRow(icon('i-star'), `${wp.name} · ${wp.size}`, wp.desc, btn);
    }
    // world hero variants once their pack is owned
    const heroSection = (packId, heroes, key, worldId) => {
      if (!s.owned.includes(packId)) return;
      for (const [id, h] of Object.entries(heroes)) {
        const owned = s.owned.includes(id);
        const on = s[key] === id;
        const equipHero = () => {
          s[key] = id; ST.save(); sfx.buy();
          if (ST.currentWorld() === worldId) loadHeroShip();
          renderStore();
        };
        let btn;
        if (on) btn = mkBtn('ON', 'equipped');
        else if (owned) btn = mkBtn('EQUIP', 'owned', equipHero);
        else btn = mkBtn(price(h.price), '', () => {
          if (ST.buy(id, h.price)) equipHero(); else sfx.denied();
          renderStore(); refreshMenu();
        }, s.points < h.price);
        addRow(icon('i-ship'), h.name, h.desc, btn);
      }
    };
    heroSection('world_ocean', ST.OCEAN_HEROES, 'oceanHero', 'ocean');
    heroSection('world_jungle', ST.JUNGLE_HEROES, 'jungleHero', 'jungle');
    // space palettes (style the space world only)
    for (const [id, t] of Object.entries(ST.THEMES)) {
      const art = `<span class="swatch duo" style="--c1:${hex(t.colors.accent)};--c2:${hex(t.colors.fog)}"></span>`;
      const owned = s.owned.includes(id);
      const equipped = s.equippedTheme === id;
      let btn;
      if (equipped) btn = mkBtn('ON', 'equipped');
      else if (owned) btn = mkBtn('EQUIP', 'owned', () => {
        ST.equipTheme(id); applyTheme(); sfx.buy(); renderStore();
      });
      else btn = mkBtn(price(t.price), '', () => {
        if (ST.buy(id, t.price)) { ST.equipTheme(id); applyTheme(); sfx.buy(); } else sfx.denied();
        renderStore(); refreshMenu();
      }, s.points < t.price);
      addRow(art, t.name + ' · palette', t.desc, btn);
    }
  } else if (storeCat === 'ship') {
    for (const [id, item] of Object.entries(ST.SKINS)) {
      cosmeticRow('skin', id, item, icon('i-ship'));
    }
    for (const [id, item] of Object.entries(ST.TRAILS)) {
      const col = item.color === 'rainbow'
        ? 'linear-gradient(90deg,#f55,#fd5,#5f8,#5df,#a5f)'
        : item.color ? hex(item.color) : 'var(--acc)';
      cosmeticRow('trail', id, item, `<span class="trailline" style="background:${col}"></span>`);
    }
    for (const [id, item] of Object.entries(ST.BOOMS)) {
      cosmeticRow('boom', id, item, icon('i-boom'));
    }
  } else if (storeCat === 'upgrades') {
    const ICONS = { hyperdur: 'i-ship', hyperregen: 'i-clock', magnet: 'i-magnet' };
    for (const [id, u] of Object.entries(ST.UPGRADES)) {
      const lvl = s.upgrades[id];
      const maxed = lvl >= u.prices.length;
      // visual-first: the pip bar IS the upgrade state
      const pips = `<span class="pips xl">${u.prices.map((_, i) =>
        `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      const btn = maxed ? mkBtn('MAX', 'owned', null, true)
        : mkBtn(price(u.prices[lvl]), '', () => {
          if (ST.buyUpgrade(id)) sfx.buy(); else sfx.denied();
          renderStore(); refreshMenu();
        }, s.points < u.prices[lvl]);
      addRow(icon(ICONS[id], 'ic xl'), u.name, `${u.desc}<br>${pips}`, btn);
      wrap.lastChild.classList.add('big');
    }
  } else {
    const ICONS = { freeze: 'i-freeze', revive: 'i-revive' };
    for (const item of ST.STORE_EXTRAS) {
      const count = item.id === 'freeze' ? s.streak.freezes : s.revives;
      const capped = item.id === 'revive' && s.revives >= (item.max ?? 99);
      const btn = mkBtn(capped ? 'FULL' : price(item.price), '', () => {
        if (ST.buy(item.id, item.price)) sfx.buy(); else sfx.denied();
        renderStore(); refreshMenu();
      }, capped || s.points < item.price);
      addRow(icon(ICONS[item.id]), `${item.name} · ${count}`, item.desc, btn);
    }
  }
}

// ── leaderboard ──
let boardMode = 'techneck';
function renderBoard() {
  const list = $('board-list');
  const rows = boardMode === 'daily' ? (ST.dailyScores().list || [])
    : boardMode === 'weekly' ? ST.weeklyScores().list
    : ST.state().boards[ST.scoreScope(boardMode)];
  $('btn-play-weekly').classList.toggle('hidden', boardMode !== 'weekly');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<li class="empty">${{
      daily: 'same belt for every pilot · resets at midnight',
      weekly: 'one fixed belt all week · leave your mark',
    }[boardMode] || 'Your next little break starts your story'}</li>`;
    return;
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="tag">${escapeText(r.tag)}</span>
      <span class="val">${r.score.toLocaleString()}</span>`;
    list.appendChild(li);
  });
}

// ── trophies ──
function renderTrophies() {
  const un = ST.state().achievements;
  $('trophy-count').textContent = `${Object.keys(un).length} OF ${ACHIEVEMENTS.length}`;
  $('trophy-list').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="trophy ${un[a.id] ? 'unlocked' : ''}">
      ${icon('i-trophy')}
      <div><div class="t-name">${a.name}</div><div class="t-desc">${a.desc}</div></div>
    </div>`).join('');
}

// ── codex ──
function renderLore() {
  const n = ST.state().lore;
  $('lore-count').textContent = `${n} OF ${LORE.length} SIGNALS RECOVERED`;
  $('lore-list').innerHTML = LORE.map((e, i) => i < n
    ? `<div class="entry"><b>${e.t}</b><p>${e.p}</p></div>`
    : `<div class="entry locked"><b>SIGNAL ${String(i + 1).padStart(3, '0')} — NOT YET RECOVERED</b></div>`
  ).join('');
}

// ── duels (outgoing) ──
async function sendDuel() {
  sfx.ui();
  const tag = ST.state().lastTag || 'ACE';
  const seed = game.seed; if(seed==null){hooks.onToast?.('Play a daily challenge to share its matching route.');return;}
  const url = `${location.origin}${location.pathname}?duel=${seed}&s=${lastRun.score}&by=${encodeURIComponent(tag)}&rules=2&world=${lastRun.report?.world||ST.currentWorld()}&input=${lastRun.report?.touch?'manual':'camera'}&mutator=${game.mutator?.id||''}`;
  if (lastRun.report) {
    await shareCard({ ...lastRun.report, score: lastRun.score }, { duel: true, url, tag });
  } else if (navigator.share) {
    try { await navigator.share({ text: `Beat my ${lastRun.score} in SLOUCH: ${url}` }); } catch { }
  } else {
    await navigator.clipboard?.writeText(url).catch(() => { });
    hooks.onToast?.('duel link copied');
  }
}

// ── reminders ──
let reminderTimer = 0;
async function toggleReminders(on) {
  ST.state().settings.reminders = on;
  ST.save();
  if (isNative) { const r=await reminder(on); $('settings-status').textContent=r.granted ? 'A gentle reminder is set for four hours from now.' : 'Reminders are off. You can allow them in iOS Settings.'; return; }
  if (!on) { clearTimeout(reminderTimer); return; }
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  scheduleReminder();
}
function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (!ST.state().settings.reminders || globalThis.Notification?.permission !== 'granted') return;
  reminderTimer = setTimeout(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: 'Neck check. Fly a run?', icon: 'icons/icon-180.png' };
      if (reg?.showNotification) reg.showNotification('SLOUCH', opts);
      else new Notification('SLOUCH', opts);
    } catch { }
  }, 4 * 3600 * 1000);
}

function registerSW() {
  if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}

// ── wiring ──
$('btn-play-techneck').onclick = () => requestPlay('techneck');
$('btn-play-casual').onclick = () => requestPlay('casual');
$('btn-daily').onclick = () => requestPlay('daily', { seed: todaySeed() });
$('btn-play-weekly').onclick = () => requestPlay('weekly', { seed: hashSeed(ST.isoWeek()) });
$('btn-duel-accept').onclick = async () => {
  const d = duelIncoming;
  duelIncoming = null;
  ST.state().settings.input=d.input;ST.equipWorld(d.world);await applyWorldPack();applyWorldSkin();
  requestPlay('duel',{seed:d.seed,duelTarget:d.score,mutatorId:d.mutatorId});
};
$('btn-duel-decline').onclick = () => { duelIncoming = null; sfx.ui(); show('screen-menu'); };

$('btn-cal-back').onclick = () => {
  calState = 'cancelled'; cancelAnimationFrame(camPreviewRaf); setTrackingPreview(false).catch(console.warn);
  if(resumeAfterCalibration) show('hud','screen-pause'); else { stopCamera(); sfx.ui(); show('screen-menu'); }
};

$('btn-pause').onclick = () => {
  pauseGame(true); sfx.ui(); $('pause-title').textContent='The world can wait.';
  $('pause-message').textContent='Resume whenever you’re comfortable.'; $('btn-resume').textContent='Resume'; show('hud','screen-pause');
};
$('btn-resume').onclick = async () => { resumeAudio();startMusic('run');sfx.ui(); if(!head.usingTouch) { try { await initHead(); if(!cameraRunning())await startCamera(); openCalibration(true); } catch { show('screen-camerr'); } } else { show('hud'); pauseGame(false); } };
$('btn-recal-pause').onclick = () => $('btn-resume').onclick();
$('btn-quit').onclick = () => {
  if(game.mode==='break') endSession(); else { stopGame(); stopCamera(); refreshMenu(); show('screen-menu'); startIdle(); }
};
$('btn-retry').onclick = () => { submitPendingScore(); sfx.ui(); requestPlay(lastRun.mode,{seed:game.seed??undefined,mutatorId:game.mutator?.id,duelTarget:game.duelTarget}); };
$('btn-go-menu').onclick = () => {
  submitPendingScore(); sfx.ui();
  refreshMenu(); show('screen-menu'); startIdle();
};
$('btn-report').onclick = () => { sfx.ui(); renderReport(); show('screen-report'); };
$('btn-report-back').onclick = () => { sfx.ui(); show('screen-gameover'); };
$('btn-report-share').onclick = async () => {
  sfx.ui();
  if (lastRun.report) await shareCard({ ...lastRun.report, score: lastRun.score });
};
$('btn-share').onclick = async () => {
  sfx.ui();
  if (lastRun.report) await shareCard({ ...lastRun.report, score: lastRun.score });
};
$('btn-duel-send').onclick = sendDuel;

$('btn-store').onclick = () => { sfx.ui(); renderStore(); show('screen-store'); };
$('btn-store-back').onclick = () => { sfx.ui(); refreshMenu(); show('screen-menu'); };
document.querySelectorAll('#store-tabs .tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('#store-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    storeCat = tab.dataset.cat;
    sfx.ui(); renderStore();
  };
});

$('btn-leaderboard').onclick = () => { sfx.ui(); renderBoard(); show('screen-leaderboard'); };
$('btn-board-back').onclick = () => { sfx.ui(); show('screen-menu'); };
document.querySelectorAll('#screen-leaderboard .tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('#screen-leaderboard .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    boardMode = tab.dataset.board;
    sfx.ui(); renderBoard();
  };
});

$('btn-trophies').onclick = () => { sfx.ui(); renderTrophies(); show('screen-trophies'); };
$('btn-trophies-back').onclick = () => { sfx.ui(); show('screen-menu'); };

$('btn-settings').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-settings-back').onclick = () => { sfx.ui(); refreshMenu(); show('screen-menu'); };
$('btn-history').onclick = () => { sfx.ui(); renderHistory(); show('screen-history'); };
$('btn-history-back').onclick = () => { sfx.ui(); show('screen-menu'); };
$('btn-lore').onclick = () => { sfx.ui(); renderLore(); show('screen-lore'); };
$('btn-lore-back').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-recalibrate').onclick = async () => {
  sfx.ui();
  if (head.usingTouch) return;
  try { await initHead(); if (!cameraRunning()) await startCamera(); pendingMode='break'; openCalibration(); }
  catch { show('screen-camerr'); }
};
$('btn-reset').onclick = () => {
  if (confirm('Wipe all scores, streaks, purchases and settings?')) {
    ST.resetAll(); location.reload();
  }
};

for (const [id, key] of [['set-music', 'music'], ['set-sfx', 'sfx'], ['set-sens', 'sensitivity']]) {
  $(id).oninput = () => {
    ST.state().settings[key] = Number($(id).value);
    ST.save(); applyVolumes();
  };
}
$('set-mirror').onchange = () => { ST.state().settings.mirror = $('set-mirror').checked; ST.save(); };
$('set-reminders').onchange = () => toggleReminders($('set-reminders').checked);

$('btn-cam-retry').onclick = async()=>{if(game.running){try{await initHead();await startCamera();openCalibration(true);}catch{$('camerr-msg').textContent='Camera access is still unavailable.';}}else await startPrepared();};
$('btn-cam-touch').onclick = () => { sfx.ui(); enableTouchFallback(); if(game.running) { show('hud'); document.body.classList.add('manual-input'); pauseGame(false); } else launch(); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    scheduleReminder();stopMusic();
    if (game.running && !game.paused) {
      pauseGame(true);
      $('pause-title').textContent='Welcome back.'; $('pause-message').textContent='Your adventure waited for you.'; show('hud', 'screen-pause');
    }
    if(!head.usingTouch) stopCamera();
  }
});

boot();

$('btn-break').onclick=()=>requestPlay('break');
$('btn-input').onclick=()=>{ setupOnly=true; refreshSetup(); show('screen-setup'); };
$('btn-setup-start').onclick=startPrepared;
$('btn-setup-back').onclick=()=>{ refreshMenu(); show('screen-menu'); };
$('btn-load-retry').onclick=()=>location.reload();
$('btn-worlds').onclick=()=>{show('screen-worlds');refreshDownloads();};
$('btn-worlds-back').onclick=()=>show('screen-menu');
$('btn-arcade').onclick=()=>show('screen-arcade');
$('btn-arcade-back').onclick=()=>show('screen-menu');
$('btn-home-history').onclick=()=>{renderHistory();show('screen-history');};
$('btn-manual-boost').onclick=()=>{if(game.running&&!game.paused)head.manualBoost=true;};
for(const b of document.querySelectorAll('[data-duration]')) b.onclick=()=>{ ST.state().settings.duration=Number(b.dataset.duration); ST.save(); refreshMenu(); };
for(const b of document.querySelectorAll('[data-input]')) b.onclick=()=>{ ST.state().settings.input=b.dataset.input; ST.save(); refreshSetup(); };
for(const b of document.querySelectorAll('button[data-world]')) b.onclick=async()=>{
  const previous=ST.currentWorld(); document.querySelectorAll('button[data-world]').forEach(b=>b.disabled=true); stopIdle();
  try { ST.equipWorld(b.dataset.world); await applyWorldPack(p=>$('world-load-status').textContent=`Preparing your world · ${Math.round(p*100)}%`); applyWorldSkin(); refreshMenu(); startIdle(); show('screen-menu'); }
  catch(e) { ST.equipWorld(previous); try{await applyWorldPack();applyWorldSkin();startIdle();}catch{} $('world-load-status').textContent='That download was interrupted. Reconnect and try again.'; }
  finally { document.querySelectorAll('button[data-world]').forEach(b=>b.disabled=false); }
};
for(const [id,key] of [['set-motion','reducedMotion'],['set-vertical','vertical'],['set-turns','turns']]) $(id).onchange=()=>{ ST.state().settings[key]=$(id).checked; ST.save(); applyGraphics(); };
$('set-quality').onchange=()=>{ST.state().settings.quality=$('set-quality').value;ST.save();applyGraphics();};
$('set-comfort').onchange=()=>{ ST.state().settings.comfort=$('set-comfort').value==='gentle'?{roll:9,pitch:8,yaw:12,tuck:1.8}:{...DEFAULT_COMFORT};ST.save(); };
$('btn-export').onclick=async()=>{if(isNative){await shareNativeFile(new Blob([ST.exportSave()],{type:'application/json'}),'slouch-progress.json');return;}const a=document.createElement('a');const url=URL.createObjectURL(new Blob([ST.exportSave()],{type:'application/json'}));a.href=url;a.download='slouch-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('save-import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{ST.importSave(await file.text());location.reload();}catch(e){$('settings-status').textContent=e.message;}};
addEventListener('slouch-storage-error',()=>{$('settings-status').textContent='Storage is full. Export your progress before clearing space.';});
addEventListener('keydown',e=>{if(e.key==='Escape'&&game.running&&!game.paused)$('btn-pause').click();});

async function refreshDownloads(){
  for(const id of ['ocean','jungle','space','camera']){
    const b=document.querySelector(`[data-download="${id}"]`);if(!b)continue;
    try{const s=await packStatus(id);const name={ocean:'Ocean',jungle:'Jungle',space:'Space',camera:'Camera'}[id];b.textContent=`${name} · `+(s.ready?(isNative?'Included':'Ready offline'):`Keep offline · ${(s.bytes/1048576).toFixed(1)} MB`);b.disabled=s.ready;}
    catch{b.textContent='Download unavailable';}
  }
}
for(const b of document.querySelectorAll('[data-download]'))b.onclick=async()=>{
  b.disabled=true;
  try{await downloadPack(b.dataset.download,p=>b.textContent=`Downloading · ${Math.round(p*100)}%`);await refreshDownloads();}
  catch(e){b.disabled=false;b.textContent='Retry download';$('world-load-status').textContent=e.message;}
};

$('btn-skip-gate').onclick=skipGate;

$('btn-clear-downloads').onclick=async()=>{if(isNative){$('settings-status').textContent='Worlds are included with this iOS build.';return;}await clearDownloads();$('settings-status').textContent='Downloads removed. Your progress is still saved.';};

if(import.meta.env.DEV)window.__slouch={game,world,head,acceptPose,state:ST.state,pauseGame,skipGate,enableTouchFallback,stopGame,startIdle,stopIdle,applyWorldPack,equipWorld:ST.equipWorld};
