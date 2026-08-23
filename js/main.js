// SLOUCH — app shell: screens, calibration flow, HUD wiring, store,
// leaderboard, settings, streaks.

import { initWorld, applyTheme } from './world.js';
import { initHead, startCamera, cameraRunning, calibrate, drawPreview, enableTouchFallback, head } from './head.js';
import { startGame, stopGame, pauseGame, startIdle, stopIdle, game } from './game.js';
import { initAudio, resumeAudio, applyVolumes, startMusic, stopMusic, sfx } from './audio.js';
import * as ST from './state.js';

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];

function show(...ids) {
  for (const s of screens) s.classList.toggle('active', ids.includes(s.id));
}

let pendingMode = 'techneck';
let calibratedThisSession = false;
let camPreviewRaf = 0;

// ── boot ──
async function boot() {
  initWorld();
  startIdle();
  refreshMenu();
  const streakInfo = ST.tickStreak(false); // apply freezes / breaks on open
  $('streak-count').textContent = streakInfo.count;

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
  setTimeout(() => { show('screen-menu'); }, 400);
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
}

// ── play flow ──
async function requestPlay(mode) {
  pendingMode = mode;
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
  $('hud-shield').style.display = pendingMode === 'techneck' ? 'block' : 'none';
  startGame(pendingMode, hooks);
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
    void el.offsetWidth; // restart animation
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1300);
  },
  onGameOver(score) {
    stopMusic();
    finishRun(score);
  },
};

// ── game over ──
let lastRun = { score: 0, mode: 'techneck', submitted: false };
function finishRun(score) {
  const mode = game.mode;
  const earned = Math.round(score / 10);
  ST.addPoints(earned);
  const streak = ST.tickStreak(true);
  lastRun = { score, mode, submitted: false };

  const isBest = score > ST.state().best[mode];
  $('go-score').textContent = score.toLocaleString();
  $('go-points').textContent = earned;
  $('go-best').classList.toggle('hidden', !isBest);
  $('go-title').textContent = mode === 'techneck' ? 'SHIP DOWN' : 'SHIP DOWN';

  const qualifies = ST.qualifiesForBoard(mode, score);
  $('go-name-entry').classList.toggle('hidden', !qualifies);
  if (qualifies) $('go-name').value = ST.state().lastTag;
  show('screen-gameover');
  if (streak.count > 0) hooksToastSafe(`🔥 day ${streak.count} streak`);
}
function hooksToastSafe() { /* game-over toasts land on the panel; skipped for now */ }

function submitPendingScore() {
  if (lastRun.submitted) return;
  lastRun.submitted = true;
  if (ST.qualifiesForBoard(lastRun.mode, lastRun.score)) {
    const tag = ($('go-name').value.trim().toUpperCase() || 'ACE').slice(0, 8);
    ST.submitScore(lastRun.mode, tag, lastRun.score);
  } else if (lastRun.score > ST.state().best[lastRun.mode]) {
    ST.state().best[lastRun.mode] = lastRun.score;
    ST.save();
  }
}

// ── store ──
function renderStore() {
  $('store-points').textContent = ST.state().points;
  const wrap = $('store-items');
  wrap.innerHTML = '';
  const s = ST.state();

  for (const [id, t] of Object.entries(ST.THEMES)) {
    const owned = s.owned.includes(id);
    const equipped = s.equippedTheme === id;
    const div = document.createElement('div');
    div.className = 'store-item' + (t.soon ? ' soon' : '');
    div.innerHTML = `<div class="icon">${t.icon}</div>
      <div class="info"><div class="name">${t.name}</div><div class="desc">${t.desc}</div></div>`;
    const btn = document.createElement('button');
    if (t.soon) { btn.textContent = 'SOON'; btn.disabled = true; }
    else if (equipped) { btn.textContent = 'EQUIPPED'; btn.className = 'equipped'; }
    else if (owned) {
      btn.textContent = 'EQUIP'; btn.className = 'owned';
      btn.onclick = () => { ST.equipTheme(id); applyTheme(); sfx.buy(); renderStore(); };
    } else {
      btn.textContent = `✦ ${t.price}`;
      btn.disabled = s.points < t.price;
      btn.onclick = () => {
        if (ST.buy(id, t.price)) { ST.equipTheme(id); applyTheme(); sfx.buy(); }
        else sfx.denied();
        renderStore(); refreshMenu();
      };
    }
    div.appendChild(btn);
    wrap.appendChild(div);
  }

  for (const item of ST.STORE_EXTRAS) {
    const div = document.createElement('div');
    div.className = 'store-item';
    const count = item.id === 'freeze' ? ` (owned: ${s.streak.freezes})` : '';
    div.innerHTML = `<div class="icon">${item.icon}</div>
      <div class="info"><div class="name">${item.name}${count}</div><div class="desc">${item.desc}</div></div>`;
    const btn = document.createElement('button');
    btn.textContent = `✦ ${item.price}`;
    btn.disabled = s.points < item.price;
    btn.onclick = () => {
      if (ST.buy(item.id, item.price)) sfx.buy(); else sfx.denied();
      renderStore(); refreshMenu();
    };
    div.appendChild(btn);
    wrap.appendChild(div);
  }
}

// ── leaderboard ──
let boardMode = 'techneck';
function renderBoard() {
  const list = $('board-list');
  const rows = ST.state().boards[boardMode];
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<li class="empty">no flights logged yet — go fly</li>';
    return;
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="tag">${r.tag}</span>
      <span class="val">${r.score.toLocaleString()}</span>`;
    list.appendChild(li);
  });
}

// ── event wiring ──
$('btn-play-techneck').onclick = () => requestPlay('techneck');
$('btn-play-casual').onclick = () => requestPlay('casual');
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

$('btn-store').onclick = () => { sfx.ui(); renderStore(); show('screen-store'); };
$('btn-store-back').onclick = () => { sfx.ui(); refreshMenu(); show('screen-menu'); };

$('btn-leaderboard').onclick = () => { sfx.ui(); renderBoard(); show('screen-leaderboard'); };
$('btn-board-back').onclick = () => { sfx.ui(); show('screen-menu'); };
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    boardMode = tab.dataset.board;
    sfx.ui(); renderBoard();
  };
});

$('btn-settings').onclick = () => { sfx.ui(); show('screen-settings'); };
$('btn-settings-back').onclick = () => { sfx.ui(); refreshMenu(); show('screen-menu'); };
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
$('set-mirror').onchange = () => {
  ST.state().settings.mirror = $('set-mirror').checked;
  ST.save();
};

$('btn-cam-retry').onclick = () => { sfx.ui(); requestPlay(pendingMode); };
$('btn-cam-touch').onclick = () => { sfx.ui(); enableTouchFallback(); launch(); };

// pause when app is backgrounded
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.running && !game.paused) {
    pauseGame(true);
    show('hud', 'screen-pause');
  }
});

boot();
