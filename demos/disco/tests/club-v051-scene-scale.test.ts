import './room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubWorld } from '../lib/club-scene-world.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';
import { thirdPersonCameraPose, avatarLabelAnchor } from '../lib/club-camera.ts';

const fixture = () => ({root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}});
test('v0.5.1 scene owns exactly one configured display scale for participants, ambient cast and DJ',async()=>{
 const world=makeClubWorld({createAvatar:fixture});
 const participant={id:'self',name:'Self',preset:'niulai' as const,slot:0,joinedAt:0,lastSeenAt:0,action:'dance' as const,actionAt:0};
 world.syncParticipants([participant],'self');
 for(const rig of [...world.ambient,...world.players.values(),world.dj])assert.deepEqual(rig.root.scale.toArray(),[CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE]);
 world.update(1,'neon',false,1,1000);
 for(const rig of [...world.ambient,...world.players.values(),world.dj])assert.deepEqual(rig.root.scale.toArray(),[CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE,CLUB_AVATAR_SCALE]);
 const subject=world.getCameraSubject('self')!;
 assert.equal(subject.height,1.5*CLUB_AVATAR_SCALE);assert.equal(subject.radius,.6*CLUB_AVATAR_SCALE);
 const before=thirdPersonCameraPose({height:1.5,radius:.6,position:{x:0,y:0,z:0},heading:0},.7,{yaw:0,pitch:0});
 const after=thirdPersonCameraPose(subject,.7,{yaw:0,pitch:0});
 assert.ok(after.distance<=before.distance*1.05,'camera does not cancel enlargement with a proportional retreat');
 world.dispose();
});
test('v0.5.1 physical uploaded cow uses the configured scene scale and fixed label clears it',async()=>{
 const cow=createClubAvatar('niulai','self',{template:await uploadedTemplate('niulai')});
 const world=makeClubWorld({createAvatar:(preset,id)=>id==='self'?cow:fixture()});
 world.syncParticipants([{id:'self',name:'Self',preset:'niulai',slot:0,joinedAt:0,lastSeenAt:0,action:'dance',actionAt:0}],'self');
 const rig=world.players.get('self')!;cow.update(0,'dance',true);const bounds=actualBounds(cow.root);
 assert.ok(Math.abs(bounds.max.y-bounds.min.y-cow.height*CLUB_AVATAR_SCALE)<.04);
 const anchor=avatarLabelAnchor(rig.root,cow.height,new THREE.Vector3(),'niulai');
 assert.ok(anchor.y>bounds.max.y+.1);
 world.dispose();
});
test('v0.5.1 DJ booth restores an uninterrupted solid countertop and no hidden standing platform',()=>{
 const world=makeClubWorld({createAvatar:fixture});const booth=world.scene.getObjectByName('central-dj-booth')!;
 assert.ok(!booth.getObjectByName('dj-standing-platform'),'no concealed riser');
 const point=new THREE.Vector3(0,1.02,-.25);let full=false;
 booth.traverse(n=>{if(n instanceof THREE.Mesh&&n.userData.cameraObstacle){n.geometry.computeBoundingBox();const p=point.clone().sub(n.position);if(n.geometry.boundingBox!.containsPoint(p))full=true;}});
 assert.ok(full,'rear-centre countertop must be solid, not a U-shaped recess');
 assert.equal(world.dj.root.position.y,0,'enlarged DJ stands on the room floor');
 world.dispose();
});

test('all twelve uploaded bodies enlarge once and keep their quiet body plus nickname in follow view',async()=>{
 const {UPLOADED_CAST}=await import('./helpers/uploaded-avatar.ts');
 const {CAMERA_FOV,projectFollowNameplate}=await import('../lib/club-camera.ts');
 for(const kind of UPLOADED_CAST){
  const model=createClubAvatar(kind,'self',{template:await uploadedTemplate(kind)});model.update(0,'dance',true);
  const native=actualBounds(model.root).getSize(new THREE.Vector3());
  const world=makeClubWorld({createAvatar:(_kind,id)=>id==='self'?model:fixture()});
  world.syncParticipants([{id:'self',name:'Self',preset:kind,slot:0,joinedAt:0,lastSeenAt:0,action:'dance',actionAt:0}],'self');
  const rig=world.players.get('self')!;model.update(0,'dance',true);
  const heading=rig.root.rotation.y;rig.root.rotation.y=0;rig.root.updateMatrixWorld(true);
  const physical=actualBounds(model.root).getSize(new THREE.Vector3());
  rig.root.rotation.y=heading;rig.root.updateMatrixWorld(true);actualBounds(model.root);
  for(const axis of ['x','y','z']as const)assert.ok(Math.abs(physical[axis]-native[axis]*CLUB_AVATAR_SCALE)<.0001,`${kind}/${axis} matches the scene multiplier over authored quiet geometry`);
  assert.deepEqual(model.root.scale.toArray(),[1,1,1],`${kind}: no second model-level multiplier`);
  const subject=world.getCameraSubject('self')!;
  for(const aspect of [.4,.7,1.8]){
   const pose=thirdPersonCameraPose(subject,aspect,{yaw:0,pitch:0}),camera=new THREE.PerspectiveCamera(CAMERA_FOV,aspect,.08,80);
   camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
   const point=new THREE.Vector3();
   model.root.traverseVisible(n=>{if(!(n instanceof THREE.Mesh))return;for(let i=0;i<n.geometry.attributes.position.count;i++){
    n.getVertexPosition(i,point).applyMatrix4(n.matrixWorld).project(camera);assert.ok(Math.abs(point.x)<.99&&Math.abs(point.y)<.99,`${kind}/${aspect}: full quiet skin stays in frame (${point.x},${point.y})`);
   }});
   avatarLabelAnchor(rig.root,model.height,point,kind);
   const body=rig.root.position.clone().add(new THREE.Vector3(0,model.height*CLUB_AVATAR_SCALE*.55,0));
   assert.ok(projectFollowNameplate(point,body,camera,700*aspect,700),`${kind}/${aspect}: fixed nickname remains visible`);
  }
  world.dispose();
 }
});
