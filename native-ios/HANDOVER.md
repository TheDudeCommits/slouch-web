# Native iOS handover

Date: 2026-09-12. Branch: `codex/slouch-swiftui`. Baseline: `670ed9dea09979131c9cb0c485370605f0d285a8`.

The user rejected the earlier web overhaul and requested the **original game** as native SwiftUI plus native 3D. This directory is the new implementation. Do not revive the rejected overhaul or use the ignored old `ios/` Capacitor project. Root `js/`, `css/`, `assets/`, `index.html` and the web deployment remain unchanged.

## Decisions

- SwiftUI for screens; RealityKit for 3D; ARKit for camera input; AVAudioEngine for sound; Metal/MPS for postprocessing.
- Original seven gameplay modules run in JavaScriptCore. Native adapters replace browser input, render objects, callbacks, audio and storage. This preserves gameplay behavior without a browser runtime, but is not a simulation rewritten in Swift.
- Main-thread authority for the kernel and presentation. Only snapshots/events cross into rendering.
- All original assets are available offline. Converted USDZs, animation variants and fonts are committed so Xcode can open a fresh clone immediately.
- Simulator and local runs use a distinct app identifier. Debug QA inventory uses a separate save directory.

## Verification

The iPhone 17 Pro simulator was booted and tested with explicit user authorization. Xcode 26.6, iOS 26.5 runtime.

- 12 Node checks cover original source hashes, all converted models/required clips, original RNG/FNV arithmetic, pools/bounds, control signs/dead zones, 2.8 cm hyper threshold/cooldown, grounded ballistic jump, pause timing, touch exclusion from posture reports, boons/powerups/bosses, saved progression and all five modes.
- 4 XCTest cases execute the original engine in Apple's JavaScriptCore, including save round-trips and rejected purchases. They pass on macOS SwiftPM and the iOS simulator.
- Simulator UI checks launch all three worlds, drag to steer/jump, pause/resume/quit, rotate portrait/landscape, use the unavailable-camera fallback, buy/equip Ocean, and wait for an actual collision before opening results/report and the native share sheet.
- Runtime screenshots are exported to ignored `output/qa/`. XCTest result bundles retain screenshots and recordings. Test QA data is isolated from normal saves.
- Original web source hash checks and `git diff --check` pass. No web deployment was performed for this native port.

Early UI assertions failed because localized prices contain a comma and the share sheet exposes Copy as a cell. The app flows were present; the assertions were corrected to stable purchase identifiers and the actual ActivityListView/Copy cell.

## Bugs resolved during real simulator execution

- Apple misclassified a bundle containing a top-level `Resources/` directory. Renaming to `GameResources/` fixed missing bundle identity and signing/install errors.
- RealityKit postprocess callback setup trapped before an active render camera existed. Install after view attachment and camera activation.
- Mono source audio could not play through the stereo graph. Explicitly convert all buffers to stereo 48 kHz before scheduling.
- Portrait sky geometry left a black seam. Backgrounds now follow the native camera and fill its viewport; transparent ocean surface material is explicitly blended.
- Blender's source material defaults rendered creatures metallic. Apply the original loader's matte/emissive corrections to native materials.
- Returning from a backgrounded camera run could leave tracking stopped. Resume through fresh calibration while retaining the paused run.

## Remaining acceptance

1. On a supported physical iPhone, verify camera permission allow/deny, automatic face acquisition, neutral calibration, correct yaw/roll/pitch signs in both orientations, and measured chin-tuck/slouch distances. The physical ARKit mapping is implemented but unverified.
2. Check face loss, camera interruption, lock/unlock, background/foreground, audio interruption, recalibration and touch fallback during a real run.
3. Compare native and original visuals on the same device/world/hero. RealityKit lighting and bloom are not pixel-equivalent to Three.js. The flare is translated into native sprites; final owner visual acceptance remains open.
4. Play sustained sessions in all worlds; record frame time, memory, heat and battery behavior on the oldest supported hardware. Simulator screenshots are not device-performance evidence.
5. Choose an Apple signing team, archive for device, and distribute through TestFlight. No signing account, TestFlight build or App Store submission was configured in this task.
6. Resolve the original handover's Crosswing IP warning and audit attribution before public store distribution. No asset was replaced because this task requested the exact existing game.

The app intentionally retains local ranks and an in-game stardust store. Native service expansion (Game Center, HealthKit, StoreKit, cloud saves, Universal Links) is future scope. See README for exact run and regeneration commands.

Final full simulator suite: **7 passed, 0 failed**, plus **12 source/engine checks**. Debug and Release simulator builds succeed. The final full suite is `test_sim_2026-09-12T09-12-39-062Z_pid47108_95a72814.xcresult` in the local XcodeBuildMCP result-bundles directory; later focused rotation checks supplement it.

Landscape was also inspected directly in the Simulator window and captured with `simctl io screenshot`. On iOS 26.5, `XCUIApplication.screenshot()` can export a cropped, rotated raster even when the app window and buttons are correctly placed. The UI test capture helper now uses `XCUIScreen.main.screenshot()` to avoid that artifact.
