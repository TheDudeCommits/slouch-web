// SLOUCH — Three.js world: baked nebula skyboxes (space-3d), giant planet
// backdrop (Solar System Scope), glTF hero ships (Quaternius, CC0), PBR rocks
// (ambientCG), lensflare sun and a cinematic post stack.

import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createScenery } from './scenery.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { THEMES, themeColors, cosmetics, state, currentWorld, OCEAN_HEROES } from './state.js';
import { PACKS, loadPack, packLoaded, spawnCreature, gradientTexture, treelineTexture, buildRays } from './packs.js';

export const world = {
  inMenu:true, journeyProgress:0, reducedMotion:false, ready:null, scene: null, camera: null, renderer: null, composer: null,
  ship: null, shipShield: null,
  asteroids: [], enemies: [], gates: [], crystals: [], powerups: [], walls: [],
  boss: null,
  bounds: { x: 13, y: 7.5 },
  spawnZ: -420, killZ: 14,
  packMode: 'space',      // space | ocean | jungle
  grounded: false,
  groundY: -6.5,
  floorY: -9.5,           // scenery surface in pack worlds
  spinObstacles: true,
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
const planetTextures=new Map();
let postPass = null, scenery = null, bloomPass = null;
let modelRevision=0;

// soft caustic web pattern for the seafloor light
function causticTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.filter = 'blur(3px)';
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 2.2;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    const cx = Math.random() * 256, cy = Math.random() * 256, r = 18 + Math.random() * 34;
    for (let a = 0; a <= Math.PI * 2 + 0.3; a += 0.5) {
      const rr = r * (0.75 + Math.random() * 0.5);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const glowCache=new Map();
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const cacheKey=inner+'|'+outer;if(glowCache.has(cacheKey))return glowCache.get(cacheKey);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.5)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex=new THREE.CanvasTexture(c);tex.userData.sharedEffect=true;glowCache.set(cacheKey,tex);return tex;
}

// ── post shader: chromatic aberration, vignette, grain, hyper speed-lines ──
const PostShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    hyper: { value: 0 },
    aspect: { value: 1 },
    tint: { value: new THREE.Vector3(0.55, 0.85, 1.0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, hyper, aspect;
    uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // chromatic aberration: subtle at rest, strong in hyper
      float ca = hyper * 0.001;
      vec2 off = c * r2 * ca * 14.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // hyper speed lines: radial streaks flickering outward (world-tinted)
      if (hyper > 0.01) {
        vec2 d = vec2(c.x * aspect, c.y);
        float ang = atan(d.y, d.x);
        float streak = hash(vec2(floor(ang * 60.0), floor(time * 24.0)));
        float mask = smoothstep(0.06, 0.42, r2) * step(0.82, streak) * hyper;
        col += tint * mask * 0.5;
      }
      // vignette — gentle; heavy corners read as gloom on bright worlds
      col *= 1.0 - r2 * (0.12 - hyper * 0.05);
      // grain
      col += (hash(uv * vec2(1917.0, 1033.0) + fract(time)) - 0.5) * 0.004;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function initWorld() {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  world.renderer = renderer;

  const scene = new THREE.Scene();
  world.scene = scene;

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1400);
  camera.position.set(0, 2.6, 9);
  world.camera = camera;

  scene.add(new THREE.AmbientLight(0x8899cc, 0.55));
  scene.add(new THREE.HemisphereLight(0xbdd2ff, 0x403428, 0.9));
  keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(6, 12, 6);
  scene.add(keyLight);

  buildShip();
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
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),0.18,0.4,1.2); composer.addPass(bloomPass);
  postPass = new ShaderPass(PostShader);
  postPass.uniforms.aspect.value = innerWidth / innerHeight;
  composer.addPass(postPass); composer.addPass(new OutputPass());
  world.composer = composer;

  world.ready=Promise.all([loadRockGeometries(),loadPickupModels(),loadGateModel()]);

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
  viper: { yaw: Math.PI, length: 3.6 },
  lance: { yaw: Math.PI, length: 3.6 },
  quadra: { yaw: Math.PI, length: 3.45 },
  shadow: { yaw: Math.PI, length: 3.45 },
};

async function loadModel(name) {
  if (modelCache[name]) return modelCache[name];
  const gltf = await gltfLoader.loadAsync(`assets/ships/${name}.glb`);
  modelCache[name] = gltf.scene;
  return gltf.scene;
}

