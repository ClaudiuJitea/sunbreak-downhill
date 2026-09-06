# SUNBREAK — Downhill Club

<p align="center">
  <img src="media/SUNBREAK-showcase-poster.jpg" alt="Four cel-shaded BMX riders racing down the SUNBREAK mountain course" width="100%">
</p>

<p align="center"><strong>Four riders. Five mountain stages. Full send.</strong></p>

A procedural, cel-shaded BMX downhill racing game. Four riders tear down high-speed alpine switchbacks, granite slate corridors, terracotta canyon gaps, and deep mossy glades. Every mesh, terrain heightfield, procedural texture, sound synthesizer, and animation rig is generated purely in code—with zero downloaded 3D models, textures, or external runtime assets.

## Highlights

- **5 Distinct Mountain Courses & Environments**:
  - *The Sunbreak Descent*: Golden alpine morning, cedar switchbacks, rock gardens, and a canyon ravine gap.
  - *Ridge Runner*: Cool morning slate, sheer granite drops, pine chicanes, and double rollers.
  - *Gravity Lab*: High-altitude azure skies, manicured turf, step-downs, mega tables, and massive slopestyle kickers.
  - *Red Dust Canyon*: Apricot desert skies, terracotta sandstone, slickrock ridges, and canyon gap jumps.
  - *Black Forest Slalom*: Twilight moss, hemlock root carpets, steep chasm descents, and tight technical berms.
- **Multi-Stage Championship Tour**:
  - 5-stage Grand Prix campaign with cumulative points standings (`25-18-15-12`), style point conversion bonuses, podium ceremonies, and championship trophy presentation.
  - Switch freely between Championship Tour and Single Race modes.
- **Pro Shop / Bike Garage**:
  - **Performance Upgrades**: Invest podium prize credits across 4 tuning categories: Tires (grip & cornering), Frame (impact absorption & stability), Drivetrain (acceleration & top speed), and Springs (bunny hop launch height).
  - **Paint Shop**: Customize frame finishes (8 colorways), jersey styles (6 team designs), and helmet accents (6 colors), saved persistently to `localStorage`.
- **Full Air Trick System (10 Unique Stunts)**:
  - Master Tabletop, X-Up, Superman (with horizontal body kickout), Can-Can, No-Hander, Nac-Nac, Tailwhip, 360 Spin, Backflip, and Frontflip.
  - Preload hop release bonus and snappy rotation windows (`0.72s`–`0.85s`) enable clean launches and landings off both small trail rollers and mega cliffs.
- **Hard Touch Lateral Collisions**:
  - High-speed lateral impacts, sideswipes, and mid-air collisions trigger mutual crashes for both the player and AI opponents.
- **Natural Crash Dynamics & Surface Clearance**:
  - Fallen bikes and athletes slide along the terrain surface with calculated positive clearance ($+0.22\text{ m}$), eliminating mesh clipping and ground sinking.
- **Procedural 3D Race Number Badges**:
  - Procedural geometric digit badges assigned across competitors (Player: `#07`, Jun: `#14`, Kai: `#23`, Niko: `#42`, Ghost: `#00`).
- **Optional Best-Run PB Ghost**:
  - Toggle personal best wireframe ghost replay via HUD toggle button, hotkey (`G`), or settings.
- **Unified Cel-Shaded Art Direction**:
  - Pure WebGL2/Three.js custom shaders featuring multi-pass ink outlines, Sobel normal/depth edge detection, directional hatch shadows, stepped atmospheric fog, rim lighting, lens flare, motion blur, and weather visor droplets.
- **Procedural Web Audio Engine**:
  - Real-time synthesized audio layers: tire hum, scree gravel crunch, wind rushing, chain rattle, air whooshes, collision impacts, horn blasts, and dynamic musical soundtrack.

## Run

Requires Node.js 22.12+ (Node 24 recommended) and a modern browser with WebGL2 support.

```sh
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`), then click **Drop in** or press **Enter**. Audio initializes on user interaction. 

To build for production:
```sh
npm run build      # TypeScript validation & Vite bundle build
npm run preview    # Preview production build locally
```

## Ride & Controls

| Input | Action |
| --- | --- |
| **W** / **↑** | Pedal / Accelerate |
| **A** **D** / **←** **→** | Steer / Choose line |
| **S** / **↓** | Brake; slide while steering (or in air: Backflip shortcut) |
| **Space** *(hold & release)* | Preload suspension, then hop; time release with the lip for extra height |
| **Shift** | Spend boost |
| **C** | Manual / Wheelie |
| **1** | Tabletop (180 pts) |
| **2** / **X** | X-Up (150 pts) |
| **3** | Superman (320 pts) |
| **4** | Can-Can (280 pts) |
| **5** / **N** | No-Hander (340 pts) |
| **6** | Nac-Nac (260 pts) |
| **7** / **Space + D** | Tailwhip (360 pts) |
| **8** / **Space + A** | 360 Spin (420 pts) |
| **9** / **B** / **Space + S** | Backflip (500 pts) |
| **0** / **Space + W** | Frontflip (550 pts) |
| **G** | Toggle Ghost Rider on / off |
| **T** | Cycle track (in menu / pause) |
| **V** | Toggle dawn / rain weather |
| **F** | Toggle full / reduced visual effects |
| **M** | Mute / unmute audio |
| **R** | Restart current race countdown |
| **Esc** / **P** | Pause / resume; view controls |

Land completed tricks cleanly to bank style points and earn extra boost. Incomplete rotations or landing off-axis will cause a spill. 

Opponent AI profiles:
- **JUN**: Disciplined lines, high cornering speed, smooth lines.
- **KAI**: Aggressive overtaker, hits kickers hard, attempts high-risk air tricks.
- **NIKO**: Unpredictable line choices, drafts opportunistically, tactical speed changes.

