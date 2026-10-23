import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,currentProfile,commandEstate,settleEstate,type Estate} from '../src/v5/estate.ts';
import {isWalkable,shelterEntries} from '../src/v5/layout.ts';
import {findActorPath} from '../src/v5/actor-navigation.ts';
import {RAID_RULES} from '../src/v5/raid-cycle.ts';

const T=1_800_000_000_000;
function fixture(){
 const state=createEstate('raid-integration-owner',T),p=currentProfile(state);
 p.tutorial='done';p.opening!.stage='done';p.threat=null;p.guardian='dog';p.session='raid-session';p.milestones.push('first-meal');
 return state;
}
function run(initial=fixture()){
 let state=initial,now=currentProfile(state).lastPulseAt,sequence=0;
 const send=(type:string,extra:Record<string,unknown>={})=>{
  const result=commandEstate(state,{id:`raid-command-${++sequence}`,type,session:currentProfile(state).session,...extra},now);
  state=result.state;return result;
 };
 return {
  get state(){return state;},get profile(){return currentProfile(state);},get now(){return now;},send,
  pulse(ms=1000,extra:Record<string,unknown>={}){now+=ms;const result=send('pulse',{presentationReady:true,presentationCovered:false,...extra});assert.equal(result.accepted,true,result.message);return currentProfile(state);},
  refresh(ms:number){now+=ms;state=JSON.parse(JSON.stringify(settleEstate(state,now))) as Estate;const result=send('enter');assert.equal(result.accepted,true,result.message);return currentProfile(state);},
 };
}
function beginWarning(h:ReturnType<typeof run>){
 h.profile.raidCycle!.remainingMs=1;
 h.pulse();assert.equal(h.profile.raidCycle!.phase,'warning');assert.equal(h.profile.raidCycle!.warningMs,RAID_RULES.warningMs);assert.equal(h.profile.threat,null);
}
function finishWarning(h:ReturnType<typeof run>){
 for(let i=0;i<11;i++)h.pulse();
 assert.equal(h.profile.raidCycle!.phase,'warning');assert.equal(h.profile.raidCycle!.warningMs,1000);assert.equal(h.profile.threat,null);
 h.pulse();assert.ok(h.profile.threat);assert.equal(h.profile.raidCycle!.phase,'active');
}

test('real pulse commands complete warning, safe evacuation and wrapping before scheduling the next natural wave',()=>{
 const h=run(),identities=h.profile.animals.map(a=>({id:a.id,name:a.name}));beginWarning(h);const eventId=h.profile.raidCycle!.pending!.id;finishWarning(h);
 assert.equal(h.profile.threat!.id,eventId);assert.equal(h.profile.threat!.mode,'reassure');assert.equal(h.profile.threat!.wolves.length,1);assert.equal(h.profile.raidCycle!.history.length,1);
 const repeated=h.send('pulse',{presentationReady:true});assert.equal(repeated.accepted,true);assert.equal(h.profile.raidCycle!.history.length,1);assert.equal(h.profile.threat!.elapsed,0);
 for(let i=0;i<360;i++){
  const event=h.profile.threat!;
  const lost=event.actors.find(a=>a.status==='lost');
  if(event.phase==='complete'&&!lost)break;
  if(lost)assert.equal(h.send('rescue',{target:lost.id,findBack:true}).accepted,true);
  h.pulse();
 }
 assert.equal(h.profile.threat!.phase,'complete');assert.ok(h.profile.threat!.actors.every(a=>a.status==='safe'));
 assert.ok(h.profile.threat!.events.some(e=>e.type==='path'));assert.ok(h.profile.threat!.events.some(e=>e.type==='entry'));assert.ok(h.profile.animals.every(a=>!a.memorial));
 assert.deepEqual(h.profile.animals.map(a=>({id:a.id,name:a.name})),identities);
 const result=h.send('endEvent');assert.equal(result.accepted,true,result.message);assert.equal(h.profile.threat,null);assert.equal(h.profile.lastThreat!.id,eventId);
 const cycle=structuredClone(h.profile.raidCycle!);assert.equal(cycle.phase,'peace');assert.equal(cycle.sequence,1);assert.equal(cycle.history.length,1);assert.ok(cycle.remainingMs>=cycle.risk.minIntervalMs);
 assert.equal(h.send('endEvent').accepted,false);assert.deepEqual(h.profile.raidCycle,cycle);
 h.pulse();assert.equal(h.profile.threat,null);assert.equal(h.profile.raidCycle!.remainingMs,cycle.remainingMs-1000);
});