export async function loadHeroShip() {
  const revision=++modelRevision;
  if(heroShadow){heroShadow.geometry.dispose();heroShadow.material.dispose();heroShadow.removeFromParent();heroShadow=null;}
  // pack worlds use a living creature as the hero
  if (world.packMode !== 'space') {
    const pack = PACKS[world.packMode];
    const heroId = world.packMode === 'ocean'
      ? (state().oceanHero || 'hero_clown')
      : (state().jungleHero || 'hero_bunny');
    const def = pack.heroes[heroId] || Object.values(pack.heroes)[0];
    heroClipMap = def.clips || pack.heroClips;   // some heroes ride their own rig
    heroDefCur = def;
    const c = spawnCreature(world.packMode, def.file,
      { clip: heroClipMap.base, len: def.len, yaw: def.yaw, orig: true });
    if (!c) return;
    // grounded heroes: drop the model so its FEET touch the grass (the ship
    // origin rides at groundY+1.1 regardless of body height), plus a soft
    // contact shadow that welds it to the ground
    if (world.grounded) {
      c.obj.position.y = c.dims.y / 2 - 1.1;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20),
        new THREE.MeshBasicMaterial({ color: 0x0a1a08, transparent: true, opacity: 0.32, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -1.06;
      c.obj.add(shadow);
      heroShadow = shadow;
    } else {
      heroShadow = null;
    }
    // the hero is always center-frame in its own shadow — give it extra fill
    c.obj.traverse(o => {
      if (o.isMesh && o.material?.emissive && !o.material.userData.heroLit) {
        o.material = o.material.clone();o.material.userData.heroLit=true;
        o.material.emissive.copy(o.material.color).multiplyScalar(0.32);
      }
    });
    releaseChildren(shipModelRoot);
    shipModelRoot.add(c.obj);
    heroMixer = c.mixer;
    heroActions = c.actions;
    heroAction = null;
    setHeroMotion('base');
    engineFx.visible = false; // bubble trail underwater, nothing in jungle
    if (world.packMode === 'ocean') engineFx.position.set(0, 0, def.len / 2 + 0.4);
    return;
  }
  engineFx.visible = true;
  const skin = cosmetics().skin;
  const name = skin.model || 'quadra';
  try {
    const src = await loadModel(name); if(revision!==modelRevision)return;
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
    const s = 4 / Math.max(size.x,size.y,size.z,0.001);
    wrap.scale.setScalar(s);
    model.traverse(o => {
      if (o.isMesh) {
        o.material=o.material.clone();o.userData.sharedAsset=true;o.userData.ownedMaterial=true;
        o.material.metalness = Math.min(0.6, o.material.metalness ?? 0.4);
        o.material.roughness = Math.max(0.35, o.material.roughness ?? 0.6);
        o.material.envMapIntensity = 0.9;
      }
    });
    releaseChildren(shipModelRoot);
    shipModelRoot.add(wrap);
    // engine FX sits at the model's tail
    engineFx.position.set(0,0.1,(size.z*s)/2+0.25); engineFx.scale.setScalar(.55);
  } catch (e) {
    console.warn('hero ship load failed, keeping placeholder', e);
  }
}

// ── starfield + near-field dust for speed parallax ──
function buildStars() {
  const N = 500;
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
  const N = 100;
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
    world.asteroids.forEach((g, i) => {
      g.userData.rockMesh.geometry = geos[i % geos.length];
      g.userData.rockMesh.scale.setScalar(g.userData.size);
    });
  } catch (e) { console.warn('rock glb load failed', e); }
}

function buildAsteroids() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9a938c, roughness: 0.95, metalness: 0.05,
    map: texLoader.load('assets/rock/color.jpg'),
    normalMap: texLoader.load('assets/rock/normal.jpg'),
    normalScale: new THREE.Vector2(1.1, 1.1),
    emissive: 0x2a3050, emissiveIntensity: 0.8 });
  themedMats.rock = mat;
  const sizes = [1.5, 2.4, 3.6, 5.2];
  for (let i = 0; i < 64; i++) {
    const size = sizes[i%sizes.length];
    const g = new THREE.Group();
    const holder = new THREE.Group();
    const rockMesh = new THREE.Mesh(makeFallbackRockGeo(1), mat);
    rockMesh.userData.sharedAsset=true;rockMesh.scale.setScalar(size);
    holder.add(rockMesh);
    g.add(holder);
    g.visible = false;
    g.userData = { active: false, radius: size * 1.05, size, holder, rockMesh, vz: 0, vx: 0, vy: 0,
      rx: (Math.random() - 0.5) * 1.4, ry: (Math.random() - 0.5) * 1.4 };
    world.scene.add(g);
    world.asteroids.push(g);
  }
}

// ── enemy darts (holder swaps to pack creatures) ──
function makeDart() {
  const holder = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x662233, metalness: 0.8, roughness: 0.3, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 4), mat);
  body.rotation.x = Math.PI / 2;
  holder.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.7), mat);
    w.position.set(s * 0.95, 0, 0.5);
    holder.add(w);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,120,120,1)'), color: 0xff3c5a,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(1.4, 1.4, 1);
  glow.position.z = -1.4;
  holder.add(glow);
  return holder;
}

function buildEnemies() {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const holder = makeDart();
    g.add(holder);
    g.visible = false;
    g.userData = { active: false, radius: 1.5, holder, vz: 0, vx: 0, vy: 0 };
    world.scene.add(g);
    world.enemies.push(g);
  }
}

// ── stretch gates: giant sourced chevron marker pointing the pose direction ──
let gateProto = null;

async function loadGateModel() {
  try {
    const model = (await gltfLoader.loadAsync('assets/pickups/gate.glb')).scene;
    normalizeProto(model, 7.5);
    // solid glowing gold chevrons with a hot outline — readable at any distance
    model.traverse(o => {
      if (o.isMesh) {
        const bright = (o.material.color?.r ?? 0) + (o.material.color?.g ?? 0) + (o.material.color?.b ?? 0) > 2.2;
        o.material = new THREE.MeshStandardMaterial({
          color: bright ? 0xfff2cc : 0xffb02c,
          emissive: bright ? 0xffe0a0 : 0xcc7a00,
          emissiveIntensity: bright ? 0.9 : 0.8,
          metalness: 0.3, roughness: 0.4,
        });
      }
    });
    // the source arrow lies flat on the ground — stand it up to face the pilot
    const proto = new THREE.Group();
    model.rotation.x = Math.PI / 2;
    proto.add(model);
    gateProto = proto;
    for (const g of world.gates) {
      g.userData.holder.clear();
      g.userData.holder.add(proto.clone(true));
    }
  } catch (e) { console.warn('gate model load failed', e); }
}

