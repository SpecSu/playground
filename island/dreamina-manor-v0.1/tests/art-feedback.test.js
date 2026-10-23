import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fishWorldLength} from '../lib/art/physical-contract.js';
import {createAvatarActionPose} from '../lib/art/avatar-actions.js';
import * as actionArt from '../lib/art/avatar-actions.js';
import {FISH_STANDARD_SIZES_CM} from '../lib/art/fish-sizing.js';
import {createFishPresentation,measureFishTurnEnvelope} from '../lib/art/fish-presentation.js';
import {createAquariumArt} from '../lib/art/aquarium.js';
import {createSwimmer,safeSwimPoint} from '../lib/world/swimming.js';

test('one exhibition ruler enlarges small fish while preserving within-species ratios',()=>{
 assert.ok(Math.abs(fishWorldLength(16,16)-1.35)<1e-10);
 assert.ok(Math.abs(fishWorldLength(100,100)-1.43)<1e-10);
 for(const standard of [14,16,45,100,115]){
  const ordinary=fishWorldLength(standard*.9,standard);
  assert.ok(Math.abs(fishWorldLength(standard*.9*1.3,standard)/ordinary-1.3)<1e-10);
  assert.ok(Math.abs(fishWorldLength(standard*1.2,standard)/fishWorldLength(standard*.8,standard)-1.5)<1e-10);
 }
 assert.throws(()=>fishWorldLength(20,0));let previous=0;for(let standard=14;standard<=115;standard++){const size=fishWorldLength(standard,standard);assert.ok(size>=previous);previous=size;}
});

test('all twenty largest exhibition fish stay inside the starter tank during real swimming and fin motion',()=>{
 const cells=[{x:0,z:0},{x:1,z:0}],tank=createAquariumArt({cells});
 for(const [id,standard] of Object.entries(FISH_STANDARD_SIZES_CM)){
  const finalSize=standard*1.2*1.3,p=createFishPresentation({speciesId:id,lengthCm:finalSize,worldLength:fishWorldLength(finalSize,standard),instanceId:'audit-'+id});
  const e=measureFishTurnEnvelope(p,{samples:96,seconds:24}),radius=Math.max(e.half.x,e.half.z)+.035;
  const swimmer=createSwimmer({id:'audit-'+id,cells,outline:tank.outline,edges:tank.edges,floorY:tank.floorY,surfaceY:tank.surfaceY,radius,halfHeight:e.half.y});
  for(let i=0;i<1200;i++){
   const pose=swimmer.step(.1);assert.ok(safeSwimPoint(pose.position,radius,tank.outline,tank.edges),id+' horizontal envelope');
   if(i%10===0){p.root.position.copy(pose.position);p.root.rotation.y=pose.yaw;p.animate(i*.1);p.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(p.root);
    assert.ok(box.min.y>=tank.floorY+.04,id+' bottom including bob and fins');
    assert.ok(box.max.y<=tank.surfaceY-.04,id+' surface including bob and fins');
   }
  }p.dispose();
 }tank.dispose();
});

test('sowing accent is neutral, finite, transient, and removable on failure',()=>{
 assert.equal(typeof actionArt.createSowingAccent,'function');
 const accent=actionArt.createSowingAccent({groundY:.45});
 const handWorld=new THREE.Vector3(0,1.1,0),targetWorld=new THREE.Vector3(0,.45,1);
 accent.update({progress:.52,handWorld,targetWorld,pending:true});
 assert.ok(accent.root.visible);
 assert.ok(accent.root.children.some(n=>n.name==='SowingSeeds'));
 accent.update({progress:1,handWorld,targetWorld,pending:true});
 assert.ok(accent.root.visible,'neutral planted spot remains only while awaiting confirmation');
 assert.ok(accent.root.getObjectByName('PendingSeedCotyledons').visible);
 assert.ok(!accent.root.getObjectByName('SowingSeeds').visible);
 accent.update({progress:1,handWorld,targetWorld,pending:false});
 assert.equal(accent.root.visible,false);
 accent.update({progress:.55,handWorld,targetWorld,pending:true,reducedMotion:true});
 assert.equal(accent.root.getObjectByName('SowingSeeds').visible,false);
 accent.root.updateMatrixWorld(true);accent.root.traverse(n=>assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
 accent.dispose();
});

test('plant action has a visible bend and returns exactly to the rest pose',()=>{
 const root=new THREE.Group();
 for(const name of ['hips','spine','head','thigh_L','thigh_R','shin_L','shin_R']){const b=new THREE.Bone();b.name=name;root.add(b);}
 const pose=createAvatarActionPose({root});pose({action:'plant',progress:.5});
 const bend=new THREE.Euler().setFromQuaternion(root.getObjectByName('hips').quaternion).x;
 assert.ok(bend>=.23,'hips must visibly bend, not only a subtle idle nod');
 for(const b of root.children)b.quaternion.identity();pose({action:'plant',progress:1});
 assert.ok(root.children.every(b=>b.quaternion.angleTo(new THREE.Quaternion())<1e-6));
});
