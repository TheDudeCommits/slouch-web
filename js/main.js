// SLOUCH — app shell: screens, calibration, HUD wiring, store, leaderboards,
// trophies, posture reports, daily challenge, duels, goals, reminders.

import { initWorld, applyTheme } from './world.js';
import { initHead, startCamera, cameraRunning, calibrate, drawPreview, enableTouchFallback, head } from './head.js';
import { startGame, stopGame, pauseGame, startIdle, stopIdle, game } from './game.js';
import { initAudio, resumeAudio, applyVolumes, startMusic, stopMusic, sfx } from './audio.js';
import { todaySeed, hashSeed } from './rng.js';
import { shareCard, weeklyTrend } from './report.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import * as ST from './state.js';

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];

function show(...ids) {
  for (const s of screens) s.classList.toggle('active', ids.includes(s.id));
}

let pendingMode = 'techneck';
let pendingOpts = {};
let calibratedThisSession = false;
let camPreviewRaf = 0;
let duelIncoming = null; // {seed, score, tag} parsed from URL

// ── boot ──
async function boot() {
  initWorld();
  startIdle();
  const streakInfo = ST.tickStreak(false);
  refreshMenu();
  $('streak-count').textContent = streakInfo.count;
  parseDuelLink();
  registerSW();

  const fill = $('loader-fill'), msg = $('loader-msg');
  fill.style.width = '30%';
  try {
    await initHead((m) => { msg.textContent = m; fill.style.width = '65%'; });
    fill.style.width = '100%';
    msg.textContent = 'ready';
  } catch (e) {
    console.error(e);
    msg.textContent = 'face tracking unavailable — touch mode enabled';
    enableTouchFallback();
  }
  setTimeout(() => {
    if (duelIncoming) showDuelBanner();
    else show('screen-menu');
  }, 400);
}

function refreshMenu() {
  const s = ST.state();
  $('points-count').textContent = s.points;
  $('streak-count').textContent = s.streak.count;
  $('menu-best').textContent = Math.max(s.best.techneck, s.best.casual);
  const set = s.settings;
  $('set-music').value = set.music;
  $('set-sfx').value = set.sfx;
  $('set-sens').value = set.sensitivity;
  $('set-mirror').checked = set.mirror;
  $('set-ghost').checked = set.ghost;
  $('set-reminders').checked = set.reminders;

  // event banner
  const ev = ST.activeEvent();
  const banner = $('event-banner');
  banner.classList.toggle('hidden', !ev);
  if (ev) banner.textContent = `${ev.icon} ${ev.name} — ${ev.desc}`;

  // daily status
  const daily = ST.dailyToday();
  $('daily-status').textContent = daily.best > 0 ? `· best ${daily.best.toLocaleString()}` : '';

  // goal rings
  const g = ST.goalsToday(), T = ST.GOAL_TARGETS;
  setRing('ring-move', 17, Math.min(1, g.moveSec / T.moveSec));
  setRing('ring-tuck', 12, Math.min(1, g.tucks / T.tucks));
  setRing('ring-stretch', 7, Math.min(1, g.stretches / T.stretches));
}

function setRing(id, r, frac) {
  const c = 2 * Math.PI * r;
  const el = $(id);
  el.style.strokeDasharray = c;
  el.style.strokeDashoffset = c * (1 - frac);
}

// ── duel links: ?duel=<seed>&s=<score>&by=<tag> ──
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
        ? 'Camera access was denied. Enable it in Settings → Safari → Camera, or play with touch.'
        : 'Could not start the camera on this device. You can still play with touch.';
      show('screen-camerr');
      return;
    }
  }
  if (!head.ready) { enableTouchFallback(); launch(); return; }
  if (calibratedThisSession) launch();
  else openCalibration();
}

function openCalibration() {
  show('screen-calibrate');
  $('cal-count').textContent = '';
  $('cal-msg').innerHTML = 'Sit tall. Stack your head over your shoulders.<br>Look straight at the screen.';
  const canvas = $('cal-preview');
  cancelAnimationFrame(camPreviewRaf);
  (function draw() {
    camPreviewRaf = requestAnimationFrame(draw);
    drawPreview(canvas);
  })();
}

async function runCalibration() {
  sfx.ui();
  const count = $('cal-count');
  for (const n of ['3', '2', '1']) {
    count.textContent = n;
    await new Promise(r => setTimeout(r, 650));
  }
  count.textContent = '●';
  $('cal-msg').textContent = 'Hold still…';
  const ok = await calibrate(1500);
  if (!ok) {
    count.textContent = '';
    $('cal-msg').textContent = "Couldn't see your face — get centered in the frame and try again.";
    sfx.denied();
    return;
  }
  calibratedThisSession = true;
  count.textContent = '✓';
  sfx.gate();
  await new Promise(r => setTimeout(r, 400));
  cancelAnimationFrame(camPreviewRaf);
  launch();
}

