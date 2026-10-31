import test from 'node:test';
import assert from 'node:assert/strict';
import * as timeline from '../src/minimal/canonical-timeline.ts';
import {advanceMinimalState,createMinimalState,type MinimalState} from '../src/minimal/model.ts';
import {createCreativeAnimal} from '../src/minimal/creative-lifecycle.ts';
const T=1_800_000_000_000;
function fixture():MinimalState{
 const state=createMinimalState(T);state.welcomeClaimed=true;
 state.animals.push(createCreativeAnimal({id:'poop_live',kind:'custom-creature',templateId:'poop-pal',name:'布丁',prompt:'',createdAt:T-180_000,hatchedAt:T-180_000,jobId:'job',origin:'mock',location:'ground',position:{x:1,z:2}})!);
 return state;
}
function create(state=fixture(),locked:string|null=null){
 assert.equal(typeof timeline.CanonicalPresentationTimeline,'function','continuous presentation needs complete-tick checkpoints, not a repeatedly capped original snapshot');
 return new timeline.CanonicalPresentationTimeline(state,locked);
}
test('cached live samples match the original canonical projection exactly throughout its first 120 seconds',()=>{
 const state=fixture(),source=structuredClone(state),clock=create(state);
 for(let elapsed=0;elapsed<=120_000;elapsed+=250){
  const actual=clock.at(T+elapsed);
  assert.deepEqual(actual,timeline.projectCanonicalState(state,T+elapsed,null),`same canonical boundaries at ${elapsed}ms`);
 }
 assert.deepEqual(state,source,'checkpoints never mutate the supplied canonical farm');
});
test('continuously sampled display-only animals keep roaming beyond 120 seconds',()=>{
 const state=fixture(),clock=create(state),latePositions=new Set<string>();let actual=state;
 for(let elapsed=250;elapsed<=180_000;elapsed+=250){actual=clock.at(T+elapsed);if(elapsed>=150_000)latePositions.add(JSON.stringify(actual.animals[0].position));}
 let expected=structuredClone(state);for(let elapsed=2000;elapsed<=180_000;elapsed+=2000)expected=advanceMinimalState(expected,T+elapsed);
 assert.deepEqual(actual,expected,'only complete 2-second ticks become checkpoints');
 assert.ok(latePositions.size>10,'live companions must not remain frozen at the offline catch-up cap');
});
test('partial samples, output mutation and a backwards clock cannot alter the retained timeline',()=>{
 const state=fixture(),clock=create(state),first=clock.at(T+2250),saved=structuredClone(first);
 first.animals[0].position.x=-100;first.player.x=-100;
 assert.deepEqual(clock.at(T+1000),saved,'a regressed timestamp cannot rewind the displayed state');
 assert.deepEqual(clock.at(T+4000),timeline.projectCanonicalState(state,T+4000,null),'partial and returned states never become the checkpoint');
});
test('first connection after a long offline gap uses the exact bounded authority settlement then resumes live ticks',()=>{
 const state=fixture(),clock=create(state),at=T+86_400_000,settled=timeline.projectCanonicalState(state,at,null);
 assert.deepEqual(clock.at(at),settled,'offline settlement must preserve the existing 120-second simulation budget');
 let actual=settled;for(let elapsed=250;elapsed<=10_000;elapsed+=250)actual=clock.at(at+elapsed);
 assert.deepEqual(actual,timeline.projectCanonicalState(settled,at+10_000,null));
 assert.ok(actual.animals[0].path?.length,'settled idle companion resumes normal autonomous choices after its pause');
});
test('a later hidden/offline gap settles from the complete checkpoint, not the last partial display',()=>{
 const state=fixture(),clock=create(state);clock.at(T+5250);
 const at=T+300_000,checkpoint=timeline.projectCanonicalState(state,T+4000,null);
 assert.deepEqual(clock.at(at),timeline.projectCanonicalState(checkpoint,at,null));
});
test('escrow-locked animals remain frozen in continuous live speculation too',()=>{
 const state=fixture(),clock=create(state,state.animals[0].id),position=structuredClone(state.animals[0].position);
 for(let elapsed=250;elapsed<=180_000;elapsed+=250)assert.deepEqual(clock.at(T+elapsed).animals[0].position,position);
});
