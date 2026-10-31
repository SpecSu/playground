import test from 'node:test';import assert from 'node:assert/strict';
import {LunarLife,LunarSampleGrowth} from '../src/minimal/lunar-showcase-life.ts';
import {lunarPath,lunarSegmentSafe} from '../src/minimal/lunar-showcase-path.ts';
const open=(p:{x:number;z:number})=>p.x>=-3&&p.x<=7&&p.z>=-3&&p.z<=7;
test('bounded path uses full clearance query, goes around a barrier and never cuts its corners',()=>{
 const safe=(p:{x:number;z:number})=>open(p)&&!(p.x>-.6&&p.x<.6&&p.z<3.1);
 const path=lunarPath({x:-2,z:0},{x:2,z:0},safe);assert.ok(path.length>1);let from={x:-2,z:0};for(const p of path){assert.ok(lunarSegmentSafe(from,p,safe));from=p;}assert.deepEqual(from,{x:2,z:0});assert.deepEqual(lunarPath({x:-2,z:0},{x:0,z:0},safe),[]);
});
test('sample growth uses real age and ordinary curve, care progresses smoothly with cooldown and pause',()=>{
 const growth=new LunarSampleGrowth('yellow-long-ear');const first=growth.snapshot();assert.equal(first.stage,'baby');assert.equal(first.ageMs,0);assert.ok(first.scale<1);assert.equal(growth.care(),true);assert.equal(growth.care(),false);assert.equal(growth.snapshot().scale,first.scale);
 growth.advance(.25,true);assert.deepEqual(growth.snapshot(),{...first,pendingBonusMs:8000,canCare:false});for(let i=0;i<240;i++)growth.advance(.25,false);const juvenile=growth.snapshot();assert.ok(juvenile.ageMs>60000);assert.equal(juvenile.stage,'juvenile');assert.ok(juvenile.scale>first.scale);for(let i=0;i<300;i++)growth.advance(.25,false);assert.equal(growth.snapshot().stage,'adult');assert.equal(growth.snapshot().scale,1.2);assert.equal(growth.snapshot().ageMs,120000);
 const giant=new LunarSampleGrowth('kunkun-chicken');assert.equal(giant.snapshot().scale,2);assert.equal(giant.snapshot().stage,'adult');assert.equal(giant.care(),false);
});
test('life repeatedly explores and acts on active time with distance-matched walk phase',()=>{
 const life=new LunarLife('yellow-long-ear',0,['greet','signature']),walk={duration:1,strideMeters:.4};let position={x:0,z:0},heading=0,active=0,actions=0,moved=0;const destinations=new Set<string>();
 for(let i=0;i<2400;i++){const before={...position},frame=life.advance(.05,{position,heading,scale:1,walk,actionActive:active>0,safe:open});position=frame.position;heading=frame.heading;active=Math.max(0,active-.05);if(frame.playAction){actions++;active=1;}const distance=Math.hypot(position.x-before.x,position.z-before.z);moved+=distance;assert.ok(distance<=.4*1.6*.05+1e-8);assert.ok(Math.abs(frame.travelled-distance)<1e-8);if(distance>0)destinations.add(`${Math.round(position.x)},${Math.round(position.z)}`);}
 assert.ok(actions>=3,`recurrent actions: ${actions}`);assert.ok(moved>5,`actual distance ${moved}`);assert.ok(destinations.size>=4);
});
test('manual stop rests then resumes; hidden/carried and invalid deltas never consume life time',()=>{
 const life=new LunarLife('pink-sheep',3,['greet']),ctx={position:{x:0,z:0},heading:0,scale:1,walk:{duration:1,strideMeters:.4},actionActive:false,safe:open};life.rest(8);const initial=life.snapshot();for(const dt of [NaN,Infinity,-1,30])life.advance(dt,{...ctx,suspended:true});assert.deepEqual(life.snapshot(),initial);for(let i=0;i<100;i++)assert.equal(life.advance(.05,ctx).playAction,undefined);let resumed=false;for(let i=0;i<100;i++)if(life.advance(.05,ctx).playAction)resumed=true;assert.ok(resumed,'a new gesture starts after the manual rest');
});
test('planned movement stops before new dynamic blockage without snapping or retrying every frame',()=>{
 const life=new LunarLife('yellow-long-ear',0,['greet']),ctx={position:{x:0,z:0},heading:0,scale:1,walk:{duration:1,strideMeters:.4},actionActive:false,safe:open};life.request('greet',{x:0,z:2},0);let p={...ctx.position};for(let i=0;i<30;i++){const f=life.advance(.05,{...ctx,position:p});p=f.position;}const before={...p};for(let i=0;i<20;i++){const f=life.advance(.05,{...ctx,position:p,safe:()=>false});p=f.position;assert.equal(f.playAction,undefined);}assert.deepEqual(p,before);
});
test('court action is queued until walking to the exact stand and heading, never fires from away',()=>{
 const life=new LunarLife('kunkun-chicken',1,['dribble','shoot']),stand={x:0,z:1};life.request('shoot',stand,Math.PI);let position={x:0,z:3},heading=Math.PI,played=false;for(let i=0;i<500&&!played;i++){const f=life.advance(.05,{position,heading,scale:2,walk:{duration:1,strideMeters:.3},actionActive:false,safe:open});position=f.position;heading=f.heading;if(f.playAction){assert.equal(f.playAction,'shoot');assert.ok(Math.hypot(position.x-stand.x,position.z-stand.z)<1e-6);assert.ok(Math.abs(Math.atan2(Math.sin(heading-Math.PI),Math.cos(heading-Math.PI)))<.005);played=true;}}assert.ok(played);
});
test('individual life seeds stagger starts and choose distinct repeatable plans',()=>{
 const a=new LunarLife('yellow-long-ear',0,['greet']),b=new LunarLife('pink-sheep',3,['greet']),copy=new LunarLife('yellow-long-ear',0,['greet']);const ctx={position:{x:0,z:0},heading:0,scale:1,walk:{duration:1,strideMeters:.4},actionActive:false,safe:open};for(let i=0;i<45;i++){assert.deepEqual(a.advance(.05,ctx),copy.advance(.05,ctx));b.advance(.05,ctx);}assert.notDeepEqual(a.snapshot(),b.snapshot());
});