function launch() {
  stopIdle();
  show('hud');
  startMusic();
  $('hud-slouch').classList.add('hidden');
  $('hud-gate').classList.add('hidden');
  $('hud-boss').classList.add('hidden');
  $('hud-powerups').innerHTML = '';
  const duel = pendingMode === 'duel';
  $('hud-duel-target').classList.toggle('hidden', !duel);
  if (duel) $('hud-duel-target').textContent = `⚔️ beat ${pendingOpts.duelTarget.toLocaleString()}`;
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
    $('hud-shield-fill').style.background = active ? 'var(--gold)' : 'var(--accent)';
  },
  onFlow(flow) { $('hud-flow-fill').style.width = (flow * 100) + '%'; },
  onPowerups(power) {
    const parts = [];
    if (power.magnet > 0) parts.push(`🧲 ${Math.ceil(power.magnet)}`);
    if (power.focus > 0) parts.push(`🕰 ${Math.ceil(power.focus)}`);
    if (power.doubler > 0) parts.push(`×2 ${Math.ceil(power.doubler)}`);
    const el = $('hud-powerups');
    const html = parts.map(p => `<span class="pu">${p}</span>`).join('');
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
  onGameOver(score, report) {
    stopMusic();
    finishRun(score, report);
  },
};

// ── game over ──
let lastRun = { score: 0, mode: 'techneck', submitted: false, report: null };
function finishRun(score, report) {
  const mode = game.mode;
  const s = ST.state();
  s.totals.runs++;

  // stardust with event multiplier
  const ev = ST.activeEvent();
  const evMult = ev?.stardustMult ?? 1;
  const earned = Math.round(score / 10) * evMult;
  ST.addPoints(earned);
  $('go-event-bonus').textContent = evMult > 1 ? `(${ev.icon} ×${evMult})` : '';

  ST.tickStreak(true);
  lastRun = { score, mode, submitted: false, report };

  // daily goals fed by the posture report
  if (report && !report.touch) {
    ST.addGoalProgress({ moveSec: report.moveSec, tucks: report.tucks, stretches: report.gates });
  }
  if (report) ST.addReport(report);

  // board bookkeeping per mode family
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
  }

  // duel outcome
  const duelEl = $('go-duel-result');
  duelEl.classList.add('hidden');
  if (mode === 'duel') {
    const won = score > (game.duelTarget || 0);
    if (won) { s.totals.duelsWon++; ST.save(); }
    duelEl.textContent = won ? '⚔️ DUEL WON!' : '⚔️ duel lost — rematch?';
    duelEl.className = won ? 'win' : 'lose';
    duelEl.classList.remove('hidden');
  }

  // achievements
  const fresh = checkAchievements({ score, stretchScore: report?.stretchScore ?? 0 });
  $('go-unlocks').innerHTML = fresh.map(a =>
    `<div class="unlock">🏆 ${a.icon} ${a.name}</div>`).join('');
  if (fresh.length) sfx.levelup();

  $('go-score').textContent = score.toLocaleString();
  $('go-points').textContent = earned;
  $('go-best').classList.toggle('hidden', !isBest);
  $('go-title').textContent = mode === 'daily' ? 'DAILY RUN COMPLETE'
    : mode === 'duel' ? 'DUEL OVER' : 'SHIP DOWN';

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

// ── posture report screen ──
function renderReport() {
  const r = lastRun.report;
  if (!r) return;
  setRingEl('report-ring', 52, (r.stretchScore || 0) / 100);
  $('report-stretch').textContent = r.stretchScore ?? 0;
  const trend = weeklyTrend();
  $('report-trend').textContent = trend == null ? 'fly more runs to unlock weekly trends'
    : trend >= 0 ? `▲ +${trend} vs last week — keep it up` : `▼ ${trend} vs last week`;

  const rows = r.touch ? [['Touch mode — no posture data', '', 0]] : [
    ['Rotation L', `${r.rom.yawL}°`, r.rom.yawL / 40],
    ['Rotation R', `${r.rom.yawR}°`, r.rom.yawR / 40],
    ['Chin up', `${r.rom.pitchU}°`, r.rom.pitchU / 30],
    ['Chin down', `${r.rom.pitchD}°`, r.rom.pitchD / 30],
    ['Side bend L', `${r.rom.rollL}°`, r.rom.rollL / 30],
    ['Side bend R', `${r.rom.rollR}°`, r.rom.rollR / 30],
    ['Time in neutral', `${r.neutralPct}%`, r.neutralPct / 100],
    ['Active movement', `${r.moveSec}s`, Math.min(1, r.moveSec / 120)],
    ['Hyperdrive time', `${r.hyperSec}s`, Math.min(1, r.hyperSec / 60)],
  ];
  $('report-rows').innerHTML = rows.map(([k, v, f]) => `
    <div class="report-row"><span class="k">${k}</span>
    <span class="bar"><i style="width:${Math.round(Math.min(1, f) * 100)}%"></i></span>
    <span class="v">${v}</span></div>`).join('');

  const g = ST.goalsToday(), T = ST.GOAL_TARGETS;
  const goal = (label, val, target) => `
    <div class="g ${val >= target ? 'done' : ''}"><b>${Math.min(val, target)}/${target}</b>${label}</div>`;
  $('report-goals').innerHTML =
    goal('MOVE SEC', Math.round(g.moveSec), T.moveSec) +
    goal('TUCKS', g.tucks, T.tucks) +
    goal('STRETCHES', g.stretches, T.stretches);
}
function setRingEl(id, r, frac) {
  const c = 2 * Math.PI * r;
  const el = $(id);
  el.style.strokeDasharray = c;
  el.style.strokeDashoffset = c * (1 - Math.min(1, frac));
}

