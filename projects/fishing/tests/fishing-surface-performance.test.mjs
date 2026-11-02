import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as surfaces from '../lib/fishing-surface-contact.ts';
import { triangleIntersectionProbe as reference } from './helpers/fishing-intersection-reference.mjs';
const triangle = (a,b,c) => new THREE.Triangle(new THREE.Vector3(...a),new THREE.Vector3(...b),new THREE.Vector3(...c));
function fixtures() {
 let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const point=()=>[random()*1.6-.8,random()*1.6-.8,random()*1.6-.8];
 const obstacles=Array.from({length:90},()=>{const a=point();return triangle(a,a.map(n=>n+random()*.15),a.map(n=>n-random()*.15));});
 obstacles.push(triangle([-.16,-.16,0],[.16,-.16,0],[0,.16,0]));
 return {obstacles,subjects:Array.from({length:60},()=>{const a=point();return triangle(a,a.map(n=>n+random()*.22),a.map(n=>n-random()*.22));}),random};
}
test('indexed exact collision preserves v0.3.3 results for seeded meshes, negative cells, and boundary contacts',()=>{
 assert.equal(typeof surfaces.createFishingTriangleIntersectionProbe,'function');
 const {obstacles,subjects,random}=fixtures(), actual=surfaces.createFishingTriangleIntersectionProbe(obstacles), expected=reference(obstacles);
 for(let i=0;i<140;i++) { const offset=new THREE.Vector3((random()-.5)*3,(random()-.5)*3,(random()-.5)*3);assert.equal(actual(subjects,offset),expected(subjects,offset),`offset ${offset.toArray()}`); }
 for(const offset of [new THREE.Vector3(),new THREE.Vector3(.08,0,0),new THREE.Vector3(-.08,-.16,-.24),new THREE.Vector3(50,50,50)]) for(const subject of subjects) assert.equal(actual([subject],offset),expected([subject],offset));
 assert.equal(surfaces.createFishingTriangleIntersectionProbe([])(subjects,new THREE.Vector3()),false);
});
test('collision queries reuse de-duplication storage instead of allocating a Set per triangle',()=>{
 assert.equal(typeof surfaces.createFishingTriangleIntersectionProbe,'function');
 const {obstacles,subjects}=fixtures(), query=surfaces.createFishingTriangleIntersectionProbe(obstacles), OriginalSet=globalThis.Set;let allocations=0;
 globalThis.Set=class extends OriginalSet {constructor(...args){super(...args);allocations++;}};
 try {for(let i=0;i<25;i++) query(subjects,new THREE.Vector3(i*.01,0,0));} finally {globalThis.Set=OriginalSet;}
 assert.equal(allocations,0);
});

test('large and distant geometry cannot alias cells or lose out-of-grid crossings',()=>{
 const obstacles=[triangle([-1e6,-1e6,-1e6],[-1e6+.04,-1e6,-1e6],[-1e6,-1e6+.04,-1e6]),triangle([1e6,1e6,1e6],[1e6+.04,1e6,1e6],[1e6,1e6+.04,1e6])];
 const actual=surfaces.createFishingTriangleIntersectionProbe(obstacles),expected=reference(obstacles);
 for(const sign of [-1,1]) {const center=sign*1e6;const subject=triangle([center+.01,center+.01,center-.03],[center+.01,center+.01,center+.03],[center+.03,center+.01,center+.03]);assert.equal(actual([subject],new THREE.Vector3()),expected([subject],new THREE.Vector3()));}
 const {obstacles:small}=fixtures(), huge=[triangle([-3,0,0],[3,0,0],[0,3,0])];
 assert.equal(surfaces.createFishingTriangleIntersectionProbe(small)(huge,new THREE.Vector3()),reference(small)(huge,new THREE.Vector3()));
});

test('full-resolution real GLB bodies and four catch shapes return exactly the previous crossings',async()=>{
 const {uploadedAvatar}=await import('./helpers/uploaded-avatar.mjs');
 const {createFishingAvatar}=await import('../lib/fishing-avatar.ts');
 const {createMarineModel}=await import('../components/fishing/MarineModels.ts');
 const {catchDisplayScale}=await import('../lib/fishing-world.ts');
 const {createFishingMeshTriangleReader}=await import('./helpers/fishing-triangle-clearance.mjs');
 for(const id of ['human-subeike','miaocuijiao','sword-shield-dog']) {
  const avatar=createFishingAvatar(id,'exact-collision',{template:await uploadedAvatar(id)});
  avatar.updateFishing(3,'holding',true,1);
  const triangles=createFishingMeshTriangleReader(avatar.root,{relativeTo:avatar.root})();
  assert.ok(triangles.length>30000);
  const actual=surfaces.createFishingTriangleIntersectionProbe(triangles),expected=reference(triangles);
  for(const [species,cm]of [['clownfish',14],['pufferfish',55],['tuna',160],['manta-ray',400]]) {
   const fish=createMarineModel(species,cm);fish.scale.setScalar(catchDisplayScale(cm));
   const subjects=surfaces.createFishingCatchSurface(fish).triangles;
   for(let i=0;i<20;i++){const offset=new THREE.Vector3((i%5-2)*.21,.15+Math.floor(i/5)*.31,-.1+(i%4)*.43);assert.equal(actual(subjects,offset),expected(subjects,offset),`${id}/${species}/${i}`);}
  }
  avatar.dispose();
 }
});
test('reused projection scratch preserves exact near-duplicate depth pairing and every surface extreme',async()=>{
 assert.equal(typeof surfaces.createFishingProjectedSurface,'function');
 const {projectedSurface:referenceProjection}=await import('./helpers/fishing-projection-reference.mjs');
 const {obstacles:triangles,random}=fixtures();
 for(const depth of [-.5,-.499995,-.49999,0,.000005,.00001,.2,.5])triangles.push(triangle([-1,-1,depth],[1,-1,depth],[0,1,depth]));
 for(const vertical of ['y','z'])for(const minimum of [false,true]){
  const actual=surfaces.createFishingProjectedSurface(triangles,vertical,minimum),expected=referenceProjection(triangles,vertical,minimum);
  for(let i=0;i<400;i++){const x=random()*3-1.5,y=random()*3-1.5;for(const d of [undefined,-.6,-.499997,-.1,.000007,.1,.6])assert.equal(actual(x,y,d),expected(x,y,d),`${vertical}/${minimum}/${x}/${y}/${d}`);}
 }
});