test('actual herd count and rarity select one, two or three legal boundary wolves after the same full warning',()=>{
 for(const scenario of [{count:3,rare:false,wolves:1},{count:6,rare:false,wolves:2},{count:3,rare:true,wolves:3}]){
  const h=run();
  while(h.profile.animals.length<scenario.count){const result=h.send('adopt',{expectedCount:h.profile.animals.length});assert.equal(result.accepted,true,result.message);}
  if(scenario.rare)for(const a of h.profile.animals)a.husbandry!.rarity='gold';
  beginWarning(h);assert.equal(h.profile.raidCycle!.pending!.wolves,scenario.wolves);finishWarning(h);
  const p=h.profile,event=p.threat!,owned=new Set(p.layout.owned.map(q=>`${q.x},${q.z}`));
  assert.equal(event.wolves.length,scenario.wolves);assert.equal(event.actors.length,scenario.count);assert.equal(p.raidCycle!.history.length,1);
  for(const wolf of event.wolves){
   const q=wolf.spawn;assert.ok(isWalkable(p.layout,q));
   assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>!owned.has(`${q.x+x},${q.z+z}`)));
   assert.ok(shelterEntries(p.layout).some(d=>findActorPath(p.layout,q,{x:d.x,z:d.z})));
   for(const actor of [...event.actors,{position:p.position},{position:p.guardianAt}])assert.ok(Math.hypot(q.x-actor.position.x,q.z-actor.position.z)>=RAID_RULES.minSpawnDistance);
  }
  assert.equal(new Set(event.wolves.map(w=>`${w.spawn.x},${w.spawn.z}`)).size,scenario.wolves);
 }
});

test('opening care gate, unloaded scene, covered panel and background never advance the peaceful raid clock',()=>{
 const h=run();h.profile.milestones=[];h.profile.raidCycle!.remainingMs=5000;
 h.pulse();assert.equal(h.profile.raidCycle!.remainingMs,5000);h.profile.milestones.push('first-meal');
 for(const flags of [{presentationReady:false},{presentationCovered:true},{presentationPaused:true}]){h.pulse(1000,flags);assert.equal(h.profile.raidCycle!.remainingMs,5000);assert.equal(h.profile.threat,null);}
 const seed=h.profile.raidCycle!.seed,roll=h.profile.raidCycle!.rollIndex;
 h.refresh(24*3600_000);assert.equal(h.profile.raidCycle!.remainingMs,5000);assert.equal(h.profile.raidCycle!.seed,seed);assert.equal(h.profile.raidCycle!.rollIndex,roll);
 h.pulse();assert.equal(h.profile.raidCycle!.remainingMs,4000);assert.equal(h.profile.threat,null);
});

test('saved warning survives scene coverage, background and next-day re-entry without redrawing or catching up',()=>{
 const h=run();beginWarning(h);h.pulse();const warning=structuredClone(h.profile.raidCycle!);
 for(const flags of [{presentationReady:false},{presentationCovered:true},{presentationPaused:true}]){h.pulse(1000,flags);assert.equal(h.profile.raidCycle!.warningMs,warning.warningMs);assert.equal(h.profile.threat,null);}
 h.refresh(24*3600_000);assert.equal(h.profile.raidCycle!.warningMs,warning.warningMs);assert.deepEqual(h.profile.raidCycle!.pending,warning.pending);assert.equal(h.profile.threat,null);
 h.pulse(8000);assert.equal(h.profile.raidCycle!.warningMs,warning.warningMs);assert.equal(h.profile.threat,null);
 h.pulse();assert.equal(h.profile.raidCycle!.warningMs,warning.warningMs-1000);
 for(let i=0;i<10;i++)h.pulse();assert.equal(h.profile.threat!.id,warning.pending!.id);assert.equal(h.profile.raidCycle!.history.length,1);
});

test('launched natural event preserves positions and rescue clocks during unloaded, covered, background and offline intervals',()=>{
 const h=run();beginWarning(h);finishWarning(h);h.pulse();
 const before=structuredClone(h.profile.threat!),online=h.profile.onlineMs;
 for(const flags of [{presentationReady:false},{presentationCovered:true},{presentationPaused:true}]){h.pulse(1000,flags);assert.deepEqual(h.profile.threat,before);assert.equal(h.profile.onlineMs,online);}
 h.refresh(180_000);assert.deepEqual(h.profile.threat,before);assert.equal(h.profile.onlineMs,online);
 h.pulse(8000);assert.deepEqual(h.profile.threat,before);h.pulse(500);assert.ok(Math.abs(h.profile.threat!.elapsed-before.elapsed-.5)<1e-8);assert.equal(h.profile.raidCycle!.history.length,1);
});