// ── run history ──
function renderHistory() {
  const h = ST.state().history;
  $('history-list').innerHTML = h.length === 0
    ? '<p class="dim">no flights logged yet</p>'
    : h.map(r => `<div class="hist-row">
        <span class="h-date">${r.date}</span>
        <span class="h-mode">${{ techneck: '🧘', casual: '🎮', daily: '🗓', duel: '⚔️' }[r.mode] || '·'}</span>
        <span class="h-score">${r.score.toLocaleString()}</span>
        <span class="h-stretch">${r.touch ? '—' : r.stretchScore + '/100'}</span>
      </div>`).join('');
}

// ── store ──
let storeCat = 'themes';
function renderStore() {
  $('store-points').textContent = ST.state().points;
  const wrap = $('store-items');
  wrap.innerHTML = '';
  const s = ST.state();

  const addRow = (icon, name, desc, btn) => {
    const div = document.createElement('div');
    div.className = 'store-item';
    div.innerHTML = `<div class="icon">${icon}</div>
      <div class="info"><div class="name">${name}</div><div class="desc">${desc}</div></div>`;
    div.appendChild(btn);
    wrap.appendChild(div);
    return div;
  };
  const mkBtn = (label, cls, onclick, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.disabled = disabled;
    if (onclick) b.onclick = onclick;
    return b;
  };
  const cosmeticRow = (slot, id, item) => {
    const owned = s.owned.includes(id);
    const equipped = s.equipped[slot] === id;
    let btn;
    if (equipped) btn = mkBtn('EQUIPPED', 'equipped');
    else if (owned) btn = mkBtn('EQUIP', 'owned', () => {
      ST.equipCosmetic(slot, id); applyTheme(); sfx.buy(); renderStore();
    });
    else btn = mkBtn(`✦ ${item.price}`, '', () => {
      if (ST.buy(id, item.price)) { ST.equipCosmetic(slot, id); applyTheme(); sfx.buy(); }
      else sfx.denied();
      renderStore(); refreshMenu();
    }, s.points < item.price);
    addRow(item.icon, item.name, item.desc, btn);
  };

  if (storeCat === 'themes') {
    for (const [id, t] of Object.entries(ST.THEMES)) {
      const owned = s.owned.includes(id);
      const equipped = s.equippedTheme === id;
      let btn;
      if (t.soon) btn = mkBtn('SOON', '', null, true);
      else if (equipped) btn = mkBtn('EQUIPPED', 'equipped');
      else if (owned) btn = mkBtn('EQUIP', 'owned', () => {
        ST.equipTheme(id); applyTheme(); sfx.buy(); renderStore();
      });
      else btn = mkBtn(`✦ ${t.price}`, '', () => {
        if (ST.buy(id, t.price)) { ST.equipTheme(id); applyTheme(); sfx.buy(); }
        else sfx.denied();
        renderStore(); refreshMenu();
      }, s.points < t.price);
      const row = addRow(t.icon, t.name, t.desc, btn);
      if (t.soon) row.classList.add('soon');
    }
  } else if (storeCat === 'ship') {
    for (const [id, item] of Object.entries(ST.SKINS)) cosmeticRow('skin', id, item);
    for (const [id, item] of Object.entries(ST.TRAILS)) cosmeticRow('trail', id, item);
    for (const [id, item] of Object.entries(ST.BOOMS)) cosmeticRow('boom', id, item);
  } else if (storeCat === 'upgrades') {
    for (const [id, u] of Object.entries(ST.UPGRADES)) {
      const lvl = s.upgrades[id];
      const maxed = lvl >= u.prices.length;
      const pips = `<span class="pips">${u.prices.map((_, i) =>
        `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
      const btn = maxed ? mkBtn('MAX', 'owned', null, true)
        : mkBtn(`✦ ${u.prices[lvl]}`, '', () => {
          if (ST.buyUpgrade(id)) sfx.buy(); else sfx.denied();
          renderStore(); refreshMenu();
        }, s.points < u.prices[lvl]);
      addRow(u.icon, u.name + pips, u.desc, btn);
    }
  } else {
    for (const item of ST.STORE_EXTRAS) {
      const count = item.id === 'freeze' ? ` (owned: ${s.streak.freezes})`
        : item.id === 'revive' ? ` (owned: ${s.revives})` : '';
      const capped = item.id === 'revive' && s.revives >= (item.max ?? 99);
      const btn = mkBtn(capped ? 'FULL' : `✦ ${item.price}`, '', () => {
        if (ST.buy(item.id, item.price)) sfx.buy(); else sfx.denied();
        renderStore(); refreshMenu();
      }, capped || s.points < item.price);
      addRow(item.icon, item.name + count, item.desc, btn);
    }
  }
}

