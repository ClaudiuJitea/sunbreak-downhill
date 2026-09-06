import * as THREE from 'three';
import { createRiderState, updatePhysics, crashRider, resetPhysics } from './physics';
import type { InputState, PhysicsEvent, RiderState, World } from './types';
import type { UpgradeMultipliers } from './garage';

export type RacePhase = 'title' | 'countdown' | 'racing' | 'paused' | 'results';
export interface GhostSample { s: number; lateral: number; time: number }
const SAVE_KEY = 'sunbreak.best.v1';
const emptyInput = (): InputState => ({ steer: 0, pedal: false, brake: false,
  crouch: false, hop: false, boost: false, manual: false, trick: 0 });
const clamp = THREE.MathUtils.clamp;
const formatTime = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`;

/** Race owns the clock, checkpoints and AI intent. Every competitor runs through
 * exactly the same bicycle integrator; rubber-banding only nudges acceleration. */
export class Race {
  readonly riders: RiderState[] = [];
  inputOverride?: (rider:RiderState,input:InputState,dt:number)=>void;
  multipliers?: UpgradeMultipliers;
  phase: RacePhase = 'title';
  elapsed = 0;
  countdown = 3;
  best = 0;
  split = '';
  ghost: GhostSample[] = [];
  biggestAir = { s: 0, height: 0, duration: 0 };
  checkpoint = 0;
  wrongWay = false;
  private readonly order: RiderState[] = [];
  private readonly aiInputs = [emptyInput(), emptyInput(), emptyInput()];
  private readonly neutral = emptyInput();
  private recording: GhostSample[] = [];
  private recordClock = 0;
  private beforePause: RacePhase = 'racing';
  private jumpStart = 0;
  private jumpHeight = 0;
  private previousAirborne = false;
  private checkpointTimes: number[] = [];
  private ghostCheckpointTimes: number[] = [];
  private readonly aiMistakeClock = [14, 36, 20];
  private aiHops = [false, false, false];

  constructor(readonly world: World) {
    this.loadBest();
    this.placeRiders();
  }

  get player(): RiderState { return this.riders[0]; }
  get position(): number { return this.order.indexOf(this.player) + 1; }
  get standings(): readonly RiderState[] { return this.order; }
  get gapToLeader(): number { return Math.max(0, (this.order[0].s - this.player.s) / Math.max(8, this.player.speed)); }

  start(): void {
    if (this.phase === 'paused') { this.togglePause(); return; }
    if (this.phase === 'racing' || this.phase === 'countdown') return;
    this.reset();
  }

  reset(): void {
    this.elapsed = 0; this.countdown = 3; this.checkpoint = 0; this.split = '';
    this.recording = []; this.recordClock = 0; this.checkpointTimes = [];
    this.biggestAir = { s: 0, height: 0, duration: 0 };
    this.previousAirborne = false; this.jumpHeight = 0;
    this.aiMistakeClock[0] = 14; this.aiMistakeClock[1] = 36; this.aiMistakeClock[2] = 20;
    this.aiHops = [false, false, false];
    this.placeRiders();
    this.phase = 'countdown';
  }

  togglePause(): void {
    if (this.phase === 'paused') this.phase = this.beforePause;
    else if (this.phase === 'racing' || this.phase === 'countdown') {
      this.beforePause = this.phase;
      this.phase = 'paused';
    }
  }

  /** Deterministic capture/debug seek. Progress is normalized to the whole course. */
  seek(progress: number): void {
    const s = clamp(progress, 0, .999) * this.world.length;
    this.elapsed = s / 23;
    this.phase = 'racing'; this.countdown = 0;
    this.checkpoint = this.world.checkpoints.filter(checkpoint => checkpoint <= s).length;
    this.recording = []; this.recordClock = 0; this.previousAirborne = false;
    const defaultLaterals = [0, -1.8, 1.8, -1.8];
    const sOffsets = [0, 18, -18, -36];
    for (const rider of this.riders) {
      resetPhysics(rider);
      rider.lateral = defaultLaterals[rider.id] ?? 0;
      rider.s = clamp(s + (sOffsets[rider.id] ?? 0), 0, this.world.length - 1);
      rider.speed = 24; rider.y = 0; rider.vy = 0; rider.airborne = false;
      rider.airTime = 0; rider.crash = 0; rider.trick = ''; rider.trickRotation = 0;
      rider.finished = false; rider.finishTime = 0;
      const at = this.world.sample(rider.s, rider.lateral);
      rider.position.copy(at.position);
      rider.pitch = Math.atan(at.slope);
      rider.yaw = Math.atan2(-at.tangent.x, -at.tangent.z);
      updatePhysics(rider, this.neutral, this.world, 0);
    }
    this.sortRiders();
  }

  update(input: InputState, dt: number): PhysicsEvent[] {
    if (this.phase === 'title' || this.phase === 'paused' || this.phase === 'results') return [];
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) this.phase = 'racing';
      return [];
    }
    this.elapsed += dt;
    const events = updatePhysics(this.player, input, this.world, dt, this.multipliers);
    for (let i = 1; i < this.riders.length; i++) {
      const rider = this.riders[i];
      if (rider.finished) continue;
      this.thinkAI(rider, this.aiInputs[i - 1], dt);
      this.inputOverride?.(rider,this.aiInputs[i-1],dt);
      updatePhysics(rider, this.aiInputs[i - 1], this.world, dt);
      // Maximum ±1.1 m/s²: enough to keep another jersey in view, never teleport.
      const behind = this.player.s - rider.s;
      rider.speed = Math.max(0, rider.speed + clamp(behind / 75, -.7, 1.1) * dt);
    }
    this.resolveContacts(dt, events);
    for (const rider of this.riders) {
      if (!rider.finished && rider.s >= this.world.length - .15) {
        rider.finished = true; rider.finishTime = this.elapsed;
      }
    }
    this.sortRiders();
    this.updateCheckpoints();
    this.updateAir();
    this.recordClock += dt;
    if (this.recordClock >= .1) {
      this.recordClock -= .1;
      this.recording.push({ s: this.player.s, lateral: this.player.lateral, time: this.elapsed });
    }
    this.wrongWay = this.player.speed > 1 && this.player.velocity.dot(this.world.sample(this.player.s).tangent) < -1;
    if (this.player.finished) {
      this.phase = 'results';
      for (const rider of this.riders) {
        if (!rider.finished) {
          const remaining = Math.max(0, (this.world.length - .15) - rider.s);
          rider.finishTime = this.elapsed + Math.max(.35, remaining / Math.max(14, rider.speed));
          rider.finished = true;
          rider.speed = Math.max(0, rider.speed * .5);
        }
      }
      this.sortRiders();
      if (this.best === 0 || this.elapsed < this.best) {
        this.best = this.elapsed; this.ghost = this.recording.slice();
        this.ghostCheckpointTimes = this.checkpointTimes.slice();
        try {
          const trackId = this.world.trackId ?? 0;
          const trackKey = `sunbreak.best.track_${trackId}.v1`;
          const data = JSON.stringify({ version: 1, time: this.best,
            ghost: this.ghost, checkpoints: this.ghostCheckpointTimes });
          localStorage.setItem(trackKey, data);
          if (trackId === 0) localStorage.setItem(SAVE_KEY, data);
        } catch { /* Racing remains available when browser storage is disabled. */ }
      }
    }
    return events;
  }

  private placeRiders(): void {
    this.riders.splice(0, this.riders.length,
      createRiderState(0, 'RIN', 0xe97b45), createRiderState(1, 'JUN', 0x47bfae),
      createRiderState(2, 'KAI', 0xe9bc55), createRiderState(3, 'NIKO', 0xa695d5));
    const lanes = [-.95, .95, -.95, .95];
    for (const rider of this.riders) {
      rider.s = rider.id < 2 ? 4 : 1;
      rider.lateral = lanes[rider.id];
      const sample = this.world.sample(rider.s, rider.lateral);
      rider.position.copy(sample.position);
      rider.yaw = Math.atan2(-sample.tangent.x, -sample.tangent.z);
      rider.pitch = Math.atan(sample.slope);
      updatePhysics(rider, this.neutral, this.world, 0);
    }
    this.order.splice(0, this.order.length, ...this.riders);
    this.sortRiders();
  }

  private thinkAI(rider: RiderState, input: InputState, dt: number): void {
    const index = rider.id - 1;
    const sample = this.world.sample(rider.s, rider.lateral);
    const ahead = this.world.sample(Math.min(this.world.length, rider.s + 9 + rider.speed * .55));
    // JUN: precise, KAI: late braking and showy, NIKO: wandering but opportunistic.
    const clean = rider.id === 1;
    const aggressive = rider.id === 2;
    let lane = (rider.id - 2) * .85;
    lane += Math.sin(rider.s * (clean ? .016 : .055) + rider.id * 2) * (clean ? .18 : aggressive ? .42 : .82);
    lane -= clamp(ahead.curvature * 60, -.9, .9);
    for (const other of this.riders) {
      if (other.id === rider.id || other.s < rider.s - .8 || other.s > rider.s + 14) continue;
      if (Math.abs(other.lateral - rider.lateral) < 1.15) lane += rider.lateral >= other.lateral ? 1.3 : -1.3;
    }
    for(const rock of this.world.obstacles||[])if(rock.s>rider.s&&rock.s<rider.s+18&&Math.abs(lane-rock.lateral)<1)lane=rock.lateral+(lane>rock.lateral?1.5:-1.5);
    lane = clamp(lane, -sample.width * .34, sample.width * .34);
    input.steer = clamp((lane - rider.lateral) * .9, -1, 1);
    const catchup=clamp((this.player.s-rider.s)/18,-2,6);
    const turnSpeed = clamp((clean ? 31 : aggressive ? 34 : 30) + catchup - Math.abs(ahead.curvature) * 155, 17, 38);
    const aheadRider = this.riders.find(o => o.id !== rider.id && o.s > rider.s && o.s < rider.s + 5.5 && Math.abs(o.lateral - rider.lateral) < 0.65);
    input.brake = rider.speed > turnSpeed + (aggressive ? 3 : 0) || (aheadRider !== undefined && aheadRider.speed < rider.speed);
    input.pedal = !input.brake && (clean || aggressive || Math.sin(this.elapsed * .8) > -.4);
    input.boost = rider.boost > .25 && rider.s < this.player.s + 15 && Math.abs(ahead.curvature) < .02 && !rider.airborne;
    input.manual = false; input.hop = false;
    input.crouch = sample.jump > (clean ? .52 : .30);
    if (rider.id === 3 && sample.jump > .77) input.crouch = false;
    const isBigAir = sample.jump > 0.35 || rider.airTime > (aggressive ? 0.15 : 0.28);
    if (rider.airborne && isBigAir) {
      if (aggressive) {
        // Kai: huge showman - Superman (3), Backflip (9), 360 Spin (8), Suicide No-Hander (5)
        const tricks = [3, 9, 8, 5];
        input.trick = tricks[Math.floor((rider.s + rider.id * 23) / 75) % tricks.length];
      } else if (clean) {
        // Jun: tech precision - Tabletop (1), X-Up (2), Nac-Nac (6), Tailwhip (7)
        const tricks = [1, 2, 6, 7];
        input.trick = tricks[Math.floor((rider.s + rider.id * 17) / 80) % tricks.length];
      } else {
        // Niko: freeride style - Can-Can (4), Superman (3), Tabletop (1), 360 (8)
        const tricks = [4, 3, 1, 8];
        input.trick = tricks[Math.floor((rider.s + rider.id * 29) / 70) % tricks.length];
      }
    } else if (!rider.airborne) {
      input.trick = 0;
    }
    this.aiMistakeClock[index] -= dt;
    // Occasional misplaced hops cost speed through the same landing-angle rules.
    if (!clean && this.aiMistakeClock[index] <= 0 && !rider.airborne && rider.speed > 15) {
      input.hop = true; this.aiHops[index] = true;
      this.aiMistakeClock[index] = aggressive ? 24 : 17;
    }
    if (this.aiHops[index] && rider.airborne) input.trick = aggressive ? 9 : 3;
    if (!rider.airborne && rider.airTime === 0 && !input.hop) this.aiHops[index] = false;
  }

  private resolveContacts(dt: number, events: PhysicsEvent[]): void {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const one = this.riders[a], two = this.riders[b];
      if (one.crash > 0 || two.crash > 0 || Math.abs(one.s - two.s) > 2.0 || Math.abs(one.position.y - two.position.y) > 1.3) continue;
      const distance = one.lateral - two.lateral;
      const absDist = Math.abs(distance);
      const sDist = Math.abs(one.s - two.s);
      if (absDist < 1.05) {
        const relSpeed = Math.abs(one.speed - two.speed);
        const maxSpeed = Math.max(one.speed, two.speed);
        const isAirCollision = (one.airborne || two.airborne) && (absDist < 0.65 || sDist < 1.2);
        const isDirectHit = absDist < 0.46 && (maxSpeed > 12 || relSpeed > 3.5);
        const isRamHit = sDist < 0.8 && absDist < 0.50 && relSpeed > 4.0;
        const isHardTouch = isDirectHit || isRamHit || isAirCollision;

        if (isHardTouch) {
          const susp1 = one.id === 0 ? (this.multipliers?.suspensionDamp ?? 1) : 1;
          const susp2 = two.id === 0 ? (this.multipliers?.suspensionDamp ?? 1) : 1;
          const dir1 = distance >= 0 ? 1 : -1;
          const dir2 = -dir1;
          const ev1 = crashRider(one, dir1, susp1);
          const ev2 = crashRider(two, dir2, susp2);
          if (one.id === 0) events.push(ev1);
          if (two.id === 0) events.push(ev2);
          one.lateral += dir1 * 0.75;
          two.lateral += dir2 * 0.75;
        } else {
          const push = (distance >= 0 ? 1 : -1) * (1.05 - absDist) * .5;
          one.lateral += push; two.lateral -= push;
          const mean = (one.speed + two.speed) * .5;
          one.speed += (mean - one.speed) * dt * 3;
          two.speed += (mean - two.speed) * dt * 3;
        }
      }
    }
  }

  private sortRiders(): void {
    this.order.sort((a, b) => a.finished && b.finished ? a.finishTime - b.finishTime
      : a.finished ? -1 : b.finished ? 1 : b.s - a.s || a.id - b.id);
  }

  private updateCheckpoints(): void {
    while (this.checkpoint < this.world.checkpoints.length && this.player.s >= this.world.checkpoints[this.checkpoint]) {
      const prior = this.ghostCheckpointTimes[this.checkpoint];
      this.checkpointTimes.push(this.elapsed);
      this.checkpoint++;
      const delta = prior ? ` · ${this.elapsed - prior >= 0 ? '+' : '−'}${Math.abs(this.elapsed - prior).toFixed(2)}` : '';
      this.split = `SPLIT ${this.checkpoint} / ${this.world.checkpoints.length} · ${formatTime(this.elapsed)}${delta}`;
    }
  }

  private updateAir(): void {
    if (this.player.airborne && !this.previousAirborne) {
      this.jumpStart = this.player.s; this.jumpHeight = 0;
    }
    if (this.player.airborne) this.jumpHeight = Math.max(this.jumpHeight, this.player.y);
    if (!this.player.airborne && this.previousAirborne && this.jumpHeight > this.biggestAir.height) {
      this.biggestAir = { s: this.jumpStart, height: this.jumpHeight, duration: this.player.airTime };
    }
    this.previousAirborne = this.player.airborne;
  }

  private loadBest(): void {
    try {
      const trackId = this.world.trackId ?? 0;
      const trackKey = `sunbreak.best.track_${trackId}.v1`;
      let raw = localStorage.getItem(trackKey);
      if (!raw && trackId === 0) raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !Number.isFinite(saved.time) || saved.time <= 0 || !Array.isArray(saved.ghost)) return;
      const ghost = saved.ghost.filter((point: GhostSample) => Number.isFinite(point.s)
        && Number.isFinite(point.lateral) && Number.isFinite(point.time) && point.s >= 0 && point.s <= this.world.length).slice(0, 6000);
      if (ghost.length < 2) return;
      this.best = saved.time; this.ghost = ghost;
      if (Array.isArray(saved.checkpoints)) this.ghostCheckpointTimes = saved.checkpoints.filter((time: number) => Number.isFinite(time));
    } catch { /* Invalid old saves are ignored, without affecting the race. */ }
  }
}
