import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createFarmAnimal} from '../src/minimal/animal-art.ts';
const base={time:0,speed:0,distance:0,activity:'idle'};
async function cowAsset(){const b=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
test('the generic skeletal option caches one immutable template and clones bones and materials',async()=>{
 const original=GLTFLoader.prototype.loadAsync;let calls=0;
 GLTFLoader.prototype.loadAsync=async()=>{calls++;return cowAsset();};
 const a=createFarmAnimal('cow','male',{skeletal:true}),b=createFarmAnimal('cow','female',{skeletal:true});
 try{
  assert.ok(a.root.userData.animationReady instanceof Promise,'generic skeletal loading must start');
  assert.equal(await a.root.userData.animationReady,true);assert.equal(await b.root.userData.animationReady,true);
  assert.equal(calls,1,'a species template loads once, not per animal');
  assert.equal(a.root.userData.animationSource,'blender-skinned');
  const skins=(root:THREE.Object3D)=>{const meshes:THREE.SkinnedMesh[]=[];root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});return meshes;};
  const sa=skins(a.root),sb=skins(b.root);assert.ok(sa.length>0);assert.equal(new Set(sa.map(m=>m.skeleton)).size,1,'one identical bone palette per animal, not one per mesh');assert.notEqual(sa[0].skeleton,sb[0].skeleton);assert.notEqual(sa[0].skeleton.bones[0],sb[0].skeleton.bones[0]);assert.equal(sa[0].geometry,sb[0].geometry,'immutable geometry is shared');assert.notEqual(sa[0].material,sb[0].material,'instance tint/selection stays independent');
  for(let i=0;i<20;i++){a.update({...base,time:i/60,activity:'drink',drinkPhase:.5});b.update({...base,time:i/60});}
  a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);assert.ok(a.mouth.getWorldPosition(new THREE.Vector3()).y+.5<b.mouth.getWorldPosition(new THREE.Vector3()).y);
  let sharedDisposed=0;sb[0].geometry.addEventListener('dispose',()=>sharedDisposed++);a.dispose();assert.equal(sharedDisposed,0);b.update({...base,time:1});assert.ok(sb[0].skeleton.bones.every(b=>b.position.toArray().every(Number.isFinite)));
 }finally{a.dispose();b.dispose();GLTFLoader.prototype.loadAsync=original;}
});
test('duck fallback has a real bill, two webbed feet and wings rather than sheep ears or fleece',()=>{
 const duck=createFarmAnimal('duck','female');
 try{assert.ok(duck.root.getObjectByName('duck-bill'));assert.ok(duck.root.getObjectByName('duck-wing-L'));assert.ok(duck.root.getObjectByName('duck-wing-R'));assert.ok(duck.root.getObjectByName('duck-webbed-foot-L'));assert.ok(duck.root.getObjectByName('duck-webbed-foot-R'));assert.equal(duck.root.getObjectByName('sheep-fleece-0-0'),undefined);for(const activity of ['idle','walk','drink','eat','rest']){duck.update({...base,time:1,speed:activity==='walk'?.5:0,distance:.12,activity,drinkPhase:.5});duck.root.updateMatrixWorld(true);duck.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}}
 finally{duck.dispose();}
});

