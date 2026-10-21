import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {thirdPersonCameraPose} from '../lib/club-camera.ts';
import {createClubAvatar} from '../lib/club-avatar-rig.ts';
import {UPLOADED_CAST,uploadedTemplate} from './helpers/uploaded-avatar.ts';
const scene=readFileSync(new URL('../components/ClubScene.tsx',import.meta.url),'utf8');
const capture=scene.match(/manualHeadingLock = Math\.atan2\(gestureForward\.x, gestureForward\.z\)[^;]*;/)[0];
test('actual gesture-lock capture keeps the front camera stationary when a joystick gesture begins',()=>{
 for(const immersion of [true,false])for(const heading of [0,.7,-2.9])for(const yaw of [0,.4,-1.1]){
  const camera={},cameras={thirdPerson:immersion?camera:{}};
  const viewYaw=heading+yaw+(immersion?Math.PI:0);
  const context=vm.createContext({camera,cameras,orbit:{yaw},gestureForward:{x:Math.sin(viewYaw),z:Math.cos(viewYaw)},manualHeadingLock:undefined});
  vm.runInContext(capture,context);
  const error=Math.atan2(Math.sin(context.manualHeadingLock-heading),Math.cos(context.manualHeadingLock-heading));
  assert.ok(Math.abs(error)<1e-10,`immersion=${immersion}: no 180-degree steering-start camera swing`);
 }
});
test('default immersion views the actual authored faces of all twelve avatars and the fallback DJ',async()=>{
 for(const kind of [...UPLOADED_CAST,'dj-kunkun']){
  const model=createClubAvatar(kind,kind,{template:await uploadedTemplate(kind),mode:kind==='dj-kunkun'?'dj':'dance'});
  const root=new THREE.Group();root.scale.setScalar(1.5);root.add(model.root);
  for(const heading of [0,Math.PI/2,-2.4]){
   root.rotation.y=heading;model.update(0,'dance',true,0);root.updateMatrixWorld(true);
   const head=model.root.getObjectByName('head');
   const face=new THREE.Vector3(0,0,1).transformDirection(head.matrixWorld);face.y=0;face.normalize();
   const pose=thirdPersonCameraPose({position:root.position,heading,height:model.height*1.5,radius:model.footprintRadius*1.5,displayScale:1.5},.75,{yaw:0,pitch:0});
   const towardCamera=pose.position.clone().sub(root.position);towardCamera.y=0;towardCamera.normalize();
   assert.ok(face.dot(towardCamera)>.98,`${kind}: camera looks at the authored face`);
  }
  model.dispose();
 }
});