function buildGates() {
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const holder = new THREE.Group();
    // placeholder ring until the chevron model lands
    holder.add(new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.35, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb02c })));
    g.add(holder);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,205,110,0.9)'), color: 0xffb02c,
      transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(14, 14, 1);
    g.add(glow);
    g.visible = false;
    g.userData = { active: false, radius: 5.2, pose: null, passed: false, vz: 0, holder };
    world.scene.add(g);
    world.gates.push(g);
  }
}

// orient the chevron: 'left' | 'right' | 'up' (source model points LEFT natively)
export function setGateArrow(g, dir) {
  const h = g.userData.holder;
  h.rotation.set(0, 0, { left: 0, right: Math.PI, up: -Math.PI / 2 }[dir] ?? 0);
  h.scale.setScalar(1);
}

// ── stardust: gold coins (placeholder octahedron until the glb lands) ──
function buildCrystals() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd75c });
  themedMats.crystal = mat;
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,220,120,0.9)'), color: 0xffd75c, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3.6, 3.6, 1);
    g.add(glow);
    g.visible = false;
    g.userData = { active: false, radius: 1.8, vz: 0, spin: 2 + Math.random() * 3 };
    world.scene.add(g);
    world.crystals.push(g);
  }
}

// ── power-ups: recognizable objects (magnet / hourglass / crown / star) ──
const PICKUP_MODEL = { magnet: 'magnet', focus: 'hourglass', doubler: 'crown', shard: 'star' };
const pickupProtos = {};
let coinPrototype=null;

async function loadPickupModels() {
  // coin replaces the stardust placeholder
  try {
    const coin = (await gltfLoader.loadAsync('assets/pickups/coin.glb')).scene;
    normalizeProto(coin, 1.7);
    selfIlluminate(coin, 0.65);coin.traverse(o=>{if(o.isMesh)o.userData.sharedAsset=true;});coinPrototype=coin;
    for (const c of world.crystals) {
      const old=c.children[0];c.remove(old);old.geometry?.dispose();
      const m=coin.clone(true);c.add(m);c.userData.visual=m;
    }
  } catch (e) { console.warn('coin load failed', e); }
  for (const [type, file] of Object.entries(PICKUP_MODEL)) {
    try {
      const proto = (await gltfLoader.loadAsync(`assets/pickups/${file}.glb`)).scene;
      normalizeProto(proto, type === 'shard' ? 1.5 : 2.1);
      selfIlluminate(proto, 0.6);
      pickupProtos[type] = proto;
    } catch (e) { console.warn(file, 'load failed', e); }
  }
}

// center a prototype and scale it to a target radius
function normalizeProto(obj, radius) {
  const box = new THREE.Box3().setFromObject(obj);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const s = radius / Math.max(sph.radius, 0.001);
  obj.scale.setScalar(s);
  const center = sph.center.multiplyScalar(s);
  obj.position.sub(center);
}

// pickups must read at 100+ units/s: make every material glow its own color
function selfIlluminate(obj, intensity = 0.55) {
  obj.traverse(o => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      if (o.material.emissive) {
        o.material.emissive.copy(o.material.color);
        o.material.emissiveIntensity = intensity;
      }
    }
  });
}

function buildPowerups() {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const holder = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    holder.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.7), mat)); // placeholder
    g.add(holder);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.9)'), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(6.5, 6.5, 1);
    g.add(glow);
    g.visible = false;
    g.userData = {
      active: false, radius: 2.3, type: null, mat, glowMat: glow.material,
      setType(type) {
        holder.clear();
        const proto = pickupProtos[type];
        if (proto) holder.add(proto.clone(true));
        else {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), mat);
          holder.add(m);
        }
      },
    };
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

function makeDreadnought() {
  const holder = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a2a3a, metalness: 0.85, roughness: 0.4, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 26, 8), hull);
  body.rotation.z = Math.PI / 2;
  holder.add(body);
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), hull);
    tower.position.set(s * 8, 5, 0);
    holder.add(tower);
    const engine = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,90,90,1)'), color: 0xff3c5a,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    engine.scale.set(5, 5, 1);
    engine.position.set(s * 11, -1, 3);
    holder.add(engine);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3c5a }));
  eye.position.set(0, 0, 6);
  holder.add(eye);
  holder.userData.eye = eye;
  return holder;
}

