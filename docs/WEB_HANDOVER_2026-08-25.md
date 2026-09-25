# SLOUCH — Session Handover

**Last updated:** 2026-08-25 · **Live:** https://thedudecommits.github.io/slouch-web/ · **Repo:** github.com/TheDudeCommits/slouch-web
**Local:** `/Users/amir/Claude/slouch` · Deploy = push to `main`, GitHub Pages (legacy build, ~40-60s). Bump `CACHE` version in `sw.js` on every deploy or clients keep the old build.

## What this is

A head-tracked endless dodger that turns tech-neck physiotherapy into flight controls. MediaPipe Face Landmarker (on-device) reads yaw/pitch/roll/z; lateral tilts steer, chin up/down climbs or jumps, **chin-tuck = hyperdrive boost**, held rotations open Stretch Gates, slouching forward drains your multiplier. Static web app, no build step: Three.js + MediaPipe from CDN, ES modules, PWA w/ service worker. End goal: **App Store native app** (not started).

## The three worlds

| | Space (base) | Open Ocean (2500✦ pack) | Jungle Rush (3000✦ pack) |
|---|---|---|---|
| Hero | 5 starfighter skins | Clownfish / Tang / Mandarin (animated) | Bunny / **Piggy 1500✦** (animated) |
| Physics | zero-g free float | free swim; corals/kelp/urchins/octopus grow FROM seabed; only pufferfish floats | grounded; ballistic jump (impulse 19+ty·13, gravity 46); everything rooted vertical, feet-on-ground via measured halfH |
| Voice | HYPERDRIVE / FLY AGAIN | RIPTIDE / SWIM AGAIN | SUPERHOP / HOP AGAIN |
| Music | synthwave ONLY here | coastal/tropical (oc_*) | ukulele/marimba (jg_*) |
| UI skin | Zen Dots, cyan | Fredoka, aqua (body.world-ocean) | Baloo 2, leaf green (body.world-jungle) |

Placement rules are documented at the top of `js/packs.js` — every future world must define its own.

## File map (all in `js/`)

- `main.js` — screens, store, missions/ranks/codex UI, applyWorldSkin(), auto-calibration (face stable 0.7s → capture → launch, no button)
- `game.js` — loop, controls (sign conventions in readControls comment), sectors, boss, boons (lean to choose), graze trains, hitboxes (radius×0.72), spawnPattern() neck-workout formations, `game._debug` (god(), forceBoss(), forceSector(), forcePowerup(), forceBoon()) for tests
- `world.js` — Three scene, pools (asteroids/enemies/boss are Groups with `userData.holder` swapped per world), applyWorldPack(), hero anim state machine, danger markers, dunes/caustics/rays/decor, post shader (CA/vignette 0.28/grain/speed-lines tinted per world)
- `packs.js` — world manifests + WORLD_TEXT lexicon + loader (lazy: packs download only when owned+equipped; ~2-4MB each) + spawnCreature (skeleton-aware)
- `audio.js` — WORLD_MUSIC pools per world, ambience beds (setAmbience), sampled SFX with per-world overrides (SFX_WORLD), flow→lowpass filter. SFX master 0.2 (user wants subtle)
- `state.js` — localStorage save, THEMES (space palettes), WORLD_PACKS, SKINS/TRAILS/BOOMS/UPGRADES, JUNGLE_HEROES/OCEAN_HEROES, streaks/goals/missions/xp/lore
- `content.js` — boons, weekday mutators, missions, 12 lore signals, ranks
- others: `head.js` (tracking), `report.js` (posture report + share card), `ghost.js` (invisible pace ghost), `achievements.js`, `rng.js`

## Hard-won engine gotchas (do not relearn these)

