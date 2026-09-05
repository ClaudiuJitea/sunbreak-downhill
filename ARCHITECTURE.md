# SUNBREAK shared contracts

World is Y-up. Track progresses in world negative Z. Distances and velocities are meters and meters/second. `World.sample(s,lateral)` is the authoritative track surface at distance s, including jump ramp height. Right is perpendicular to tangent. RiderState.position is the ground/bike wheel contact point; y/vy are airborne height offset and vertical speed. Visual bikes face local -Z. Root owns integration and input. No module mutates another module's files.

- terrain.ts: createWorld(materialFactory): World, eroded heightmap, sculpted spline course, ribbons, scenery, terrain LOD.
- npr.ts: createMaterial(color,kind), addOutline(mesh,width?), class NPRPipeline(renderer,scene,camera), render(dt,speed,boost,impact), resize(w,h,dpr).
- physics.ts: createRiderState(id,name,color), updatePhysics(state,input,world,dt): PhysicsEvent[].
- rider.ts: createRider(materialFactory,color): RiderVisual.
- race.ts: Race controller and AI (interfaces agreed before implementation).
- presentation.ts: camera and pooled speed/impact scene FX.
- hud.ts and audio.ts: interface UI and synthesized sound.
- main.ts: lifecycle, fixed timestep, input, debug API, adaptive resolution, replay.

Assets must all be generated locally. No network at runtime. Fixed physics 120Hz, capped catchup. Persistent ghost samples at 10Hz. Shared terrain/material API is stable; ask root before changing.

Capture API on window.__SUNBREAK: ready:boolean; start(); reset(); seek(progress:number); step(frames:number); camera(angle:'chase'|'side'|'front'|'wide'); state(); input(partial); paused:boolean. Harness uses ?capture=1 for deterministic manual stepping. capture script creates full retina frames and a WebM video.
