import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline } from './npr';
import type { MaterialFactory, RiderVisual, RiderState, TrackSample } from './types';

const Y=new THREE.Vector3(0,1,0);
const sphere=new THREE.SphereGeometry(1,16,12);
const boneGeo=new THREE.CylinderGeometry(1,1,1,10);
// Rounded, tapered volumes retain an anatomical silhouette through cel bands.
function anatomyProfile(points:number[][]){return new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),12);}
const armGeo=anatomyProfile([[.50,-.5],[.76,-.43],[.91,-.19],[1,.19],[.90,.40],[.53,.5]]);
const forearmGeo=anatomyProfile([[.62,-.5],[.66,-.32],[.96,.12],[1,.32],[.72,.5]]);
const legGeo=anatomyProfile([[.60,-.5],[.76,-.38],[.98,.04],[1,.28],[.71,.5]]);
const torsoGeo=anatomyProfile([[.74,-.5],[.80,-.32],[.94,.02],[1.12,.29],[.98,.47],[.64,.5]]);
const box=new THREE.BoxGeometry(1,1,1);
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function tube(a:THREE.Vector3,b:THREE.Vector3,r:number,r2=r,segments=7){
  const d=b.clone().sub(a);const g=new THREE.CylinderGeometry(r2,r,d.length(),segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,d.normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());return g;
}
function transformed(g:THREE.BufferGeometry,p:THREE.Vector3,s:THREE.Vector3,q=new THREE.Quaternion()){
  return g.clone().applyMatrix4(new THREE.Matrix4().compose(p,q,s));
}
function batch(parent:THREE.Object3D,geometries:THREE.BufferGeometry[],material:THREE.Material,outline=false){
  const merged=mergeGeometries(geometries,false)!;const m=new THREE.Mesh(merged,material);parent.add(m);if(outline)addOutline(m,.95);return m;
}
function ball(parent:THREE.Object3D,mat:THREE.Material,p:THREE.Vector3,s:THREE.Vector3,ink=false){
  const m=new THREE.Mesh(sphere,mat);m.position.copy(p);m.scale.copy(s);parent.add(m);if(ink)addOutline(m,1.1);return m;
}
function block(parent:THREE.Object3D,mat:THREE.Material,p:THREE.Vector3,s:THREE.Vector3):THREE.Mesh{
  const m=new THREE.Mesh(box,mat);m.position.copy(p);m.scale.copy(s);parent.add(m);return m;
}
function bone(parent:THREE.Object3D,mat:THREE.Material,r:number):THREE.Mesh{
  const mesh=new THREE.Mesh(boneGeo,mat);mesh.userData.radius=r;parent.add(mesh);return mesh;
}
const bd=v(),ikAxis=v(),ikBend=v();
function placeBone(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,r=mesh.userData.radius as number){
  bd.copy(b).sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);
  const length=bd.length();mesh.quaternion.setFromUnitVectors(Y,bd.normalize());mesh.scale.set(r,length,r);
}
/** Analytic two-bone solution, bend pole in the same coordinate space as endpoints.
 * The hand/foot endpoint is never interpolated independently from its target. */
function solveJoint(root:THREE.Vector3,target:THREE.Vector3,pole:THREE.Vector3,a:number,b:number,out:THREE.Vector3){
  const axis=ikAxis.copy(target).sub(root),distance=axis.length();axis.multiplyScalar(1/Math.max(distance,.00001));
  const d=THREE.MathUtils.clamp(distance,.001,a+b-.0001);
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const bend=ikBend.copy(pole).sub(root);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  out.copy(root).addScaledVector(axis,along).addScaledVector(bend,height);
}

