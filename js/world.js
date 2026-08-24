// SLOUCH — Three.js world: baked nebula skyboxes (space-3d), giant planet
// backdrop (Solar System Scope), glTF hero ships (Quaternius, CC0), PBR rocks
// (ambientCG), lensflare sun and a cinematic post stack.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { THEMES, themeColors, cosmetics, state } from './state.js';

export const world = {
  scene: null, camera: null, renderer: null, composer: null,
  ship: null, shipShield: null, ghostShip: null,
  asteroids: [], enemies: [], gates: [], crystals: [], powerups: [], walls: [],
  boss: null,
  bounds: { x: 13, y: 7.5 },
  spawnZ: -420, killZ: 14,
};

export const POWERUP_TYPES = {
  magnet: { color: 0xffd54d, label: 'MAGNET' },
  focus: { color: 0x8ab8ff, label: 'FOCUS' },
  doubler: { color: 0xff5ce0, label: 'SCORE ×2' },
};

let engineMat, trailPts, trailGeo, shieldMat, warpStars, dust;
let hyperLevel = 0, hyperTarget = 0;
let explosion = null;
let themedMats = {};
let planet = null, planetRing = null, sunLight = null, flare = null, keyLight = null;
let shipModelRoot = null;   // container the glb hero model lives in
let engineFx = null;        // glow + light group repositioned per model
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const modelCache = {};
let rockGeos = null;        // loaded from glb, fallback = displaced icosahedra
let currentSky = null;
let postPass = null;

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.5)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ── post shader: chromatic aberration, vignette, grain, hyper speed-lines ──
const PostShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    hyper: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, hyper, aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // chromatic aberration: subtle at rest, strong in hyper
      float ca = 0.0016 + hyper * 0.008;
      vec2 off = c * r2 * ca * 14.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // hyper speed lines: radial streaks flickering outward
      if (hyper > 0.01) {
        vec2 d = vec2(c.x * aspect, c.y);
        float ang = atan(d.y, d.x);
        float streak = hash(vec2(floor(ang * 60.0), floor(time * 24.0)));
        float mask = smoothstep(0.06, 0.42, r2) * step(0.82, streak) * hyper;
        col += vec3(0.55, 0.85, 1.0) * mask * 0.5;
      }
      // vignette
      col *= 1.0 - r2 * (0.55 - hyper * 0.15);
      // grain
      col += (hash(uv * vec2(1917.0, 1033.0) + fract(time)) - 0.5) * 0.035;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function initWorld() {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  world.renderer = renderer;

  const scene = new THREE.Scene();
  world.scene = scene;

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1400);
  camera.position.set(0, 2.6, 9);
  world.camera = camera;

  scene.add(new THREE.AmbientLight(0x8899cc, 0.35));
  keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(6, 12, 6);
  scene.add(keyLight);

  buildShip();
  buildGhostShip();
  buildStars();
  buildDust();
  buildPlanet();
  buildSun();
  buildAsteroids();
  buildEnemies();
  buildGates();
  buildCrystals();
  buildPowerups();
  buildWalls();
  buildBoss();
  buildExplosion();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.65, 0.6, 0.78));
  postPass = new ShaderPass(PostShader);
  postPass.uniforms.aspect.value = innerWidth / innerHeight;
  composer.addPass(postPass);
  world.composer = composer;

  applyTheme();
  loadRockGeometries();
  loadHeroShip();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    postPass.uniforms.aspect.value = innerWidth / innerHeight;
  });
}

// ── hero ship: procedural placeholder, hot-swapped with the glTF model ──
function buildShip() {
  const ship = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.75, roughness: 0.3, flatShading: true });
  engineMat = new THREE.MeshBasicMaterial({ color: 0x4df3ff });
  themedMats.hull = hullMat;

  shipModelRoot = new THREE.Group();
  ship.add(shipModelRoot);

  // placeholder dart shown until the glb arrives
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.1;
  shipModelRoot.add(nose);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.8, 6), hullMat);
  body.rotation.x = -Math.PI / 2;
  body.position.z = 0.9;
  shipModelRoot.add(body);

  // engine FX group: glow sprite + light, repositioned per model
  engineFx = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(120,240,255,1)'), color: 0x4df3ff,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.6, 1.6, 1);
  engineFx.add(glow);
  const light = new THREE.PointLight(0x4df3ff, 2.2, 18);
  light.position.set(0, 0.3, 0.3);
  engineFx.add(light);
  engineFx.position.set(0, 0, 2.0);
  ship.add(engineFx);
  ship.userData.glow = glow;
  ship.userData.engineLight = light;

  shieldMat = new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 14), shieldMat);
  ship.add(shield);
  world.shipShield = shield;

  const N = 60;
  trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  trailPts = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    color: 0x4df3ff, size: 0.36, map: glowTexture('rgba(160,250,255,1)'),
    transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  world.scene.add(trailPts);

  world.scene.add(ship);
  world.ship = ship;
}

