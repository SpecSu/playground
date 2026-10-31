import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import {createClubAvatar} from '../src/avatars/club-avatar-rig.ts';
import {FarmAvatarPose,farmLocomotion,refreshPose} from '../src/minimal/avatar-pose.ts';
import {FarmActionRig} from '../src/v5/farm-action-rig.ts';
import * as motion from '../src/minimal/interaction-motion.ts';
type Greeting={weight:number;wave:number;reactProgress:number;reacting:boolean};
const poseAt=()=>{const fn=(motion as unknown as {greetingPoseAt?:(ms:number)=>Greeting}).greetingPoseAt;assert.equal(typeof fn,'function','finite greeting envelope exists');return fn!;};
test('greeting envelope completes its authored reaction and returns to rest within900ms',()=>{
 const pose=poseAt();assert.equal(pose(0).weight,0);assert.equal(pose(900).weight,0);assert.equal(pose(901).weight,0);assert.equal(pose(600).reactProgress,1);assert.equal(pose(650).reacting,true);assert.equal(pose(700).reacting,false);
 for(let t=-100;t<=1000;t++){const p=pose(t);assert.ok(Object.values(p).every(v=>typeof v==='boolean'||Number.isFinite(v)));assert.ok(p.weight>=0&&p.weight<=1);assert.ok(p.reactProgress>=0&&p.reactProgress<=1);}
 assert.ok(pose(450).weight>.99);assert.ok(pose(899).weight<.001);
});
test('actual LX greeting raises a hand then recovers without crouching stretching or moving its planted feet',async()=>{
 const bytes=readFileSync(new URL('../public/avatars/cast-v1/human-lx.glb',import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:'NO_TEST_IMAGE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const avatar=createClubAvatar('human-lx','minimal-player',{template:gltf.scene});await avatar.ready;const nav=new THREE.Group();nav.add(avatar.root);avatar.root.scale.setScalar(.65);avatar.update(0,'dance',true,0,farmLocomotion(nav,0,0));const pose=new FarmAvatarPose(avatar.root),rig=new FarmActionRig(avatar.root),greet=(rig as unknown as {greet?:(p:Greeting)=>void}).greet;assert.equal(typeof greet,'function','greeting uses its own arm pose, not the feeding reach');const greeting=poseAt();
 const point=(name:string)=>avatar.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
 try{for(const hz of [30,60,120]){nav.position.set(2,0,-2);nav.rotation.y=.7;avatar.update(0,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);refreshPose(avatar.root);const restHand=point('hand_R'),left=point('foot_L'),right=point('foot_R'),hip=point('hips'),length=point('upperArm_R').distanceTo(point('forearm_R'))+point('forearm_R').distanceTo(point('hand_R'));let raised=0,maxStep=0,previous=restHand.clone();
  for(let t=0;t<900;t+=1000/hz){avatar.update(t/1000,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);greet!.call(rig,greeting(t));refreshPose(avatar.root);const hand=point('hand_R');raised=Math.max(raised,hand.y-restHand.y);maxStep=Math.max(maxStep,hand.distanceTo(previous));previous=hand;assert.ok(point('foot_L').distanceTo(left)<1e-8);assert.ok(point('foot_R').distanceTo(right)<1e-8);assert.ok(point('hips').distanceTo(hip)<1e-8);assert.ok(Math.abs(point('upperArm_R').distanceTo(point('forearm_R'))+point('forearm_R').distanceTo(hand)-length)<1e-8);}
  avatar.update(.9,'dance',true,0,farmLocomotion(nav,0,0));pose.ground(()=>0);greet!.call(rig,greeting(900));refreshPose(avatar.root);assert.ok(raised>.13,'actual hand is visibly lifted');assert.ok(maxStep<.06,`gesture remains smooth at${hz}fps: ${maxStep}`);assert.ok(point('hand_R').distanceTo(restHand)<1e-8,'full recovery to grounded base');
 }}finally{avatar.dispose();}
});
