import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
let tracker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(data.root + 'wasm');
      tracker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.root + 'face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
      });
      self.postMessage({ type: 'ready' });
    } else if (tracker && data.type === 'frame') {
      try {
        const m = tracker.detectForVideo(data.frame, data.timestamp)?.facialTransformationMatrixes?.[0]?.data;
        const D = 180 / Math.PI;
        self.postMessage({ type: 'pose', pose: m ? { yaw: Math.atan2(m[8], m[10]) * D,
          pitch: Math.asin(Math.max(-1, Math.min(1, -m[9]))) * D, roll: Math.atan2(m[1], m[5]) * D,
          z: m[14], timestamp: data.timestamp, valid: true } : { valid: false } });
      } finally { data.frame.close(); }
    }
  } catch (e) { self.postMessage({ type: 'error', message: e.message }); }
};
