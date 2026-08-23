# 🚀 SLOUCH

**Fix your neck. Save the galaxy.**

Slouch is a third-person, on-rails arcade space dodger for your iPhone — steered
entirely by your **neck**. The front camera tracks your head (fully on-device via
MediaPipe; no video ever leaves your phone) and every control input is a movement
that counteracts *tech neck*. Three minutes of dodging asteroids is three minutes
of guided neck mobility.

![icon](icons/icon-180.png)

## Play it

Open the game in **Safari on your iPhone** (camera requires HTTPS):

**https://thedudecommits.github.io/slouch-web/**

1. Tap a mode, allow camera access.
2. Sit tall, look straight ahead, calibrate (3-2-1, hold still).
3. Fly. For the full experience: **Share → Add to Home Screen** for fullscreen.

Works in desktop Chrome/Safari with a webcam too. If the camera is denied or
unavailable, a touch-control fallback kicks in.

## Modes

- **Casual Mode** — the ship simply follows your head. Small yaw/pitch movements,
  tight response. Pure arcade.
- **Tech Neck Mode** — controls are physiotherapy movements (see
  [TECHNECK.md](TECHNECK.md)):
  - **Ear-to-shoulder tilt** → steer left/right
  - **Chin up / down** → climb / dive
  - **Chin tuck** (glide head straight back) → **HYPERDRIVE**: massive speed surge,
    2× score, smash straight through asteroids (works in Casual too)
  - **Look over your shoulder & hold** → pass golden **Stretch Gates** for big bonuses
  - **Slouch forward** and the ship sputters and your multiplier drains —
    *SLOUCH DETECTED*

## Features

- Local **highscores & top-10 leaderboards** per mode (enter your pilot tag)
- **Daily streaks** — play every day to keep the flame; buy **Streak Freezes** to
  protect it
- **Store** — spend earned stardust ✦ on themes (Deep Space, Crimson Nebula,
  Emerald Void; *Jungle Rush* coming soon) and streak freezes
- **Settings** — music/SFX volume, steering sensitivity, mirror controls, camera
  recalibration, lore
- Procedural everything: ship, asteroid belt, enemy ships, nebulae, explosion FX
  (Three.js + bloom) and a synthwave soundtrack synthesized live in WebAudio —
  zero downloaded assets

## Tech

- No build step. Static HTML + ES modules.
- [Three.js](https://threejs.org/) (CDN) for the 3D world, UnrealBloom postprocessing.
- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe) (CDN, WASM/GPU)
  — head yaw/pitch/roll + Z-translation from the facial transformation matrix.
- `localStorage` persistence; installable PWA manifest.

### Run locally

```bash
python3 -m http.server 8901
# open http://localhost:8901
```

To test on an iPhone against a local server you need HTTPS for camera access —
easiest is just using the GitHub Pages URL, or `npx serve` behind a tunnel
(e.g. `cloudflared`, `ngrok`).

## Disclaimer

Slouch encourages gentle neck mobility and is not medical advice. Stop if any
movement hurts, and see a professional for persistent pain.