// Per-model corrections: rotation so the nose faces -Z, plus scale-to-length.
const MODEL_FIX = {
  talon: { yaw: Math.PI, length: 4.6 },
  striker: { yaw: Math.PI, length: 4.6 },
  raider: { yaw: Math.PI, length: 4.4 },
  bumble: { yaw: Math.PI, length: 3.8 },
};

async function loadModel(name) {
  if (modelCache[name]) return modelCache[name];
  const gltf = await gltfLoader.loadAsync(`assets/ships/${name}.glb`);
  modelCache[name] = gltf.scene;
  return gltf.scene;
}

export async function loadHeroShip() {
  const skin = cosmetics().skin;
  const name = skin.model || 'talon';
  try {
    const src = await loadModel(name);
    const model = src.clone(true);
    const fix = MODEL_FIX[name] || { yaw: Math.PI, length: 4.4 };
    // normalize: center, face -Z, scale so length ≈ fix.length
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    model.position.sub(center);
    wrap.add(model);
    wrap.rotation.y = fix.yaw;
    const s = fix.length / Math.max(size.z, 0.001);
    wrap.scale.setScalar(s);
    model.traverse(o => {
      if (o.isMesh) {
        o.material.metalness = Math.min(0.6, o.material.metalness ?? 0.4);
        o.material.roughness = Math.max(0.35, o.material.roughness ?? 0.6);
        o.material.envMapIntensity = 0.9;
      }
    });
    shipModelRoot.clear();
    shipModelRoot.add(wrap);
    // engine FX sits at the model's tail
    engineFx.position.set(0, 0.1, (size.z * s) / 2 + 0.25);
  } catch (e) {
    console.warn('hero ship load failed, keeping placeholder', e);
  }
}

function buildGhostShip() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false });
  themedMats.ghost = mat;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.1;
  g.add(nose);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.1), mat);
    wing.position.set(side * 1.15, -0.08, 0.9);
    wing.rotation.z = side * 0.28;
    g.add(wing);
  }
  g.visible = false;
  world.scene.add(g);
  world.ghostShip = g;
}

// ── starfield + near-field dust for speed parallax ──
function buildStars() {
  const N = 1200;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 24 + Math.random() * 130;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = -Math.random() * 600 + 50;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  warpStars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcfe4ff, size: 0.55, transparent: true, opacity: 0.7, sizeAttenuation: true }));
  world.scene.add(warpStars);
}

function buildDust() {
  const N = 300;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 44;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 2] = -Math.random() * 220 + 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8fb8ff, size: 0.14, transparent: true, opacity: 0.5, sizeAttenuation: true }));
  world.scene.add(dust);
}

// ── giant planet backdrop ──
function buildPlanet() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, fog: false });
  planet = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), mat);
  planet.position.set(-260, 90, -900);
  world.scene.add(planet);

  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9, fog: false });
  planetRing = new THREE.Mesh(new THREE.RingGeometry(190, 340, 96), ringMat);
  // map the ring strip texture across the annulus radially
  const pos = planetRing.geometry.attributes.position;
  const uv = planetRing.geometry.attributes.uv;
  const v3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const r = (v3.length() - 190) / (340 - 190);
    uv.setXY(i, r, 0.5);
  }
  planetRing.position.copy(planet.position);
  planetRing.rotation.x = Math.PI / 2.35;
  planetRing.rotation.y = 0.25;
  world.scene.add(planetRing);
}

