import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {createEstate,estateSnapshot,type EstateSnapshot} from '../src/v5/estate.ts';
import type {GridPoint} from '../src/v5/layout.ts';
import type {ClubMotionState} from '../src/avatars/club-scene-motion.ts';
type Mover={root:THREE.Group;path:GridPoint[];target:GridPoint;distance:number};
type Harness={data:EstateSnapshot;offset:number;player:Mover;syncMover:(m:Mover,p:GridPoint,reset?:boolean,path?:GridPoint[])=>void;moveVisual:(m:Mover,dt:number,now:number)=>number;locomotion:(m:Mover,speed:number)=>ClubMotionState};
const T=1_800_000_000_000;
function fixture(){
 const world=Object.create(EstateWorld.prototype) as Harness;
 world.data=estateSnapshot(createEstate('motion-fixture',T),T);world.offset=0;
 const mover={root:new THREE.Group(),path:[],target:{x:4,z:4},distance:0};world.player=mover;
 world.syncMover(mover,{x:4,z:4},true);return {world,mover};
}
for(const [kind,speed] of [['player',2.4],['sheep',1.15],['wolf',1],['guardian',1.2]] as const){
 test(`actual World ${kind} movement is continuous between 200ms authoritative snapshots`,()=>{
  const {world,mover}=fixture();if(kind!=='player')world.player={...mover,root:new THREE.Group()};
  let previous=mover.root.position.x;
  for(let frame=1;frame<=120;frame++){
   const ms=frame*1000/60;
   if(frame%12===0){world.data.now=T+ms;world.data.profile.lastPulseAt=T+ms;world.syncMover(mover,{x:4+speed*ms/1000,z:4});}
   world.moveVisual(mover,1/60,T+ms);
   if(frame>=40){const step=mover.root.position.x-previous;assert.ok(step>0,`${kind} stopped or reversed at frame ${frame}: ${step}`);assert.ok(Math.abs(step-speed/60)<1e-6,`${kind} changed speed at frame ${frame}: ${step}`);}
   previous=mover.root.position.x;
  }
 });
}
test('snapshot updates do not change a previously planted foot sample',()=>{
 const {world,mover}=fixture();
 for(let i=1;i<=8;i++){world.data.now=T+i*200;world.data.profile.lastPulseAt=T+i*200;world.syncMover(mover,{x:4+i*.2,z:4});world.moveVisual(mover,.2,T+i*200);}
 const distance=mover.distance-.3,foot=world.locomotion(mover,1).sampleAtDistance!(distance);
 world.data.now=T+1800;world.data.profile.lastPulseAt=T+1800;world.syncMover(mover,{x:5.6,z:4.2},false,[{x:5.6,z:4.2}]);world.moveVisual(mover,.2,T+1800);
 const next=world.locomotion(mover,1).sampleAtDistance!(distance);
 assert.ok(Math.hypot(foot.x-next.x,foot.z-next.z)<1e-8);
});
test('full opening routes keep progress instead of replaying the segment behind the actor',()=>{
 const {world,mover}=fixture();world.player={...mover,root:new THREE.Group()};
 const path=[{x:4,z:4},{x:5,z:4},{x:6,z:4},{x:7,z:4}];
 world.syncMover(mover,{x:4,z:4},true,path);
 for(let frame=1;frame<=120;frame++){
  const ms=frame*1000/60;
  if(frame%12===0){world.data.now=T+ms;world.data.profile.lastPulseAt=T+ms;world.syncMover(mover,{x:4+ms/1000,z:4},false,path);}
  world.moveVisual(mover,1/60,T+ms);
  if(frame>=40)assert.ok(Math.abs(mover.root.position.x+5.5-(4+(ms-220)/1000))<1e-6,`opening frame ${frame}`);
 }
});
