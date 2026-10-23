import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayout} from '../src/v5/layout.ts';
import {createThreat,guardianCommand,stepThreat} from '../src/v5/threat.ts';
import {shieldLayout,shieldSafety} from '../src/v5/tactical-shield.ts';
test('shield is a real shared graph obstruction with legal detours',()=>{
 const l=createLayout(),a={x:5,z:4}; const blocked=shieldLayout(l,a);
 assert.equal(blocked.owned.some(p=>p.x===5&&p.z===4),false);
 assert.equal(shieldSafety(l,a,[{position:{x:4,z:4},destination:{x:6,z:4}}]).ok,true);
});
test('shield refuses sole evacuation route',()=>{
 const l=createLayout();l.owned=[{x:3,z:4},{x:4,z:4},{x:5,z:4}];l.buildings=[];
 assert.equal(shieldSafety(l,{x:4,z:4},[{position:{x:3,z:4},destination:{x:5,z:4}}]).ok,false);
});
test('shield replaces block, walks to anchor, lasts exactly six seconds and survives refresh',()=>{
 const l=createLayout(); let s=createThreat({id:'shield',seed:1,mode:'rehearsal',actors:[{id:'a',position:{x:4,z:4}}],guardian:'dog',guardianPosition:{x:6,z:4},wolfSpawns:[{x:11,z:0}],upgrades:{guardianLevel:3},tactic:{kind:'folding-shield',anchor:{x:7,z:4}}},l);
 assert.equal(guardianCommand(s,l,{kind:'block'}).ok,false);
 s=guardianCommand(s,l,{kind:'shield'}).state;
 s=stepThreat(s,l,{dt:.1});assert.ok(s.guardian!.position.x<7);assert.equal(s.tacticalShield!.status,'moving');
 s=stepThreat(s,l,{dt:.6});assert.equal(s.tacticalShield!.status,'active');
 const until=s.tacticalShield!.until; s=guardianCommand(JSON.parse(JSON.stringify(s)),l,{kind:'shield'}).state;
 assert.equal(s.tacticalShield!.until,until);assert.equal(until!-s.tacticalShield!.startedAt!,6);
 s=stepThreat(s,l,{dt:6});assert.equal(s.tacticalShield!.status,'expired');assert.equal(guardianCommand(s,l,{kind:'block'}).ok,false);
});
test('reserved animals pass first, dog stays put, and the active wolf takes a real detour',()=>{
 const l=createLayout();let s=createThreat({id:'wait',seed:1,mode:'rehearsal',actors:[{id:'a',position:{x:8,z:4}}],guardian:'dog',guardianPosition:{x:7,z:4},wolfSpawns:[{x:11,z:0}],tactic:{kind:'folding-shield',anchor:{x:7,z:4}}},l);
 const d=s.doors[0];s.discoveredAt=0;s.actors[0].reservation={buildingId:d.buildingId,doorId:d.doorId,slot:0};s.actors[0].departAt=0;s.actors[0].status='evacuating';s.actors[0].path=[{x:8,z:4},{x:7,z:4},{x:6,z:4},{x:5,z:4},{x:4,z:4},{x:3,z:4},d.position];s.actors[0].pathIndex=1;
 s=guardianCommand(s,l,{kind:'shield'}).state;s=stepThreat(s,l,{dt:.1});assert.equal(s.tacticalShield!.status,'waiting');assert.deepEqual(s.tacticalShield!.waitingActorIds,['a']);
 s=stepThreat(s,l,{dt:2.1});assert.equal(s.tacticalShield!.status,'active');assert.deepEqual(s.guardian!.position,{x:7,z:4});
 // Aim wolf across barrier while the sheep stays exposed on the other side.
 const wolf=s.wolves[0];wolf.position={x:8,z:4};wolf.path=[{x:8,z:4},{x:7,z:4},{x:6,z:4}];wolf.pathIndex=1;wolf.targetDoorId=d.doorId;
 s=stepThreat(s,l,{dt:.2});assert.ok(s.wolves[0].path.every(p=>p.x!==7||p.z!==4));assert.ok(s.wolves[0].position.x!==7||s.wolves[0].position.z!==4);
 assert.equal(guardianCommand(s,l,{kind:'shield',target:{x:9,z:4}}).ok,false);assert.equal(guardianCommand(s,l,{kind:'follow'}).ok,false);
});
test('actors with stale paths reroute around the same barrier used by wolves',()=>{
 const l=createLayout();let s=createThreat({id:'reroute',seed:1,mode:'rehearsal',actors:[{id:'a',position:{x:8,z:4}}],guardian:'dog',guardianPosition:{x:7,z:4},wolfSpawns:[{x:11,z:0}],tactic:{kind:'folding-shield',anchor:{x:7,z:4}}},l);
 s.discoveredAt=0;s=guardianCommand(s,l,{kind:'shield'}).state;s=stepThreat(s,l,{dt:.1});assert.equal(s.tacticalShield!.status,'active');
 const a=s.actors[0],d=s.doors[0];s.discoveredAt=0;a.departAt=0;a.reservation={buildingId:d.buildingId,doorId:d.doorId,slot:0};a.path=[{x:8,z:4},{x:7,z:4},{x:6,z:4}];a.pathIndex=1;a.status='evacuating';
 s=stepThreat(s,l,{dt:.2});assert.ok(s.actors[0].path.every(p=>p.x!==7||p.z!==4));
});
test('reassure wolf resumes actual chase after shield expires instead of looping at door',()=>{
 const l=createLayout();let s=createThreat({id:'chase',seed:1,mode:'reassure',actors:[{id:'a',position:{x:8,z:4}}],guardian:'dog',guardianPosition:{x:7,z:4},wolfSpawns:[{x:11,z:0}],tactic:{kind:'folding-shield',anchor:{x:7,z:4}}},l);
 s.discoveredAt=0;s.tacticalShield!.status='active';s.tacticalShield!.startedAt=1.1;s.tacticalShield!.until=7.1;s.elapsed=7;
 const w=s.wolves[0],d=s.doors[0];w.position={...d.position};w.arrivedAt=2;w.path=[];w.pathIndex=0;
 s=stepThreat(s,l,{dt:9});assert.ok(s.events.some(e=>e.type==='attack-windup'));assert.ok(s.actors[0].injuredAt!==null);
});
test('reassure carrying wolf blocked from spawn waits in place without remote boundary arrival',()=>{
 const l=createLayout();l.owned=Array.from({length:8},(_,i)=>({x:i+2,z:4}));let s=createThreat({id:'carry-wall',seed:1,mode:'reassure',actors:[{id:'a',position:{x:3,z:4}},{id:'b',position:{x:4,z:4}}],guardian:'dog',guardianPosition:{x:7,z:4},wolfSpawns:[{x:9,z:4}],tactic:{kind:'folding-shield',anchor:{x:7,z:4}}},l);
 s.discoveredAt=0;const w=s.wolves[0];w.position={x:4,z:4};w.status='carrying';w.targetActorId='b';s.actors[1].status='carried';s.actors[1].position={x:4,z:4};s.tacticalShield!.status='active';s.tacticalShield!.startedAt=0;s.tacticalShield!.until=6;s.tacticalShield!.remaining=6;
 s=stepThreat(s,l,{dt:.05});assert.equal(s.wolves[0].status,'carrying');assert.equal(s.actors[1].status,'carried');assert.deepEqual(s.wolves[0].position,{x:4,z:4});assert.equal(s.events.some(e=>e.type==='boundary-rescue'),false);
 s=stepThreat(s,l,{dt:14});assert.equal(s.wolves[0].status,'boundary');assert.deepEqual(s.wolves[0].position,{x:9,z:4});assert.deepEqual(s.events.find(e=>e.type==='boundary-rescue')?.position,{x:9,z:4});
});