// ── leaderboard ──
let boardMode = 'techneck';
function renderBoard() {
  const list = $('board-list');
  const rows = boardMode === 'daily' ? (ST.dailyToday().list || []) : ST.state().boards[boardMode];
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<li class="empty">${boardMode === 'daily'
      ? 'no daily runs yet — same belt for everyone, once per day'
      : 'no flights logged yet — go fly'}</li>`;
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
  $('trophy-count').textContent = `${Object.keys(un).length} / ${ACHIEVEMENTS.length}`;
  $('trophy-list').innerHTML = ACHIEVEMENTS.map(a => `
    <div class="trophy ${un[a.id] ? 'unlocked' : ''}">
      <div class="t-icon">${a.icon}</div>
      <div><div class="t-name">${a.name}</div><div class="t-desc">${a.desc}</div></div>
    </div>`).join('');
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
    try { await navigator.share({ text: `⚔️ Beat my ${lastRun.score} in SLOUCH: ${url}` }); } catch { }
  } else {
    await navigator.clipboard?.writeText(url).catch(() => { });
    hooks.onToast?.('duel link copied');
  }
}

// ── reminders (best effort on web; real push arrives with the native build) ──
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
      const opts = { body: 'Your neck has been at phone-angle for a while. Fly a run? 🚀', icon: 'icons/icon-180.png' };
      if (reg?.showNotification) reg.showNotification('SLOUCH — posture check', opts);
      else new Notification('SLOUCH — posture check', opts);
    } catch { /* notification blocked */ }
  }, 4 * 3600 * 1000);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}

// ── event wiring ──
$('btn-play-techneck').onclick = () => requestPlay('techneck');
$('btn-play-casual').onclick = () => requestPlay('casual');
$('btn-daily').onclick = () => requestPlay('daily', { seed: todaySeed() });
$('btn-duel-accept').onclick = () => {
  const d = duelIncoming;
  duelIncoming = null;
  requestPlay('duel', { seed: d.seed, duelTarget: d.score });
};
$('btn-duel-decline').onclick = () => { duelIncoming = null; sfx.ui(); show('screen-menu'); };

$('btn-cal-start').onclick = runCalibration;
$('btn-cal-back').onclick = () => { cancelAnimationFrame(camPreviewRaf); sfx.ui(); show('screen-menu'); };

$('btn-pause').onclick = () => { pauseGame(true); sfx.ui(); show('hud', 'screen-pause'); };
$('btn-resume').onclick = () => { sfx.ui(); show('hud'); pauseGame(false); };
$('btn-recal-pause').onclick = () => {
  sfx.ui(); stopGame(); stopMusic(); calibratedThisSession = false;
  openCalibration();
};
$('btn-quit').onclick = () => {
  sfx.ui(); stopGame(); stopMusic();
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
$('btn-lore').onclick = () => { sfx.ui(); show('screen-lore'); };
$('btn-lore-back').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-recalibrate').onclick = async () => {
  sfx.ui();
  if (head.usingTouch) return;
  try { if (!cameraRunning()) await startCamera(); openCalibration(); }
  catch { show('screen-camerr'); }
};
$('btn-reset').onclick = () => {
  if (confirm('Wipe all scores, streaks, purchases and settings?')) {
    ST.resetAll(); applyVolumes(); applyTheme(); refreshMenu(); sfx.denied();
  }
};

for (const [id, key] of [['set-music', 'music'], ['set-sfx', 'sfx'], ['set-sens', 'sensitivity']]) {
  $(id).oninput = () => {
    ST.state().settings[key] = Number($(id).value);
    ST.save(); applyVolumes();
  };
}
$('set-mirror').onchange = () => { ST.state().settings.mirror = $('set-mirror').checked; ST.save(); };
$('set-ghost').onchange = () => { ST.state().settings.ghost = $('set-ghost').checked; ST.save(); };
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
