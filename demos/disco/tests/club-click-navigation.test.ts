import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { isManualWalkable } from '../lib/club-manual-motion.ts';
import { MOVEMENT_PEER_RADIUS, MOVEMENT_SPEED_LIMIT } from '../lib/room-movement.ts';
const uv=(u:number,v:number)=>({x:(u+v)*Math.SQRT1_2,z:(v-u)*Math.SQRT1_2});
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
async function navigation(){assert.ok(existsSync(new URL('../lib/club-click-navigation.ts',import.meta.url)),'click navigation exists');return import('../lib/club-click-navigation.ts');}
test('click walking reaches its destination with capped steps and parks without overshoot',async()=>{
 const {ClickNavigation}=await navigation();const nav=new ClickNavigation(uv(3,4));let point=uv(-3,4);
 for(let frame=0;frame<500&&nav.active;frame++){const before=point;point=nav.step(point,.025,[]);assert.ok(distance(point,before)<=MOVEMENT_SPEED_LIMIT*.025+1e-8);assert.ok(isManualWalkable(point));}
 assert.equal(nav.active,false);assert.ok(distance(point,uv(3,4))<=.12);assert.deepEqual(nav.step(point,.1,[]),point);
});
test('both directions route around the DJ booth rather than cutting through it',async()=>{
 const {ClickNavigation}=await navigation();for(const sign of [-1,1]){let point=uv(-3*sign,0);const destination=uv(3*sign,0),nav=new ClickNavigation(destination);
 for(let frame=0;frame<800&&nav.active;frame++){const before=point;point=nav.step(point,.025,[]);assert.ok(isManualWalkable(point));assert.ok(distance(point,before)<=MOVEMENT_SPEED_LIMIT*.025+1e-8);}
 assert.ok(distance(point,destination)<=.12);assert.equal(nav.active,false);}
});
test('a directly parked blocker gets a bounded detour without penetration',async()=>{
 const {ClickNavigation}=await navigation();const blocker=uv(0,4),destination=uv(3,4),nav=new ClickNavigation(destination);let point=uv(-3,4);
 for(let frame=0;frame<900&&nav.active;frame++){const before=point;point=nav.step(point,.025,[blocker]);assert.ok(distance(point,blocker)>=MOVEMENT_PEER_RADIUS*2+.025-1e-5);assert.ok(distance(before,point)<=MOVEMENT_SPEED_LIMIT*.025+1e-8);}
 assert.ok(distance(point,destination)<=.12,`remaining ${distance(point,destination)}`);assert.equal(nav.active,false);
});
test('occupied targets retain separate foot centers and previously jammed crowds are traversable',async()=>{
 const {ClickNavigation}=await navigation();const target=uv(0,4),nav=new ClickNavigation(target);let point=uv(-3,4);
 for(let i=0;i<900&&nav.active;i++)point=nav.step(point,.025,[target]);
 assert.equal(nav.active,false);assert.ok(distance(point,target)>=MOVEMENT_PEER_RADIUS*2+.025-1e-5);assert.ok(distance(point,target)<MOVEMENT_PEER_RADIUS*2+.4);
 const blocked=new ClickNavigation(uv(3,4));point=uv(-3,4);const blockers=Array.from({length:9},(_,i)=>({x:point.x+Math.sin(i/9*Math.PI*2)*2.65,z:point.z+Math.cos(i/9*Math.PI*2)*2.65}));
 for(let i=0;i<1300&&blocked.active;i++)point=blocked.step(point,.025,blockers);
 assert.equal(blocked.active,false);assert.ok(isManualWalkable(point));assert.ok(distance(point,uv(3,4))<=.12,'walks out of the former body-wall crowd');
});
test('invalid targets reject and large or nonfinite frame times cannot teleport',async()=>{
 const {ClickNavigation}=await navigation();for(const target of [{x:Infinity,z:0},uv(50,50),uv(0,0)])assert.equal(new ClickNavigation(target).active,false);
 const nav=new ClickNavigation(uv(3,4)),start=uv(-3,4);assert.deepEqual(nav.step(start,NaN,[]),start);assert.ok(distance(start,nav.step(start,1000,[]))<=MOVEMENT_SPEED_LIMIT*.1+1e-8);
});
