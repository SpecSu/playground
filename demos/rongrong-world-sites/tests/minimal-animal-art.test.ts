import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFarmAnimal} from '../src/minimal/animal-art.ts';
import type {FarmSpecies,FarmAnimalPose} from '../src/minimal/animal-art.ts';
const bounds=(object:THREE.Object3D)=>new THREE.Box3().setFromObject(object,true);
const pose:FarmAnimalPose={time:0,speed:0,distance:0,activity:'idle'};
test('cow has four connected lower legs, grounded hooves and conformal skin pigment',()=>{
 const art=createFarmAnimal('cow','female');art.update(pose);art.root.updateMatrixWorld(true);
 const torso=art.root.getObjectByName('cow-torso') as THREE.Mesh;
 assert.ok(torso.geometry.getAttribute('color'),'patches are part of skin geometry');
 const bodyBounds=bounds(torso);
 for(let i=0;i<4;i++){
  const hoof=bounds(art.root.getObjectByName(`cow-hoof-${i}`)!);
  const limb=bounds(art.root.getObjectByName(`cow-limb-${i}`)!);
  assert.ok(Math.abs(hoof.min.y)<.002,`hoof ${i} is on the ground`);
  assert.ok(hoof.max.y<bodyBounds.min.y-.15,'whole hoof clears the belly');
  assert.ok(limb.max.y>bodyBounds.min.y,'limb connects inside body');
  assert.ok(limb.min.y<hoof.max.y,'limb connects inside hoof');
 }
 assert.ok(art.root.getObjectByName('animal-support'));
 assert.ok(bounds(art.root).max.y<=art.height+.01);
 art.dispose();
});
test('all species and activities retain finite actual mesh transforms',()=>{
 for(const species of ['cow','pig','sheep','bunny'] as FarmSpecies[]){
  const art=createFarmAnimal(species,'male');
  for(const activity of ['idle','graze','drink','rest'])for(const carried of [false,true])for(const hatch of [0,.2,.7,1]){
   art.update({...pose,time:4.2,speed:.8,distance:.17,activity,carried,hatch});art.root.updateMatrixWorld(true);
   art.root.traverse(o=>{
    assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${species} ${activity} transform`);
    if(o instanceof THREE.Mesh){const box=bounds(o);assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));}
   });
   assert.ok(bounds(art.root).min.y>-.2,`${species} remains close to ground even resting`);
  }
  art.dispose();
 }
});
test('cow feet never sink during strides, and carry bounds scale predictably at all sizes',()=>{
 const art=createFarmAnimal('cow','male');
 for(let step=0;step<32;step++){
  art.update({...pose,time:step/10,speed:.8,distance:step*.7/32});art.root.updateMatrixWorld(true);
  for(let i=0;i<4;i++)assert.ok(bounds(art.root.getObjectByName(`cow-hoof-${i}`)!).min.y>=-.002);
 }
 art.update({...pose,carried:true});
 const measures:number[]=[];
 for(const scale of [1,1.3,1.8]){
  art.root.scale.setScalar(scale);art.root.updateMatrixWorld(true);
  const box=bounds(art.root);measures.push(box.getSize(new THREE.Vector3()).y/scale);
  assert.ok(box.min.y>=0,'carried hooves do not dive below ground anchor');
 }
 assert.ok(Math.max(...measures)-Math.min(...measures)<1e-6);
 art.dispose();
});
