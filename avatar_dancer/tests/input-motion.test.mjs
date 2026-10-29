import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from './helpers/load-rig.mjs';
import {normalizeCharacterBind} from '../src/stage.js';
let api;try{api=await import('../src/input-motion.js')}catch{api={}}
async function fixture(){assert.equal(typeof api.createInputMotionController,'function');const gltf=await loadGeometry('jiji-0');normalizeCharacterBind(gltf.scene);gltf.scene.rotation.y=-Math.PI/2;return {model:gltf.scene,controller:api.createInputMotionController(gltf.scene,gltf.animations)};}
function pose(model){const result=[];model.traverse(n=>{if(n.isBone)result.push(...n.position,...n.quaternion)});return result;}
function advance(c,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)c.update(1/60);}
const distance=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0));
test('no notes is exact stable ready; one successful note moves then settles completely',async()=>{
 const {model,controller:c}=await fixture();const ready=pose(model);c.setMode('playing');advance(c,20);assert.deepEqual(pose(model),ready);
 c.hit(0,'perfect');advance(c,.18);assert(distance(pose(model),ready)>.05);advance(c,4);assert.deepEqual(pose(model),ready);
 advance(c,20);assert.deepEqual(pose(model),ready);assert.equal(c.getDiagnostics().state,'ready');
});
test('alternating valid hits flow without per-frame jumps; pause freezes and retry resets',async()=>{
 const {model,controller:c}=await fixture();c.setMode('playing');let previous=pose(model),maxStep=0;
 for(let i=0;i<120;i++){if(i%12===0)c.hit((i/12)%4,'perfect');c.update(1/60);const next=pose(model);maxStep=Math.max(maxStep,distance(next,previous));previous=next;}
 assert(maxStep<1.5);assert.equal(c.getDiagnostics().state,'flowing');
 c.setMode('paused');const paused=pose(model);advance(c,8);c.hit(1,'perfect');assert.deepEqual(pose(model),paused);
 c.setMode('playing');advance(c,.1);assert(distance(pose(model),paused)>0);
 c.setMode('results');advance(c,4);const ready=pose(model);advance(c,5);assert.deepEqual(pose(model),ready);
 c.setMode('playing');assert.deepEqual(pose(model),ready);
});
test('wrong inputs or unplayed chart misses do not create autonomous dance; chord misses preserve a fresh hit',async()=>{
 const {model,controller:c}=await fixture();c.setMode('playing');const ready=pose(model);
 for(let i=0;i<400;i++){c.hit(i%4,'miss',{kind:'wrong'});c.update(1/60)}assert.deepEqual(pose(model),ready);
 c.hit(0,'perfect');c.hit(1,'miss');advance(c,.2);assert.equal(c.getDiagnostics().state,'flowing');
 for(let i=0;i<1000;i++){c.hit(i%4,'miss');c.update(1/60)}assert.deepEqual(pose(model),ready);assert.equal(c.getDiagnostics().hesitation,0);
});
test('Perfect sustains stronger flow energy than Good without selecting lane poses',async()=>{
 const a=await fixture(),b=await fixture();for(const {controller:c} of [a,b])c.setMode('playing');a.controller.hit(2,'good');b.controller.hit(2,'perfect');advance(a.controller,.4);advance(b.controller,.4);assert(b.controller.getDiagnostics().energy>a.controller.getDiagnostics().energy);
 const d=a.controller.getDiagnostics();assert.equal(d.phrases.length,3);assert(d.ready.handsBelowShoulders);assert(d.ready.headAboveHips>.4);
});
test('frantic alternating directions never rotate a bone by more than eight degrees per frame',async()=>{
 const {model,controller:c}=await fixture();const bones=[];model.traverse(n=>{if(n.isBone)bones.push(n)});c.setMode('playing');
 for(let frame=0;frame<240;frame++){
  const before=bones.map(n=>n.quaternion.clone());c.hit(frame%4,'perfect');c.update(1/60);
  for(let i=0;i<bones.length;i++)assert(before[i].angleTo(bones[i].quaternion)<THREE.MathUtils.degToRad(8),bones[i].name+' abrupt rotation');
 }
});
test('lobby breathes continuously with planted feet, while gameplay without input stays exactly still',async()=>{
 const {model,controller:c}=await fixture();const bones=[];model.traverse(n=>{if(n.isBone)bones.push(n)});
 const ready=pose(model),feet=bones.filter(n=>/LeftFoot$|RightFoot$/.test(n.name));
 const footPositions=()=>{model.updateWorldMatrix(true,true);return feet.map(n=>n.getWorldPosition(new THREE.Vector3()))};
 const initialFeet=footPositions();let previous=pose(model),changed=0;
 for(let frame=0;frame<600;frame++){
  c.update(1/60);const next=pose(model);if(distance(next,previous)>1e-5)changed++;
  assert(distance(next,ready)<3,'lobby greeting stays within bounded upper-body pose');
  footPositions().forEach((p,i)=>assert(p.distanceTo(initialFeet[i])<1e-5,'feet stay planted'));
  previous=next;
 }
 assert(changed>500,'lobby remains visibly alive beyond the old settle deadline');assert.equal(c.getDiagnostics().state,'idle');
 c.setMode('playing');advance(c,10);assert.deepEqual(pose(model),ready,'no free gameplay motion');
 c.hit(2,'perfect');advance(c,.2);c.setMode('lobby');advance(c,3);const lobby=pose(model);advance(c,.5);assert(distance(lobby,pose(model))>1e-4,'return to lobby restores idle');
 c.setMode('paused');const frozen=pose(model);advance(c,3);assert.deepEqual(pose(model),frozen);
});

test('starting during the lobby greeting smoothly lowers the arm before exact no-input rest',async()=>{
 const {model,controller:c}=await fixture(),ready=pose(model),bones=[];model.traverse(n=>{if(n.isBone)bones.push(n)});advance(c,4);const before=bones.map(n=>n.quaternion.clone());c.setMode('playing');bones.forEach((n,i)=>assert(n.quaternion.angleTo(before[i])<.001,'mode switch must not snap raised arm'));advance(c,4);assert.deepEqual(pose(model),ready);advance(c,5);assert.deepEqual(pose(model),ready);
});
