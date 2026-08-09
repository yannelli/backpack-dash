# Floor ∞: Backpack Dash

An offline-first endless pixel runner starring Mini Ryan. Sprint through Office 404, Neon Rooftop, Midnight Subway, and Server Basement, collect lost pixels, and survive as long as possible.

Each floor targets about 28 seconds of running. Floor distance scales from 8,400 pixels at the starting speed to 15,960 pixels at the speed cap, preventing later floors from becoming shorter as Ryan accelerates.

The soundtrack and effects are generated live with Web Audio: each theme has its own lead pattern and timbre, with bass, drums, higher-floor intensity layers, and synthesized cues for starts, jumps, landings, pickups, clean floors, pause/resume, failure, and new bests. Every level-up gets a three-part elevator sequence—mechanical entry/door close, a rising travel chime, and a brighter exit/door-open cue—with pitch and timbre variations based on the destination floor and theme.

On the title screen, Mini Ryan slowly cycles through reviewing/thinking, waiting, checking-in, and idle animation states. The title sprite runs at one-fifth of the regular animation clock, producing roughly 1.2–1.4 frames per second. Pointer gaze briefly interrupts the loop and then hands control back to it. Browsers block audible autoplay before a gesture, so `PREVIEW TITLE MUSIC` starts the title soundtrack without starting the run.

## Play locally

Requirements: Node.js 22.12 or newer and pnpm.

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

The static production bundle is written to `dist/`. It has no backend, analytics, account, or runtime network dependency. Scores and the mute preference are stored only in the browser under `mini-ryan-backpack-dash:v1`.

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

The tests cover scoring, save recovery, seeded generation, jump timing, animation mappings, 3,000 generated-floor simulations, responsive browser controls, pause/mute behavior, game-over retry, package privacy, and an explicit five-minute object-pool/frame-rate soak.

## Asset provenance

`public/assets/mini-ryan.webp` is a byte-for-byte copy of the installed, validated Mini Ryan v2 pet atlas. The source portrait and pet-generation working files are intentionally excluded from this project.

The game renders the physics player and visible character separately. Small per-frame jump-row scale, registration, and angle corrections are applied at runtime, so the original atlas stays unchanged and the collision shape stays consistent.
