import * as THREE from 'three';
import type { InputState, PhysicsEvent, RiderState, World } from './types';
import type { UpgradeMultipliers } from './garage';

/** The track coordinates constrain the race to a readable downhill corridor, while
 * wheel height probes and a world-space airborne integrator provide its weight. */
interface Dynamics {
  initialized: boolean;
  lastS: number;
  worldY: number;
  lateralVelocity: number;
  preload: number;
  wasCrouching: boolean;
  previousTrickInput: number;
  cooldown: number;
  trickId: number;
  trickTime: number;
  pendingScore: number;
  suspensionVelocity: number;
  recoveryTime: number;
  crashDirection: number;
}

const dynamics = new WeakMap<RiderState, Dynamics>();
const trickNames = ['', 'TABLETOP', 'X-UP', 'SUPERMAN', 'CAN-CAN', 'NO-HANDER', 'NAC-NAC', 'TAILWHIP', '360', 'BACKFLIP', 'FRONTFLIP'];
const trickScores = [0, 180, 150, 320, 280, 340, 260, 360, 420, 500, 550];
const trickDurations = [0, .80, .70, .85, .80, .82, .78, .82, .76, .72, .72];
const grip = { rock: .80, dirt: 1, grass: .67, scree: .62 };
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

function memory(state: RiderState): Dynamics {
  let value = dynamics.get(state);
  if (!value) {
    value = { initialized: false, lastS: state.s, worldY: 0, lateralVelocity: 0,
      preload: 0, wasCrouching: false, previousTrickInput: 0, cooldown: 0,
      trickId: 0, trickTime: 0, pendingScore: 0, suspensionVelocity: 0,
      recoveryTime: 0, crashDirection: 1 };
    dynamics.set(state, value);
  }
  return value;
}

export function resetPhysics(state:RiderState):void { dynamics.delete(state); }

export function crashRider(state: RiderState, direction = 1, suspDamp = 1): PhysicsEvent {
  const m = memory(state);
  state.crash = 1.45 / suspDamp;
  state.speed = Math.min(state.speed * 0.35, 5);
  state.compression = 0.85;
  state.trick = '';
  state.trickRotation = 0;
  m.recoveryTime = 0;
  m.crashDirection = direction;
  m.cooldown = 0.8;
  return { type: 'crash', force: 19 };
}

export function createRiderState(id: number, name: string, color: number): RiderState {
  return { id, name, color, s: 0, lateral: 0, speed: 0, y: 0, vy: 0,
    airborne: false, airTime: 0, pitch: 0, roll: 0, yaw: 0, lean: 0,
    compression: 0, cadence: 0, crash: 0, boost: .35, score: 0,
    trick: '', trickRotation: 0, finished: false, finishTime: 0,
    position: new THREE.Vector3(), velocity: new THREE.Vector3() };
}