function buildBoss() {
  const g = new THREE.Group();
  const holder = makeDreadnought();
  g.add(holder);
  g.userData = { eye: holder.userData.eye, holder };
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
    const sp = 4 + Math.random() * (14+state().upgrades.hyperregen*3);
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
  trailPts.material.opacity=(world.packMode==='ocean'?.25:.4)+state().upgrades.hyperdur*.05;
  scenery?.update(dt,speed);

  trail.unshift({ x: ship.position.x, y: ship.position.y - 0.05, z: ship.position.z + 1.9 });
  if (trail.length > 60) trail.pop();
  const tp = trailGeo.attributes.position;
  for (let i = 0; i < 60; i++) {
    const s = trail[Math.min(i, trail.length - 1)] || { x: 0, y: 0, z: 99 };
    tp.setXYZ(i, s.x, s.y, s.z + i * 0.55);
  }
  tp.needsUpdate = true;

  if (warpStars.visible) {
    const sp = warpStars.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      let z = sp.getZ(i) + speed * dt * 1.35;
      if (z > 60) z -= 650;
      sp.setZ(i, z);
    }
    sp.needsUpdate = true;
  }

  // dust doubles as bubbles (ocean, rising) and fireflies (jungle, drifting)
  const dp = dust.geometry.attributes.position;
  const rise = world.packMode === 'ocean' ? 2.2 : world.packMode === 'jungle' ? 0.35 : 0;
  for (let i = 0; i < dp.count; i++) {
    let z = dp.getZ(i) + speed * dt * (world.packMode === 'space' ? 1.6 : 1.1);
    if (z > 12) z -= 240;
    dp.setZ(i, z);
    if (rise) {
      let y = dp.getY(i) + rise * dt * (0.6 + (i % 5) * 0.2);
      if (y > 14) y -= 26;
      dp.setY(i, y);
    }
  }
  dp.needsUpdate = true;

  // pack scenery: animation mixers, scrolling floor, god rays, looping decor
  for (const m of packMixers) m.update(dt);
  if (heroMixer) heroMixer.update(dt);

  // grounded hero contact: bouncing gait synced to speed + shadow that
  // shrinks when airborne — kills any sense of hovering
  if (world.grounded && shipModelRoot.children.length) {
    const heroObj = shipModelRoot.children[0];
    const onGround = ship.position.y <= world.groundY + 1.25;
    if (heroDefCur?.bounce && onGround) {
      bouncePhase += dt * (4 + speed * 0.09);
      heroObj.position.y = (heroDefCur ? heroObj.userData._baseY ?? (heroObj.userData._baseY = heroObj.position.y) : 0)
        + Math.abs(Math.sin(bouncePhase)) * 0.34;
      heroObj.rotation.x = Math.sin(bouncePhase * 2) * 0.05;
    }
    if (heroShadow) {
      const h = ship.position.y - (world.groundY + 1.1);
      heroShadow.material.opacity = Math.max(0.06, 0.32 - h * 0.03);
      const sc = Math.max(0.45, 1 - h * 0.07);
      heroShadow.scale.setScalar(sc);
      heroShadow.position.y = -1.06 - (heroObj.position.y - (heroObj.userData._baseY ?? 0));
    }
  }
  for (const tex of packEnv.scrollTexs || []) {
    tex.offset.y -= speed * dt * 0.1;   // repeat.y 120 over 1200 units = 0.1 per unit
  }
  if (packEnv.rays) {
    const base = packEnv.rays.userData.baseOpacity ?? 0.14;
    for (const r of packEnv.rays.children) {
      r.material.opacity = base + Math.abs(Math.sin(now * 0.0003 + r.userData.phase)) * base;
    }
  }
  for (const d of packEnv.decor) {
    if (d.userData.isPath) continue;
    if (d.userData.swim) {
      // background fish cruise across and loop around
      d.position.x += d.userData.swim.vx * dt;
      d.position.y += Math.sin(now * 0.001 + d.userData.swim.phase) * dt * 1.2;
      d.position.z += speed * dt * 0.25;
      if (d.position.x > 45 || d.position.z > 0) {
        d.position.set(-35 - Math.random() * 15, -6 + Math.random() * 14, -80 - Math.random() * 200);
      }
      continue;
    }
    if (d.userData.sway != null) {
      d.rotation.z = Math.sin(now * 0.0008 + d.userData.sway) * 0.07;
    }
    d.position.z += speed * dt;
    if (d.position.z > 20) {
      d.position.z -= 460;
      // Recycle in the same authored depth row.
    }
  }
  // gentle bob for static pack creatures (keeps them feeling alive)
  if (world.packMode !== 'space') {
    for (const e of world.enemies) {
      if (e.userData.active && e.userData.bob) {
        e.userData.holder.position.y = Math.sin(now * 0.004 + e.id) * 0.35;
        e.userData.holder.rotation.z = Math.sin(now * 0.003 + e.id) * 0.08;
      }
    }
    for (const a of world.asteroids) {
      if (a.userData.active && a.userData.bobFloat) {
        a.userData.holder.position.y = Math.sin(now * 0.003 + a.id) * 0.5;
      }
      if (a.userData.active && a.userData.marker) {
        a.userData.marker.material.opacity = 0.1 + Math.abs(Math.sin(now * 0.004 + a.id)) * 0.12;
      }
    }
    if (packEnv.caustics) {
      const m = packEnv.caustics.material.map;
      m.offset.x = Math.sin(now * 0.00012) * 0.3;
      m.offset.y -= speed * dt * 0.02;
    }
  }

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
    world.boss.position.y = world.grounded
      ? world.groundY + 4
      : Math.cos(now * 0.0005) * 3 + 2;
    world.boss.userData.eye?.scale.setScalar(1 + Math.sin(now * 0.006) * 0.25);
    if (!world.boss.userData.eye) {
      world.boss.userData.holder.position.y = Math.sin(now * 0.0016) * 0.8;
    }
  }

  planet.rotation.y += dt * 0.008;

  // hyperdrive: FOV punch + shake + post uniforms
  hyperLevel += (hyperTarget - hyperLevel) * Math.min(1, dt * 5);
  const fov = (innerWidth<600?64:58) + (world.reducedMotion?0:hyperLevel*4);
  if (Math.abs(fov - world.camera.fov) > 0.05) {
    world.camera.fov = fov;
    world.camera.updateProjectionMatrix();
  }
  postPass.uniforms.time.value = now * 0.001;
  postPass.uniforms.hyper.value = world.reducedMotion?0:hyperLevel;

  const cam = world.camera;
  const shake = world.reducedMotion?0:camKick*.15;
  camKick = Math.max(0, camKick - dt * 1.6);
  const targetX = ship.position.x * 0.55 + (world.inMenu && innerWidth>=900 ? -6 : 0);
  const targetY = ship.position.y * 0.8 + (world.packMode==='jungle'?4.5:4);
  cam.position.x += (targetX - cam.position.x) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.y += (targetY - cam.position.y) * Math.min(1, dt * 6) + (Math.random() - 0.5) * shake;
  cam.position.z = ship.position.z + (world.inMenu ? 14 : 16);
  cam.lookAt(ship.position.x*.35+(world.inMenu&&innerWidth>=900?-10:0),world.inMenu?ship.position.y-4:ship.position.y*.6+1,ship.position.z-28);
  // Stable horizon: head movement steers the hero, never tilts the camera.
  if(world.packMode==='ocean'&&shipModelRoot.children[0])shipModelRoot.rotation.y=world.inMenu?-.55:-.2;

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
export function kickCamera(strength = 0.35) { if(world.reducedMotion)return; camKick = Math.min(0.8, camKick + strength); }

