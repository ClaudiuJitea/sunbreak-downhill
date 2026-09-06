import * as THREE from 'three';
import {screenEffectsGLSL} from './screen-effects';

// All opaque artwork shares one MRT shader. Attachment 0 is inked cel colour;
// attachment 1 is view normal + linear depth for the interior-line compositor.
const sunlight = new THREE.Vector3(-0.55, 0.50, -0.68).normalize();
const globalUniforms = {
  uSun: { value: sunlight }, uViewport: { value: new THREE.Vector2(1600, 1000) },uPixelRatio:{value:1},
  uFog: { value: new THREE.Color('#a8c7b8') },uShadowMap:{value:null as THREE.Texture|null},uShadowMatrix:{value:new THREE.Matrix4()},uShadowEnabled:{value:0},uCloudShade:{value:1},
};
const vertex = /* glsl */`
  out vec3 vNormal;
  out vec3 vWorld;
  out vec3 vView;
  out vec3 vTint;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    vTint = vec3(1.0);
    #ifdef USE_COLOR
      vTint *= color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint *= instanceColor;
    #endif
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      mat3 im = mat3(instanceMatrix);
      n /= max(vec3(0.000001),vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2])));
      n = im * n;
    #endif
    vec4 wp = modelMatrix * p;
    vec4 vp = viewMatrix * wp;
    vNormal = normalize(normalMatrix * n);
    vWorld = wp.xyz;
    vView = vp.xyz;
    gl_Position = projectionMatrix * vp;
  }
`;
const fragment = /* glsl */`
  precision highp float;
  in vec3 vNormal;
  in vec3 vWorld;
  in vec3 vView;
  in vec3 vTint;
  uniform vec3 uColor, uSun, uFog;
  uniform sampler2D uRamp;
  uniform vec3 uThresholds;
  uniform float uRim, uSpec, uHatch, uMasked, uReflect, uCloudShade;
  uniform sampler2D uTrackMask;uniform vec4 uTrackRegion;
  uniform sampler2D uShadowMap;uniform mat4 uShadowMatrix;uniform float uShadowEnabled;
  layout(location=0) out vec4 outColor;
  layout(location=1) out vec4 outNormalDepth;
  void main() {
    if(uMasked>0.5 && texture(uTrackMask,(vWorld.xz-uTrackRegion.xy)/uTrackRegion.zw).r>.4)discard;
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 light = normalize((viewMatrix * vec4(uSun,0.0)).xyz);
    float l = dot(n,light) * 0.5 + 0.5;
    // One hard comparison retains cel-shaped cast shadows instead of PCF blur.
    vec4 shadowP=uShadowMatrix*vec4(vWorld,1.0);vec3 sc=shadowP.xyz/shadowP.w;
    if(uShadowEnabled>0.5 && all(greaterThan(sc,vec3(0.0))) && all(lessThan(sc,vec3(1.0)))){float stored=texture(uShadowMap,sc.xy).r;float shade=step(stored+0.002,sc.z);l=mix(l,min(l,0.44),shade);}
    l*=uCloudShade;
    float band = step(uThresholds.x,l) + step(uThresholds.y,l) + step(uThresholds.z,l);
    vec3 ramp = texture(uRamp, vec2((band+0.5)/4.0,0.5)).rgb;
    vec3 col = uColor * vTint * ramp;
    // Two-pixel ink hatching in the deepest two bands, anchored to the screen.
    float hatch = step(0.76, fract((gl_FragCoord.x + gl_FragCoord.y * 0.63)/7.0));
    col *= 1.0 - hatch * uHatch * (1.0-step(1.5,band));
    vec3 eye = normalize(-vView);
    float rim = pow(1.0-max(0.0,dot(n,eye)),3.0);
    col += vec3(1.0,0.78,0.37)*step(0.53,rim)*uRim*max(0.2,dot(n,light));
    // Crisp painted highlight shapes; never a PBR BRDF or environment probe.
    float spec = dot(n, normalize(light+eye));
    col += vec3(1.0,0.91,0.66)*step(0.965,spec)*uSpec;
    // A quantized sky/ground reflection remains visible when SSR has no hit.
    if(uReflect>0.0){
      vec3 reflected=reflect(-eye,n);
      vec3 worldRay=transpose(mat3(viewMatrix))*reflected;
      vec3 painted=mix(vec3(.20,.32,.26),vec3(.68,.85,.79),step(.05,worldRay.y));
      painted=mix(painted,vec3(1.0,.82,.42),step(.96,dot(worldRay,uSun)));
      col=mix(col,painted,uReflect*(.18+rim*.22));
    }
    float depth = max(0.0,-vView.z);
    float fog = floor(clamp((depth-120.0)/2350.0,0.0,0.88)*7.0)/7.0;
    col = mix(col,uFog,fog);
    outColor = vec4(col,1.0);
    outNormalDepth = vec4(n*0.5+0.5,depth/10000.0);
    if(uReflect>0.0)outNormalDepth.r=-outNormalDepth.r-1.0;
  }
`;
const ramps = new Map<string, THREE.DataTexture>();
function rampFor(kind:string) {
  if (ramps.has(kind)) return ramps.get(kind)!;
  const cool = kind === 'metal' || kind === 'rock' || kind === 'terrain';
  const shades = cool ? [0.34,0.44,0.48, 0.60,0.69,0.69, 0.84,0.89,0.81, 1.0,0.98,0.85]
    : [0.36,0.40,0.42, 0.65,0.67,0.58, 0.88,0.89,0.74, 1.0,0.99,0.86];
  const data = new Uint8Array(16);
  for(let i=0;i<4;i++){for(let j=0;j<3;j++)data[i*4+j]=Math.round(shades[i*3+j]*255);data[i*4+3]=255;}
  const t=new THREE.DataTexture(data,4,1,THREE.RGBAFormat);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;ramps.set(kind,t);return t;
}
export function createMaterial(color:number,kind='dirt'):THREE.ShaderMaterial {
  const shiny = kind==='metal'||kind==='helmet';
  const rider = shiny || kind==='skin'||kind==='cloth'||kind==='rider';
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader:vertex, fragmentShader:fragment,
    vertexColors: kind==='terrain',
    uniforms:{...globalUniforms,uColor:{value:new THREE.Color(color)},uRamp:{value:rampFor(kind)},
      uThresholds:{value:new THREE.Vector3(kind==='foliage'?0.28:0.32,0.56,kind==='rock'?0.78:0.76)},
      uTrackMask:{value:null},uMasked:{value:0},uTrackRegion:{value:new THREE.Vector4(-1600,-2400,3200,3200)},uReflect:{value:shiny?.65:kind==='water'?.5:0},uRim:{value:rider?0.16:0.025},uSpec:{value:shiny?0.30:0},uHatch:{value:kind==='skin'?0.025:kind==='terrain'?0.045:0.065}},
    side:kind==='foliage'||kind==='grass'?THREE.DoubleSide:THREE.FrontSide,
  });
}
const hullVertex=/* glsl */`
  attribute vec3 outlineNormal;
  uniform vec2 uViewport;uniform float uPixelRatio;
  uniform float uWidth;
  out vec3 vNormal;
  out float vDepth;
  void main(){
    vec4 p=vec4(position,1.0);
    vec3 n=outlineNormal;
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      n=mat3(instanceMatrix)*n;
    #endif
    vec4 viewP=modelViewMatrix*p;
    vec3 viewN=normalize(normalMatrix*n);
    vec4 clip=projectionMatrix*viewP;
    // Silhouette taper and normal curvature proxy prevent uniform marker-like strokes.
    float taper=mix(0.60,1.0,1.0-abs(viewN.z));
    float distant=mix(1.0,0.58,smoothstep(50.0,350.0,-viewP.z));
    clip.xy+=normalize(viewN.xy+vec2(0.0001))*uWidth*uPixelRatio*taper*distant*2.0/uViewport*clip.w;
    gl_Position=clip;
    vNormal=viewN;vDepth=-viewP.z;
  }
`;
const hullFragment=/* glsl */`
  precision highp float;
  in vec3 vNormal;in float vDepth;
  uniform vec3 uFog;
  layout(location=0) out vec4 outColor;
  layout(location=1) out vec4 outNormalDepth;
  void main(){
    float haze=floor(clamp((vDepth-120.0)/2350.0,0.0,0.88)*7.0)/7.0;
    outColor=vec4(mix(vec3(0.045,0.080,0.087),uFog,haze),1.0);
    outNormalDepth=vec4(normalize(vNormal)*0.5+0.5,vDepth/10000.0);
  }
`;
/** Weld normals only for the hull: hard-edged cel facets remain on the actual mesh. */
export function addOutline(mesh:THREE.Mesh,width=1.25):THREE.Mesh {
  const geometry=mesh.geometry;
  if(!geometry.hasAttribute('outlineNormal')){
    const pos=geometry.getAttribute('position'),norm=geometry.getAttribute('normal');
    const sums=new Map<string,THREE.Vector3>();const keys:string[]=[];
    for(let i=0;i<pos.count;i++){
      const key=`${Math.round(pos.getX(i)*10000)},${Math.round(pos.getY(i)*10000)},${Math.round(pos.getZ(i)*10000)}`;
      keys.push(key);const n=sums.get(key)||new THREE.Vector3();
      n.x+=norm.getX(i);n.y+=norm.getY(i);n.z+=norm.getZ(i);sums.set(key,n);
    }
    const ns=new Float32Array(pos.count*3);
    keys.forEach((key,i)=>{const n=sums.get(key)!.normalize();ns.set([n.x,n.y,n.z],i*3);});
    geometry.setAttribute('outlineNormal',new THREE.BufferAttribute(ns,3));
  }
  const mat=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:hullVertex,fragmentShader:hullFragment,
    uniforms:{...globalUniforms,uWidth:{value:width}},side:THREE.BackSide,depthWrite:true});
  let hull:THREE.Mesh;
  if(mesh instanceof THREE.InstancedMesh){const h=new THREE.InstancedMesh(geometry,mat,mesh.count);h.instanceMatrix=mesh.instanceMatrix;hull=h;}
  else hull=new THREE.Mesh(geometry,mat);
  hull.name='ink hull';hull.renderOrder=-1;hull.frustumCulled=mesh.frustumCulled;mesh.add(hull);return hull;
}

