# Slouch iOS readiness

Updated 5 September 2026. This is a buildable native foundation, not an App Store release.

## Implemented

- Capacitor 8.5.1, relative Vite asset paths, bundled fonts/runtime/worlds; no CDN dependency at runtime.
- `work.dude.slouch` bundle identifier, Slouch icon, camera purpose string, safe-area layout, privacy manifest, iOS 15 deployment target.
- `SlouchViewController` registers `SlouchNativePlugin` explicitly for both storyboard and scene creation.
- ARKit support query, single-face tracking, camera-relative transform, angular degrees and depth centimetres, at most 30 pose events per second. Invalid/stale frames stop gameplay. Face meshes never cross the bridge or enter saves.
- Calibration-only low-resolution preview in memory. Preview and capture stop when leaving play/backgrounding. No camera recording.
- Atomic progress file in Application Support, protection until first authentication. Import/export supports browser progress transfer.
- A permission-based, one-shot local reminder four hours after enabling. Native haptics and the system share sheet for reports/progress.
- Unsupported face-tracking devices use the bundled web tracker or manual controls.

## Verified here

Simulator compilation using Xcode 26.6, iOS 26.5 SDK / iPhone 17 Pro destination. The simulator was not booted. The paired iPhone 15 Pro was unavailable. See HANDOVER for the final validation result.

## Required before TestFlight

1. Set signing team and confirm ownership/availability of the proposed bundle ID in the Apple account. Configure App Store Connect; this repository does not create an app record or buy developer membership.
2. On actual iPhones, verify ARKit and MediaPipe sign/axis parity in portrait and landscape, left/right mirroring, neutral depth, false positives, glasses, lighting, occlusion and camera permission recovery. The native coordinate mapping compiles but has not been accepted on a physical device. Do not treat synthetic traces as this acceptance.
3. Test supported lower-end phones for at least repeated five-minute sessions: frame pacing, thermal state, battery, memory, interruptions, audio focus, safe areas, text scaling and VoiceOver menus. Tune the device floor from measured results.
4. Test native save/import/export and reminder permission changes, app suspension/termination, camera indicator stopping, and offline first launch on device.
5. Finish the per-asset rights audit. The exact-source catalogue identifies the imported model collection and verified matching files; inherited broad credits for some ships, pickups, trees and audio still need source-page/license-version confirmation before commercial/store publication.
6. Obtain qualified review of movement cues and comfortable ranges, then conduct the planned formative playtests with developers/office workers. No clinical efficacy claim has been established.
7. Prepare store screenshots, age rating, privacy policy URL and App Privacy answers from the released binary. Submit an external beta only after the above checks.

## Deliberately deferred product integrations

- StoreKit 2 / restore: no real-money products or prices were specified. Implement only after a monetization decision, product IDs and App Store Connect configuration; current unlocks use earned stardust.
- Game Center/global tournaments: local scores are partitioned by world/input/rules. A public competitive system also needs deterministic rule snapshots and server validation; it is not represented as shipped.
- HealthKit: excluded from launch scope. No invented posture diagnosis, calories or workout records.
- Additional worlds and heroes remain after the three launch worlds meet usability/device gates.
- Asset delivery: the approximately 90 MB uncompressed app content is currently bundled. Re-evaluate Background Assets if future packs justify it; this build does not use deprecated On-Demand Resources or require iOS 26 solely for managed packs.

Reference APIs: [ARKit face tracking](https://developer.apple.com/documentation/arkit/tracking-and-visualizing-faces), [Capacitor custom native code](https://capacitorjs.com/docs/ios/custom-code), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
