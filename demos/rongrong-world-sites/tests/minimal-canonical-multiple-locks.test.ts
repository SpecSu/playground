import test from 'node:test';
import assert from 'node:assert/strict';
import {CanonicalPresentationTimeline,projectCanonicalState} from '../src/minimal/canonical-timeline.ts';
import {createMinimalState,type MinimalAnimal} from '../src/minimal/model.ts';
const T=1_800_000_000_000;
function fixture(){const state=createMinimalState(T);state.animals=[{id:'wished',position:{x:1,z:2}},{id:'boarded',position:{x:3,z:1}},{id:'free',position:{x:2,z:3}}].map(({id,position}):MinimalAnimal=>({id,position,name:id,species:'pig',sex:'female',size:'normal',bornAt:T-180_000,growthAgeMs:60_000,activity:'idle',activityUntil:T,energy:60,bond:0}));return state;}
const pose=(a:MinimalAnimal)=>({position:a.position,activity:a.activity,path:a.path,energy:a.energy,bond:a.bond,activityUntil:a.activityUntil});

test('canonical catch-up freezes both wishing and boarding animals without freezing the free companion',()=>{
 const state=fixture(),before=structuredClone(state);const projected=projectCanonicalState(state,T+30_000,['wished','boarded']);
 assert.deepEqual(pose(projected.animals[0]),pose(before.animals[0]));assert.deepEqual(pose(projected.animals[1]),pose(before.animals[1]));assert.notDeepEqual(pose(projected.animals[2]),pose(before.animals[2]));assert.deepEqual(state,before);
});

test('live and offline presentation retain a snapshot of all locks across partial ticks and caller mutation',()=>{
 const state=fixture(),locks=['wished','boarded'],timeline=new CanonicalPresentationTimeline(state,locks);locks.length=0;
 for(const elapsed of [250,2250,30_000,180_000,181_000]){const value=timeline.at(T+elapsed);for(const index of [0,1])assert.deepEqual(pose(value.animals[index]),pose(state.animals[index]),`${state.animals[index].id} stays locked at ${elapsed}`);}
});

test('the existing single wishing-id contract is identical to a one-item lock list',()=>{
 const state=fixture();for(const elapsed of [0,250,2000,120_000,300_000])assert.deepEqual(projectCanonicalState(state,T+elapsed,'wished'),projectCanonicalState(state,T+elapsed,['wished']));
});
