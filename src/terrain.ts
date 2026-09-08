import * as THREE from 'three';
import {addOutline} from './npr';
import type { EnvironmentDef, MaterialFactory, TrackSample, World } from './types';

// SUNBREAK mountain. The height field is eroded once, then carved by the course.
// The rings below sample that same field: visual ground and wheel contacts agree.
const SIZE = 257, DOMAIN = 3200, MIN_X = -1600, MIN_Z = -2400;
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(x: number, y: number) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function noise(x: number, y: number) { const a = Math.floor(x), b = Math.floor(y); let u = x - a, v = y - b; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(a,b),hash(a+1,b),u),THREE.MathUtils.lerp(hash(a,b+1),hash(a+1,b+1),u),v); }
function smooth(a:number,b:number,x:number) { const t = THREE.MathUtils.clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }

function erode(field: Float32Array) {
  // Hydraulic droplets carry sediment downhill; deposition preserves fans,
  // while an inertial gradient cuts coherent gullies rather than random pits.
  const rand = rng(7321), stride = SIZE;
  const sample = (x:number,y:number) => { const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,k=iy*stride+ix; const a=field[k],b=field[k+1],c=field[k+stride],d=field[k+stride+1]; return {h:a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v,gx:(b-a)*(1-v)+(d-c)*v,gy:(c-a)*(1-u)+(d-b)*u}; };
  for(let drop=0;drop<14500;drop++) {
    let x=2+rand()*(SIZE-5), y=2+rand()*(SIZE-5), dx=0,dy=0,speed=1,water=1,sediment=0;
    for(let life=0;life<38;life++) {
      const old=sample(x,y); dx=dx*.16-old.gx*.84;dy=dy*.16-old.gy*.84;
      const len=Math.hypot(dx,dy); if(len<1e-5) break; dx/=len;dy/=len;
      const nx=x+dx,ny=y+dy;if(nx<2||nx>SIZE-3||ny<2||ny>SIZE-3)break;
      const next=sample(nx,ny),delta=next.h-old.h, capacity=Math.max(-delta,.015)*speed*water*3.8;
      const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,k=iy*stride+ix;
      if(sediment>capacity||delta>0) {
        const deposit=delta>0?Math.min(delta,sediment):(sediment-capacity)*.27; sediment-=deposit;
        field[k]+=deposit*(1-u)*(1-v);field[k+1]+=deposit*u*(1-v);field[k+stride]+=deposit*(1-u)*v;field[k+stride+1]+=deposit*u*v;
      } else {
        const amount=Math.min((capacity-sediment)*.16,Math.max(-delta,0));
        for(let oz=-1;oz<=1;oz++)for(let ox=-1;ox<=1;ox++){const weight=ox===0&&oz===0?.25:ox===0||oz===0?.125:.0625;field[k+oz*stride+ox]-=amount*weight;}
        sediment+=amount;
      }
      speed=Math.sqrt(Math.max(.05,speed*speed-delta*.6)); water*=.978;x=nx;y=ny;
    }
  }
}

/** Flat authored colours still participate in the unified normal/depth MRT.
 * Stock MeshBasicMaterial has only one output and cannot render into this pass. */
function flatMaterial(color:number,map:THREE.Texture|null=null) {
  return new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3,side:THREE.DoubleSide,
    uniforms:{uColor:{value:new THREE.Color(color)},uMap:{value:map},uHasMap:{value:map!==null}},
    vertexShader:/* glsl */`
      out vec2 vUv;out vec3 vNormal;out float vDepth;
      void main(){
        vec4 p=vec4(position,1.0);
        #ifdef USE_INSTANCING
          p=instanceMatrix*p;
        #endif
        vec4 viewP=modelViewMatrix*p;
        vUv=uv;vNormal=normalize(normalMatrix*normal);vDepth=-viewP.z;
        gl_Position=projectionMatrix*viewP;
      }`,
    fragmentShader:/* glsl */`
      precision highp float;
      in vec2 vUv;in vec3 vNormal;in float vDepth;
      uniform vec3 uColor;uniform sampler2D uMap;uniform bool uHasMap;
      layout(location=0) out vec4 outColor;
      layout(location=1) out vec4 outNormalDepth;
      void main(){
        vec3 color=uColor;if(uHasMap)color*=texture(uMap,vUv).rgb;
        outColor=vec4(color,1.0);
        outNormalDepth=vec4(normalize(vNormal)*0.5+0.5,vDepth/10000.0);
      }`,
  });
}

