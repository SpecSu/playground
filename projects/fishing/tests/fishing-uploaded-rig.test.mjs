import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {uploadedAvatar,glbDocument} from './helpers/uploaded-avatar.mjs';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
import {measureCatchContact} from './helpers/fishing-catch-contact.mjs';
const manifest=JSON.parse(readFileSync(new URL('../public/avatars/cast-v1/manifest.json',import.meta.url)));
const point=(avatar,name)=>avatar.root.worldToLocal(avatar.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()));

test('the uploaded cast keeps source hashes, embedded PBR textures, full bone weights and measured relative heights',async()=>{
 for(const item of manifest){
  const bytes=readFileSync(new URL(`../public/avatars/cast-v1/${item.id}.glb`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.id+' exact approved source');
  const doc=glbDocument(bytes);assert.equal(doc.meshes.length,1);assert.ok(doc.images.length>=3);assert.ok(doc.images.every(image=>Number.isInteger(image.bufferView)));assert.equal(doc.materials.length,1);assert.ok(doc.materials[0].normalTexture);assert.ok(doc.materials[0].pbrMetallicRoughness.baseColorTexture);
  const source=await uploadedAvatar(item.id),avatar=createFishingAvatar(item.id,'measure',{template:source});
  assert.ok(Math.abs(avatar.height-item.heightMetres)<.00001,`${item.id}: ${avatar.height} must preserve ${item.heightMetres}m without renormalizing`);
  for(const name of ['head','hips','spine','chest','hand_L','hand_R','upperArm_L','upperArm_R','forearm_L','forearm_R','foot_L','foot_R'])assert.ok(avatar.root.getObjectByName(name)?.isBone,`${item.id} ${name}`);
  avatar.dispose();
 }
});

test('all twelve uploaded rigs support every fishing stage with finite real bones, planted rear feet and attached rods',async()=>{
 const cast={phase:'waiting',castAt:1000}, caught={phase:'holding',catch:{id:'catch',caughtAt:5000}};
 const stages=[[{phase:'idle'},0],[cast,1300],[cast,1510],[cast,1800],[cast,3000],[{phase:'bite',castAt:1000,biteAt:4000},4500],[caught,5250],[caught,5700],[caught,7000],[{phase:'escaped'},9000]];
 for(const {id} of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'stage-test',{template:await uploadedAvatar(id)});
  const outer=new THREE.Group();outer.position.set(-2.2,1.54,2.4);outer.rotation.set(.004,-Math.PI/2,.006);outer.add(avatar.root);outer.updateMatrixWorld(true);
  avatar.updateFishing(0,'idle');const feet=['foot_L','foot_R'].map(n=>point(avatar,n));
  const first=point(avatar,'hand_R');let motion=0;
  for(const [state,time] of stages){
   const pose=sampleFishingAction(state,time);avatar.updateFishing(time/1000,state.phase,false,1,pose);
   const hand=point(avatar,'hand_R');assert.ok(hand.distanceTo(avatar.rodPosition)<1e-5,`${id} ${pose.stage} attaches the rod`);motion=Math.max(motion,first.distanceTo(hand));
   for(const [i,n] of ['foot_L','foot_R'].entries())assert.ok(point(avatar,n).distanceTo(feet[i])<1e-5,`${id} ${pose.stage} ${n} planted`);
   avatar.root.traverse(node=>{for(const n of [...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()])assert.ok(Number.isFinite(n),`${id} finite`);if(node.isBone)assert.ok(Math.abs(node.quaternion.length()-1)<1e-5,`${id} normalized bone`);});
  }
  assert.ok(motion>.08,`${id} has readable skeletal action`);avatar.dispose();
 }
});

test('new cast resting rod shafts clear the model body and head',async()=>{
 for(const {id} of FISHING_AVATAR_CATALOG){const avatar=createFishingAvatar(id,'clearance',{template:await uploadedAvatar(id)});avatar.updateFishing(0,'idle',true);
  const ray=new THREE.Raycaster(avatar.rodPosition.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(0,1,0),0,2.2);
  assert.deepEqual(ray.intersectObject(avatar.root,true).filter(hit=>hit.object.visible).map(hit=>hit.object.name),[],id+' resting shaft clears body/head');avatar.dispose();}
});

