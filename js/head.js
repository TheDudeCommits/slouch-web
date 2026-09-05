import TrackingWorker from './tracking.worker.js?worker';
// Tracking is a replaceable provider. Only fresh, timestamped poses reach gameplay.
import { state } from './state.js';
import { fresh, stablePose, neutralPose } from './core/movement.ts';
import { native, isNative } from './platform/native.js';

export const head = {
  ready: false, hasFace: false, usingTouch: false, source: 'camera', provider: 'mediapipe',
  yaw: 0, pitch: 0, roll: 0, z: 0, rYaw: 0, rPitch: 0, rRoll: 0, rZ: 0,
  neutral: { yaw: 0, pitch: 0, roll: 0, z: 0 },
  timestamp: 0, valid: false, touchX: 0, touchY: 0, manualBoost: false,
};
let worker, video, pending = false, lastVideo = -1, lastSubmit = 0, samples = [];
let inputEnabled = false, dragging = false, nativeRunning = false, nativeListener;
const keys = new Set();
let fallback = null, previewImage = null, preferMainThread = false;

function resetFailedWorker() {
  worker?.terminate(); worker = null; pending = false;
  head.valid = false; head.hasFace = false; head.ready = false;
  preferMainThread = true;
}

export function acceptPose(p) {
  if (!p?.valid || ![p.yaw, p.pitch, p.roll, p.z, p.timestamp].every(Number.isFinite)) {
    head.valid = false; head.hasFace = false; return;
  }
  const initial = !head.valid;
  for (const k of ['yaw', 'pitch', 'roll', 'z']) {
    const amount = initial ? 1 : Math.min(0.8, 0.3 + Math.abs(p[k] - head[k]) * (k === 'z' ? 0.12 : 0.05));
    head[k] += (p[k] - head[k]) * amount;
  }
  head.timestamp = p.timestamp; head.valid = true;
  head.hasFace = fresh(head, performance.now());
  head.rYaw = head.yaw - head.neutral.yaw;
  head.rPitch = head.pitch - head.neutral.pitch;
  head.rRoll = head.roll - head.neutral.roll;
  head.rZ = head.z - head.neutral.z;
  samples.push({ ...p });
  samples = samples.filter(s => p.timestamp - s.timestamp < 1500);
}
export function calibrationStable() { return stablePose(samples, performance.now()); }

