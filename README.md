# Slouch

A little movement. A world away.

**[Play Slouch](https://slouch-web.vercel.app)**

Slouch is a Three.js game for short desk breaks. Take a 1, 3, or 5 minute journey through an underwater reef, a forest trail, or an orbital belt using comfortable head movement, touch, or keyboard controls. Arcade challenges remain separate from finite breaks.

## Run and build

Use Node 24 (minimum 22.12).

```sh
npm ci
npm run dev
```

Development runs at `http://127.0.0.1:8901`. The first production build downloads the pinned MediaPipe face model and copies the pinned inference runtime into `vendor/`; subsequent builds reuse the model.

```sh
npm test
npm run build
node scripts/verify-build.mjs
npm run preview -- --port 8902
```

Serve **dist**, not the repository root. Vite bundles Three.js, local fonts, tracking, and application modules. Do not use the old Python-root-server instructions with version 2.

## Controls

- Camera: calibrate a comfortable centre, gently tilt to steer, and use small optional up/down movements. Turn sequences guide the character and allow skipping. A brief backward movement followed by a return triggers a bounded boost; holding cannot repeatedly trigger it.
- Touch: drag on the playfield; release to return to centre. Use the Boost button.
- Keyboard: arrows or WASD, Space to boost, Escape to pause.
- Face loss, stale samples, backgrounding, and substantial device stalls pause the session. Re-centre before returning to camera play.
- Settings provide a gentler movement range, independent turn/up-down switches, reduced motion, and graphics quality.

Camera transforms are relative movement estimates, not measurements of spinal alignment or a medical assessment. Raw frames and face geometry are not uploaded or saved by Slouch.

## Offline and progress

Use Worlds to download a world and, separately, camera controls. Downloads verify content hashes and resume after interruption. The app shell, fonts, and world previews are cached automatically. Settings can remove downloaded content without clearing progress.

Version 1 saves are backed up before migration. Inventory, history, XP and earned progress are retained. Ocean/Jungle are included for everyone; previous owners receive 2,500/3,000 stardust respectively. Old scores are archived because the rules changed. The removed Crosswing fan model is retained only in source; Quadra becomes its equipment fallback. Exports can move progress between web and iOS; this is not automatic account sync.

## iOS

The repository includes a Capacitor 8 / Swift project with a local ARKit tracking bridge, native file persistence, optional local reminders, haptics, and system sharing. All worlds and the fallback camera runtime are bundled. iOS 15 is the current deployment target; ARKit availability is checked at runtime.

```sh
npm run ios:sync
npm run ios:open
```

Select an Apple development team before signing for an iPhone. Simulator compilation can validate the shell; it cannot validate ARKit tracking. See [iOS readiness](docs/IOS-READINESS.md) for device acceptance and remaining release work.

## Release

Vercel uses the committed `vercel.json` to build and serve `dist`. For a CLI preview deployment, supply the exact source revision because uploaded source does not include `.git`:

```sh
npx vercel deploy --target preview --build-env SLOUCH_BUILD_COMMIT="$(git rev-parse HEAD)"
```

Git-integrated Vercel builds use `VERCEL_GIT_COMMIT_SHA` automatically. Deployment metadata and the current trial link are recorded in [HANDOVER.md](HANDOVER.md).

GitHub Actions builds and checks pull requests. The manual **Publish built web app** workflow uploads `dist` to Pages. Before publishing version 2, switch repository Settings → Pages → Source to **GitHub Actions**. Do not merge and continue serving raw `main` files with the old branch-based Pages setting.

No App Store products, Game Center leaderboards, HealthKit records, or remote score service are configured. Stardust remains an earned game currency. Those integrations require a separate release decision and account configuration.

[Current handover](HANDOVER.md) · [Original plan](docs/OVERHAUL-PLAN.md) · [Source asset inventory](docs/asset-inventory.json) · [Credits](credits.html) · [Privacy](privacy.html)