export function updatePhysics(state: RiderState, input: InputState, world: World, dt: number, multipliers?: UpgradeMultipliers): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  dt = clamp(dt, 0, 1 / 30);
  const m = memory(state);
  const before = world.sample(state.s, state.lateral);
  const groundBefore = Math.abs(state.lateral) > before.width * .75
    ? Math.max(world.height(before.position.x, before.position.z), before.jump > 0 ? before.position.y : -Infinity)
    : before.position.y;
  // Debug seeking and checkpoint resets must never turn into enormous falls.
  if (!m.initialized || Math.abs(state.s - m.lastS) > 25) {
    m.initialized = true;
    m.worldY = groundBefore + state.y;
    m.lateralVelocity = 0;
    m.cooldown = .25;
    state.position.copy(before.position);
    state.position.y = m.worldY;
  }
  if (state.finished || dt === 0) return events;
  m.cooldown = Math.max(0, m.cooldown - dt);

  if (state.crash > 0) {
    state.crash = Math.max(0, state.crash - dt);
    m.recoveryTime += dt;
    state.speed = damp(state.speed, 0, 3.8, dt);
    state.s = Math.min(world.length, state.s + state.speed * dt * .45);
    state.lateral += m.crashDirection * Math.exp(-m.recoveryTime * 4) * dt * 2;
    const hit = world.sample(state.s, state.lateral);
    const ground = world.height(hit.position.x, hit.position.z);
    const surfaceY = Math.max(hit.position.y, ground);
    state.position.copy(hit.position);
    // Keep bike and rider naturally resting on top of the terrain surface (clearance ~0.26m)
    const bounce = Math.abs(Math.sin(m.recoveryTime * 8)) * 0.35 * Math.exp(-m.recoveryTime * 3);
    state.position.y = surfaceY + 0.26 + bounce;
    m.worldY = state.position.y;

    // A natural slide-out: roll tilts to ~75 degrees on the fall side, then smoothly rights back up
    const fallRollTarget = m.crashDirection * 1.32;
    const recoveryFactor = clamp(state.crash / 0.5, 0, 1);
    const targetRoll = fallRollTarget * recoveryFactor;
    state.roll = damp(state.roll, targetRoll, 8, dt);

    // Pitch follows the downhill slope of the ground so bike lies flush with terrain
    const slopePitch = Math.atan(hit.slope);
    state.pitch = damp(state.pitch, slopePitch, 6, dt);

    // Yaw slews slightly in the slide direction
    const baseYaw = Math.atan2(-hit.tangent.x, -hit.tangent.z);
    state.yaw = damp(state.yaw, baseYaw + m.crashDirection * 0.25 * recoveryFactor, 5, dt);

    state.compression = .85;
    state.velocity.copy(hit.tangent).multiplyScalar(state.speed);
    if (state.crash === 0) {
      state.airborne = false; state.y = 0; state.vy = 0;
      state.lateral = clamp(state.lateral, -hit.width * .35, hit.width * .35);
      state.speed = 7; state.roll = 0; state.trick = ''; state.trickRotation = 0;
      m.worldY = hit.position.y; m.cooldown = .6;
    }
    m.lastS = state.s;
    return events;
  }

  const surfaceGrip = grip[before.surface] * (multipliers?.tiresGrip ?? 1);
  const boosting = input.boost && state.boost > .005;
  if (boosting) state.boost = Math.max(0, state.boost - dt * .18);
  else state.boost = Math.min(1, state.boost + dt * .009);

  // Gravity, rolling losses and aerodynamic drag share units of m/s².
  const downhill = clamp(-before.slope, -.8, .95);
  const push = (input.pedal ? 5.8 : 1.4) * (multipliers?.drivetrainPush ?? 1);
  const rolling = before.surface === 'scree' ? 1.1 : .65;
  let acceleration = downhill * 17 + push + (boosting ? 11 : 0)
    - rolling - state.speed * state.speed * .0048;
  if (input.brake) acceleration -= 17 + state.speed * .19;
  if (Math.abs(state.lateral) > before.width * .48) acceleration -= 4.2;
  if (state.airborne) acceleration = (boosting ? 2 : 0) - state.speed * .018;
  const maxSpeed = (boosting ? 43 : 35) * (multipliers?.topSpeed ?? 1);
  state.speed = clamp(state.speed + acceleration * dt, 0, maxSpeed);

  const steer = clamp(input.steer, -1, 1);
  const slide = input.brake && state.speed > 12 ? .60 : 1;
  const steeringTarget = steer * (2.5 + state.speed * .13);
  m.lateralVelocity = damp(m.lateralVelocity, steeringTarget,
    (state.airborne ? 2 : 7 * surfaceGrip * slide), dt);
  // A little centrifugal drift gives berms and brake slides readable consequences.
  if (!state.airborne) m.lateralVelocity -= before.curvature * state.speed * state.speed * dt * .30;
  state.lateral += m.lateralVelocity * dt;
  const corridor = before.width * 1.18;
  if (Math.abs(state.lateral) > corridor) {
    state.lateral = clamp(state.lateral, -corridor, corridor);
    m.lateralVelocity *= -.18;
    state.speed *= Math.exp(-dt * 1.8);
  }
  state.s = Math.min(world.length, state.s + state.speed * dt);
  const sample = world.sample(state.s, state.lateral);
  const ground = Math.abs(state.lateral) > sample.width * .75
    ? Math.max(world.height(sample.position.x, sample.position.z), sample.jump > 0 ? sample.position.y : -Infinity)
    : sample.position.y;
  const front = world.sample(Math.min(world.length, state.s + .68), state.lateral);
  const rear = world.sample(Math.max(0, state.s - .68), state.lateral);
  if (state.s + .68 > world.length) {
    front.position.addScaledVector(front.tangent, state.s + .68 - world.length);
  }
  // The two heightfield wheel contacts are the raycast vehicle's suspension probes.
  const wheelPitch = clamp(Math.atan2(front.position.y - rear.position.y, 1.36), -.75, .75);
  const baseYaw = Math.atan2(-sample.tangent.x, -sample.tangent.z);
  const release = m.wasCrouching && !input.crouch;
  if (input.crouch && !state.airborne) m.preload = Math.min(1, m.preload + dt * 2.6);

  const hopMul = multipliers?.hopForce ?? 1;
  const crossedLip = (world.jumpLips && world.jumpLips.some(lip => m.lastS <= lip && state.s >= lip))
    || (before.jump > .55 && sample.jump < .25);
  const groundTrick = !state.airborne && input.trick > 0 && !input.crouch && state.speed > 4.5;
  const manualLaunch = !state.airborne && m.cooldown === 0 && (input.hop || release || groundTrick);

  if (crossedLip || manualLaunch) {
    const isFlipOrSpin = input.trick === 8 || input.trick === 9 || input.trick === 10;
    const launch = (crossedLip ? (isFlipOrSpin ? 6.2 : 5.2) : groundTrick ? (isFlipOrSpin ? 6.6 : 4.5) : 3.2) * hopMul;
    state.airborne = true;
    state.airTime = 0;
    const slopeLift = crossedLip
      ? clamp(before.slope * state.speed * 0.5, -1.0, 7.0)
      : clamp(before.slope * state.speed * 0.35, -2.0, 3.5);
    state.vy = slopeLift + launch + m.preload * 2.8 * hopMul;
    m.worldY = Math.max(groundBefore, ground, m.worldY) + .04;
    state.y = Math.max(.04, m.worldY - ground);
    m.cooldown = .45;
    m.preload = 0;
    m.pendingScore = 0;
    m.trickId = 0; m.trickTime = 0;
    events.push({ type: 'jump', force: state.vy });
  }
  if (!input.crouch) m.preload = Math.max(0, m.preload - dt * 5);
  m.wasCrouching = input.crouch;

  let targetCompression = input.crouch ? .6 + m.preload * .25 : .12;
  if (state.airborne) {
    state.airTime += dt;
    state.vy -= 18.5 * dt;
    m.worldY += state.vy * dt;
    if (m.worldY < ground) {
      if (sample.jump > 0.05) {
        // Prevent clipping into rising kicker ramps: keep bike flush with surface
        m.worldY = ground;
        state.vy = Math.max(state.vy, before.slope * state.speed * 0.4);
      }
    }
    state.y = Math.max(0, m.worldY - ground);
    targetCompression = .02;
    let requestedTrick = clamp(Math.floor(input.trick), 0, 10);
    if (!requestedTrick && state.airborne && state.airTime > 0.08 && !m.trickId) {
      if (input.brake && !input.pedal) requestedTrick = 9;
    }
    if (requestedTrick > 0 && !m.trickId && state.airTime > .01) {
      m.trickId = requestedTrick; m.trickTime = 0;
      state.trick = trickNames[requestedTrick];
      events.push({ type: 'trick', force: 0, score: 0, name: state.trick });
    }
    if (m.trickId) {
      m.trickTime += dt;
      const progress = clamp(m.trickTime / trickDurations[m.trickId], 0, 1);
      // Smooth rotations accelerate out of the pose and settle before touchdown.
      const smooth = progress * progress * (3 - 2 * progress);
      state.trickRotation = smooth * TAU;
      if (progress >= 0.35) {
        m.pendingScore = Math.round(trickScores[m.trickId] * Math.min(1, progress * 1.25));
      }
    }
    const trickAngle = state.trickRotation;
    const pose = Math.sin(Math.min(1, m.trickTime / (trickDurations[m.trickId] || 1)) * Math.PI);
    state.pitch = damp(state.pitch, wheelPitch, 2.5, dt);
    state.roll = damp(state.roll, -steer * .32 + (m.trickId === 1 ? pose * 1.15 : 0), 6, dt);
    state.yaw = baseYaw;
    if (m.trickId === 8) state.yaw += trickAngle;
    // Set absolute flip pitch so the damping cannot fight a completed rotation.
    if (m.trickId === 9) state.pitch = wheelPitch + trickAngle;
    if (m.trickId === 10) state.pitch = wheelPitch - trickAngle;
    if (state.y <= 0 && state.airTime > .10 && sample.jump <= 0.05) {
      const impact = Math.max(0, -(state.vy - sample.slope * state.speed));
      const angleError = Math.abs(Math.atan2(Math.sin(state.pitch - wheelPitch), Math.cos(state.pitch - wheelPitch)));
      // Forgiving ordinary jumps; committing to half a flip has real consequences.
      const badRotation = (m.trickId === 9 || m.trickId === 10) && angleError > 1.18;
      state.airborne = false; state.y = 0; state.vy = 0; m.worldY = ground;
      const suspDamp = multipliers?.suspensionDamp ?? 1;
      m.suspensionVelocity = Math.min(12, impact * .65 / suspDamp);
      state.compression = Math.min(.95, .2 + impact * .025);
      events.push({ type: 'land', force: impact });
      if (badRotation || impact > 39 * suspDamp) {
        state.crash = 1.45 / suspDamp; m.recoveryTime = 0;
        m.crashDirection = steer || (state.id % 2 ? -1 : 1);
        m.pendingScore = 0; state.trick = 'WIPEOUT';
        events.push({ type: 'crash', force: impact });
      } else {
        const clean = angleError < .5;
        state.speed *= clean ? .995 : .86;
        if (m.pendingScore > 0) {
          const points = Math.round(m.pendingScore * (clean ? 1.25 : 1));
          state.score += points;
          state.boost = Math.min(1, state.boost + points / 1500);
          events.push({ type: 'trick', force: impact, score: points, name: state.trick });
        }
        state.pitch = wheelPitch; state.yaw = baseYaw; state.trickRotation = 0;
        state.trick = ''; m.pendingScore = 0; m.trickId = 0;
      }
      m.cooldown = sample.jump > 0.15 ? 0 : .28;
    }
  } else {
    m.worldY = ground; state.y = 0; state.airTime = 0;
    state.pitch = damp(state.pitch, wheelPitch + (input.manual && state.speed > 3 ? .28 : 0), 10, dt);
    state.yaw = baseYaw - m.lateralVelocity * .012;
    state.roll = damp(state.roll, -steer * Math.min(.50, state.speed * .018) - THREE.MathUtils.clamp(sample.curvature*state.speed*1.25,-.38,.38), 8, dt);
    const roughness = sample.surface === 'scree' || sample.surface === 'rock' ? .045 : .015;
    targetCompression += Math.sin(state.s * 2.1) * roughness * Math.min(1, state.speed / 16);
  }
  if(!state.airborne&&m.cooldown===0)for(const rock of world.obstacles||[]){
    if(Math.abs(state.s-rock.s)<rock.radius+.4&&Math.abs(state.lateral-rock.lateral)<rock.radius+.3){
      const hard=state.speed>28&&Math.abs(state.lateral-rock.lateral)<rock.radius*.6;
      state.speed*=.73;state.compression=.85;m.suspensionVelocity=7;m.cooldown=.5;
      m.lateralVelocity+=(state.lateral>rock.lateral?1:-1)*2;events.push({type:'land',force:13});
      if(hard){state.crash=1.45/(multipliers?.suspensionDamp??1);m.recoveryTime=0;m.crashDirection=steer||(state.id%2?-1:1);events.push({type:'crash',force:19});}
      break;
    }
  }
  m.previousTrickInput = input.trick;

  // Critically damped suspension: the visual rig can stagger legs/spine/head behind it.
  m.suspensionVelocity += ((targetCompression - state.compression) * 125
    - m.suspensionVelocity * 18) * dt;
  state.compression = clamp(state.compression + m.suspensionVelocity * dt, 0, 1);
  state.lean = damp(state.lean, -steer * .65-THREE.MathUtils.clamp(sample.curvature*state.speed*1.4,-.4,.4), 7, dt);
  if (input.pedal && !state.airborne) state.cadence += dt * Math.min(13, 3 + state.speed * .35);
  state.position.copy(sample.position);
  state.position.y = m.worldY;
  state.velocity.copy(sample.tangent).multiplyScalar(state.speed);
  state.velocity.addScaledVector(sample.right, m.lateralVelocity);
  if (state.airborne) state.velocity.y = state.vy;
  m.lastS = state.s;
  return events;
}
