import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {createEstate,estateSnapshot,type EstateSnapshot} from '../src/v5/estate.ts';
import type {GridPoint} from '../src/v5/layout.ts';

type Mover={root:THREE.Group;path:GridPoint[];target:GridPoint;distance:number};
type Harness={
 data:EstateSnapshot;offset:number;player:Mover;
 set:EstateWorld['set'];
 syncMover:(m:Mover,p:GridPoint,reset?:boolean,path?:GridPoint[])=>void;
 moveVisual:(m:Mover,dt:number,now:number)=>number;
};
const T=1_800_000_000_000;
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
function fixture(){
 const data=estateSnapshot(createEstate('world-clock',T),T);
 data.profile.tutorial='done';data.profile.opening={version:1,stage:'done',elapsed:0,guardian:'dog'};data.profile.threat=null;data.profile.position={x:4,z:4};
 const world=Object.create(EstateWorld.prototype) as Harness;
 // Keep the real set/syncMover/moveVisual chain; omit only WebGL/DOM scene work.
 Object.assign(world,{data,offset:0,replay:false,cameraMode:'third-person',keys:new Set<string>(),direction:{x:0,z:0},drawGhost(){},
  sync(next:EstateSnapshot,reset:boolean){world.syncMover(world.player,next.profile.position,reset,next.profile.path);}});
 world.player={root:new THREE.Group(),path:[],target:{x:4,z:4},distance:0};
 world.syncMover(world.player,data.profile.position,true);
 const snapshot=(ms:number,x=4+ms/1000)=>{const next=structuredClone(data);next.now=T+ms;next.profile.lastPulseAt=T+ms;next.profile.position={x,z:4};return next;};
 const render=()=>{world.moveVisual(world.player,.01,Date.now()+world.offset);return world.player.root.position.x+5.5;};
 return {world,snapshot,render};
}

test('same-snapshot target and presentation props do not stall movement between authority samples',context=>{
 let wall=T;context.mock.method(Date,'now',()=>wall);
 const {world,snapshot,render}=fixture();
 wall=T+200;world.set(snapshot(200),'',false);
 wall=T+400;const data=snapshot(400);world.set(data,'',false);
 wall=T+500;close(render(),4.28);
 world.set(data,'pipi',true);
 wall=T+550;close(render(),4.33);
 world.set(data,'momo',false);
 wall=T+590;close(render(),4.37);
 wall=T+600;world.set(snapshot(600),'momo',false);close(render(),4.38);
});

test('replay projections advance on local time between slower authority pulses',context=>{
 let wall=T;context.mock.method(Date,'now',()=>wall);
 const {world,snapshot,render}=fixture();
 world.set(snapshot(0),'',false,'third-person',undefined,undefined,undefined,true);
 for(let frame=1;frame<=120;frame++){
  const ms=frame*10;wall=T+ms;
  if(frame%10===0)world.set(snapshot(Math.floor(ms/200)*200,4+ms/1000),'',false,'third-person',undefined,undefined,undefined,true);
  const x=render();if(ms>=400)close(x,4+(ms-220)/1000);
 }
});

test('profile and replay changes reset the motion source instead of mixing previous tracks',context=>{
 let wall=T;context.mock.method(Date,'now',()=>wall);
 const {world,snapshot,render}=fixture();
 wall=T+200;world.set(snapshot(200),'',false);
 wall=T+400;world.set(snapshot(400),'',false);close(render(),4.18);
 const replay=snapshot(400,7);wall=T+500;
 world.set(replay,'',false,'third-person',undefined,undefined,undefined,true);close(render(),7);
 wall=T+600;world.set(snapshot(600,4.6),'',false);close(render(),4.6);
 const lab=snapshot(600,8);lab.activeProfile='lab';lab.profile.id='lab';wall=T+700;
 world.set(lab,'',false);close(render(),8);
});

test('resetting the same profile replaces prior motion tracks immediately',context=>{
 let wall=T;context.mock.method(Date,'now',()=>wall);const {world,snapshot,render}=fixture();
 wall=T+200;world.set(snapshot(200),'',false);wall=T+400;world.set(snapshot(400),'',false);close(render(),4.18);
 const reset=snapshot(600,7);Object.assign(reset.profile,{runId:'new-demo-run'});wall=T+600;
 world.set(reset,'',false);close(render(),7);
});
