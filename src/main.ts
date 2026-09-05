import * as THREE from 'three';
import {ShowcaseDirector,type ShowcaseShot} from './showcase-director';
import './style.css';
import {createWorld} from './terrain';
import {createMaterial,NPRPipeline} from './npr';
import {createRider} from './rider';
import {Race} from './race';
import {Presentation,type CameraMode} from './presentation';
import {Controls} from './input';
import {HUD} from './hud';
import {GameAudio} from './audio';
import type {InputState,RiderState} from './types';

const capture=new URLSearchParams(location.search).has('capture');
const hud=new HUD(action);const audio=new GameAudio();
let race:Race, presentation:Presentation,pipeline:NPRPipeline;
let showcase:ShowcaseDirector|undefined;
let replay=false,replayClock=0,replayIndex=0,autoReplay=false;
let impact=0,freeze=0,simTime=0,accumulator=0,lastTime=0,hudClock=0;
let cameraMode:CameraMode='chase';
let enhancedEffects=true,rainWeather=false,lensWetness=0;
try{enhancedEffects=localStorage.getItem('sunbreak.effects')!=='reduced';}catch{/* Private browsing can deny storage. */}
let debugInput:Partial<InputState>={};
const replayFrames:RiderState[]=[];let biggestFrames:RiderState[]=[];let airFrames:RiderState[]=[];let tailRecord=0;
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
renderer.info.autoReset=false;
document.querySelector('#app')!.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(61,innerWidth/innerHeight,.08,10000);
let pixelRatio=Math.min(devicePixelRatio,2),fps=60,perfClock=0,perfFrames=0,slowFrames=0;
const perf={fps:60,drawCalls:0,triangles:0,pixelRatio};
const controls=new Controls(action);

function action(a:string){
  if(a==='mute'){hud.setMuted(audio.mute());return;}
  if(a==='effects'){enhancedEffects=!enhancedEffects;try{localStorage.setItem('sunbreak.effects',enhancedEffects?'full':'reduced');}catch{}hud.setEffects(enhancedEffects,rainWeather);return;}
  if(a==='weather'){rainWeather=!rainWeather;hud.setEffects(enhancedEffects,rainWeather);return;}
  if(!race)return;
  if(a==='start'||a==='restart'){void audio.activate();replay=false;autoReplay=false;biggestFrames=[];airFrames=[];replayFrames.length=0;tailRecord=0;lensWetness=0;race[a==='restart'?'reset':'start']();presentation.reset();audio.horn();}
  if(a==='pause'){if(replay){replay=false;return;}race.togglePause();}
  if(a==='blur'&&!capture&&(race.phase==='racing'||race.phase==='countdown'))race.togglePause();
  if(a==='replay'&&biggestFrames.length){replay=true;replayClock=0;replayIndex=0;presentation.reset();}
}
function snapshot(s:RiderState):RiderState{return {...s,position:s.position.clone(),velocity:s.velocity.clone()};}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);pipeline?.resize(innerWidth,innerHeight,pixelRatio);perf.pixelRatio=pixelRatio;}
window.addEventListener('resize',resize);
resize();

// Let the loading typography paint before deterministic terrain generation.
await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
const world=createWorld(createMaterial);scene.add(world.group);
race=new Race(world);
const visuals=race.riders.map(r=>{const visual=createRider(createMaterial,r.color);scene.add(visual.group);return visual;});
// The best-run ghost is wire ink, deliberately distinct from the live competitors.
const ghostVisual=createRider((color,kind)=>{const m=createMaterial(0x90d8d1,kind);m.wireframe=true;return m;},0x90d8d1);ghostVisual.group.visible=false;scene.add(ghostVisual.group);
const ghostState=snapshot(race.player);
const shadowGeo=new THREE.CircleGeometry(1,20);shadowGeo.rotateX(-Math.PI/2);
const shadows=new THREE.InstancedMesh(shadowGeo,createMaterial(0x53654b,'shadow'),4);
shadows.frustumCulled=false;scene.add(shadows);const shadowTransform=new THREE.Object3D();
const playerLabel=document.createElement('div');playerLabel.className='player-label';playerLabel.innerHTML='YOU <span>▼</span>';document.body.append(playerLabel);const labelPosition=new THREE.Vector3();
presentation=new Presentation(scene,camera,world,createMaterial);
pipeline=new NPRPipeline(renderer,scene,camera);resize();hud.setEffects(enhancedEffects,rainWeather);
let ghostIndex=0;