## Game Modes & Garage

### Championship Tour
Select **Championship** on the title menu to enter the 5-stage Grand Prix:
- Stages 1–5 rotate through *The Sunbreak Descent*, *Ridge Runner*, *Gravity Lab*, *Red Dust Canyon*, and *Black Forest Slalom*.
- Position points awarded per stage: 1st (25 pts), 2nd (18 pts), 3rd (15 pts), 4th (12 pts), plus style bonus credits based on air trick score.
- Cumulative leaderboard tracked between rounds with stage progression and final awards podium.

### Pro Shop / Garage
Access the **Pro Shop** from the title screen to tune your machine and gear:
- **Tires**: Enhances cornering grip and reduces lateral slide on loose scree.
- **Suspension**: Softens harsh landings, shortens crash recovery downtime, and stabilizes rough terrain traversal.
- **Drivetrain**: Increases pedaling acceleration and raises top downhill speed.
- **Springs**: Increases preload hop impulse for massive airtime off jump lips.
- **Paint Shop**: Real-time palette updates for frame, jersey, and helmet finishes.

## Visual Effects & Renderer

Full effects are active by default and can be toggled using **F** or the HUD toggle button:
- **Speed & Boost Effects**: Peripheral radial motion blur, chromatic aberration pulses, and aerodynamic wind streak geometry that intensify with boost.
- **Screen-Space Reflections & Glints**: Stylized SSR rays reflect track environment and water on gloss bike frames and visors.
- **Dynamic Weather System**: Toggle between clear dawn golden hour and driving alpine rain (**V**). Visor glass catches refractive raindrops that drain as you gain downhill speed.
- **Particle Systems**: GPU-instanced dust plumes, aggressive brake skid smoke, water spray when crossing rivers, and sparks during metal-on-rock crashes.
- **Camera Presentation**: Smooth spring chase camera with pitch lookahead, high-G impact vibration, and dynamic air orbit angles during ravine leaps.

## Source Map

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | 120 Hz fixed-step loop, game lifecycle, stage switching, replay recording, ghost playback |
| `src/terrain.ts` | 5 course spline geometries, hydraulic erosion heightfields, biome colorways, vegetation, and jumps |
| `src/types.ts` | Shared type contracts for world, tracks, input, rider dynamics, garage, and championship |
| `src/championship.ts` | 5-stage tour logic, point scoring tables, stage transitions, and local storage persistence |
| `src/garage.ts` | Bike upgrades, stat multipliers, paint shop presets, credit bank, and garage state persistence |
| `src/npr.ts` | Cel-shading passes, MRT color/normal-depth, Sobel outlines, hatch shadows, rim lighting, stepped fog |
| `src/physics.ts` | Multi-wheel suspension, grip, preload bunny hops, air physics, 10 tricks, and mutual collisions |
| `src/rider.ts` | Procedural BMX bike, athletic athlete rig, analytic two-bone IK, 3D digit badges, and crash poses |
| `src/race.ts` | AI behavior trees, drafting, hard touch collisions, checkpoints, split times, and placements |
| `src/presentation.ts` | Spring chase camera, FOV scaling, air orbit, screen shake, and impact effects |
| `src/trail-effects.ts` | Particle pools for dust, scree pebbles, brake smoke, water spray, and crash sparks |
| `src/screen-effects.ts` | Post-processing shaders: motion blur, visor droplets, lens flare, bloom, and speed strokes |
| `src/hud.ts`, `src/style.css` | UI layer: speedometer, boost gauge, trick alerts, garage modals, championship tables |
| `src/audio.ts` | Procedural Web Audio: oscillators, noise filters, wind layers, chain rattle, horns, and music |

## Verification & Automated Tests

The test suite exercises game physics, AI, visual state, championship progression, garage upgrades, and rendering pipelines in headless Chromium:

```sh
npm test
```

All **22 browser gameplay, visual, and systems checks pass**, verifying:
1. Title screen loading with 0 WebGL/shader errors.
2. 3-second countdown and 4-rider race start.
3. Pedaling physics and forward course advancement.
4. Steering authority and lateral line choice.
5. Braking deceleration and speed scrubbing.
6. Preload suspension release producing bunny hops.
7. Pause / resume game state freeze.
8. Ravine jump launch and clean landing.
9. Full/reduced effects toggle, rain wetness onset, and visor draining.
10. Finish line trigger, results screen, best-run PB ghost persistence, and race reset.
11. 5-course track selector switching between distinct environments, elevations, and seedings.
12. Ghost rider toggle via HUD button, hotkey (`G`), and `localStorage`.
13. Garage upgrades purchasing, credit deduction, and paint shop customization.
14. Championship Tour multi-stage grand prix flow and stage advance.
15. Superman and aerial trick execution during big jumps.
16. Backflip, frontflip, and 360 spin execution, rotation, and clean landing.
17. Crash slide damping and natural rest orientation.
18. Hard touch lateral collisions causing mutual wipeouts.
19. Environmental biomes (distinct sky horizons, fog colors, and terrain palettes).
20. Championship Next Stage button click and stage progression.
21. Procedural 3D digit race badges on competitor jerseys (`#07`, `#14`, `#23`, `#42`).
22. Crashed rider elevation remaining visible flush above ground without sinking.

```sh
npm run capture           # Generate 2880×1800 high-res stills and state reports
npm run capture:motion    # Record 30 fps simulated motion sequences and WebM clips
```

## Project Status

SUNBREAK is a feature-complete, standalone web racing game requiring no external network dependencies or downloaded assets. All geometry, biome scenery, shaders, animations, and sound effects run client-side in pure WebGL2 and Web Audio.

