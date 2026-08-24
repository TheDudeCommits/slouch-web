// SLOUCH — expansion world packs (Ocean, Jungle). Nothing here loads until the
// pack is owned and equipped: the base game ships Space only. Each manifest
// lists lazy-fetched glbs (poly.pizza community models, credits in
// assets/ATTRIBUTION.txt) plus environment parameters.
//
// ── PLACEMENT PHYSICS — every world obeys its own rules ─────────────────────
// SPACE  zero gravity: everything free-floats and tumbles anywhere in the
//        corridor. The only world where obstacles may spin on all axes.
// JUNGLE ground world: EVERY object stands vertical with its base exactly on
//        the grass (trees, logs, stumps, snakes, predators, boss). Nothing
//        floats, nothing tilts. Vertical play = ballistic jumps only.
// OCEAN  seabed world: corals, kelp and urchins grow straight up from the
//        sand (anchor:'floor'); only things that can swim float mid-water
//        (pufferfish, predators, background fish, the whale). No tilt.
// Placement uses each spawned model's REAL measured height (halfH) so bases
// sit exactly on the surface — never radius approximations.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const gltfLoader = new GLTFLoader();

// Per-world voice: every string the player sees adapts to the world.
export const WORLD_TEXT = {
  space: {
    hyper: 'HYPERDRIVE', retry: 'FLY AGAIN', death: 'SHIP DOWN',
    bossIn: 'DREADNOUGHT INBOUND', bossTag: 'DREADNOUGHT', bossClear: 'DREADNOUGHT CLEARED',
    smash: 'SMASH', breach: 'WALL BREACH', thread: 'THREADED', gate: 'STRETCH GATE',
    coinHint: 'STARDUST — buy upgrades in the store', gateHint: 'GOLD RING — HOLD THE POSE TO OPEN IT',
    hyperHint: 'GLIDE YOUR CHIN STRAIGHT BACK = HYPERDRIVE',
  },
  ocean: {
    hyper: 'RIPTIDE', retry: 'SWIM AGAIN', death: 'WASHED OUT',
    bossIn: 'THE GREAT WHALE APPROACHES', bossTag: 'GREAT WHALE', bossClear: 'WHALE OUTSWUM',
    smash: 'SPLASH', breach: 'KELP BREAK', thread: 'THREADED', gate: 'STRETCH RING',
    coinHint: 'COINS — buy upgrades in the store', gateHint: 'GOLD RING — HOLD THE POSE TO OPEN IT',
    hyperHint: 'CHIN BACK = RIPTIDE BOOST',
  },
  jungle: {
    hyper: 'SUPERHOP', retry: 'HOP AGAIN', death: 'BUNNY DOWN',
    bossIn: 'BEAR CHARGE INCOMING', bossTag: 'THE BEAR', bossClear: 'BEAR OUTRUN',
    smash: 'THUMP', breach: 'VINE BREAK', thread: 'THREADED', gate: 'STRETCH ARCH',
    coinHint: 'CARROTS — buy upgrades in the store', gateHint: 'GOLD ARCH — HOLD THE POSE TO OPEN IT',
    hyperHint: 'CHIN BACK = SUPERHOP', jumpHint: 'CHIN UP = JUMP',
  },
};