export async function initHead(onProgress) {
  video = document.getElementById('cam');
  if (head.ready) return;
  if (isNative) {
    const support = await native.support();
    if (support.faceTracking) {
      head.provider = 'arkit'; head.ready = true; return;
    }
  }
  onProgress?.('Preparing your private camera');
  const root = new URL('vendor/vision/', document.baseURI).href;
  try {
    if (preferMainThread) throw new Error('Use compatible camera engine');
    worker = new TrackingWorker();
    await new Promise((resolve, reject) => {
      let initialized = false;
      const timeout = setTimeout(() => reject(new Error('Camera engine timed out')), 30000);
      const failed = error => {
        pending = false; head.valid = false; head.hasFace = false; clearTimeout(timeout);
        if (initialized) resetFailedWorker(); else reject(error);
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { initialized = true; clearTimeout(timeout); resolve(); }
        else if (data.type === 'error') failed(new Error(data.message));
        else { pending = false; acceptPose(data.pose); }
      };
      worker.onerror = e => failed(new Error(e.message));
      worker.postMessage({ type: 'init', root });
    });
  } catch (error) {
    worker?.terminate(); worker = null;
    // Older WebKit versions can reject worker camera frames. Bounded fallback.
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(root + 'wasm');
    fallback = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: root + 'face_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
    });
    head.provider = 'mediapipe-main';
  }
  head.ready = true;
}
export async function startCamera() {
  video ||= document.getElementById('cam');
  head.usingTouch = false; head.source = 'camera'; samples = [];
  head.valid = false; head.hasFace = false;
  if (head.provider === 'arkit') {
    if (!nativeListener) nativeListener = await native.addListener('pose', p => {
      // Native pose timestamps are emitted as age; use the same JS clock everywhere.
      acceptPose({ ...p, timestamp: performance.now() - Math.max(0, p.ageMs || 0) });
    });
    await native.startTracking(); nativeRunning = true; return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream; await video.play(); lastVideo = -1;
}
export function stopCamera() {
  if (nativeRunning) native.stopTracking().catch(() => {});
  nativeRunning = false;
  video?.srcObject?.getTracks().forEach(t => t.stop());
  if (video) video.srcObject = null;
  head.hasFace = false; head.valid = false; samples = []; keys.clear(); inputEnabled = false;
}
export function cameraRunning() {
  return nativeRunning || !!video?.srcObject?.getVideoTracks().some(t => t.readyState === 'live');
}
export function updateHead() {
  if (head.usingTouch) {
    if (head.source === 'keyboard') {
      head.touchX = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
      head.touchY = Number(keys.has('ArrowUp') || keys.has('w')) - Number(keys.has('ArrowDown') || keys.has('s'));
    }
    head.rYaw = -head.touchX * 18; head.rRoll = head.touchX * 14; head.rPitch = -head.touchY * 12; head.rZ = 0;
    head.hasFace = true; head.valid = true; head.timestamp = performance.now(); return;
  }
  head.hasFace = fresh(head, performance.now());
  if (!head.ready || head.provider === 'arkit' || !video || video.readyState < 2 || pending || video.currentTime === lastVideo) return;
  const now = performance.now();
  if (now - lastSubmit < (worker ? 33 : 65)) return;
  lastSubmit = now; lastVideo = video.currentTime;
  if (worker) {
    pending = true;
    const activeWorker = worker;
    createImageBitmap(video).then(frame => {
      if (worker !== activeWorker) { frame.close(); return; }
      try { activeWorker.postMessage({ type: 'frame', frame, timestamp: now }, [frame]); }
      catch (error) { frame.close(); throw error; }
    }).catch(resetFailedWorker);
  } else if (fallback) {
    try { acceptPose(poseFromMatrix(fallback.detectForVideo(video, now)?.facialTransformationMatrixes?.[0]?.data, now)); }
    catch { head.valid = false; }
  }
}
export function poseFromMatrix(m, timestamp) {
  if (!m) return { valid: false, timestamp };
  const D = 180 / Math.PI;
  return { yaw: Math.atan2(m[8], m[10]) * D, pitch: Math.asin(Math.max(-1, Math.min(1, -m[9]))) * D,
    roll: Math.atan2(m[1], m[5]) * D, z: m[14], timestamp, valid: true };
}
export async function calibrate() {
  if (!calibrationStable()) return false;
  head.neutral = neutralPose(samples.filter(p => performance.now() - p.timestamp < 1000));
  head.rYaw = head.rPitch = head.rRoll = head.rZ = 0;
  state().calibrated = true; return true;
}
export function drawPreview(canvas) {
  const ctx = canvas.getContext('2d');
  if (canvas.width !== canvas.clientWidth * 2) { canvas.width = canvas.clientWidth * 2; canvas.height = canvas.clientHeight * 2; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (head.provider === 'arkit') { if(previewImage?.complete) ctx.drawImage(previewImage,0,0,canvas.width,canvas.height); return; }
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
  ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh); ctx.restore();
}
let previewListener;
export async function setTrackingPreview(enabled) {
  if(head.provider!=='arkit')return;
  if(!previewListener)previewListener=await native.addListener('preview',p=>{previewImage ||= new Image();previewImage.src=p.image;});
  await native.setPreview({enabled});
  if(!enabled)previewImage=null;
}
export function setInputEnabled(value) { inputEnabled = value; if (!value) { keys.clear(); head.touchX = head.touchY = 0; head.manualBoost = false; } }
export function enableTouchFallback(source = 'pointer') {
  stopCamera(); head.usingTouch = true; head.source = source; head.hasFace = true; head.valid = true;
}
function onPlayfield(e) { return e.target === document.getElementById('gl') || e.target === document.getElementById('hud'); }
addEventListener('pointerdown', e => {
  if (!inputEnabled || !head.usingTouch || !onPlayfield(e)) return;
  dragging = true; head.source = 'pointer'; movePointer(e);
});
function movePointer(e) {
  if (!dragging || !inputEnabled || !head.usingTouch) return;
  head.touchX = Math.max(-1, Math.min(1, (e.clientX / innerWidth * 2 - 1) * 1.3));
  head.touchY = Math.max(-1, Math.min(1, -(e.clientY / innerHeight * 2 - 1) * 1.3));
}
addEventListener('pointermove', movePointer);
addEventListener('pointerup', () => { dragging = false; head.touchX = head.touchY = 0; });
addEventListener('pointercancel', () => { dragging = false; head.touchX = head.touchY = 0; });
addEventListener('keydown', e => {
  if (!inputEnabled || !head.usingTouch || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', ' '].includes(e.key)) {
    e.preventDefault(); head.source = 'keyboard'; keys.add(e.key);
    if (e.key === ' ' && !e.repeat) head.manualBoost = true;
  }
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => { keys.clear(); dragging = false; head.touchX = head.touchY = 0; });
