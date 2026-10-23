import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FarmActionRig} from '../src/v5/farm-action-rig.ts';
import {feedingPoseAt,guardianPoseAt} from '../src/v5/action-sequence.ts';
function fixture(){
 const root=new THREE.Group();
 function bone(name:string,parent:THREE.Object3D,x:number,y:number,z:number){const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);return b;}
 const hips=bone('hips',root,0,1,0),spine=bone('spine',hips,0,.2,0),chest=bone('chest',spine,0,.2,0);bone('head',chest,0,.3,0);
 for(const side of ['L','R']){const sign=side==='L'?1:-1;const thigh=bone(`thigh_${side}`,hips,sign*.16,-.08,0),shin=bone(`shin_${side}`,thigh,0,-.45,0);bone(`foot_${side}`,shin,0,-.45,.04);const upper=bone(`upperArm_${side}`,chest,sign*.25,0,0),fore=bone(`forearm_${side}`,upper,sign*.2,-.1,0);bone(`hand_${side}`,fore,sign*.2,-.1,0);}
 root.updateMatrixWorld(true);return {root,rig:new FarmActionRig(root)};
}
test('feeding bends actual knees and keeps hand prop parented to right wrist',()=>{
 const {root,rig}=fixture(),prop=new THREE.Group();rig.attach(prop);assert.equal(prop.parent?.name,'hand_R');
 const foot=root.getObjectByName('foot_R')!,before=foot.getWorldPosition(new THREE.Vector3()),knee=root.getObjectByName('shin_R')!;
 rig.feed(feedingPoseAt(1500,'milk'),new THREE.Vector3(-.1,.7,.5));
 assert.ok(knee.quaternion.angleTo(new THREE.Quaternion())>.15);assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(before)<.02);
 const hand=root.getObjectByName('hand_R')!;assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-.1,.7,.5))<.3);
 assert.ok(prop.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()))<.1);
});
test('rig reset eliminates partial feed and does not alter navigation root transform',()=>{
 const {root,rig}=fixture();root.position.set(2,0,3);const q=root.quaternion.clone();rig.feed(feedingPoseAt(1600,'feed'),new THREE.Vector3(2,.8,3.6));rig.reset();
 assert.deepEqual(root.position.toArray(),[2,0,3]);assert.ok(root.quaternion.equals(q));assert.equal(root.getObjectByName('hips')!.position.y,1);
 assert.ok(root.getObjectByName('shin_R')!.quaternion.equals(new THREE.Quaternion()));
});
test('species-specific guard layer affects shield arm, cat body and frog raised arms differently',()=>{
 const dog=fixture(),cat=fixture(),frog=fixture();dog.rig.guardian(guardianPoseAt('dog','block',.8));cat.rig.guardian(guardianPoseAt('cat','gather',.8));frog.rig.guardian(guardianPoseAt('frog','bubble',.8));
 assert.notDeepEqual(dog.root.getObjectByName('upperArm_L')!.quaternion.toArray(),frog.root.getObjectByName('upperArm_L')!.quaternion.toArray());
 assert.ok(cat.root.getObjectByName('hips')!.position.z>0);assert.equal(dog.root.getObjectByName('hips')!.position.z,0);
});

test('procedural lamb has a real mouth socket and suckling is distinct from adult eating',async()=>{
 const {makeSheep}=await import('../src/sheep.ts'),{createFarm}=await import('../src/model.ts');const a=createFarm('lamb',0).animals[0];const sheep=makeSheep(a);
 assert.ok(sheep.root.getObjectByName('feeding-mouth'));
 sheep.update(a,1,'suckle',1,0,false,false,false,0);const suck= sheep.root.getObjectByName('feeding-mouth')!.getWorldPosition(new THREE.Vector3());assert.equal(sheep.root.getObjectByName('feeding-grass')!.visible,false);
 sheep.update(a,1,'eat',1,0,false,false,false,0);const eat=sheep.root.getObjectByName('feeding-mouth')!.getWorldPosition(new THREE.Vector3());assert.ok(suck.y>eat.y+.1);
});
