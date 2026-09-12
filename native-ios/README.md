# Slouch for iOS

Native SwiftUI screens and RealityKit 3D, ported from the restored Slouch web game at **`670ed9dea09979131c9cb0c485370605f0d285a8`**. The web source and deployment are unchanged.

The original gameplay modules execute locally in **JavaScriptCore**. This is intentional: steering curves, collisions, ballistic jumps, seeded challenges, boons, bosses, rewards, progression and posture reports share the original implementation. There is **no WebView, Three.js runtime, HTML UI, server or downloaded executable code** in the iOS app. This is not a full rewrite of the simulation in Swift.

## Run

1. Open **`native-ios/Slouch.xcodeproj`** from the repository root in Xcode. The converted models, original fonts and generated engine are committed; no conversion tools are needed to run. The old `ios/App/App.xcodeproj` path belongs to the discarded Capacitor setup and is not this native app.
2. Choose the **Slouch** scheme and an iPhone simulator, then Run.
3. Choose Tech Neck or Casual. On a simulator, choose **USE TOUCH CONTROLS** when the camera fallback appears. Drag anywhere in the game to steer; drag upward to jump in Jungle. Pause is at the top right.
4. For an iPhone, choose your Apple development team in Signing & Capabilities and run on a supported device. The app requests front-camera access. Set the device at eye height, sit tall, and let the automatic neutral-pose calibration finish.

Minimum deployment target: **iOS 18**. Build verified with **Xcode 26.6 / iOS 26.5 SDK**, using the **iPhone 17 Pro simulator**. The bundle identifier is `work.dude.slouch.native`; change it if needed for your signing account.

```sh
# From native-ios/
xcodebuild -project Slouch.xcodeproj -scheme Slouch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build

xcodebuild -project Slouch.xcodeproj -scheme Slouch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -parallel-testing-enabled NO test

# Original-engine parity and source-preservation checks
node Scripts/test-engine.mjs
swift test
```

If Xcode reports that the Metal compiler is missing, install its Metal Toolchain component in Xcode Settings, or run `xcodebuild -downloadComponent MetalToolchain`.

## Included

- Deep Space, Open Ocean and Jungle Rush, with all five ships, all five creature heroes, original enemies, scenery, pickups and animations. All **45 original GLBs** have native USDZ conversions; **19 animation variants** accompany them.
- Original Tech Neck, Casual, Daily, Weekly and Duel modes; original world prices and in-game stardust economy. Purchases equip immediately, as on the web.
- SwiftUI menu, HUD, pause, store, settings, local ranks, honors, lore, history, range-of-motion reports and daily goal rings.
- Original licensed music, sound effects, textures, icons and world fonts. Native AVAudioEngine handles music, ambience, low-pass intensity and pitched sound effects.
- Native Metal glow, chromatic aberration, grain, vignette, speed lines and distance fog; native particle glows, contact shadows, animated heroes, caustics and scrolling scenery.
- ARKit face tracking with display-aligned, calibrated face axes and timestamped adaptive smoothing; automatic calibration, mirrored-control setting, face-loss feedback and touch fallback. Interrupted camera sessions require fresh calibration before a paused camera run resumes.
- Native PNG report/duel cards and the iOS share sheet. Native duel URLs use `slouch://challenge?duel=…&s=…&by=…`; existing web duel links can be pasted into System. Universal Links are not configured.
- Atomic local JSON saves, pause/background handling, optional four-hour break notifications and a confirmation before resetting progress.

## Parity and limits

The original simulation is preserved and tested. Rendering is a **native translation**, not a pixel-identical Three.js image: RealityKit lighting/material response and post-tone-map bloom differ from the original WebGL pipeline. The original lens-flare textures and positions are translated to native camera-facing sprites. Final visual matching still needs review on the intended phone.

Simulator checks validate touch interaction and application behavior. They **do not validate ARKit face tracking**, real neck movement, camera orientation/signs, centimeter thresholds, heat, battery use or sustained device frame rate. A subsequent Xcode setup verified debug build and launch on the owner's connected iPhone; physical tracking and sustained gameplay testing remain open. No TestFlight/App Store submission has been completed.