export const PACKS = {
  ocean: {
    base: 'assets/packs/ocean/',
    grounded: false,
    env: {
      // bright tropical reef, not the abyss
      bg: ['#b8f0fa', '#5fd0ea', '#1e9ac4', '#0a6a92'],
      fogColor: 0x3fb0d4, fogDensity: 0.0044,
      floor: 'floor.jpg', floorTint: 0xffF8e0, floorY: -9.5,
      ray: 0xffffff, rayOpacity: 0.14, particle: 0xe8fbff, accent: 0x3fd4ff,
      hemi: [0xf0ffff, 0x3a7a90, 1.5],
      exposure: 1.24,
      decorCount: 36, sway: true, surface: true, swimmerCount: 13,
      swimmers: ['hero_tang.glb', 'hero_mandarin.glb', 'hero_clown.glb'],
    },
    heroes: {
      hero_clown: { file: 'hero_clown.glb', len: 3.6, yaw: Math.PI },
      hero_tang: { file: 'hero_tang.glb', len: 3.4, yaw: Math.PI },
      hero_mandarin: { file: 'hero_mandarin.glb', len: 3.6, yaw: Math.PI },
    },
    heroClips: { base: 'Swimming_Normal', fast: 'Swimming_Fast' },
    obstacles: [
      { file: 'coral1.glb', anchor: 'floor', tall: true },
      { file: 'coral2.glb', anchor: 'floor', tall: true },
      { file: 'coral3.glb', anchor: 'floor', tall: true },
      { file: 'urchin.glb', anchor: 'floor', low: true },
      { file: 'puffer.glb', anchor: 'free', bob: true },   // floaters guard the upper water
      { file: 'puffer.glb', anchor: 'free', bob: true },
      { file: 'octo1.glb', anchor: 'free', bob: true },
      { file: 'octo2.glb', anchor: 'free', bob: true },
      { file: 'kelp.glb', anchor: 'floor', tall: true },
    ],
    enemies: [
      { file: 'shark.glb', len: 6.5, yaw: 0, clip: null },
      { file: 'shark2.glb', len: 6.5, yaw: 0, clip: 'Swim' },
      { file: 'angler.glb', len: 4.5, yaw: 0, clip: 'Swimming_Normal' },
      { file: 'octo1.glb', len: 4, yaw: 0, clip: null, bob: true },
      { file: 'octo2.glb', len: 4.5, yaw: 0, clip: null, bob: true },
    ],
    boss: { file: 'whale.glb', len: 30, yaw: 0 },
    decor: ['coral1.glb', 'coral2.glb', 'coral3.glb'],   // coral only on the seabed
    coin: null,   // keeps the gold coin
    wallColor: 0x2fae72,   // kelp-green energy fences
  },
  jungle: {
    base: 'assets/packs/jungle/',
    grounded: true,
    groundY: -6.5,
    env: {
      // pleasant storybook daylight: readable, lush, never blinding
      bg: ['#9fd8f2', '#cfeab8', '#9cd478', '#6fbc60'],
      treeline: true,
      fogColor: 0x9fcc80, fogDensity: 0.0026,
      floor: 'floor.jpg', floorTint: 0xf0ffb8, floorY: -7.2,
      ray: 0xfff6d0, rayOpacity: 0.07, particle: 0xffe9a0, accent: 0x7ddf4a,
      hemi: [0xfff4d0, 0x5a8a3a, 1.4],
      exposure: 1.18,
      decorCount: 30, path: true,
    },
    heroes: {
      hero_bunny: { file: 'hero_bunny.glb', len: 2.6, yaw: Math.PI },
    },
    heroClips: { base: 'Run', fast: 'Run', jump: 'Jump_Idle', land: 'Jump_Land', duck: 'Duck' },
    obstacles: [
      { file: 'tree1.glb', tall: true }, { file: 'tree2.glb', tall: true },
      { file: 'tree3.glb', tall: true }, { file: 'tree4.glb', tall: true },
      { file: 'log.glb', low: true }, { file: 'stump.glb', low: true },
      { file: 'snake.glb', low: true },
    ],
    enemies: [
      { file: 'wolf.glb', len: 4.5, yaw: 0, clip: 'Gallop', grounded: true },
      { file: 'tiger.glb', len: 5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'jaguar.glb', len: 4.5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'cheetah.glb', len: 4.5, yaw: 0, clip: null, grounded: true, bob: true },
      { file: 'lion.glb', len: 5, yaw: 0, clip: null, grounded: true, bob: true },
    ],
    boss: { file: 'bear.glb', len: 18, yaw: 0 },
    decor: ['tree1.glb', 'tree2.glb', 'tree3.glb', 'tree4.glb', 'palms.glb'],
    coin: { file: 'carrot.glb', r: 1.6 },
    wallColor: 0x8a5a2a,   // vine-brown fences
  },
};

// ── loading (cached per pack) ──
const loaded = {};   // packId -> { protos: {file -> {scene, clips}}, }

export function packLoaded(id) { return !!loaded[id]; }

