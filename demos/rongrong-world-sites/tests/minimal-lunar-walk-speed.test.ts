import test from 'node:test';import assert from 'node:assert/strict';
import {LunarLife} from '../src/minimal/lunar-showcase-life.ts';
import {LUNAR_SHOWCASE_CATALOG} from '../src/minimal/lunar-showcase-catalog.ts';
test('all five adult walks cover distance 1.6 times faster with their measured stride unchanged',()=>{
 for(const r of LUNAR_SHOWCASE_CATALOG){const walk=r.profile.walk!,scale=r.id==='kunkun-chicken'?2:r.id==='floral-vest-person'?3:1.2,life=new LunarLife(r.id,0,['greet']);life.request('greet',{x:0,z:6},0);let p={x:0,z:0},maximum=0;
  for(let i=0;i<180;i++){const frame=life.advance(.01,{position:p,heading:0,scale,walk,actionActive:false,safe:()=>true});maximum=Math.max(maximum,frame.travelled/.01);p=frame.position;}
  assert.ok(Math.abs(maximum-walk.strideMeters*scale/walk.duration*1.6)<1e-7,`${r.id} actual speed ${maximum}`);
 }
});
test('turning cadence scales with translation while stop cooldown remains ten real active seconds',()=>{
 const life=new LunarLife('floral-vest-person',0,['greet']);life.request('greet',{x:2,z:0},Math.PI/2);const ctx={position:{x:0,z:0},heading:0,scale:3,walk:{duration:1,strideMeters:.16785985714261667},actionActive:false,safe:()=>true};const frame=life.advance(.01,ctx);assert.ok(Math.abs(frame.turnRadians-.01*1.7*1.6)<1e-9);assert.equal(frame.travelled,0);
 life.rest(10);for(let i=0;i<90;i++)life.advance(.1,ctx);assert.ok(Math.abs(life.snapshot().wait-1)<1e-9);life.advance(.1,{...ctx,suspended:true});assert.ok(Math.abs(life.snapshot().wait-1)<1e-9);
});
