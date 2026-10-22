import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout,isWalkable} from '../src/v5/layout.ts';
import {advancePlayer,findPlayerPath,playerSegmentClear} from '../src/v5/player-navigation.ts';
import {createEstate,currentProfile,commandEstate} from '../src/v5/estate.ts';

test('eight directions retain their actual continuous vector at equal speed',()=>{
 const layout=createLayout(),start={x:7,z:4};
 for(const [x,z] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
  const end=advancePlayer(layout,start,{x,z},.3);
  assert.ok(Math.abs(Math.hypot(end.x-start.x,end.z-start.z)-.3)<1e-8);
  assert.ok(Math.abs((end.x-start.x)*z-(end.z-start.z)*x)<1e-8);
 }
});
test('point walking takes clear diagonal edges without snapping a moving player backwards',()=>{
 const layout=createLayout(),from={x:6.3,z:4.3};
 const route=findPlayerPath(layout,from,{x:8,z:6});
 assert.ok(route);assert.deepEqual(route[0],{x:7,z:5});
 assert.deepEqual(route.at(-1),{x:8,z:6});
});
test('player movement stops at obstacles, deep water and world boundary without corner cutting',()=>{
 const layout=createLayout();
 assert.equal(findPlayerPath(layout,{x:4,z:4},{x:2,z:2}),null);
 assert.equal(playerSegmentClear(layout,{x:4,z:3},{x:3,z:4}),false);
 for(const [start,dir] of [[{x:0,z:6},{x:-1,z:0}],[{x:9,z:9},{x:1,z:1}],[{x:4,z:2},{x:-1,z:0}]] as const){
  const end=advancePlayer(layout,start,dir,3);
  assert.ok(playerSegmentClear(layout,start,end));
  assert.ok(isWalkable(layout,{x:Math.round(end.x),z:Math.round(end.z)}));
 }
});
test('authoritative steering expires and explicit stop cancels motion without changing identity',()=>{
 const now=100000;let s=createEstate('steer-owner',now);let p=currentProfile(s);p.tutorial='done';p.threat=null;p.position={x:7,z:4};
 const run=(type:string,extra:Record<string,unknown>,at:number)=>{const r=commandEstate(s,{id:`${type}-${at}`,type,session:currentProfile(s).session,...extra},at);assert.equal(r.accepted,true,r.message);s=r.state;};
 run('enter',{},now);run('steer',{direction:{x:1,z:1}},now+1);run('pulse',{},now+201);
 p=currentProfile(s);assert.ok(p.position.x>7&&p.position.z>4);assert.ok(Math.abs(p.position.x-7-(p.position.z-4))<1e-8);
 run('steer',{direction:{x:0,z:0}},now+202);const stop={...currentProfile(s).position};run('pulse',{},now+600);assert.deepEqual(currentProfile(s).position,stop);
 run('steer',{direction:{x:1,z:0}},now+601);run('pulse',{},now+2000);const expired={...currentProfile(s).position};run('pulse',{},now+3000);assert.deepEqual(currentProfile(s).position,expired);assert.equal(s.playerId,'steer-owner');
});
test('starting manual movement cancels a nearly complete feed before settling any charge',()=>{
 let s=createEstate('cancel-feed',100000),p=currentProfile(s);p.tutorial='done';p.threat=null;p.session='s';p.position={...p.animals[0].position};
 s=commandEstate(s,{id:'feed',type:'feed',target:p.animals[0].id,food:'milk',session:'s'},100000).state;
 p=currentProfile(s);p.job!.phase='act';p.job!.progress=2900;p.lastPulseAt=100000;
 const result=commandEstate(s,{id:'steer-cancel',type:'steer',session:'s',direction:{x:1,z:0}},100200);
 assert.equal(result.accepted,true);assert.equal(currentProfile(result.state).inventory.hand,3);assert.equal(currentProfile(result.state).job,null);assert.equal(currentProfile(result.state).animals[0].life.care.baby.feeds,0);
});