test('a real natural boundary rescue pauses its 180-second window offline and a missed window keeps free recovery',()=>{
 const state=fixture(),p=currentProfile(state);p.guardian='frog';p.guardianAt={x:10,z:0};p.guardianBehavior='station';p.guardianTarget={x:10,z:0};
 p.layout.buildings.find(b=>b.kind==='shelter')!.capacity=1;p.animals.forEach((a,i)=>{a.position={x:0,z:4+i};});
 const h=run(state);beginWarning(h);finishWarning(h);
 for(let i=0;i<90&&!h.profile.threat!.actors.some(a=>a.status==='boundary');i++)h.pulse();
 const caught=h.profile.threat!.actors.find(a=>a.status==='boundary');assert.ok(caught,'actual wolf movement, windup and carry must reach the boundary');
 const id=caught.id,remaining=caught.rescueRemaining!,before=structuredClone(h.profile.threat!);
 for(const flags of [{presentationReady:false},{presentationCovered:true},{presentationPaused:true}]){h.pulse(1000,flags);assert.deepEqual(h.profile.threat,before);}
 h.refresh(180_000);assert.deepEqual(h.profile.threat,before);
 h.pulse();assert.ok(Math.abs(h.profile.threat!.actors.find(a=>a.id===id)!.rescueRemaining!-remaining+1)<1e-8);
 for(let i=0;i<181&&h.profile.threat!.actors.find(a=>a.id===id)!.status!=='lost';i++)h.pulse();
 assert.equal(h.profile.threat!.actors.find(a=>a.id===id)!.status,'lost');assert.ok(h.profile.animals.find(a=>a.id===id));assert.ok(h.profile.animals.every(a=>!a.memorial));
 const earlyEnd=h.send('endEvent');assert.equal(earlyEnd.accepted,false);
 assert.equal(h.send('rescue',{target:id,findBack:true}).accepted,true);h.pulse();
 assert.notEqual(h.profile.threat!.actors.find(a=>a.id===id)!.status,'lost');assert.ok(h.profile.threat!.events.some(e=>e.type==='find-back'&&e.actorId===id));assert.ok(h.profile.animals.every(a=>!a.memorial));
});

test('paid guardian and gate levels are captured by the next natural event and cannot change mid-raid',()=>{
 const h=run();h.profile.materials=200;h.profile.guardian='frog';
 for(const level of [1,2]){
  const guardian=h.send('upgradeGuardian',{guardian:'frog',expectedLevel:level});assert.equal(guardian.accepted,true,guardian.message);
  const gate=h.send('upgradeShelter',{buildingId:'initial-shelter',expectedLevel:level});assert.equal(gate.accepted,true,gate.message);
 }
 assert.equal(h.profile.materials,80);beginWarning(h);finishWarning(h);
 assert.deepEqual(h.profile.threat!.upgrades,{guardianLevel:3,shelterLevels:{'initial-shelter':3}});
 assert.equal(h.profile.layout.buildings.find(b=>b.id==='initial-shelter')!.capacity,6);
 const calm=h.send('guardianCommand',{command:{kind:'calm'}});assert.equal(calm.accepted,true,calm.message);
 assert.equal(h.profile.threat!.guardian!.abilityUntil-h.profile.threat!.elapsed,18);
 const snapshot=structuredClone(h.profile.threat!.upgrades);
 assert.equal(h.send('upgradeGuardian',{guardian:'dog',expectedLevel:1}).accepted,false);
 assert.equal(h.send('upgradeShelter',{buildingId:'initial-shelter',expectedLevel:3}).accepted,false);
 assert.equal(h.profile.materials,80);assert.deepEqual(h.profile.threat!.upgrades,snapshot);
 h.profile.upgrades!.guardians.frog=1;h.profile.upgrades!.shelters['initial-shelter']=1;
 h.pulse();assert.deepEqual(h.profile.threat!.upgrades,snapshot);
});

test('a warning with no legal sheltered boundary route postpones safely without recording a fabricated attack',()=>{
 const h=run();h.profile.layout.buildings=h.profile.layout.buildings.filter(b=>b.kind!=='shelter');
 beginWarning(h);for(let i=0;i<12;i++)h.pulse();
 assert.equal(h.profile.threat,null);assert.equal(h.profile.raidCycle!.phase,'peace');assert.equal(h.profile.raidCycle!.history.length,0);assert.equal(h.profile.raidCycle!.sequence,1);
 assert.match(h.profile.notice,/推迟/);assert.ok(h.profile.animals.every(a=>!a.memorial));
});
