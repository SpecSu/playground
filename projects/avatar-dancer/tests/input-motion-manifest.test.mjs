import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {loadGeometry}from'./helpers/load-rig.mjs';import {normalizeCharacterBind,createRootMotionLock,stageCameraFraming}from'../src/stage.js';import{createInputMotionController}from'../src/input-motion.js';import{createFootGrounding}from'../src/foot-grounding.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/characters/manifest.json',import.meta.url)));
const assets=Object.entries(manifest.characters).flatMap(([id,character])=>character.outfits.map((def,index)=>({id:id+'-'+index,def,path:new URL('../public'+def.model.split('?')[0],import.meta.url)})));
if(process.env.THIRD_RIG_PATH)assets.push({id:'jiaxin-candidate',path:process.env.THIRD_RIG_PATH,def:{height:1.9,rotationY:-Math.PI/2,restPose:process.env.THIRD_RIG_REST_POSE?JSON.parse(process.env.THIRD_RIG_REST_POSE):{clip:'dance_01',time:3.475,arms:{clip:'dance_01',time:1}}}});
for(const asset of assets)test(asset.id+': whole phrases, turns, boundaries, interruption/recovery, floor and pause',async t=>{
 const g=await loadGeometry(asset.id,{path:asset.path}),model=g.scene;normalizeCharacterBind(model,asset.def.height||1.9);model.rotation.y+=asset.def.rotationY||0;
 assert.equal(g.animations.length,3);const bones=[];model.traverse(n=>{if(n.isBone)bones.push(n)});
 const wrapper=new T.Group;wrapper.add(model);const hips=bones.find(n=>n.name.endsWith('Hips')),lock=createRootMotionLock(wrapper,hips);
 const c=createInputMotionController(model,g.animations,{restPose:asset.def.restPose}),ground=createFootGrounding(wrapper);c.setMode('playing');lock.apply();ground.apply();
 const framing=stageCameraFraming('playing',false,0),camera=new T.PerspectiveCamera(33,9/16,.05,80);camera.position.fromArray(framing.position);camera.lookAt(...framing.target);camera.updateMatrixWorld();
 if(asset.def.restPose){assert.equal(c.getDiagnostics().ready?.configured,true,'explicit rest must resolve, never silently fall back');if(asset.def.restPose.bind){assert.equal(c.getDiagnostics().ready.source,'bind');assert.equal(c.getDiagnostics().ready.clip,null)}else{assert.equal(c.getDiagnostics().ready.clip,asset.def.restPose.clip);assert.equal(c.getDiagnostics().ready.time,asset.def.restPose.time)}}
 const snapshot=()=>bones.flatMap(n=>[...n.position,...n.quaternion,...n.scale]);const ready=snapshot();
 const world=n=>n.getWorldPosition(new T.Vector3()),anchor=world(hips);let maxAngle=0,minFloor=Infinity,maxLift=0,maxHeadStep=0,previousHead=null,minScreenTop=Infinity,maxScreenBottom=-Infinity;
 function step(seconds,{hits=false,misses=false,measure=false}={}){for(let frame=0;frame<Math.ceil(seconds*60);frame++){
  if(hits&&frame%20===0){c.hit(frame%4,'perfect');c.hit((frame+1)%4,'good')}
  if(misses&&frame%16===0)for(let j=0;j<4;j++)c.hit(j,'miss');
  const old=bones.map(n=>n.quaternion.clone());c.update(1/60);lock.apply();ground.apply();
  bones.forEach((n,i)=>{const angle=old[i].clone().normalize().angleTo(n.quaternion.clone().normalize());maxAngle=Math.max(maxAngle,angle);assert(angle<T.MathUtils.degToRad(8),n.name+' angular continuity')});
  const hip=world(hips);assert(Math.hypot(hip.x-anchor.x,hip.z-anchor.z)<1e-5,'root XZ stays anchored through full turns');
  const head=world(bones.find(n=>n.name.endsWith('Head')));if(previousHead)maxHeadStep=Math.max(maxHeadStep,head.distanceTo(previousHead));previousHead=head;
  maxLift=Math.max(maxLift,ground.getDiagnostics().lastLift);
  if(measure&&frame%30===0){wrapper.updateMatrixWorld(true);const p=new T.Vector3;let floor=Infinity;model.traverse(m=>{if(!m.isMesh)return;m.skeleton?.update();for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p);p.applyMatrix4(m.matrixWorld);floor=Math.min(floor,p.y);p.project(camera);minScreenTop=Math.min(minScreenTop,(1-p.y)/2);maxScreenBottom=Math.max(maxScreenBottom,(1-p.y)/2)}});minFloor=Math.min(minFloor,floor);assert(floor>-.012,'actual skin sole floor '+floor);}
 }}
 step(5);assert.deepEqual(snapshot(),ready,'no input does not start dance');
 for(const bpm of [128,170]){
  c.setBPM(bpm);step(43,{hits:true,measure:true});assert(c.getDiagnostics().phraseSerial>=2,'all three clips used');
  c.setMode('paused');const frozen=snapshot(),clock=c.getDiagnostics().clipTime;step(3);assert.deepEqual(snapshot(),frozen);assert.equal(c.getDiagnostics().clipTime,clock);c.setMode('playing');step(.2,{hits:true});
  step(5,{misses:true});assert.deepEqual(snapshot(),ready,'repeated misses settle completely');
  c.setMode('results');step(2);c.setMode('playing');step(1);assert.deepEqual(snapshot(),ready,'replay awaits success');
 }
 // Interruption and re-entry during a full turn, and around a phrase boundary.
 for(const at of [3.2,17.3,23.7]){c.setMode('results');step(2);c.setBPM(128);c.setMode('playing');step(at,{hits:true});const before=c.getDiagnostics().clipTime;step(.65);c.hit(2,'perfect');step(.3);assert.notEqual(c.getDiagnostics().clipTime,before,'recovery progresses instead of resetting');step(5);assert.deepEqual(snapshot(),ready,'inactivity exact rest');}
 c.setMode('lobby');step(4);assert.notDeepEqual(snapshot(),ready);c.setMode('paused');const frozen=snapshot();step(2);assert.deepEqual(snapshot(),frozen);
 assert(minScreenTop>-.06,'only raised extremities may crop at static150% '+minScreenTop);assert(maxScreenBottom<.79,'feet remain above controls '+maxScreenBottom);assert(maxHeadStep<.12,'bounded head displacement per 60Hz frame '+maxHeadStep);assert(ground.getDiagnostics().samples>0);t.diagnostic(JSON.stringify({maxAngle,maxHeadStep,minFloor,maxLift,minScreenTop,maxScreenBottom,ready:c.getDiagnostics().ready}));c.dispose();
});
