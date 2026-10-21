import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {positionFishingCatchArrival} from '../lib/fishing-catch-motion.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';

test('fish keep a forward or outside approach corridor until the palms are ready',()=>{
 const contact=new THREE.Vector3(-.4,.7,.5),water=new THREE.Vector3(0,-2,4),size=new THREE.Vector3(.8,.6,.5),out=new THREE.Vector3();
 for(const direction of [new THREE.Vector3(0,0,1),new THREE.Vector3(-1,0,0)]){
  positionFishingCatchArrival(out,water,contact,size,0,direction);assert.ok(out.distanceTo(water)<1e-8,'fish emerge at the actual bobber without a lateral spawn jump');
  for(let i=30;i<96;i++){positionFishingCatchArrival(out,water,contact,size,i/100,direction);assert.ok(out.clone().sub(contact).dot(direction)>=.8-1e-8);}
  for(const p of [.96,.97,.98,.99,1]){positionFishingCatchArrival(out,water,contact,size,p,direction);const offset=out.clone().sub(contact);assert.ok(offset.clone().cross(direction).length()<1e-8,'the last segment cannot sweep laterally across a palm');assert.ok(offset.dot(direction)>=-1e-8);}
  positionFishingCatchArrival(out,water,contact,size,1,direction);assert.ok(out.distanceTo(contact)<1e-8);
  const before=positionFishingCatchArrival(new THREE.Vector3(),water,contact,size,.96-1e-7,direction),after=positionFishingCatchArrival(new THREE.Vector3(),water,contact,size,.96+1e-7,direction);assert.ok(before.distanceTo(after)<1e-5,'corridor joins continuously');
 }
 const state={phase:'holding',catch:{caughtAt:0}},ready=sampleFishingAction(state,1250),arrived=sampleFishingAction(state,1450);
 assert.equal(ready.showcaseProgress,1);assert.ok(ready.haulProgress<.96);assert.equal(arrived.haulProgress,1);
});