test('load failures retain a usable fallback and surface one exact diagnostic without retrying each frame',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');let calls=0;const notices:string[]=[];
 const assets=new AnimalAssetLibrary(async()=>{calls++;throw new Error('asset offline');});
 const a=createFarmAnimal('duck','male',{skeletal:true,assets,onLoadError:(species,error)=>notices.push(`${species}: ${error}`)});
 try{assert.equal(await a.root.userData.animationReady,false);assert.equal(a.root.userData.animationSource,'procedural-fallback');assert.equal(a.root.userData.animationStatus,'failed');assert.equal(a.root.userData.animationError,'asset offline');for(let i=0;i<60;i++)a.update({...base,time:i/60});assert.equal(calls,1);assert.deepEqual(notices,['duck: asset offline']);const preload=await assets.preload(['duck']);assert.deepEqual(preload,[{species:'duck',ready:false,error:'asset offline'}]);assert.equal(calls,2,'an explicit fresh preload can retry, updates cannot');}
 finally{a.dispose();}
});
test('disposing an animal before its asset arrives cannot attach or dispose the shared template',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');const template=await cowAsset();let resolve!:(asset:typeof template)=>void;
 const assets=new AnimalAssetLibrary(()=>new Promise(done=>{resolve=done;}));const animal=createFarmAnimal('cow','female',{skeletal:true,assets});animal.dispose();let disposed=0;template.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>disposed++);});resolve(template);assert.equal(await animal.root.userData.animationReady,false);assert.equal(animal.root.children.length,0);assert.equal(disposed,0);
 const other=createFarmAnimal('cow','male',{skeletal:true,assets});try{assert.equal(await other.root.userData.animationReady,true);assert.equal(other.root.userData.animationSource,'blender-skinned');}finally{other.dispose();}
});
test('missing authored actions or true skin weights are rejected rather than labeled genuine',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');const template=await cowAsset();template.animations=template.animations.filter(c=>c.name!=='carried');const assets=new AnimalAssetLibrary(async()=>template);const animal=createFarmAnimal('cow','male',{skeletal:true,assets});try{assert.equal(await animal.root.userData.animationReady,false);assert.match(animal.root.userData.animationError,/missing animation carried/);assert.equal(animal.root.userData.animationSource,'procedural-fallback');}finally{animal.dispose();}
});
test('all semantic actions use distinct real clips and rapid interruptions retain normalized mixer weights',async()=>{
 const {createSkeletalAnimalController}=await import('../src/minimal/animal-animation.ts');const asset=await cowAsset(),controller=createSkeletalAnimalController(asset.scene,asset.animations,'cow');let time=0;
 try{for(const [activity,clip] of [['eat','eat'],['graze','eat'],['rest','rest'],['love','react'],['idle','idle']] as const){for(let i=0;i<20;i++){time+=1/60;controller.update({...base,time,activity});}assert.equal(asset.scene.userData.activeAnimation,clip);assert.ok(asset.scene.userData.animationWeights[clip]>.99);}
  for(let i=0;i<60;i++){time+=1/60;controller.update({...base,time,activity:i%3===0?'drink':i%3===1?'rest':'eat',drinkPhase:.5,carried:i%7===0});const weights=Object.values(asset.scene.userData.animationWeights) as number[];assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-8);assert.ok(weights.every(n=>Number.isFinite(n)&&n>=0&&n<=1));asset.scene.updateMatrixWorld(true);assert.ok(controller.mouth.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));}
 }finally{controller.dispose();}
});
test('explicit retry recovers existing failed actors without replacing roots, growth, placement or carry state',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');let attempts=0;const assets=new AnimalAssetLibrary(async()=>{if(++attempts===1)throw new Error('temporary connection');return cowAsset();});
 const a=createFarmAnimal('cow','female',{skeletal:true,assets}),b=createFarmAnimal('cow','male',{skeletal:true,assets});
 try{await Promise.all([a.root.userData.animationReady,b.root.userData.animationReady]);const root=a.root,uuid=root.uuid;root.position.set(2,3,4);root.rotation.y=.7;root.scale.setScalar(.6);a.update({...base,time:1,carried:true});
  assert.equal(typeof a.retryAnimation,'function','existing failed actor needs an explicit retry entry point');
  assert.deepEqual(await Promise.all([a.retryAnimation(),a.retryAnimation(),b.retryAnimation()]),[true,true,true]);assert.equal(attempts,2,'all simultaneous retries share a species request');assert.equal(a.root,root);assert.equal(a.root.uuid,uuid);assert.deepEqual(root.position.toArray(),[2,3,4]);assert.equal(root.scale.x,.6);assert.equal(root.rotation.y,.7);assert.equal(root.getObjectByName('blender-skinned-cow')!.userData.activeAnimation,'carried');assert.equal(root.userData.animationStatus,'ready');assert.equal(root.userData.animationError,undefined);
 }finally{a.dispose();b.dispose();}
});
test('every requested asset URL contains a revision matching the exact delivered GLB bytes',async()=>{
 const {createHash}=await import('node:crypto');const {ANIMAL_ASSETS}=await import('../src/minimal/animal-assets.ts');
 for(const [species,profile]of Object.entries(ANIMAL_ASSETS)){const url=new URL(profile.url,'https://farm.invalid'),bytes=readFileSync(new URL(`../public${url.pathname}`,import.meta.url));assert.equal(url.searchParams.get('v'),createHash('sha256').update(bytes).digest('hex').slice(0,16),`${species}: an old five-clip cached asset must not survive a nine-clip upgrade`);}
});
test('runtime validation rejects unbound motion targets, rigid detached parts and missing foot bones',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');
 for(const fault of ['track','mesh','foot']){const template=await cowAsset();if(fault==='track')template.animations[0].tracks[0].name='missing-bone.quaternion';if(fault==='mesh')template.scene.add(new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial()));if(fault==='foot')template.scene.getObjectByName('cow_front_L_hoof')!.removeFromParent();const art=createFarmAnimal('cow','female',{skeletal:true,assets:new AnimalAssetLibrary(async()=>template)});try{assert.equal(await art.root.userData.animationReady,false,`${fault}: invalid asset must retain fallback`);assert.equal(art.root.userData.animationSource,'procedural-fallback');assert.ok(art.root.userData.animationError);}finally{art.dispose();}}
});
test('explicit greeting progress samples the complete genuine react clip independently of its authored duration',async()=>{
 const {createSkeletalAnimalController}=await import('../src/minimal/animal-animation.ts');
 for(const species of ['cow','sheep','pig','bunny','duck'] as const){const bytes=readFileSync(new URL(`../public/models/farm/${species}-animated.glb`,import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),controller=createSkeletalAnimalController(asset.scene,asset.animations,species),clip=asset.animations.find(c=>c.name==='react')!;
  try{for(const progress of [0,.25,.5,.75,1]){controller.update({...base,time:progress*.8,activity:'react',reactProgress:progress});const action=controller.mixer.existingAction(clip)!;assert.ok(Math.abs(action.time/clip.duration-Math.min(.999999,progress))<1e-7,`${species} completes its genuine reaction in the requested finite greeting timeline`);assert.equal(asset.scene.userData.activeAnimation,'react');}const finished=controller.mixer.existingAction(clip)!.time;controller.update({...base,time:.82});assert.equal(controller.mixer.existingAction(clip)!.time,finished,'fading out a completed greeting must not rewind the animal reaction');}
  finally{controller.dispose();}
 }
});
test('a malformed physical neck chain is rejected before template caching so the same actor can recover',async()=>{
 const {AnimalAssetLibrary}=await import('../src/minimal/animal-assets.ts');let loads=0;const library=new AnimalAssetLibrary(async()=>{const asset=await cowAsset();if(++loads===1)asset.scene.add(asset.scene.getObjectByName('cow_head')!);return asset;}),art=createFarmAnimal('cow','female',{skeletal:true,assets:library});
 try{assert.equal(await art.root.userData.animationReady,false);assert.match(art.root.userData.animationError,/neck chain/);assert.equal(await art.retryAnimation(),true,'a corrected file must replace a rejected malformed chain');assert.equal(loads,2);assert.equal(art.root.userData.animationSource,'blender-skinned');}finally{art.dispose();}
});
