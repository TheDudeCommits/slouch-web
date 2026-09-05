# Slouch v2 — implementation and acceptance

5 September 2026. A substantial web overhaul and buildable iOS foundation are implemented. Later production and release gates remain as listed below.

Code revision: `5ddc5b5746c475245a04d6ccaf3e8b1b5ad58880`. [Draft PR #1](https://github.com/TheDudeCommits/slouch-web/pull/1); [GitHub CI passed](https://github.com/TheDudeCommits/slouch-web/actions/runs/33962800751). The PR tracks any later documentation-only revision.

**Web release:** [Play Slouch](https://slouch-web.vercel.app). Source `98e5351cdaa3f52a1951d47784f7f331db740970`, deployment `dpl_HsbU2h58TPBfEPTpsVabTFD6bJPD`, Vercel **READY** with the canonical alias assigned. Vercel automatically made its first deployment Production. GitHub checks passed. Live unauthenticated desktop/phone Chromium QA launched all three worlds, verified advancing timers and pause/end/home, and recorded no page errors; the browser was closed. See HANDOVER for project/build details.

## Review the experience

Start with a three-minute Ocean break: home, setup, travel corridor, protected gate, whale crossing and completion form the reference flow. Compare Jungle grounding/jumps and Space visibility. All worlds are included; former pack owners receive a once-only migration credit.

Actual Chromium captures: [desktop home](previews/home.png), [world selection](previews/worlds.png), phone gameplay in [Ocean](previews/ocean.png), [Jungle](previews/jungle.png) and [Space](previews/space.png). These are rendered gameplay/UI, not concept art. Additional local desktop/phone, setup, interruption and results captures are in `output/playwright/`.

## Verification performed

| Check | Result and boundary |
|---|---|
| Core tests | 11 passing: freshness/stability/outliers, bounded steering, completed tuck/held/stale rejection, uninterrupted holds, simulation timing, all session durations/protected phases, reachable corridor, calendar comparison, migration/once-only compensation, validated imports and unpadded legacy dates. |
| Build | TypeScript and Vite passed; 23 shell resources, root manifest, unique cache entries, local model and Crosswing exclusion verified. |
| Dependencies | `npm audit --omit=dev`: zero vulnerabilities when checked. |
| Browser layouts | Desktop 1440×900 and phone 390×844; three home/world/gameplay views, setup, pause/interruption, collection/activity/settings and results inspected during implementation. Final capture run had no page errors. Emulation is not iPhone Safari acceptance. |
| Finite break | Natural 60-second Ocean manual session: duration 60, reward 120, camera/game stopped, manual movement untracked. |
| Input/interruption | Keyboard right moved the hero and release returned it to centre. Synthetic stale camera input froze time, score and distance over 100 update frames. Pause/resume and early end saved correctly. |
| Resource lifecycle | Nine world changes: after warmup, per-world texture/geometry counts plateaued; pickups remained at two children (one visual plus effect). This is not a phone memory-pressure test. |
| Offline and recovery | Hash-verified Ocean/camera downloads; production offline reload; worker initialization; injected runtime failure; successful retry using the compatible main engine. Two mocked permission attempts, one worker, zero failed requests. Camera was intentionally denied: loading/recovery was tested, not real-person tracking accuracy. |
| iOS | Swift/Capacitor compile succeeded with Xcode 26.6, iOS 26.5 SDK, iPhone 17 Pro simulator destination, signing disabled. Simulator not booted; paired iPhone 15 Pro unavailable. |

Final native log: `~/Library/Developer/XcodeBuildMCP/workspaces/Codex-ThreeJS-0f0890846db2/logs/build_sim_2026-09-05T11-13-16-709Z_pid42114_324568e5.log` (succeeded; zero warnings/errors). The log folder reflects the tool host; project/products are in the Slouch checkout.

## Remaining production gates

- Human visual review/formative playtests have not occurred. The proposed 80% first-break completion target is unmeasured. Qualified review of movement cues/ranges remains before stronger health claims.
- Physical iPhone tracking, lifecycle/services, VoiceOver/text scaling, response, thermal behavior and battery need acceptance. Desktop frame-time observations do not establish the phone floor.
- Models are preserved/catalogued, but exact rights confirmation remains for parts of the inherited collection. Crosswing is excluded from distribution, not deleted from history.
- Further model/material cleanup, LOD/compression experiments, animated collection previews, richer landmark composition and frame-time-driven automatic quality adaptation remain polish work guided by device/playtest evidence.
- Competition remains local/versioned without an authoritative server. Cross-date event snapshots are not a validated global duel system. No purchases, Game Center configuration, HealthKit or cloud account sync were created.
- Web deployment to Vercel is complete. Signing, TestFlight and App Store submission have not occurred. GitHub Pages remains on its previous version and has a separate built-publishing configuration gate.

[iOS checklist](IOS-READINESS.md) · [Preserved plan](OVERHAUL-PLAN.md) · [Current handover](../HANDOVER.md)