The requested game still uses local leaderboards and earned currency. Game Center, HealthKit, cloud sync, StoreKit purchases and downloadable packs were future items in the original handover, not existing game features; they are not added here. Existing browser saves do not automatically migrate into the native app's sandbox.

Before an App Store release, resolve the original handover's Crosswing model/IP issue and complete the asset-attribution audit. The model is retained here to preserve the requested game. Original attribution is bundled from `../assets/ATTRIBUTION.txt`; font licenses are in `Slouch/GameResources/Fonts/`.

## Structure

| Path | Purpose |
|---|---|
| `Slouch/Core/GameKernel.swift` | JavaScriptCore host, persistence and typed snapshots |
| `Slouch/Core/SlouchModel.swift` | Main-thread state, lifecycle, navigation and service coordination |
| `Slouch/Services/HeadTracker.swift` | ARKit input and neutral-pose calibration |
| `Slouch/Services/GameAudio.swift` | Native audio graph and stereo/sample-rate conversion |
| `Slouch/Rendering/WorldRenderer.swift` | RealityKit asset loading, animation and scene updates |
| `Slouch/Rendering/SlouchPost.metal` | Native postprocessing kernels |
| `Slouch/Views/` | SwiftUI screens, original icon/font styling and native share card |
| `Slouch/GameResources/runtime.js` | Native adapters replacing the original browser services |
| `Slouch/GameResources/engine.js` | Generated original gameplay modules; do not edit by hand |
| `Slouch/GameResources/source-manifest.json` | Original baseline and source/asset SHA-256 inventory |
| `Slouch/GameResources/Models/` | USDZ conversions, clips and measured bounds with source hashes |
| `Tests/`, `UITests/` | Engine-boundary tests and real simulator interaction tests |
| `project.yml` | XcodeGen source for the committed Xcode project |

Only the engine mutates gameplay state. The renderer consumes snapshots; its scenery randomness has no authority over collisions or rewards. The native render camera uses a farther clipping plane to enclose the skybox, while original spawn distances, collision bounds and camera movement are retained.

Do not rename `GameResources` to `Resources`: a top-level `Resources` directory causes Apple bundle classification/signing/install problems for this app layout.

## Rebuild generated files

Run these only when changing source assets or the original engine. Node 22+ is sufficient for the bundler; the checked-in output requires no Node runtime on iOS.

```sh
# From native-ios/
node Scripts/prepare.mjs

# Requires Blender with USD/glTF support (used: Blender 5.2.0 LTS).
/Applications/Blender.app/Contents/MacOS/Blender --background --python Scripts/convert_assets.py

# Optional font/icon regeneration; see script imports for Python dependencies.
python3 Scripts/fonts.py
python3 Scripts/icons.py

# Requires XcodeGen only when changing project.yml.
xcodegen generate
```

Original audio, images and attribution are referenced directly from the repository's `assets` folder by Xcode. `prepare.mjs` transforms imports/exports without changing the seven original gameplay modules. The conversion script clears active animation before measuring skinned geometry, preserving original hero scale and ground contact.

## QA launch arguments

Debug builds accept `-touch`, `-qa-world=space|ocean|jungle`, `-qa-hero=hero_pig|hero_bunny|hero_clown|hero_tang|hero_mandarin`, and `-qa-autoplay`, and `-qa-hyper`. Any `-qa-` argument uses a separate **SlouchQA** save directory, resets that test save and grants test currency. Ordinary progress is untouched. `-qa-autoplay` invokes the original debug god mode, which deliberately makes the hero blink; it is not used by the collision-result test. `-qa-hyper` supplies a synthetic four-centimeter chin tuck to exercise the real hyperdrive render path. QA hooks do not run in Release builds.

See [HANDOVER.md](HANDOVER.md) for verification evidence and the physical-device acceptance checklist.