function buildDigitGeometries(char:string,cx:number):THREE.BufferGeometry[]{
  const parts:THREE.BufferGeometry[]=[];
  const bar=(x:number,y:number,w:number,h:number)=>{
    parts.push(transformed(box,v(x,y,0),v(w,h,.012)));
  };
  const W=.068,H=.150,T=.013,halfW=.028,halfH=.068,midH=.034;
  switch(char){
    case '0':
      bar(cx-halfW,0,T,H);bar(cx+halfW,0,T,H);bar(cx,halfH,W,T);bar(cx,-halfH,W,T);break;
    case '1':
      bar(cx+.005,0,T,H);bar(cx-.012,halfH-.014,.022,T);bar(cx+.005,-halfH,.046,T);break;
    case '2':
      bar(cx,halfH,W,T);bar(cx+halfW,midH,T,halfH);bar(cx,0,W,T);bar(cx-halfW,-midH,T,halfH);bar(cx,-halfH,W,T);break;
    case '3':
      bar(cx,halfH,W,T);bar(cx-.004,0,W-.008,T);bar(cx,-halfH,W,T);bar(cx+halfW,0,T,H);break;
    case '4':
      bar(cx-halfW,midH,T,halfH);bar(cx,0,W,T);bar(cx+halfW,0,T,H);break;
    case '5':
      bar(cx,halfH,W,T);bar(cx-halfW,midH,T,halfH);bar(cx,0,W,T);bar(cx+halfW,-midH,T,halfH);bar(cx,-halfH,W,T);break;
    case '6':
      bar(cx,halfH,W,T);bar(cx-halfW,0,T,H);bar(cx,0,W,T);bar(cx+halfW,-midH,T,halfH);bar(cx,-halfH,W,T);break;
    case '7':
      bar(cx-.006,halfH,W+.012,T);bar(cx+halfW,0,T,H);break;
    case '8':
      bar(cx-halfW,0,T,H);bar(cx+halfW,0,T,H);bar(cx,halfH,W,T);bar(cx,0,W,T);bar(cx,-halfH,W,T);break;
    case '9':
      bar(cx-halfW,midH,T,halfH);bar(cx+halfW,0,T,H);bar(cx,halfH,W,T);bar(cx,0,W,T);bar(cx,-halfH,W,T);break;
    default:
      bar(cx,0,T,H);break;
  }
  return parts;
}
function buildBadgeGeometries(numStr:string):THREE.BufferGeometry[]{
  const str=String(numStr).trim();
  if(str.length===1)return buildDigitGeometries(str[0],0);
  return [...buildDigitGeometries(str[0]||'0',-.062),...buildDigitGeometries(str[1]||'0',.058)];
}