export function setHyper(active) { hyperTarget = active ? 1 : 0; }

export function setShieldVisual(strength) {
  shieldMat.opacity = strength * 0.4;
  world.shipShield.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.03);
}

// ── hero animation control (pack worlds) ──
let heroMixer = null, heroActions = null, heroAction = null, heroClipMap = null;
let heroDefCur = null, heroShadow = null, bouncePhase = 0;

export function setHeroMotion(name) {
  if (!heroActions) return;
  const pack = PACKS[world.packMode];
  if (!pack) return;
  const clips = heroClipMap || pack.heroClips;
  const clipName = clips[name] || clips.base;
  const next = heroActions[clipName] ||
    heroActions[Object.keys(heroActions).find(k => k.includes(clipName))];
  if (!next || next === heroAction) return;
  next.reset();
  next.setLoop(name === 'jump' || name === 'land' ? THREE.LoopOnce : THREE.LoopRepeat);
  next.clampWhenFinished = true;
  next.play();
  if (heroAction) heroAction.crossFadeTo(next, 0.15, false);
  heroAction = next;
}
export function setHeroSpeed(mult) {
  if (heroMixer) heroMixer.timeScale = mult * (heroDefCur?.animSpeed ?? 1);
}

// ── pack world application ──
const packMixers = [];
const packEnv = { floor: null, rays: null, decor: [] };

function clearPackEnv() {
  scenery?.dispose(); scenery=null;
  // Generated floor/effect resources have unique ownership; cached model resources remain reusable.
  const dispose=disposeRuntime;
  if(world.scene.background?.isTexture)world.scene.background.dispose();
  world.scene.background=new THREE.Color(0xe5eadd);world.scene.environment=null;
  for(const tex of packEnv.scrollTexs||[])tex.dispose();packEnv.scrollTexs=[];packEnv.caustics=null;
  if (packEnv.lamp) { world.ship.remove(packEnv.lamp); packEnv.lamp = null; }
  for (const key of ['floor', 'rays', 'hemi']) {
    if (packEnv[key]) { dispose(packEnv[key]); world.scene.remove(packEnv[key]); packEnv[key] = null; }
  }
  for (const d of packEnv.decor) { dispose(d);world.scene.remove(d); }
  packEnv.decor = [];
  packMixers.length = 0;
}

