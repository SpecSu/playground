// Adapted from SpecSu/playground artdesign e94279c; see art-source/lagoon-reference/SOURCE.md.
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
 // Shade complex water below full screen resolution, then composite at the original scene resolution.
 // Land, avatars, plants, glass and HUD remain full resolution. All water inputs are from this same camera frame.
 const waterColorTarget=new T.WebGLRenderTarget(384,384,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});waterColorTarget.texture.colorSpace=T.LinearSRGBColorSpace;const waterScene=new T.Scene();waterScene.background=new T.Color('#8bdad8');
 const compositeUniforms={uWaterColor:{value:waterColorTarget.texture},uScreenResolution:{value:new T.Vector2(512,512)}};
 const u={uTime:{value:0},uDusk:{value:0},uBoatMask:{value:new T.Vector4(0,0,0,0)},uColor:{value:half.texture},uDepth:{value:half.depthTexture},uReflection:{value:reflection.texture},uReflectionMatrix:{value:new T.Matrix4()},uInvProjection:{value:new T.Matrix4()},uCameraWorld:{value:new T.Matrix4()},uResolution:{value:new T.Vector2(512,512)},uWaterHeight:{value:height},uShore:{value:shoreTexture},uShoreBounds:{value:new T.Vector4(-8,-8,16,16)},uShoreScale:{value:16},uSun:{value:new T.Vector3(.3,.85,-.43).normalize()}};
 const vertex=`uniform float uTime;varying vec3 vWorld;${noiseGLSL.replace('uniform float uTime;','')}void main(){vec3 p=position;vec4 w=modelMatrix*vec4(p,1.);w.y+=waveHeight(w.xz,uTime)*.34;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
 const fragment=`uniform float uTime;uniform float uDusk;uniform float uWaterHeight;uniform vec4 uBoatMask;uniform sampler2D uColor;uniform sampler2D uDepth;uniform sampler2D uReflection;uniform sampler2D uShore;uniform vec4 uShoreBounds;uniform float uShoreScale;uniform mat4 uInvProjection;uniform mat4 uCameraWorld;uniform mat4 uReflectionMatrix;uniform vec2 uResolution;uniform vec3 uSun;varying vec3 vWorld;${noiseGLSL}
