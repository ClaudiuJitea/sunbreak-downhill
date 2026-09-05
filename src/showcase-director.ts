import * as THREE from 'three';
import {resetPhysics, updatePhysics} from './physics';
import type {InputState, RiderState, World} from './types';
import type {Race} from './race';

export interface ShowcaseShot {
  progress:number;
  speed?:number; lane?:number; boost?:number; trick?:number;
  air?:number; vy?:number; crash?:number; countdown?:boolean;
  rivals?:Array<{gap:number;lane:number;speed:number;target?:number}>;
  camera?:{side:number;height:number;back:number;look?:number;fov?:number};
  record?:boolean;replay?:boolean;preserve?:boolean;replayStart?:number;
}
const neutral=():InputState=>({steer:0,pedal:true,brake:false,crouch:false,hop:false,boost:false,manual:false,trick:0});

/** Capture-only choreography. It changes neither normal race difficulty nor
 * saved runs. Competitors and the hero still use the game's bicycle integrator.
 * The video is an edited showcase, rather than an unedited competitive record. */
export class ShowcaseDirector {
  readonly controls=neutral();
  shot:ShowcaseShot={progress:0};
  lane=0;isReplay=false;
  private clip:RiderState[]=[];
  private replayTime=0;
  private aim=new THREE.Vector3();
  private viewRight=new THREE.Vector3();
  constructor(private race:Race,private world:World) {
    race.inputOverride=(rider,input)=>{
      const config=this.shot.rivals?.[rider.id-1];if(!config)return;
      // Keep the authored pack attack intact; course lips still launch every
      // rider naturally, but random mistake hops do not interrupt this edit.
      input.hop=false;
      input.steer=THREE.MathUtils.clamp((config.lane-rider.lateral)*1.3,-1,1);
      if(config.target!==undefined){input.brake=rider.speed>config.target+1;input.pedal=!input.brake;input.boost=config.target>33&&rider.speed<config.target-1;}
    };
  }
  stage(shot:ShowcaseShot) {
    this.shot=shot;this.isReplay=!!shot.replay;this.replayTime=shot.replayStart??1.35;
    Object.assign(this.controls,neutral(),{trick:shot.trick||0});this.lane=shot.lane||0;
    if(shot.record)this.clip=[];
    if(shot.preserve||shot.replay)return;
    this.race.seek(shot.progress);this.race.ghost=[];
    const start=this.race.player.s;
    for(const rider of this.race.riders){
      const config=shot.rivals?.[rider.id-1];
      rider.s=THREE.MathUtils.clamp(start+(rider.id===0?0:config?.gap??rider.id*3),0,this.world.length-.2);
      rider.lateral=rider.id===0?this.lane:config?.lane??(rider.id-2)*1.7;
      rider.speed=rider.id===0?shot.speed??24:config?.speed??26;
      rider.boost=rider.id===0?shot.boost??1:.8;
      rider.y=rider.id===0?shot.air??0:0;rider.vy=rider.id===0?shot.vy??0:0;
      rider.airborne=rider.y>0;rider.airTime=rider.airborne?.1:0;
      rider.crash=rider.id===0?shot.crash??0:0;rider.roll=0;rider.trick='';rider.trickRotation=0;
      const sm=this.world.sample(rider.s,rider.lateral);
      rider.pitch=Math.atan(sm.slope);rider.yaw=Math.atan2(-sm.tangent.x,-sm.tangent.z);
      resetPhysics(rider);updatePhysics(rider,neutral(),this.world,0);
    }
    if(shot.countdown){this.race.phase='countdown';this.race.countdown=3;this.race.elapsed=0;}
  }
  input():InputState {
    const p=this.race.player;
    this.controls.steer=THREE.MathUtils.clamp((this.lane-p.lateral)*1.25,-1,1);
    return this.controls;
  }
  rivals(moves:Array<{lane?:number;target?:number}>){
    moves.forEach((move,i)=>{const rider=this.shot.rivals?.[i];if(rider)Object.assign(rider,move);});
  }
  sample(player:RiderState,dt:number):RiderState {
    if(this.shot.record&&dt>0)this.clip.push({...player,position:player.position.clone(),velocity:player.velocity.clone()});
    if(!this.isReplay||!this.clip.length)return player;
    this.replayTime+=dt*.6;
    return this.clip[Math.min(this.clip.length-1,Math.floor(this.replayTime*60))];
  }
  camera(camera:THREE.PerspectiveCamera,player:RiderState) {
    const c=this.shot.camera;if(!c)return;
    const sm=this.world.sample(player.s);
    camera.position.copy(player.position).addScaledVector(sm.right,c.side).addScaledVector(sm.tangent,-c.back);camera.position.y+=c.height;
    camera.position.y=Math.max(camera.position.y,this.world.height(camera.position.x,camera.position.z)+1.35);
    this.aim.copy(player.position).addScaledVector(sm.tangent,c.look??1);this.aim.y+=1.1;
    // Small road vibration and a speed-dependent lens kick keep authored camera
    // mounts responsive to the racing, including the suspension after touchdown.
    const road=player.airborne?0:Math.min(.027,player.speed*.0006)+player.compression*.025;
    this.viewRight.copy(sm.right).multiplyScalar(Math.sin(player.s*1.7)*road);
    camera.position.add(this.viewRight);camera.position.y+=Math.sin(player.s*2.3)*road*.6;
    camera.up.set(0,1,0);camera.lookAt(this.aim);camera.fov=(c.fov??51)+Math.max(0,player.speed-28)*.20;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
}
