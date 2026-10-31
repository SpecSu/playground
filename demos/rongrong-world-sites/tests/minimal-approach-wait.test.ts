import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimalGrowth} from '../src/minimal/animal-growth.ts';
import {advanceMinimalState,createMinimalState,minimalCommand,type MinimalAnimal} from '../src/minimal/model.ts';
const T=1_793_000_000_000;
const animal=():MinimalAnimal=>({id:'wait',name:'兔兔',species:'bunny',sex:'female',size:'giant',position:{x:3,z:3},activity:'walk',target:{x:1,z:3},path:[{x:2,z:3},{x:1,z:3}],energy:40,bond:0,bornAt:T-200000,activityUntil:T});
function fixture(){const s=createMinimalState(T);s.welcomeClaimed=true;s.animals=[animal()];return s;}
test('explicit wait holds current continuous position without trade-locking growth and releases after cancellation',()=>{let s=fixture();s.animals[0].position.x=2.7;const initial={...s.animals[0].position};s=advanceMinimalState(s,T+250,[],'wait');assert.deepEqual(s.animals[0].position,initial);assert.equal(s.animals[0].activity,'idle');assert.equal(s.animals[0].target,undefined);s=advanceMinimalState(s,T+10000,[],'wait');assert.deepEqual(s.animals[0].position,initial);assert.equal(s.animals[0].energy,40);const resumed=advanceMinimalState(s,T+10250);assert.ok(resumed.animals[0].target||resumed.animals[0].activity!=='idle');});
test('merely observing with no transient waiter leaves normal routes active',()=>{const s=fixture(),next=advanceMinimalState(s,T+250);assert.notDeepEqual(next.animals[0].position,s.animals[0].position);});
test('waiting preserves an already-started graze reward once, never as repeated passive yield',()=>{let s=fixture();Object.assign(s.animals[0],{activity:'graze',activityUntil:T+1000});delete s.animals[0].target;delete s.animals[0].path;s=advanceMinimalState(s,T+500,[],'wait');assert.equal(s.animals[0].energy,40);s=advanceMinimalState(s,T+1000,[],'wait');assert.equal(s.animals[0].energy,50);s=advanceMinimalState(s,T+15000,[],'wait');assert.equal(s.animals[0].energy,50);assert.equal(s.animals[0].activity,'idle');});
test('move command forwards the waiter rather than restarting its idle roam in its second advance',()=>{const s=fixture();s.animals[0].activity='idle';delete s.animals[0].target;delete s.animals[0].path;const reply=minimalCommand(s,{type:'move',to:{x:2,z:3}},T+250,[],'wait');assert.equal(reply.accepted,true);assert.equal(reply.state.animals[0].target,undefined);});
test('a genuine reached drink completes once while waiting; no early water or repeated payout',()=>{
 let s=fixture();s.animals[0]={...animal(),species:'cow',size:'normal',position:{x:2,z:2},activity:'idle',energy:35,activityUntil:T};delete s.animals[0].target;delete s.animals[0].path;
 let now=T;for(let i=0;i<400&&s.animals[0].activity!=='drink';i++){now+=250;s=advanceMinimalState(s,now);}
 assert.equal(s.animals[0].activity,'drink');assert.ok(s.animals[0].drinkAnchor);const energy=s.animals[0].energy,deadline=s.animals[0].activityUntil,position={...s.animals[0].position};
 s=advanceMinimalState(s,deadline-1,[],'wait');assert.equal(s.animals[0].energy,energy);assert.deepEqual(s.animals[0].position,position);
 s=advanceMinimalState(s,deadline,[],'wait');assert.equal(s.animals[0].energy,Math.min(100,energy+22));
 s=advanceMinimalState(s,deadline+20000,[],'wait');assert.equal(s.animals[0].energy,Math.min(100,energy+22));assert.deepEqual(s.animals[0].position,position);
});

test('transient wait does not suppress the terrain growth bonus or serialize a lock',()=>{const s=fixture();s.animals[0].bornAt=T;s.animals[0].growth=createAnimalGrowth('wait-growth','normal');s.animals[0].growthAgeMs=0;s.terrainGrowthAt=T;const normal=advanceMinimalState(s,T+30000),waiting=advanceMinimalState(s,T+30000,[],'wait');assert.equal(waiting.animals[0].growthBonusMs,normal.animals[0].growthBonusMs);assert.equal(waiting.animals[0].growthAgeMs,normal.animals[0].growthAgeMs);assert.ok((waiting.animals[0].growthBonusMs??0)>0);assert.equal(JSON.stringify(waiting).includes('waitingAnimalId'),false);});