test('the uploaded sword dog keeps its weapons while the full-width rod clears them and its head through casting and hauling',async()=>{
 const avatar=createFishingAvatar('sword-shield-dog','weapon-clearance',{template:await uploadedAvatar('sword-shield-dog')});
 let mesh;avatar.root.traverse(node=>{if(node.isSkinnedMesh){mesh=node;node.material.side=THREE.DoubleSide;}});
 for(const phase of ['idle','waiting','holding'])for(const ms of [0,100,150,200,250,320,500,700,1000,1450]){
  const state={phase,castAt:1000,catch:{caughtAt:1000}},time=1000+ms,pose=sampleFishingAction(state,time);if(!pose.rodVisible)continue;
  avatar.updateFishing(time/1000,phase,false,1,pose);mesh.computeBoundingBox();mesh.computeBoundingSphere();
  const axis=new THREE.Vector3(.02,.9,.85).normalize().applyQuaternion(avatar.rodQuaternion);
  for(const offset of [[0,0,0],[.025,0,0],[-.025,0,0],[0,0,.025],[0,0,-.025]]){
   const ray=new THREE.Raycaster(avatar.rodPosition.clone().addScaledVector(axis,.15).add(new THREE.Vector3(...offset)),axis,0,1.2);
   assert.equal(ray.intersectObject(avatar.root,true).length,0,`${phase} ${ms} shaft and props stay separate`);
  }
 }
 assert.equal(mesh.geometry.index.count,119568,'the uploaded dog keeps all source body and accessory triangles');avatar.dispose();
});

test('shared uploaded loads apply the newest pose without resurrecting a disposed or replaced avatar',async t=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const hadWindow=Object.hasOwn(globalThis,'window'),previous=globalThis.window;globalThis.window={};
 t.after(()=>{if(hadWindow)globalThis.window=previous;else delete globalThis.window;});
 const source=await uploadedAvatar('milk-frog'),pending=[];
 t.mock.method(GLTFLoader.prototype,'loadAsync',url=>new Promise(resolve=>pending.push({url,resolve})));
 const old=createFishingAvatar('milk-frog','same-person'),next=createFishingAvatar('milk-frog','same-person');
 old.dispose();next.updateFishing(2,'waiting');next.updateFishing(8,'holding',true,1);
 assert.equal(pending.length,1,'shared source URL is fetched once');assert.equal(pending[0].url,'/avatars/cast-v1/milk-frog.glb');
 pending[0].resolve({scene:source});await Promise.all([old.ready,next.ready]);
 const expected=createFishingAvatar('milk-frog','same-person',{template:source});expected.updateFishing(8,'holding',true,1);
 assert.equal(old.loaded,false);assert.equal(old.root.children.length,0);
 assert.ok(next.rodPosition.distanceTo(expected.rodPosition)<1e-6);assert.ok(next.rodQuaternion.angleTo(expected.rodQuaternion)<1e-6);
 next.dispose();next.dispose();expected.dispose();assert.equal(next.root.children.length,0);
});

test('a failed uploaded model request is retryable and does not poison a later instance',async t=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const hadWindow=Object.hasOwn(globalThis,'window'),previous=globalThis.window;globalThis.window={};
 t.after(()=>{if(hadWindow)globalThis.window=previous;else delete globalThis.window;});
 const source=await uploadedAvatar('human-bear');let attempts=0;
 t.mock.method(GLTFLoader.prototype,'loadAsync',async()=>{if(++attempts===1)throw new Error('offline');return {scene:source};});
 const first=createFishingAvatar('human-bear','retry');await assert.rejects(first.ready,/offline/);first.dispose();
 const second=createFishingAvatar('human-bear','retry');await second.ready;assert.equal(attempts,2);assert.equal(second.loaded,true);assert.ok(Math.abs(second.height-1.45)<1e-5);second.dispose();
});

