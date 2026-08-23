# SLOUCH — Tech Neck Movement Spec

Tech neck (forward head posture) develops from long hours looking down at phones and
laptops. Every control in **Tech Neck Mode** is a movement physiotherapists commonly
prescribe to counteract it. The game deliberately requires *larger, slower, held*
movements than Casual Mode, so a 3-minute run doubles as a guided neck routine.

> Slouch is not medical software. If any movement causes pain, stop. Consult a
> professional for persistent neck pain.

## The movements and what they drive

### 1. Lateral flexion — "ear to shoulder" (steering left/right)
Tilt your head sideways, bringing your ear toward your shoulder while keeping your
shoulders level. Stretches the upper trapezius and levator scapulae — the muscles
that ache after a day of hunching.

- **In game:** rolls/steers the ship left and right.
- **Detection:** head roll angle relative to your calibrated neutral pose.
- **Therapeutic dose:** the deadzone is wide, so lane changes need a real ~15–25°
  tilt, and holding a lane means *holding the stretch*.

### 2. Extension & flexion — "look up / look down" (climb/dive)
Lift your chin toward the ceiling (extension) to climb; bring it down (flexion) to
dive. Extension reverses the constant downward gaze of phone use.

- **In game:** vertical movement of the ship.
- **Detection:** head pitch relative to calibration.
- **Therapeutic dose:** climbing lanes require sustained extension — the single most
  under-used direction for phone users.

### 3. Chin tuck — "make a double chin" (HYPERDRIVE)
Glide your head straight backward, keeping your eyes level — as if a string pulled
the back of your skull to the wall behind you. The canonical tech-neck corrective:
it strengthens the deep cervical flexors and re-stacks the head over the spine.

- **In game:** slams the ship into **HYPERDRIVE** — a huge speed surge with 2×
  scoring, and you smash straight through asteroids while it lasts. Hold the tuck
  to keep it burning (energy meter drains, then a short cooldown). Available in
  both modes.
- **Detection:** the head's Z-translation moving *backward* past a threshold while
  pitch stays roughly level (distinguishes a true retraction from just looking down).

### 4. Rotation — "look over your shoulder" (STRETCH GATES)
Turn your head left or right, chin over shoulder. Restores cervical rotation range.

- **In game:** golden **Stretch Gates** appear with a pose icon (e.g. "LOOK LEFT ⟲").
  Hold the pose ~1.5 s as the gate approaches to fly through it for a big bonus.
- **Detection:** head yaw beyond ±25° held for the dwell time.

### 5. Anti-slouch watchdog (the game's namesake)
If your head creeps *forward* of the calibrated position (classic forward-head
posture) for more than a few seconds, the HUD flashes **SLOUCH DETECTED**, the ship's
engine sputters, and your score multiplier drains until you re-stack your posture.

- **Detection:** sustained forward Z-translation relative to calibration.

## Session design

- Calibration captures your neutral pose at the start of every run (and any time via
  Settings → Recalibrate).
- Runs alternate corridor sections that bias obstacles left/right/up (steering doses
  each movement) with Stretch Gate sections (rotation + holds).
- Casual Mode ignores all of the above and simply maps small yaw/pitch movements to
  the ship — the ship follows your head.

## Detection summary

| Signal | Source | Used for |
|---|---|---|
| Roll | facial transformation matrix | steering (Tech Neck), — (Casual) |
| Pitch | facial transformation matrix | climb/dive (both modes) |
| Yaw | facial transformation matrix | steering (Casual), Stretch Gates (Tech Neck) |
| Z-translation | facial transformation matrix | chin tuck / slouch watchdog |

All signals are smoothed (exponential moving average) and measured relative to the
calibrated neutral pose. Sensitivity is adjustable in Settings.