export async function applyWorldPack(onProgress) {
  await world.ready;
  const target = currentWorld();
  if (target !== 'space' && !packLoaded(target)) {
    await loadPack(target, onProgress);
  }
  world.packMode = target;
  const pack = PACKS[target];
  world.grounded = !!pack?.grounded;
  world.groundY = pack?.groundY ?? -6.5;
  world.spinObstacles = target === 'space';
  clearPackEnv();
  heroMixer = null; heroActions = null; heroAction = null;

  if (target === 'space') {
    for(const a of world.asteroids){a.userData.radius=a.userData.size*1.05;a.userData.tall=false;a.userData.halfH=null;a.userData.anchor='free';}
    currentSky = null;
    planet.visible = true;
    sunLight.visible = true;
    warpStars.visible = true;
    trailPts.visible = true;
    world.renderer.toneMappingExposure = 1.15;
    postPass.uniforms.tint.value.set(0.55, 0.85, 1.0);
    for (const a of world.asteroids) {
      releaseChildren(a.userData.holder);
      a.userData.holder.add(a.userData.rockMesh);
      if (a.userData.marker) { a.userData.marker.material.dispose();a.remove(a.userData.marker); a.userData.marker = null; }
    }
    for (const e of world.enemies) {
      releaseChildren(e.userData.holder);
      const dart = makeDart();
      for (const ch of [...dart.children]) e.userData.holder.add(ch);
      e.userData.bob = false;
    }
    releaseChildren(world.boss.userData.holder);
    const dn = makeDreadnought();
    world.boss.userData.eye = dn.userData.eye;
    for (const ch of [...dn.children]) world.boss.userData.holder.add(ch);
    dust.material.color.setHex(0x8fb8ff);
    for (const w of world.walls) w.userData.mat.color.setHex(0xff3c5a);
    replaceCoins(coinPrototype);applyTheme();
    await loadHeroShip(); scenery=await createScenery(world,target);
    applyGraphics(); return;
  }

  trailPts.visible = target !== 'jungle';
  if(target==='ocean'){trailPts.material.color.setHex(0xd5ede1);trailPts.material.size=.13;trailPts.material.opacity=.25+state().upgrades.hyperdur*.05;}else{trailPts.material.size=.2;trailPts.material.opacity=.4+state().upgrades.hyperdur*.1;}

  const env = pack.env;
  world.renderer.toneMappingExposure = env.exposure ?? 1.25;
  const ac = new THREE.Color(env.accent);
  postPass.uniforms.tint.value.set(ac.r, ac.g, ac.b);
  shieldMat.color.setHex(env.accent);
  world.ship.userData.glow.material.color.setHex(env.accent);
  world.ship.userData.engineLight.color.setHex(env.accent);
  world.scene.background = gradientTexture(env.bg);
  keyLight.color.setHex(target==='jungle'?0xffedd4:0xf3fff4); keyLight.intensity=2.5;
  world.scene.environment = null;
  world.scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
  planet.visible = false; planetRing.visible = false;
  sunLight.visible = false; warpStars.visible = false;
  dust.material.color.setHex(env.particle);

  const floorTex = texLoader.load(pack.base + env.floor);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(5,40);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  // Flat contact surface keeps every rooted model on the actual seabed.
  const floorGeo=new THREE.PlaneGeometry(140,1200);
  const floor = new THREE.Mesh(floorGeo,
    new THREE.MeshStandardMaterial({ map: target==='ocean'?null:floorTex, color: env.floorTint, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, env.floorY, -400);
  world.scene.add(floor);
  packEnv.floor = floor;
  packEnv.scrollTexs = [floorTex];

  // animated caustic light dancing on the sand
  if (env.dunes) {
    const caus = new THREE.Mesh(new THREE.PlaneGeometry(140, 1200),
      new THREE.MeshBasicMaterial({ map: causticTexture(), color: 0xbfefff, transparent: true,
        opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    caus.material.map.wrapS = caus.material.map.wrapT = THREE.RepeatWrapping;
    caus.material.map.repeat.set(9, 80);
    caus.rotation.x = -Math.PI / 2;
    caus.position.set(0, env.floorY + 2.1, -400);
    world.scene.add(caus);
    packEnv.decor.push(caus);
    caus.userData.isPath = true;
    packEnv.caustics = caus;

    // scattered sand-worn stones break up the plain
    if (rockGeos) {
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd8c49c, roughness: 1 });
      for (let i = 0; i < 16; i++) {
        const stone = new THREE.Mesh(rockGeos[i % rockGeos.length], stoneMat);
        const s = 0.5 + Math.random() * 1.6;
        stone.scale.setScalar(s);
        stone.position.set((Math.random() - 0.5) * 60, env.floorY + s * 0.45, -20 - i * 27);
        stone.rotation.y = Math.random() * Math.PI * 2;
        world.scene.add(stone);
        packEnv.decor.push(stone);
      }
    }
  }

  const rays = buildRays(env.ray);
  rays.userData.baseOpacity = env.rayOpacity ?? 0.14;
  world.scene.add(rays);
  packEnv.rays = rays;

  // pack lighting: bright hemisphere + warm sun so nothing reads gloomy
  const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2]);
  world.scene.add(hemi);
  packEnv.hemi = hemi;

  // soft lamp travelling with the hero — keeps the near ground lively
  const lamp = new THREE.PointLight(env.hemi[0], 1.6, 46, 1.6);
  lamp.position.set(0, 7, -6);
  world.ship.add(lamp);
  packEnv.lamp = lamp;

  // dense roadside scenery in depth rows, every base EXACTLY on the surface,
  // stood perfectly vertical, with gentle per-prop color variation for lushness
  const decorCount = 0; // scenery.js owns the authored route rows.
  for (let i = 0; i < decorCount; i++) {
    const file = pack.decor[i % pack.decor.length];
    const big = i % 5 === 0;
    const c = spawnCreature(target, file, { len: big ? 12 + Math.random() * 5 : 4.5 + Math.random() * 6 });
    if (!c) continue;
    // hue/lightness jitter so scenery never looks copy-pasted; reefs get a
    // wider rainbow spread than forests
    const hueSpread = target === 'ocean' ? 0.22 : 0.05;
    c.obj.traverse(o => {
      if (o.isMesh && o.material?.color) {
        o.material = o.material.clone();
        o.material.color.offsetHSL((Math.random() - 0.5) * hueSpread, 0.03, -0.04 + (Math.random() - 0.5) * 0.1);
        // scenery stays soft so glowing OBSTACLES are the loud things
        o.material.emissive?.copy(o.material.color).multiplyScalar(0.1);
      }
    });
    const side = i % 2 === 0 ? -1 : 1;
    const nearRow = i % 4 < 2;
    c.obj.position.set(
      side * (nearRow ? 15 + Math.random() * 6 : 25 + Math.random() * 13),
      env.floorY + c.dims.y / 2,             // base on the surface — never floats
      -20 - i * (440 / decorCount));
    c.obj.rotation.y = Math.random() * Math.PI * 2;
    c.obj.userData.sway = env.sway ? Math.random() * Math.PI * 2 : null;
    world.scene.add(c.obj);
    packEnv.decor.push(c.obj);
  }

  // worn dirt path under the runner
  if (env.path) {
    const strip=document.createElement('canvas');strip.width=256;strip.height=4;const ctx=strip.getContext('2d');const edge=ctx.createLinearGradient(0,0,256,0);for(const [at,col]of [[0,'#000'],[.15,'#fff'],[.85,'#fff'],[1,'#000']])edge.addColorStop(at,col);ctx.fillStyle=edge;ctx.fillRect(0,0,256,4);const pathTex=new THREE.CanvasTexture(strip);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(22,1200),
      new THREE.MeshStandardMaterial({color:0xc7ad78,roughness:1,alphaMap:pathTex,transparent:true,depthWrite:false}));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, env.floorY + 0.05, -400);
    world.scene.add(path);
    packEnv.decor.push(path);
    path.userData.isPath = true;

  }

  // ocean surface: a glowing sheet of light overhead, seen from below
  if (env.surface) {
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(400, 1200),
      new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    surf.rotation.x = Math.PI / 2;
    surf.position.set(0, 16, -400);
    world.scene.add(surf);
    packEnv.decor.push(surf);
    surf.userData.isPath = true; // static — excluded from the scroll loop
  }

  // ocean ambience: schools of small fish cruising the background
  if (env.swimmers) {
    for (let i = 0; i < (env.swimmerCount ?? 7); i++) {
      const file = env.swimmers[i % env.swimmers.length];
      const c = spawnCreature(target, file, { clip: 'Swimming_Normal', len: 1.6 + Math.random() * 1.8, yaw: Math.PI / 2 });
      if (!c) continue;
      c.obj.position.set(-30 - Math.random() * 20, -6 + Math.random() * 14, -60 - Math.random() * 220);
      c.obj.userData.swim = { vx: 3 + Math.random() * 3, phase: Math.random() * Math.PI * 2 };
      world.scene.add(c.obj);
      packEnv.decor.push(c.obj);
      if (c.mixer) packMixers.push(c.mixer);
    }
  }

  world.floorY = env.floorY;
  for (const a of world.asteroids) {
    const def = pack.obstacles[world.asteroids.indexOf(a)%pack.obstacles.length];
    const size = a.userData.size;
    const c = spawnCreature(target, def.file, def.tall
      ? { len: size * 2.6 } : { r: def.low ? Math.min(size, 2.3) * 0.75 : size });
    releaseChildren(a.userData.holder);
    a.userData.holder.add(c ? c.obj : a.userData.rockMesh); // never an invisible collider
    a.userData.tall = !!def.tall;
    a.userData.low = !!def.low;
    a.userData.anchor = def.anchor || (pack.grounded ? 'floor' : 'free');
    a.userData.halfH = c ? c.dims.y / 2 : a.userData.radius;
    a.userData.radius=size*1.05;
    if (def.low && c) a.userData.radius = Math.min(size, 2.3) * 0.8; // hop-able
    a.userData.bobFloat = !!def.bob;
    // danger marker: a pulsing warm halo — the universal "this one hurts" cue
    if (a.userData.marker) { a.userData.marker.material.dispose();a.remove(a.userData.marker); a.userData.marker = null; }
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,120,110,0.85)'), color: env.danger ?? 0xff5470,
      transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    mk.scale.setScalar(Math.max(2.8, a.userData.radius * 2.1));
    mk.position.y = a.userData.anchor === 'free' ? 0 : -a.userData.halfH * 0.35;
    a.add(mk);
    a.userData.marker = mk;
  }

  for (const e of world.enemies) {
    const def = pack.enemies[world.enemies.indexOf(e)%pack.enemies.length];
    const c = spawnCreature(target, def.file, { clip: def.clip, len: def.len, yaw: def.yaw });
    releaseChildren(e.userData.holder);
    if (c) {
      e.userData.holder.add(c.obj);
      if (c.mixer) packMixers.push(c.mixer);
      e.userData.halfH = c.dims.y / 2;
    } else {
      const dart = makeDart();
      for (const ch of [...dart.children]) e.userData.holder.add(ch);
      e.userData.halfH = 1.2;
    }
    e.userData.bob = !!(c && def.bob);
  }

  const b = spawnCreature(target, pack.boss.file, { len: pack.boss.len, yaw: pack.boss.yaw });
  if (b) {
    releaseChildren(world.boss.userData.holder);
    world.boss.userData.holder.add(b.obj);
    world.boss.userData.eye = null;
    if (b.mixer) packMixers.push(b.mixer);
  }

  const pickup=pack.coin?spawnCreature(target,pack.coin.file,{r:pack.coin.r})?.obj:coinPrototype;
  replaceCoins(pickup);

  for (const w of world.walls) w.userData.mat.color.setHex(pack.wallColor);

  await loadHeroShip(); scenery=await createScenery(world,target);
  applyGraphics();
}