test('short uploaded arms expose the true support point so a held catch cannot float at the old humanoid offset',async()=>{
 for(const id of ['miaocuijiao','banana-cat','human-lx','niulai']){
  const avatar=createFishingAvatar(id,'catch-support',{template:await uploadedAvatar(id)});avatar.updateFishing(0,'holding',true,1);
  assert.ok(avatar.catchPosition instanceof THREE.Vector3,'actual wrist support point is available to the scene');
  const hands=point(avatar,'hand_L').add(point(avatar,'hand_R')).multiplyScalar(.5);
  assert.ok(avatar.catchPosition.distanceTo(hands)<1e-6,id+' catch support follows true bone reach');avatar.dispose();
 }
 const scene=readFileSync(new URL('../components/fishing/YachtScene.tsx',import.meta.url),'utf8');
 assert.match(scene,/e\.avatar\.positionCatchReady\(catchPoint\)/,'normal catches use the asynchronously solved support point');
 assert.doesNotMatch(scene,/\.avatar\.(?:prepareCatch|positionCatch)\(/,'RAF never enters synchronous preparation or a lazy contact solve');
});

test('seat hops articulate actual leg bones and return exactly to rest without altering authoritative outer placement',async()=>{
 for(const {id} of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'hop',{template:await uploadedAvatar(id)});avatar.updateFishing(0,'idle',false);
  const thigh=avatar.root.getObjectByName('thigh_L'),shin=avatar.root.getObjectByName('shin_L');const base=[thigh.quaternion.clone(),shin.quaternion.clone()];
  avatar.updateFishing(0,'idle',false,1,undefined,.5);
  assert.ok(thigh.quaternion.angleTo(base[0])>.1,`${id} thigh tucks in flight`);assert.ok(shin.quaternion.angleTo(base[1])>.2,`${id} knee tucks in flight`);
  assert.deepEqual(avatar.root.position.toArray(),[0,0,0]);assert.deepEqual(avatar.root.scale.toArray(),[1,1,1]);
  avatar.updateFishing(0,'idle',false,1,undefined,1);assert.ok(thigh.quaternion.angleTo(base[0])<1e-6);assert.ok(shin.quaternion.angleTo(base[1])<1e-6);
  avatar.updateFishing(0,'idle',true,1,undefined,.5);assert.ok(thigh.quaternion.angleTo(base[0])<1e-6);avatar.dispose();
 }
});

test('real fishing arms stay normalized under the existing non-uniform landing squash',async()=>{
 for(const {id} of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'landing',{template:await uploadedAvatar(id)}),outer=new THREE.Group();outer.add(avatar.root);outer.rotation.set(.015,1.1,.013);
  for(const progress of [.05,.5,.8,.89,.95]){
   const landing=progress>.78?Math.sin((progress-.78)/.22*Math.PI)**2:0,scaleY=1-landing*.065;
   outer.scale.set(1/Math.sqrt(scaleY),scaleY,1/Math.sqrt(scaleY));outer.updateMatrixWorld(true);avatar.updateFishing(2,'idle',false,1,undefined,progress);
   avatar.root.traverse(node=>{if(node.isBone)assert.ok(Math.abs(node.quaternion.length()-1)<1e-5,`${id} ${progress} ${node.name} normalized under landing squash`);});
  }avatar.dispose();
 }
});

