import * as THREE from 'three';
import { createRiderState, updatePhysics } from './physics';
import type { InputState, PhysicsEvent, RiderState, World } from './types';

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
    for (const rider of this.riders) {
      rider.s = clamp(s + (rider.id === 0 ? 0 : (2 - rider.id) * 4), 0, this.world.length - 1);
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
    const events = updatePhysics(this.player, input, this.world, dt);
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
    this.resolveContacts(dt);
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
      if (this.best === 0 || this.elapsed < this.best) {
        this.best = this.elapsed; this.ghost = this.recording.slice();
        this.ghostCheckpointTimes = this.checkpointTimes.slice();
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, time: this.best,
            ghost: this.ghost, checkpoints: this.ghostCheckpointTimes }));
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
      if (other.id === rider.id || other.s < rider.s - .8 || other.s > rider.s + 7) continue;
      if (Math.abs(other.lateral - rider.lateral) < 1.1) lane += rider.lateral > other.lateral ? 1.15 : -1.15;
    }
    for(const rock of this.world.obstacles||[])if(rock.s>rider.s&&rock.s<rider.s+18&&Math.abs(lane-rock.lateral)<1)lane=rock.lateral+(lane>rock.lateral?1.5:-1.5);
    lane = clamp(lane, -sample.width * .34, sample.width * .34);
    input.steer = clamp((lane - rider.lateral) * .9, -1, 1);
    const catchup=clamp((this.player.s-rider.s)/18,-2,6);
    const turnSpeed = clamp((clean ? 31 : aggressive ? 34 : 30) + catchup - Math.abs(ahead.curvature) * 155, 17, 38);
    input.brake = rider.speed > turnSpeed + (aggressive ? 3 : 0);
    input.pedal = !input.brake && (clean || aggressive || Math.sin(this.elapsed * .8) > -.4);
    input.boost = rider.boost > .25 && rider.s < this.player.s + 15 && Math.abs(ahead.curvature) < .02 && !rider.airborne;
    input.manual = false; input.hop = false;
    input.crouch = sample.jump > (clean ? .52 : .30);
    if (rider.id === 3 && sample.jump > .77) input.crouch = false;
    input.trick = rider.airborne && rider.airTime > (aggressive ? .16 : .3)
      ? aggressive ? 6 : clean ? 2 : 1 : 0;
    this.aiMistakeClock[index] -= dt;
    // Occasional misplaced hops cost speed through the same landing-angle rules.
    if (!clean && this.aiMistakeClock[index] <= 0 && !rider.airborne && rider.speed > 15) {
      input.hop = true; this.aiHops[index] = true;
      this.aiMistakeClock[index] = aggressive ? 24 : 17;
    }
    if (this.aiHops[index] && rider.airborne) input.trick = aggressive ? 7 : 6;
    if (!rider.airborne && rider.airTime === 0 && !input.hop) this.aiHops[index] = false;
  }

  private resolveContacts(dt: number): void {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const one = this.riders[a], two = this.riders[b];
      if (one.crash > 0 || two.crash > 0 || Math.abs(one.s - two.s) > 2.0 || Math.abs(one.position.y - two.position.y) > 1.3) continue;
      const distance = one.lateral - two.lateral;
      if (Math.abs(distance) < 1.05) {
        const push = (distance >= 0 ? 1 : -1) * (1.05 - Math.abs(distance)) * .5;
        one.lateral += push; two.lateral -= push;
        const mean = (one.speed + two.speed) * .5;
        one.speed += (mean - one.speed) * dt * 3;
        two.speed += (mean - two.speed) * dt * 3;
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
      const raw = localStorage.getItem(SAVE_KEY);
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
