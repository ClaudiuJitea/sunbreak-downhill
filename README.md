# SUNBREAK — Downhill Club

<p align="center">
  <img src="media/SUNBREAK-showcase-poster.jpg" alt="Four cel-shaded BMX riders racing down the SUNBREAK mountain course" width="100%">
</p>

<p align="center"><strong>Four riders. One mountain. Full send.</strong></p>

A procedural, cel-shaded BMX race down Mt. Komorebi. Four riders tear through a 2.3 km point-to-point descent with summit switchbacks, rock gardens, two major jumps, a ravine and a riverside finish. Every mesh, texture and sound is generated in code—there are no downloaded game assets or runtime services.

## Highlights

- A complete 2.3 km point-to-point race against three distinct AI riders
- Arcade bike physics with two-wheel suspension, grip, braking, lean, preload, hops, tricks and crashes
- Procedural rider animation with locked hand/foot contacts, two-bone IK and sequenced landing absorption
- A unified cel-shaded renderer with ink outlines, Sobel edges, hatch shadows, rim light, stepped fog and graphic post effects
- Procedurally eroded terrain, spline-built trail, instanced forests, rock gardens, switchbacks and two major jumps
- Rain, visor droplets, reflections, dust, water spray, sparks, speed lines, impact frames and adaptive resolution
- Generated Web Audio soundtrack and effects, plus checkpoints, splits, boost, scoring, saved ghosts and replay

## Run

Requires Node.js 22.12+ (Node 24 recommended) and Chrome with WebGL2.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, then click **Drop in** or press **Enter**. Audio starts on that interaction. `npm run build` checks TypeScript and builds `dist`; `npm run preview` serves that build.

## Ride

| Input | Action |
| --- | --- |
| W / ↑ | Pedal |
| A D / ← → | Choose your line |
| S / ↓ | Brake; slide while steering |
| Space, hold then release | Preload suspension, then hop; time release with the lip |
| Shift | Spend boost |
| C | Manual |
| 1–7 while airborne | Tabletop, x-up, superman, tailwhip, 360, backflip, frontflip |
| Esc / P | Pause / resume; view controls |
| R | Restart countdown |
| M | Mute / unmute |
| V | Toggle dawn / rain weather |
| F | Toggle full / reduced visual effects |

Land a completed trick cleanly to bank style points and boost. Poor rotation alignment costs speed or causes a tumble. JUN takes precise lines, KAI attacks and attempts risky tricks, and NIKO varies pace and line choice. Checkpoint splits and your best-run ghost persist in local browser storage. Clearing site data resets them. The finish plays a recorded cinematic air sequence and then shows results.

## Visual effects

Full effects are enabled by default. The buttons at the upper right also control **F** (full/reduced effects) and **V** (dawn/rain). The effects preference is saved locally.

- Speed-dependent peripheral motion blur and wind streaks intensify with boost. The rider, HUD and central racing line stay sharp.
- Rough rock and scree add small camera vibrations; hard landings and crashes retain stronger impact shake. Reduced effects suppress these camera vibrations.
- Shiny frames, helmets and water use short screen-space reflection rays for visible scenery, with painted sky/ground bands when no reflected surface is visible. Reflections cannot show offscreen objects and remain stylized rather than PBR.
- Stronger graphic bloom and sun-aligned lens flare respond to highlights. Depth probes suppress flare behind terrain and trees.
- The dawn sun moves slowly, changing local cast shadows. Rain adds varying cloud shade.
- Rain streaks and refractive visor droplets appear in wet weather. River mist wets the lens near the lower course; droplets drain gradually after leaving wet conditions.
- Fixed particle pools generate translucent cel dust, heavier braking plumes, metal-on-rock sparks, landing bursts and water spray. Particles preserve the normal/depth buffer, avoiding black rock-like outlines on dust.
- Restrained depth of field softens distant scenery, with stronger focus separation in side/front cameras and replays.

The production build and **10 browser gameplay/effects checks pass**, including rain onset, drying, and full/reduced effect controls.

