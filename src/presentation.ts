import * as THREE from 'three';
import {TrailEffects} from './trail-effects';
import type { MaterialFactory, RiderState, World } from './types';
export type CameraMode='title'|'chase'|'side'|'front'|'wide'|'replay'|'results'|'celebrate';

/** Cinematography owns only the camera and a fixed pool of opaque inked dust. */
export class Presentation {
  private camera:THREE.PerspectiveCamera;
  private world:World;
  private eye=new THREE.Vector3();
  private aim=new THREE.Vector3();
  private desired=new THREE.Vector3();
  private target=new THREE.Vector3();
  private up=new THREE.Vector3(0,1,0);
  private right=new THREE.Vector3();
  private ready=false;
  private lastMode:CameraMode='title';
  private shake=0;
  private celebrateClock=0;
  private trail:TrailEffects;
  private shafts:THREE.Group;
  private scene:THREE.Scene;
  constructor(scene:THREE.Scene,camera:THREE.PerspectiveCamera,world:World,materialFactory:MaterialFactory){
    this.scene=scene;
    const oldShafts=scene.getObjectByName('Graphic sun shafts');
    if(oldShafts)scene.remove(oldShafts);
    this.camera=camera;this.world=world;
    this.trail=new TrailEffects(scene);void materialFactory;
    // Broad triangles suggest graphic sunbeams between the cedars. Their low
    // alpha and hard silhouette keep them distinct from volumetric haze.
    this.shafts=new THREE.Group();this.shafts.name='Graphic sun shafts';
    const shaftColor=world.environment?.sunshaftColor??0xffe2a3;
    const material=new THREE.ShaderMaterial({
      glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{uColor:{value:new THREE.Color(shaftColor)}},
      vertexShader:/* glsl */`void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:/* glsl */`precision highp float;
        uniform vec3 uColor;
        layout(location=0) out vec4 outColor;
        layout(location=1) out vec4 outNormalDepth;
        void main(){
          outColor=vec4(uColor,0.055);
          // Zero source alpha preserves the existing geometry attachment.
          // A stock BasicMaterial only writes attachment zero and is invalid
          // while this renderer has both MRT draw buffers enabled.
          outNormalDepth=vec4(0.0);
        }`,
    });
    for(let i=0;i<13;i++){
      const sm=world.sample(world.length*(.24+i*.037),i%2?30:-26),geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,35,82,-30,47,82,-30,0,0,0,47,82,-30,9,0,0],3));
      const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(sm.position);this.shafts.add(mesh);
    }scene.add(this.shafts);
  }
  dispose(){this.scene.remove(this.shafts);this.trail.reset();}
  reset(){this.ready=false;this.shake=0;this.celebrateClock=0;this.trail.reset();}
  impact(force:number){this.shake=Math.min(.75,this.shake+force*.023);this.trail.impact(force);}
  update(player:RiderState,dt:number,time:number,mode:CameraMode,boost:boolean,brake=false,wetness=0,enhanced=true){
    const sm=this.world.sample(player.s),ahead=this.world.sample(Math.min(this.world.totalLength??this.world.length,player.s+12+player.speed*.35));
    const pos=player.position;this.right.copy(sm.right);
    const air=player.airborne?Math.min(player.airTime,1):0;
    this.target.copy(pos).addScaledVector(sm.tangent,3.4+player.speed*.08);this.target.y+=1.45;
    const speed=THREE.MathUtils.clamp(player.speed/30,0,1);
    if(mode==='title'){
      this.desired.copy(pos).addScaledVector(sm.tangent,-12).addScaledVector(sm.right,-6.7);this.desired.y+=5.9;
      this.target.copy(pos).addScaledVector(sm.tangent,30).addScaledVector(sm.right,-8.3);this.target.y-=1.1;
    }else if(mode==='side'){
      this.desired.copy(pos).addScaledVector(sm.right,10).addScaledVector(sm.tangent,-2.5);this.desired.y+=3;
      this.target.copy(pos);this.target.y+=1.3;
    }else if(mode==='front'){
      this.desired.copy(pos).addScaledVector(sm.tangent,11).addScaledVector(sm.right,3);this.desired.y+=4;
      this.target.copy(pos);this.target.y+=1.25;
    }else if(mode==='wide'){
      this.desired.copy(pos).addScaledVector(sm.tangent,-25).addScaledVector(sm.right,-25);this.desired.y+=24;
      this.target.copy(ahead.position);this.target.y+=1;
    }else if(mode==='replay'){
      const phase=time*.36;this.desired.copy(pos).addScaledVector(sm.right,Math.sin(phase)*9.5).addScaledVector(sm.tangent,Math.cos(phase)*9.5);this.desired.y+=4.2;
      this.target.copy(pos);this.target.y+=1.1;
    }else if(mode==='celebrate'){
      this.celebrateClock+=dt;
      // 360 rotation around the cyclist: starts from behind (-tangent) and smoothly completes full 360 orbit
      const orbitAngle=this.celebrateClock*1.55;
      const radius=5.2;
      const camHeight=1.85+Math.sin(orbitAngle)*0.32;
      const camRight=Math.sin(orbitAngle)*radius;
      const camTangent=-Math.cos(orbitAngle)*radius;
      this.desired.copy(pos).addScaledVector(sm.right,camRight).addScaledVector(sm.tangent,camTangent);
      this.desired.y+=camHeight;
      // Focus target at cyclist chest/head height so cyclist stays nicely framed above the bottom modal
      this.target.copy(pos);this.target.y+=1.38;
    }else if(mode==='results'){
      const phase=time*.20;
      this.desired.copy(pos).addScaledVector(sm.tangent,-7.5+Math.sin(phase)*2).addScaledVector(sm.right,Math.cos(phase)*5.2);
      this.desired.y+=2.8;
      this.target.copy(pos);this.target.y+=1.15;
    }else{
      // Follow heading with a slower lateral spring so bends have a whip,
      // while vertical damping lets suspension motion read against the frame.
      this.desired.copy(pos).addScaledVector(sm.tangent,-5.9-speed*.7).addScaledVector(sm.right,-player.lean*.6);
      this.desired.y+=3.0+speed*.35;
      if(air>.45){this.desired.addScaledVector(sm.right,Math.sin(air*.8)*2.5);this.desired.y+=air*.5;}
      this.target.lerp(ahead.position,.1);this.target.y+=player.airborne?.3:0;
    }
    if(mode!=='celebrate'){this.celebrateClock=0;}
    // Keep the camera safely above the hillside on tight switchbacks.
    this.desired.y=Math.max(this.desired.y,this.world.height(this.desired.x,this.desired.z)+1.9);
    if(!this.ready||mode!==this.lastMode){this.eye.copy(this.desired);this.aim.copy(this.target);this.ready=true;}
    const blend=1-Math.exp(-dt*(mode==='title'?2.5:mode==='results'?3.2:mode==='celebrate'?4.5:5.8));
    this.eye.lerp(this.desired,blend);this.aim.lerp(this.target,1-Math.exp(-dt*8));
    this.camera.position.copy(this.eye);
    this.shake*=Math.exp(-dt*7.5);
    const roughness=mode==='chase'&&!player.airborne&&player.speed>8&&enhanced?(sm.surface==='rock'||sm.surface==='scree'?.045:.012)*speed:0;
    if(roughness>0){this.camera.position.y+=(Math.sin(time*43)+Math.sin(time*67)*.35)*roughness;this.camera.position.x+=Math.sin(time*31)*roughness*.55;}
    if(this.shake>.003&&enhanced){this.camera.position.x+=Math.sin(time*77)*this.shake;this.camera.position.y+=Math.sin(time*91)*this.shake*.6;}
    this.camera.up.copy(this.up);this.camera.lookAt(this.aim);
    const fov=mode==='title'?56:mode==='wide'?56:mode==='replay'?56:mode==='celebrate'?52:mode==='results'?54:59+speed*8+(boost?4:0);
    this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,1-Math.exp(-dt*4));this.camera.updateProjectionMatrix();this.lastMode=mode;
    this.trail.update(player,sm,this.camera,mode==='title'?0:dt,brake,wetness,enhanced);
  }
}