test('legacy network identities use the same specialized rig behavior as the canonical uploaded character',async t=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const hadWindow=Object.hasOwn(globalThis,'window'),previous=globalThis.window;globalThis.window={};
 t.after(()=>{if(hadWindow)globalThis.window=previous;else delete globalThis.window;});
 const aliases={dog:'sword-shield-dog',capybara:'feidudu','monster-blob':'feidudu',cat:'miaocuijiao'},sources=new Map();
 for(const id of new Set(Object.values(aliases)))sources.set(id,await uploadedAvatar(id));
 t.mock.method(GLTFLoader.prototype,'loadAsync',async url=>{assert.match(url,/^\/avatars\/cast-v1\//);return {scene:sources.get(url.split('/').at(-1).replace('.glb',''))};});
 for(const [old,id] of Object.entries(aliases)){
  const actual=createFishingAvatar(old,'legacy'),expected=createFishingAvatar(id,'legacy',{template:sources.get(id)});await actual.ready;
  for(const phase of ['idle','waiting','holding'])for(const ms of [0,250,1000]){const time=1000+ms,pose=sampleFishingAction({phase,castAt:1000,catch:{caughtAt:1000}},time);actual.updateFishing(time/1000,phase,false,1,pose);expected.updateFishing(time/1000,phase,false,1,pose);assert.ok(actual.rodPosition.distanceTo(expected.rodPosition)<1e-6,old);assert.ok(actual.catchPosition.distanceTo(expected.catchPosition)<1e-6,old);assert.ok(actual.rodQuaternion.angleTo(expected.rodQuaternion)<1e-6,old);}
  actual.dispose();expected.dispose();
 }
});

test('short front-pawed cat presents a small catch below its face and in front of its belly',async()=>{
 const {createMarineModel}=await import('../components/fishing/MarineModels.ts');const {catchDisplayScale}=await import('../lib/fishing-world.ts');
 const fish=createMarineModel('clownfish',14),scale=catchDisplayScale(14);fish.scale.setScalar(scale);const size=new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3());
 const avatar=createFishingAvatar('miaocuijiao','small-catch',{template:await uploadedAvatar('miaocuijiao')});size.copy(avatar.prepareCatch(fish));avatar.updateFishing(0,'holding',true,scale*1.6,undefined,undefined,size);
 const center=avatar.positionCatch(new THREE.Vector3(),size);
 assert.ok(center.y>=.09&&center.y<=.25,'small cat supports fish with its low front paws');
 assert.ok(center.z>.3,'fish stays ahead of the low shoulder plane');
 for(const name of ['hand_L','hand_R'])assert.ok(point(avatar,name).y<.25,'short arms lower the actual wrists, not only the fish');
 const contact=measureCatchContact(avatar,fish,center);assert.equal(contact.insideVertices,0,'actual fish vertices stay outside the skinned cat');
 assert.ok(Math.max(contact.handSupportGaps.L,contact.handSupportGaps.R)<.04,'both actual front paws support the small fish without folding through the belly');
 avatar.dispose();
});

test('dog presents a small catch between both palms without burying it in its body',async()=>{
 const {createMarineModel}=await import('../components/fishing/MarineModels.ts');const {catchDisplayScale}=await import('../lib/fishing-world.ts');
 const fish=createMarineModel('clownfish',14),scale=catchDisplayScale(14);fish.scale.setScalar(scale);const size=new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3());
 const avatar=createFishingAvatar('sword-shield-dog','dog-catch',{template:await uploadedAvatar('sword-shield-dog')});size.copy(avatar.prepareCatch(fish));avatar.updateFishing(0,'holding',true,scale*1.6,undefined,undefined,size);
 const center=avatar.positionCatch(new THREE.Vector3(),size),contact=measureCatchContact(avatar,fish,center,{handRadius:.1});
 assert.equal(contact.insideVertices,0,'actual fish vertices clear both complete body and retained weapon mesh');
 assert.ok(Math.max(contact.handSupportGaps.L,contact.handSupportGaps.R)<.04,'both verified palm surfaces support the catch, not a distant weapon tip');
 const xs=['hand_L','hand_R'].map(name=>point(avatar,name).x);assert.ok(center.x>=Math.min(...xs)-.03&&center.x<=Math.max(...xs)+.03,'fish remains between the two wrists');avatar.dispose();
});

test('armed dog supports a large round ordinary catch against its palm instead of an empty bounding-box corner',async()=>{
 const {createMarineModel}=await import('../components/fishing/MarineModels.ts');const {catchDisplayScale}=await import('../lib/fishing-world.ts');
 for(const cm of [12,20,30,40,55]) {
 const fish=createMarineModel('pufferfish',cm),scale=catchDisplayScale(cm);fish.scale.setScalar(scale);const size=new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3());
 const avatar=createFishingAvatar('sword-shield-dog','dog-round-catch',{template:await uploadedAvatar('sword-shield-dog')});size.copy(avatar.prepareCatch(fish));avatar.updateFishing(0,'holding',true,scale*1.6,undefined,undefined,size);
 const center=avatar.positionCatch(new THREE.Vector3(),size),contact=measureCatchContact(avatar,fish,center,{handRadius:.1});assert.equal(contact.insideVertices,0);assert.ok(Math.max(contact.handSupportGaps.L,contact.handSupportGaps.R)<.04,`round fish ${cm}cm bilateral gaps ${JSON.stringify(contact.handSupportGaps)}`);avatar.dispose();
 }
});
