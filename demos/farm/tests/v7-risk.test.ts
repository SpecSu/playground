import {test} from 'node:test';
import assert from 'node:assert/strict';
import {raidRisk,createRaidCycle,advanceRaidCycle,RAID_RULES} from '../src/v5/raid-cycle.ts';
import {createThreat,stepThreat} from '../src/v5/threat.ts';
import {createLayout} from '../src/v5/layout.ts';
import {beginV7Raid,observeV7Raid,recoverySummary,canRecoverV7,type V7Recovery,type V7RaidLoss,type RecoveryKind} from '../src/v5/v7-risk.ts';
const event=(band:'low'|'medium'|'high'='low')=>createThreat({id:'natural-risk',seed:1,mode:'reassure',actors:[{id:'a',position:{x:8,z:4}}],wolfSpawns:[{x:11,z:0}],pressureBand:band},createLayout());
test('risk derives rarity pressure, exact bands and intervals; warning remains 12 online seconds',()=>{
 assert.deepEqual(raidRisk([{id:'a',rarity:3},{id:'b',rarity:5}]),{count:2,rarityLoad:6,pressure:6.5,band:'medium',wolves:2,minIntervalMs:300000,maxIntervalMs:540000});
 assert.equal(raidRisk([{id:'a',rarity:5},{id:'b',rarity:5},{id:'c',rarity:5},{id:'d',rarity:1}]).band,'high');
 const c=createRaidCycle(1,0,0);const warning=advanceRaidCycle(c,{now:99999999,onlineMs:c.intervalMs,herd:[{id:'a',rarity:1}],eligible:true,paused:false,eventActive:false});assert.equal(warning.cycle.warningMs,RAID_RULES.warningMs);assert.equal(warning.launch,null);
 assert.equal(advanceRaidCycle(warning.cycle,{now:999999999,onlineMs:c.intervalMs,herd:[{id:'a',rarity:1}],eligible:true,paused:true,eventActive:false}).cycle.warningMs,12000);
});
test('pressure changes actual wolf path speed and actual damage windup without changing old/tutorial events',()=>{
 const l=createLayout();const travel=(band:'low'|'medium'|'high')=>{let s=event(band);s.discoveredAt=0;s.actors[0].departAt=null;s=stepThreat(s,l,{dt:1});return Math.hypot(s.wolves[0].position.x-11,s.wolves[0].position.z);};
 assert.ok(travel('high')>travel('medium'));assert.ok(travel('medium')>travel('low'));
 for(const [band,seconds] of [['low',2],['medium',1.8],['high',1.5]] as const){let s=event(band);s.discoveredAt=0;s.wolves[0].position={x:8,z:4};s.wolves[0].status='windup';s.wolves[0].targetActorId='a';s=stepThreat(s,l,{dt:seconds-.05});assert.equal(s.actors[0].injuredAt,null);s=stepThreat(s,l,{dt:.1});assert.notEqual(s.actors[0].injuredAt,null);}
});
const profile=()=>({id:'home' as const,onlineMs:0,materials:32,animals:[{id:'a'}],production:{slots:[{animalId:'a'}],pending:[{id:'opening-a',animalId:'a',tier:'white',amount:11,version:'v7',source:'production',cycle:1}]},v7:{productionFeed:8,recovery:{} as Record<string,V7Recovery>,raidLosses:{} as Record<string,V7RaidLoss>,recoveryReceipts:{} as Record<string,RecoveryKind>},economy:{wool:{white:90}}});
test('only opening exposed producer lots lose at most floor20%, never warehouse or new lots, with event/lot idempotence',()=>{
 const p=profile(),s=event();beginV7Raid(p,s);p.production.pending.push({id:'late-a',animalId:'a',tier:'white',amount:40,version:'v7',source:'production',cycle:2});s.wolves[0].position={x:8,z:4};observeV7Raid(p,s);assert.equal(p.production.pending[0].amount,9);assert.equal(p.production.pending[1].amount,40);assert.equal(p.economy.wool.white,90);observeV7Raid(p,s);beginV7Raid(p,s);observeV7Raid(p,s);assert.equal(p.production.pending[0].amount,9);
});
test('safe producer, tutorial and rehearsal do not create loot; injury/loss create persistent costed recovery',()=>{
 const p=profile(),s=event();s.actors[0].status='safe';s.wolves[0].position={x:8,z:4};beginV7Raid(p,s);observeV7Raid(p,s);assert.equal(p.production.pending[0].amount,11);
 s.actors[0].status='waiting';s.actors[0].injuredAt=1;observeV7Raid(p,s);assert.equal(recoverySummary(p)[0].remainingOnlineMs,3000);assert.equal(canRecoverV7(p,'a').ok,true);
 p.materials=0;assert.equal(canRecoverV7(p,'a').ok,false);
 const q=profile(),tutorial={...event(),mode:'tutorial' as const};beginV7Raid(q,tutorial);observeV7Raid(q,tutorial);assert.deepEqual(q.v7.raidLosses,{});
});
test('V7 lost recovery cannot bypass paid authorization; old saved events remain compatible',()=>{
 const l=createLayout(),s=event();s.actors[0].status='lost';s.actors[0].rescuePoint={x:8,z:4};s.phase='complete';
 const refused=stepThreat(s,l,{dt:4,findBackActorId:'a',playerPosition:{x:8,z:4}});assert.equal(refused.actors[0].status,'lost');
 const restored=stepThreat(s,l,{dt:.05,findBackActorId:'a',recoveryAuthorizedActorId:'a',playerPosition:{x:8,z:4}});assert.notEqual(restored.actors[0].status,'lost');assert.ok(restored.actors[0].careCompletedAt!==undefined);
 delete s.pressureBand;assert.notEqual(stepThreat(s,l,{dt:.05,findBackActorId:'a'}).actors[0].status,'lost');
});
test('paid carried rescue releases at actual position, and completed care removes injury speed penalty',()=>{
 const l=createLayout();let s=event();s.discoveredAt=0;s.actors[0].injuredAt=0;s.actors[0].status='carried';s.wolves[0].position={x:8,z:4};s.wolves[0].status='carrying';s.wolves[0].targetActorId='a';
 s=stepThreat(s,l,{dt:.05,recoveryAuthorizedActorId:'a'});assert.equal(s.actors[0].status,'evacuating');assert.ok(s.actors[0].careCompletedAt!==undefined);assert.notEqual(s.wolves[0].status,'carrying');
});
test('event/lot ledger handles fractional caps, distant animals, completed retries and independent animals',()=>{
 const p=profile(),s=event();p.production.pending[0].amount=4;beginV7Raid(p,s);s.wolves[0].position={x:8,z:4};observeV7Raid(p,s);assert.equal(p.production.pending[0].amount,4);
 const q=profile(),distant=event();beginV7Raid(q,distant);observeV7Raid(q,distant);assert.equal(q.production.pending[0].amount,11);
 distant.actors[0].injuredAt=1;distant.actors[0].status='safe';observeV7Raid(q,distant);assert.equal(q.production.pending[0].amount,9);
 distant.phase='complete';observeV7Raid(q,distant);const saved=JSON.stringify(q);observeV7Raid(q,distant);beginV7Raid(q,distant);assert.equal(JSON.stringify(q),saved);
});
test('recovery receipts survive stale observations and only a later loss upgrades injury care',()=>{
 const p=profile(),s=event();s.actors[0].injuredAt=1;observeV7Raid(p,s);p.v7.recoveryReceipts={'natural-risk:a':'injury'};delete p.v7.recovery.a;observeV7Raid(p,s);assert.deepEqual(recoverySummary(p),[]);
 s.actors[0].status='lost';observeV7Raid(p,s);assert.equal(recoverySummary(p)[0].kind,'lost');assert.deepEqual(recoverySummary(p)[0].cost,{coins:16,productionFeed:4});
});
test('saved old threats, tutorials and rehearsals retain speed one and two second windup',()=>{
 const l=createLayout();for(const mode of ['tutorial','rehearsal','reassure'] as const){let s=createThreat({id:'old',seed:1,mode,actors:[{id:'a',position:{x:8,z:4}}],wolfSpawns:[{x:11,z:0}],...(mode==='reassure'?{}:{pressureBand:'high' as const})},l);s.discoveredAt=0;s.phase='active';s=stepThreat(s,l,{dt:1});assert.equal(s.pressureBand,undefined);assert.equal(Math.hypot(s.wolves[0].position.x-11,s.wolves[0].position.z),1);}
});
test('per-animal loot never transfers another producer lots and paused simulation causes no loss',()=>{
 const p=profile(),s=event();p.animals.push({id:'b'});p.production.pending.push({id:'opening-b',animalId:'b',tier:'white',amount:20,version:'v7',source:'production',cycle:1});s.actors.push({...structuredClone(s.actors[0]),id:'b',position:{x:3,z:4}});beginV7Raid(p,s);
 const paused=stepThreat(s,createLayout(),{dt:0});observeV7Raid(p,paused);assert.equal(p.production.pending[0].amount,11);assert.equal(p.production.pending[1].amount,20);
 s.wolves[0].position={x:8,z:4};observeV7Raid(p,s);assert.equal(p.production.pending[0].amount,5);assert.equal(p.production.pending[1].amount,20);assert.equal(p.v7.raidLosses[s.id].taken,6);
});
test('injury care authorization applies after event completion without reopening the threat',()=>{
 const l=createLayout(),s=event();s.phase='complete';s.elapsed=5;s.actors[0].status='safe';s.actors[0].injuredAt=2;
 const cured=stepThreat(s,l,{dt:.1,recoveryAuthorizedActorId:'a'});assert.equal(cured.phase,'complete');assert.equal(cured.actors[0].injuredAt,2);assert.equal(cured.actors[0].careCompletedAt,5);
});
test('actual natural wolf navigation reaches exposed producer, loots snapshot and injures without permanent loss',()=>{
 const p=profile(),l=createLayout();let s=event('high');s.discoveredAt=0;s.actors[0].departAt=null;beginV7Raid(p,s);
 for(let i=0;i<500&&s.actors[0].injuredAt===null;i++){s=stepThreat(s,l,{dt:.1});p.onlineMs+=100;observeV7Raid(p,s);}
 assert.ok(Math.hypot(s.wolves[0].position.x-11,s.wolves[0].position.z)>1.5);assert.ok(s.events.some(e=>e.type==='attack-windup'));assert.ok(s.actors[0].injuredAt!==null);assert.equal(p.production.pending[0].amount,9);assert.equal(p.v7.recovery.a.kind,'injury');assert.notEqual(s.actors[0].status,'memorial');
});
test('loot floors twenty percent separately by rarity so one rare unit cannot be stolen with cheap wool budget',()=>{
 const p=profile(),s=event();p.production.pending=[{id:'a-gold',animalId:'a',tier:'gold',amount:1,version:'v7',source:'production',cycle:1},{id:'z-white',animalId:'a',tier:'white',amount:99,version:'v7',source:'production',cycle:2}];beginV7Raid(p,s);s.wolves[0].position={x:8,z:4};observeV7Raid(p,s);
 assert.equal(p.production.pending.find(l=>l.tier==='gold')!.amount,1);assert.equal(p.production.pending.find(l=>l.tier==='white')!.amount,80);assert.equal(p.v7.raidLosses[s.id].taken,19);assert.deepEqual(p.v7.raidLosses[s.id].capByTier,{gold:0,white:19});
 observeV7Raid(p,s);assert.equal(p.v7.raidLosses[s.id].taken,19);
});
test('old raid ledgers without per-tier caps preserve prior loss receipts and never add further loss',()=>{
 const p=profile(),s=event();beginV7Raid(p,s);const ledger=p.v7.raidLosses[s.id];delete ledger.capByTier;ledger.taken=1;ledger.deductions={'opening-a':1};p.production.pending[0].amount=10;s.wolves[0].position={x:8,z:4};
 observeV7Raid(p,s);beginV7Raid(p,s);assert.equal(ledger.taken,1);assert.equal(p.production.pending[0].amount,10);assert.deepEqual(ledger.deductions,{'opening-a':1});
});
