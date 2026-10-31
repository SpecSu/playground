import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFarm,applyCommand,snapshot} from '../src/model.ts';

const T = 1_800_000_000_000;
let seq=0;
const cmd=(type:string,extra:Record<string,unknown>={})=>({id:`test-${++seq}`,type,...extra});
function act(state:ReturnType<typeof createFarm>,at:number,action='dance',target='all') { return applyCommand(state,cmd('act',{action,target}),at); }

test('new device initializes three independent sheep with stable preferences and no invented memories',()=>{
 const s=createFarm('device-a',T); assert.equal(s.playerId,'device-a'); assert.equal(s.animals.length,3);
 assert.deepEqual(s.animals.map((a)=>a.personality),['eager','shy','independent']);
 assert.ok(s.animals.every((a)=>a.bond===0&&a.experiences.length===0)); assert.equal(snapshot(s,T).woolReady,0);
});
test('the same action yields fast following, delayed micro response, and an independent remix',()=>{
 const r=act(createFarm('a',T),T); const [a,b,c]=r.event!.reactions;
 assert.ok(a.delayMs<b.delayMs); assert.ok(b.micro==='ear'); assert.ok(a.distance<b.distance);
 assert.equal(a.style,'copy'); assert.equal(c.style,'remix'); assert.equal(c.action,'dance');
});
test('rapid clicks and repetition do not farm progress while reactions remain visible',()=>{
 const first=act(createFarm('a',T),T); const rapid=act(first.state,T+100);
 assert.equal(rapid.accepted,false); assert.equal(rapid.state.animals[0].bond,first.state.animals[0].bond);
 const repeated=act(first.state,T+6500); assert.equal(repeated.accepted,true); assert.equal(repeated.event!.reactions[0].progressed,false);
 assert.equal(repeated.state.animals[0].habits.dance!.count,1);
});
test('spaced observation becomes imitation then a saved invitation on a real later visit',()=>{
 let s=createFarm('a',T); for(let i=0;i<3;i++)s=act(s,T+i*13_000).state;
 assert.equal(s.animals[0].habits.dance!.stage,'invite');
 const persisted=JSON.parse(JSON.stringify(s)); const r=applyCommand(persisted,cmd('visit'),T+40_000);
 assert.equal(r.event!.kind,'welcome'); assert.equal(r.event!.reactions[0].action,'dance');
 assert.equal(r.event!.reactions[0].source,'memory'); assert.equal(r.state.animals[2].personality,'independent');
});
test('targeted learning changes only that sheep and avatar switching preserves identity and relationships',()=>{
 const a=act(createFarm('a',T),T,'bounce','momo').state;
 assert.equal(a.animals[0].bond,0); assert.ok(a.animals[1].bond>0);
 const b=applyCommand(a,cmd('avatar',{avatar:'banana-cat'}),T+8000).state;
 assert.equal(b.playerId,a.playerId); assert.deepEqual(b.animals,a.animals); assert.equal(b.avatar,'banana-cat');
});
test('starlit wool requires rhythm habit plus shared event; appearance is reversible without losing the animal',()=>{
 let s=createFarm('a',T); for(let i=0;i<3;i++)s=act(s,T+i*13_000).state;
 assert.equal(s.animals[0].growthEligible,false);
 s=applyCommand(s,cmd('rhythm'),T+45_000).state; assert.equal(s.animals[0].growthEligible,true);
 const a=applyCommand(s,cmd('appearance',{target:'pipi',appearance:'starlit'}),T+50_000).state;
 assert.equal(a.animals[0].appearance,'starlit');
 const b=applyCommand(a,cmd('appearance',{target:'pipi',appearance:'plain'}),T+50_001).state;
 assert.equal(b.animals[0].appearance,'plain'); assert.equal(b.animals[0].name,a.animals[0].name); assert.equal(b.animals[0].bond,a.animals[0].bond);
});
test('offline wool has a finite cap, no relationship decay and repeated collection or purchase is harmless',()=>{
 let s=act(createFarm('a',T),T).state; const before=s.animals[0].bond;
 assert.equal(snapshot(s,T+7*86400_000).woolReady,12);
 s=applyCommand(s,cmd('claim'),T+7*86400_000).state; assert.equal(s.wool,12); assert.equal(s.animals[0].bond,before);
 s=applyCommand(s,cmd('claim'),T+7*86400_000).state; assert.equal(s.wool,12);
 s=applyCommand(s,cmd('buy'),T+7*86400_000).state; assert.equal(s.stage,true); assert.equal(s.wool,4);
 s=applyCommand(s,cmd('buy'),T+7*86400_000).state; assert.equal(s.wool,4);
 assert.equal(applyCommand(s,cmd('stagePlay'),T+7*86400_000+10_000).event!.kind,'stage');
});
test('demo next visit is labeled and never invents a learned greeting for a new farm',()=>{
 const r=applyCommand(createFarm('a',T),cmd('nextVisit'),T+100);
 assert.equal(r.state.demoMode,true); assert.equal(r.event!.reactions.length,0); assert.equal(snapshot(r.state,T+100).woolReady,12);
});
test('unknown actions, invalid targets and insufficient wool cannot mutate a farm',()=>{
 const s=createFarm('a',T);
 for(const c of [cmd('act',{action:'wave',target:'all'}),cmd('act',{action:'dance',target:'missing'}),cmd('buy'),cmd('appearance',{target:'pipi',appearance:'starlit'})]) {
 const r=applyCommand(s,c,T); assert.equal(r.accepted,false); assert.deepEqual(r.state,s);
 }
});