export interface TrackDef {
  id: number;
  name: string;
  subtitle: string;
  seed: number;
  controls: [number, number][];
  elevationFn: (z: number) => number;
  jumpRatios: number[];
  jumpLifts: number[];
  hasRavine: boolean;
  ravineJumpIndex?: number;
  sectionNames: string[];
  riverZ: number;
  environment: EnvironmentDef;
}

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 0,
    name: 'THE SUNBREAK DESCENT',
    subtitle: 'SUMMIT → RIVER VALLEY',
    seed: 202602,
    controls: [
      [0,0],[6,-48],[-27,-102],[4,-165],[63,-225],[88,-300],[-17,-373],[-108,-430],[-125,-485],[-26,-527],[87,-572],[127,-637],[58,-698],[-38,-759],[-83,-821],[-43,-892],[52,-974],[69,-1050],[25,-1130],[-50,-1212],[-100,-1280],[-65,-1375],[18,-1470],[35,-1570],[0,-1690],
    ],
    elevationFn: (z: number) => 451 + z * .245 + Math.sin(-z / 270) * 9,
    jumpRatios: [.185, .360, .431, .580, .718, .885],
    jumpLifts: [1.8, 2.0, 2.1, 2.3, 4.2, 2.1],
    hasRavine: true,
    ravineJumpIndex: 4,
    sectionNames: ['NEEDLE POINT','THE FALL LINE','CEDAR SWITCHBACKS','ROCK GARDEN','SKY TABLE','RAZOR RIDGE','THE DIVIDE','RIVER RUN','HOME STRAIGHT'],
    riverZ: -1740,
    environment: {
      skyHorizon: '#e8cf97',
      skyZenith: '#4e9fb0',
      fogColor: '#a8c7b8',
      sunshaftColor: 0xffe2a3,
      terrainColors: ['#82a777','#a8b87b','#919e92','#b8c398','#f2e5c0'],
      dirtColor: 0xc69d65,
      edgeColor: 0x8e9565,
      wornColor: 0xd8b780,
      ridgeColors: [0x668f88, 0x8eaaa0, 0xb6c3ac, 0xd7d7b9],
      trunkColor: 0x675845,
      leafColor: 0x587b68,
      leafLightColor: 0x829769,
      rockColor: 0x79848a,
      flowerColor: 0xf4cb67,
      riverColor: 0x79b6b2,
      waterGlintColor: 0xe7e8bd,
    },
  },
  {
    id: 1,
    name: 'RIDGE RUNNER',
    subtitle: 'RAZOR CREST → CEDAR GORGE',
    seed: 202603,
    controls: [
      [0, 0], [-25, -55], [38, -110], [75, -170], [30, -235], [-45, -305], [-95, -370], [-55, -440],
      [22, -505], [92, -570], [130, -640], [70, -710], [-35, -780], [-115, -845], [-140, -920],
      [-65, -995], [45, -1075], [105, -1155], [65, -1235], [-35, -1310], [-90, -1390], [-48, -1475],
      [30, -1565], [15, -1655], [0, -1750]
    ],
    elevationFn: (z: number) => 468 + z * .252 + Math.sin(-z / 240) * 11,
    jumpRatios: [.160, .315, .450, .585, .720, .860],
    jumpLifts: [1.9, 2.1, 2.2, 2.4, 2.2, 2.0],
    hasRavine: false,
    sectionNames: ['RAZOR CREST','DEVIL S DROP','PINE CHICANE','SLATE CORRIDOR','TWIN ROLLERS','CEDAR GORGE','THE FLUME','TIMBERLINE','SPRINT FINISH'],
    riverZ: -1780,
    environment: {
      skyHorizon: '#c8dbe3',
      skyZenith: '#26495c',
      fogColor: '#98b4c4',
      sunshaftColor: 0xbedde6,
      terrainColors: ['#5b6960','#728070','#838e91','#9ea7a6','#d6dcd9'],
      dirtColor: 0x827c73,
      edgeColor: 0x5c6361,
      wornColor: 0xa19c94,
      ridgeColors: [0x364852, 0x4f6470, 0x728996, 0xa5b8c2],
      trunkColor: 0x44403c,
      leafColor: 0x385452,
      leafLightColor: 0x507370,
      rockColor: 0x6b777d,
      flowerColor: 0xccd8e0,
      riverColor: 0x8bc3d1,
      waterGlintColor: 0xffffff,
    },
  },
  {
    id: 2,
    name: 'GRAVITY LAB',
    subtitle: 'NORTH BLUFF → LAKE BASIN',
    seed: 202604,
    controls: [
      [0, 0], [28, -60], [68, -125], [35, -195], [-48, -270], [-95, -345], [-55, -425],
      [30, -505], [118, -580], [150, -660], [95, -740], [-20, -820], [-105, -900], [-130, -985],
      [-60, -1070], [52, -1160], [115, -1250], [75, -1340], [-30, -1425], [-95, -1510], [-65, -1605],
      [20, -1710], [35, -1815], [0, -1920]
    ],
    elevationFn: (z: number) => 482 + z * .238 + Math.sin(-z / 290) * 13,
    jumpRatios: [.150, .260, .390, .510, .650, .780, .890],
    jumpLifts: [2.2, 2.5, 2.4, 2.6, 2.8, 2.5, 2.3],
    hasRavine: false,
    sectionNames: ['NORTH BLUFF','STEP DOWN','MEGA TABLE','BERM SLALOM','SUPER KICKER','HIP JUMP','SLOPESTYLE PARK','LAKE BASIN','VICTORY RUN'],
    riverZ: -1940,
    environment: {
      skyHorizon: '#ffebaa',
      skyZenith: '#1e88e5',
      fogColor: '#bee3db',
      sunshaftColor: 0xfff0b8,
      terrainColors: ['#549646','#72b54e','#6e8064','#92ca60','#fae5a8'],
      dirtColor: 0xde9b43,
      edgeColor: 0x4b853c,
      wornColor: 0xf5bc64,
      ridgeColors: [0x2d6a5e, 0x4b8e7e, 0x72b9a2, 0xa5dec9],
      trunkColor: 0x543d2b,
      leafColor: 0x429648,
      leafLightColor: 0x66bf6a,
      rockColor: 0x6e7880,
      flowerColor: 0xffeb3b,
      riverColor: 0x29b6f6,
      waterGlintColor: 0xffffff,
    },
  },
  {
    id: 3,
    name: 'RED DUST CANYON',
    subtitle: 'SLICKROCK RIDGE → COYOTE GULCH',
    seed: 202605,
    controls: [
      [0, 0], [-35, -70], [-80, -145], [-40, -220], [45, -295], [110, -370], [80, -450],
      [-25, -530], [-105, -610], [-135, -695], [-65, -780], [40, -865], [125, -950],
      [90, -1040], [-20, -1125], [-95, -1215], [-60, -1305], [35, -1400], [90, -1495],
      [50, -1595], [-20, -1690], [0, -1820]
    ],
    elevationFn: (z: number) => 475 + z * .244 + Math.sin(-z / 210) * 12 + Math.cos(-z / 420) * 8,
    jumpRatios: [.170, .310, .460, .590, .730, .870],
    jumpLifts: [2.0, 2.3, 2.2, 2.5, 2.3, 2.1],
    hasRavine: false,
    sectionNames: ['SLICKROCK RIDGE','RED WALL DROP','SANDSTONE GULLY','COYOTE CHICANE','CANYON GAP','DUST BOWL','ECHO CHASM','RIVER BED','CANYON EXIT'],
    riverZ: -1840,
    environment: {
      skyHorizon: '#fca768',
      skyZenith: '#665575',
      fogColor: '#d48866',
      sunshaftColor: 0xfdd2a0,
      terrainColors: ['#b84d30','#c85d38','#9e3f28','#d67548','#e8a272'],
      dirtColor: 0xb33620,
      edgeColor: 0x7a2516,
      wornColor: 0xd15536,
      ridgeColors: [0x681d18, 0x8a2f22, 0xb84e36, 0xde7d58],
      trunkColor: 0x4a3227,
      leafColor: 0x5c613e,
      leafLightColor: 0x7d8253,
      rockColor: 0x9e3f2b,
      flowerColor: 0xf09848,
      riverColor: 0x9c6842,
      waterGlintColor: 0xf2cf9b,
    },
  },
  {
    id: 4,
    name: 'BLACK FOREST SLALOM',
    subtitle: 'CROWN PEAK → MOSS CREEK',
    seed: 202606,
    controls: [
      [0, 0], [35, -65], [85, -135], [50, -210], [-35, -285], [-110, -365], [-75, -450],
      [30, -535], [120, -620], [145, -710], [80, -800], [-30, -890], [-120, -980],
      [-145, -1075], [-70, -1170], [45, -1265], [130, -1360], [85, -1460], [-35, -1560],
      [-110, -1660], [-70, -1770], [25, -1890], [0, -2020]
    ],
    elevationFn: (z: number) => 510 + z * .248 + Math.sin(-z / 260) * 14,
    jumpRatios: [.140, .280, .430, .580, .720, .860],
    jumpLifts: [2.0, 2.2, 2.3, 2.5, 2.2, 2.1],
    hasRavine: false,
    sectionNames: ['CROWN PEAK','PINE NEEDLE DROP','ROOT CARPET','THE LABYRINTH','BEAR RIDGE GAP','MOSSY HOLLOW','TIMBER RUN','CREEK CROSSING','FINISH GLADE'],
    riverZ: -2040,
    environment: {
      skyHorizon: '#7a9489',
      skyZenith: '#1b2e28',
      fogColor: '#3a554a',
      sunshaftColor: 0x95baa8,
      terrainColors: ['#1e3b24','#2a4c2d','#334436','#3e5e39','#63755c'],
      dirtColor: 0x3b2b1e,
      edgeColor: 0x203522,
      wornColor: 0x524131,
      ridgeColors: [0x11211a, 0x1c342a, 0x2e4e3f, 0x4d715f],
      trunkColor: 0x2b1e17,
      leafColor: 0x1a3824,
      leafLightColor: 0x2d5538,
      rockColor: 0x424a44,
      flowerColor: 0x8fc286,
      riverColor: 0x214a4d,
      waterGlintColor: 0x8ae0db,
    },
  }
];

