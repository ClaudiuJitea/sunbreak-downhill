import * as THREE from 'three';
import {ShowcaseDirector,type ShowcaseShot} from './showcase-director';
import './style.css';
import {createWorld, TRACK_DEFS} from './terrain';
import {createMaterial,NPRPipeline} from './npr';
import {createRider} from './rider';
import {Race} from './race';
import {Presentation,type CameraMode} from './presentation';
import {Controls} from './input';
import {HUD} from './hud';
import {GameAudio} from './audio';
import {loadGarageState, saveGarageState, getUpgradeMultipliers, UPGRADE_COSTS, type GarageState, type BikeUpgrades} from './garage';
import {ChampionshipManager} from './championship';
import type {InputState,RiderState,World} from './types';

const capture=new URLSearchParams(location.search).has('capture');
const hud=new HUD(action);const audio=new GameAudio();
const garage=loadGarageState();
const champ=new ChampionshipManager();
let lastEarnedCredits=0;
let champStageInfo:ReturnType<ChampionshipManager['recordStage']>|null=null;
let race:Race, presentation:Presentation,pipeline:NPRPipeline,world:World,ghostVisual:ReturnType<typeof createRider>;
let showcase:ShowcaseDirector|undefined;
let replay=false,replayClock=0,replayIndex=0,autoReplay=false;
let celebrationActive=false,celebrationClock=0,celebrationRank=1;
const CELEBRATION_DURATION=4.2,DIM_LEAD_TIME=0.6;
let impact=0,freeze=0,simTime=0,accumulator=0,lastTime=0,hudClock=0;
let cameraMode:CameraMode='chase';
let enhancedEffects=true,rainWeather=false,lensWetness=0;
let currentTrack=0;
let showGhost=true;
try{showGhost=localStorage.getItem('sunbreak.ghost')!=='disabled';}catch{}
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

function switchTrack(trackIndex:number){
  if(trackIndex<0||trackIndex>=TRACK_DEFS.length)return;
  currentTrack=trackIndex;
  presentation?.dispose?.();
  scene.remove(world.group);
  world=createWorld(createMaterial,currentTrack);
  scene.add(world.group);
  pipeline?.setEnvironment(world.environment);
  race=new Race(world);
  race.multipliers=getUpgradeMultipliers(garage.upgrades);
  presentation=new Presentation(scene,camera,world,createMaterial);
  if(ghostVisual)ghostVisual.group.visible=false;
  if(ghostLabel)ghostLabel.style.display='none';
  if(playerLabel)playerLabel.style.display='none';
  for(const l of opponentLabels)l.style.display='none';
  replay=false;autoReplay=false;celebrationActive=false;celebrationClock=0;
  hud.hideFinishBanner();hud.setDimmed(false);
  biggestFrames=[];airFrames=[];replayFrames.length=0;
  hud.update({
    phase:race.phase,player:race.player,riders:race.riders,time:race.elapsed,countdown:race.countdown,
    world,best:race.best,split:race.split,fps,replay,
    earnedCredits:lastEarnedCredits,champActive:champ.state.active,champStage:champ.state.currentStage,
    champStandings:champ.getStandings(),isFinalStage:champStageInfo?.isFinal
  },0);
  presentation.update(race.player,1/60,simTime,'title',false,false,0,enhancedEffects);
}