export async function loadPack(id, onProgress) {
  if (loaded[id]) return loaded[id];
  const pack = PACKS[id];
  const files = new Set();
  Object.values(pack.heroes).forEach(h => files.add(h.file));
  pack.obstacles.forEach(o => files.add(o.file));
  pack.enemies.forEach(e => files.add(e.file));
  files.add(pack.boss.file);
  pack.decor.forEach(f => files.add(f));
  if (pack.coin) files.add(pack.coin.file);

  const protos = {};
  let done = 0;
  for (const f of files) {
    try {
      const g = await gltfLoader.loadAsync(pack.base + f);
      // measure ONCE on the freshly loaded scene — skeleton clones can measure
      // wrong, so every clone reuses these reference bounds
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      protos[f] = {
        scene: g.scene, clips: g.animations,
        size: box.getSize(new THREE.Vector3()),
        center: box.getCenter(new THREE.Vector3()),
        radius: box.getBoundingSphere(new THREE.Sphere()).radius,
      };
    } catch (e) { console.warn('pack file failed', f, e); }
    done++;
    onProgress?.(done / files.size);
  }
  loaded[id] = { protos };
  return loaded[id];
}

// center + scale a proto so its longest axis == len (or bounding radius == r)
export function normalizeBy(obj, { len = null, r = null }) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const s = len ? len / Math.max(size.x, size.y, size.z, 0.001) : r / Math.max(sph.radius, 0.001);
  obj.scale.setScalar(s);
  const center = sph.center.multiplyScalar(s);
  obj.position.sub(center);
  return s;
}

// clone a proto (skeleton-aware) and start a clip if requested.
// Returns { obj, mixer, actions } — push mixer into your update list.
export function spawnCreature(packId, file, { clip = null, len = null, r = null, yaw = 0 } = {}) {
  const proto = loaded[packId]?.protos[file];
  if (!proto) return null;
  const model = skeletonClone(proto.scene);
  // skinned meshes keep their bind-pose bounds — disable culling or they vanish;
  // a touch of self-illumination keeps creatures readable in fog
  model.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const m = o.material;
      if (m && !m.userData._lit) {
        m.userData._lit = true;
        // matte and soft — creatures should look fluffy/organic, never metallic
        if ('metalness' in m) m.metalness = 0;
        if ('roughness' in m) m.roughness = Math.max(0.85, m.roughness ?? 1);
        if (m.emissive) m.emissive.copy(m.color).multiplyScalar(0.18);
      }
    }
  });
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(model);
  // scale/center from the reference bounds measured at load time
  const s = len
    ? len / Math.max(proto.size.x, proto.size.y, proto.size.z, 0.001)
    : r / Math.max(proto.radius, 0.001);
  inner.scale.setScalar(s);
  model.position.sub(proto.center);
  inner.rotation.y = yaw;
  wrap.add(inner);
  let mixer = null;
  const actions = {};
  if (proto.clips.length) {
    mixer = new THREE.AnimationMixer(model);
    for (const c of proto.clips) {
      const short = c.name.split('|').pop();
      actions[short] = mixer.clipAction(c);
    }
    const want = clip && (actions[clip] || actions[Object.keys(actions).find(k => k.includes(clip))]);
    (want || Object.values(actions)[0])?.play();
  }
  return {
    obj: wrap, mixer, actions,
    dims: { x: proto.size.x * s, y: proto.size.y * s, z: proto.size.z * s },
  };
}

// ── environment texture builders ──
export function gradientTexture(stops) {
  const W = 256, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  stops.forEach((col, i) => grad.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // fine noise dithering kills the banding that plagues smooth sky gradients
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// wide panorama with layered treeline silhouettes for the jungle horizon
export function treelineTexture(stops) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  stops.forEach((col, i) => grad.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // three leafy layers — sunlit greens, not gloomy silhouettes
  const layers = [
    { y: H * 0.52, amp: 26, col: 'rgba(148,205,110,0.6)' },
    { y: H * 0.60, amp: 34, col: 'rgba(108,178,84,0.8)' },
    { y: H * 0.68, amp: 44, col: 'rgba(74,148,66,0.95)' },
  ];
  for (const L of layers) {
    g.fillStyle = L.col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x * 0.02;
      const y = L.y - Math.abs(Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.6 + 2) * 0.4) * L.amp
        - (Math.sin(t * 5.1) > 0.7 ? L.amp * 0.8 : 0); // occasional emergent crown
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// soft vertical light shafts (god rays) — additive planes
export function buildRays(color, count = 6) {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(22, 0); g.lineTo(42, 0); g.lineTo(58, 256); g.lineTo(6, 256);
  g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 90),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set((Math.random() - 0.5) * 90, 32, -60 - Math.random() * 200);
    m.rotation.z = -0.25 + Math.random() * 0.1;
    m.userData.phase = Math.random() * Math.PI * 2;
    group.add(m);
  }
  return group;
}