function tick(dt:number){
  const input=showcase?showcase.input():{...controls.read(),...debugInput};
  const prevPhase=race.phase,prevCount=Math.ceil(race.countdown),wasAir=race.player.airborne;
  const events=race.update(input,dt);simTime+=dt;
  if(race.phase==='countdown'&&Math.ceil(race.countdown)!==prevCount)audio.horn();
  if(prevPhase==='countdown'&&race.phase==='racing'){audio.horn(true);hud.notify('<small>THE MOUNTAIN IS YOURS</small>LET IT RUN');}
  for(const e of events){if(e.type==='land'||e.type==='crash'){presentation.impact(e.force);audio.impact(e.force);if(e.force>12){impact=Math.min(1,e.force/26);freeze=e.type==='crash'?2:1;}}if(e.type==='trick'){hud.notify(`<small>CLEAN LANDING · +${e.score}</small>${e.name}`);audio.bank();}}
  // A rolling pre-roll plus complete air/landing sequence preserves actual animation.
  if(race.phase==='racing'){
    if(Math.floor(simTime*30)!==Math.floor((simTime-dt)*30)){
      const frame=snapshot(race.player);replayFrames.push(frame);if(replayFrames.length>45)replayFrames.shift();
      if(race.player.airborne&&!wasAir){airFrames=replayFrames.map(snapshot);}
      if(race.player.airborne||tailRecord>0)airFrames.push(frame);
      if(tailRecord>0){tailRecord-=1/30;if(tailRecord<=0&&airFrames.length>biggestFrames.length)biggestFrames=airFrames;}
    }
    if(wasAir&&!race.player.airborne)tailRecord=1.2;
  }
  if(prevPhase==='racing'&&race.phase==='results'&&!autoReplay&&!showcase){autoReplay=true;if(!biggestFrames.length)biggestFrames=replayFrames.map(snapshot);replay=true;replayClock=0;replayIndex=0;presentation.reset();audio.bank();}
}

