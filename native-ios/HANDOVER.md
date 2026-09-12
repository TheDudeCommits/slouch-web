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
- 8 XCTest cases execute the original engine and native pose math, including save round-trips, rejected purchases, 32 physical-transform/direction combinations, calibrated face axes, angle wrap, chin-tuck depth, jitter, stale frames, and 30/60/120 Hz filtering. They pass on macOS SwiftPM and the iOS simulator.
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
- Running from Xcode with Metal API validation exposed unsupported nonuniform thread dispatch and compute writes to an sRGB output texture. Both kernels now use padded uniform threadgroups; output uses a writable linear texture view with explicit sRGB encoding. Keep Metal validation enabled when checking Xcode Run. The texture-view approach follows [Apple's postprocess pixel-format guidance](https://developer.apple.com/documentation/realitykit/checking-the-pixel-format-of-a-postprocess-effect-s-output-texture), but is selected by actual texture format because the simulator can advertise Apple GPU families while rejecting sRGB compute writes.
- Rotation could resize ARView while its internal render surface retained the old dimensions. Refresh layout when bounds change and after the rotation animation settles. Verified through Xcode's debugger and live portrait/landscape gameplay.

Xcode GUI setup was verified separately after these fixes: open `native-ios/Slouch.xcodeproj`, choose **Slouch → iPhone 17 Pro**, and press **Command-R**. Metal API validation remains enabled. The app stays running through touch fallback, gameplay, pause/resume, collision results and rotation. The original `ios/App/App.xcodeproj` error came from opening the abandoned Capacitor directory.

The owner then selected a signing team and the connected iPhone in Xcode. Xcode reported the device debug build running successfully. Those signing changes remain local in `Slouch.xcodeproj/project.pbxproj`; do not overwrite them by regenerating from the team-neutral `project.yml`. Device launch is verified, but the physical tracking and performance checks below are still open.

## Remaining acceptance

1. On a supported physical iPhone, verify camera permission allow/deny, automatic face acquisition, neutral calibration, correct yaw/roll/pitch signs in both orientations, and measured chin-tuck/slouch distances. The corrected mapping passes synthetic face-transform tests; actual camera direction and feel still need a new device run.
2. Check face loss, camera interruption, lock/unlock, background/foreground, audio interruption, recalibration and touch fallback during a real run.
3. Compare native and original visuals on the same device/world/hero. RealityKit lighting and bloom are not pixel-equivalent to Three.js. The flare is translated into native sprites; final owner visual acceptance remains open.
4. Play sustained sessions in all worlds; record frame time, memory, heat and battery behavior on the oldest supported hardware. Simulator screenshots are not device-performance evidence.
5. Archive for device and distribute through TestFlight using the owner's signing team. No TestFlight build or App Store submission has been completed.
6. Resolve the original handover's Crosswing IP warning and audit attribution before public store distribution. No asset was replaced because this task requested the exact existing game.

The app intentionally retains local ranks and an in-game stardust store. Native service expansion (Game Center, HealthKit, StoreKit, cloud saves, Universal Links) is future scope. See README for exact run and regeneration commands.

Initial port simulator suite: **7 passed, 0 failed**, plus **12 source/engine checks**. Debug and Release simulator builds succeed. The final full suite is `test_sim_2026-09-12T09-12-39-062Z_pid47108_95a72814.xcresult` in the local XcodeBuildMCP result-bundles directory; later focused rotation checks supplement it.

Landscape was also inspected directly in the Simulator window and captured with `simctl io screenshot`. On iOS 26.5, `XCUIApplication.screenshot()` can export a cropped, rotated raster even when the app window and buttons are correctly placed. The UI test capture helper now uses `XCUIScreen.main.screenshot()` to avoid that artifact.


## Device feedback: control and visual fixes (2026-09-12, evening)

The owner reported reversed head movement, uneven steering, opaque black rectangles over the sky, and overwhelming effects. These are native changes; the original web source and asset files remain unchanged.

- Tracking now reads `ARSession.currentFrame` once per display tick instead of queuing a main-actor task and retaining an image buffer for every camera frame. Duplicate/old frames are ignored; face loss uses elapsed time.
- `viewMatrix(for:)` aligns the face transform to the current interface orientation. Calibration averages quaternions, and movement uses rotation relative to the calibrated face basis. This avoids global camera-axis sign inversions when the neutral pose faces the camera or the phone is tilted. Face +X means the player's left; +roll means right tilt; +pitch means looking down. Camera distance is positive when approaching the camera and negative when moving back.
- A timestamped adaptive low-pass filter quiets resting jitter while increasing response speed during deliberate movement. Tests compare 30, 60 and 120 Hz samples, reject stale frames, and verify recovery after a tracking gap. These are input-processing checks, not measured physical-device frame-rate claims.
- Original lens-flare PNGs are RGB images with black backgrounds and no alpha. They now use an additive RealityKit material program with depth writes disabled. Glows and the shield also use additive blending. The black rectangular patches are absent in the new simulator captures.
- Grain and screen overlays compose in display space, retaining the validated linear texture-view output path. Bloom is reduced with a softer, higher threshold, hyperdrive color separation is reduced, and broad flashing radial wedges are replaced by thin traveling streaks. Original models and textures are retained; asteroid normal maps load with normal-map semantics. Lighting is less intense.
- 1,200 stars and 300 dust particles now use two dynamic billboard meshes instead of 1,500 independently transformed entities. Counts and movement/wrap rules are retained. MPS blur objects are cached instead of recreated every frame.
- Debug QA reset now rebuilds the runtime world, fixing stale scenery from the previous QA save. `-qa-hyper` feeds a synthetic chin tuck into the unchanged engine, allowing a real hyperdrive render test in the simulator. It is excluded from Release builds and uses the isolated QA save.

Validation: 12 original source/engine checks; 8 macOS SwiftPM cases; full iOS suite **12 passed, 0 failed** (`test_sim_2026-09-12T15-25-00-993Z_pid95000_d33615d8.xcresult`). After strengthening neutral-pose math and refining effects, the focused iOS rerun passed **9/9** (`test_sim_2026-09-12T15-32-10-519Z_pid95000_03b3d40a.xcresult`). Full-size screenshots for all three worlds and hyperdrive were inspected in `output/qa/native-control-visual-fix/` and `output/qa/native-control-visual-final/` (ignored).

Physical re-test: start a fresh camera run and let calibration finish. In Tech Neck, right tilt should steer right; in Casual, looking right should steer right. Looking up should move upward in either mode. Compare small resting movements with a deliberate turn, then try face loss/reacquisition and phone rotation. Device performance, thermal behavior and the owner's visual acceptance remain separate from simulator tests. Preserve the owner's local Xcode signing and scheme changes.

The updated Debug and Release simulator builds both succeed. The attempted Xcode Run to the selected iPhone was blocked because macOS was locked; the owner was asked to unlock it. Do not treat the prior device launch as validation of these new controls.
