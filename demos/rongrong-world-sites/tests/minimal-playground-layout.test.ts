import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHOOL_PLAYGROUND_LAYOUT as L,capsulePoint,laneDistance} from '../src/minimal/playground-layout.ts';
import {PlaygroundFormation} from '../src/minimal/playground-formation.ts';
const close=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
test('actual campus exceeds old20m square and its closed capsule is tangent-continuous at every seam',()=>{
 assert.equal(L.ground.maxX-L.ground.minX,32);assert.equal(L.ground.maxZ-L.ground.minZ,24);
 for(const s of [0,12,12+Math.PI*6,24+Math.PI*6,L.path.length])for(const offset of [-.7,0,.7]){const a=capsulePoint(s-1e-6,offset),b=capsulePoint(s+1e-6,offset);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<3e-6);assert.ok(Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))<1e-6);}
 for(const s of [-200,-1,0,1,200]){const a=capsulePoint(s),b=capsulePoint(s+L.path.length);close(a.x,b.x);close(a.z,b.z);}
});
test('eight instances retain two columns/four rows, body envelope and pair clearance throughout entire lap',()=>{
 const f=new PlaygroundFormation({duration:.6,strideMeters:.447922105349431});let smallest=Infinity;
 for(let k=0;k<6000;k++){f.tick(.05);const rows=f.snapshot();assert.equal(rows.length,8);assert.equal(new Set(rows.map(r=>r.instanceId)).size,8);for(const a of rows){assert.equal(a.templateId,'red-scarf-person');assert.ok(a.x>=L.ground.minX+L.runnerRadius&&a.x<=L.ground.maxX-L.runnerRadius);assert.ok(a.z>=L.ground.minZ+L.runnerRadius&&a.z<=L.ground.maxZ-L.runnerRadius);const center=capsulePoint(a.progress);close(Math.hypot(a.x-center.x,a.z-center.z),.7);for(const b of rows)if(b.instanceId!==a.instanceId)smallest=Math.min(smallest,Math.hypot(a.x-b.x,a.z-b.z)-2*L.runnerRadius);}}
 assert.ok(smallest>=.45,`skin-envelope clearance ${smallest}`);
});
test('run clip time follows each actual lane distance, not a fixed loop that slides round the bend',()=>{
 const f=new PlaygroundFormation({duration:.6,strideMeters:.447922105349431});const before=f.snapshot();for(let i=0;i<240;i++)f.tick(.1);const after=f.snapshot();for(let i=0;i<8;i++){const a=after[i],b=before[i];close(a.runTime*.447922105349431/.6-b.runTime*.447922105349431/.6,laneDistance(a.progress,a.lateral)-laneDistance(b.progress,b.lateral));}assert.notEqual(after[0].runTime,after[1].runTime);
 close(laneDistance(L.path.length,.7),L.path.length+Math.PI*2*.7);close(laneDistance(-L.path.length,.7),-L.path.length-Math.PI*2*.7);
});
test('paused, invalid and oversized ticks cannot catch up or revive a disposed formation',()=>{
 const f=new PlaygroundFormation({duration:.6,strideMeters:.45});f.tick(.1);f.setPaused(true);const p=f.snapshot();for(const dt of [60,NaN,Infinity,-1,.25])f.tick(dt);assert.deepEqual(f.snapshot(),p);f.setPaused(false);f.tick(60);assert.deepEqual(f.snapshot(),p);f.tick(.1);assert.notDeepEqual(f.snapshot(),p);f.dispose();const end=f.snapshot();f.tick(.2);f.setPaused(false);assert.deepEqual(f.snapshot(),end);
 assert.throws(()=>new PlaygroundFormation({duration:0,strideMeters:.4}));assert.throws(()=>capsulePoint(NaN));assert.throws(()=>capsulePoint(0,10));
});
test('several complete laps keep unwrapped animation time continuous rather than resetting on the track seam',()=>{const f=new PlaygroundFormation({duration:.6,strideMeters:.447922105349431});let old=f.snapshot();for(let i=0;i<6000;i++){f.tick(.05);const next=f.snapshot();for(let j=0;j<8;j++){assert.ok(next[j].runTime>old[j].runTime);assert.ok(next[j].runTime-old[j].runTime<.057);assert.ok(Math.hypot(next[j].x-old[j].x,next[j].z-old[j].z)<.043);assert.ok(Math.abs(next[j].lateral)+L.runnerRadius<1.4);}old=next;}assert.ok(old[0].progress>L.path.length*3);});
