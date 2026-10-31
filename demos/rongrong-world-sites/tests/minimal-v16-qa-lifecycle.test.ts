import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {AnimalAssetLibrary} from '../src/minimal/animal-assets.ts';
import {createFarmAnimal} from '../src/minimal/animal-art.ts';

const base={time:0,speed:0,distance:0,activity:'idle'};
async function asset(){const b=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const skins=(root:THREE.Object3D)=>{const result:THREE.SkinnedMesh[]=[];root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)result.push(o);});return result;};

test('V16 a temporary load failure keeps playable fallback and permits a later fresh instance to recover',async()=>{
 let loads=0,errors=0;const library=new AnimalAssetLibrary(async()=>{loads++;if(loads===1)throw Error('QA temporary offline');return asset();});
 const first=createFarmAnimal('cow','female',{skeletal:true,assets:library,onLoadError:()=>{errors++;}});
 try{
  assert.equal(await first.root.userData.animationReady,false);assert.equal(first.root.userData.animationSource,'procedural-fallback');assert.equal(first.root.userData.animationStatus,'failed');assert.match(first.root.userData.animationError,/QA temporary offline/);assert.equal(errors,1);
  first.update({...base,speed:.4,distance:.2});first.root.updateMatrixWorld(true);assert.ok(first.mouth.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));
  const recovered=createFarmAnimal('cow','male',{skeletal:true,assets:library});
  try{assert.equal(await recovered.root.userData.animationReady,true,'a rejected cache promise must not permanently poison the species');assert.equal(loads,2);assert.equal(recovered.root.userData.animationSource,'blender-skinned');assert.equal(errors,1);}finally{recovered.dispose();}
 }finally{first.dispose();}
});

test('V16 incomplete real assets fail truthfully without replacing fallback and corrected content can recover',async()=>{
 for(const missing of ['walk','feeding-mouth'] as const){
  let loads=0;const library=new AnimalAssetLibrary(async()=>{const g=await asset();if(loads++===0){if(missing==='walk')g.animations=g.animations.filter(a=>a.name!=='walk');else g.scene.getObjectByName('feeding-mouth')!.name='qa-missing-mouth';}return g;});
  const bad=createFarmAnimal('cow','female',{skeletal:true,assets:library});
  try{
   assert.equal(await bad.root.userData.animationReady,false);assert.equal(bad.root.userData.animationSource,'procedural-fallback');assert.equal(bad.root.getObjectByName('cow-body-rig')!.visible,true);assert.match(bad.root.userData.animationError,new RegExp(missing));
   const fixed=createFarmAnimal('cow','female',{skeletal:true,assets:library});try{assert.equal(await fixed.root.userData.animationReady,true,`${missing}: corrected asset should recover for a new instance`);}finally{fixed.dispose();}
  }finally{bad.dispose();}
 }
});

test('V16 disposed-before-ready animal never attaches late skin or reports a late error',async()=>{
 const gltf=await asset();let resolve!:(value:GLTF)=>void;const library=new AnimalAssetLibrary(()=>new Promise<GLTF>(r=>{resolve=r;}));let errors=0;
 const art=createFarmAnimal('cow','female',{skeletal:true,assets:library,onLoadError:()=>{errors++;}});const ready=art.root.userData.animationReady;
 art.dispose();assert.equal(art.root.children.length,0);resolve(gltf);assert.equal(await ready,false);assert.equal(art.root.children.length,0);assert.equal(skins(art.root).length,0);assert.equal(errors,0);art.dispose();
 const survivor=createFarmAnimal('cow','male',{skeletal:true,assets:library});try{assert.equal(await survivor.root.userData.animationReady,true);assert.ok(skins(survivor.root).length>0);}finally{survivor.dispose();}
});

