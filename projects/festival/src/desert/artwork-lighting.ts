import * as THREE from 'three';
import type { FestivalLighting, FestivalLightingMode, FestivalLightingPalette } from '../../lib/festival-types.ts';

/** The palette changes emission only, never the artist's painted surface. */
export const ARTWORK_LIGHT_PALETTES = {
  solar: ['#DCA75C', '#EDC784', '#F5DEAD'],
  aurora: ['#BE713D', '#DA9655', '#ECC18A'],
  candy: ['#B77D68', '#D2A18A', '#E8C4AC'],
  ice: ['#D5C6AE', '#E8DCC7', '#F4EAD8'],
} as const satisfies Record<FestivalLightingPalette, readonly [string,string,string]>;
const MODES: readonly FestivalLightingMode[] = ['pulse','chase','sweep','spark'];
const TAU = Math.PI * 2;
const fract=(n:number)=>n-Math.floor(n);

/** CPU reference of the shader's animation envelope, useful for regression QA. */
export function sampleArtworkLightPattern(mode:FestivalLightingMode,time:number,p:{x:number;y:number;z:number}):number {
  const t=Number.isFinite(time)?time:0;
  const phase=p.y*3.4+p.x*.71+p.z*.43;
  if(mode==='pulse')return .25+.75*Math.pow(.5+.5*Math.sin(TAU*1.2*t+phase),2);
  if(mode==='chase')return .16+.84*Math.pow(.5+.5*Math.cos(TAU*(p.y*3-t*1.4+p.x*.15)),8);
  if(mode==='sweep')return .2+.8*Math.pow(.5+.5*Math.cos((Math.hypot(p.x,p.z)<.00001?0:Math.atan2(p.z,p.x))-TAU*.85*t+p.y*2),3);
  const cell=Math.floor(p.x*5)*12.9898+Math.floor(p.y*10)*78.233+Math.floor(p.z*5)*37.719;
  const seed=fract(Math.sin(cell)*43758.5453);
  return .18+.82*Math.pow(.5+.5*Math.sin(TAU*t*(1.1+.1*Math.floor(seed*6))+TAU*seed),5);
}

// Exact artist-authored material IDs only. Body materials never inherit lighting.
// Geometric clips below further isolate accents that share a material with body.
const ACCENTS: readonly (readonly string[])[] = [
  ['sunlight enamel'], // held sun ring and its eight rays
  ['weathered brass'], // the single narrow halo, never mirror facets
  ['excavated copper spine'], // vertebral line, never ivory ribs or jaw
  ['electric ultramarine','brushed aluminum'], // upper hoop and balancing orb
  ['amber heart','brushed aluminum'], // heart and one inner gimbal
  ['dusty guy wire'], // existing stitched sail perimeter, never fabric or masts
  ['luminous amber seed','weathered brass'], // central seed and upper stamens
  ['brushed aluminum'], // speaker rims, dish rim and thin aerial crossbars
  ['polished solar edge'], // solar ring and centerline of the inner gate edge
  ['vermilion destination door'], // summit frame only, not coloured steps
  ['pearl ribs'], // fine bell ribs and rim, never canopy or hanging silk
  ['weathered brass'], // crossbars and small crown, never folded sheets
];
export function artworkLightRole(kind:number|'monument',name:string):number {
  if(kind==='monument')return name==='weathered warm limestone'?1:0;
  return ACCENTS[kind]?.includes(name)?1:0;
}
const band=(value:number,center:number,halfWidth:number,feather:number)=>{
  const t=Math.max(0,Math.min(1,(Math.abs(value-center)-halfWidth)/feather));
  return 1-t*t*(3-2*t);
};
/** CPU reference of the sparse shader mask, in normalized authored rest space. */
export function sampleArtworkLightMask(kind:number|'monument',name:string,p:{x:number;y:number;z:number}):number {
  if(!artworkLightRole(kind,name))return 0;
  if(kind==='monument')return Math.max(band(p.y,.405,.0018,.0012),band(p.y,.465,.0018,.0012));
  if(kind===3)return p.y>.46?1:0;
  if(kind===6)return p.y>.55?1:0;
  if(kind===8)return band(p.z,0,.018,.006);
  if(kind===9)return p.y>.81?1:0;
  return 1;
}

