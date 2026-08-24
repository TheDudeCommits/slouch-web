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

**Arcade**
- **Sectors** — the belt rotates through debris fields, laser fence grids and
  wormholes, each with its own hazards and rewards
- **The Dreadnought** — a boss mining ship that shows up every couple of minutes
  and sweeps laser walls you must thread (or breach in hyperdrive)
- **Power-ups** — 🧲 stardust magnet, 🕰 Focus slow-mo, ×2 score doubler
- **Flow meter** — near-misses, gates and threaded walls build your multiplier
  (up to ×6) and the synthwave soundtrack layers up with it
- **Ghost racer** — your best run flies alongside you as a translucent ghost
- **Emergency Revive** — a purchasable one-per-run auto-resurrect

**Therapeutic**
- **Posture report** after every run: per-direction range of motion, time in
  neutral, chin tucks, stretch score /100, and week-over-week trend
- **Daily goal rings** (Move / Tucks / Stretches) with a stardust bonus for
  closing all three
- **Adaptive difficulty** — Stretch Gate thresholds tune themselves to your
  measured range of motion over time
- Best-effort **posture reminders** (full push notifications arrive with the
  native build)

**Retention & social**
- Local **top-10 leaderboards** per mode + **Daily Challenge** (seeded — same
  belt for everyone, resets at midnight)
- **Duels** — share a link; your friend flies the same seeded belt and tries to
  beat your score
- **Share cards** — a rendered PNG flight report for any run
- **18 achievements**, **daily streaks** with auto-consumed **Streak Freezes**,
  and **seasonal events** (2× stardust during the Perseid Comet Festival, etc.)

**Store**
- Themes: Deep Space, Crimson Nebula, Emerald Void, Neon City, Ocean Dive
  (*Jungle Rush* coming soon)
- Ship skins, engine trails (incl. the color-cycling Prism), explosion styles
- Upgrade tree: Hyper Capacity, Hyper Recharge, Magnet Core (3 levels each)
- Utility: Streak Freezes, Emergency Revives

**Tech**
- Procedural everything: ship, asteroid belt, enemies, boss, nebulae, explosion
  FX (Three.js + bloom) and a synthwave soundtrack synthesized live in WebAudio —
  zero downloaded assets. Installable PWA with offline support.

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
