# Slouch — implementation handover

Updated **5 September 2026**. Repository: [TheDudeCommits/slouch-web](https://github.com/TheDudeCommits/slouch-web). Checkout: `/Users/amir/Claude/slouch`. Branch: **`codex/slouch-overhaul`**, based on `670ed9dea09979131c9cb0c485370605f0d285a8`.

Implementation commit: **`5ddc5b5746c475245a04d6ccaf3e8b1b5ad58880`**. Review: [draft PR #1](https://github.com/TheDudeCommits/slouch-web/pull/1). Its [first GitHub build/regression run passed](https://github.com/TheDudeCommits/slouch-web/actions/runs/33962800751). Subsequent documentation-only commits record this publication metadata; check the PR for its latest head/checks.

The user approved implementation, then explicitly requested GitHub publication and Vercel deployment. **The v2 web game is live at [slouch-web.vercel.app](https://slouch-web.vercel.app).** The native foundation is compile-verified but has not been distributed through TestFlight. Physical iPhone acceptance and the remaining work below stay open. The old handover is preserved verbatim in [docs/HANDOVER-v1.md](docs/HANDOVER-v1.md); its CDN, root-serving and cache-bump instructions no longer apply to v2.

## Verified Vercel release

- Deployed source: **`98e5351cdaa3f52a1951d47784f7f331db740970`**, pushed to `codex/slouch-overhaul` in the existing GitHub repository. Main/legacy GitHub Pages were not changed.
- Project: `slouch-web` / `prj_bsPZwvP47byR6JebBz3FVhyMwb8X`, team `team_9UHUI9xdsOl7LAy5xl8hUIV6`; connected to the GitHub repo.
- Deployment: **`dpl_HsbU2h58TPBfEPTpsVabTFD6bJPD`**, verified **READY**, no alias error. Vercel automatically assigned this first Git-triggered deployment to **production**. Do not describe it as a preview-only release.
- Canonical URL: **https://slouch-web.vercel.app**. Immutable URL: https://slouch-a7zo1rm53-amirs-projects-d9680079.vercel.app. Public game access does not require Vercel authentication.
- Build: Node 24, `npm ci`, Vite production build and 23 shell checks; `dist` served. Source revision comes from the Git build environment or explicit `SLOUCH_BUILD_COMMIT` for CLI uploads without `.git`. Local environment credentials and native/QA outputs are excluded from uploads.
- Live QA: unauthenticated Chromium at 1440×900 and 390×844; all three worlds launched, timers advanced, keyboard controls/pause/end/home worked, zero page errors. Captures: `output/playwright/vercel-*.png`. Test browser closed. Real-camera/device acceptance remains separate.
- GitHub checks passed for the deployed revision. Subsequent documentation commits record this release; they need not be the revision behind the canonical production alias. Always inspect the alias before claiming a later release.

## Product and direction

Slouch is now a finite movement break: one, three or five minutes, with a scenic destination and completion reward. Arcade/daily/weekly score chasing remains separate. Use movement estimates and activity language; face transforms do not establish spinal alignment, clinically valid exercise performance or therapeutic benefit.

The recommended sunlit miniature direction was implemented: a warm shared identity, local Fraunces/DM Sans fonts, custom loop mark, quiet navigation, compact HUD, world previews and simpler setup/results. Ocean has a reef corridor, rooted coral/kelp and a crossing sperm whale; Jungle has a grounded trail, banks, stream and waterfall effects; Space has an orbital route and planet backdrop. Existing sourced models and per-world soundtracks remain, with corrected placement and resource lifecycle. Crosswing remains in source but is excluded from builds and equipment selection.

Preserve these requirements: bright scenes; sourced or explicitly licensed models; minimal UI text and no emoji motifs; environmental depth; readable hazards and a generous travel corridor; grounded Jungle feet/jumps/contact shadows; Piggy's original skinned-animation path; rooted seabed scenery; subtle SFX and world-specific music. The inherited assets are not yet wholly cleared for commercial release.

## Implemented

- Vite build, pinned dependencies/lockfile, local camera runtime/model/fonts, incremental TypeScript core, CI and a manual built-artifact Pages workflow.
- Fresh tracking, stable neutral calibration, worker inference with a bounded frame queue and compatible fallback. Runtime worker failure invalidates tracking; retry switches engines. Manual controls release to centre.
- Fixed-step simulation and protected interruptions: stale tracking, backgrounding or substantial stalls suspend time, distance, score and measurements together. Capture stops when play ends or the app backgrounds.
- Finite pacing, neutral recovery, protected/skippable turn gates, bounded boosts from completed backward-and-return cycles, comfort controls, reduced motion and graphics quality. Break collisions are forgiving and require no purchased revive.
- Calendar-based activity, tracking coverage, explicitly untracked manual results, movement summaries and shareable reports. The clinical-looking /100 presentation is removed.
- Versioned score categories and sampled ghost pace. Inventory/history migration, once-only former-world-owner compensation, and browser/native import/export.
- Hash-verified resumable world/camera downloads, build-based shell caching, and content-addressed assets that retain unchanged downloads across updates.
- Capacitor 8.5.1 / iOS 15 project, ARKit adapter, privacy/camera declarations, native save file, opt-in local reminder, haptics and sharing. All launch content is bundled.

## Code map

| Area | Files |
|---|---|
| Interface/flow | `index.html`, `css/overhaul.css`, `js/main.js` |
| Movement/timing/sessions/migration/history | `js/core/*.ts` |
| Camera providers | `js/head.js`, `js/tracking.worker.js`, `js/platform/native.js` |
| Gameplay/challenges | `js/game.js`, `js/ghost.js`, `js/state.js` |
| Rendering/authored decoration | `js/world.js`, `js/scenery.js`, `js/packs.js` |
| Reports/sound | `js/report.js`, `js/audio.js` |
| Offline | `js/platform/downloads.js`, `sw.js`, `assets/packs-manifest.json` |
| Build/audit/verification | `scripts/`, `vite.config.js` |
| Native | `ios/App/App/SlouchNativePlugin.swift`, `SlouchViewController.swift`, `SceneDelegate.swift` |
| Evidence | `docs/OVERHAUL-STATUS.md`, `docs/IOS-READINESS.md`, `docs/asset-*.json`, `credits.html` |

## Run and verify

Use Node 24 (minimum 22.12) in the Slouch checkout:

```sh
npm ci
npm run dev
```

Development: `http://127.0.0.1:8901`. Production checks and preview:

```sh
npm test
npm run build
node scripts/verify-build.mjs
git diff --check
npm run preview -- --port 8902
```

**Serve `dist`, never the repository root.** Build prepares the pinned camera runtime under ignored `vendor/`. Dependencies, build output and local QA captures are ignored. Run `npm run assets:audit` after source asset changes and commit its manifest/inventories. See [README](README.md) for controls, saves and publishing.

Validation: 11 automated tests; TypeScript/Vite build; 23 shell checks; zero production dependency vulnerabilities; desktop/phone Chromium inspection of all worlds; natural one-minute completion; keyboard release and synthetic stale-tracking freeze; nine world switches with stable warmed GPU counts and no duplicate pickups; production offline startup, local worker initialization and worker-failure recovery with no failed requests. Swift compiled with Xcode 26.6 / iOS 26.5 SDK for an iPhone 17 Pro simulator destination. No simulator was booted or physical-camera acceptance performed. See [detailed status](docs/OVERHAUL-STATUS.md).

`window.__slouch` exists only in Vite development and exposes actual running modules. Use it instead of dynamically importing duplicate HMR versions. Synthetic/manual play is not physical-camera evidence. **Close test browsers immediately after use.**

Native sync:

```sh
npm run ios:sync
npm run ios:open
```

Proposed bundle ID: `work.dude.slouch`. Signing team and App Store Connect record are unset. Compile-only products: `output/ios-build`. Real iPhones are required to accept ARKit axis parity, camera behavior and native services.

## Release and remaining work

1. Review the implemented art direction and conduct formative playtests: obstacle recognition, comfortable camera input, setup, completion and repeatability. The plan's human usability and clinical gates have not passed merely because code is implemented.
2. Complete [physical-device acceptance](docs/IOS-READINESS.md): tracking parity, rotation, glasses/lighting, permission recovery, saves/sharing/reminders, interruptions, accessibility, offline first launch, thermal load and repeated five-minute sessions. Set the phone floor from measurements.
3. Finish source-page/license-version confirmation for inherited ships, pickups, some trees and audio. `docs/asset-source-catalog.json` records source matches and unresolved attribution. No paid purchases or submissions occurred.
4. Continue art polish after feedback. Current scenes reuse sourced inventory; commissioned asset cleanup/LODs, animated collection previews, richer landmark compositions and measured automatic quality adaptation remain production work. Alternative concept boards were superseded by implementing the recommended direction under the user's approval.
5. V2 is published on Vercel. If also updating GitHub Pages, change its Source to **GitHub Actions**, then run **Publish built web app** for the reviewed revision. The old branch-root setup cannot serve Vite source. Do not merge and assume that legacy deployment still works; GitHub Pages remains on v1 independently of the Vercel release.
6. Configure signing/App Store and TestFlight after device and rights acceptance. StoreKit, Game Center/server-validated competition and account sync require product/account decisions; they are not implemented. HealthKit stays outside launch scope. Earned stardust is not a paid entitlement.

Preserve Arctic, Neon Courier, Canyon, Sky, Haunted Hollow and zombie-runner in the backlog; accept the launch worlds before expanding them.

## Continuation prompt

> Read HANDOVER.md, docs/OVERHAUL-STATUS.md and docs/IOS-READINESS.md in `/Users/amir/Claude/slouch`. Reconcile the checkout, `codex/slouch-overhaul`, its review PR and the public site before editing. The v2 overhaul and native foundation are implemented; physical iPhone acceptance, human playtests, final rights and release setup remain. Preserve earned progress, sourced visuals, world physics and Piggy animation. Use Vite and serve dist, not the old CDN/root-server setup. Inspect the latest screenshots and continue review/device acceptance. Close test browsers after use and distinguish local validation from a public or App Store release.