test('V16 clones isolate skeleton pose and material mutation, and disposal is idempotent',async()=>{
 let loads=0;const library=new AnimalAssetLibrary(()=>{loads++;return asset();});
 const a=createFarmAnimal('cow','female',{skeletal:true,assets:library}),b=createFarmAnimal('cow','male',{skeletal:true,assets:library});
 try{
  assert.equal(await a.root.userData.animationReady,true);assert.equal(await b.root.userData.animationReady,true);assert.equal(loads,1);
  const sa=skins(a.root),sb=skins(b.root);assert.equal(sa.length,sb.length);let materialDisposed=0,skeletonDisposed=0,sharedGeometryDisposed=0;
  const observedMaterials=new Set<THREE.Material>(),observedSkeletons=new Set<THREE.Skeleton>();
  sa.forEach((mesh,i)=>{
   assert.notEqual(mesh.skeleton,sb[i].skeleton);assert.notEqual(mesh.skeleton.bones[0],sb[i].skeleton.bones[0]);assert.equal(mesh.geometry,sb[i].geometry);
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],other=Array.isArray(sb[i].material)?sb[i].material:[sb[i].material];
   mats.forEach((material,j)=>{assert.notEqual(material,other[j]);if(!observedMaterials.has(material)){observedMaterials.add(material);material.addEventListener('dispose',()=>{materialDisposed++;});}});
   if(!observedSkeletons.has(mesh.skeleton)){observedSkeletons.add(mesh.skeleton);const original=mesh.skeleton.dispose.bind(mesh.skeleton);mesh.skeleton.dispose=()=>{skeletonDisposed++;original();};}
   mesh.geometry.addEventListener('dispose',()=>{sharedGeometryDisposed++;});
  });
  for(let i=0;i<24;i++){a.update({...base,time:i/60,activity:'drink',drinkPhase:.5});b.update({...base,time:i/60});}
  a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);assert.ok(a.mouth.getWorldPosition(new THREE.Vector3()).y+.4<b.mouth.getWorldPosition(new THREE.Vector3()).y);
  a.dispose();a.dispose();assert.equal(materialDisposed,observedMaterials.size);assert.equal(skeletonDisposed,observedSkeletons.size);assert.equal(sharedGeometryDisposed,0);assert.equal(a.root.children.length,0);
  b.update({...base,time:1,speed:.3,distance:.2});b.root.updateMatrixWorld(true);assert.ok(b.mouth.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));
 }finally{a.dispose();b.dispose();}
});

test('V16 explicit same-actor retry coalesces, clears stale errors and preserves root transform and last pose',async()=>{
 let resolve!:(value:GLTF)=>void;const urls:string[]=[];let errors=0;
 const library=new AnimalAssetLibrary(url=>{urls.push(url);return urls.length===1?Promise.reject(Error('QA first attempt offline')):new Promise<GLTF>(r=>{resolve=r;});});
 const art=createFarmAnimal('cow','female',{skeletal:true,assets:library,onLoadError:()=>{errors++;}});
 try{
  assert.equal(await art.root.userData.animationReady,false);art.root.position.set(2,3,4);art.root.rotation.y=.9;art.root.scale.setScalar(.65);art.update({...base,time:2,carried:true});
  const root=art.root,transform={position:root.position.toArray(),rotation:root.rotation.toArray(),scale:root.scale.toArray()};const pending=art.retryAnimation();assert.equal(art.retryAnimation(),pending);assert.equal(art.retryAnimation(),pending);assert.equal(urls.length,2);assert.equal(root.userData.animationError,undefined);assert.equal(root.userData.animationStatus,'loading');
  assert.ok(new URL(urls[0],'https://qa.invalid').searchParams.get('v'));assert.equal(new URL(urls[1],'https://qa.invalid').searchParams.get('retry'),'1');resolve(await asset());assert.equal(await pending,true);assert.equal(art.root,root);assert.deepEqual({position:root.position.toArray(),rotation:root.rotation.toArray(),scale:root.scale.toArray()},transform);assert.equal(root.userData.animationError,undefined);assert.equal(root.getObjectByName('blender-skinned-cow')!.userData.activeAnimation,'carried');assert.equal(errors,1);assert.equal(await art.retryAnimation(),true);assert.equal(urls.length,2,'successful retry must not fetch again');
 }finally{art.dispose();}
});

test('V16 disposing a failed actor during explicit retry cannot resurrect skin or emit late status',async()=>{
 let resolve!:(value:GLTF)=>void,loads=0,notifications=0;const library=new AnimalAssetLibrary(()=>++loads===1?Promise.reject(Error('QA fail')):new Promise<GLTF>(r=>{resolve=r;}));
 const art=createFarmAnimal('cow','female',{skeletal:true,assets:library,onLoadStateChange:()=>{notifications++;}});assert.equal(await art.root.userData.animationReady,false);const pending=art.retryAnimation();art.dispose();const before=notifications;resolve(await asset());assert.equal(await pending,false);assert.equal(art.root.children.length,0);assert.equal(art.root.userData.animationStatus,'disposed');assert.equal(notifications,before);assert.equal(await art.retryAnimation(),false);assert.equal(loads,2);
});