function action(a:string){
  if(a==='mute'){hud.setMuted(audio.mute());return;}
  if(a==='effects'){enhancedEffects=!enhancedEffects;try{localStorage.setItem('sunbreak.effects',enhancedEffects?'full':'reduced');}catch{}hud.setEffects(enhancedEffects,rainWeather);return;}
  if(a==='weather'){rainWeather=!rainWeather;hud.setEffects(enhancedEffects,rainWeather);return;}
  if(a==='ghost'){
    showGhost=!showGhost;
    try{localStorage.setItem('sunbreak.ghost',showGhost?'enabled':'disabled');}catch{}
    hud.setGhost(showGhost);
    hud.notify(`<small>GHOST RIDER</small>${showGhost?'ENABLED (PB)':'DISABLED'}`);
    return;
  }
  if(a==='open-garage'){hud.openGarage(garage);return;}
  if(a==='close-garage'){hud.closeGarage();return;}
  if(a==='tab-upgrades'){hud.setGarageTab('upgrades');return;}
  if(a==='tab-paint'){hud.setGarageTab('paint');return;}
  if(a.startsWith('upgrade-')){
    const part=a.replace('upgrade-','') as keyof BikeUpgrades;
    const cur=garage.upgrades[part];
    if(cur<5){
      const cost=UPGRADE_COSTS[cur+1];
      if(garage.credits>=cost){
        garage.credits-=cost;
        garage.upgrades[part]++;
        saveGarageState(garage);
        race.multipliers=getUpgradeMultipliers(garage.upgrades);
        hud.renderGarage(garage);
        audio.bank();
        hud.notify(`<small>UPGRADED</small>${part.toUpperCase()} LVL ${garage.upgrades[part]}`);
      }
    }
    return;
  }
  if(a.startsWith('color-')){
    const [,part,hexStr]=a.split('-');
    const hex=parseInt(hexStr,10);
    if(part==='frame'||part==='jersey'||part==='helmet'){
      (garage.colors as any)[part]=hex;
      saveGarageState(garage);
      visuals[0].setColors?.({[part]:hex});
      hud.renderGarage(garage);
    }
    return;
  }
  if(a==='mode-single'){champ.state.active=false;hud.setMode('single');switchTrack(0);return;}
  if(a==='mode-champ'){champ.start();hud.setMode('champ');switchTrack(champ.state.currentStage);return;}
  if(a==='champ-next'){const next=champ.advanceStage();switchTrack(next);action('start');return;}
  if(a==='champ-finish'){hud.showChampionshipCeremony(champ.getStandings());return;}
  if(a==='champ-restart'){champ.start();hud.closeChampionshipCeremony();switchTrack(0);action('start');return;}
  if(a==='close-champ'){hud.closeChampionshipCeremony();switchTrack(0);action('restart');return;}
  if(a==='track'){if(race?.phase==='title'||race?.phase==='paused'){switchTrack((currentTrack+1)%TRACK_DEFS.length);hud.notify(`<small>COURSE LOADED</small>${TRACK_DEFS[currentTrack].name}`);}return;}
  if(a==='set-track-0'){switchTrack(0);return;}
  if(a==='set-track-1'){switchTrack(1);return;}
  if(a==='set-track-2'){switchTrack(2);return;}
  if(a==='set-track-3'){switchTrack(3);return;}
  if(a==='set-track-4'){switchTrack(4);return;}
  if(race?.phase==='title'){
    if(a==='digit1'){switchTrack(0);return;}
    if(a==='digit2'){switchTrack(1);return;}
    if(a==='digit3'){switchTrack(2);return;}
    if(a==='digit4'){switchTrack(3);return;}
    if(a==='digit5'){switchTrack(4);return;}
  }
  if(!race)return;
  if(a==='start'||a==='restart'){
    void audio.activate();
    replay=false;autoReplay=false;celebrationActive=false;celebrationClock=0;
    hud.hideFinishBanner();hud.setDimmed(false);
    race.player.celebrate=0;
    biggestFrames=[];airFrames=[];replayFrames.length=0;tailRecord=0;lensWetness=0;
    race[a==='restart'?'reset':'start']();presentation.reset();audio.horn();
  }
  if(a==='skip-celebration'||(celebrationActive&&(a==='space'||a==='start'))){
    celebrationActive=false;
    hud.hideFinishBanner();
    hud.setDimmed(false);
    autoReplay=true;
    if(biggestFrames.length>5){
      replay=true;replayClock=0;replayIndex=0;presentation.reset();audio.bank();
    }else{
      presentation.reset();
    }
    return;
  }
  if(a==='pause'){
    if(replay){replay=false;presentation.reset();return;}
    if(celebrationActive){celebrationActive=false;hud.hideFinishBanner();presentation.reset();return;}
    race.togglePause();
  }
  if(a==='space'||a==='skip-replay'||a==='skip-celebration'){
    if(celebrationActive){
      celebrationActive=false;
      hud.hideFinishBanner();
      hud.setDimmed(false);
      autoReplay=true;
      if(biggestFrames.length>5&&!capture){
        replay=true;replayClock=0;replayIndex=0;presentation.reset();audio.bank();
      }else{
        presentation.reset();
      }
      return;
    }
    if(replay){replay=false;presentation.reset();return;}
  }
  if(a==='blur'&&!capture&&(race.phase==='racing'||race.phase==='countdown'))race.togglePause();
  if(a==='replay'&&biggestFrames.length){replay=true;replayClock=0;replayIndex=0;presentation.reset();}
}
function snapshot(s:RiderState):RiderState{return {...s,position:s.position.clone(),velocity:s.velocity.clone()};}
function lerpAngle(a:number,b:number,t:number):number{
  return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
}
function interpolateSnapshot(a:RiderState,b:RiderState,t:number,out:RiderState):RiderState{
  out.id=a.id;out.name=a.name;out.color=a.color;
  out.s=THREE.MathUtils.lerp(a.s,b.s,t);
  out.lateral=THREE.MathUtils.lerp(a.lateral,b.lateral,t);
  out.position.lerpVectors(a.position,b.position,t);
  out.velocity.lerpVectors(a.velocity,b.velocity,t);
  out.speed=THREE.MathUtils.lerp(a.speed,b.speed,t);
  out.y=THREE.MathUtils.lerp(a.y,b.y,t);
  out.vy=THREE.MathUtils.lerp(a.vy,b.vy,t);
  out.yaw=lerpAngle(a.yaw,b.yaw,t);
  out.pitch=lerpAngle(a.pitch,b.pitch,t);
  out.roll=lerpAngle(a.roll,b.roll,t);
  out.lean=THREE.MathUtils.lerp(a.lean,b.lean,t);
  out.compression=THREE.MathUtils.lerp(a.compression,b.compression,t);
  out.cadence=THREE.MathUtils.lerp(a.cadence,b.cadence,t);
  out.airborne=t<0.5?a.airborne:b.airborne;
  out.airTime=THREE.MathUtils.lerp(a.airTime,b.airTime,t);
  out.trick=t<0.5?a.trick:b.trick;
  out.trickRotation=THREE.MathUtils.lerp(a.trickRotation,b.trickRotation,t);
  out.crash=THREE.MathUtils.lerp(a.crash,b.crash,t);
  out.boost=THREE.MathUtils.lerp(a.boost,b.boost,t);
  out.score=b.score;out.finished=b.finished;out.finishTime=b.finishTime;
  return out;
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);pipeline?.resize(innerWidth,innerHeight,pixelRatio);perf.pixelRatio=pixelRatio;}
window.addEventListener('resize',resize);
resize();

