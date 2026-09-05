import { mkdir, cp, access, writeFile } from 'node:fs/promises';
await mkdir('vendor/vision', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'vendor/vision/wasm', { recursive: true });
const model = 'vendor/vision/face_landmarker.task';
try { await access(model); } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task');
  if (!response.ok) throw new Error(`Face model download failed: ${response.status}`);
  await writeFile(model, Buffer.from(await response.arrayBuffer()));
}