let rainbowTrail = false;

// Pick a fresh sky variant + planet arrangement. Called on theme change AND at
// the start of every run so the belt never looks the same twice.
export function randomizeBackdrop() {
  if (world.packMode !== 'space') return;
  const t = THEMES[state().equippedTheme] ?? THEMES.theme_space;

  const skyList = t.sky;
  const sky = skyList[0];
  if (currentSky !== sky) {
    currentSky = sky;
    new THREE.CubeTextureLoader()
      .setPath(`assets/sky/${sky}/`)
      .load(['right.jpg', 'left.jpg', 'top.jpg', 'bottom.jpg', 'front.jpg', 'back.jpg'], (tex) => {
        if(world.packMode!=='space'||currentSky!==sky){tex.dispose();return;}
        tex.colorSpace = THREE.SRGBColorSpace;
        world.scene.background = tex;
        world.scene.environment = tex;
        world.scene.backgroundIntensity = 1.0;
      });
  }

  const pick = t.planets[0]||'saturn';
  if (!pick) {
    planet.visible = false;
    planetRing.visible = false;
  } else {
    planet.visible = true;
    const side = 1;
    const scale = 1.05;
    planet.scale.setScalar(scale);
    planet.position.set(180,80,-750);
    planet.rotation.z = (Math.random() - 0.5) * 0.6;
    const applyPlanet=(tex)=>{
      tex.colorSpace = THREE.SRGBColorSpace;
      planet.material.map = tex;
      planet.material.color.setHex(0xffffff);
      // faint self-illumination so the night side reads instead of going black
      planet.material.emissiveMap = tex;
      planet.material.emissive.setHex(0xffffff).multiplyScalar(0.22);
      planet.material.needsUpdate = true;
    };
    if(!planetTextures.has(pick)){const tex=texLoader.load(`assets/planets/${pick}.jpg`);tex.colorSpace=THREE.SRGBColorSpace;planetTextures.set(pick,tex);}
    applyPlanet(planetTextures.get(pick));
    planetRing.visible = pick === 'saturn';
    if (planetRing.visible) {
      planetRing.position.copy(planet.position);
      planetRing.scale.setScalar(scale);
      planetRing.rotation.set(Math.PI / 2.35 + (Math.random() - 0.5) * 0.3, 0.25, 0);
      if (!planetRing.material.map) {
        texLoader.load('assets/planets/saturn_ring.png', (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          planetRing.material.map = tex;
          planetRing.material.needsUpdate = true;
        });
      }
    }
    // the sun flare hangs on the opposite side of the planet
    sunLight.position.set(-side * (350 + Math.random() * 200), 180 + Math.random() * 160, -1100);
  }
}