// Let the loading typography paint before deterministic terrain generation.
await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
world=createWorld(createMaterial,0);scene.add(world.group);
race=new Race(world);
race.multipliers=getUpgradeMultipliers(garage.upgrades);
const replayState=snapshot(race.player);
const RIDER_NUMBERS=['07','14','23','42'];
const visuals=race.riders.map(r=>{const visual=createRider(createMaterial,r.color,r.id===0?garage.colors:undefined,RIDER_NUMBERS[r.id%RIDER_NUMBERS.length]);scene.add(visual.group);return visual;});
// The best-run ghost is wire ink, deliberately distinct from the live competitors.
ghostVisual=createRider((color,kind)=>{const m=createMaterial(0x90d8d1,kind);m.wireframe=true;return m;},0x90d8d1,undefined,'00');ghostVisual.group.visible=false;scene.add(ghostVisual.group);
const ghostState=snapshot(race.player);
const shadowGeo=new THREE.CircleGeometry(1,20);shadowGeo.rotateX(-Math.PI/2);
const shadows=new THREE.InstancedMesh(shadowGeo,createMaterial(0x53654b,'shadow'),4);
shadows.frustumCulled=false;scene.add(shadows);const shadowTransform=new THREE.Object3D();
const playerLabel=document.createElement('div');playerLabel.className='player-label';playerLabel.innerHTML='YOU <span>▼</span>';document.body.append(playerLabel);const labelPosition=new THREE.Vector3();
const ghostLabel=document.createElement('div');ghostLabel.className='ghost-label';ghostLabel.innerHTML='GHOST (PB) <span>▼</span>';document.body.append(ghostLabel);const ghostLabelPosition=new THREE.Vector3();
const opponentLabels: HTMLDivElement[] = [];
const opponentLabelPositions: THREE.Vector3[] = [];
for(let i=0;i<3;i++){
  const lbl=document.createElement('div');
  lbl.className='opponent-label';
  lbl.style.display='none';
  document.body.append(lbl);
  opponentLabels.push(lbl);
  opponentLabelPositions.push(new THREE.Vector3());
}
presentation=new Presentation(scene,camera,world,createMaterial);
pipeline=new NPRPipeline(renderer,scene,camera);pipeline.setEnvironment(world.environment);resize();hud.setEffects(enhancedEffects,rainWeather);
let ghostIndex=0;

