import * as T from 'three';
const noiseGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
float waveHeight(vec2 p,float t){return sin(dot(p,vec2(.8,.6))*2.3+t*.65)*.025+sin(dot(p,vec2(-.6,.8))*3.7-t*.52)*.017+sin(p.x*6.8+p.y*2.4+t*.85)*.008;}
float cells(vec2 p){vec2 i=floor(p),f=fract(p);float d1=4.,d2=4.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 k=vec2(float(x),float(y));vec2 o=vec2(hash(i+k),hash(i+k+8.7));o=.5+.42*sin(6.283*o+uTime*.35);float d=length(k+o-f);if(d<d1){d2=d1;d1=d;}else d2=min(d2,d);}return 1.-smoothstep(.012,.08,d2-d1);}
`;
export function createLagoon(scene,renderer,camera,{height=.25,shoreTexture=null}={}){
 const half=new T.WebGLRenderTarget(512,512,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter});half.depthTexture=new T.DepthTexture(512,512,T.UnsignedIntType);half.texture.colorSpace=T.LinearSRGBColorSpace;
 const reflection=new T.WebGLRenderTarget(384,384,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter});reflection.texture.colorSpace=T.LinearSRGBColorSpace;
 const reflectionCamera=camera.clone();
 const u={uTime:{value:0},uDusk:{value:0},uBoatMask:{value:new T.Vector4(0,0,0,0)},uColor:{value:half.texture},uDepth:{value:half.depthTexture},uReflection:{value:reflection.texture},uReflectionMatrix:{value:new T.Matrix4()},uInvProjection:{value:new T.Matrix4()},uCameraWorld:{value:new T.Matrix4()},uResolution:{value:new T.Vector2(512,512)},uWaterHeight:{value:height},uShore:{value:shoreTexture},uSun:{value:new T.Vector3(.3,.85,-.43).normalize()}};
 const vertex=`uniform float uTime;varying vec3 vWorld;${noiseGLSL.replace('uniform float uTime;','')}void main(){vec3 p=position;vec4 w=modelMatrix*vec4(p,1.);w.y+=waveHeight(w.xz,uTime)*.34;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
 const fragment=`uniform float uTime;uniform float uDusk;uniform float uWaterHeight;uniform vec4 uBoatMask;uniform sampler2D uColor;uniform sampler2D uDepth;uniform sampler2D uReflection;uniform sampler2D uShore;uniform mat4 uInvProjection;uniform mat4 uCameraWorld;uniform mat4 uReflectionMatrix;uniform vec2 uResolution;uniform vec3 uSun;varying vec3 vWorld;${noiseGLSL}
vec3 reconstruct(vec2 uv,float d){vec4 p=uInvProjection*vec4(uv*2.-1.,d*2.-1.,1.);p/=p.w;return (uCameraWorld*p).xyz;}
void main(){vec2 p=vWorld.xz;if(uBoatMask.z>0.){vec2 b=(p-uBoatMask.xy)/uBoatMask.zw;if(dot(b,b)<1.)discard;}vec2 uv=gl_FragCoord.xy/uResolution;float e=.04;float h=waveHeight(p,uTime);vec2 slope=vec2(waveHeight(p+vec2(e,0),uTime)-h,waveHeight(p+vec2(0,e),uTime)-h)/e;float micro=fbm(p*5.+uTime*.08);slope+=vec2(sin(p.x*11.+micro*7.+uTime),cos(p.y*12.+micro*8.-uTime))*.045;vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
float depthTex=texture2D(uDepth,uv).x;vec3 bottom=reconstruct(uv,depthTex);float depth=max(0.,uWaterHeight-bottom.y);vec2 refracted=clamp(uv+slope*.009*clamp(depth,0.,2.),.001,.999);vec3 sampleWorld=reconstruct(refracted,texture2D(uDepth,refracted).x);if(sampleWorld.y>uWaterHeight-.02)refracted=uv;
vec3 under=texture2D(uColor,refracted).rgb;vec3 extinction=vec3(1.9,.55,.24);vec3 transmission=exp(-extinction*depth);vec3 waterColor=mix(vec3(.002,.39,.71),vec3(.002,.19,.52),smoothstep(.8,4.,depth));waterColor=mix(waterColor,vec3(.035,.13,.27),uDusk*.8);vec3 col=under*vec3(.4,.84,1.03)*transmission+waterColor*(1.-transmission);float shallow=1.-smoothstep(.5,3.,depth);vec2 warp=vec2(noise(p*3.+uTime*.12),noise(p*3.2+17.-uTime*.15))*1.5;float caustics=0.;if(shallow>.01)caustics=cells(p*3.5+warp+vec2(h*2.));col+=caustics*.20*shallow*vec3(.42,.88,1.);
vec3 eye=normalize(cameraPosition-vWorld);float fresnel=.025+.975*pow(1.-max(dot(n,eye),0.),5.);vec4 rp=uReflectionMatrix*vec4(vWorld,1.);vec2 ruv=rp.xy/rp.w+slope*.012;vec3 reflected=texture2D(uReflection,clamp(ruv,.001,.999)).rgb;float cloud=smoothstep(.59,.74,fbm(p*.20+vec2(12.6,7.3)+uTime*.002))*smoothstep(4.5,10.,length(p));vec3 sky=mix(vec3(.12,.35,.62),vec3(.64,.79,.88),smoothstep(.35,.8,fbm(p*.12+vec2(uTime*.004))));sky+=cloud*vec3(1.4,1.45,1.5);sky=mix(sky,vec3(.9,.40,.32)+cloud*.8,uDusk);reflected=mix(sky,reflected,mix(.72,.25,uDusk));col=mix(col,reflected,clamp(fresnel+.055+uDusk*.12,0.,.5));
vec3 halfway=normalize(eye+uSun);float spec=pow(max(dot(n,halfway),0.),210.);float sparkle=pow(max(dot(n,halfway),0.),850.);col+=mix(vec3(1.,.94,.75),vec3(1.,.65,.32),uDusk)*(spec*.15+sparkle*.65);
// Signed distance is baked from the imported model's ground footprint, not a generic ellipse.
vec2 shoreUV=(p+vec2(8.))/16.;float sd=(texture2D(uShore,shoreUV).r-.5)*16.;float wavePhase=fract(uTime*.10);float bandCenter=.10+wavePhase*.85;float strip=exp(-pow((sd-bandCenter)/(.04+.08*wavePhase),2.))*(1.-wavePhase);float shoreBand=1.-smoothstep(.03,.38,abs(sd-.12));float foamCells=0.;if(shoreBand>.01)foamCells=cells(p*4.8+warp*.5+vec2(h*1.5));float foamPatches=smoothstep(.49,.68,noise(p*7.+warp)+noise(p*14.-uTime*.06)*.18);float foam=clamp((foamCells*.40+foamPatches*.55)*shoreBand+strip*(.2+.8*noise(p*8.)),0.,.95);foam*=smoothstep(-.06,.06,sd);col=mix(col,vec3(.91,1.,1.),foam);
float lum=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(lum),col,1.12);col*=mix(vec3(1.),vec3(1.12,.87,.93),uDusk*.7);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`;
 const surface=new T.Mesh(new T.PlaneGeometry(150,150,96,96),new T.ShaderMaterial({uniforms:u,vertexShader:vertex,fragmentShader:fragment}));surface.rotation.x=-Math.PI/2;surface.position.y=height;surface.renderOrder=8;scene.add(surface);
 // Seafloor rises gently toward the island, with sunlit sand and underwater stones.
 const groundGeo=new T.PlaneGeometry(160,160,80,80);groundGeo.rotateX(-Math.PI/2);const pos=groundGeo.attributes.position;for(let i=0;i<pos.count;i++){let x=pos.getX(i),z=pos.getZ(i),r=Math.hypot(x*.85,z*.7);pos.setY(i,-.85-Math.min(9,r*.14+Math.max(0.,r-4.)*.5)+Math.sin(x*.7)*Math.cos(z*.8)*.09);}groundGeo.computeVertexNormals();
 const seabed=new T.Mesh(groundGeo,new T.MeshStandardMaterial({color:'#e5d8ac',roughness:1}));seabed.receiveShadow=true;scene.add(seabed);
 const bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);let lastReflection=-1,lastShadow=-1;
 const previousView=new T.Matrix4(),previousProjection=new T.Matrix4();
 const stats={frames:0,updates:0,movingFrames:0,staleMovingFrames:0,intervals:[]};
 function resize(w,h,dpr){lastReflection=-1;u.uResolution.value.set(Math.floor(w*dpr),Math.floor(h*dpr));half.setSize(Math.max(1,Math.floor(w*dpr*.7)),Math.max(1,Math.floor(h*dpr*.7)));reflection.setSize(Math.max(1,Math.floor(w*dpr*.45)),Math.max(1,Math.floor(h*dpr*.45)));}
 function render(t){
  camera.updateMatrixWorld();u.uTime.value=t;surface.visible=false;
  const cameraMoved=!camera.matrixWorld.equals(previousView)||!camera.projectionMatrix.equals(previousProjection);
  previousView.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);stats.frames++;if(cameraMoved)stats.movingFrames++;
  const oldTone=renderer.toneMapping,oldTarget=renderer.getRenderTarget(),wall=performance.now()/1000;
  const above=[],below=[];scene.traverse(o=>{if(o.userData.waterPass==='above')above.push(o);if(o.userData.waterPass==='below')below.push(o)});
  const initial=lastShadow<0;
  renderer.toneMapping=T.NoToneMapping;u.uInvProjection.value.copy(camera.projectionMatrixInverse);u.uCameraWorld.value.copy(camera.matrixWorld);
  renderer.shadowMap.needsUpdate=initial;
  if(!initial)above.forEach(o=>o.visible=false);
  renderer.setRenderTarget(half);renderer.render(scene,camera);above.forEach(o=>o.visible=true);
  if(initial)lastShadow=wall;
  // Camera motion cannot reuse a projection from an earlier viewpoint.
  if(cameraMoved||wall-lastReflection>=.032||lastReflection<0){
    if(lastReflection>=0)stats.intervals.push((wall-lastReflection)*1000);if(stats.intervals.length>2000)stats.intervals.shift();stats.updates++;
    lastReflection=wall;reflectionCamera.copy(camera);const at=new T.Vector3(0,0,-1).applyMatrix4(camera.matrixWorld);reflectionCamera.position.y=2*height-camera.position.y;at.y=2*height-at.y;reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(at);reflectionCamera.updateMatrixWorld();u.uReflectionMatrix.value.copy(bias).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
    seabed.visible=false;below.forEach(o=>o.visible=false);renderer.clippingPlanes=[new T.Plane(new T.Vector3(0,1,0),-height)];renderer.setRenderTarget(reflection);renderer.render(scene,reflectionCamera);renderer.clippingPlanes=[];
  }
  else if(cameraMoved)stats.staleMovingFrames++;
  // Submerged props are already in refraction; drawing them again beneath opaque water is wasted work.
  seabed.visible=false;below.forEach(o=>o.visible=false);
  renderer.toneMapping=oldTone;renderer.setRenderTarget(oldTarget);surface.visible=true;
  renderer.shadowMap.needsUpdate=wall-lastShadow>.05;
  if(renderer.shadowMap.needsUpdate)lastShadow=wall;
  renderer.render(scene,camera);seabed.visible=true;below.forEach(o=>o.visible=true);
 }

 return {surface,seabed,uniforms:u,resize,render,invalidateReflection(){lastReflection=-1;},stats,resetStats(){stats.frames=stats.updates=stats.movingFrames=stats.staleMovingFrames=0;stats.intervals=[];},setDusk(v){u.uDusk.value=v;lastReflection=-1;},dispose(){surface.geometry.dispose();surface.material.dispose();seabed.geometry.dispose();seabed.material.dispose();half.dispose();reflection.dispose();scene.remove(surface,seabed);}};
}