const vertexDeclarations=`
attribute vec3 aArtworkLightPosition;
varying vec3 vArtworkLightPosition;
`;
const fragmentDeclarations=`
varying vec3 vArtworkLightPosition;
uniform float uArtworkLightEnabled;
uniform float uArtworkLightTime;
uniform float uArtworkLightMode;
uniform float uArtworkLightForm;
uniform float uArtworkLightRole;
uniform vec3 uArtworkLightA;
uniform vec3 uArtworkLightB;
uniform vec3 uArtworkLightC;
float artworkLightAngle(vec3 p){
  if(dot(p.xz,p.xz)<.0000000001)return 0.;
  return atan(p.z,p.x);
}
float artworkLightPattern(vec3 p){
  float t=uArtworkLightTime;
  float phase=p.y*3.4+p.x*.71+p.z*.43;
  if(uArtworkLightMode<.5)return .25+.75*pow(.5+.5*sin(6.2831853*1.2*t+phase),2.);
  if(uArtworkLightMode<1.5)return .16+.84*pow(.5+.5*cos(6.2831853*(p.y*3.-t*1.4+p.x*.15)),8.);
  if(uArtworkLightMode<2.5)return .2+.8*pow(.5+.5*cos(artworkLightAngle(p)-6.2831853*.85*t+p.y*2.),3.);
  float cell=dot(floor(p*vec3(5.,10.,5.)),vec3(12.9898,78.233,37.719));
  float seed=fract(sin(cell)*43758.5453);
  return .18+.82*pow(.5+.5*sin(6.2831853*t*(1.1+.1*floor(seed*6.))+6.2831853*seed),5.);
}
float artworkLightBand(float value,float center,float width,float feather){
  return 1.-smoothstep(width,width+feather,abs(value-center));
}
float artworkLightMask(vec3 p){
  // No baseline, rim or global etching: unselected surfaces stay untouched.
  if(uArtworkLightRole<.5)return 0.;
  if(uArtworkLightForm>11.5)return max(artworkLightBand(p.y,.405,.0018,.0012),artworkLightBand(p.y,.465,.0018,.0012));
  if(abs(uArtworkLightForm-3.)<.5)return p.y>.46?1.:0.;
  if(abs(uArtworkLightForm-6.)<.5)return p.y>.55?1.:0.;
  if(abs(uArtworkLightForm-8.)<.5)return artworkLightBand(p.z,0.,.018,.006);
  if(abs(uArtworkLightForm-9.)<.5)return p.y>.81?1.:0.;
  return 1.;
}
`;
const emission=`
#include <emissivemap_fragment>
if(uArtworkLightEnabled>.5 && uArtworkLightRole>.5){
  vec3 artP=vArtworkLightPosition;
  float artMask=artworkLightMask(artP);
  float artHue=.5+.5*sin(artP.y*5.+artP.x*1.6+artP.z*.9);
  vec3 artColour=mix(uArtworkLightA,uArtworkLightB,smoothstep(0.,.64,artHue));
  artColour=mix(artColour,uArtworkLightC,smoothstep(.62,1.,artHue));
  totalEmissiveRadiance += artColour*artMask*artworkLightPattern(artP)*1.15;
}
`;

export type ArtworkLighting = {
  update(elapsedSeconds:number,selection:FestivalLighting|null|undefined,options?:{active?:boolean;reducedMotion?:boolean}):void;
  dispose():void;
};

/**
 * Call after createInstallationConstruction so its colour/shadow growth remains
 * intact. Each artwork already owns its materials; only immutable rest-position
 * attributes are shared in pooled geometry. No lamps, overlays or extra draws.
 */
