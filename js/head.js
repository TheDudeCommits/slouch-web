// SLOUCH — on-device head tracking via MediaPipe Face Landmarker.
// Extracts yaw/pitch/roll + Z-translation from the facial transformation matrix,
// smooths them, and reports pose relative to a calibrated neutral.

import { state } from './state.js';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Adaptive smoothing: barely-moving poses get heavy smoothing (no jitter),
// fast deliberate movements pass through almost raw (low latency).
function ema(cur, target, gain) {
  const a = Math.min(0.85, 0.2 + Math.abs(target - cur) * gain);
  return cur + (target - cur) * a;
}

export const head = {
  ready: false,        // tracker initialized
  hasFace: false,      // face currently detected
  usingTouch: false,   // fallback mode
  // raw absolute pose (degrees / cm-ish units)
  yaw: 0, pitch: 0, roll: 0, z: 0,
  // neutral pose captured at calibration
  neutral: { yaw: 0, pitch: 0, roll: 0, z: 0 },
  // pose relative to neutral (what the game reads)
  rYaw: 0, rPitch: 0, rRoll: 0, rZ: 0,
  // touch fallback input, -1..1
  touchX: 0, touchY: 0,
};

let landmarker = null;
let video = null;
let lastVideoTime = -1;
let lostFrames = 0;

export async function initHead(onProgress) {
  video = document.getElementById('cam');
  onProgress?.('loading vision engine…');
  const { FaceLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
  );
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  onProgress?.('loading face model…');
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  });
  head.ready = true;
}

export async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  head.usingTouch = false;
}

export function cameraRunning() {
  return !!(video?.srcObject && video.srcObject.getVideoTracks().some(t => t.readyState === 'live'));
}

// Decompose the 4x4 facial transformation matrix (column-major) into euler angles.
function matrixToPose(m) {
  // rotation part
  const r00 = m[0], r01 = m[4], r02 = m[8];
  const r10 = m[1], r11 = m[5], r12 = m[9];
  const r20 = m[2], r21 = m[6], r22 = m[10];
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r12)));
  const yaw = Math.atan2(r02, r22);
  const roll = Math.atan2(r10, r11);
  const D = 180 / Math.PI;
  // translation: tz grows negative as the face nears the camera
  return { yaw: yaw * D, pitch: pitch * D, roll: roll * D, z: m[14] };
}

// Call once per rAF from the game loop. Cheap when no new video frame.
export function updateHead() {
  if (head.usingTouch) {
    // match camera sign conventions: rYaw>0 = left, rRoll>0 = right, rPitch>0 = down
    head.rYaw = -head.touchX * 30;
    head.rRoll = head.touchX * 30;
    head.rPitch = -head.touchY * 20;
    head.rZ = 0;
    head.hasFace = true;
    return;
  }
  if (!landmarker || !video || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  let result;
  try {
    result = landmarker.detectForVideo(video, performance.now());
  } catch (e) { return; }

  const mat = result?.facialTransformationMatrixes?.[0]?.data;
  if (!mat) {
    if (++lostFrames > 12) head.hasFace = false;
    return;
  }
  lostFrames = 0;
  head.hasFace = true;

  const p = matrixToPose(mat);
  head.yaw = ema(head.yaw, p.yaw, 0.06);
  head.pitch = ema(head.pitch, p.pitch, 0.06);
  head.roll = ema(head.roll, p.roll, 0.06);
  head.z = ema(head.z, p.z, 0.14);

  const n = head.neutral;
  head.rYaw = head.yaw - n.yaw;
  head.rPitch = head.pitch - n.pitch;
  head.rRoll = head.roll - n.roll;
  // MediaPipe camera-space z is ~-30cm at rest and more negative farther away, so
  // rZ < 0 = head moved BACK (chin tuck), rZ > 0 = head crept FORWARD (slouch).
  head.rZ = head.z - n.z;
}

// Average pose over `ms` to set the neutral. Resolves false if no face seen.
export function calibrate(ms = 1500) {
  return new Promise(resolve => {
    const samples = [];
    const t0 = performance.now();
    function tick() {
      updateHead();
      if (head.hasFace) samples.push({ yaw: head.yaw, pitch: head.pitch, roll: head.roll, z: head.z });
      if (performance.now() - t0 < ms) { requestAnimationFrame(tick); return; }
      if (samples.length < 5) { resolve(false); return; }
      const n = head.neutral;
      for (const k of ['yaw', 'pitch', 'roll', 'z']) {
        n[k] = samples.reduce((a, s) => a + s[k], 0) / samples.length;
      }
      state().calibrated = true;
      resolve(true);
    }
    tick();
  });
}

// Draw the (mirrored) camera feed into the calibration preview canvas.
export function drawPreview(canvas) {
  if (!video || video.readyState < 2) return;
  const ctx = canvas.getContext('2d');
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return;
  if (canvas.width !== canvas.clientWidth * 2) {
    canvas.width = canvas.clientWidth * 2;
    canvas.height = canvas.clientHeight * 2;
  }
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(video, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

// ── touch fallback (camera denied / unsupported) ──
export function enableTouchFallback() {
  head.usingTouch = true;
  head.hasFace = true;
  const set = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    head.touchX = (t.clientX / innerWidth) * 2 - 1;
    head.touchY = -((t.clientY / innerHeight) * 2 - 1);
  };
  addEventListener('touchstart', set, { passive: true });
  addEventListener('touchmove', set, { passive: true });
  addEventListener('touchend', () => { head.touchX = 0; head.touchY = 0; }, { passive: true });
  addEventListener('mousemove', (e) => {
    if (e.buttons || true) {
      head.touchX = (e.clientX / innerWidth) * 2 - 1;
      head.touchY = -((e.clientY / innerHeight) * 2 - 1);
    }
  });
}