1. **Skinned model bounds**: armatures can carry their own scale — measure via `SkinnedMesh.computeBoundingBox()` skeleton-applied union (done in loadPack), never `Box3.setFromObject` (pig rendered at 1/10 size).
2. **Some rigs break under SkeletonUtils.clone** (the pig) → heroes use `orig:true` (original scene, cached mixer, absolute centering). Set `frustumCulled=false` on all skinned meshes.
3. **Grounded heroes**: ship origin rides at groundY+1.1; drop model by `dims.y/2 − 1.1` so feet touch, add contact shadow (loadHeroShip), bounce gait via `animSpeed`/`bounce` in hero def.
4. God-mode (`_debug.god()`) makes the ship BLINK — screenshot tests must wait for `world.ship.visible`.
5. Headless swiftshader renders darker than real devices — trust the user's phone screenshots for brightness.
6. Head sign conventions (verified on device): rYaw>0=head LEFT, rPitch>0=head DOWN, rRoll>0=tilt RIGHT.

## Asset pipelines (all repeatable)

- **poly.pizza models**: pages are JS-rendered and rate-limit curl — load in headless chromium (playwright-core + cached chromium at `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/...`), regex `static.poly.pizza/[uuid].glb`. Check license text on page (CC0/CC-BY; attribute in `assets/ATTRIBUTION.txt`).
- **Pixabay music/SFX**: load track page headless (fresh context per page), read `document.querySelectorAll('audio,source')` src for the cdn mp3. Convert: `afconvert -f m4af -d aac -b 96000` (music) / 80k (sfx) / 64k (ambience).
- **Skyboxes**: drive wwwtyro.github.io/space-3d headless (seed input + Enter, read `texture-<face>` canvases). Seeds per theme recorded in memory.
- **Heavy glbs**: `npx gltf-transform resize --width 512 --height 512` (in slouch-packs-staging) shrinks Google Poly models 3-10×.
- **Textures**: ambientCG zips (`https://ambientcg.com/get?file=Name_1K-JPG.zip`), resize with `sips`.
- Staged leftovers (unused candidate models, contact sheets): `/Users/amir/Claude/slouch-packs-staging/`.

## Testing recipe

Serve locally (`python3 -m http.server 8901 -d .`), playwright-core headless with `--enable-unsafe-swiftshader` (+ `--autoplay-policy=no-user-gesture-required` for audio tests). Seed localStorage via addInitScript (`slouch.save.v1`), deny getUserMedia to force the touch path, tap `#btn-cam-touch`. Screenshot-verify EVERY visual change; run a space regression after pack work.

## The user's standards (violate at your peril)

- **Bright, happy, uplifting** — three separate gloom complaints. Exposure sweet spot ~1.18–1.24; check vignette/fog before shipping.
- **No AI-generated-looking assets** — everything sourced (poly.pizza/Kenney/OGA/Pixabay/ambientCG) and credited; procedural only for effects (rays, caustics, gradients w/ dithering).
- **Environment is the #1 visual priority**; density in depth rows, color variation per prop, everything obeying world physics (nothing floats/tilts without reason).
- **Minimal UI text**, visuals-first, no emojis, frameless, strict palette per world skin.
- **SFX = subtle indicators** (master 0.2); music per world only.
- Obstacles must read: subtle pulsing danger halo; scenery deliberately muted.

## Backlog (user-approved, in rough priority)

1. **Per-world "danger" music** for boss moments in Ocean/Jungle (currently no swap outside Space).
2. **Future world packs approved**: Arctic penguin, Neon Courier, Canyon podracer, Sky paper plane, Haunted Hollow, and a **zombie-runner** (Into the Dead style — user's own idea, likes it).
3. More heroes per world (pipeline is trivial now: manifest entry + JUNGLE_HEROES/OCEAN_HEROES row).
4. **Native iOS path**: Capacitor wrap → ARKit tracking, Game Center, HealthKit, IAP (packs = On-Demand Resources). **⚠️ swap the Crosswing default skin before App Store — it's a fan X-wing (Lucasfilm IP)**; Quadra/Vanguard are safe originals.
5. Global leaderboards/tournaments need a small backend (all boards are local).
6. Ocean "stretch ring" gate could be themed (currently gold chevron everywhere).

Detailed change history: `git log` (v1→v16 in commit messages) and the assistant memory file (`slouch-game.md` in the memory dir) which mirrors these lessons.