export function createArtworkLighting(root:THREE.Group,kind:number|'monument'):ArtworkLighting {
  const enabled={value:0},time={value:0},mode={value:0};
  const colorA={value:new THREE.Color()},colorB={value:new THREE.Color()},colorC={value:new THREE.Color()};
  const hooks:{material:THREE.MeshStandardMaterial;compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];wrapper:THREE.Material['onBeforeCompile'];cacheKey:THREE.Material['customProgramCacheKey']}[]=[];
  const seen=new Set<THREE.MeshStandardMaterial>();
  const height=kind==='monument'?29.2:Number(root.userData.height??24);
  const radius=kind==='monument'?15:Number(root.userData.footprintRadius??9);
  root.updateWorldMatrix(true,true);
  const inverseRoot=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  root.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const surfaces=(Array.isArray(node.material)?node.material:[node.material]).filter((m):m is THREE.MeshStandardMaterial=>m instanceof THREE.MeshStandardMaterial);
    if(!surfaces.length)return;
    // Coordinates are captured at rest in artwork-local metres, and stay on the
    // same triangles as limbs, sails and gimbals articulate afterwards.
    if(!node.geometry.hasAttribute('aArtworkLightPosition')){
      const source=node.geometry.getAttribute('position'),coordinates=new Float32Array(source.count*3);
      matrix.multiplyMatrices(inverseRoot,node.matrixWorld);
      for(let i=0;i<source.count;i++){
        point.fromBufferAttribute(source,i).applyMatrix4(matrix);
        coordinates.set([point.x/radius,point.y/height,point.z/radius],i*3);
      }
      node.geometry.setAttribute('aArtworkLightPosition',new THREE.BufferAttribute(coordinates,3));
    }
    for(const material of surfaces){
      if(seen.has(material))continue;seen.add(material);
      const previousCompile=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
      const baseCacheKey=previousKey.call(material);
      const wrapper:THREE.Material['onBeforeCompile']=function(this:THREE.Material,shader,renderer){
        previousCompile.call(this,shader,renderer);
        Object.assign(shader.uniforms,{
          uArtworkLightEnabled:enabled,uArtworkLightTime:time,uArtworkLightMode:mode,
          uArtworkLightForm:{value:kind==='monument'?12:kind},uArtworkLightRole:{value:artworkLightRole(kind,material.name)},
          uArtworkLightA:colorA,uArtworkLightB:colorB,uArtworkLightC:colorC,
        });
        shader.vertexShader=vertexDeclarations+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArtworkLightPosition=aArtworkLightPosition;');
        shader.fragmentShader=fragmentDeclarations+shader.fragmentShader.replace('#include <emissivemap_fragment>',emission);
      };
      const cacheKey=()=>`${baseCacheKey}|artwork-lighting-sparse-v2`;
      hooks.push({material,compile:previousCompile,key:previousKey,wrapper,cacheKey});
      material.onBeforeCompile=wrapper;material.customProgramCacheKey=cacheKey;material.needsUpdate=true;
    }
  });
  let disposed=false,lastPalette:FestivalLightingPalette|null=null;
  return {
    update(elapsedSeconds,selection,options={}){
      if(disposed)return;
      const modeIndex=selection?MODES.indexOf(selection.mode):-1;
      const palette=selection?ARTWORK_LIGHT_PALETTES[selection.palette]:undefined;
      enabled.value=options.active!==false&&modeIndex>=0&&palette?1:0;
      if(!enabled.value)return;
      mode.value=modeIndex;
      // All four patterns share a seamless 20s period, retaining float precision
      // even when the monument keeps a selection across many festival rounds.
      time.value=options.reducedMotion?0:(Number.isFinite(elapsedSeconds)?Math.max(0,elapsedSeconds)%20:0);
      if(lastPalette!==selection!.palette){
        colorA.value.set(palette![0]);colorB.value.set(palette![1]);colorC.value.set(palette![2]);lastPalette=selection!.palette;
      }
    },
    dispose(){
      if(disposed)return;disposed=true;enabled.value=0;
      for(const hook of hooks){
        if(hook.material.onBeforeCompile===hook.wrapper)hook.material.onBeforeCompile=hook.compile;
        if(hook.material.customProgramCacheKey===hook.cacheKey)hook.material.customProgramCacheKey=hook.key;
        hook.material.needsUpdate=true;
      }
      hooks.length=0;seen.clear();
    },
  };
}
