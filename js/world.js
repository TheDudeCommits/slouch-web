// SLOUCH — Three.js world: rear chase camera, procedural ship, asteroid belt,
// enemy ships, stretch gates, nebula and starfield. All geometry is generated
// at runtime — no downloaded assets.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { themeColors, cosmetics } from './state.js';

export const world = {
  scene: null, camera: null, renderer: null, composer: null,
  ship: null, shipShield: null, ghostShip: null,
  asteroids: [], enemies: [], gates: [], crystals: [], powerups: [], walls: [],
  boss: null,
  bounds: { x: 13, y: 7.5 },
  spawnZ: -420, killZ: 14,
};

export const POWERUP_TYPES = {
  magnet: { color: 0xffd54d, label: '🧲 MAGNET' },
  focus: { color: 0x8ab8ff, label: '🕰 FOCUS' },
  doubler: { color: 0xff5ce0, label: '×2 SCORE' },
};

let engineMat, trailPts, trailGeo, shieldMat, warpStars;
let hyperLevel = 0, hyperTarget = 0;
let nebulaSprites = [];
let explosion = null;
let themedMats = {};

// ── helpers ──
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
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function initWorld() {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  world.renderer = renderer;

  const scene = new THREE.Scene();
  world.scene = scene;

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 700);
  camera.position.set(0, 2.6, 9);
  world.camera = camera;

  scene.add(new THREE.AmbientLight(0x8899cc, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(6, 12, 6);
  scene.add(key);

  buildShip();
  buildGhostShip();
  buildStars();
  buildNebula();
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.75, 0.65, 0.72);
  composer.addPass(bloom);
  world.composer = composer;

  applyTheme();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
}

// ── ship: low-poly interceptor from primitives ──
function buildShip() {
  const ship = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.75, roughness: 0.3, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x232a44, metalness: 0.85, roughness: 0.35, flatShading: true });
  engineMat = new THREE.MeshBasicMaterial({ color: 0x4df3ff });
  themedMats.hull = hullMat;

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.1;
  ship.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.8, 6), hullMat);
  body.rotation.x = -Math.PI / 2;
  body.position.z = 0.9;
  ship.add(body);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x24e0ff, metalness: 0.2, roughness: 0.1, emissive: 0x0a6a80 }));
  canopy.scale.set(1, 0.7, 1.6);
  canopy.position.set(0, 0.38, 0.35);
  ship.add(canopy);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.1), darkMat);
    wing.position.set(side * 1.15, -0.08, 0.9);
    wing.rotation.z = side * 0.28;
    ship.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.7), engineMat);
    tip.position.set(side * 2.1, 0.16, 0.95);
    tip.rotation.z = side * 0.28;
    ship.add(tip);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.9), darkMat);
  fin.position.set(0, 0.5, 1.35);
  ship.add(fin);

  // engine glow sprite + light
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(120,240,255,1)'), color: 0x4df3ff,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.6, 1.6, 1);
  glow.position.set(0, 0, 2.0);
  ship.add(glow);
  ship.userData.glow = glow;

  const light = new THREE.PointLight(0x4df3ff, 2.2, 18);
  light.position.set(0, 0.4, 2.2);
  ship.add(light);
  ship.userData.engineLight = light;

  // shield bubble (tuck shield)
  shieldMat = new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 14), shieldMat);
  ship.add(shield);
  world.shipShield = shield;

  // engine trail (line of fading points behind ship)
  const N = 60;
  trailGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  trailPts = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    color: 0x4df3ff, size: 0.5, map: glowTexture('rgba(160,250,255,1)'),
    transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  world.scene.add(trailPts);

  world.scene.add(ship);
  world.ship = ship;
}

// ── ghost ship: translucent replay of your best run ──
function buildGhostShip() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false });
  themedMats.ghost = mat;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 6), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.1;
  g.add(nose);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.8, 6), mat);
  body.rotation.x = -Math.PI / 2;
  body.position.z = 0.9;
  g.add(body);
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

// ── power-ups: spinning torus-knot pickups with a glow halo ──
function buildPowerups() {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.18, 48, 8), mat);
    g.add(knot);
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

// ── laser walls: fences of beams with one gap, spawned by sectors & the boss ──
function buildWalls() {
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3c5a, transparent: true, opacity: 0.85 });
    // 10 beams; unused ones are hidden per-spawn depending on gap position
    for (let b = 0; b < 10; b++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat);
      g.add(beam);
    }
    g.visible = false;
    g.userData = { active: false, mat, gapAxis: 'x', gapCenter: 0, gapHalf: 3.4 };
    world.scene.add(g);
    world.walls.push(g);
  }
}

// Arrange a wall's beams as a fence perpendicular to `axis` with a gap at gapCenter.
export function armWall(g, gapAxis, gapCenter) {
  const beams = g.children;
  const positions = [];
  const span = gapAxis === 'x' ? 17 : 10; // fence extent along the gap axis
  for (let p = -span; p <= span; p += span / 4.6) positions.push(p);
  let bi = 0;
  for (const p of positions) {
    if (bi >= beams.length) break;
    if (Math.abs(p - gapCenter) < 3.6) continue; // the gap
    const beam = beams[bi++];
    beam.visible = true;
    if (gapAxis === 'x') { // vertical beams, dodge along x
      beam.position.set(p, 0, 0);
      beam.scale.set(1, 80, 1);
    } else {               // horizontal beams, dodge along y
      beam.position.set(0, p, 0);
      beam.scale.set(130, 1, 1);
    }
  }
  for (; bi < beams.length; bi++) beams[bi].visible = false;
  // hidden beams left as-is; only re-armed ones show
  g.userData.gapAxis = gapAxis;
  g.userData.gapCenter = gapCenter;
  g.userData.gapHalf = 3.2;
}

