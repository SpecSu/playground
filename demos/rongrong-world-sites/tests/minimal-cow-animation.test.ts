import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSkeletalCowController} from '../src/minimal/cow-animation.ts';
import {createFarmAnimal,type FarmAnimalPose} from '../src/minimal/animal-art.ts';
const base:FarmAnimalPose={time:0,speed:0,distance:0,activity:'idle'};
async function asset(){const b=readFileSync(new URL('../public/models/farm/cow-animated.glb',import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
function mouth(controller:ReturnType<typeof createSkeletalCowController>){controller.root.updateMatrixWorld(true);return controller.mouth.getWorldPosition(new THREE.Vector3());}
test('Blender cow uses genuine skinned meshes, bone tracks and real authored walk motion',async()=>{
 const g=await asset(),c=createSkeletalCowController(g.scene,g.animations);let skins=0;g.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh){skins++;assert.ok(o.skeleton.bones.length>=20);assert.ok(o.geometry.getAttribute('skinWeight'));}});assert.ok(skins>0);assert.ok(skins<=9,`same-material export batching must reduce 29 skins, got ${skins}`);assert.deepEqual(g.animations.map(a=>a.name).sort(),['idle','walk','drink_enter','drink_loop','drink_exit','eat','rest','carried','react'].sort());
 const foot=g.scene.getObjectByName('cow_front_L_hoof')!,positions:THREE.Vector3[]=[];
 for(let i=0;i<30;i++){c.update({...base,time:i/30,speed:.65,distance:i/30*.58,activity:'walk'});g.scene.updateMatrixWorld(true);positions.push(foot.getWorldPosition(new THREE.Vector3()));}
 assert.ok(positions.some(p=>p.distanceTo(positions[0])>.1),'the authored skeleton moves the hoof');c.dispose();
});
test('walk, drinking and carried transitions retain nonzero mixer weights and return upright',async()=>{
 const g=await asset(),c=createSkeletalCowController(g.scene,g.animations);let time=0;
 const tick=(pose:Partial<FarmAnimalPose>,frames=18)=>{for(let i=0;i<frames;i++){time+=1/60;c.update({...base,...pose,time});}};
 tick({activity:'walk',speed:.6,distance:.14});const upright=mouth(c);
 tick({activity:'drink',drinkPhase:.15},1);
 const idleAction=c.mixer.existingAction(g.animations.find(a=>a.name==='walk')!);const enter=c.mixer.existingAction(g.animations.find(a=>a.name==='drink_enter')!);assert.ok((idleAction?.getEffectiveWeight()??0)+(enter?.getEffectiveWeight()??0)>.9,'crossfade has no invisible/zero-weight frame');assert.ok((enter?.getEffectiveWeight()??0)>0,'new action starts blending on first frame');
 tick({activity:'drink',drinkPhase:.5});const lowered=mouth(c);assert.ok(upright.y-lowered.y>.65);assert.ok(Math.abs(lowered.z-.72)<.025);assert.ok(Math.abs(lowered.y-.045)<.018);
 tick({activity:'drink',drinkPhase:1});assert.ok(mouth(c).y>.80,'phase1 ends upright');
 tick({activity:'drink',drinkPhase:.5});tick({activity:'drink',drinkPhase:.5,carried:true});assert.ok(mouth(c).y>.80,'carrying cancels drinking to real idle clip');c.dispose();
});
test('terrain-height correction moves the head modestly without moving the root or hoof anchors',async()=>{
 const g=await asset(),c=createSkeletalCowController(g.scene,g.animations),foot=g.scene.getObjectByName('cow_front_L_hoof')!;
 for(let i=0;i<20;i++)c.update({...base,time:i/60,activity:'drink',drinkPhase:.5});g.scene.updateMatrixWorld(true);const before=foot.getWorldPosition(new THREE.Vector3());
 for(let i=20;i<40;i++)c.update({...base,time:i/60,activity:'drink',drinkPhase:.5,waterContact:{x:0,y:.15,z:.72}});
 assert.ok(mouth(c).distanceTo(new THREE.Vector3(0,.15,.72))<.005);assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-6);assert.equal(g.scene.position.y,0);c.dispose();
});
test('each loaded cow has its own skeleton, real mouth/support markers and independently disposable assets',async()=>{
 const original=GLTFLoader.prototype.loadAsync;GLTFLoader.prototype.loadAsync=async function(){return asset();};
 const a=createFarmAnimal('cow','male',{skeletalCow:true}),b=createFarmAnimal('cow','female',{skeletalCow:true});
 try{
  assert.equal(await a.root.userData.animationReady,true);assert.equal(await b.root.userData.animationReady,true);
  assert.equal(a.root.userData.animationSource,'blender-skinned');assert.ok(a.mouth instanceof THREE.Bone);assert.ok(a.root.getObjectByName('animal-support') instanceof THREE.Bone);assert.equal(a.root.getObjectByName('cow-body-rig'),undefined,'ready skin retires the procedural body');
  for(let i=0;i<20;i++){a.update({...base,time:i/60,activity:'drink',drinkPhase:.5});b.update({...base,time:i/60});}
  a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);assert.ok(b.mouth.getWorldPosition(new THREE.Vector3()).y-a.mouth.getWorldPosition(new THREE.Vector3()).y>.6);
  assert.notEqual(a.root.getObjectByName('cow_head'),b.root.getObjectByName('cow_head'));
  let disposed=0;b.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.geometry.addEventListener('dispose',()=>disposed++);});a.dispose();assert.equal(disposed,0);b.update({...base,time:1});assert.ok(b.mouth.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite));
 }finally{b.dispose();GLTFLoader.prototype.loadAsync=original;}
});
test('authored cow carry does not stretch its continuous belly into a skin ribbon',async()=>{
 const g=await asset(),c=createSkeletalCowController(g.scene,g.animations),hide=g.scene.getObjectByName('Cow_Connected_Hide') as THREE.SkinnedMesh;
 const points=()=>{g.scene.updateMatrixWorld(true);hide.skeleton.update();return Array.from({length:hide.geometry.getAttribute('position').count},(_,i)=>hide.getVertexPosition(i,new THREE.Vector3()));};
 c.update(base);const before=points();for(let i=0;i<30;i++)c.update({...base,time:i/60,carried:true});const after=points(),ratios:number[]=[],index=hide.geometry.index!;
 for(let i=0;i<index.count;i+=3)for(const [a,b]of [[index.getX(i),index.getX(i+1)],[index.getX(i+1),index.getX(i+2)],[index.getX(i+2),index.getX(i)]]){const original=before[a].distanceTo(before[b]);if(original>.005)ratios.push(after[a].distanceTo(after[b])/original);}
 ratios.sort((a,b)=>a-b);assert.ok(ratios[Math.floor(ratios.length*.99)]<4,`99th-percentile edge stretch ${ratios[Math.floor(ratios.length*.99)]} must stay below the rejected broad-sheet pose (5.34x); accepted tucked pose is 3.75x`);c.dispose();
});
test('the cow pendant follows its chest attachment instead of swinging under belly support on a neck-only weight',async()=>{
 const g=await asset(),pendant=g.scene.getObjectByName('Cow_Batch_sage_pendant') as THREE.SkinnedMesh,weights=pendant.geometry.getAttribute('skinWeight'),indices=pendant.geometry.getAttribute('skinIndex');
 // The lower chest hide at the badge center is19.1296% proximal body. Pure
 // neck_01 weighting put this visible accessory inside LX for the first three
 // 240-Hz frames of a newborn pond-to-carry interruption, despite safe feet.
 for(let i=0;i<weights.count;i++){let body=0,neck=0;for(let j=0;j<4;j++){const name=pendant.skeleton.bones[indices.getComponent(i,j)]?.name;if(name==='cow_body')body+=weights.getComponent(i,j);if(name==='cow_neck_01')neck+=weights.getComponent(i,j);}assert.ok(Math.abs(body-.191296)<1e-6,'badge must follow its real chest attachment');assert.ok(Math.abs(neck-.808704)<1e-6);assert.ok(Math.abs(body+neck-1)<1e-6);}
});
