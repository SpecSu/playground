import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {loadGeometry} from './helpers/load-rig.mjs';import {normalizeCharacterBind,createRootMotionLock} from '../src/stage.js';import {createInputMotionController} from '../src/input-motion.js';
async function fixture(){const g=await loadGeometry('jiji-0');normalizeCharacterBind(g.scene);g.scene.rotation.y=-Math.PI/2;const wrapper=new T.Group;wrapper.add(g.scene);const bones=[];g.scene.traverse(n=>{if(n.isBone)bones.push(n)});const hips=bones.find(n=>n.name.endsWith('Hips')),controller=createInputMotionController(g.scene,g.animations),lock=createRootMotionLock(wrapper,hips);controller.setMode('playing');return {g,wrapper,bones,hips,c:controller,lock};}
const snapshot=b=>b.flatMap(n=>[...n.position,...n.quaternion,...n.scale]);
test('sustained rhythm plays continuously changing whole-body choreography including an actual turn',async()=>{
 const {bones,hips,c,lock}=await fixture();let lastYaw,yaw=0,minYaw=0,maxYaw=0;const poses=[];let legsMoved=0;const leg=bones.find(n=>n.name.endsWith('LeftUpLeg')),initialLeg=leg.quaternion.clone();
 for(let frame=0;frame<720;frame++){if(frame%20===0)c.hit(frame%4,'perfect',{noteTime:frame/60});c.update(1/60);lock.apply();const f=new T.Vector3(0,0,1).applyQuaternion(hips.getWorldQuaternion(new T.Quaternion())),angle=Math.atan2(f.x,f.z);if(lastYaw!==undefined)yaw+=Math.atan2(Math.sin(angle-lastYaw),Math.cos(angle-lastYaw));lastYaw=angle;minYaw=Math.min(minYaw,yaw);maxYaw=Math.max(maxYaw,yaw);if(leg.quaternion.angleTo(initialLeg)>.2)legsMoved++;if(frame%30===0)poses.push(snapshot(bones));}
 assert(maxYaw-minYaw>Math.PI*1.5,'preserve authored turns, not same-facing directional poses');assert(legsMoved>200,'full leg choreography');assert(new Set(poses.map(p=>p.map(v=>v.toFixed(2)).join(','))).size>20);assert(c.getDiagnostics().clipTime>3);
});
test('same note stream with different lanes yields the same flowing dance, not arrow poses',async()=>{
 const a=await fixture(),b=await fixture();for(let i=0;i<180;i++){if(i%20===0){a.c.hit(0,'perfect');b.c.hit(3,'perfect')}a.c.update(1/60);b.c.update(1/60)}assert.deepEqual(snapshot(a.bones),snapshot(b.bones));
});
test('jitter and a long audio frame never restart the phrase or snap beyond bounded presentation angular speed',async()=>{
 const {bones,c,lock}=await fixture();let audio=0,nextHit=0;const deltas=[1/60,.025,.012,.08,.3,.016];let maxAngularRate=0;
 for(let frame=0;frame<150;frame++){const dt=deltas[frame%deltas.length];audio+=dt;if(audio>=nextHit){c.hit(frame%4,'perfect');nextHit=audio+.3}const old=bones.map(b=>b.quaternion.clone().normalize());c.update(dt,audio);lock.apply();bones.forEach((b,i)=>{const angle=old[i].angleTo(b.quaternion.clone().normalize());maxAngularRate=Math.max(maxAngularRate,angle/Math.min(dt,.08));assert(angle<=7.5*Math.min(dt,.08)+.00001)})}
 assert(c.getDiagnostics().clipTime>1);assert(maxAngularRate<=7.501);
});
