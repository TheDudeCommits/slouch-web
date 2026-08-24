// SLOUCH — app shell: screens, HUD wiring, store, ranks, missions, codex.

import { initWorld, applyTheme, loadHeroShip, applyWorldPack } from './world.js';
import { initHead, startCamera, cameraRunning, calibrate, drawPreview, enableTouchFallback, head, updateHead } from './head.js';
import { startGame, stopGame, pauseGame, startIdle, stopIdle, game, chooseBoon } from './game.js';
import { initAudio, resumeAudio, applyVolumes, startMusic, stopMusic, sfx } from './audio.js';
import { todaySeed, hashSeed, mulberry32 } from './rng.js';
import { shareCard, weeklyTrend } from './report.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { MISSION_POOL, MUTATORS, LORE, levelFromXp } from './content.js';
import { WORLD_TEXT } from './packs.js';
import * as ST from './state.js';

// restyle the whole UI to match the equipped world: colors, font, labels
function applyWorldSkin() {
  const w = ST.currentWorld();
  document.body.classList.toggle('world-ocean', w === 'ocean');
  document.body.classList.toggle('world-jungle', w === 'jungle');
  $('btn-retry').textContent = (WORLD_TEXT[w] || WORLD_TEXT.space).retry;
}

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];

function show(...ids) {
  for (const s of screens) s.classList.toggle('active', ids.includes(s.id));
}
function icon(name, cls = 'ic') {
  return `<svg class="${cls}"><use href="#${name}"/></svg>`;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

let pendingMode = 'techneck';
let pendingOpts = {};
let calibratedThisSession = false;
let camPreviewRaf = 0;
let duelIncoming = null;

// ── boot ──
async function boot() {
  initWorld();
  if (ST.currentWorld() !== 'space') applyWorldPack();
  applyWorldSkin();
  startIdle();
  ST.tickStreak(false);
  refreshMenu();
  parseDuelLink();
  registerSW();

  const fill = $('loader-fill'), msg = $('loader-msg');
  fill.style.width = '30%';
  msg.textContent = 'warming up engines';
  try {
    await initHead((m) => { msg.textContent = m; fill.style.width = '65%'; });
    fill.style.width = '100%';
  } catch (e) {
    console.error(e);
    msg.textContent = 'face tracking unavailable — touch mode on';
    enableTouchFallback();
  }
  setTimeout(() => {
    if (duelIncoming) showDuelBanner();
    else show('screen-menu');
  }, 400);
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
  $('points-count').textContent = s.points;
  $('streak-count').textContent = s.streak.count;
  const bestAll = Math.max(s.best.techneck, s.best.casual);
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

  const daily = ST.dailyToday();
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
  if (p.has('duel')) {
    duelIncoming = {
      seed: Number(p.get('duel')) || todaySeed(),
      score: Number(p.get('s')) || 0,
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
  pendingMode = mode;
  pendingOpts = opts;
  initAudio(); resumeAudio(); applyVolumes();
  sfx.ui();
  if (head.usingTouch) { launch(); return; }
  if (!cameraRunning()) {
    try { await startCamera(); }
    catch (e) {
      $('camerr-msg').textContent = e.name === 'NotAllowedError'
        ? 'Camera denied. Enable in Settings › Safari › Camera — or fly with touch. Nothing is ever uploaded.'
        : 'Camera unavailable on this device. You can still fly with touch.';
      show('screen-camerr');
      return;
    }
  }
  if (!head.ready) { enableTouchFallback(); launch(); return; }
  if (calibratedThisSession) launch();
  else openCalibration();
}

// Hands-free calibration: as soon as a face is stable in frame it captures
// the neutral pose and launches. No button.
let calState = 'idle';
function openCalibration() {
  show('screen-calibrate');
  $('cal-count').textContent = '';
  $('cal-msg').textContent = 'get your face in the frame';
  const canvas = $('cal-preview');
  cancelAnimationFrame(camPreviewRaf);
  calState = 'watching';
  let stable = 0;
  let last = performance.now();
  (async function draw() {
    if (calState === 'done') return;
    camPreviewRaf = requestAnimationFrame(draw);
    drawPreview(canvas);
    updateHead();
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (calState !== 'watching') return;
    if (head.hasFace) {
      stable += dt;
      $('cal-msg').textContent = 'sit tall · hold still';
      $('cal-count').textContent = '·'.repeat(1 + Math.min(2, Math.floor(stable * 4)));
      if (stable >= 0.7) {
        calState = 'capturing';
        const ok = await calibrate(1100);
        if (ok) {
          calState = 'done';
          calibratedThisSession = true;
          $('cal-count').textContent = '✓';
          sfx.gate();
          setTimeout(() => { cancelAnimationFrame(camPreviewRaf); launch(); }, 350);
        } else {
          calState = 'watching';
          stable = 0;
          $('cal-msg').textContent = 'lost you — center yourself, add light';
        }
      }
    } else {
      stable = 0;
      $('cal-count').textContent = '';
      $('cal-msg').textContent = 'get your face in the frame';
    }
  })();
}

function launch() {
  stopIdle();
  show('hud');
  startMusic('run', { theme: ST.state().equippedTheme });
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
    finishRun(score, report, extra || {});
  },
};

// menu music starts on the first interaction (mobile autoplay rules)
addEventListener('pointerdown', function firstTap() {
  removeEventListener('pointerdown', firstTap);
  initAudio(); resumeAudio(); applyVolumes();
  if (!game.running) startMusic('menu');
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
  let earned = Math.round(score / 10) * evMult;
  ST.tickStreak(true);
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
  const xpGain = Math.round(score / 100) + freshMissions.length * 50;
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
  const boardMode = mode === 'casual' ? 'casual' : mode === 'techneck' ? 'techneck' : null;
  let isBest = false;
  if (boardMode) {
    isBest = score > s.best[boardMode];
  } else if (mode === 'daily') {
    const d = ST.dailyToday();
    d.runs++;
    isBest = score > d.best;
    if (isBest) d.best = score;
    d.list = d.list || [];
    d.list.push({ tag: s.lastTag, score });
    d.list.sort((a, b) => b.score - a.score);
    d.list = d.list.slice(0, 10);
    ST.save();
  } else if (mode === 'weekly') {
    const w = ST.weeklyNow();
    isBest = score > w.best;
    if (isBest) w.best = score;
    w.list.push({ tag: s.lastTag, score });
    w.list.sort((a, b) => b.score - a.score);
    w.list = w.list.slice(0, 10);
    ST.save();
  }

  // "so close" framing
  const best = boardMode ? s.best[boardMode] : mode === 'daily' ? ST.dailyToday().best : ST.weeklyNow().best;
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

  const qualifies = boardMode && ST.qualifiesForBoard(boardMode, score);
  $('go-name-entry').classList.toggle('hidden', !qualifies);
  if (qualifies) $('go-name').value = s.lastTag;
  show('screen-gameover');
}

function submitPendingScore() {
  if (lastRun.submitted) return;
  lastRun.submitted = true;
  const boardMode = lastRun.mode === 'casual' ? 'casual'
    : lastRun.mode === 'techneck' ? 'techneck' : null;
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
  setRing('report-ring', 52, (r.stretchScore || 0) / 100);
  $('report-stretch').textContent = r.stretchScore ?? 0;
  const trend = weeklyTrend();
  $('report-trend').textContent = trend == null ? 'fly more runs to unlock weekly trends'
    : trend >= 0 ? `+${trend} VS LAST WEEK` : `${trend} VS LAST WEEK`;

  const rows = r.touch ? [['touch mode — no posture data', '', 0]] : [
    ['ROTATION L', `${r.rom.yawL}°`, r.rom.yawL / 40],
    ['ROTATION R', `${r.rom.yawR}°`, r.rom.yawR / 40],
    ['CHIN UP', `${r.rom.pitchU}°`, r.rom.pitchU / 30],
    ['CHIN DOWN', `${r.rom.pitchD}°`, r.rom.pitchD / 30],
    ['SIDE BEND L', `${r.rom.rollL}°`, r.rom.rollL / 30],
    ['SIDE BEND R', `${r.rom.rollR}°`, r.rom.rollR / 30],
    ['IN NEUTRAL', `${r.neutralPct}%`, r.neutralPct / 100],
    ['MOVING', `${r.moveSec}s`, Math.min(1, r.moveSec / 120)],
    ['HYPERDRIVE', `${r.hyperSec}s`, Math.min(1, r.hyperSec / 60)],
  ];
  $('report-rows').innerHTML = rows.map(([k, v, f]) => `
    <div class="report-row"><span class="k">${k}</span>
    <span class="bar"><i style="width:${Math.round(Math.min(1, f) * 100)}%"></i></span>
    <span class="v">${v}</span></div>`).join('');

  const g = ST.goalsToday(), T = ST.GOAL_TARGETS;
  const goal = (label, val, target) => `
    <div class="g ${val >= target ? 'done' : ''}"><b>${Math.min(Math.round(val), target)}/${target}</b>${label}</div>`;
  $('report-goals').innerHTML =
    goal('MOVE', g.moveSec, T.moveSec) + goal('TUCKS', g.tucks, T.tucks) + goal('STRETCH', g.stretches, T.stretches);
}

// ── flight log + ROM progress ──
function renderHistory() {
  const h = ST.state().history;
  // range-of-motion progress: newest 5 runs vs oldest 5 on record
  const romEl = $('rom-progress');
  const camRuns = h.filter(r => !r.touch);
  if (camRuns.length >= 6) {
    const newest = camRuns.slice(0, 5), oldest = camRuns.slice(-5);
    const avg = (arr, k) => arr.reduce((a, r) => a + r.rom[k], 0) / arr.length;
    const lines = [
      ['ROTATION', ['yawL', 'yawR']], ['EXTENSION', ['pitchU']], ['SIDE BEND', ['rollL', 'rollR']],
    ].map(([label, keys]) => {
      const d = keys.reduce((a, k) => a + (avg(newest, k) - avg(oldest, k)), 0) / keys.length;
      const cls = d >= 0 ? '' : 'down';
      return `<div class="rom-line"><span class="mut">${label}</span>
        <span class="delta ${cls}">${d >= 0 ? '+' : ''}${d.toFixed(1)}° since your first flights</span></div>`;
    }).join('');
    romEl.innerHTML = lines;
  } else {
    romEl.innerHTML = '<div class="rom-line"><span class="mut">RANGE-OF-MOTION TREND</span><span class="mut">needs 6+ camera runs</span></div>';
  }

  $('history-list').innerHTML = h.length === 0
    ? '<p class="mut small center">no flights logged</p>'
    : h.map(r => `<div class="hist-row">
        <span class="h-date">${r.date}</span>
        <span class="h-mode">${{ techneck: 'NECK', casual: 'CASUAL', daily: 'DAILY', duel: 'DUEL', weekly: 'WEEK' }[r.mode] || ''}</span>
        <span class="h-score">${r.score.toLocaleString()}</span>
        <span class="h-stretch">${r.touch ? '—' : r.stretchScore}</span>
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
      hooks.onToast?.('loading world…');
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
    // hero fish variants once the ocean is owned
    if (s.owned.includes('world_ocean')) {
      for (const [id, h] of Object.entries(ST.OCEAN_HEROES)) {
        const owned = s.owned.includes(id);
        const on = s.oceanHero === id;
        let btn;
        if (on) btn = mkBtn('ON', 'equipped');
        else if (owned) btn = mkBtn('EQUIP', 'owned', () => {
          s.oceanHero = id; ST.save(); sfx.buy();
          if (ST.currentWorld() === 'ocean') loadHeroShip();
          renderStore();
        });
        else btn = mkBtn(price(h.price), '', () => {
          if (ST.buy(id, h.price)) {
            s.oceanHero = id; ST.save(); sfx.buy();
            if (ST.currentWorld() === 'ocean') loadHeroShip();
          } else sfx.denied();
          renderStore(); refreshMenu();
        }, s.points < h.price);
        addRow(icon('i-ship'), h.name, h.desc, btn);
      }
    }
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
      const pips = `<span class="pips">${u.prices.map((_, i) =>
        `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      const btn = maxed ? mkBtn('MAX', 'owned', null, true)
        : mkBtn(price(u.prices[lvl]), '', () => {
          if (ST.buyUpgrade(id)) sfx.buy(); else sfx.denied();
          renderStore(); refreshMenu();
        }, s.points < u.prices[lvl]);
      addRow(icon(ICONS[id]), u.name + pips, u.desc, btn);
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
  const rows = boardMode === 'daily' ? (ST.dailyToday().list || [])
    : boardMode === 'weekly' ? ST.weeklyNow().list
    : ST.state().boards[boardMode];
  $('btn-play-weekly').classList.toggle('hidden', boardMode !== 'weekly');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<li class="empty">${{
      daily: 'same belt for every pilot · resets at midnight',
      weekly: 'one fixed belt all week · leave your mark',
    }[boardMode] || 'no flights logged'}</li>`;
    return;
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="tag">${r.tag}</span>
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
  const seed = hashSeed(`${lastRun.score}|${ST.dayStamp()}|${tag}`);
  const url = `${location.origin}${location.pathname}?duel=${seed}&s=${lastRun.score}&by=${encodeURIComponent(tag)}`;
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
  if (!on) { clearTimeout(reminderTimer); return; }
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  scheduleReminder();
}
function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (!ST.state().settings.reminders || Notification?.permission !== 'granted') return;
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}

// ── wiring ──
$('btn-play-techneck').onclick = () => requestPlay('techneck');
$('btn-play-casual').onclick = () => requestPlay('casual');
$('btn-daily').onclick = () => requestPlay('daily', { seed: todaySeed() });
$('btn-play-weekly').onclick = () => requestPlay('weekly', { seed: hashSeed(ST.isoWeek()) });
$('btn-duel-accept').onclick = () => {
  const d = duelIncoming;
  duelIncoming = null;
  requestPlay('duel', { seed: d.seed, duelTarget: d.score });
};
$('btn-duel-decline').onclick = () => { duelIncoming = null; sfx.ui(); show('screen-menu'); };

$('btn-cal-back').onclick = () => {
  calState = 'done';
  cancelAnimationFrame(camPreviewRaf);
  sfx.ui(); show('screen-menu');
};

$('btn-pause').onclick = () => { pauseGame(true); sfx.ui(); show('hud', 'screen-pause'); };
$('btn-resume').onclick = () => { sfx.ui(); show('hud'); pauseGame(false); };
$('btn-recal-pause').onclick = () => {
  sfx.ui(); stopGame(); stopMusic(); calibratedThisSession = false;
  openCalibration();
};
$('btn-quit').onclick = () => {
  sfx.ui(); stopGame(); startMusic('menu');
  refreshMenu(); show('screen-menu'); startIdle();
};

$('btn-retry').onclick = () => { submitPendingScore(); sfx.ui(); launch(); };
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
$('btn-history-back').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-lore').onclick = () => { sfx.ui(); renderLore(); show('screen-lore'); };
$('btn-lore-back').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-recalibrate').onclick = async () => {
  sfx.ui();
  if (head.usingTouch) return;
  try { if (!cameraRunning()) await startCamera(); openCalibration(); }
  catch { show('screen-camerr'); }
};
$('btn-reset').onclick = () => {
  if (confirm('Wipe all scores, streaks, purchases and settings?')) {
    ST.resetAll(); applyVolumes(); applyTheme(); loadHeroShip(); refreshMenu(); sfx.denied();
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

$('btn-cam-retry').onclick = () => { sfx.ui(); requestPlay(pendingMode, pendingOpts); };
$('btn-cam-touch').onclick = () => { sfx.ui(); enableTouchFallback(); launch(); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    scheduleReminder();
    if (game.running && !game.paused) {
      pauseGame(true);
      show('hud', 'screen-pause');
    }
  }
});

boot();