// ── boss: the mining dreadnought ──
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

// ── starfield tube that wraps around the flight path ──
function buildStars() {
  const N = 1600;
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
    color: 0xcfe4ff, size: 0.7, transparent: true, opacity: 0.9, sizeAttenuation: true }));
  world.scene.add(warpStars);
}

function buildNebula() {
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.8)'), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    const a = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 90;
    s.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.6, -180 - Math.random() * 350);
    const sc = 120 + Math.random() * 160;
    s.scale.set(sc, sc, 1);
    nebulaSprites.push(s);
    world.scene.add(s);
  }
}

// ── asteroids: displaced icosahedra, pooled ──
function makeRockGeo(size) {
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

function buildAsteroids() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8fa0, roughness: 0.95, metalness: 0.1,
    flatShading: true, emissive: 0x1a2040, emissiveIntensity: 0.35 });
  themedMats.rock = mat;
  const geos = [makeRockGeo(1), makeRockGeo(1.8), makeRockGeo(3), makeRockGeo(4.6)];
  for (let i = 0; i < 42; i++) {
    const gi = Math.floor(Math.random() * geos.length);
    const m = new THREE.Mesh(geos[gi], mat);
    m.visible = false;
    m.userData = { active: false, radius: [1, 1.8, 3, 4.6][gi] * 1.05, vz: 0, vx: 0, vy: 0,
      rx: (Math.random() - 0.5) * 1.4, ry: (Math.random() - 0.5) * 1.4 };
    world.scene.add(m);
    world.asteroids.push(m);
  }
}

// ── enemy ships: aggressive darts that strafe across lanes ──
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

// ── stretch gates: golden rings that demand a held pose ──
function buildGates() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd54d });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.35, 10, 40), mat);
    g.add(ring);
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

// ── stardust crystals: small pickups worth points ──
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

// ── explosion particles ──
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

// ── per-frame world update (visual-only pieces) ──
const trail = [];
export function updateWorld(dt, speed, shipVel) {
  const ship = world.ship;

  // trail
  trail.unshift({ x: ship.position.x, y: ship.position.y - 0.05, z: ship.position.z + 1.9 });
  if (trail.length > 60) trail.pop();
  const tp = trailGeo.attributes.position;
  for (let i = 0; i < 60; i++) {
    const s = trail[Math.min(i, trail.length - 1)] || { x: 0, y: 0, z: 99 };
    tp.setXYZ(i, s.x, s.y, s.z + i * 0.55);
  }
  tp.needsUpdate = true;

  // stars stream past
  const sp = warpStars.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let z = sp.getZ(i) + speed * dt * 1.35;
    if (z > 60) z -= 650;
    sp.setZ(i, z);
  }
  sp.needsUpdate = true;

  // engine pulse
  const flicker = 0.85 + Math.random() * 0.3;
  ship.userData.glow.scale.set(1.6 * flicker, 1.6 * flicker, 1);
  ship.userData.engineLight.intensity = 2 * flicker + speed * 0.008;

  // prism trail cycles the full spectrum
  if (rainbowTrail) {
    const hue = (performance.now() * 0.00012) % 1;
    const col = new THREE.Color().setHSL(hue, 1, 0.6);
    trailPts.material.color.copy(col);
    ship.userData.glow.material.color.copy(col);
    ship.userData.engineLight.color.copy(col);
  }

  // boss idle motion
  if (world.boss.visible) {
    world.boss.position.x = Math.sin(performance.now() * 0.0004) * 6;
    world.boss.position.y = Math.cos(performance.now() * 0.0005) * 3 + 2;
    world.boss.userData.eye.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.25);
  }

  // hyperdrive: FOV punch + subtle shake
  hyperLevel += (hyperTarget - hyperLevel) * Math.min(1, dt * 5);
  const fov = 72 + hyperLevel * 16;
  if (Math.abs(fov - world.camera.fov) > 0.05) {
    world.camera.fov = fov;
    world.camera.updateProjectionMatrix();
  }

  // camera chase with lag + banking
  const cam = world.camera;
  const shake = hyperLevel * 0.09;
  const targetX = ship.position.x * 0.86;
  const targetY = ship.position.y * 0.82 + 2.6;
  cam.position.x += (targetX - cam.position.x) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.y += (targetY - cam.position.y) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.z = ship.position.z + 9;
  cam.lookAt(ship.position.x * 0.5, ship.position.y * 0.5, ship.position.z - 30);
  cam.rotation.z += -shipVel.x * 0.006;

  // explosion
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

export function setHyper(active) { hyperTarget = active ? 1 : 0; }

export function setShieldVisual(strength) {
  shieldMat.opacity = strength * 0.4;
  world.shipShield.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.03);
}

let rainbowTrail = false;

export function applyTheme() {
  const c = themeColors();
  const cos = cosmetics();
  world.scene.fog = new THREE.FogExp2(c.fog, 0.0052);
  world.renderer.setClearColor(c.fog);
  themedMats.hull.color.setHex(cos.skin.color ?? c.ship);
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
  nebulaSprites.forEach((s, i) => s.material.color.setHex(i % 2 ? c.nebula1 : c.nebula2));
}

export function render() {
  world.composer.render();
}
