import * as THREE from 'three';

const NORMAL_SIZE = 256;
const TAU = Math.PI * 2;

/** Periodic value noise: every octave tiles, including its first derivative. */
function periodicNoise(u: number, v: number, cells: number) {
 const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y);
 const hash=(a:number,b:number)=>{
  const px=((a%cells)+cells)%cells,py=((b%cells)+cells)%cells;
  let h=Math.imul(px+17,374761393)^Math.imul(py+31,668265263);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967295;
 };
 const smooth=(t:number)=>t*t*t*(t*(t*6-15)+10);
 const sx=smooth(x-ix),sy=smooth(y-iy);
 const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
 return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
}

/** Original, deterministic normal data; no image downloads or canvas required. */
export function createWaterNormalTexture() {
 const heights=new Float32Array(NORMAL_SIZE*NORMAL_SIZE);
 for(let y=0;y<NORMAL_SIZE;y++)for(let x=0;x<NORMAL_SIZE;x++){
  const u=x/NORMAL_SIZE,v=y/NORMAL_SIZE;
  // A periodic domain warp breaks the grid without introducing a tile seam.
  const a=u+.035*Math.sin(TAU*v),b=v+.025*Math.sin(TAU*u);
  heights[y*NORMAL_SIZE+x]=periodicNoise(a,b,4)*.28+periodicNoise(a,b,8)*.16
   +periodicNoise(a,b,16)*.08+periodicNoise(a,b,32)*.035+periodicNoise(a,b,64)*.012;
 }
 const data=new Uint8Array(NORMAL_SIZE*NORMAL_SIZE*4);
 const height=(x:number,y:number)=>heights[((y+NORMAL_SIZE)%NORMAL_SIZE)*NORMAL_SIZE+(x+NORMAL_SIZE)%NORMAL_SIZE];
 for(let y=0;y<NORMAL_SIZE;y++)for(let x=0;x<NORMAL_SIZE;x++){
  const dx=(height(x-1,y)-height(x+1,y))*NORMAL_SIZE*.065;
  const dy=(height(x,y-1)-height(x,y+1))*NORMAL_SIZE*.065;
  const length=Math.hypot(dx,dy,1),i=(y*NORMAL_SIZE+x)*4;
  data[i]=Math.round((dx/length*.5+.5)*255);data[i+1]=Math.round((dy/length*.5+.5)*255);
  data[i+2]=Math.round((1/length*.5+.5)*255);data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,NORMAL_SIZE,NORMAL_SIZE,THREE.RGBAFormat);
 texture.name='Original seamless ocean ripple normals';
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
 return texture;
}

/** Two texture reads per fragment, no reflection camera or refraction target. */
export function createFishingWaterMaterial() {
 const texture=createWaterNormalTexture();
 // The existing plane spans 280 world units: one coarse tile spans eight units.
 texture.repeat.set(35,35);
 const material=new THREE.MeshPhysicalMaterial({color:'#087f9d',metalness:0,roughness:.23,
  ior:1.333,clearcoat:0,normalMap:texture,normalScale:new THREE.Vector2(.9,.9)});
 const waterTime={value:0};
 material.name='Multiscale moving sea';
 material.onBeforeCompile=shader=>{
  shader.uniforms.waterTime=waterTime;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform float waterTime;
  `).replace('#include <normal_fragment_maps>',`
   // Large swells stay in the geometry. Interacting small ripples change the
   // actual lighting normal rather than painting white marks over the water.
   vec3 waterNormalA=texture2D(normalMap,vNormalMapUv+vec2(.014,-.009)*waterTime).xyz*2.0-1.0;
   mat2 waterRotation=mat2(.8,-.6,.6,.8);
   vec2 waterUvB=waterRotation*vNormalMapUv*1.87+vec2(-.011,.017)*waterTime+waterNormalA.xy*.065;
   vec3 waterNormalB=texture2D(normalMap,waterUvB).xyz*2.0-1.0;
   vec2 waterSlope=waterNormalA.xy*.8+transpose(waterRotation)*waterNormalB.xy*.42;
   // Mipmaps remove unresolved detail; soften remaining slopes toward horizon.
   float waterDetail=1.0-smoothstep(45.0,140.0,length(vViewPosition))*.65;
   normal=normalize(tbn*normalize(vec3(waterSlope*normalScale*waterDetail,1.0)));
  `).replace('#include <opaque_fragment>',`
   // Analytic sky reflection is intentionally local to the water material.
   // This is an approximation of the sky, not a scene/object reflection pass.
   vec3 waterView=normalize(vViewPosition);
   vec3 waterReflected=inverseTransformDirection(reflect(-waterView,normal),viewMatrix);
   float waterSkyHeight=smoothstep(0.0,.8,max(waterReflected.y,0.0));
   vec3 waterSky=mix(vec3(.46,.72,.82),vec3(.12,.43,.68),waterSkyHeight);
   float waterFresnel=.0204+.9796*pow(1.0-max(dot(normal,waterView),0.0),5.0);
   outgoingLight=mix(outgoingLight,waterSky,waterFresnel*.88);
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=>'fishing-water-ripples-v1';
 return {material,animate(time:number,reducedMotion=false){waterTime.value=reducedMotion?0:time;},dispose(){texture.dispose();}};
}