// ── sun + lensflare ──
function buildSun() {
  sunLight = new THREE.PointLight(0xfff4e0, 0, 0);
  sunLight.position.set(420, 260, -1100);
  const tex0 = texLoader.load('assets/fx/lensflare0.png');
  const tex3 = texLoader.load('assets/fx/lensflare3.png');
  flare = new Lensflare();
  flare.addElement(new LensflareElement(tex0, 420, 0, sunLight.color));
  flare.addElement(new LensflareElement(tex3, 80, 0.55));
  flare.addElement(new LensflareElement(tex3, 130, 0.8));
  flare.addElement(new LensflareElement(tex3, 55, 1.05));
  sunLight.add(flare);
  world.scene.add(sunLight);
}

// ── asteroids: glTF rock geometry (fallback: displaced icosahedra) ──
function makeFallbackRockGeo(size) {
  const geo = new THREE.IcosahedronGeometry(size, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (Math.random() - 0.5) * 0.55);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

async function loadRockGeometries() {
  try {
    const geos = [];
    for (const f of ['rock1', 'rock2']) {
      const gltf = await gltfLoader.loadAsync(`assets/rock/${f}.glb`);
      gltf.scene.traverse(o => {
        if (o.isMesh && geos.length < 2) {
          const g = o.geometry.clone();
          g.computeBoundingSphere();
          const s = 1 / g.boundingSphere.radius; // normalize to unit radius
          g.scale(s, s, s);
          g.center();
          geos.push(g);
        }
      });
    }
    if (!geos.length) return;
    rockGeos = geos;
    // swap pooled asteroid geometries in place
    world.asteroids.forEach((m, i) => {
      m.geometry = geos[i % geos.length];
      m.scale.setScalar(m.userData.radius);
    });
  } catch (e) { console.warn('rock glb load failed', e); }
}

function buildAsteroids() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9a938c, roughness: 0.95, metalness: 0.05,
    map: texLoader.load('assets/rock/color.jpg'),
    normalMap: texLoader.load('assets/rock/normal.jpg'),
    normalScale: new THREE.Vector2(1.1, 1.1),
    emissive: 0x1a2040, emissiveIntensity: 0.25 });
  themedMats.rock = mat;
  const sizes = [1, 1.8, 3, 4.6];
  for (let i = 0; i < 42; i++) {
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    const m = new THREE.Mesh(makeFallbackRockGeo(1), mat);
    m.scale.setScalar(size);
    m.visible = false;
    m.userData = { active: false, radius: size * 1.05, vz: 0, vx: 0, vy: 0,
      rx: (Math.random() - 0.5) * 1.4, ry: (Math.random() - 0.5) * 1.4 };
    world.scene.add(m);
    world.asteroids.push(m);
  }
}

// ── enemy darts ──
function buildEnemies() {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x662233, metalness: 0.8, roughness: 0.3, flatShading: true });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 4), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.7), mat);
      w.position.set(s * 0.95, 0, 0.5);
      g.add(w);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,120,120,1)'), color: 0xff3c5a,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.4, 1.4, 1);
    glow.position.z = -1.4;
    g.add(glow);
    g.visible = false;
    g.userData = { active: false, radius: 1.5, vz: 0, vx: 0, vy: 0 };
    world.scene.add(g);
    world.enemies.push(g);
  }
}

// ── stretch gates ──
function buildGates() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd54d });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.35, 10, 40), mat));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.1, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.5 }));
    g.add(inner);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,220,120,0.9)'), color: 0xffd54d,
      transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(16, 16, 1);
    g.add(glow);
    g.visible = false;
    g.userData = { active: false, radius: 5.2, pose: null, passed: false, vz: 0 };
    world.scene.add(g);
    world.gates.push(g);
  }
}

function buildCrystals() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x4df3ff });
  themedMats.crystal = mat;
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat);
    m.visible = false;
    m.userData = { active: false, radius: 1.4, vz: 0, spin: 2 + Math.random() * 3 };
    world.scene.add(m);
    world.crystals.push(m);
  }
}

function buildPowerups() {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.18, 48, 8), mat));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.9)'), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(4, 4, 1);
    g.add(glow);
    g.visible = false;
    g.userData = { active: false, radius: 1.8, type: null, mat, glowMat: glow.material };
    world.scene.add(g);
    world.powerups.push(g);
  }
}

function buildWalls() {
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3c5a, transparent: true, opacity: 0.85 });
    for (let b = 0; b < 10; b++) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat));
    }
    g.visible = false;
    g.userData = { active: false, mat, gapAxis: 'x', gapCenter: 0, gapHalf: 3.4 };
    world.scene.add(g);
    world.walls.push(g);
  }
}

