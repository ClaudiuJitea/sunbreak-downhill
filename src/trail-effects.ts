import * as THREE from 'three';
import type { RiderState, TrackSample } from './types';

type Kind = 'dust' | 'spark' | 'spray';
const UP = new THREE.Vector3(0, 1, 0);
const random = (seed: number) => { const n = Math.sin(seed * 127.1) * 43758.5453; return n - Math.floor(n); };

/** Fixed pools keep skids, scrapes and landings from allocating new objects.
 * Transparent particles leave MRT normal/depth untouched: dust must not acquire
 * the black crease lines that made the previous puffs resemble flying rocks. */
class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private positions: Float32Array;
  private velocities: Float32Array;
  private age: Float32Array;
  private duration: Float32Array;
  private size: Float32Array;
  private opacity: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private serial = 0;
  private dummy = new THREE.Object3D();
  private direction = new THREE.Vector3();

  constructor(scene: THREE.Scene, private kind: Kind, private count: number) {
    this.positions = new Float32Array(count * 3); this.velocities = new Float32Array(count * 3);
    this.age = new Float32Array(count); this.duration = new Float32Array(count); this.size = new Float32Array(count);
    this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    const geometry = kind === 'spark' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(1, 8, 5);
    geometry.setAttribute('aOpacity', this.opacity);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false,
      blending: kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(kind === 'dust' ? 0xf0d4a0 : kind === 'spark' ? 0xffce62 : 0xccece2) }, uSpark: { value: kind === 'spark' ? 1 : 0 } },
      vertexShader: /* glsl */`
        in float aOpacity; out float vOpacity; out vec3 vNormal;
        void main(){vOpacity=aOpacity;vNormal=normal;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */`
        precision highp float; in float vOpacity;in vec3 vNormal;
        uniform vec3 uColor;uniform float uSpark;
        layout(location=0) out vec4 outColor;layout(location=1) out vec4 outNormalDepth;
        void main(){if(vOpacity<0.015)discard;
          float band=mix(0.84,1.0,step(-0.1,vNormal.y));
          outColor=vec4(uColor*(band+uSpark*1.5),vOpacity);
          outNormalDepth=vec4(0.0);}`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = `${kind} particle pool`; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh); this.clear();
  }

  clear() {
    this.age.fill(0); this.opacity.array.fill(0);
    this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true; this.opacity.needsUpdate = true;
  }

  emit(rider: RiderState, sample: TrackSample, count: number, burst = false) {
    for (let j = 0; j < count; j++) {
      const i = this.cursor++ % this.count, seed = ++this.serial, k = i * 3;
      const side = random(seed) * 2 - 1, spread = burst ? 3.8 : 1.1;
      this.positions[k] = rider.position.x - sample.tangent.x * .65 + sample.right.x * side * .22;
      this.positions[k + 1] = rider.position.y + .12;
      this.positions[k + 2] = rider.position.z - sample.tangent.z * .65 + sample.right.z * side * .22;
      this.velocities[k] = sample.right.x * side * spread - sample.tangent.x * (this.kind === 'spark' ? 7 : .7);
      this.velocities[k + 1] = (this.kind === 'spark' ? 2.2 : this.kind === 'spray' ? 3 : .8) * (.5 + random(seed + 8));
      this.velocities[k + 2] = sample.right.z * side * spread - sample.tangent.z * (this.kind === 'spark' ? 7 : .7);
      this.duration[i] = this.kind === 'spark' ? .25 + random(seed + 2) * .3 : .55 + random(seed + 2) * .35;
      this.age[i] = this.duration[i];
      this.size[i] = this.kind === 'spark' ? .12 + random(seed + 4) * .22 : this.kind === 'spray' ? .04 + random(seed + 4) * .06 : (burst ? .16 : .10) + random(seed + 4) * .07;
    }
  }

  update(dt: number, camera: THREE.Camera) {
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3; this.age[i] = Math.max(0, this.age[i] - dt);
      if (this.age[i] > 0) {
        alive++;
        this.positions[k] += this.velocities[k] * dt; this.positions[k + 1] += this.velocities[k + 1] * dt; this.positions[k + 2] += this.velocities[k + 2] * dt;
        this.velocities[k + 1] -= dt * (this.kind === 'dust' ? .35 : 12);
        this.dummy.position.fromArray(this.positions, k);
        const life = this.age[i] / this.duration[i], nearFade = THREE.MathUtils.smoothstep(this.dummy.position.distanceToSquared(camera.position), 2.5, 12);
        this.opacity.setX(i, Math.min(1, life * 3) * nearFade * (this.kind === 'dust' ? .56 : .85));
        if (this.kind === 'spark') {
          this.direction.fromArray(this.velocities, k).normalize(); this.dummy.quaternion.setFromUnitVectors(UP, this.direction);
          this.dummy.scale.set(.018, this.size[i] * (.5 + life), .018);
        } else {
          const size = this.size[i] * (this.kind === 'dust' ? 1 + (1 - life) * 1.8 : 1);
          this.dummy.quaternion.copy(camera.quaternion); this.dummy.scale.set(size, size * .7, size * .65);
        }
      } else { this.dummy.scale.setScalar(0); this.opacity.setX(i, 0); }
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.visible = alive > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.opacity.needsUpdate = true;
  }
}

export class TrailEffects {
  private dust: ParticlePool; private sparks: ParticlePool; private spray: ParticlePool;
  private dustClock = 0; private sparkClock = 0; private sprayClock = 0;
  private pendingImpact = 0; private previousAir = false;
  constructor(scene: THREE.Scene) {
    this.dust = new ParticlePool(scene, 'dust', 96); this.sparks = new ParticlePool(scene, 'spark', 64); this.spray = new ParticlePool(scene, 'spray', 64);
  }
  reset() { this.dust.clear(); this.sparks.clear(); this.spray.clear(); this.pendingImpact = 0; this.dustClock = this.sparkClock = this.sprayClock = 0; this.previousAir = false; }
  impact(force: number) { this.pendingImpact = Math.max(this.pendingImpact, force); }
  update(rider: RiderState, sample: TrackSample, camera: THREE.Camera, dt: number, brake: boolean, wet: number, enabled: boolean) {
    if (dt > 0) {
      const ground = !rider.airborne, rock = sample.surface === 'rock' || sample.surface === 'scree';
      const landing = this.previousAir && ground;
      if (ground && rider.speed > 3) {
        this.dustClock += dt * (wet > .35 ? 0 : enabled ? brake ? 75 : 20 : 9);
        this.sparkClock += dt * (enabled && (rider.crash > 0 || brake && rock && Math.abs(rider.lean) > .2 && rider.speed > 12) ? 65 : 0);
        this.sprayClock += dt * (enabled && wet > .25 ? 20 + rider.speed : 0);
        for (const [pool, amount] of [[this.dust, Math.floor(this.dustClock)], [this.sparks, Math.floor(this.sparkClock)], [this.spray, Math.floor(this.sprayClock)]] as const) if (amount) pool.emit(rider, sample, amount);
        this.dustClock %= 1; this.sparkClock %= 1; this.sprayClock %= 1;
      }
      if (landing || this.pendingImpact > 5) {
        (wet > .25 ? this.spray : this.dust).emit(rider, sample, enabled ? 22 : 8, true);
        if (rock && enabled && this.pendingImpact > 11) this.sparks.emit(rider, sample, 25, true);
      }
      this.pendingImpact = 0; this.previousAir = rider.airborne;
    }
    this.dust.update(dt, camera); this.sparks.update(dt, camera); this.spray.update(dt, camera);
  }
}