## Source map

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | Fixed 120 Hz simulation, lifecycle, replay recording, ghost playback, adaptive resolution |
| `src/types.ts` | World, track, input, physics and rider contracts |
| `src/terrain.ts` | Seeded noise, hydraulic erosion, spline course carving, clipmap grids, vegetation, signs |
| `src/npr.ts` | Per-material cel ramps, MRT color/normal-depth, hull outlines, Sobel creases, hatching, rim/specular, cast shadows, stepped fog, sky/clouds, LUT and graphic post effects |
| `src/physics.ts` | Wheel-height suspension probes, grip, preload, airborne integration, tricks and recovery |
| `src/rider.ts` | Generated bicycle, athletic rig, analytic two-bone IK, delayed compression and trick poses |
| `src/race.ts` | Countdown, AI, contacts, checkpoints, placements and best-run persistence |
| `src/presentation.ts` | Spring camera, FOV, air orbit, rough-surface and impact shake |
| `src/trail-effects.ts` | Fixed dust, spark and water-spray pools |
| `src/screen-effects.ts` | Motion blur, depth of field, screen-space reflections, flare, speed strokes and wet-lens shaders |
| `src/hud.ts`, `src/style.css` | Interface, controls and results |
| `src/audio.ts` | Generated noise, oscillators, tire/wind/chain layers, horns and impacts |

Terrain uses a 257² eroded heightfield with 14,500 sediment-carrying droplets. Eight nested clipmap levels rebuild in a staggered buffer and swap together. A generated course mask prevents coarse terrain triangles from covering the precise trail apron. Vegetation is instanced in spatial groups and scales through distance transitions. The NPR geometry pass writes color and normal/depth together. A separate hard shadow map and fullscreen compositing pass complete the frame. No PBR materials, cubemaps, model loaders or external media are used.

## Capture and tests

The development harness requires a Playwright browser, separate from running the game:

```sh
npx playwright install chromium
npm test
# With npm run dev already running:
npm run capture
npm run capture:motion
node scripts/review.mjs captures/motion
```

`npm test` starts its own Vite server and exercises game behavior in headless Chromium. To use an existing server: `GAME_URL='http://localhost:5173/?capture=1' npm test`. Tests can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or an installed macOS Google Chrome when the Playwright binary is missing.

`npm run capture` writes 2880×1800 stills from five course positions, an ordered motion sequence, a WebM, and a JSON error/state report under `captures/review/`. `CAPTURE_NAME` selects another output directory and `GAME_URL` changes the server. The review script makes a contact sheet and a standalone frame scrubber.

`?capture=1` exposes a deterministic, manually stepped `window.__SUNBREAK` interface:

```js
__SUNBREAK.start();
__SUNBREAK.seek(0.42);                  // normalized course position
__SUNBREAK.camera('side');             // chase, side, front, wide
__SUNBREAK.input({ pedal: true, trick: 6 });
__SUNBREAK.step(60);                   // 60 fixed display steps
__SUNBREAK.state();                    // race, physics, render counters
__SUNBREAK.paused = false;             // enable real-time animation
```

`npm run capture:motion` records two sequences at 30 simulated frames per second: riding and a ravine backflip/landing. It writes every frame and state, then uses Playwright’s existing FFmpeg binary to encode clips at the simulation cadence. `FFMPEG_PATH` can specify another encoder. The basic `capture` WebM contains browser capture timing, including screenshot overhead. Neither capture method proves real-time hardware performance.

`npm run perf` measures 300 real-time animation frames and records the renderer identity and percentiles in `captures/performance.json`. In this environment Chromium selected **SwiftShader software rendering**, even without an override: p50 233 ms, p95 350 ms, adaptive DPR 1. Those results cannot certify the target Apple GPU. The 60 fps requirement remains unverified.

## Project status

SUNBREAK is a complete playable race with a start, finish, AI competition, scoring, saved ghost and cinematic replay. The renderer adapts pixel ratio to protect frame pacing; a locked retina 60 fps on every target configuration has not been independently certified.

Practical implementation limits:

- The bicycle follows track coordinates with height probes and world-height flight. It is an arcade vehicle, not an unconstrained rigid-body bicycle. Reverse/wrong-way riding is not available.
- Crash recovery tumbles the articulated assembly. It is not a separate ragdoll/constraint solver.
- Hands and feet keep their contact targets. Consequently superman and tailwhip are constrained stylizations, not competition-correct detached poses.
- Trees primarily use faceted layered canopies. They are not a complete billboard-cross LOD system. Tree and rock hull outlines are present; true curvature-driven line weight and elaborate motion smears remain limited.
- Cast shadows use a local, hard-threshold shadow map; there is no full mountain-wide shadow solution. Terrain erosion is real, but the coarse field and authored course carve limit the visible geological detail.
- Adaptive pixel ratio trades rendering resolution for frame time. Its purpose is responsiveness, not proof of a simultaneous retina-resolution and 60 fps lock.
- Best-run ghost samples record track progress and lateral line; they do not reproduce the complete airborne pose. The cinematic replay does record full rider state.

The nine system milestones are integrated into one runnable build. Separate historical milestone builds were not archived.
