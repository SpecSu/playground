import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFarmAnimal,drinkingPoseAt,type FarmSpecies} from '../src/minimal/animal-art.ts';
const species:FarmSpecies[]=['cow','sheep','pig','bunny'];
const idle={time:0,speed:0,distance:0,activity:'idle'};
const bounds=(o:THREE.Object3D)=>new THREE.Box3().setFromObject(o,true);
test('drink envelope waits for arrival, takes three sips and lifts before departure',()=>{
 assert.equal(drinkingPoseAt(0).lower,0);assert.equal(drinkingPoseAt(.1).lower,0);
 assert.equal(drinkingPoseAt(.32).lower,1);assert.equal(drinkingPoseAt(.75).lower,1);
 assert.equal(drinkingPoseAt(1).lower,0);assert.equal(drinkingPoseAt(1).sipping,false);
 for(let beat=0;beat<3;beat++)assert.ok(drinkingPoseAt(.32+((beat+.25)/3)*.44).sip>.99);
});
for(const animal of species){
 test(`${animal} reaches real water, plants all feet, makes ripples, then returns to idle`,()=>{
  const art=createFarmAnimal(animal,'female');
  for(const scale of [1,1.625,2.2])for(const waterHeight of [.009,.177]){
   art.root.position.set(3,.045,5);art.root.rotation.y=.63;art.root.scale.setScalar(scale);
   const contact=new THREE.Vector3(0,(waterHeight-.045)/scale,.72/scale);
   art.update({...idle,time:2.4,activity:'drink',drinkPhase:.5,waterContact:contact});art.root.updateMatrixWorld(true);
   const mouth=art.mouth.getWorldPosition(new THREE.Vector3()),worldContact=art.root.localToWorld(contact.clone());
   assert.ok(mouth.distanceTo(worldContact)<.019,`mouth contacts water (${mouth.distanceTo(worldContact)})`);
   assert.ok(art.root.getObjectByName('drink-ripples')!.visible);
   for(let i=0;i<4;i++){const box=bounds(art.root.getObjectByName(`${animal}-hoof-${i}`)!);assert.ok(box.min.y>=.04,`foot ${i} never sinks: ${box.min.y}`);assert.ok(box.min.y<.10,'planted, not floating');}
   art.update({...idle,time:0,activity:'drink',drinkPhase:1,waterContact:contact});art.root.updateMatrixWorld(true);
   const finished=art.mouth.getWorldPosition(new THREE.Vector3());
   art.update(idle);art.root.updateMatrixWorld(true);
   assert.ok(art.mouth.getWorldPosition(new THREE.Vector3()).distanceTo(finished)<1e-8,'lift finishes before idle transition');
   assert.equal(art.root.getObjectByName('drink-ripples')!.visible,false);
  }
  art.dispose();
 });
 test(`${animal} has moving articulated legs without hoof penetration`,()=>{
  const art=createFarmAnimal(animal,'male'),angles:number[]=[];
  for(let frame=0;frame<24;frame++){
   art.update({...idle,time:frame/8,speed:.8,distance:frame*.7/24,activity:'walk'});art.root.updateMatrixWorld(true);
   angles.push(art.root.getObjectByName(`${animal}-leg-0`)!.rotation.x);
   for(let i=0;i<4;i++)assert.ok(bounds(art.root.getObjectByName(`${animal}-hoof-${i}`)!).min.y>=-.002,`frame ${frame} foot ${i}`);
  }
  assert.ok(Math.max(...angles)-Math.min(...angles)>.5);
  if(animal==='bunny'){assert.equal(art.root.getObjectByName('bunny-leg-0')!.rotation.x,art.root.getObjectByName('bunny-leg-1')!.rotation.x,'rabbit hind feet spring as a pair');}
  art.dispose();
 });
}
test('carrying cancels drinking without corrupting the support point',()=>{
 for(const animal of species){const art=createFarmAnimal(animal,'male');art.update({...idle,carried:true});art.root.updateMatrixWorld(true);const before=art.mouth.getWorldPosition(new THREE.Vector3());
 art.update({...idle,carried:true,activity:'drink',drinkPhase:.5});art.root.updateMatrixWorld(true);
 assert.ok(before.distanceTo(art.mouth.getWorldPosition(new THREE.Vector3()))<1e-8);assert.ok(!art.root.getObjectByName('drink-ripples')!.visible);art.dispose();}
});
