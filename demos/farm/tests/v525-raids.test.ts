import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout,isWalkable} from '../src/v5/layout.ts';
import {createThreat,guardianCommand,stepThreat,type CreateThreatOptions} from '../src/v5/threat.ts';
const T=1_800_000_000_000;
const herd=Array.from({length:3},(_,i)=>({id:`a${i}`,rarity:1}));
async function api(){const module=await import('../src/v5/raid-cycle.ts').catch(()=>null);assert.ok(module,'a persisted online raid cycle must exist');return module;}
test('raid risk grows with actual herd count and rarity, with readable interval and wolf limits',async()=>{
 const {raidRisk}=await api();const base=raidRisk(herd),more=raidRisk([...herd,...herd.map(a=>({...a,id:a.id+'b'}))]),rare=raidRisk(herd.map(a=>({...a,rarity:5})));
 assert.ok(more.pressure>base.pressure);assert.ok(rare.pressure>base.pressure);assert.ok(rare.minIntervalMs<base.minIntervalMs);assert.equal(base.wolves,1);assert.equal(rare.wolves,3);assert.ok(rare.minIntervalMs>=180_000);assert.ok(rare.maxIntervalMs<=840_000);
});
test('pre-care, covered and offline time cannot turn a peaceful visit into an instant attack',async()=>{
 const {createRaidCycle,advanceRaidCycle}=await api();const start=createRaidCycle(42,T,0);
 let r=advanceRaidCycle(start,{now:T+1000,onlineMs:1000,herd,eligible:false,paused:false,eventActive:false});assert.equal(r.cycle.remainingMs,start.remainingMs);assert.equal(r.launch,null);
 r=advanceRaidCycle(r.cycle,{now:T+86400_000,onlineMs:1000,herd,eligible:true,paused:false,eventActive:false});assert.equal(r.cycle.remainingMs,start.remainingMs);assert.equal(r.launch,null);
 r=advanceRaidCycle(r.cycle,{now:T+86401_000,onlineMs:2000,herd,eligible:true,paused:true,eventActive:false});assert.equal(r.cycle.remainingMs,start.remainingMs);assert.equal(r.launch,null);
});
test('crossing a timer first shows a full warning, then one stable launch survives refresh and retry',async()=>{
 const {createRaidCycle,advanceRaidCycle,markRaidStarted,finishRaidCycle}=await api();let c=createRaidCycle(91,T,0,true);c.remainingMs=1;
 let r=advanceRaidCycle(c,{now:T+1000,onlineMs:1000,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.equal(r.cycle.phase,'warning');assert.equal(r.cycle.warningMs,12_000);assert.equal(r.launch,null);
 const warning=JSON.parse(JSON.stringify(r.cycle));r=advanceRaidCycle(warning,{now:T+300_000,onlineMs:1000,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.deepEqual(r.cycle,warning);
 r=advanceRaidCycle(r.cycle,{now:T+312_000,onlineMs:13_000,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.equal(r.cycle.phase,'ready');assert.ok(r.launch);const plan=r.launch;
 const retry=advanceRaidCycle(JSON.parse(JSON.stringify(r.cycle)),{now:T+312_000,onlineMs:13_000,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.deepEqual(retry.launch,plan);
 c=markRaidStarted(r.cycle,plan.id,T+312_000,13_000);assert.equal(c.phase,'active');assert.equal(c.history.length,1);assert.deepEqual(markRaidStarted(c,plan.id,T+312_000,13_000),c);
 r=advanceRaidCycle(c,{now:T+400_000,onlineMs:100_000,herd,eligible:true,paused:false,eventActive:true,lab:true});assert.equal(r.launch,null);assert.equal(r.cycle.phase,'active');
 const done=finishRaidCycle(r.cycle,herd,true);assert.equal(done.phase,'peace');assert.ok(done.remainingMs>=30_000&&done.remainingMs<=60_000);assert.deepEqual(finishRaidCycle(done,herd,true),done);
});
test('saved random rolls are deterministic and the online-hour and local-day caps postpone warnings',async()=>{
 const {createRaidCycle,advanceRaidCycle,raidDay}=await api();assert.deepEqual(createRaidCycle(7,T,0),createRaidCycle(7,T,0));assert.notEqual(createRaidCycle(7,T,0).remainingMs,createRaidCycle(8,T,0).remainingMs);
 for(const cap of ['hour','day'] as const){const c=createRaidCycle(7,T,4_000_000);c.remainingMs=0;c.history=Array.from({length:cap==='hour'?6:12},(_,i)=>({id:`old${i}`,onlineMs:cap==='hour'?3_900_000:0,day:raidDay(T)}));const r=advanceRaidCycle(c,{now:T+1000,onlineMs:4_001_000,herd,eligible:true,paused:false,eventActive:false});assert.equal(r.cycle.phase,'peace');assert.equal(r.launch,null);assert.equal(r.cycle.blockedBy,cap);}
});
test('natural spawn selection uses distinct reachable boundary cells separated from animals and LX',async()=>{
 const {naturalRaidSpawns}=await api();const layout=createLayout(),actors=[{id:'a',position:{x:4,z:4}}],player={x:0,z:4};const spawns=naturalRaidSpawns(layout,actors,3,17,[player]);assert.equal(spawns.length,3);assert.equal(new Set(spawns.map(p=>`${p.x},${p.z}`)).size,3);for(const p of spawns){assert.ok(isWalkable(layout,p));assert.ok(Math.hypot(p.x-4,p.z-4)>=3);assert.ok(Math.hypot(p.x-player.x,p.z-player.z)>=3);assert.ok(p.x===0||p.x===11||p.z===0||p.z===11);}assert.deepEqual(naturalRaidSpawns(layout,actors,3,17,[player]),spawns);
 const event=createThreat({id:'natural-three',seed:17,mode:'reassure',actors,guardian:'dog',guardianPosition:{x:4,z:4},wolfSpawns:spawns},layout);assert.equal(event.wolves.length,3);
});
test('guardian levels improve actual distinct abilities and event upgrades are captured as a value',()=>{
 const layout=createLayout();
 const make=(kind:'dog'|'cat'|'frog',level:number)=>createThreat({id:`skill-${kind}-${level}`,seed:7,mode:'reassure',actors:[{id:'a',position:{x:6,z:4}}],guardian:kind,guardianPosition:{x:4,z:0},wolfSpawns:[{x:3,z:0}],upgrades:{guardianLevel:level}} as CreateThreatOptions,layout);
 const base=guardianCommand(make('dog',1),layout,{kind:'block'}).state,high=guardianCommand(make('dog',3),layout,{kind:'block'}).state;assert.equal(base.wolves[0].blockUsed,6);assert.equal(high.wolves[0].blockUsed,10);
 const cat1=stepThreat(guardianCommand(make('cat',1),layout,{kind:'gather'}).state,layout,{dt:.1}),cat3=stepThreat(guardianCommand(make('cat',3),layout,{kind:'gather'}).state,layout,{dt:.1});assert.equal(cat1.actors[0].departAt,2);assert.equal(cat3.actors[0].departAt,0);
 const frog1=guardianCommand(make('frog',1),layout,{kind:'calm'}).state,frog3=guardianCommand(make('frog',3),layout,{kind:'calm'}).state;assert.equal(frog1.guardian!.abilityUntil,12);assert.equal(frog3.guardian!.abilityUntil,18);
 const upgrades={guardianLevel:3,shelterLevels:{'initial-shelter':3}},s=createThreat({id:'locked-upgrade',seed:7,mode:'reassure',actors:[{id:'a',position:{x:4,z:4}}],guardian:'dog',guardianPosition:{x:4,z:0},wolfSpawns:[{x:3,z:0}],upgrades} as CreateThreatOptions,layout);upgrades.guardianLevel=1;upgrades.shelterLevels['initial-shelter']=1;assert.equal(guardianCommand(s,layout,{kind:'block'}).state.wolves[0].blockUsed,10);
});
test('a protection gate upgrade shortens the actual queue without granting extra shelter slots',()=>{
 const layout=createLayout();const make=(level:number)=>createThreat({id:`gate-${level}`,seed:3,mode:'rehearsal',actors:Array.from({length:7},(_,i)=>({id:`a${i}`,position:{x:2,z:4}})),guardian:'cat',guardianPosition:{x:10,z:0},wolfSpawns:[{x:11,z:0}],upgrades:{shelterLevels:{'initial-shelter':level}}} as CreateThreatOptions,layout);
 const base=stepThreat(make(1),layout,{dt:24}),high=stepThreat(make(3),layout,{dt:24});assert.equal(base.actors.filter(a=>a.reservation).length,6);assert.equal(high.actors.filter(a=>a.reservation).length,6);assert.ok(high.actors[0].enteredAt!<base.actors[0].enteredAt!);assert.ok(high.actors[5].enteredAt!<base.actors[5].enteredAt!);
});

test('backward clocks and duplicate pulses cannot redraw a wave or refill its warning',async()=>{
 const {createRaidCycle,advanceRaidCycle}=await api();let c=createRaidCycle(123,T,0,true);c.remainingMs=1;
 c=advanceRaidCycle(c,{now:T+1000,onlineMs:1000,herd,eligible:true,paused:false,eventActive:false,lab:true}).cycle;
 c=advanceRaidCycle(c,{now:T+2000,onlineMs:2000,herd,eligible:true,paused:false,eventActive:false,lab:true}).cycle;
 const before=structuredClone(c);assert.equal(c.warningMs,11_000);
 for(const clock of [2000,1000]){const result=advanceRaidCycle(c,{now:T-86_400_000,onlineMs:clock,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.deepEqual(result.cycle,before);assert.equal(result.launch,null);}
 const invalid=advanceRaidCycle(c,{now:NaN,onlineMs:Infinity,herd,eligible:true,paused:false,eventActive:false,lab:true});assert.deepEqual(invalid.cycle,before);assert.equal(invalid.launch,null);
});
test('no shelter route or no living animals cannot spawn a natural wave',async()=>{
 const {naturalRaidSpawns,createRaidCycle,advanceRaidCycle}=await api();const layout=createLayout();layout.buildings=layout.buildings.filter(b=>b.kind!=='shelter');assert.deepEqual(naturalRaidSpawns(layout,[{id:'a',position:{x:4,z:4}}],3,7),[]);
 const cycle=createRaidCycle(7,T,0);cycle.remainingMs=0;const result=advanceRaidCycle(cycle,{now:T+60_000,onlineMs:60_000,herd:[],eligible:true,paused:false,eventActive:false});assert.equal(result.cycle.phase,'peace');assert.equal(result.launch,null);
});