export function armWall(g, gapAxis, gapCenter) {
  const beams = g.children;
  const positions = [];
  const span = gapAxis === 'x' ? 17 : 10;
  for (let p = -span; p <= span; p += span / 4.6) positions.push(p);
  let bi = 0;
  for (const p of positions) {
    if (bi >= beams.length) break;
    if (Math.abs(p - gapCenter) < 3.6) continue;
    const beam = beams[bi++];
    beam.visible = true;
    if (gapAxis === 'x') { beam.position.set(p, 0, 0); beam.scale.set(1, 80, 1); }
    else { beam.position.set(0, p, 0); beam.scale.set(130, 1, 1); }
  }
  for (; bi < beams.length; bi++) beams[bi].visible = false;
  g.userData.gapAxis = gapAxis;
  g.userData.gapCenter = gapCenter;
  g.userData.gapHalf = 3.2;
}

function buildBoss() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a2a3a, metalness: 0.85, roughness: 0.4, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 26, 8), hull);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), hull);
    tower.position.set(s * 8, 5, 0);
    g.add(tower);
    const engine = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,90,90,1)'), color: 0xff3c5a,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    engine.scale.set(5, 5, 1);
    engine.position.set(s * 11, -1, 3);
    g.add(engine);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3c5a }));
  eye.position.set(0, 0, 6);
  g.add(eye);
  g.userData = { eye };
  g.visible = false;
  world.scene.add(g);
  world.boss = g;
}

function buildExplosion() {
  const N = 90;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffaa55, size: 0.85, map: glowTexture('rgba(255,200,140,1)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.visible = false;
  world.scene.add(pts);
  explosion = { pts, vel: new Float32Array(N * 3), t: 99 };
}

export function explodeAt(p) {
  const boom = cosmetics().boom;
  const col = boom.color === 'accent' ? themeColors().accent : boom.color;
  explosion.pts.material.color.setHex(col);
  explosion.pts.material.size = 0.85 * boom.size;
  const pos = explosion.pts.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, p.x, p.y, p.z);
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
    const sp = 4 + Math.random() * 14;
    explosion.vel[i * 3] = Math.sin(b) * Math.cos(a) * sp;
    explosion.vel[i * 3 + 1] = Math.sin(b) * Math.sin(a) * sp;
    explosion.vel[i * 3 + 2] = Math.cos(b) * sp;
  }
  pos.needsUpdate = true;
  explosion.t = 0;
  explosion.pts.visible = true;
  explosion.pts.material.opacity = 1;
}

// ── per-frame world update ──
const trail = [];
export function updateWorld(dt, speed, shipVel) {
  const ship = world.ship;
  const now = performance.now();

  trail.unshift({ x: ship.position.x, y: ship.position.y - 0.05, z: ship.position.z + 1.9 });
  if (trail.length > 60) trail.pop();
  const tp = trailGeo.attributes.position;
  for (let i = 0; i < 60; i++) {
    const s = trail[Math.min(i, trail.length - 1)] || { x: 0, y: 0, z: 99 };
    tp.setXYZ(i, s.x, s.y, s.z + i * 0.55);
  }
  tp.needsUpdate = true;

  const sp = warpStars.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let z = sp.getZ(i) + speed * dt * 1.35;
    if (z > 60) z -= 650;
    sp.setZ(i, z);
  }
  sp.needsUpdate = true;

  const dp = dust.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    let z = dp.getZ(i) + speed * dt * 1.6;
    if (z > 12) z -= 240;
    dp.setZ(i, z);
  }
  dp.needsUpdate = true;

  const flicker = 0.85 + Math.random() * 0.3;
  ship.userData.glow.scale.set(0.95 * flicker, 0.95 * flicker, 1);
  ship.userData.engineLight.intensity = 2 * flicker + speed * 0.008;

  if (rainbowTrail) {
    const hue = (now * 0.00012) % 1;
    const col = new THREE.Color().setHSL(hue, 1, 0.6);
    trailPts.material.color.copy(col);
    ship.userData.glow.material.color.copy(col);
    ship.userData.engineLight.color.copy(col);
  }

  if (world.boss.visible) {
    world.boss.position.x = Math.sin(now * 0.0004) * 6;
    world.boss.position.y = Math.cos(now * 0.0005) * 3 + 2;
    world.boss.userData.eye.scale.setScalar(1 + Math.sin(now * 0.006) * 0.25);
  }

  planet.rotation.y += dt * 0.008;

  // hyperdrive: FOV punch + shake + post uniforms
  hyperLevel += (hyperTarget - hyperLevel) * Math.min(1, dt * 5);
  const fov = 72 + hyperLevel * 16;
  if (Math.abs(fov - world.camera.fov) > 0.05) {
    world.camera.fov = fov;
    world.camera.updateProjectionMatrix();
  }
  postPass.uniforms.time.value = now * 0.001;
  postPass.uniforms.hyper.value = hyperLevel;

  const cam = world.camera;
  const shake = hyperLevel * 0.09 + camKick;
  camKick = Math.max(0, camKick - dt * 1.6);
  const targetX = ship.position.x * 0.86;
  const targetY = ship.position.y * 0.82 + 2.6;
  cam.position.x += (targetX - cam.position.x) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.y += (targetY - cam.position.y) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.z = ship.position.z + 9;
  cam.lookAt(ship.position.x * 0.5, ship.position.y * 0.5, ship.position.z - 30);
  cam.rotation.z += -shipVel.x * 0.006;

  if (explosion.t < 1.4) {
    explosion.t += dt;
    const pos = explosion.pts.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i,
        pos.getX(i) + explosion.vel[i * 3] * dt,
        pos.getY(i) + explosion.vel[i * 3 + 1] * dt,
        pos.getZ(i) + explosion.vel[i * 3 + 2] * dt + speed * dt * 0.4);
    }
    pos.needsUpdate = true;
    explosion.pts.material.opacity = Math.max(0, 1 - explosion.t / 1.4);
  } else {
    explosion.pts.visible = false;
  }
}