const postVertex=/* glsl */`out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const postFragment=/* glsl */`
precision highp float;
in vec2 vUv;
uniform sampler2D uScene,uGeometry,uLut;
uniform vec2 uResolution;
uniform mat4 uInverseProjection,uCameraWorld;
uniform float uTime,uSpeed,uBoost,uImpact;
uniform vec3 uSun;
uniform vec3 uSkyHorizon, uSkyZenith;
layout(location=0) out vec4 outColor;
float hash(float p){return fract(sin(p*127.1)*43758.5453);}
vec3 sky(vec2 uv){
  vec4 viewRay=uInverseProjection*vec4(uv*2.0-1.0,1.0,1.0);
  vec3 ray=normalize(mat3(uCameraWorld)*viewRay.xyz);
  float h=clamp(ray.y*1.45+0.12,0.0,1.0);
  vec3 col=mix(uSkyHorizon,uSkyZenith,smoothstep(0.0,0.8,h));
  vec3 sun=uSun;
  float sd=dot(ray,sun);
  col=mix(col,vec3(1.0,0.93,0.66),step(0.9975,sd));
  col+=vec3(0.10,0.07,0.02)*step(0.979,sd);
  // Two separately drifting, flat-edged cloud decks. All contours are analytical.
  if(ray.y>0.015){
    for(int layer=0;layer<2;layer++){
      float l=float(layer);
      vec2 p=ray.xz/(ray.y+0.18)*(1.4+l*0.7)+vec2(uTime*(0.004+l*0.002),l*13.4);
      vec2 cell=floor(p/3.8),q=mod(p,3.8)-1.9;
      float seed=hash(dot(cell,vec2(12.7,81.4))+l*19.0);
      float form=length(q/vec2(1.0+seed,0.21+seed*0.17));
      form=min(form,length((q-vec2(-0.4,0.13))/vec2(0.60,0.27)));
      form=min(form,length((q-vec2(0.38,0.17))/vec2(0.72,0.33)));
      float cloud=step(form,1.0)*step(0.34,seed)*smoothstep(0.018,0.08,ray.y);
      col=mix(col,mix(vec3(0.88,0.84,0.69),vec3(1.0,0.94,0.78),step(0.0,q.y)),cloud*(0.85-l*0.12));
    }
  }
  return col;
}
${screenEffectsGLSL}
vec3 graded(vec3 c){
  c=clamp(c,0.0,1.0);float slice=c.b*15.0;float low=floor(slice);
  vec2 a=vec2((low*16.0+c.r*15.0+0.5)/256.0,(c.g*15.0+0.5)/16.0);
  vec2 b=a+vec2(16.0/256.0,0.0);
  return mix(texture(uLut,a).rgb,texture(uLut,b).rgb,fract(slice));
}
void main(){
  vec2 px=1.0/uResolution;
  vec4 base=texture(uScene,vUv);
  vec4 rawGeometry=texture(uGeometry,vUv);
  vec4 g=geometryAt(vUv);
  vec3 col=base.a<0.5?sky(vUv):base.rgb;
  if(base.a>0.5){
    // Sobel derivatives of normals reveal crease lines. Depth discontinuities are
    // deliberately suppressed here; the inverted hull already owns silhouettes.
    vec3 gx=vec3(0.0),gy=vec3(0.0);float valid=1.0;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec4 ng=geometryAt(vUv+vec2(float(x),float(y))*px);
      float w=1.0+float(x==0||y==0);
      gx+=ng.rgb*float(x)*w;gy+=ng.rgb*float(y)*w;
      valid*=1.0-step(max(0.00025,g.a*0.045),abs(ng.a-g.a));
    }
    float crease=smoothstep(1.0,2.1,length(gx)+length(gy))*valid;
    col=mix(col,col*vec3(0.48,0.55,0.55),crease*0.48);
    // Graphic, hard-threshold highlight expansion: no photographic glow blur.
    vec3 bright=vec3(0.0);
    for(int i=0;i<4;i++){
      float a=float(i)*1.5707963;
      vec3 c=texture(uScene,vUv+vec2(cos(a),sin(a))*px*(2.0+uEffects*4.0)).rgb;
      bright+=c*step(0.78,max(c.r,max(c.g,c.b)));
    }
    col+=bright*(0.0175+uEffects*.018);
  }
  col=reflectedScene(col,vUv,rawGeometry);
  col=lensAndFocus(col,vUv,g);
  col=speedStrokes(col,vUv);
  col=rainOnLens(col,vUv);
  vec2 centered=(vUv-vec2(.5,.49))*vec2(uResolution.x/uResolution.y,1.0);
  float radius=length(centered);
  float vignette=smoothstep(0.30,1.05,radius);
  col*=1.0-vignette*0.105;
  col=graded(col);
  if(uImpact>0.0){float tone=step(0.43,dot(col,vec3(0.2126,0.7152,0.0722)));col=mix(col,mix(vec3(0.025,0.10,0.12),vec3(1.0,0.94,0.76),tone),uImpact*0.8);}
  // ShaderMaterial colour is linear. Explicit conversion gives a consistent
  // final display transfer independent of renderer output configuration.
  col=mix(col*12.92,1.055*pow(max(col,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),col));
  outColor=vec4(col,1.0);
}
`;
function makeLut(){
  const data=new Uint8Array(256*16*4);
  for(let b=0;b<16;b++)for(let g=0;g<16;g++)for(let r=0;r<16;r++){
    const i=(g*256+b*16+r)*4;
    const rgb=[r/15,g/15,b/15];const l=rgb[0]*0.213+rgb[1]*0.715+rgb[2]*0.072;
    const shadow=1-l;
    data[i]=Math.round(THREE.MathUtils.clamp(rgb[0]*1.025+0.006*shadow,0,1)*255);
    data[i+1]=Math.round(THREE.MathUtils.clamp(rgb[1]*1.005+0.010*shadow,0,1)*255);
    data[i+2]=Math.round(THREE.MathUtils.clamp(rgb[2]*0.94+0.013*shadow,0,1)*255);data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,256,16,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
export class NPRPipeline {
  private target:THREE.WebGLRenderTarget;
  private postScene=new THREE.Scene();
  private postCamera=new THREE.Camera();
  private post:THREE.ShaderMaterial;
  private time=0;
  private sunScreen=new THREE.Vector3();
  private forward=new THREE.Vector3();
  private hiddenForShadow:THREE.Object3D[]=[];
  readonly effects={enabled:true,rain:0,wetness:0,focusDistance:10,focusX:.5,focusY:.4,cinematic:0};
  private shadowTarget=new THREE.WebGLRenderTarget(1024,1024,{depthBuffer:true});
  private shadowCamera=new THREE.OrthographicCamera(-46,46,46,-46,.1,320);
  private shadowMaterial=new THREE.MeshDepthMaterial();
  private shadowCenter=new THREE.Vector3();
  private shadowBias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private camera:THREE.PerspectiveCamera){
    this.shadowTarget.depthTexture=new THREE.DepthTexture(1024,1024,THREE.UnsignedIntType);
    globalUniforms.uShadowMap.value=this.shadowTarget.depthTexture;
    this.target=new THREE.WebGLRenderTarget(1,1,{count:2,type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
    this.target.textures[0].name='Cel colour';this.target.textures[1].name='Normal + linear depth';
    this.post=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:postVertex,fragmentShader:postFragment,depthTest:false,depthWrite:false,
      uniforms:{uScene:{value:this.target.textures[0]},uGeometry:{value:this.target.textures[1]},uLut:{value:makeLut()},uResolution:globalUniforms.uViewport,
        uSun:globalUniforms.uSun,uSkyHorizon:{value:new THREE.Color('#e8cf97')},uSkyZenith:{value:new THREE.Color('#4e9fb0')},uEffects:{value:1},uRain:{value:0},uWetness:{value:0},uFocusDistance:{value:10},uFocusUv:{value:new THREE.Vector2(.5,.4)},uCinematic:{value:0},uSunScreen:{value:new THREE.Vector3()},uProjection:{value:camera.projectionMatrix},uInverseProjection:{value:camera.projectionMatrixInverse},uCameraWorld:{value:camera.matrixWorld},uTime:{value:0},uSpeed:{value:0},uBoost:{value:0},uImpact:{value:0}}});
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.post);quad.frustumCulled=false;this.postScene.add(quad);
    this.renderer.setClearColor(0x000000,0);this.scene.background=null;
  }
  setEnvironment(env?: { skyHorizon: string; skyZenith: string; fogColor: string }): void {
    if (!env) return;
    globalUniforms.uFog.value.set(env.fogColor);
    this.post.uniforms.uSkyHorizon.value.set(env.skyHorizon);
    this.post.uniforms.uSkyZenith.value.set(env.skyZenith);
  }
  resize(w:number,h:number,dpr:number){
    const width=Math.max(1,Math.round(w*dpr)),height=Math.max(1,Math.round(h*dpr));
    globalUniforms.uPixelRatio.value=dpr;this.target.setSize(width,height);globalUniforms.uViewport.value.set(width,height);
  }
  render(dt:number,speed:number,boost:number,impact:number){
    this.time+=dt;const u=this.post.uniforms;u.uTime.value=this.time;u.uSpeed.value=speed;u.uBoost.value=boost;u.uImpact.value=impact;
    const fx=this.effects;u.uEffects.value=fx.enabled?1:0;u.uRain.value=fx.rain;u.uWetness.value=fx.wetness;
    u.uFocusDistance.value=fx.focusDistance;u.uFocusUv.value.set(fx.focusX,fx.focusY);u.uCinematic.value=fx.cinematic;
    sunlight.set(-.55+Math.sin(this.time*.004)*.08,.50,-.68+Math.sin(this.time*.003)*.06).normalize();
    globalUniforms.uCloudShade.value=1-fx.rain*.15-(Math.sin(this.time*.11)*.5+.5)*fx.rain*.08;
    this.sunScreen.copy(this.camera.position).addScaledVector(sunlight,5000).project(this.camera);
    this.camera.getWorldDirection(this.forward);
    const sunX=this.sunScreen.x*.5+.5,sunY=this.sunScreen.y*.5+.5;
    u.uSunScreen.value.set(sunX,sunY,this.forward.dot(sunlight)>0&&sunX>0&&sunX<1&&sunY>0&&sunY<1?1:0);
    this.camera.getWorldDirection(this.shadowCenter);this.shadowCenter.multiplyScalar(16).add(this.camera.position);
    this.shadowCamera.position.copy(this.shadowCenter).addScaledVector(sunlight,130);this.shadowCamera.lookAt(this.shadowCenter);this.shadowCamera.updateMatrixWorld();
    globalUniforms.uShadowMatrix.value.copy(this.shadowBias).multiply(this.shadowCamera.projectionMatrix).multiply(this.shadowCamera.matrixWorldInverse);
    const transparent=this.hiddenForShadow;transparent.length=0;this.scene.traverse(o=>{if(o instanceof THREE.Mesh && !Array.isArray(o.material)&&o.material.transparent&&o.visible){transparent.push(o);o.visible=false;}});
    this.scene.overrideMaterial=this.shadowMaterial;this.renderer.setRenderTarget(this.shadowTarget);this.renderer.clear();this.renderer.render(this.scene,this.shadowCamera);this.scene.overrideMaterial=null;for(const o of transparent)o.visible=true;globalUniforms.uShadowEnabled.value=1;
    this.renderer.setRenderTarget(this.target);this.renderer.clear();this.renderer.render(this.scene,this.camera);
    this.renderer.setRenderTarget(null);this.renderer.render(this.postScene,this.postCamera);
  }
  dispose(){this.target.dispose();this.shadowTarget.dispose();this.shadowMaterial.dispose();this.post.dispose();}
}
