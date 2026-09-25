# Slouch — session handover

Updated **2026-09-25**. Start here in the next session. This replaces the August web-only handover; that document is preserved as [historical web notes](docs/WEB_HANDOVER_2026-08-25.md).

## Repository and current scope

- Repository: [TheDudeCommits/slouch-web](https://github.com/TheDudeCommits/slouch-web).
- Share this continuation link: [current HANDOVER.md on the native branch](https://github.com/TheDudeCommits/slouch-web/blob/codex/slouch-swiftui/HANDOVER.md).
- Working branch: **`codex/slouch-swiftui`**. Use this branch, not `main`, to continue the native app. `main` remains the original web baseline.
- Local checkout: **`/Users/amir/Claude/slouch`**. The Codex task's `/Users/amir/Codex-ThreeJS` working directory is unrelated.
- Open **`native-ios/Slouch.xcodeproj`**, scheme **Slouch**, bundle **`work.dude.slouch.native`**, minimum iOS 18. The ignored `ios/App/App.xcodeproj` belongs to an abandoned Capacitor attempt and is not a valid project.
- Native implementation details, test history and open checks: [native-ios/HANDOVER.md](native-ios/HANDOVER.md). Run/regeneration instructions: [native-ios/README.md](native-ios/README.md).

The user rejected the visual overhaul and asked to restore the original game, then requested a fully native SwiftUI + native 3D port. Preserve the original assets, worlds and gameplay. Do not revive the rejected overhaul or replace the native implementation with a WebView.

## What exists

The original web game is a static Three.js + MediaPipe PWA with no build step. It includes Space, Open Ocean and Jungle Rush; Tech Neck, Casual, Daily, Weekly and Duel modes; local progression, an in-game stardust store, posture reports, music and sound.

The iOS app uses SwiftUI for menus/HUD, RealityKit for 3D, ARKit for tracking, AVAudioEngine for audio, and Metal/MPS for effects. The seven original gameplay modules execute locally in **JavaScriptCore** to preserve simulation behavior. This is a native UI and renderer, but the simulation has not been rewritten in Swift. No browser runtime or downloaded executable code is used.

All 45 original GLBs have committed USDZ conversions, plus 19 animation variants. Fonts, audio and assets are available offline. Keep the bundle directory named **`GameResources`**; changing it to `Resources` previously broke bundle classification and installation.

Root `js/`, `css/`, `assets/` and `index.html` remain identical to web baseline **`670ed9dea09979131c9cb0c485370605f0d285a8`**. The rejected overhaul was reverted in `3fd08ba`; that historical branch is not the native working branch.

## Latest functional changes

- **`5476127`** — horizontal input/preview follow-up. The owner reported that the previous native build still reversed left/right and the pre-game preview. `HeadPose.relative` now negates native yaw and roll once before passing them to the original engine. Pitch, depth and smoothing are preserved. `CameraPreview.oriented` changes the preview's horizontal presentation in all four orientations without introducing a vertical flip or extra rotation.
- **`df5ebc8`** — native tracking and rendering repair. Pull the latest AR frame each display tick; use calibrated face-relative rotations and timestamped adaptive filtering. Use additive flare/glow blending to remove black rectangles; reduce bloom and color separation; replace broad flashing hyperdrive wedges with fine moving streaks. Batch 1,500 particles into two meshes and cache blur objects.
- **`acd335c`** — Xcode/Metal validation and rotation repair. Padded compute threadgroups and a writable linear texture view avoid simulator validation failures; refresh ARView layout after rotation. Keep Metal validation enabled.
- **`f0932f2`** — initial native port.

The previous synthetic direction tests used the wrong horizontal assumption. The 2026-09-13 correction supersedes those assumptions; passing unit tests is not proof that the latest build feels correct on a phone.

## First action next session

Build and run the current branch on the owner's **unlocked, connected iPhone**, then start a new camera run and recalibrate. With default mirror controls enabled, verify:

1. Tech Neck: tilt right → move right; tilt left → move left.
2. Casual: look right → move right; look left → move left.
3. Look up/down → move up/down. In Jungle, the original grounded jump rules still apply.
4. Preview left/right movement feels natural, both portrait and landscape; chin tuck activates hyperdrive.
5. Face loss/reacquisition, background/resume and rotation do not leave stale controls.

The latest recorded physical-device attempt on 2026-09-13 reached launch but stopped at **“Unlock Amir’s iPhone to Continue.”** No later user confirmation of the corrected controls or camera preview has been recorded. Do not report device acceptance as complete. Also verify sustained frame rate, heat and memory on hardware, and obtain owner approval of the native visuals. No TestFlight/App Store release exists.

## Files to inspect

| Area | Files |
|---|---|
| Native input and smoothing | `native-ios/Slouch/Core/HeadPose.swift`, `native-ios/Slouch/Services/HeadTracker.swift` |
| Native rendering/effects | `native-ios/Slouch/Rendering/WorldRenderer.swift`, `native-ios/Slouch/Rendering/SlouchPost.metal` |
| App lifecycle, frame loop, calibration | `native-ios/Slouch/Core/SlouchModel.swift` |
| SwiftUI screens | `native-ios/Slouch/Views/SlouchRootView.swift` |
| Original simulation bridge | `native-ios/Slouch/Core/GameKernel.swift`, `native-ios/Slouch/GameResources/runtime.js` |
| Tests | `native-ios/Tests/GameKernelTests.swift`, `native-ios/UITests/SlouchUITests.swift`, `native-ios/Scripts/test-engine.mjs` |
| Web behavior/reference | `js/game.js`, `js/head.js`, `js/world.js`, `js/packs.js`, `js/state.js` |

The renderer consumes simulation snapshots/events; it must not mutate authoritative gameplay state. Original control contract: positive `rYaw` = look left, positive `rPitch` = look down, positive `rRoll` = tilt right. The native adapter performs its horizontal sign conversion before the original engine applies the saved mirror preference. Touch controls bypass that camera conversion.

## Validation and Xcode configuration

On **2026-09-25**, the 12 original source/engine checks and all 9 macOS SwiftPM tests passed again. The Xcode project plist and shared scheme XML validate, and `git diff --check` passes. No new gameplay code was changed in this handover/publish session.

Recorded earlier evidence: 10/10 iOS unit tests on 2026-09-13, including an asymmetric Core Image preview test for all orientations; the full simulator UI suite on 2026-09-12 covered all three worlds, touch steering, pause/resume, rotation, camera fallback, purchases, real collisions, reports and sharing. Debug and Release simulator builds passed then. Simulator QA does not validate live ARKit camera direction or physical-device performance.

```sh
cd /Users/amir/Claude/slouch
node native-ios/Scripts/test-engine.mjs
swift test --package-path native-ios
open native-ios/Slouch.xcodeproj
```

The owner's previously local Xcode project and shared scheme changes are included in this publish. The app target uses the owner's development team; another developer must select their own team. Credentials and provisioning profiles are not committed. **`native-ios/project.yml` remains a team-neutral generator specification**: do not regenerate casually, because that would replace the checked-in signing and Xcode settings. Keep UI tests serial (`-parallel-testing-enabled NO`) when using the command line.

## Hosting and delivery

- Existing production web game: [slouch-web.vercel.app](https://slouch-web.vercel.app/). Its restored-original deployment was verified through Vercel as `READY` on 2026-09-25: `dpl_GqFi2ZBPKswjiD9s3pbuoeKS7Soz`, source `3fd08ba05a70557ab52bab0f8cde0235ab797d61`.
- Vercel project: **slouch-web**, project ID `prj_bsPZwvP47byR6JebBz3FVhyMwb8X`, team `team_9UHUI9xdsOl7LAy5xl8hUIV6`.
- This branch is published as a **Preview**, separate from the production alias. Verified publish snapshot: [https://slouch-fakpvts61-amirs-projects-d9680079.vercel.app](https://slouch-fakpvts61-amirs-projects-d9680079.vercel.app), deployment `dpl_4jKFBhb7iiga9qwfgJTXWFui9QA3`, `READY`, source `2884efc1c346ba1d911ca6fbc6d571f3bb17aa52`. Subsequent documentation-only publishes retain the same game source; see [Vercel project deployments](https://vercel.com/amirs-projects-d9680079/slouch-web) for the newest deployment. Verification here uses Vercel status/commit metadata; a new browser gameplay session was not run for this documentation/configuration publish.
- `.vercelignore` publishes only static web files and handover documentation. It excludes the native app/build products, abandoned `ios/`, stale `dist/`, local environment files and QA output. Never deploy the rejected stale `dist/` build.
- Vercel serves the web game only. Native iOS delivery requires Xcode or a separately authorized TestFlight/App Store workflow.
- GitHub Pages on `main` is a legacy web entry point and does not contain this branch's native work. Share the GitHub handover link **on `codex/slouch-swiftui`** for the next session.

Existing asset attribution lives in `assets/ATTRIBUTION.txt`. The historical Crosswing/IP concern and broader App Store/service work remain open; consult the native handover before planning public distribution.