vec3 reconstruct(vec2 uv,float d){vec4 p=uInvProjection*vec4(uv*2.-1.,d*2.-1.,1.);p/=p.w;return (uCameraWorld*p).xyz;}
void main(){vec2 p=vWorld.xz;if(uBoatMask.z>0.){vec2 b=(p-uBoatMask.xy)/uBoatMask.zw;if(dot(b,b)<1.)discard;}vec2 uv=gl_FragCoord.xy/uResolution;float e=.04;float h=waveHeight(p,uTime);vec2 slope=vec2(waveHeight(p+vec2(e,0),uTime)-h,waveHeight(p+vec2(0,e),uTime)-h)/e;float micro=fbm(p*5.+uTime*.08);slope+=vec2(sin(p.x*11.+micro*7.+uTime),cos(p.y*12.+micro*8.-uTime))*.045;vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
float depthTex=texture2D(uDepth,uv).x;vec3 bottom=reconstruct(uv,depthTex);float depth=max(0.,uWaterHeight-bottom.y);vec2 refracted=clamp(uv+slope*.009*clamp(depth,0.,2.),.001,.999);vec3 sampleWorld=reconstruct(refracted,texture2D(uDepth,refracted).x);if(sampleWorld.y>uWaterHeight-.02)refracted=uv;
vec3 under=texture2D(uColor,refracted).rgb;vec3 extinction=vec3(.85,.32,.20);vec3 transmission=exp(-extinction*depth);vec3 waterColor=mix(vec3(.12,.65,.62),vec3(.07,.48,.56),smoothstep(.8,4.,depth));waterColor=mix(waterColor,vec3(.035,.13,.27),uDusk*.8);vec3 col=under*vec3(.78,.97,1.)*transmission+waterColor*(1.-transmission);float shallow=1.-smoothstep(.5,3.,depth);vec2 warp=vec2(noise(p*3.+uTime*.12),noise(p*3.2+17.-uTime*.15))*1.5;float caustics=0.;if(shallow>.01)caustics=cells(p*3.5+warp+vec2(h*2.));col+=caustics*.20*shallow*vec3(.42,.88,1.);
vec3 eye=normalize(cameraPosition-vWorld);float fresnel=.025+.975*pow(1.-max(dot(n,eye),0.),5.);vec4 rp=uReflectionMatrix*vec4(vWorld,1.);vec2 ruv=rp.xy/rp.w+slope*.012;vec3 reflected=texture2D(uReflection,clamp(ruv,.001,.999)).rgb;float cloud=smoothstep(.59,.74,fbm(p*.20+vec2(12.6,7.3)+uTime*.002))*smoothstep(4.5,10.,length(p));vec3 sky=mix(vec3(.24,.55,.63),vec3(.76,.88,.90),smoothstep(.35,.8,fbm(p*.12+vec2(uTime*.004))));sky+=cloud*vec3(1.4,1.45,1.5);sky=mix(sky,vec3(.9,.40,.32)+cloud*.8,uDusk);reflected=mix(sky,reflected,mix(.72,.25,uDusk));col=mix(col,reflected,clamp(fresnel+.055+uDusk*.12,0.,.5));
vec3 halfway=normalize(eye+uSun);float spec=pow(max(dot(n,halfway),0.),210.);float sparkle=pow(max(dot(n,halfway),0.),850.);col+=mix(vec3(1.,.94,.75),vec3(1.,.65,.32),uDusk)*(spec*.15+sparkle*.65);
// Signed distance is baked from the imported model's ground footprint, not a generic ellipse.
vec2 shoreUV=(p-uShoreBounds.xy)/uShoreBounds.zw;float sd=(texture2D(uShore,clamp(shoreUV,0.,1.)).r-.5)*uShoreScale;if(any(lessThan(shoreUV,vec2(0.)))||any(greaterThan(shoreUV,vec2(1.))))sd=20.;float wavePhase=fract(uTime*.10);float bandCenter=.10+wavePhase*.85;float strip=exp(-pow((sd-bandCenter)/(.04+.08*wavePhase),2.))*(1.-wavePhase);float shoreBand=1.-smoothstep(.03,.38,abs(sd-.12));float foamCells=0.;if(shoreBand>.01)foamCells=cells(p*4.8+warp*.5+vec2(h*1.5));float foamPatches=smoothstep(.49,.68,noise(p*7.+warp)+noise(p*14.-uTime*.06)*.18);float foam=clamp((foamCells*.40+foamPatches*.55)*shoreBand+strip*(.2+.8*noise(p*8.)),0.,.95);foam*=smoothstep(-.06,.06,sd);col=mix(col,vec3(.91,1.,1.),foam);
float lum=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(lum),col,1.12);col*=mix(vec3(1.),vec3(1.12,.87,.93),uDusk*.7);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`;
 const waterMaterial=new T.ShaderMaterial({uniforms:u,vertexShader:vertex,fragmentShader:fragment});
 const compositeMaterial=new T.ShaderMaterial({uniforms:{...u,...compositeUniforms},vertexShader:vertex,fragmentShader:`uniform sampler2D uWaterColor;uniform vec2 uScreenResolution;void main(){gl_FragColor=texture2D(uWaterColor,gl_FragCoord.xy/uScreenResolution);
#include <tonemapping_fragment>
#include <colorspace_fragment>}`});
 const surface=new T.Mesh(new T.PlaneGeometry(150,150,96,96),compositeMaterial);surface.rotation.x=-Math.PI/2;surface.position.y=height;surface.renderOrder=8;scene.add(surface);
 const shadedSurface=new T.Mesh(surface.geometry,waterMaterial);shadedSurface.matrixAutoUpdate=false;waterScene.add(shadedSurface);
 // Seafloor rises gently toward the island, with sunlit sand and underwater stones.
 const groundGeo=new T.PlaneGeometry(160,160,80,80);groundGeo.rotateX(-Math.PI/2);const pos=groundGeo.attributes.position;for(let i=0;i<pos.count;i++){let x=pos.getX(i),z=pos.getZ(i),r=Math.hypot(x*.85,z*.7);pos.setY(i,-.85-Math.min(9,r*.14+Math.max(0.,r-4.)*.5)+Math.sin(x*.7)*Math.cos(z*.8)*.09);}groundGeo.computeVertexNormals();
 const seabed=new T.Mesh(groundGeo,new T.MeshStandardMaterial({color:'#f4edda',roughness:1}));seabed.receiveShadow=true;scene.add(seabed);
 const bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);let lastReflection=-1;
 const previousView=new T.Matrix4(),previousProjection=new T.Matrix4();
 const stats={frames:0,updates:0,movingFrames:0,staleMovingFrames:0,intervals:[]};
 function resize(w,h,dpr){lastReflection=-1;const width=Math.floor(w*dpr),height=Math.floor(h*dpr),waterScale=.72;compositeUniforms.uScreenResolution.value.set(width,height);const shadeW=Math.max(1,Math.floor(width*waterScale)),shadeH=Math.max(1,Math.floor(height*waterScale));u.uResolution.value.set(shadeW,shadeH);waterColorTarget.setSize(shadeW,shadeH);half.setSize(Math.max(1,Math.floor(width*.6)),Math.max(1,Math.floor(height*.6)));reflection.setSize(Math.max(1,Math.floor(width*.4)),Math.max(1,Math.floor(height*.4)));}
 function setShore(field){u.uShore.value=field.texture;u.uShoreBounds.value.copy(field.bounds);u.uShoreScale.value=field.scale;const centre=field.centre;surface.scale.set(Math.max(150,field.bounds.z+40)/150,Math.max(150,field.bounds.w+40)/150,1);surface.position.set(centre.x,height,centre.z);seabed.position.set(centre.x,0,centre.z);const p=groundGeo.attributes.position;for(let i=0;i<p.count;i++){const xLocal=(i%81/80-.5)*Math.max(160,field.bounds.z+50),zLocal=(Math.floor(i/81)/80-.5)*Math.max(160,field.bounds.w+50);p.setX(i,xLocal);p.setZ(i,zLocal);const x=xLocal+centre.x,z=zLocal+centre.z,d=Math.max(0,field.distance(x,z,true));p.setY(i,height-.55-Math.min(9,d*.20+Math.max(0,d-2)*.45)+Math.sin(x*.7)*Math.cos(z*.8)*.07);}p.needsUpdate=true;groundGeo.computeVertexNormals();lastReflection=-1;}
 function render(t){
  camera.updateMatrixWorld();u.uTime.value=t;
  const footprint=new T.Box3(),plane=new T.Plane(new T.Vector3(0,1,0),-height),ray=new T.Raycaster();for(const x of[-1,1])for(const y of[-1,1]){ray.setFromCamera(new T.Vector2(x,y),camera);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(p)footprint.expandByPoint(p);}
  if(!footprint.isEmpty()){const size=footprint.getSize(new T.Vector3()),centre=footprint.getCenter(new T.Vector3());surface.position.set(centre.x,height,centre.z);surface.scale.set(Math.max(150,size.x+12)/150,Math.max(150,size.z+12)/150,1);}

  const cameraMoved=!camera.matrixWorld.equals(previousView)||!camera.projectionMatrix.equals(previousProjection);
  previousView.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);stats.frames++;if(cameraMoved)stats.movingFrames++;
  const oldTone=renderer.toneMapping,oldTarget=renderer.getRenderTarget(),oldClip=renderer.clippingPlanes,oldAuto=renderer.shadowMap.autoUpdate,oldShadow=renderer.shadowMap.needsUpdate,wall=performance.now()/1000;
  const above=[],below=[];scene.traverse(o=>{if(o.userData.waterPass==='above')above.push(o);if(o.userData.waterPass==='below')below.push(o)});
  const visibility=new Map([surface,seabed,...above,...below].map(o=>[o,o.visible]));const restore=list=>list.forEach(o=>o.visible=visibility.get(o));
  try{
   renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;surface.visible=false;seabed.visible=true;above.forEach(o=>o.visible=false);
   renderer.toneMapping=T.NoToneMapping;u.uInvProjection.value.copy(camera.projectionMatrixInverse);u.uCameraWorld.value.copy(camera.matrixWorld);
   renderer.setRenderTarget(half);renderer.render(scene,camera);restore(above);
   if(cameraMoved||wall-lastReflection>=.032||lastReflection<0){
    if(lastReflection>=0)stats.intervals.push((wall-lastReflection)*1000);if(stats.intervals.length>2000)stats.intervals.shift();stats.updates++;
    lastReflection=wall;reflectionCamera.copy(camera);const at=new T.Vector3(0,0,-1).applyMatrix4(camera.matrixWorld);reflectionCamera.position.y=2*height-camera.position.y;at.y=2*height-at.y;reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(at);reflectionCamera.updateMatrixWorld();u.uReflectionMatrix.value.copy(bias).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
    seabed.visible=false;below.forEach(o=>o.visible=false);renderer.clippingPlanes=[...oldClip,new T.Plane(new T.Vector3(0,1,0),-height)];renderer.setRenderTarget(reflection);renderer.render(scene,reflectionCamera);
   }
   else if(cameraMoved)stats.staleMovingFrames++;
   renderer.clippingPlanes=oldClip;seabed.visible=false;below.forEach(o=>o.visible=false);surface.updateMatrixWorld();shadedSurface.matrix.copy(surface.matrixWorld);renderer.toneMapping=T.NoToneMapping;renderer.setRenderTarget(waterColorTarget);renderer.render(waterScene,camera);renderer.toneMapping=oldTone;renderer.setRenderTarget(oldTarget);surface.visible=visibility.get(surface);
   // Dynamic avatar, held flowers and animated plants must use this exact pose.
   // Offscreen passes above never update the map; update once, in the main pass only.
   renderer.shadowMap.needsUpdate=true;
   renderer.render(scene,camera);
  }finally{for(const[o,v]of visibility)o.visible=v;renderer.toneMapping=oldTone;renderer.setRenderTarget(oldTarget);renderer.clippingPlanes=oldClip;renderer.shadowMap.autoUpdate=oldAuto;renderer.shadowMap.needsUpdate=oldShadow;}
 }

 return {surface,seabed,uniforms:u,resize,render,setShore,invalidateReflection(){lastReflection=-1;},stats,resetStats(){stats.frames=stats.updates=stats.movingFrames=stats.staleMovingFrames=0;stats.intervals=[];},setDusk(v){u.uDusk.value=v;lastReflection=-1;},dispose(){surface.geometry.dispose();surface.material.dispose();waterMaterial.dispose();waterColorTarget.dispose();seabed.geometry.dispose();seabed.material.dispose();half.dispose();reflection.dispose();scene.remove(surface,seabed);}};
}