let pendingRenderTime=0;
function render(dt:number,draw=true){
  let shown=race.player;
  if(replay&&biggestFrames.length){replayClock+=dt*.65;replayIndex=Math.min(biggestFrames.length-1,Math.floor(replayClock*30));shown=biggestFrames[replayIndex];if(replayIndex>=biggestFrames.length-1){replay=false;presentation.reset();}}
  if(showcase)shown=showcase.sample(shown,dt);
  for(let i=0;i<visuals.length;i++){
    const s=i===0?shown:race.riders[i],sm=world.sample(s.s,s.lateral);visuals[i].group.visible=(!replay&&!showcase?.isReplay)||i===0;visuals[i].update(s,sm,race.phase==='paused'?0:dt,simTime);
    shadowTransform.position.copy(sm.position);shadowTransform.position.y+=.125;shadowTransform.rotation.set(Math.atan(sm.slope),Math.atan2(-sm.tangent.x,-sm.tangent.z),0,'YXZ');
    shadowTransform.scale.set(.45,1,1.05);if(replay&&i!==0||s.y>8)shadowTransform.scale.setScalar(0);shadowTransform.updateMatrix();shadows.setMatrixAt(i,shadowTransform.matrix);
  }shadows.instanceMatrix.needsUpdate=true;
  ghostVisual.group.visible=race.ghost.length>1&&race.phase==='racing'&&!replay;
  if(ghostVisual.group.visible){if(race.elapsed<race.ghost[ghostIndex]?.time)ghostIndex=0;while(ghostIndex<race.ghost.length-2&&race.ghost[ghostIndex+1].time<race.elapsed)ghostIndex++;const a=race.ghost[ghostIndex],b=race.ghost[ghostIndex+1];const t=THREE.MathUtils.clamp((race.elapsed-a.time)/Math.max(.001,b.time-a.time),0,1);ghostState.s=THREE.MathUtils.lerp(a.s,b.s,t);ghostState.lateral=THREE.MathUtils.lerp(a.lateral,b.lateral,t);const sm=world.sample(ghostState.s,ghostState.lateral);ghostState.position.copy(sm.position);ghostState.yaw=Math.atan2(-sm.tangent.x,-sm.tangent.z);ghostState.pitch=Math.atan(sm.slope);ghostState.speed=24;ghostVisual.update(ghostState,sm,dt,simTime);}
  const mode=replay?'replay':race.phase==='title'?'title':cameraMode;
  const input=showcase?showcase.input():{...controls.read(),...debugInput};
  const active=race.phase==='racing'||race.phase==='countdown'||replay;
  const effectDt=race.phase==='paused'?0:dt;
  const riverMist=active&&shown.s/world.length>.84&&shown.s/world.length<.91&&shown.speed>8;
  const wetTarget=rainWeather?.88:riverMist?.66:0;
  lensWetness=THREE.MathUtils.damp(lensWetness,wetTarget,wetTarget>lensWetness?3:.32,effectDt);
  presentation.update(shown,effectDt,simTime,mode,input.boost&&shown.boost>0,input.brake,lensWetness,enhancedEffects);camera.updateMatrixWorld();showcase?.camera(camera,shown);
  const fx=pipeline.effects;fx.enabled=enhancedEffects;fx.rain=THREE.MathUtils.damp(fx.rain,rainWeather?1:0,2,effectDt);fx.wetness=lensWetness;
  labelPosition.copy(shown.position);labelPosition.y+=1.1;fx.focusDistance=labelPosition.distanceTo(camera.position);labelPosition.project(camera);
  fx.focusX=labelPosition.x*.5+.5;fx.focusY=labelPosition.y*.5+.5;fx.cinematic=replay||mode==='side'||mode==='front'?1:0;
  labelPosition.copy(shown.position);labelPosition.y+=2.5;labelPosition.project(camera);
  playerLabel.style.display=race.phase==='racing'&&!replay&&labelPosition.z<1?'block':'none';playerLabel.style.left=`${(labelPosition.x*.5+.5)*innerWidth}px`;playerLabel.style.top=`${(-labelPosition.y*.5+.5)*innerHeight}px`;
  world.update(camera,dt);
  pendingRenderTime+=effectDt;if(draw){renderer.info.reset();pipeline.render(pendingRenderTime,active?shown.speed:0,input.boost&&shown.boost>0?1:0,impact);pendingRenderTime=0;}
  perf.drawCalls=renderer.info.render.calls;perf.triangles=renderer.info.render.triangles;
  impact=Math.max(0,impact-dt*6);
  audio.update(dt,active?shown.speed:0,world.sample(shown.s).surface,shown.airborne,input.pedal);
  hudClock+=dt;if(hudClock>.06||capture){hud.update({phase:race.phase,player:race.player,riders:race.riders,time:race.elapsed,countdown:race.countdown,world,best:race.best,split:race.split,fps,replay},hudClock);hudClock=0;}
}
function advance(dt:number,draw=true){
  if(freeze>0){freeze--;render(0,draw);return;}
  const slow=race.player.airborne&&race.player.y>8?.72:1;
  accumulator+=Math.min(dt,.05)*slow;
  let steps=0;while(accumulator>=1/120&&steps<8){tick(1/120);accumulator-=1/120;steps++;}
  render(dt,draw);
}
const api={ready:false,paused:capture,start:()=>action('start'),reset:()=>action('restart'),seek:(p:number)=>{race.seek(p);presentation.reset();ghostIndex=0;replay=false;presentation.update(race.player,1/60,simTime,cameraMode,false);for(let i=0;i<10;i++)world.update(camera,1/60);},step:(frames:number,draw=true)=>{for(let i=0;i<frames;i++)advance(1/60,draw&&i===frames-1);},camera:(angle:CameraMode)=>{cameraMode=angle;presentation.reset();},input:(value:Partial<InputState>)=>{debugInput={...debugInput,...value};},state:()=>({phase:race.phase,time:race.elapsed,player:{...race.player,position:race.player.position.toArray(),velocity:race.player.velocity.toArray()},riders:race.riders.map(r=>({id:r.id,s:r.s,speed:r.speed,finished:r.finished})),world:{length:world.length},performance:perf,effects:{...pipeline.effects,weather:rainWeather?'rain':'dawn'},replay,checkpoints:race.checkpoint}),pause:()=>race.togglePause()};
if(capture&&new URLSearchParams(location.search).has('showcase')){
  showcase=new ShowcaseDirector(race,world);
  Object.assign(api,{showcase:{
    stage:(shot:ShowcaseShot)=>{showcase!.stage(shot);replay=false;freeze=0;impact=0;lensWetness=0;presentation.reset();showcase!.camera(camera,race.player);for(let i=0;i<90;i++)world.update(camera,1/60);render(0);},
    controls:(input:Partial<InputState>&{lane?:number})=>{Object.assign(showcase!.controls,input);if(input.lane!==undefined)showcase!.lane=input.lane;},
    camera:(mount:ShowcaseShot['camera'])=>{showcase!.shot.camera=mount;},
    rivals:(moves:Array<{lane?:number;target?:number}>)=>showcase!.rivals(moves),
    riders:()=>race.riders.map(r=>({id:r.id,s:r.s,speed:r.speed,lateral:r.lateral,airborne:r.airborne,crash:r.crash,boost:r.boost,finished:r.finished})),
    weather:(rain:boolean)=>{rainWeather=rain;},
    impact:(force:number)=>presentation.impact(force),
    draw:()=>render(0),
  }});
}
Object.assign(window,{__SUNBREAK:api});
render(1/60);hud.ready();api.ready=true;
function frame(now:number){
  requestAnimationFrame(frame);
  const actualDt=lastTime?(now-lastTime)/1000:1/60;const dt=Math.min(actualDt,.1);lastTime=now;
  if(!api.paused)advance(dt);
  if(!capture){perfClock+=actualDt;perfFrames++;if(perfClock>=2){fps=perfFrames/perfClock;perf.fps=Math.round(fps);slowFrames=fps<54?slowFrames+1:Math.max(0,slowFrames-1);if(slowFrames>=2&&pixelRatio>1&&!race.player.airborne&&race.player.crash===0){pixelRatio=Math.max(1,pixelRatio-.15);resize();slowFrames=0;}else if(fps>59.5&&pixelRatio<Math.min(devicePixelRatio,2)){pixelRatio=Math.min(devicePixelRatio,2,pixelRatio+.05);resize();}perfClock=0;perfFrames=0;}}
}
requestAnimationFrame(frame);