export function createRider(materialFactory:MaterialFactory,color:number,customColors?:{frame?:number;jersey?:number;helmet?:number},riderNumber:string|number='07'):RiderVisual{
  const group=new THREE.Group();group.name='Athlete and BMX';
  const bike=new THREE.Group();group.add(bike);
  const frameMat=materialFactory(customColors?.frame ?? color,'metal'),dark=materialFactory(0x172f37,'rubber');
  const silver=materialFactory(0xc0c9b6,'metal'),kit=materialFactory(customColors?.jersey ?? color,'cloth');
  const cream=materialFactory(0xf4ebc9,'cloth'),pants=materialFactory(0x233a47,'cloth');
  const skin=materialFactory(0xc38f65,'skin'),visorMat=materialFactory(0x12343e,'metal');
  const accent=materialFactory(customColors?.helmet ?? 0xfbb64b,'helmet');
  const frame=new THREE.Group();bike.add(frame);
  const crankCenter=v(0,.44,.10),seat=v(0,.96,.32),neck=v(0,.92,-.44),lowerNeck=v(0,.73,-.50),rear=v(0,.36,.69);
  const frameParts:THREE.BufferGeometry[]=[];
  const links:[[THREE.Vector3,THREE.Vector3],number][]=[[[crankCenter,seat],.038],[[seat,neck],.044],[[lowerNeck,crankCenter],.050],[[neck,lowerNeck],.059]];
  links.forEach(([p,r])=>frameParts.push(tube(p[0],p[1],r)));
  for(const side of [-1,1]){const axle=rear.clone().setX(side*.10);frameParts.push(tube(crankCenter.clone().setX(side*.06),axle,.025),tube(seat.clone().setX(side*.055),axle,.025));}
  batch(frame,frameParts,frameMat,true);
  // Saddle, seat post, sprocket, bottom bracket and a visible sprung rear shock.
  batch(frame,[tube(seat,v(0,1.06,.34),.027),tube(v(-.16,.44,.10),v(.16,.44,.10),.066)],silver);
  const saddle=block(frame,dark,v(0,1.06,.36),v(.22,.075,.34));saddle.rotation.x=-.10;
  const sprocket=new THREE.Mesh(new THREE.TorusGeometry(.102,.014,5,18),dark);sprocket.rotation.y=Math.PI/2;sprocket.position.set(.13,.44,.10);frame.add(sprocket);
  const chainParts:THREE.BufferGeometry[]=[];
  for(const y of [-1,1])chainParts.push(tube(v(.14,.44+y*.089,.10),v(.14,.36+y*.048,.69),.009,undefined,4));
  batch(frame,chainParts,dark);
  const coilPts:THREE.Vector3[]=[];for(let i=0;i<60;i++){const t=i/59;coilPts.push(v(Math.cos(t*Math.PI*12)*.043,.64+t*.19,.22+Math.sin(t*Math.PI*12)*.043));}
  frame.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts),48,.008,4,false),accent));
  const shock=bone(frame,silver,.022);placeBone(shock,v(0,.61,.22),v(0,.87,.22));
  const wheels:THREE.Group[]=[];
  for(const z of [-.69,.69]){
    const wheel=new THREE.Group();wheel.position.set(0,.36,z);bike.add(wheel);wheels.push(wheel);
    const tire=new THREE.TorusGeometry(.303,.058,7,28);tire.rotateY(Math.PI/2);
    const knobs:THREE.BufferGeometry[]=[tire];
    for(let k=0;k<28;k++){const angle=k/28*Math.PI*2;const q=new THREE.Quaternion().setFromAxisAngle(v(1,0,0),angle);
      knobs.push(transformed(box,v(0,Math.cos(angle)*.359,Math.sin(angle)*.359),v(.10,.023,.040),q));}
    batch(wheel,knobs,dark);
    const rim=new THREE.TorusGeometry(.259,.018,5,28);rim.rotateY(Math.PI/2);
    const spokes:THREE.BufferGeometry[]=[rim,tube(v(-.11,0,0),v(.11,0,0),.046)];
    for(let k=0;k<20;k++){const a=k/20*Math.PI*2;spokes.push(tube(v(k%2?.048:-.048,0,0),v(0,Math.sin(a)*.25,Math.cos(a)*.25),.005,undefined,3));}
    batch(wheel,spokes,silver);
    const rotor=new THREE.TorusGeometry(.087,.009,4,12);rotor.rotateY(Math.PI/2);rotor.translate(-.08,0,0);batch(wheel,[rotor],silver);
  }
  const steering=new THREE.Group();steering.position.set(0,.91,-.44);bike.add(steering);
  const forkTubes:THREE.Mesh[]=[];
  for(const side of [-1,1]){
    const tubeMesh=bone(bike,silver,.033);forkTubes.push(tubeMesh);
  }
  batch(steering,[tube(v(0,0,0),v(0,.17,-.10),.033),tube(v(-.38,.17,-.10),v(-.19,.14,-.15),.021),tube(v(-.19,.14,-.15),v(.19,.14,-.15),.021),tube(v(.19,.14,-.15),v(.38,.17,-.10),.021)],silver);
  batch(steering,[-1,1].flatMap(side=>[tube(v(side*.30,.17,-.10),v(side*.42,.17,-.10),.031),tube(v(side*.31,.14,-.12),v(side*.37,.10,-.20),.012)]),dark);
  const pedals:THREE.Mesh[]=[];const crankArms:THREE.Mesh[]=[];
  for(const side of [-1,1]){crankArms.push(bone(bike,silver,.018));pedals.push(block(bike,dark,v(),v(.18,.040,.13)));}
  const athlete=new THREE.Group();group.add(athlete);
  const pelvis=ball(athlete,pants,v(),v(.21,.15,.17));
  const torso=bone(athlete,kit,.225); // Tapered by torso scale below; not a rigid parent for the arms.
  torso.geometry=torsoGeo;
  const chest=ball(athlete,kit,v(),v(.225,.18,.14));
  const backPanel=block(athlete,cream,v(),v(.29,.28,.022));
  const badge=new THREE.Group();athlete.add(badge);
  let badgeMesh:THREE.Mesh|null=null;
  function setBadgeNumber(num:string|number){
    if(badgeMesh){
      badge.remove(badgeMesh);
      badgeMesh.geometry.dispose();
      badgeMesh=null;
    }
    const geoms=buildBadgeGeometries(String(num));
    if(geoms.length>0){badgeMesh=batch(badge,geoms,pants);}
  }
  setBadgeNumber(riderNumber);
  const neckMesh=bone(athlete,skin,.069);
  const head=new THREE.Group();athlete.add(head);
  head.scale.set(.79,.84,.82);
  ball(head,skin,v(0,-.005,-.025),v(.145,.18,.15));
  ball(head,frameMat,v(0,.047,.022),v(.211,.228,.221),true);
  ball(head,visorMat,v(0,.035,-.174),v(.168,.100,.063));
  const brow=block(head,accent,v(0,.145,-.18),v(.35,.042,.18));brow.rotation.x=.15;
  const chinParts=[tube(v(-.17,-.045,-.10),v(-.13,-.14,-.22),.040),tube(v(.17,-.045,-.10),v(.13,-.14,-.22),.040),tube(v(-.13,-.14,-.22),v(.13,-.14,-.22),.043)];batch(head,chinParts,frameMat);
  block(head,cream,v(0,-.137,-.263),v(.15,.035,.011));
  batch(head,[tube(v(-.202,.033,-.06),v(-.203,.033,.12),.023),tube(v(.202,.033,-.06),v(.203,.033,.12),.023)],cream);
  // Recessed helmet vents and a narrow goggle seal break up the toy-like shell.
  for(const side of [-1,1]){
    const vent=block(head,dark,v(side*.12,.237,-.025),v(.036,.012,.13));vent.rotation.z=-side*.28;
    block(head,dark,v(side*.204,.095,.04),v(.009,.035,.095));
  }
  const limbs=[-1,1].map(side=>({side,
    shoulder:ball(athlete,kit,v(),v(.085,.092,.086)),
    upperArm:bone(athlete,kit,.080),forearm:bone(athlete,skin,.052),elbow:ball(athlete,skin,v(),v(.057,.057,.057)),
    glove:ball(athlete,dark,v(),v(.066,.056,.072)),thigh:bone(athlete,pants,.099),shin:bone(athlete,pants,.065),
    knee:ball(athlete,dark,v(),v(.078,.095,.087)),shoe:block(athlete,cream,v(),v(.135,.09,.245)),
  }));
  for(const l of limbs){
    l.upperArm.geometry=armGeo;l.forearm.geometry=forearmGeo;
    l.thigh.geometry=legGeo;l.shin.geometry=forearmGeo;
    // Sole and toe volumes read as shoes, rather than rectangular pedal blocks.
    l.shoe.geometry=sphere;l.shoe.scale.set(.076,.054,.133);
    l.shoe.add(new THREE.Mesh(new THREE.BoxGeometry(1.65,.22,1.7),dark));
    l.shoe.children[0].position.set(0,-.70,.05);
  }
  // Small dynamic silhouette meshes get hulls; tubes and spokes use the shared
  // screen-space creases, avoiding hundreds of outline draw calls across four bikes.
  addOutline(torso,1.2);addOutline(chest,1.1);addOutline(pelvis,1.05);
  for(const l of limbs){addOutline(l.thigh,.85);addOutline(l.upperArm,.85);}
  const hip=v(),shoulderCenter=v(),headBase=v(),a=v(),end=v(),joint=v(),pole=v();
  let legCompression=.12,spineCompression=.12,headCompression=.12;
  let wheelAngle=0;
  let lastSpeed=0,lastCadence=0,brakingWeight=0,pedalEffort=0,gaze=0;
  const localFeet=[v(),v()];
  let crashClock=0;
  return {
    group,
    setColors(c:{frame?:number;jersey?:number;helmet?:number}){
      if(c.frame!==undefined&&(frameMat as any).uniforms?.uColor){
        (frameMat as any).uniforms.uColor.value.setHex(c.frame);
      }
      if(c.jersey!==undefined&&(kit as any).uniforms?.uColor){
        (kit as any).uniforms.uColor.value.setHex(c.jersey);
      }
      if(c.helmet!==undefined&&(accent as any).uniforms?.uColor){
        (accent as any).uniforms.uColor.value.setHex(c.helmet);
      }
    },
    setNumber(num:string|number){
      setBadgeNumber(num);
    },
    update(state:RiderState,sample:TrackSample,dt:number,time:number){
    // The visible trail ribbon sits 10–11.5 cm above its physics sample. Match
    // that offset so tire contact is visible instead of buried in the ribbon.
    group.position.copy(state.position);group.position.y+=.14;
    group.rotation.set(state.pitch,state.yaw,state.roll,'YXZ');
    if(state.crash>0){crashClock+=dt;}else{crashClock=0;}
    legCompression=THREE.MathUtils.damp(legCompression,state.compression,13,dt);
    spineCompression=THREE.MathUtils.damp(spineCompression,legCompression,8,dt);
    headCompression=THREE.MathUtils.damp(headCompression,spineCompression,6,dt);
    const deceleration=dt>0?THREE.MathUtils.clamp((lastSpeed-state.speed)/(dt*15),0,1):0;
    brakingWeight=THREE.MathUtils.damp(brakingWeight,deceleration,5,dt);
    const cadenceRate=dt>0?Math.abs(state.cadence-lastCadence)/dt:0;
    pedalEffort=THREE.MathUtils.damp(pedalEffort,!state.airborne?Math.min(1,cadenceRate/7):0,7,dt);
    lastSpeed=state.speed;lastCadence=state.cadence;
    const c=legCompression,landing=spineCompression;
    const rotProgress=THREE.MathUtils.clamp(state.trickRotation/(Math.PI*2),0,1);
    const pose=state.airborne&&state.trick?(rotProgress<0.20?rotProgress/0.20:rotProgress>0.80?(1-rotProgress)/0.20:1.0):0;
    const superman=state.trick==='SUPERMAN'?pose:0;
    const backflip=state.trick==='BACKFLIP'?pose:0;
    const frontflip=state.trick==='FRONTFLIP'?pose:0;
    const spin360=state.trick==='360'?pose:0;
    const tuck=state.trick==='BACKFLIP'||state.trick==='FRONTFLIP'?pose:0;
    const tail=state.trick==='TAILWHIP'?Math.sin(state.trickRotation)*.48:0;
    const cancan=state.trick==='CAN-CAN'?pose:0;
    const nohander=state.trick==='NO-HANDER'?pose:0;
    const nacnac=state.trick==='NAC-NAC'?pose:0;
    const tabletop=state.trick==='TABLETOP'?pose:0;
    const crashAmt=state.crash>0?THREE.MathUtils.clamp(state.crash/0.8,0,1):0;
    const sideDir=state.roll>0?1:-1;
    if(crashAmt>0){
      const t=crashClock;
      const decay=Math.exp(-t*2.5);
      const targetWx=-sideDir*Math.min(0.68,0.25+t*0.7);
      const targetWy=-0.18+Math.abs(Math.sin(t*8))*0.05*decay;
      const targetWz=Math.min(0.55,0.15+t*0.6);
      const roll=state.roll;
      const cosR=Math.cos(roll),sinR=Math.sin(roll);
      const lx=targetWx*cosR+targetWy*sinR;
      const ly=-targetWx*sinR+targetWy*cosR;
      athlete.position.set(lx*crashAmt,ly*crashAmt,targetWz*crashAmt);

      const targetRollWorld=-sideDir*1.42;
      const targetAthleteRotZ=targetRollWorld-roll;
      athlete.rotation.z=targetAthleteRotZ*crashAmt+Math.sin(t*10)*0.12*decay;
      athlete.rotation.x=Math.sin(t*8)*0.18*decay;
      athlete.rotation.y=-sideDir*0.30+Math.cos(t*6)*0.15*decay;

      const bikeDecay=Math.exp(-t*3.0);
      bike.position.x=sideDir*Math.min(0.25,t*0.6);
      bike.position.y=-state.compression*.055-0.06;
      bike.rotation.z=-sideDir*(0.20+Math.sin(t*12)*0.12*bikeDecay);
      bike.rotation.y=sideDir*(0.35+Math.cos(t*8)*0.20*bikeDecay);
      steering.rotation.y=sideDir*(1.10+Math.sin(t*16)*0.25*bikeDecay);
    }else{
      athlete.position.set(0,0,0);
      athlete.rotation.set(0,0,0);
      bike.position.x=0;
      bike.position.y=-state.compression*.055;
      bike.rotation.z=0;
      bike.rotation.y=tail+(nacnac?pose*0.25:0);
      steering.rotation.y=state.lean*.30+(state.trick==='X-UP'?pose*1.6:0)+(nacnac?pose*0.35:0);
    }
    wheelAngle-=state.speed*dt/.36*(crashAmt>0?0.2:1);
    wheels.forEach(w=>{w.rotation.x=wheelAngle;});
    wheels[0].rotation.y=steering.rotation.y*.60;
    wheels[0].position.y=.36+state.compression*.045;
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      placeBone(forkTubes[i],v(side*.095,.94-state.compression*.05,-.45),v(side*.095,wheels[0].position.y,-.69));
      const angle=state.cadence+i*Math.PI;
      end.set(side*.17,.44+Math.sin(angle)*.145,.10+Math.cos(angle)*.145);
      pedals[i].position.copy(end);placeBone(crankArms[i],v(side*.13,.44,.10),end);
      localFeet[i].copy(end).add(v(0,.065,-.035)).applyAxisAngle(Y,tail);localFeet[i].y+=bike.position.y;
      if (superman > 0) {
        const feetBack = v(side * 0.08, 1.24, 1.54);
        localFeet[i].lerp(feetBack, superman);
      }
      if (cancan > 0) {
        const feetSide = v(0.50 + i * 0.14, 0.84, 0.08 + i * 0.10);
        localFeet[i].lerp(feetSide, cancan);
      }
      if (nacnac > 0 && i === 1) {
        const feetNac = v(-0.36, 0.74, 0.42);
        localFeet[i].lerp(feetNac, nacnac);
      }
      if (crashAmt > 0) {
        const t=crashClock, legDecay=Math.exp(-t*2.2);
        const groundFoot=v(side*0.10,0.15+Math.sin(t*10)*0.08*legDecay,0.35);
        const outerFoot=v(side*0.18,0.30+Math.sin(t*12)*0.12*legDecay,0.50);
        localFeet[i].lerp(i===0?groundFoot:outerFoot,crashAmt);
      }
    }
    // Sequential landing response: suspension, knees, pelvis/spine, then helmet.
    const roadBuzz=!state.airborne?Math.sin(state.s*2.1)*Math.min(.005,state.speed*.0002):0;
    const effort=Math.min(1,state.speed/22),pedalSway=Math.sin(state.cadence)*.016*pedalEffort;
    const breathing=Math.sin(time*2.0+state.id)*.004;
    hip.set(-state.lean*.085+pedalSway,1.20-c*.24-backflip*.16+frontflip*.12+roadBuzz,.29+brakingWeight*.085+superman*.35+backflip*.14-frontflip*.20-nohander*.10);
    shoulderCenter.set(-state.lean*.12-pedalSway*.4,1.58-effort*.105-landing*.28-superman*.44-backflip*.14-frontflip*.12+breathing+brakingWeight*.045,-.23-effort*.07+brakingWeight*.065+superman*.12+backflip*.18-frontflip*.24);
    if (tabletop > 0) {
      hip.x += pose * 0.28;
      shoulderCenter.x += pose * 0.42;
    }
    if (crashAmt > 0) {
      const t=crashClock, flail=Math.exp(-t*2.5);
      const crashHip=v(0,0.72+Math.abs(Math.sin(t*8))*0.08*flail,0.15);
      const crashShoulder=v(0,1.32+Math.abs(Math.sin(t*7))*0.10*flail,-0.08);
      hip.lerp(crashHip,crashAmt);
      shoulderCenter.lerp(crashShoulder,crashAmt);
    }
    pelvis.position.copy(hip);pelvis.rotation.z=state.lean*.2;
    placeBone(torso,hip,shoulderCenter,.204);torso.scale.z*=.77;
    chest.position.copy(shoulderCenter).lerp(hip,.23);chest.quaternion.copy(torso.quaternion);
    backPanel.position.copy(chest.position).add(v(0,.005,.166).applyQuaternion(torso.quaternion));backPanel.quaternion.copy(torso.quaternion);
    badge.position.copy(backPanel.position).add(v(0,0,.014).applyQuaternion(torso.quaternion));badge.quaternion.copy(torso.quaternion);
    headBase.copy(shoulderCenter).add(v(0,.18+(landing-headCompression)*.16,-.08));
    placeBone(neckMesh,shoulderCenter,headBase);
    head.position.copy(headBase).add(v(0,.10,-.055));
    gaze=THREE.MathUtils.damp(gaze,THREE.MathUtils.clamp(-sample.curvature*60-state.lean*.17,-.42,.42),6,dt);
    const crashHead = crashAmt > 0 ? Math.sin(crashClock * 10) * 0.20 * Math.exp(-crashClock * 2.5) : 0;
    const crashHeadRoll = crashAmt > 0 ? -sideDir * 0.25 * crashAmt : 0;
    const flipHead = state.trick === 'BACKFLIP' ? (0.75 * backflip + state.pitch * 0.30) : (frontflip > 0 ? -0.45 * frontflip : 0);
    head.rotation.set(-.06 - state.pitch * .30 + flipHead + (landing - headCompression) * .22 + (superman > 0 ? 0.68 * superman : 0) + crashHead, gaze + (spin360 > 0 ? Math.sin(state.trickRotation) * 0.50 : 0) + (crashAmt > 0 ? sideDir * 0.20 : 0), -state.roll * .30 + crashHeadRoll);
    for(let i=0;i<2;i++){
      const l=limbs[i],side=l.side;
      // Bar endpoints account for the steering and frame's trick articulation.
      end.set(side*.365,.17,-.10).applyAxisAngle(Y,steering.rotation.y).add(steering.position).applyAxisAngle(Y,tail);end.y+=bike.position.y;
      if (nohander > 0) {
        const wingHand = v(side * 0.66, 1.36, 0.24);
        end.lerp(wingHand, nohander);
      }
      if (crashAmt > 0) {
        const t=crashClock, armDecay=Math.exp(-t*2.4);
        const braceArm=v(side*0.30,0.95+Math.sin(t*8)*0.08*armDecay,-0.22);
        const flailArm=v(side*0.36,1.35+Math.sin(t*11)*0.15*armDecay,0.08);
        const crashHand=side===-sideDir?braceArm:flailArm;
        end.lerp(crashHand,crashAmt);
      }
      a.copy(shoulderCenter).add(v(side*.195,-.025,.015));l.shoulder.position.copy(a);pole.set(side*.49,1.30-landing*.15,.02);
      if (superman > 0) {
        pole.set(side * 0.28, 1.20, -0.22);
      }
      if (backflip > 0) {
        pole.set(side * 0.44, 1.44, 0.12);
      }
      if (frontflip > 0) {
        pole.set(side * 0.32, 1.18, -0.25);
      }
      if (crashAmt > 0) {
        pole.set(side * 0.38, side === -sideDir ? 0.90 : 1.35, -0.15);
      }
      solveJoint(a,end,pole,.365,.365,joint);placeBone(l.upperArm,a,joint);placeBone(l.forearm,joint,end);l.elbow.position.copy(joint);l.glove.position.copy(end);
      a.copy(hip).add(v(side*.13,-.02,0));end.copy(localFeet[i]);pole.set(side*(.26+pose*.065),.78-c*.10,-.34-superman*.15);
      if (superman > 0) {
        pole.set(side * 0.08, 1.12, 1.09);
      }
      if (backflip > 0) {
        pole.set(side * 0.14, 0.94, 0.20);
      }
      if (frontflip > 0) {
        pole.set(side * 0.14, 0.88, -0.15);
      }
      if (nohander > 0) {
        pole.set(side * 0.08, 0.82, -0.15);
      }
      if (crashAmt > 0) {
        pole.set(side * 0.28, 0.45, -0.12);
      }
      solveJoint(a,end,pole,.47,.46,joint);placeBone(l.thigh,a,joint);placeBone(l.shin,joint,end);l.knee.position.copy(joint);
      l.shoe.position.copy(end).add(v(0,.012,-.045));
      const shoeTail = cancan > 0 ? 0.3 : nacnac > 0 && i === 1 ? -0.4 : tail;
      l.shoe.rotation.set(-.08 + (superman > 0 ? 1.45 * superman : 0) + (crashAmt > 0 ? 0.45 * crashAmt : 0), shoeTail, 0);
    }
  }};
}