function tick(dt:number){
  const input=showcase?showcase.input():{...controls.read(),...debugInput};
  const prevPhase=race.phase,prevCount=Math.ceil(race.countdown),wasAir=race.player.airborne;
  const events=race.update(input,dt);simTime+=dt;
  if(race.phase==='countdown'&&Math.ceil(race.countdown)!==prevCount)audio.horn();
  if(prevPhase==='countdown'&&race.phase==='racing'){audio.horn(true);hud.notify('<small>THE MOUNTAIN IS YOURS</small>LET IT RUN');}
  for(const e of events){
    if(e.type==='land'||e.type==='crash'){presentation.impact(e.force);audio.impact(e.force);if(e.force>12){impact=Math.min(1,e.force/26);freeze=e.type==='crash'?2:1;}}
    if(e.type==='trick'){
      if(e.score && e.score>0){hud.notify(`<small>CLEAN LANDING · +${e.score}</small>${e.name}`);audio.bank();}
      else{hud.notify(`<small>STYLE TRICK</small>${e.name}`);audio.tone(520,.09,'triangle',.1,780);}
    }
  }
  // A rolling pre-roll plus complete air/landing sequence preserves actual animation.
  if(race.phase==='racing'){
    if(Math.floor(simTime*60)!==Math.floor((simTime-dt)*60)){
      const frame=snapshot(race.player);replayFrames.push(frame);if(replayFrames.length>90)replayFrames.shift();
      if(race.player.airborne&&!wasAir){airFrames=replayFrames.map(snapshot);}
      if(race.player.airborne||tailRecord>0)airFrames.push(frame);
      if(tailRecord>0){tailRecord-=1/60;if(tailRecord<=0&&airFrames.length>biggestFrames.length)biggestFrames=airFrames;}
    }
    if(wasAir&&!race.player.airborne)tailRecord=1.2;
  }
  if(prevPhase==='racing'&&race.phase==='results'&&!autoReplay&&!showcase){
    const order=[...race.riders].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:b.s-a.s);
    const rank=order.findIndex(r=>r.id===0)+1;
    celebrationRank=rank;
    const prize=rank===1?1200:rank===2?800:rank===3?500:300;
    const styleReward=Math.floor(race.player.score/5);
    lastEarnedCredits=prize+styleReward;
    garage.credits+=lastEarnedCredits;
    saveGarageState(garage);
    if(champ.state.active){
      champStageInfo=champ.recordStage(order,race.player.score);
    }
    if(!biggestFrames.length)biggestFrames=replayFrames.map(snapshot);

    celebrationActive=true;
    celebrationClock=0;
    race.player.celebrate=0;
    race.player.celebrateRank=rank;

    if(rank===1){
      audio.victory();
    }else if(rank<=3){
      audio.podium(rank);
    }else{
      audio.finishChime();
    }

    hud.showFinishBanner({
      rank,
      time:race.player.finishTime||race.elapsed,
      score:race.player.score,
      earnedCredits:lastEarnedCredits,
      champActive:champ.state.active,
      champStage:champ.state.currentStage,
      isFinalStage:champStageInfo?.isFinal
    });
  }
}

