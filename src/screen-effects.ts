/** Extra compositing stays in the existing fullscreen pass. Nearby silhouettes
 * are protected by depth rejection and a focus ellipse around the actual rider. */
export const screenEffectsGLSL = /* glsl */`
uniform float uEffects,uWetness,uRain,uFocusDistance,uCinematic;
uniform vec2 uFocusUv;
uniform vec3 uSunScreen;
uniform mat4 uProjection;

vec4 geometryAt(vec2 uv){
  vec4 g=texture(uGeometry,clamp(uv,vec2(0.001),vec2(0.999)));
  // Negative red stores a reflective-material flag without another attachment.
  if(g.r<0.0)g.r=-g.r-1.0;
  return g;
}
vec3 sceneAt(vec2 uv){
  uv=clamp(uv,vec2(0.001),vec2(0.999));
  vec4 c=texture(uScene,uv);return c.a<0.5?sky(uv):c.rgb;
}
float outsideRider(vec2 uv){
  vec2 p=(uv-uFocusUv)*vec2(uResolution.x/uResolution.y,1.0);
  return smoothstep(0.10,0.25,length(p*vec2(1.0,0.82)));
}

vec3 reflectedScene(vec3 col,vec2 uv,vec4 raw){
  if(raw.r>=0.0||uEffects<0.5)return col;
  vec4 g=geometryAt(uv);
  vec3 normal=normalize(g.rgb*2.0-1.0);
  vec4 ray=uInverseProjection*vec4(uv*2.0-1.0,1.0,1.0);
  vec3 origin=ray.xyz*(g.a*10000.0/max(0.001,-ray.z));
  vec3 direction=reflect(normalize(origin),normal);
  // Short, bounded SSR ray march: visible track and riders can reflect; there
  // is no cubemap/PBR pass. Painted environment bands remain the fallback.
  for(int i=0;i<8;i++){
    float travel=0.18+float(i*i)*0.24;
    vec3 p=origin+normal*.09+direction*travel;
    vec4 projected=uProjection*vec4(p,1.0);
    if(projected.w<=0.0)break;
    vec2 q=projected.xy/projected.w*.5+.5;
    if(any(lessThan(q,vec2(.01)))||any(greaterThan(q,vec2(.99))))break;
    float depth=geometryAt(q).a*10000.0;
    float delta=-p.z-depth;
    if(depth>0.0&&delta>0.015&&delta<.55+travel*.07&&distance(q,uv)>.004){
      vec3 reflection=sceneAt(q);
      reflection=floor(reflection*5.0+0.5)/5.0;
      float border=smoothstep(0.0,.10,min(min(q.x,q.y),min(1.0-q.x,1.0-q.y)));
      return mix(col,reflection,0.22*border);
    }
  }
  return col;
}

vec3 lensAndFocus(vec3 col,vec2 uv,vec4 g){
  if(uEffects<.5)return col;
  float protect=outsideRider(uv),depth=g.a*10000.0;
  float speed=smoothstep(14.0,35.0,uSpeed);
  vec2 flow=uv-(uFocusUv+vec2(0.0,.10));
  float smear=(speed*.021+uBoost*.025)*protect;
  // Four samples only; depth rejection prevents a blurred tree or rider from
  // bleeding across a distant mountain. The HUD is drawn after this pass.
  if(g.a>0.0&&smear>.001){
    vec3 sum=col;float weights=1.0;
    for(int i=1;i<=4;i++){
      vec2 q=uv-flow*smear*float(i)*.25;
      float other=geometryAt(q).a*10000.0;
      float valid=step(depth*.72,other);
      sum+=sceneAt(q)*valid;weights+=valid;
    }
    col=mix(col,sum/weights,min(.8,speed*.58+uBoost*.25)*protect);
  }
  // Small depth-of-field radius: distant scenery softens, while the racing
  // line and the complete bike remain sharp. Replays use a stronger radius.
  float farBlur=smoothstep(uFocusDistance+28.0,uFocusDistance+180.0,depth);
  float radius=farBlur*protect*(1.15+uCinematic*1.7)*uResolution.y/900.0;
  if(radius>.25){
    vec3 sum=col;float weights=1.0;
    for(int i=0;i<4;i++){
      float angle=float(i)*1.5707963+.35;
      vec2 q=uv+vec2(cos(angle),sin(angle))*radius/uResolution;
      float valid=step(depth*.75,geometryAt(q).a*10000.0);
      sum+=sceneAt(q)*valid;weights+=valid;
    }
    col=mix(col,sum/weights,.5+uCinematic*.18);
  }
  // Flare is tied to the projected sun, with five depth probes so opaque
  // terrain and trees suppress it instead of glowing through the hillside.
  if(uSunScreen.z>0.5){
    float visibility=0.0;
    for(int i=0;i<5;i++){
      float a=float(i)*1.256637;
      visibility+=1.0-step(.000001,geometryAt(uSunScreen.xy+vec2(cos(a),sin(a))*.008).a);
    }
    visibility*=.2;
    vec2 aspect=vec2(uResolution.x/uResolution.y,1.0),p=(uv-uSunScreen.xy)*aspect;
    float halo=exp(-length(p)*22.0)*.19;
    float streak=exp(-abs(p.y)*420.0)*exp(-abs(p.x)*5.0)*.13;
    vec3 flare=vec3(1.0,.73,.30)*(halo+streak);
    for(int i=0;i<3;i++){
      float f=float(i);vec2 center=mix(uSunScreen.xy,vec2(.5),1.15+f*.45);
      vec2 q=(uv-center)*aspect;float a=atan(q.y,q.x);
      float hex=length(q)*cos(mod(a+3.14159/6.0,3.14159/3.0)-3.14159/6.0);
      float r=.018+f*.011;
      float ring=(1.0-smoothstep(r,r+.002,hex))*smoothstep(r*.72,r*.82,hex);
      flare+=mix(vec3(.44,.72,.65),vec3(1.0,.63,.28),f*.5)*ring*.038;
    }
    col+=flare*visibility;
  }
  return col;
}

vec3 speedStrokes(vec3 col,vec2 uv){
  vec2 p=(uv-(uFocusUv+vec2(0,.10)))*vec2(uResolution.x/uResolution.y,1.0);
  float angle=atan(p.y,p.x),radius=length(p),sector=floor(angle*35.0),seed=hash(sector);
  float speed=smoothstep(15.0,35.0,uSpeed),power=(speed+uBoost*.85)*uEffects;
  float line=step(.91+seed*.055,fract(angle*35.0));
  line*=step(.43,seed)*smoothstep(.24+seed*.25,.85,radius);
  line*=step(.28,fract(radius*.8-uTime*(.6+power)+seed*4.0));
  col=mix(col,vec3(1.0,.94,.73),min(.58,line*power*.40));
  return col;
}

vec3 rainOnLens(vec3 col,vec2 uv){
  if(uEffects<.5)return col;
  if(uRain>.01){
    vec2 rainUv=uv*vec2(65.0,22.0)+vec2(uTime*1.4,uTime*19.0);
    vec2 cell=floor(rainUv),q=fract(rainUv);
    float seed=hash(dot(cell,vec2(7.1,31.3)));
    float streak=(1.0-smoothstep(.013,.036,abs(q.x-.5)))*step(.68,seed)*smoothstep(0.0,.7,q.y);
    col=mix(col,vec3(.76,.89,.91),streak*uRain*.24);
  }
  if(uWetness>.015){
    vec2 grid=uv*vec2(11.0,7.0),cell=floor(grid),q=fract(grid);
    float seed=hash(dot(cell,vec2(31.7,9.2)));
    vec2 center=vec2(.22+hash(seed*19.0)*.56,1.15-fract(seed+uTime*(.025+seed*.018))*1.3);
    vec2 p=(q-center)*vec2(1.0,.78);float radius=.07+seed*.12;
    float r=length(p),drop=(1.0-smoothstep(radius*.90,radius,r));
    drop*=step(seed,clamp(uWetness*.74,0.0,.9))*outsideRider(uv);
    if(drop>.001){
      vec3 refracted=sceneAt(uv+p*.022);
      col=mix(col,refracted*.95,drop*.66);
      float rim=smoothstep(radius*.63,radius*.80,r)*(1.0-smoothstep(radius*.88,radius,r));
      col+=vec3(.73,.91,.92)*rim*drop*.23;
      float glint=1.0-smoothstep(.009,.024,length(p-vec2(-radius*.35,radius*.48)));
      col+=vec3(.93,1.0,.93)*glint*drop*.38;
    }
  }
  return col;
}
`;