export function applyTheme() {
  if (world.packMode !== 'space') return; // palettes only style the space world
  const t = THEMES[state().equippedTheme] ?? THEMES.theme_space;
  const c = t.colors;
  const cos = cosmetics();

  randomizeBackdrop();

  sunLight.color.setHex(t.sun);
  keyLight.color.setHex(t.sun);

  world.scene.fog = new THREE.FogExp2(c.fog, 0.0025);
  themedMats.hull.color.setHex(c.ship);
  themedMats.rock.color.setHex(c.rock);
  themedMats.rock.emissive.setHex(c.rockEmissive);
  rainbowTrail = cos.trail.color === 'rainbow';
  const engineCol = rainbowTrail ? c.engine : (cos.trail.color ?? c.engine);
  engineMat.color.setHex(engineCol);
  shieldMat.color.setHex(engineCol);
  world.ship.userData.glow.material.color.setHex(engineCol);
  world.ship.userData.engineLight.color.setHex(engineCol);
  trailPts.material.color.setHex(engineCol);
}

export function render() {
  world.renderer.info.autoReset=false; world.renderer.info.reset();
  world.composer.render();
  world.performance={calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,textures:world.renderer.info.memory.textures,geometries:world.renderer.info.memory.geometries};
}

export function applyGraphics() {
  const settings=state().settings;
  world.reducedMotion=settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.toggle('reduced-motion',world.reducedMotion);
  const low=settings.quality==='low';
  const ratio=low?1:Math.min(devicePixelRatio,settings.quality==='high'?2:1.5);
  world.renderer.setPixelRatio(ratio);world.renderer.setSize(innerWidth,innerHeight);
  world.composer.setPixelRatio(ratio);world.composer.setSize(innerWidth,innerHeight);
  bloomPass.enabled=!low;
  dust.visible=!low;
}

function replaceCoins(proto){if(!proto)return;for(const c of world.crystals){if(c.userData.visual)c.remove(c.userData.visual);const model=proto.clone(true);c.add(model);c.userData.visual=model;}}
function disposeRuntime(root){root?.traverse(o=>{
 if(!o.isMesh&&!o.isSprite)return;
 if(o.isSkinnedMesh&&o.userData.ownedSkeleton)o.skeleton.dispose();
 if(!o.userData.sharedAsset&&!o.userData.sharedGeometry)o.geometry?.dispose();
 if(!o.userData.sharedAsset||o.userData.ownedMaterial){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m)continue;for(const key of ['map','alphaMap','normalMap'])if(m[key]&&!m[key].userData.sharedEffect&&!o.userData.sharedAsset)m[key].dispose();m.dispose();}}
});}
function releaseChildren(root){for(const c of [...root.children]){disposeRuntime(c);root.remove(c);}}