let camKick = 0;
export function kickCamera(strength = 0.35) { camKick = Math.min(0.8, camKick + strength); }

export function setHyper(active) { hyperTarget = active ? 1 : 0; }

export function setShieldVisual(strength) {
  shieldMat.opacity = strength * 0.4;
  world.shipShield.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.03);
}

let rainbowTrail = false;

export function applyTheme() {
  const t = THEMES[state().equippedTheme] ?? THEMES.theme_space;
  const c = t.colors;
  const cos = cosmetics();

  // skybox + environment lighting (also drives PBR reflections)
  if (currentSky !== t.sky) {
    currentSky = t.sky;
    new THREE.CubeTextureLoader()
      .setPath(`assets/sky/${t.sky}/`)
      .load(['right.jpg', 'left.jpg', 'top.jpg', 'bottom.jpg', 'front.jpg', 'back.jpg'], (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        world.scene.background = tex;
        world.scene.environment = tex;
        world.scene.backgroundIntensity = 1.0;
      });
  }

  // planet
  texLoader.load(`assets/planets/${t.planet}.jpg`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    planet.material.map = tex;
    planet.material.color.setHex(t.planetTint);
    // faint self-illumination so the night side reads instead of going black
    planet.material.emissiveMap = tex;
    planet.material.emissive.setHex(t.planetTint).multiplyScalar(0.22);
    planet.material.needsUpdate = true;
  });
  planetRing.visible = !!t.ring;
  if (t.ring && !planetRing.material.map) {
    texLoader.load('assets/planets/saturn_ring.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      planetRing.material.map = tex;
      planetRing.material.needsUpdate = true;
    });
  }

  sunLight.color.setHex(t.sun);
  keyLight.color.setHex(t.sun);

  world.scene.fog = new THREE.FogExp2(c.fog, 0.0032);
  themedMats.hull.color.setHex(c.ship);
  themedMats.rock.color.setHex(c.rock);
  themedMats.rock.emissive.setHex(c.rockEmissive);
  themedMats.crystal.color.setHex(c.accent);
  themedMats.ghost?.color.setHex(c.accent);
  rainbowTrail = cos.trail.color === 'rainbow';
  const engineCol = rainbowTrail ? c.engine : (cos.trail.color ?? c.engine);
  engineMat.color.setHex(engineCol);
  shieldMat.color.setHex(engineCol);
  world.ship.userData.glow.material.color.setHex(engineCol);
  world.ship.userData.engineLight.color.setHex(engineCol);
  trailPts.material.color.setHex(engineCol);
}

export function render() {
  world.composer.render();
}