let pendingRenderTime=0;
let currentShown: RiderState | null = null;
function render(dt:number,draw=true){
  let shown=race.player;
  if(celebrationActive){
    celebrationClock+=dt;
    const celProgress=THREE.MathUtils.clamp(celebrationClock/0.7,0,1);
    race.player.celebrate=celProgress;
    race.player.celebrateRank=celebrationRank;

    const totalDuration=capture?0.05:CELEBRATION_DURATION;
    const remaining=Math.max(0,totalDuration-celebrationClock);
    hud.updateFinishBannerProgress(remaining/totalDuration,remaining);

    const dimLead=Math.min(DIM_LEAD_TIME,totalDuration*0.3);
    if(celebrationClock>=totalDuration-dimLead){
      hud.setDimmed(true);
    }

    if(celebrationClock>=totalDuration){
      celebrationActive=false;
      hud.hideFinishBanner();
      autoReplay=true;
      if(biggestFrames.length>5&&!capture){
        replay=true;replayClock=0;replayIndex=0;presentation.reset();audio.bank();
        setTimeout(()=>hud.setDimmed(false),100);
      }else{
        hud.setDimmed(false);
        presentation.reset();
      }
    }
  }
  if(replay&&biggestFrames.length){
    replayClock+=dt*.65;
    const exact=replayClock*60;
    const i0=Math.min(biggestFrames.length-1,Math.floor(exact));
    const i1=Math.min(biggestFrames.length-1,i0+1);
    const alpha=THREE.MathUtils.clamp(exact-i0,0,1);
    shown=interpolateSnapshot(biggestFrames[i0],biggestFrames[i1],alpha,replayState);
    if(i0>=biggestFrames.length-1){replay=false;presentation.reset();}
  }
  currentShown=shown;
  if(race.phase==='results'&&!replay){
    const maxS=world.totalLength??(world.length+140);
    if(celebrationActive){
      race.player.speed=Math.max(10,race.player.speed-dt*3.5);
      for(const r of race.riders){
        r.speed=Math.max(0,r.speed-dt*5);
        if(r.id!==0){
          r.s=Math.min(maxS,r.s+r.speed*dt);
          const rsm=world.sample(r.s,r.lateral);
          r.position.copy(rsm.position);
          r.yaw=Math.atan2(-rsm.tangent.x,-rsm.tangent.z);
          r.pitch=Math.atan(rsm.slope);
        }
      }
      race.player.s=Math.min(maxS,race.player.s+race.player.speed*dt);
      const sm=world.sample(race.player.s,race.player.lateral);
      race.player.position.copy(sm.position);
      race.player.yaw=Math.atan2(-sm.tangent.x,-sm.tangent.z);
      race.player.pitch=Math.atan(sm.slope);
      race.player.roll=THREE.MathUtils.damp(race.player.roll,0,8,dt);
      race.player.lean=THREE.MathUtils.damp(race.player.lean,0,8,dt);
      race.player.airborne=false;
      race.player.y=0;
    }else{
      race.player.speed=Math.max(0,race.player.speed-dt*9);
      for(const r of race.riders){
        r.speed=Math.max(0,r.speed-dt*9);
        if(r.id!==0&&r.speed>0){
          r.s=Math.min(maxS,r.s+r.speed*dt);
          const rsm=world.sample(r.s,r.lateral);
          r.position.copy(rsm.position);
          r.yaw=Math.atan2(-rsm.tangent.x,-rsm.tangent.z);
          r.pitch=Math.atan(rsm.slope);
        }
      }
      if(race.player.speed>0){
        race.player.s=Math.min(maxS,race.player.s+race.player.speed*dt);
        const sm=world.sample(race.player.s,race.player.lateral);
        race.player.position.copy(sm.position);
        race.player.yaw=Math.atan2(-sm.tangent.x,-sm.tangent.z);
        race.player.pitch=Math.atan(sm.slope);
      }
    }
  }
  if(showcase)shown=showcase.sample(shown,dt);
  for(let i=0;i<visuals.length;i++){
    const s=i===0?shown:race.riders[i],sm=world.sample(s.s,s.lateral);visuals[i].group.visible=(!replay&&!showcase?.isReplay)||i===0;visuals[i].update(s,sm,race.phase==='paused'?0:dt,simTime);
    shadowTransform.position.copy(sm.position);shadowTransform.position.y+=.125;shadowTransform.rotation.set(Math.atan(sm.slope),Math.atan2(-sm.tangent.x,-sm.tangent.z),0,'YXZ');
    shadowTransform.scale.set(.45,1,1.05);if(replay&&i!==0||s.y>8)shadowTransform.scale.setScalar(0);shadowTransform.updateMatrix();shadows.setMatrixAt(i,shadowTransform.matrix);
  }shadows.instanceMatrix.needsUpdate=true;
  ghostVisual.group.visible=showGhost&&race.ghost.length>1&&race.phase==='racing'&&!replay;
  if(ghostVisual.group.visible){
    if(race.elapsed<race.ghost[ghostIndex]?.time)ghostIndex=0;
    while(ghostIndex<race.ghost.length-2&&race.ghost[ghostIndex+1].time<race.elapsed)ghostIndex++;
    const a=race.ghost[ghostIndex],b=race.ghost[ghostIndex+1];
    const t=THREE.MathUtils.clamp((race.elapsed-a.time)/Math.max(.001,b.time-a.time),0,1);
    ghostState.s=THREE.MathUtils.lerp(a.s,b.s,t);
    ghostState.lateral=THREE.MathUtils.lerp(a.lateral,b.lateral,t);
    const sm=world.sample(ghostState.s,ghostState.lateral);
    ghostState.position.copy(sm.position);
    ghostState.yaw=Math.atan2(-sm.tangent.x,-sm.tangent.z);
    ghostState.pitch=Math.atan(sm.slope);
    ghostState.speed=24;
    ghostVisual.update(ghostState,sm,dt,simTime);
    ghostLabelPosition.copy(ghostState.position);
    ghostLabelPosition.y+=2.5;
    ghostLabelPosition.project(camera);
    ghostLabel.style.display=ghostLabelPosition.z<1?'block':'none';
    ghostLabel.style.left=`${(ghostLabelPosition.x*.5+.5)*innerWidth}px`;
    ghostLabel.style.top=`${(-ghostLabelPosition.y*.5+.5)*innerHeight}px`;
  }else{
    ghostLabel.style.display='none';
  }
  const mode=replay?'replay':celebrationActive?'celebrate':race.phase==='results'?'results':race.phase==='title'?'title':cameraMode;
  const input=showcase?showcase.input():{...controls.read(),...debugInput};
  const active=race.phase==='racing'||race.phase==='countdown'||replay||celebrationActive;
  const effectDt=race.phase==='paused'?0:dt;
  const riverMist=active&&shown.s/world.length>.84&&shown.s/world.length<.91&&shown.speed>8;
  const wetTarget=rainWeather?.88:riverMist?.66:0;
  lensWetness=THREE.MathUtils.damp(lensWetness,wetTarget,wetTarget>lensWetness?3:.32,effectDt);
  presentation.update(shown,effectDt,simTime,mode,input.boost&&shown.boost>0,input.brake,lensWetness,enhancedEffects);camera.updateMatrixWorld();showcase?.camera(camera,shown);
  const fx=pipeline.effects;fx.enabled=enhancedEffects;fx.rain=THREE.MathUtils.damp(fx.rain,rainWeather?1:0,2,effectDt);fx.wetness=lensWetness;
  labelPosition.copy(shown.position);labelPosition.y+=1.1;fx.focusDistance=labelPosition.distanceTo(camera.position);labelPosition.project(camera);
  fx.focusX=labelPosition.x*.5+.5;fx.focusY=labelPosition.y*.5+.5;fx.cinematic=replay||celebrationActive||mode==='side'||mode==='front'?1:0;
  labelPosition.copy(shown.position);labelPosition.y+=2.5;labelPosition.project(camera);
  const showLabels=(race.phase==='racing'||race.phase==='countdown')&&!replay&&!celebrationActive&&!showcase;
  playerLabel.style.display=showLabels&&labelPosition.z<1?'block':'none';
  playerLabel.style.left=`${(labelPosition.x*.5+.5)*innerWidth}px`;
  playerLabel.style.top=`${(-labelPosition.y*.5+.5)*innerHeight}px`;
  if(race.player.color){
    playerLabel.style.borderTopColor='#'+(race.player.color).toString(16).padStart(6,'0');
  }

  for(let i=1;i<race.riders.length;i++){
    const opp=race.riders[i];
    const lbl=opponentLabels[i-1];
    const pos=opponentLabelPositions[i-1];
    if(!lbl||!pos)continue;
    if(!showLabels){
      lbl.style.display='none';
      continue;
    }
    pos.copy(opp.position);
    pos.y+=2.5;
    const dist=pos.distanceTo(camera.position);
    pos.project(camera);
    if(pos.z<1&&pos.z>-1&&Math.abs(pos.x)<1.15&&Math.abs(pos.y)<1.15&&dist<240){
      lbl.style.display='block';
      lbl.style.left=`${(pos.x*.5+.5)*innerWidth}px`;
      lbl.style.top=`${(-pos.y*.5+.5)*innerHeight}px`;
      const oppHex='#'+(opp.color||0x47bfae).toString(16).padStart(6,'0');
      lbl.style.borderTopColor=oppHex;
      lbl.innerHTML=`${opp.name||'RIDER'} <span>▼</span>`;
      const scale=THREE.MathUtils.clamp(1.08-(dist-15)/180,0.72,1.0);
      lbl.style.transform=`translate(-50%,-100%) scale(${scale.toFixed(2)})`;
    }else{
      lbl.style.display='none';
    }
  }
  world.update(camera,dt);
  pendingRenderTime+=effectDt;if(draw){renderer.info.reset();pipeline.render(pendingRenderTime,active?shown.speed:0,input.boost&&shown.boost>0?1:0,impact);pendingRenderTime=0;}
  perf.drawCalls=renderer.info.render.calls;perf.triangles=renderer.info.render.triangles;
  impact=Math.max(0,impact-dt*6);
  audio.update(dt,active?shown.speed:0,world.sample(shown.s).surface,shown.airborne,input.pedal);
  hudClock+=dt;if(hudClock>.06||capture){
    hud.update({
      phase:race.phase,player:race.player,riders:race.riders,time:race.elapsed,countdown:race.countdown,
      world,best:race.best,split:race.split,fps,replay,celebration:celebrationActive,
      earnedCredits:lastEarnedCredits,champActive:champ.state.active,champStage:champ.state.currentStage,
      champStandings:champ.getStandings(),isFinalStage:champStageInfo?.isFinal
    },hudClock);
    hudClock=0;
  }
}
function advance(dt:number,draw=true){
  if(freeze>0){freeze--;render(0,draw);return;}
  controls.update(dt);
  const slow=race.player.airborne&&race.player.y>4.5?.72:1;
  accumulator+=Math.min(dt,.05)*slow;
  let steps=0;while(accumulator>=1/120&&steps<8){tick(1/120);accumulator-=1/120;steps++;}
  render(dt,draw);
}
const api={ready:false,paused:capture,start:()=>action('start'),reset:()=>action('restart'),toggleGhost:()=>action('ghost'),garage:()=>garage,champ:()=>champ.state,race:()=>race,world:()=>world,visuals:()=>visuals,seek:(p:number)=>{race.seek(p);presentation.reset();ghostIndex=0;replay=false;celebrationActive=false;hud.hideFinishBanner();hud.setDimmed(false);presentation.update(race.player,1/60,simTime,cameraMode,false);for(let i=0;i<10;i++)world.update(camera,1/60);},step:(frames:number,draw=true)=>{for(let i=0;i<frames;i++)advance(1/60,draw&&i===frames-1);},camera:(angle:CameraMode)=>{cameraMode=angle;presentation.reset();},input:(value:Partial<InputState>)=>{debugInput={...debugInput,...value};},setTrack:(idx:number)=>switchTrack(idx),state:()=>{const p=(replay&&currentShown)?currentShown:race.player;return {phase:race.phase,time:race.elapsed,celebration:celebrationActive,player:{...p,finished:race.player.finished,finishTime:race.player.finishTime,position:p.position.toArray(),velocity:p.velocity.toArray()},riders:race.riders.map(r=>({id:r.id,s:r.s,speed:r.speed,finished:r.finished})),world:{length:world.length,trackId:world.trackId??0,trackName:world.trackName??'THE SUNBREAK DESCENT'},performance:perf,effects:{...pipeline.effects,weather:rainWeather?'rain':'dawn'},replay,checkpoints:race.checkpoint};},pause:()=>race.togglePause()};
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
render(1/60);hud.ready();hud.setGhost(showGhost);hud.setEffects(enhancedEffects,rainWeather);api.ready=true;
function frame(now:number){
  requestAnimationFrame(frame);
  const actualDt=lastTime?(now-lastTime)/1000:1/60;const dt=Math.min(actualDt,.1);lastTime=now;
  if(!api.paused)advance(dt);
  if(!capture){perfClock+=actualDt;perfFrames++;if(perfClock>=2){fps=perfFrames/perfClock;perf.fps=Math.round(fps);slowFrames=fps<54?slowFrames+1:Math.max(0,slowFrames-1);if(slowFrames>=2&&pixelRatio>1&&!race.player.airborne&&race.player.crash===0){pixelRatio=Math.max(1,pixelRatio-.15);resize();slowFrames=0;}else if(fps>59.5&&pixelRatio<Math.min(devicePixelRatio,2)){pixelRatio=Math.min(devicePixelRatio,2,pixelRatio+.05);resize();}perfClock=0;perfFrames=0;}}
}
requestAnimationFrame(frame);
