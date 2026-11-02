import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {uploadedAvatar} from './helpers/uploaded-avatar.mjs';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
import {createMarineModel} from '../components/fishing/MarineModels.ts';
import {catchDisplayScale} from '../lib/fishing-world.ts';
import {measureCatchContact} from './helpers/fishing-catch-contact.mjs';

test('all twelve uploaded bodies support small, round, tall and giant catches with real palm contact outside the body', async()=>{
 const failures=[];
 for(const{id}of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'mesh-regression',{template:await uploadedAvatar(id)});
  for(const[species,cm]of [['clownfish',14],['pufferfish',55],['tuna',160],['manta-ray',400]]){
   const fish=createMarineModel(species,cm),scale=catchDisplayScale(cm);fish.scale.setScalar(scale);
   const size=avatar.prepareCatch(fish),pose=sampleFishingAction({phase:'holding',catch:{caughtAt:1000}},3000,true);
   avatar.updateFishing(3,'holding',true,scale*1.6,pose,undefined,size);
   const anchor=avatar.positionCatch(new THREE.Vector3(),size),contact=measureCatchContact(avatar,fish,anchor,{handRadius:id==='sword-shield-dog'?.1:.18});
   if(contact.insideVertices>0)failures.push(`${id}/${species}: ${contact.insideVertices} fish vertices inside avatar, depth ${contact.maxPenetration.toFixed(4)}m`);
   if(Math.max(contact.handSupportGaps.L,contact.handSupportGaps.R)>.04)failures.push(`${id}/${species}: main fish body floats ${Math.max(...Object.values(contact.handSupportGaps)).toFixed(4)}m from one of the two supporting palms`);
   assert.equal(fish.scale.x,scale,'support must not shrink a real catch');
  }
  avatar.dispose();
 }
 assert.deepEqual(failures,[]);
});

test('a fully supported catch keeps its actual contact geometry still after fish animation',async()=>{
 const {animateMarineModel}=await import('../components/fishing/MarineModels.ts');
 const fish=createMarineModel('tuna',160);const motions=fish.userData.marineRig.motions;
 assert.ok(motions.length>0);
 for(const t of [1.2,2.7,4.4]){
  animateMarineModel(fish,t,1);
  for(const motion of motions)assert.ok(Math.abs(motion.node.rotation[motion.axis]-motion.rest)<1e-8,'held fins and tail retain the solved support surface');
 }
});

test('actual forearm and hand vertices do not remain buried during former worst cast and reel frames',async()=>{
 const {createFishingMeshClearanceProbe}=await import('./helpers/fishing-mesh-clearance.mjs');const failures=[];
 for(const{id}of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'volume-regression',{template:await uploadedAvatar(id)}),probe=createFishingMeshClearanceProbe(avatar.root,{threshold:.005});
  for(const[phase,elapsed]of [['waiting',320],['holding',210],['holding',630],['holding',840],['holding',980],['holding',1450]]){
   const state={phase,castAt:1000,catch:{caughtAt:1000}},pose=sampleFishingAction(state,1000+elapsed);avatar.updateFishing((1000+elapsed)/1000,phase,false,.352,pose);
   const measured=probe();assert.ok(measured.testedVertices>100,`${id}: retain full distal arm geometry`);
   if(measured.penetratingVertices)failures.push({id,phase,elapsed,depth:measured.maxDepth,vertices:measured.penetratingVertices});
  }
  avatar.dispose();
 }
 assert.deepEqual(failures,[]);
});
