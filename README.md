# Floor ∞: Backpack Dash

An offline-first endless pixel runner starring Mini Ryan. Sprint through Office 404, Neon Rooftop, Midnight Subway, and Server Basement, collect lost pixels, and survive as long as possible.

Each floor targets about 28 seconds of running. Floor distance scales from 8,400 pixels at the starting speed to 15,960 pixels at the speed cap, so later floors do not get shorter as Ryan accelerates.

The game generates the soundtrack and effects live with Web Audio: each theme has its own lead pattern and timbre, with bass, drums, higher-floor intensity layers, and synthesized cues for starts, jumps, landings, pickups, clean floors, pause/resume, failure, and new bests. Every level-up gets a three-part elevator sequence (mechanical entry/door close, a rising travel chime, a brighter exit/door-open cue) with pitch and timbre variations based on the destination floor and theme.

On the title screen, Mini Ryan cycles through `ryan-review`, `ryan-waiting`, `ryan-working`, and `ryan-idle`. The title sprite runs at one-fifth of the regular animation clock, so it draws 1.2 to 1.4 frames per second. Pointer gaze briefly interrupts the loop and then hands control back to it. Browsers block audible autoplay before a gesture, so `PREVIEW TITLE MUSIC` starts the title soundtrack without starting the run.

## Play locally

Requirements: pnpm and Node.js 20.19+, 22.12+, or 24+.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The game uses a fixed `960×540` logical canvas and scales to the browser window.

Controls:

- `Space`, `Arrow Up`, click, or tap: jump. Hold briefly for a higher jump.
- `P` or `Escape`: pause or resume.
- `M`: mute or unmute.

## Production build

```bash
pnpm build
pnpm preview
```

Vite writes the static production bundle to `dist/`. It has no backend, analytics, account, or runtime network dependency. The browser stores the mute preference, the best score, distance, and floor, and the last 5 runs (score, distance, floor, lost pixels, clean floors, seed, and an ISO completion timestamp) under `mini-ryan-backpack-dash:v1`.

To reproduce a run, append a seed to the URL:

```text
http://127.0.0.1:5173/?seed=floor-404
```

## Verification

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm test:soak
```

The tests cover scoring, save recovery, seeded generation, jump timing, animation mappings, 3,000 generated-floor simulations, responsive browser controls, pause/mute behavior, game-over retry, package privacy, and a five-minute object-pool/frame-rate soak.

## Asset provenance

`public/assets/mini-ryan.webp` is a byte-for-byte copy of the installed Mini Ryan v2 pet atlas. This project excludes the source portrait and the pet-generation working files.

The game renders the physics player and the visible character separately. The hitbox stays fixed at `74×160` while the visible sprite takes per-frame corrections on the five jump frames: scale 0.713 to 0.767 against the 0.56 base, y offsets of -21 to +21 pixels, and angles within 1 degree. The original atlas stays unchanged and the collision shape stays consistent.