export function createWorld(materialFactory: MaterialFactory, trackId = 0): World {
  const trackDef = TRACK_DEFS[trackId] || TRACK_DEFS[0];
  const group=new THREE.Group(); group.name=`Eroded mountain - ${trackDef.name}`;
  const random=rng(trackDef.seed), field=new Float32Array(SIZE*SIZE);
  for(let iz=0;iz<SIZE;iz++)for(let ix=0;ix<SIZE;ix++) {
    const x=MIN_X+ix/(SIZE-1)*DOMAIN,z=MIN_Z+iz/(SIZE-1)*DOMAIN;
    const broad=noise(x/350,z/350)*95+noise(x/130+12,z/130)*34+noise(x/42,z/42)*9;
    const side=Math.pow(Math.min(Math.abs(x)/650,1.8),1.15)*165;
    field[iz*SIZE+ix]=Math.max(-28,423+z*.245+side+broad-45);
  }
  erode(field);
  function rawHeight(x:number,z:number) {
    const fx=THREE.MathUtils.clamp((x-MIN_X)/DOMAIN*(SIZE-1),0,SIZE-1.001),fz=THREE.MathUtils.clamp((z-MIN_Z)/DOMAIN*(SIZE-1),0,SIZE-1.001);
    const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,k=iz*SIZE+ix;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(field[k],field[k+1],u),THREE.MathUtils.lerp(field[k+SIZE],field[k+SIZE+1],u),v);
  }
  const controls=trackDef.controls;
  const curve=new THREE.CatmullRomCurve3(controls.map(([x,z])=>new THREE.Vector3(x,trackDef.elevationFn(z),z)),false,'catmullrom',.35);
  curve.arcLengthDivisions=2200;
  const length=curve.getLength(), count=Math.ceil(length/2), ds=length/count;
  const runoffDistance = 150;
  const runoffCount = Math.ceil(runoffDistance / ds);
  const totalCount = count + runoffCount;
  const totalLength = length + runoffCount * ds;
  const centers:THREE.Vector3[]=[], tangents:THREE.Vector3[]=[], rights:THREE.Vector3[]=[];
  const grid=new Map<string,number[]>(); const bucket=32;
  for(let i=0;i<=count;i++){
    const p=curve.getPointAt(i/count),t=curve.getTangentAt(i/count),r=new THREE.Vector3(-t.z,0,t.x).normalize();
    centers.push(p);tangents.push(t);rights.push(r);
    const key=`${Math.floor(p.x/bucket)},${Math.floor(p.z/bucket)}`;let cell=grid.get(key);if(!cell){cell=[];grid.set(key,cell);}cell.push(i);
  }
  let currP = centers[count].clone();
  let currT = tangents[count].clone().normalize();
  for(let i=count+1;i<=totalCount;i++){
    const lookAheadX = currP.x + currT.x * ds;
    const lookAheadZ = currP.z + currT.z * ds;
    const rawY = rawHeight(lookAheadX, lookAheadZ);
    const slopeToGround = (rawY - currP.y) / ds;
    currT.y = THREE.MathUtils.lerp(currT.y, THREE.MathUtils.clamp(slopeToGround, -0.22, 0.02), 0.06);
    const horizLen = Math.hypot(currT.x, currT.z) || 1;
    const horizScale = Math.sqrt(Math.max(0.01, 1 - currT.y * currT.y));
    currT.x = (currT.x / horizLen) * horizScale;
    currT.z = (currT.z / horizLen) * horizScale;
    currT.normalize();
    const nextP = currP.clone().addScaledVector(currT, ds);
    const r = new THREE.Vector3(-currT.z, 0, currT.x).normalize();
    centers.push(nextP);
    tangents.push(currT.clone());
    rights.push(r);
    const key = `${Math.floor(nextP.x / bucket)},${Math.floor(nextP.z / bucket)}`;
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push(i);
    currP = nextP;
  }
  const env = trackDef.environment;
  const jumpLips=trackDef.jumpRatios.map(r=>length*r);
  const ravineLipIndex = trackDef.hasRavine ? (trackDef.ravineJumpIndex ?? (trackDef.jumpRatios.indexOf(0.718) >= 0 ? trackDef.jumpRatios.indexOf(0.718) : 1)) : 0;
  const ravineLip = trackDef.hasRavine ? jumpLips[ravineLipIndex] : 0;
  function ramp(s:number) {
    for(let i=0;i<jumpLips.length;i++){
      const d=jumpLips[i]-s;
      if(d>=0&&d<17){
        const lift=trackDef.jumpLifts[i]||2.2;
        return {height:(1-d/17)**1.7*lift,amount:1-d/17,lift};
      }
    }
    return {height:0,amount:0,lift:0};
  }
  function ravine(s:number) {
    if(!trackDef.hasRavine) return 0;
    const d=s-ravineLip;return d>1&&d<28 ? 20*Math.min(smooth(1,5,d),1-smooth(23,28,d)) : 0;
  }
  function nearest(x:number,z:number) {
    const bx=Math.floor(x/bucket),bz=Math.floor(z/bucket);let best=Infinity,index=0;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const cell=grid.get(`${bx+dx},${bz+dz}`);if(!cell)continue;for(let j=0;j<cell.length;j++){const k=cell[j],p=centers[k],d=(x-p.x)**2+(z-p.z)**2;if(d<best){best=d;index=k;}}}
    return {distance:Math.sqrt(best),index};
  }
  function height(x:number,z:number) {
    const raw=rawHeight(x,z),n=nearest(x,z);if(n.distance>29)return raw;
    const k=n.index, a=centers[Math.max(0,k-1)],b=centers[Math.min(totalCount,k+1)];
    const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
    const along=(Math.max(0,k-1)+t*(Math.min(totalCount,k+1)-Math.max(0,k-1)))*ds;
    const bed=THREE.MathUtils.lerp(a.y,b.y,t), bank=n.distance>5?Math.sin(Math.min((n.distance-5)/15,1)*Math.PI)*1.6:0;
    return THREE.MathUtils.lerp(bed+bank,raw,smooth(7,29,n.distance))+ramp(along).height*(1-smooth(7.5,13,n.distance))-ravine(along)*(1-smooth(13,29,n.distance));
  }
  const sectionNames=trackDef.sectionNames;
  function sample(s:number,lateral=0):TrackSample {
    const clamped=THREE.MathUtils.clamp(s,0,totalLength),f=clamped/ds,i=Math.min(totalCount-1,Math.floor(f)),u=f-i;
    const position=centers[i].clone().lerp(centers[i+1],u),tangent=tangents[i].clone().lerp(tangents[i+1],u).normalize(),right=rights[i].clone().lerp(rights[i+1],u).normalize();
    position.addScaledVector(right,lateral);
    const j=ramp(clamped);position.y+=j.height-ravine(clamped);
    if(j.amount>0){const lift=j.lift||2.2;tangent.y+=1.7*lift/17*j.amount**.7*Math.hypot(tangent.x,tangent.z);tangent.normalize();}
    // A broad, gentle berm reads clearly without forcing every rider onto its crown.
    const turn=tangents[Math.min(totalCount,i+7)].x-tangents[Math.max(0,i-7)].x;
    position.y+=Math.max(0,-Math.sign(turn)*lateral)*Math.min(Math.abs(turn)*.19,.08);
    if(Math.abs(lateral)>4.4)position.y=THREE.MathUtils.lerp(position.y,height(position.x,position.z),smooth(4.4,9,Math.abs(lateral)));
    const section=Math.min(8,Math.floor(clamped/length*9));
    return {position,tangent,right,slope:tangent.y/Math.max(.1,Math.hypot(tangent.x,tangent.z)),width:section===5?6.2:7.6,surface:section===0?'rock':section===1?'scree':section===3?'rock':'dirt',section:sectionNames[section],curvature:turn/(14*ds),jump:j.amount};
  }

  // Nested, camera-centred grids are updated one ring per frame. Ring skirts
  // close T-junctions; the world field is unique, so there is no repeated tile.
  const terrainMaterial=materialFactory(0xffffff,'terrain');
  const maskSize=2048,maskData=new Uint8Array(maskSize*maskSize);const texel=DOMAIN/maskSize;
  for(let i=0;i<=totalCount;i++){
    const s=i*ds;if(trackDef.hasRavine&&s>ravineLip+1&&s<ravineLip+28)continue;
    const p=centers[i],cx=(p.x-MIN_X)/texel,cz=(p.z-MIN_Z)/texel,r=6.3/texel;
    for(let iz=Math.floor(cz-r);iz<=Math.ceil(cz+r);iz++)for(let ix=Math.floor(cx-r);ix<=Math.ceil(cx+r);ix++)
      if(ix>=0&&iz>=0&&ix<maskSize&&iz<maskSize&&(ix-cx)**2+(iz-cz)**2<r*r)maskData[iz*maskSize+ix]=255;
  }
  const trackMask=new THREE.DataTexture(maskData,maskSize,maskSize,THREE.RedFormat);trackMask.needsUpdate=true;
  if(terrainMaterial instanceof THREE.ShaderMaterial){terrainMaterial.uniforms.uTrackMask.value=trackMask;terrainMaterial.uniforms.uMasked.value=1;terrainMaterial.uniforms.uTrackRegion.value.set(MIN_X,MIN_Z,DOMAIN,DOMAIN);}
  const terrainColors=env.terrainColors.map(c => new THREE.Color(c));
  type Ring={mesh:THREE.Mesh;positions:Float32Array;colors:Float32Array;local:Float32Array;spacing:number;cx:number;cz:number;target:THREE.BufferGeometry;heights:Float32Array};
  const rings:Ring[]=[];
  for(let level=0;level<8;level++) {
    const spacing=1*2**level,res=48,positions:number[]=[],locals:number[]=[],colors:number[]=[];
    const half=res/2;
    function triangle(x0:number,z0:number,x1:number,z1:number,x2:number,z2:number,y0=0,y1=0,y2=0) { for(const [x,z,y]of[[x0,z0,y0],[x1,z1,y1],[x2,z2,y2]]){positions.push(x*spacing,y,z*spacing);locals.push(x*spacing,z*spacing,y);colors.push(1,1,1);} }
    for(let z=-half;z<half;z++)for(let x=-half;x<half;x++) {
      if(level>0&&x>=-half/2&&x<half/2&&z>=-half/2&&z<half/2)continue;
      triangle(x,z,x,z+1,x+1,z);triangle(x+1,z,x,z+1,x+1,z+1);
    }
    for(let k=-half;k<half;k++){
      const depth=-Math.min(18,spacing*2);
      triangle(k,-half,k+1,-half,k,-half,0,0,depth);triangle(k+1,-half,k+1,-half,k,-half,0,depth,depth);
      triangle(k,half,k,half,k+1,half,0,depth,0);triangle(k+1,half,k,half,k+1,half,0,depth,depth);
      triangle(-half,k,-half,k,-half,k+1,0,depth,0);triangle(-half,k+1,-half,k,-half,k+1,0,depth,depth);
      triangle(half,k,half,k+1,half,k,0,0,depth);triangle(half,k+1,half,k+1,half,k,0,depth,depth);
    }
    const geometry=new THREE.BufferGeometry();const pa=new Float32Array(positions),ca=new Float32Array(colors);
    geometry.setAttribute('position',new THREE.BufferAttribute(pa,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(ca,3).setUsage(THREE.DynamicDrawUsage));
    const mesh=new THREE.Mesh(geometry,terrainMaterial);mesh.frustumCulled=false;mesh.name=`Terrain clipmap ${level}`;group.add(mesh);
    rings.push({mesh,positions:pa,colors:ca,local:new Float32Array(locals),spacing,cx:Infinity,cz:Infinity,target:geometry,heights:new Float32Array(49*49)});
  }
  function updateRing(ring:Ring,x:number,z:number){
    const snap=16,cx=Math.round(x/snap)*snap,cz=Math.round(z/snap)*snap;if(cx===ring.cx&&cz===ring.cz)return;
    ring.cx=cx;ring.cz=cz;const p=ring.positions,c=ring.colors;
    // Shared grid samples avoid resampling the same eroded point for each
    // triangle corner (and its skirt), keeping ring rebuilds bounded.
    for(let gz=0;gz<49;gz++)for(let gx=0;gx<49;gx++)ring.heights[gz*49+gx]=height(cx+(gx-24)*ring.spacing,cz+(gz-24)*ring.spacing);
    for(let k=0;k<p.length;k+=9){
      let avg=0;for(let j=0;j<3;j++){const n=k/3+j,xx=cx+ring.local[n*3],zz=cz+ring.local[n*3+1],yy=ring.heights[Math.round(ring.local[n*3+1]/ring.spacing+24)*49+Math.round(ring.local[n*3]/ring.spacing+24)]+ring.local[n*3+2];p[k+j*3]=xx;p[k+j*3+1]=yy-.12;p[k+j*3+2]=zz;avg+=yy/3;}
      const ax=p[k+3]-p[k],ay=p[k+4]-p[k+1],az=p[k+5]-p[k+2],bx=p[k+6]-p[k],by=p[k+7]-p[k+1],bz=p[k+8]-p[k+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,slope=1-Math.abs(ny)/Math.max(.1,Math.hypot(nx,ny,nz));
      let zone=avg>600?4:avg>390?3:avg>260?1:0;if(slope>.24)zone=2;
      const color=terrainColors[zone], variation=.985+hash(Math.floor(p[k]/25),Math.floor(p[k+2]/25))*.03;
      for(let j=0;j<3;j++){c[k+j*3]=color.r*variation;c[k+j*3+1]=color.g*variation;c[k+j*3+2]=color.b*variation;}
    }
    ring.target.attributes.position.needsUpdate=true;ring.target.attributes.color.needsUpdate=true;ring.target.computeVertexNormals();
  }
  rings.forEach(r=>{updateRing(r,0,0);r.mesh.geometry=r.target.clone();});
  let clipX=0,clipZ=0,pendingX=0,pendingZ=0,pendingRing=-1;

  const dirt=materialFactory(env.dirtColor,'dirt'),edge=materialFactory(env.edgeColor,'rock'),worn=materialFactory(env.wornColor,'dirt');
  function ribbon(offset:number,width:number,mat:THREE.Material,y=.08) {
    const vertices:number[]=[],indices:number[]=[],across=Math.max(1,Math.ceil(width/1.2)),stride=across+1;
    // Sampling across the section is essential: an apron made only from its
    // raised outer endpoints becomes a ceiling over the trail and its riders.
    for(let i=0;i<=totalCount;i++)for(let j=0;j<=across;j++){
      const sm=sample(i*ds,offset-width/2+j/across*width);vertices.push(sm.position.x,sm.position.y+y,sm.position.z);
    }
    for(let i=0;i<totalCount;i++){
      const ss=(i+.5)*ds;if(trackDef.hasRavine&&ss>ravineLip+1&&ss<ravineLip+28)continue;
      for(let j=0;j<across;j++){const a=i*stride+j,b=a+stride;indices.push(a,a+1,b,a+1,b+1,b);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,mat);mesh.name='Hand-cut descent ribbon';group.add(mesh);return mesh;
  }
  ribbon(-6.15,4.7,edge,.02);ribbon(6.15,4.7,edge,.02);
  ribbon(0,8.3,edge,.05);ribbon(0,7.6,dirt,.10);ribbon(-1.1,.48,worn,.115);ribbon(1.1,.48,worn,.115);
  // Small trail edge chevrons supply near-field parallax without a noisy texture.
  const markerGeo=new THREE.BoxGeometry(.16,.12,1.6),markerMat=materialFactory(0xf7d592,'dirt');
  const markers=new THREE.InstancedMesh(markerGeo,markerMat,Math.floor(totalCount/7)*2);let markerIndex=0;
  const dummy=new THREE.Object3D();
  for(let i=0;i<totalCount;i+=7)for(const side of[-1,1]){if(markerIndex>=markers.count)continue;const p=sample(i*ds,side*4.05);dummy.position.copy(p.position);dummy.position.y+=.1;dummy.rotation.set(0,Math.atan2(-p.tangent.x,-p.tangent.z),0);dummy.scale.set(1,1,1);dummy.updateMatrix();markers.setMatrixAt(markerIndex++,dummy.matrix);}markers.count=markerIndex;group.add(markers);

  const trunkMat=materialFactory(env.trunkColor,'wood'),leafMat=materialFactory(env.leafColor,'foliage'),leafLight=materialFactory(env.leafLightColor,'foliage'),rockMat=materialFactory(env.rockColor,'rock');
  // Chunking keeps instance culling useful: a distant grove is one draw call,
  // and camera-near foliage scales in continuously at the visibility boundary.
  const scenery:Array<{mesh:THREE.InstancedMesh;items:Array<{position:THREE.Vector3;scale:THREE.Vector3;angle:number}>;distance:number}>=[];
  function instances(geo:THREE.BufferGeometry,mat:THREE.Material,items:Array<{position:THREE.Vector3;scale:THREE.Vector3;angle:number}>,distance:number){
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);for(let i=0;i<items.length;i++){dummy.position.copy(items[i].position);dummy.scale.copy(items[i].scale).multiplyScalar(1-smooth(distance*.82,distance,Math.hypot(items[i].position.x,items[i].position.z)));dummy.rotation.set(0,items[i].angle,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.computeBoundingSphere();group.add(mesh);scenery.push({mesh,items,distance});return mesh;
  }
  const trunkGeo=new THREE.CylinderGeometry(.11,.2,1,5);trunkGeo.translate(0,.5,0);
  const canopyGeo=new THREE.ConeGeometry(1,1,7);canopyGeo.translate(0,.5,0);
  const rockGeo=new THREE.IcosahedronGeometry(1,0);
  for(let chunk=0;chunk<12;chunk++){
    const trunks:Array<{position:THREE.Vector3;scale:THREE.Vector3;angle:number}>=[],leaves:typeof trunks=[],upper:typeof trunks=[],rocks:typeof trunks=[];
    let treeCount=0;
    for(let attempt=0;attempt<240&&treeCount<145;attempt++){
      const s=length*(chunk+random())/12,side=random()>.5?1:-1,lateral=side*(14+random()**1.3*120),p=sample(s,lateral).position;p.y=height(p.x,p.z);
      if(p.y>475&&random()>.4)continue;
      const h=7+random()*12,w=2.6+random()*3.5,angle=random()*6.28;
      // Absolute guarantee: no tree trunk or branch can ever clip into the track or apron
      const n=nearest(p.x,p.z);
      if(n.distance<13.5+w)continue;
      if(Math.abs(p.z-trackDef.riverZ)<16&&Math.abs(p.x)<480)continue;
      trunks.push({position:p.clone(),scale:new THREE.Vector3(1,h*.65,1),angle});
      leaves.push({position:p.clone().add(new THREE.Vector3(0,h*.25,0)),scale:new THREE.Vector3(w,h*.65,w),angle});
      upper.push({position:p.clone().add(new THREE.Vector3(0,h*.52,0)),scale:new THREE.Vector3(w*.72,h*.55,w*.72),angle:angle+.3});
      treeCount++;
    }
    let rockCount=0;
    for(let attempt=0;attempt<60&&rockCount<30;attempt++){
      const s=length*(chunk+random())/12,side=random()>.5?1:-1,p=sample(s,side*(8+random()*40)).position;p.y=height(p.x,p.z);
      const size=.6+random()*2.5;
      if(nearest(p.x,p.z).distance<8.5+size)continue;
      rocks.push({position:p,scale:new THREE.Vector3(size*1.4,size*.7,size),angle:random()*6.28});
      rockCount++;
    }
    instances(trunkGeo,trunkMat,trunks,650);instances(canopyGeo,leafMat,leaves,650);addOutline(instances(canopyGeo,leafLight,upper,650),.65);addOutline(instances(rockGeo,rockMat,rocks,430),.8);
  }
  const rawObstacles=Array.from({length:11},(_,i)=>({s:length*(.349+i*.0055),lateral:Math.sin(i*2.4)*2.6,radius:.38+(i%3)*.12}));
  const obstacles=rawObstacles.filter(o=>!jumpLips.some(lip=>o.s>=lip-17&&o.s<=lip+16));
  const obstacleItems=obstacles.map(o=>{const p=sample(o.s,o.lateral).position;p.y+=.15;return {position:p,scale:new THREE.Vector3(o.radius*1.1,o.radius*.7,o.radius),angle:o.s};});
  addOutline(instances(rockGeo,rockMat,obstacleItems,350),.85);
  // Grassy cut banks and clustered flowers. Blade triangles are geometry,
  // so every detail remains graphic and works without downloaded sprites.
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.3,0,0,0,1,0,.15,0,0,0,0,-.3,0,.8,.05,0,0,.3],3));grassGeo.computeVertexNormals();
  const grassMat=materialFactory(0x6e8a57,'foliage');grassMat.side=THREE.DoubleSide;
  for(let chunk=0;chunk<8;chunk++){
    const grass:Array<{position:THREE.Vector3;scale:THREE.Vector3;angle:number}>=[];
    for(let i=0;i<480;i++){const s=length*(chunk+random())/8,p=sample(s,(random()>.5?1:-1)*(6+random()*15)).position;p.y=height(p.x,p.z);if(nearest(p.x,p.z).distance<5.2)continue;const a=.6+random();grass.push({position:p,scale:new THREE.Vector3(a,a,a),angle:random()*6.28});}
    instances(grassGeo,grassMat,grass,200);
  }
  const flowerGeo=new THREE.IcosahedronGeometry(.22,0),flowerMat=materialFactory(env.flowerColor,'foliage');
  const flowers:Array<{position:THREE.Vector3;scale:THREE.Vector3;angle:number}>=[];
  for(let i=0;i<360;i++){const p=sample(length*(.22+random()*.78),(random()>.5?1:-1)*(6+random()*13)).position;p.y=height(p.x,p.z)+.4;if(nearest(p.x,p.z).distance<5.2)continue;flowers.push({position:p,scale:new THREE.Vector3(1,1,1),angle:0});}instances(flowerGeo,flowerMat,flowers,150);

  // Composed paper ridges, deliberately stepped in palette and silhouette.
  const ridgeColors=env.ridgeColors;
  for(let layer=3;layer>=0;layer--){
    const vertices:number[]=[],indices:number[]=[],depth=-2250-layer*680;
    for(let i=0;i<=36;i++){const x=-5500+i/36*11000,y=180+layer*45+noise(i*.37,layer+8)*490+Math.max(0,Math.sin(i*1.3+layer))*200;vertices.push(x,-350,depth,x,y,depth);}
    for(let i=0;i<36;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const mat=flatMaterial(ridgeColors[layer]);const mesh=new THREE.Mesh(geo,mat);mesh.name='Paper mountain horizon';group.add(mesh);
  }

  function labelTexture(text:string,sub:string){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#263f46';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#f5dc99';ctx.lineWidth=12;ctx.strokeRect(10,10,1004,236);ctx.fillStyle='#f9e5ac';ctx.textAlign='center';ctx.font='900 italic 116px sans-serif';ctx.fillText(text,512,145);ctx.font='600 33px sans-serif';ctx.fillText(sub,512,211);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;}
  const gateMat=materialFactory(0x263f46,'metal'),gateGold=materialFactory(0xf3cc77,'metal');
  function gate(s:number,text:string,sub:string,large=false){const sm=sample(s),g=new THREE.Group();g.position.copy(sm.position);if(text==='SUNBREAK')g.position.addScaledVector(sm.tangent,-17);g.rotation.y=Math.atan2(-sm.tangent.x,-sm.tangent.z);const h=large?7.3:5.3,w=large?12:10.6;
    for(const side of[-1,1]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.14,.22,h,6),gateMat);pole.position.set(side*w/2,h/2,0);g.add(pole);const cap=new THREE.Mesh(new THREE.ConeGeometry(.38,.8,5),gateGold);cap.position.set(side*w/2,h+.2,0);g.add(cap);}
    const panel=new THREE.Mesh(new THREE.BoxGeometry(w+.5,large?2:1.15,.16),gateMat);panel.position.y=h;g.add(panel);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(w,large?1.75:1.04),flatMaterial(0xffffff,labelTexture(text,sub)));face.position.set(0,h,.095);g.add(face);group.add(g);}
  gate(3,'SUNBREAK',`${trackDef.name} / ${Math.round(trackDef.elevationFn(0))} M`,true);gate(length-6,'FINISH','THE VALLEY IS YOURS',true);
  const checkpoints=[.2,.4,.6,.8].map(t=>t*length);checkpoints.forEach((s,i)=>gate(s,`0${i+1}`,sectionNames[Math.min(8,Math.floor((i+1)*1.8))]));
  // Take-off deck geometry and landing arrows make jump timing readable.
  jumpLips.forEach((s,index)=>{
    const p=sample(s-12),base=new THREE.Group();base.position.copy(p.position);base.rotation.y=Math.atan2(-p.tangent.x,-p.tangent.z);
    for(const side of[-1,1]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.1,.15,3.2,5),gateMat);post.position.set(side*5.6,1.6,0);base.add(post);const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.9,.8),flatMaterial(index?0xd86246:0xf4cb72));flag.position.set(side*4.8,2.8,0);base.add(flag);}group.add(base);
  });
  // Water is a solid cel tint with geometric glints, never a physical shader.
  const stream=new THREE.Mesh(new THREE.PlaneGeometry(950,19),materialFactory(env.riverColor,'water'));stream.rotation.x=-Math.PI/2;stream.position.set(0,10,trackDef.riverZ);group.add(stream);
  const waterGlints=new THREE.InstancedMesh(new THREE.PlaneGeometry(5,.3),flatMaterial(env.waterGlintColor),70);
  for(let i=0;i<70;i++){dummy.position.set((random()-.5)*750,10.12,trackDef.riverZ+(random()-.5)*15);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(.5+random()*2,1,1);dummy.updateMatrix();waterGlints.setMatrixAt(i,dummy.matrix);}group.add(waterGlints);

  let frame=0;
  return {group,length,totalLength,sample,height,checkpoints,obstacles,trackId:trackDef.id,trackName:trackDef.name,trackSubtitle:trackDef.subtitle,environment:env,jumpLips,update(camera,dt){
    void dt;frame++;const x=camera.position.x,z=camera.position.z;
    // One bounded patch and one vegetation batch per frame avoids jump-time spikes.
    if(pendingRing<0){const nx=Math.round(x/16)*16,nz=Math.round(z/16)*16;if(nx!==clipX||nz!==clipZ){pendingX=nx;pendingZ=nz;pendingRing=0;}}
    if(pendingRing>=0){updateRing(rings[pendingRing],pendingX,pendingZ);pendingRing++;
      if(pendingRing===rings.length){
        // Commit all concentric rings together so the moving clipmap cannot
        // expose a hole between rings while a new patch is being calculated.
        for(const ring of rings){const old=ring.mesh.geometry;ring.mesh.geometry=ring.target;ring.target=old;ring.positions=old.attributes.position.array as Float32Array;ring.colors=old.attributes.color.array as Float32Array;}
        clipX=pendingX;clipZ=pendingZ;pendingRing=-1;
      }
    }
    const batch=scenery[frame%scenery.length];if(batch){let changed=false;for(let i=0;i<batch.items.length;i++){const item=batch.items[i],distance=Math.hypot(item.position.x-x,item.position.z-z),scale=1-smooth(batch.distance*.82,batch.distance,distance);dummy.position.copy(item.position);dummy.rotation.set(0,item.angle,0);dummy.scale.copy(item.scale).multiplyScalar(scale);dummy.updateMatrix();batch.mesh.setMatrixAt(i,dummy.matrix);changed=true;}if(changed)batch.mesh.instanceMatrix.needsUpdate=true;}
  }};
}
