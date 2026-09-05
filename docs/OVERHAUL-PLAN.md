**Slouch — visual overhaul, playability, and iOS plan**

Prepared 5 September 2026. Recommendation for review; no game code changed or deployed.

Make Slouch a beautiful three-minute escape from the desk: a small adventure controlled by comfortable movement, with a satisfying destination and a clear return to work. Keep a separate arcade mode for players who want score chasing. The visual overhaul should make that experience feel intentional across the interface, worlds, characters, motion, sound, and rewards.

**1. What I verified**

I read HANDOVER.md, TECHNECK.md, and the current implementation; inspected the live menu at desktop and phone viewport sizes; and captured Space, Ocean, and Jungle during play using camera fallback and the existing debug invulnerability option. The browser was closed after inspection. The local checkout at `/Users/amir/Claude/slouch` is clean and matches remote HEAD `670ed9dea09979131c9cb0c485370605f0d285a8`. The open Codex-ThreeJS workspace is another project and was left alone.

The handover describes a working three-world game with head steering, boosts, gates, encounters, cosmetics, daily challenges, progression, reports, and local saves. Ocean and Jungle are already implemented even though parts of README still describe older scope. Preserve their different movement and placement rules, the corrected skinned-model bounds, grounded animation, per-world music, subtle SFX, and earned player progress. [Handover](https://github.com/TheDudeCommits/slouch-web/blob/670ed9dea09979131c9cb0c485370605f0d285a8/HANDOVER.md)

| Area | Finding | Implication |
|---|---|---|
| First screen | Rank, three play choices, daily modifier, and missions appear before a clear desk-break benefit. | Give new players one obvious starting action and disclose the deeper systems later. |
| Environment | The inspected opening stretches rely heavily on a sky/ground surface and scattered models. | Author recognizable routes, foreground framing, midground landmarks, and destination reveals. |
| Hero readability | The default Space ship occupies much of the portrait width; the fish is seen almost directly from behind. | Tune camera, scale, and silhouette per hero and aspect ratio. |
| HUD | Pale score and controls lose contrast over Ocean's bright upper background. | Use consistent contrast support and semantic colors independent of scenery. |
| Tracking loss | `readControls()` returns when the face is lost, but the game loop continues hazards and scoring. | Introduce a tracking interruption state that protects the player and suspends measurement. |
| Calibration | The “stable” timer currently tests face presence, not movement variance. | Actually measure stability, sample freshness, and framing before automatic launch. |
| Movement incentives | Speed ramps with time; boost rewards holding a tuck; range adaptation uses run maxima. | Separate arcade challenge from movement targets and remove rewards for ever larger or longer motions. |
| Reports | The /100 score is a game formula. “Weekly” trend compares seven recent runs with seven previous runs. | Explain measured activity accurately and use real date windows and comparable valid sessions. |
| Packaging | Static ES modules, CDN Three.js/MediaPipe, localStorage, and a network-first service worker; assets total about 54 MB on disk. | Introduce a repeatable build and explicit offline downloads before native packaging. Disk size is not a measured initial download size. |

Source evidence: [tracking](https://github.com/TheDudeCommits/slouch-web/blob/670ed9dea09979131c9cb0c485370605f0d285a8/js/head.js), [gameplay](https://github.com/TheDudeCommits/slouch-web/blob/670ed9dea09979131c9cb0c485370605f0d285a8/js/game.js), [reports](https://github.com/TheDudeCommits/slouch-web/blob/670ed9dea09979131c9cb0c485370605f0d285a8/js/report.js), [app shell](https://github.com/TheDudeCommits/slouch-web/blob/670ed9dea09979131c9cb0c485370605f0d285a8/js/main.js).

These are a source and visual audit, not a real-person tracking or therapeutic validation. Automated Chromium rendering can differ from a phone, especially in brightness. Physical iPhone testing remains an acceptance gate.

**2. Visual direction: sunlit miniature adventures**

My recommended direction is tactile, stylized 3D: rounded but distinctive silhouettes, restrained surface detail, believable materials, soft contact shadows, clear daylight, and rich environmental composition. It should feel inviting to adults taking a break at work. Personality comes from characters and small discoveries; excessive glow, visual noise, and piles of interface panels would work against that.

Before implementation, prepare three materially different art-direction boards:

| Direction | Distinguishing treatment | Tradeoff |
|---|---|---|
| Tactile miniature — recommended | Sculpted forms, painted surfaces, soft lighting, warm miniature environments. | Strong cohesion and readable mobile silhouettes; requires asset cleanup and careful composition. |
| Graphic expedition | Cel shading, bold silhouettes, limited palettes, illustrated signs and transitions. | Strong visual identity and readability; needs consistent treatment across every asset. |
| Soft cinematic nature | More natural materials, broad atmospheric vistas, subtle animation, minimal graphic treatment. | Immersive and mature; greater lighting, texture, and phone-performance demands. |

Each board must show the same home screen, Ocean gameplay moment, and results screen at phone and desktop sizes. Include hero and obstacle lineups, typography, materials, palette, and a short motion study. These are different art systems, not color variations. Choose one before replacing production visuals.

Create one Slouch identity across all worlds: a recognizable wordmark, shared readable body typography, consistent control shapes, custom icons, and the same navigation structure. Let worlds change accent colors, scene materials, local language, and sound. Keep the handover's no-emoji, minimal-text, sourced-asset standards.

**3. Rebuild the environments as places**

Every route needs four depth layers: distant destination, major midground structures, a clearly readable movement corridor, and occasional foreground framing outside the collision space. Density should live mostly beside the route. Use authored modular sections joined under placement rules, with bounded variation in decoration. A random scatter system alone cannot supply a memorable journey.

| World | Proposed environment | Character and play treatment | Signature moment |
|---|---|---|---|
| Open Ocean — first production slice | Shallow turquoise lagoon, coral terraces, sand channels, kelp passages, then a reef arch opening into blue water. Caustics and suspended particles stay subtle. | A fish silhouette readable from a slightly elevated rear view; animated fins and turning; replace the engine-like light trail with wakes and bubbles. Coral and kelp remain rooted. | A whale crosses above the route, leading into a current ride and a clear finish. |
| Jungle Rush | Warm canopy openings, a winding earth trail, roots, fern banks, fallen trunks, stream edges, and a distant waterfall. | Bunny/Piggy retain ballistic jumps, feet on terrain, gait, anticipation, landing, and contact shadows. Give the route a visible surface separate from decorative grass. | A stream crossing and a waterfall overlook; encounters read as passing or escaping wildlife. |
| Space | A luminous planetary rim, layered orbital structures, mineral asteroids, solar sails, and a readable navigation route. Keep dark space where it supports contrast. | Replace Crosswing with an original ship; readable wings and hull, restrained engine bloom, generous camera margins. | An orbital gate reveals the destination beyond the planet's limb. |

Specify hazard grammar for each world: silhouette, warning animation, approach cue, collision proxy, and safe response. Separate scenery and obstacles by shape and behavior as well as color. A glowing halo alone is insufficient. Ocean gets current rings; Jungle gets vine arches and trail cues; Space gets navigation gates. Avoid combat effects that make benign animals look like objects the player should smash.

Use a stable horizon and gentle camera following. Reserve stronger speed effects for short rewards, with reduced-motion options for shake, FOV changes, particles, grain, and chromatic aberration. Gate and landmark placement must remain in world coordinates.

**4. Asset production and art consistency**

Audit the existing inventory into keep, rework, and replace. Keep a model only when its silhouette, proportions, materials, animation, licensing, and on-screen size suit the selected direction. Sourced assets still need art direction; mixing unrelated packs without cleanup is the main consistency risk.

For the Ocean slice, scope one polished hero, roughly 8–12 reusable scenery pieces, four readable hazard families, three authored route sections, one gate, one reward family, and one finale creature. This is a proposed production scope, not a requirement to download all-new content. Reuse suitable existing models.

Pipeline: source or commission with explicit rights → Blender cleanup → normalized units, pivots, materials and animation names → simple collision proxies and LODs → optimized GLB → in-engine review. Trial Meshopt and KTX2 against the chosen loader and phone budget before making them mandatory. Keep source files and licenses alongside the optimized exports.

The asset register should include creator, exact source URL, license and attribution text, modification notes, triangle/material counts, texture sizes, and animation clips. Existing broad pack credits need a per-asset review. The handover flags Crosswing as an X-wing fan model: replace it, its promotional imagery, and save migration fallbacks before App Store submission. Do not assume another model is cleared merely because a handover calls it safe.

Lock a world-specific audio palette. Retain subtle effects; use short cues for ready, accepted input, approaching hazard, and completion. Finish Ocean/Jungle encounter music. Avoid repeated alarms and loud reward stacks in an office setting. Audio assists movement prompts, while visible equivalents support muted play.

**5. Interface overhaul**

| Surface | Proposed experience |
|---|---|
| Home | A living view of the equipped world and hero. One dominant action: “Take a 3-minute break.” A discreet duration choice, current activity progress, and access to worlds/profile/settings. |
| World selection | Large scene previews with hero animation, download size/status, and an obvious preview/equip action. Make the distinction between palettes and complete worlds explicit; “Ocean Dive” and “Open Ocean” currently risk confusion. |
| Setup | Visual instructions to place the screen at a comfortable eye-level viewing position, sit comfortably, and enter the frame. Explain local camera processing before the system prompt. Camera preview is useful here and optional during play. |
| Calibration | Show framing, actual stability, and a comfortable movement demonstration one action at a time. Keep hands-free completion with an accessible manual alternative. Recheck after device movement or tracking interruption. |
| Gameplay | One compact status cluster for time/objective and score when relevant; one small ability/pause cluster. Show movement cues only when needed. Preserve the central travel corridor. |
| Pause or tracking interruption | A calm, readable interruption screen with recenter, recalibrate, settings, and end-session actions. Freeze game input under menus. |
| Results | Lead with “Break complete,” time moving, completed activities, and one earned reward. Put detailed estimates and history behind a secondary action. |
| Collection/store | Animated world and hero previews; clear owned/equipped states. Group cosmetics and progression without presenting a wall of equal-weight cards. |
| History | Calendar-based activity and consistency, valid tracking coverage, and comparable-session trends. Avoid presenting a game score as clinical posture quality. |

Prototype touch targets of at least 44 CSS pixels, then verify actual native sizing, safe areas, larger text, focus order, keyboard controls, and VoiceOver for menus. Use contrast backplates or edge shading even in a frameless design. Reserve a readable text color independent of each world's accent. Support pointer/keyboard/touch as explicit play options and label their results as non-tracked activity.

**6. Make the game more playable**

The central change is to separate the experience the player wants from the input method. “Desk break,” “Arcade,” and later “Daily challenge” describe the activity. Camera, touch, and keyboard describe how it is controlled. Comfort settings belong to the player rather than the world.

**Desk break:** default to a finite three-minute journey, with shorter/longer options after tuning. A proposed rhythm is 20 seconds of gentle orientation, several short movement challenges separated by neutral travel, a generous gate sequence, a scenic finale, and a completion reward. These timings are game pacing proposals; a qualified physiotherapist should review movement selection, holds, and progression before they are described as an exercise prescription.

**Arcade:** retain score chasing, seeds, modifiers, near misses, and difficult encounters. Raise difficulty through route complexity, precision, and optional choices, while keeping movements within the player's calibrated comfort envelope. Disable movement-range escalation as a reward mechanism.

Priority changes:

1. Teach one input at a time in a safe opening route. Show an animation, let the player succeed, acknowledge it, and only then combine actions.
2. Auto-pause on stale or lost tracking. Stop hazards, boost detection, scoring, timers, and movement reporting together. Reacquire a valid pose and give a short readiness cue before resuming. Test brief occlusion separately from sustained loss.
3. Calibrate comfortable controls individually. Use valid sample windows and robust statistics; reject outliers. Do not raise required ranges because one accidental frame produced a large maximum.
4. Detect a tuck as a deliberate movement cycle with return to neutral. Trigger a bounded boost from a validated event instead of rewarding a longer held tuck with more speed. If detection is uncertain, offer an alternative mechanic rather than presenting a guess as fact.
5. Make held-turn gates protected sequences: slow or temporarily guide travel, clear immediate collision threats, provide optional audio, and allow skipping. Looking away from the screen should not demand simultaneous precision dodging.
6. Use a forgiving mistake model for desk breaks: a brief bump and recovery, retained completion progress, and no need to buy a revive to finish. Keep end-of-run failure for an explicitly chosen arcade session.
7. Reward returning to neutral and completing the chosen session. Replace punitive “slouch detected” score drain in desk breaks with a gentle recenter cue. A camera-relative forward shift can also be the chair or device moving.
8. Make encounter generation respect reaction time and the current control profile. Validate that there is a reachable route, no contradictory pose requests, and recovery space between movements. Establish cue lead times through playtests rather than a universal fixed number.
9. Preserve earned worlds and items, but rebalance future rewards toward cosmetics, discoveries, and completion. Avoid upgrades whose value depends on holding a neck position longer. Use forgiving consistency rewards rather than pressure to play through discomfort.

A face transform measures the face relative to the camera. It does not by itself establish spinal alignment, shoulder compensation, or a clinically valid chin tuck. Use “movement break” and “movement estimate” language until relevant claims are validated. Comfortable movement is consistent with NHS patient guidance; the game-specific protocol still needs professional review. [NHS neck movement guidance](https://elht.nhs.uk/services/integrated-msk-pain-and-rheumatology-service/patient-information/spinal-pain/neck-pain)

**7. Technical work that supports both the overhaul and iOS**

Keep vanilla Three.js and the DOM interface. Introduce Vite, pinned local dependencies, a lockfile, and TypeScript incrementally. There is no demonstrated need for an engine rewrite. Upgrade rendering dependencies separately from visual changes so regressions can be isolated.

Separate responsibilities currently concentrated in `game.js`, `world.js`, and `main.js`:

| Boundary | Owns |
|---|---|
| Tracking adapter | Timestamped pose, source, units, tracking state, freshness, and quality information where available. |
| Movement interpreter | Calibration, smoothing, comfort ranges, gesture events, neutral return, and pause/reacquisition rules. |
| Session director | Desk-break pacing, recovery sections, objectives, movement balance, completion. |
| Simulation | Movement, collisions, encounters, seeded randomness, score, explicit timebases. |
| World renderer | Scene, camera, lighting, animation, effects, pools, asset lifecycle. |
| Interface | Screens, accessible controls, HUD, report presentation. |
| Platform services | Saves, downloads, notifications, audio lifecycle, purchases, sharing, achievements. |

Use fixed-step simulation where needed and distinguish wall-clock session time from slowed game time. Prevent gameplay RNG from being affected by cosmetic randomness. Version seeds/rules, reports, and saves; preserve historical data and migrate existing inventory without silent resets. Separate comparable leaderboard categories by rules, world, and input/assistance policy.

Move web inference off the rendering thread where practical, with a bounded queue that drops stale frames. Google documents `detectForVideo()` as synchronous and recommends workers to avoid blocking the UI; confirm worker/frame-transfer behavior on target Safari devices. [MediaPipe Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)

Add real asset readiness states. The current boot initiates `applyWorldPack()` without awaiting it, so the menu can become usable while a selected pack is still loading. Wait for required hero/world resources before launch, handle interrupted downloads, and dispose unused GPU resources when changing worlds.

Bundle the essential model/runtime/fonts and starting world. Give optional packs versioned manifests, size estimates, hashes, download progress, and removal controls. Replace manual cache-version discipline with build-based asset versioning and a tested update strategy; do not evict every downloaded world on each routine update.

Initial engineering targets, to validate rather than advertise: 60 fps on the reference phone, stable 30 fps on the selected lower tier, about 30 Hz fresh tracking, and a measured input-to-visible-response goal below roughly 120 ms. Track frame-time percentiles, long stalls, dropped tracking frames, memory, download bytes, and thermal behavior. Choose the supported device floor from measurements, not from desktop screenshots. Use adaptive resolution, instancing, LODs, material reuse, and optional postprocessing before reducing control quality.

**8. iOS route**

Recommended sequence: prove a small Capacitor device build early, complete the web vertical slice, then ship an iOS app with native tracking and services. Capacitor preserves the Three.js game inside WKWebView and supports Swift plugins. It is a native app shell with a web renderer; a fully native renderer would be a separate project. [Capacitor iOS](https://capacitorjs.com/docs/ios), [Swift plugin guide](https://capacitorjs.com/docs/plugins/ios)

**First feasibility spike:** package one representative scene with bundled dependencies; run it on at least two physical iPhones; test camera permissions, asset loading, audio interruption, suspend/resume, and sustained frame pacing. Compare the current MediaPipe path with an ARKit-backed adapter under the same movement task. This should happen before the entire art budget is committed. If the combined tracking/rendering workload misses the agreed floor after targeted optimization, use the evidence to evaluate a native renderer or another engine.

**Native tracking:** implement a Swift plugin around ARSession/ARFaceTrackingConfiguration. Send only fresh timestamped pose data through the bridge, map coordinate conventions and units explicitly, and reuse the movement interpreter. Recalibrate per provider; do not copy MediaPipe Z thresholds into ARKit. Keep only one owner of the camera active. Check `ARFaceTrackingConfiguration.isSupported` at runtime and retain a tested fallback or a clear supported-device restriction. Apple states ARKit is unavailable in Simulator, so face tracking acceptance requires physical devices. [Apple face tracking](https://developer.apple.com/documentation/arkit/tracking-and-visualizing-faces?changes=lat__1_5)

Native MediaPipe is an available fallback candidate, but it is additional implementation and validation work, not an automatic consequence of wrapping the web game. [MediaPipe iOS guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/ios)

**Native services, in order:**

1. Camera permission/privacy flow, lifecycle management, stable safe areas, durable local saves, offline launch, native sharing, optional haptics, and opt-in local reminders.
2. TestFlight distribution and field testing of stand placement, glasses, lighting, rotations, occlusion, interruptions, battery, and thermal load. An eye-level stand/setup is part of the product experience; handheld downward-looking play undermines the intended use.
3. StoreKit purchases and restore flows if monetizing worlds/cosmetics; versioned entitlements rather than editable local “owned” flags. Keep earned web currency distinct from paid entitlements and define migration explicitly. Safari localStorage does not automatically become the app's save; offer a validated export/import path or later account sync.
4. Game Center achievements/boards where appropriate. Cross-platform duels or global tournaments require a small backend with authoritative challenge definitions, rule versions, and score validation. Existing local boards are not that service.
5. HealthKit only when there is a justified, accurately representable data use. Keep it out of launch scope unless needed; do not invent calories, posture diagnoses, or medical measurements from face tracking.

**Update the handover's asset-delivery proposal:** Apple now recommends Background Assets over On-Demand Resources. Managed Apple-hosted packs require iOS 26+ deployment targets according to the current documentation. Bundle the core experience; choose managed packs if that minimum fits the audience, otherwise use a compatible download/cache strategy for earlier supported systems. Make this decision when the device floor is set. [ODR migration guidance](https://developer.apple.com/help/app-store-connect/reference/app-uploads/on-demand-resources-size-limits/), [Apple-hosted pack requirements](https://developer.apple.com/help/app-store-connect/manage-asset-packs/overview-of-apple-hosted-asset-packs/)

Before submission, verify asset rights, camera purpose text, privacy policy and disclosures, purchase/restore behavior, independent offline startup, and truthful health-related copy. Apple requires support for accuracy claims involving health measurements. Keep the app positioned around comfortable movement and breaks unless stronger claims have evidence. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

**9. Delivery order and acceptance**

Indicative effort assumes one experienced developer with consistent design/3D support. These are planning ranges, not a committed schedule; asset readiness, feedback, device performance, and clinical review can change them. App Review elapsed time is excluded.

| Phase | Indicative effort | Reviewable deliverable | Exit condition |
|---|---|---|---|
| 1. Direction and baseline | 3–5 working days | Three complete direction boards, source inventory, tracked-device baseline, revised player journey. | Selected art direction and agreed success/device criteria. |
| 2. Control and iOS risk spikes | 1–2 weeks | Safe tutorial, tracking-loss behavior, bounded tuck mechanic, one-scene Capacitor device build. | Comfortable input demo works; viable tracking/rendering approach selected. |
| 3. Ocean vertical slice | 2–3 weeks | Finished home → setup → three-minute Ocean journey → results, with representative final assets and audio. | Usability, visual, control, and frame-pacing gates pass together. |
| 4. Space/Jungle and progression | 2–3 weeks | Remaining worlds follow the same quality standard; preserved saves; polished collection/history flows. | World physics, hero animation, HUD contrast, and migration regressions pass. |
| 5. iOS beta and release preparation | 2–4 weeks | Native tracking/services, offline delivery, TestFlight iteration, store materials and rights review. | Physical-device acceptance and purchase/lifecycle tests pass. |

Some work can overlap, but a polished release is realistically a multi-week production effort. The fastest valuable milestone is the finished Ocean slice, not all future worlds at once.

Recruit an initial 8–12 developers/office workers for formative testing, including glasses wearers and different desk/camera arrangements. Proposed usability gates: most can start without coaching, at least 80% complete the first chosen break, they recognize obstacles before contact, and completion feels rewarding enough to repeat. Record confusion, missed gestures, false boosts, tracking interruptions, and comfort feedback. This sample tests usability, not clinical efficacy.

Automate deterministic route reachability, pause/data gating, gesture replay from consented or synthetic pose traces, save migrations, and pack download failures. Screenshot the menu, calibration, hazards, gates, encounters, and results at desktop/phone sizes; test touch, keyboard, and real camera separately. Run repeated sessions on physical iPhones for brightness, readability, response, and heat. Close test browser sessions after use.

Defer Arctic, Neon Courier, Canyon, Sky, Haunted Hollow, zombie-runner, additional heroes, global tournaments, and HealthKit until the first complete experience meets its gates. Preserve those ideas in the backlog.

**Recommended next production task:** create the three art-direction boards and the Ocean asset shortlist, with home/gameplay/results shown together. After a direction is selected, build one complete Ocean session and use it as the visual, gameplay, and performance standard for the rest of Slouch.

**Current audit images**

These are captures of the existing game, not proposed designs. Gameplay captures use camera fallback and debug invulnerability at a phone-sized Chromium viewport.

- [Desktop home](/Users/amir/.codex/visualizations/2026/09/05/01a07058-f473-7062-8cd3-f501c327e259/slouch-current-desktop.png)
- [Phone home](/Users/amir/.codex/visualizations/2026/09/05/01a07058-f473-7062-8cd3-f501c327e259/slouch-current-mobile.png)
- [Space](/Users/amir/.codex/visualizations/2026/09/05/01a07058-f473-7062-8cd3-f501c327e259/slouch-current-space-game.png)
- [Ocean](/Users/amir/.codex/visualizations/2026/09/05/01a07058-f473-7062-8cd3-f501c327e259/slouch-current-ocean-game.png)
- [Jungle](/Users/amir/.codex/visualizations/2026/09/05/01a07058-f473-7062-8cd3-f501c327e259/slouch-current-jungle-game.png)
