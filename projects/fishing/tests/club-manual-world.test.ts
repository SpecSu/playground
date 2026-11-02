import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import test from 'node:test';
import {clubMotionAt} from '../lib/club-scene-motion.ts';
const epoch=1791806400000;const actor={id:'self',name:'Self',preset:'frog' as const,slot:0,joinedAt:epoch-10000,lastSeenAt:epoch,action:'dance' as const,actionAt:0};
async function module(){assert.ok(existsSync(new URL('../lib/club-manual-world.ts',import.meta.url)),'manual world module exists');return import('../lib/club-manual-world.ts');}
const bases=(at:number)=>new Map(Array.from({length:10},(_,slot)=>[slot,clubMotionAt(at,slot)]));

test('first input moves immediately and release parks without restarting the route',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const start=bases(epoch).get(0)!;let state=controls.update({now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot,t)=>clubMotionAt(t,slot),intent:{vx:0,vz:1.8,active:true,enabled:true}});
 assert.equal(state.samples[0]?.reason,'start');const first=state.motions.get(0)!;assert.ok(Math.hypot(first.x-start.x,first.z-start.z)>0);
 state=controls.update({now:epoch+25,deltaSeconds:.025,canonical:bases(epoch+25),canonicalAt:(slot,t)=>clubMotionAt(t,slot),intent:{vx:0,vz:0,active:false}});
 assert.equal(state.samples.at(-1)?.reason,'stop');const parked=state.motions.get(0)!;
 for(let i=1;i<=10;i++){state=controls.update({now:epoch+25+i*100,deltaSeconds:.1,canonical:bases(epoch+i*100),canonicalAt:(slot,t)=>clubMotionAt(t,slot)});assert.equal(state.motions.get(0)!.x,parked.x);assert.equal(state.motions.get(0)!.z,parked.z);}
});

test('disabled input stops and cannot resume until a fresh gesture',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const update=(now:number,enabled:boolean,active=true)=>controls.update({now,deltaSeconds:.025,canonical:bases(now),canonicalAt:(slot,t)=>clubMotionAt(t,slot),intent:{vx:0,vz:1,active,enabled}});
 update(epoch,true);const stop=update(epoch+25,false);assert.equal(stop.samples.at(-1)?.reason,'stop');const p=stop.motions.get(0)!;
 const held=update(epoch+50,true);assert.equal(held.motions.get(0)!.x,p.x);assert.equal(held.motions.get(0)!.z,p.z);
 update(epoch+75,true,false);assert.equal(update(epoch+100,true).samples[0]?.reason,'start');
});

test('group summons preserves manual mode and parks at its canonical ending point',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const update=(now:number,group?:{id:string;startsAt:number;endsAt:number})=>controls.update({now,deltaSeconds:.025,canonical:bases(now),canonicalAt:(slot,t)=>clubMotionAt(t,slot),group,intent:{vx:0,vz:1,active:true,enabled:true}});
 update(epoch);const group={id:'g1',startsAt:epoch+3100,endsAt:epoch+20000};const summoned=update(epoch+100,group);assert.equal(summoned.samples.at(-1)?.reason,'stop');
 const final=update(group.endsAt,group).motions.get(0)!;const expected=clubMotionAt(group.endsAt,0);assert.ok(Math.hypot(final.x-expected.x,final.z-expected.z)<1e-8);
 const later=update(group.endsAt+1000,group).motions.get(0)!;assert.equal(later.x,final.x);assert.equal(later.z,final.z);
});

test('old group coordinates cannot restore a pre-summon manual position',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();const sample={actorId:'self',moveSequence:1,joinedAt:actor.joinedAt,groupId:null,mode:'manual' as const,...clubMotionAt(epoch,0),vx:0,vz:0,acceptedAt:epoch};
 controls.sync([actor],'self',[sample]);const group={id:'g',startsAt:epoch+3000,endsAt:epoch+20000};
 controls.update({now:epoch+20001,deltaSeconds:.025,canonical:bases(epoch+20001),canonicalAt:(slot,t)=>clubMotionAt(t,slot),group});
 controls.sync([actor],'self',[sample]);const result=controls.update({now:epoch+21000,deltaSeconds:.025,canonical:bases(epoch+21000),canonicalAt:(slot,t)=>clubMotionAt(t,slot),group});
 const end=clubMotionAt(group.endsAt,0);assert.ok(Math.hypot(result.motions.get(0)!.x-end.x,result.motions.get(0)!.z-end.z)<1e-8);
});

test('explicit auto publishes once and a new membership drops old manual state',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const args={now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot:number,t:number)=>clubMotionAt(t,slot)};
 controls.update({...args,intent:{vx:0,vz:1,active:true}});const result=controls.update({...args,now:epoch+30,intent:{vx:0,vz:0,active:false,autoRequest:1}});assert.equal(result.samples[0]?.reason,'auto');assert.equal(result.samples[0]?.mode,'auto');
 const again=controls.update({...args,now:epoch+60,intent:{vx:0,vz:0,active:false,autoRequest:1}});assert.equal(again.samples.length,0);
 controls.sync([{...actor,joinedAt:epoch+1000}],'self',[]);const newer=controls.update({...args,now:epoch+1000});assert.equal(newer.motions.has(0),false);
});

test('reconcile request rolls prediction back even when accepted sequence is unchanged',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();const accepted=clubMotionAt(epoch,0);
 const sample={actorId:'self',moveSequence:4,joinedAt:actor.joinedAt,groupId:null,mode:'manual' as const,...accepted,vx:0,vz:0,acceptedAt:epoch};controls.sync([actor],'self',[sample]);
 const args={now:epoch,deltaSeconds:.05,canonical:bases(epoch),canonicalAt:(slot:number,t:number)=>clubMotionAt(t,slot)};
 controls.update({...args,intent:{vx:0,vz:1.8,active:true}});controls.sync([actor],'self',[sample]);
 let result=controls.update({...args,now:epoch+50,intent:{vx:0,vz:0,active:false,reconcileRequest:1}});
 for(let i=1;i<=50;i++)result=controls.update({...args,now:epoch+50+i*50,intent:{vx:0,vz:0,active:false,reconcileRequest:1}});
 const actual=result.motions.get(0)!;assert.ok(Math.hypot(actual.x-accepted.x,actual.z-accepted.z)<.005);
});

test('a remote manual sample yields to the parked owner instead of overlapping or pushing it',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();const origin=clubMotionAt(epoch,0),peer={...actor,id:'peer',slot:1};
 const movement=(actorId:string,slot:number)=>({actorId,moveSequence:1,joinedAt:actor.joinedAt,groupId:null,mode:'manual' as const,x:origin.x,z:origin.z,heading:0,vx:0,vz:0,acceptedAt:epoch,slot});
 controls.sync([actor,peer],'self',[movement('self',0),movement('peer',1)]);
 const result=controls.update({now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot,t)=>clubMotionAt(t,slot)});
 const own=result.motions.get(0)!,remote=result.motions.get(1)!;
 assert.equal(own.x,origin.x);assert.equal(own.z,origin.z);assert.ok(Math.hypot(own.x-remote.x,own.z-remote.z)>=1.3-1e-5);
});

test('group finish persists one parked sample without repeated publication on later frames',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);const group={id:'g',startsAt:epoch+3000,endsAt:epoch+20000};
 const update=(now:number,active=false,g?:typeof group)=>controls.update({now,deltaSeconds:.025,canonical:bases(now),canonicalAt:(slot,t)=>clubMotionAt(t,slot),group:g,intent:{vx:0,vz:1,active}});
 update(epoch,true);update(epoch+10,false,group);
 const end=update(group.endsAt,false,group);assert.equal(end.samples.filter(s=>s.reason==='stop').length,1);
 assert.equal(update(group.endsAt+30,false,group).samples.length,0);
});

test('reconcile without an accepted row emits a fresh canonical parked stop barrier',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const args={now:epoch,deltaSeconds:.05,canonical:bases(epoch),canonicalAt:(slot:number,t:number)=>clubMotionAt(t,slot)};
 controls.update({...args,intent:{vx:0,vz:1.8,active:true}});
 const result=controls.update({...args,now:epoch+50,intent:{vx:0,vz:0,active:false,reconcileRequest:1}});
 const stop=result.samples.find(s=>s.reason==='stop');assert.ok(stop);assert.equal(stop.mode,'manual');assert.equal(stop.vx,0);assert.equal(stop.vz,0);assert.equal(stop.x,args.canonical.get(0)!.x);
});

test('NPC yielding stays full sized and bounded instead of jumping when the preferred exit changes',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();const parked=clubMotionAt(epoch+1000,1);
 controls.sync([actor],'self',[{actorId:'self',moveSequence:1,joinedAt:actor.joinedAt,groupId:null,mode:'manual',...parked,vx:0,vz:0,acceptedAt:epoch}]);
 let previous:Map<number,{x:number;z:number}>|undefined;
 for(let t=0;t<60000;t+=25){const canonical=bases(epoch+t);const result=controls.update({now:epoch+t,deltaSeconds:.025,canonical,canonicalAt:(slot,time)=>clubMotionAt(time,slot)});
  for(const [slot,base]of canonical){if(slot===0)continue;const point=result.motions.get(slot)??base;const before=previous?.get(slot);if(before)assert.ok(Math.hypot(point.x-before.x,point.z-before.z)<=.046,`slot${slot} at${t} bounded yield`);assert.equal(result.scales.get(slot)??1,1,'yielding never shrinks people');}
  previous=new Map([...canonical].map(([slot,base])=>[slot,result.motions.get(slot)??base]));
 }
});

test('first joystick gesture starts from the displayed yielded position',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();const other={...actor,id:'other',slot:1};const parked=clubMotionAt(epoch,0);
 controls.sync([actor,other],'self',[{actorId:'other',moveSequence:1,joinedAt:actor.joinedAt,groupId:null,mode:'manual',...parked,vx:0,vz:0,acceptedAt:epoch}]);
 let previous=parked;
 for(let i=0;i<50;i++){const canonical=bases(epoch+i*25);const result=controls.update({now:epoch+i*25,deltaSeconds:.025,canonical,canonicalAt:(slot,time)=>clubMotionAt(time,slot)});previous=result.motions.get(0)??canonical.get(0)!;}
 const result=controls.update({now:epoch+1250,deltaSeconds:.025,canonical:bases(epoch+1250),canonicalAt:(slot,time)=>clubMotionAt(time,slot),intent:{vx:0,vz:1.8,active:true}});const point=result.motions.get(0)!;
 assert.ok(Math.hypot(point.x-previous.x,point.z-previous.z)<=.046,'no canonical snap on manual takeover');
});

test('baseline request tokens survive reconstruction without replaying historical auto clicks',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld({autoRequest:1,reconcileRequest:3});const point=clubMotionAt(epoch,0);
 controls.sync([actor],'self',[{actorId:'self',moveSequence:9,joinedAt:actor.joinedAt,groupId:null,mode:'manual',...point,vx:0,vz:0,acceptedAt:epoch}]);
 const result=controls.update({now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot,time)=>clubMotionAt(time,slot),intent:{vx:0,vz:0,active:false,autoRequest:1,reconcileRequest:3}});
 assert.equal(result.samples.length,0);assert.ok(result.motions.has(0));
});

test('a reconciliation token received before joining cannot cancel the next fresh gesture',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([],null,[]);
 const args={now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot:number,time:number)=>clubMotionAt(time,slot)};
 controls.update({...args,intent:{vx:0,vz:0,active:false,reconcileRequest:1}});controls.sync([actor],'self',[]);
 const result=controls.update({...args,intent:{vx:0,vz:1,active:true,reconcileRequest:1}});assert.equal(result.samples[0]?.reason,'start');
});

test('same-cookie supersession reconciles without issuing a competing stop command',async()=>{
 const {ClubManualWorld}=await module();const controls=new ClubManualWorld();controls.sync([actor],'self',[]);
 const args={now:epoch,deltaSeconds:.025,canonical:bases(epoch),canonicalAt:(slot:number,time:number)=>clubMotionAt(time,slot)};
 controls.update({...args,intent:{vx:0,vz:1,active:true}});
 const point=clubMotionAt(epoch,0);controls.sync([actor],'self',[{actorId:'self',moveSequence:5,joinedAt:actor.joinedAt,groupId:null,mode:'manual',...point,vx:0,vz:0,acceptedAt:epoch}]);
 const result=controls.update({...args,intent:{vx:0,vz:0,active:false,reconcileRequest:1,reconcileStop:false}});assert.equal(result.samples.length,0);
});

test('close parked backflips smoothly reserve full-size render space without rewriting accepted movement', async () => {
 const { ClubManualWorld } = await module();
 const controls = new ClubManualWorld();
 const peer = { ...actor, id: 'peer', slot: 1 };
 const people = [actor, peer].map(person => ({ ...person, action: 'wave' as const, actionAt: epoch, actionUntil: epoch + 6000 }));
 const origin = [{ x: -.6625, z: 4 }, { x: .6625, z: 4 }];
 const canonical = new Map(origin.map((point, slot) => [slot, { ...clubMotionAt(epoch, slot), ...point, speed: 0, walkBlend: 0, action: 'wave' as const }]));
 const samples = people.map((person, slot) => ({ actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: null, mode: 'manual' as const, ...origin[slot], heading: 0, vx: 0, vz: 0, acceptedAt: epoch }));
 const frozen = structuredClone(samples);
 controls.sync(people, 'self', samples);
 let previous = origin;
 for (let elapsed = 0; elapsed <= 5500; elapsed += 25) {
  const result = controls.update({ now: epoch + elapsed, deltaSeconds: .025, canonical, canonicalAt: slot => canonical.get(slot)! });
  const points = [result.motions.get(0)!, result.motions.get(1)!];
  for (let slot = 0; slot < 2; slot++) {
   assert.ok(Number.isFinite(points[slot].x + points[slot].z));
   assert.ok(Math.hypot(points[slot].x - previous[slot].x, points[slot].z - previous[slot].z) <= .101, 'clearance opens and closes without a teleport');
   assert.equal(result.scales.get(slot) ?? 1, 1);
  }
  if (elapsed >= 400 && elapsed <= 4750) assert.ok(Math.hypot(points[0].x - points[1].x, points[0].z - points[1].z) >= 2.025 - 1e-5, 'both complete flips retain full-sized envelopes');
  if (elapsed === 5500) for (let slot = 0; slot < 2; slot++) assert.ok(Math.hypot(points[slot].x - origin[slot].x, points[slot].z - origin[slot].z) < 1e-6);
  assert.equal(result.samples.length, 0, 'visual clearance sends no movement command');
  previous = points;
 }
 assert.deepEqual(samples, frozen);
});

async function closeFlipFixture() {
 const { ClubManualWorld } = await module();
 const controls = new ClubManualWorld();
 const people = [actor, { ...actor, id: 'peer', slot: 1 }].map(person => ({ ...person, action: 'wave' as const, actionAt: epoch, actionUntil: epoch + 6000 }));
 const origins = [{ x: -.6625, z: 4 }, { x: .6625, z: 4 }];
 const canonical = new Map(origins.map((point, slot) => [slot, { ...clubMotionAt(epoch, slot), ...point, speed: 0, walkBlend: 0, action: 'wave' as const }]));
 const samples = people.map((person, slot) => ({ actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: null, mode: 'manual' as const, ...origins[slot], heading: 0, vx: 0, vz: 0, acceptedAt: epoch }));
 controls.sync(people, 'self', samples);
 const update = (elapsed: number, extra: Record<string, unknown> = {}) => controls.update({ now: epoch + elapsed, deltaSeconds: .025, canonical, canonicalAt: slot => canonical.get(slot)!, ...extra });
 return { controls, people, samples, origins, update };
}

test('repeated backflip commands keep a bounded transition and reopen their full-size space', async () => {
 const { controls, people, samples, update } = await closeFlipFixture();
 let previous = update(0).motions.get(0)!;
 for (let elapsed = 25; elapsed <= 2000; elapsed += 25) {
  if (elapsed === 1000) controls.sync(people.map(person => ({ ...person, actionAt: epoch + 1000, actionUntil: epoch + 7000 })), 'self', samples);
  const result = update(elapsed), own = result.motions.get(0)!, peer = result.motions.get(1)!;
  assert.ok(Math.hypot(own.x - previous.x, own.z - previous.z) <= .101);
  if (elapsed >= 1400) assert.ok(Math.hypot(own.x - peer.x, own.z - peer.z) >= 2.025 - 1e-5);
  assert.equal(result.samples.length, 0);
  previous = own;
 }
});

test('reduced motion skips personal-flip spacing and ordinary walking still uses the original radius', async () => {
 const { update, origins } = await closeFlipFixture();
 for (let elapsed = 0; elapsed <= 1800; elapsed += 25) {
  const result = update(elapsed, { reducedMotion: true });
  for (let slot = 0; slot < 2; slot++) assert.ok(Math.hypot(result.motions.get(slot)!.x - origins[slot].x, result.motions.get(slot)!.z - origins[slot].z) < 1e-8);
  assert.equal(result.samples.length, 0);
 }
});

test('manual override promptly walks while clearing the temporary visual offset, and groups own their placement', async () => {
 const { update, origins } = await closeFlipFixture();
 for (let elapsed = 0; elapsed <= 800; elapsed += 25) update(elapsed);
 let previous = update(825).motions.get(0)!;
 for (let elapsed = 850; elapsed <= 1400; elapsed += 25) {
  const result = update(elapsed, { intent: { vx: 0, vz: 1.8, active: true, enabled: true } });
  const point = result.motions.get(0)!, sample = result.samples.at(-1)!;
  assert.ok(point.walkBlend > .9, 'joystick immediately owns the walking pose');
  assert.ok(Math.hypot(point.x - previous.x, point.z - previous.z) <= .146, 'walking plus offset release stays bounded');
  assert.ok(Math.abs(sample.x - origins[0].x) < 1e-8, 'the render-only lateral clearance is never submitted as a movement');
  previous = point;
 }
 const group = { id: 'clearance-group', startsAt: epoch + 3000, endsAt: epoch + 20000 };
 update(1500, { group });
 const gathered = update(2000, { group });
 assert.equal(gathered.motions.has(0), false, 'after the existing summon transition the group canonical pose has sole ownership');
});

test('a parked flip beside the DJ booth opens one metre of clearance before rotation without changing its accepted point', async () => {
 const { ClubManualWorld } = await module();
 const controls = new ClubManualWorld();
 const person = { ...actor, action: 'wave' as const, actionAt: epoch, actionUntil: epoch + 6000 };
 const point = { x: 1.32 * Math.SQRT1_2, z: 1.32 * Math.SQRT1_2 };
 const motion = { ...clubMotionAt(epoch, 0), ...point, speed: 0, walkBlend: 0, action: 'wave' as const };
 const canonical = new Map([[0, motion]]);
 controls.sync([person], 'self', [{ actorId: 'self', moveSequence: 1, joinedAt: actor.joinedAt, groupId: null, mode: 'manual', ...point, heading: 0, vx: 0, vz: 0, acceptedAt: epoch }]);
 let previous = point;
 for (let elapsed = 0; elapsed <= 1500; elapsed += 25) {
  const result = controls.update({ now: epoch + elapsed, deltaSeconds: .025, canonical, canonicalAt: () => motion });
  const actual = result.motions.get(0)!;
  assert.ok(Math.hypot(actual.x - previous.x, actual.z - previous.z) <= .101);
  if (elapsed >= 300) assert.ok((actual.x + actual.z) * Math.SQRT1_2 >= .65 + 1.02 - 1e-8, 'full skin and held props clear the booth face');
  assert.equal(result.samples.length, 0);
  previous = actual;
 }
});

test('ten simultaneous parked flips open space without crossed paths, non-finite poses or unbounded work', async () => {
 const { ClubManualWorld } = await module();
 const controls = new ClubManualWorld();
 const people = Array.from({ length: 10 }, (_, slot) => ({ ...actor, id: `crowd-${slot}`, slot, action: 'wave' as const, actionAt: epoch, actionUntil: epoch + 6000 }));
 const origins = people.map((_, slot) => { const u = (slot % 5 - 2) * 1.325, v = 3 + Math.floor(slot / 5) * 1.325; return { x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 }; });
 const canonical = new Map(origins.map((point, slot) => [slot, { ...clubMotionAt(epoch, slot), ...point, speed: 0, walkBlend: 0, action: 'wave' as const }]));
 controls.sync(people, people[0].id, people.map((person, slot) => ({ actorId: person.id, moveSequence: 1, joinedAt: person.joinedAt, groupId: null, mode: 'manual' as const, ...origins[slot], heading: 0, vx: 0, vz: 0, acceptedAt: epoch })));
 let previous = origins;
 for (let elapsed = 0; elapsed <= 1800; elapsed += 25) {
  const result = controls.update({ now: epoch + elapsed, deltaSeconds: .025, canonical, canonicalAt: slot => canonical.get(slot)! });
  const points = people.map((_, slot) => result.motions.get(slot)!);
  for (let i = 0; i < points.length; i++) {
   assert.ok(Number.isFinite(points[i].x + points[i].z));
   assert.ok(Math.hypot(points[i].x - previous[i].x, points[i].z - previous[i].z) <= .101);
   for (let j = i + 1; j < points.length; j++) {
    const gap = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
    assert.ok(gap >= 1.325 - 1e-5, `paths never cross through parked bodies at ${elapsed} ms`);
    if (elapsed >= 600) assert.ok(gap >= 2 - 1e-5, `crowded flips have their complete full-size envelopes at ${elapsed} ms`);
   }
  }
  assert.equal(result.samples.length, 0);
  previous = points;
 }
});

test('first visible midflip frame and render resume initialize safe full-size poses', async () => {
 for (const resume of [false, true]) {
  const { update } = await closeFlipFixture();
  if (resume) update(0);
  const result = update(800), a = result.motions.get(0)!, b = result.motions.get(1)!;
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2.025 - 1e-5, 'no intersecting first visible frame while catching up to the shared flip clock');
  assert.equal(result.samples.length, 0);
 }
});

test('wave v2 retains active backflip clearance as render-only space and releases it smoothly',async()=>{
 const {update,origins,samples}=await closeFlipFixture();let prior=update(0);for(let elapsed=25;elapsed<=800;elapsed+=25)prior=update(elapsed);
 const before=[prior.motions.get(0)!,prior.motions.get(1)!],frozen=structuredClone(samples),group={id:'current-wave',kind:'wave',version:2,startsAt:epoch+825,endsAt:epoch+10825};
 for(let elapsed=825;elapsed<10825;elapsed+=25){const result=update(elapsed,{group});for(let slot=0;slot<2;slot++){assert.ok(Math.hypot(result.motions.get(slot)!.x-before[slot].x,result.motions.get(slot)!.z-before[slot].z)<1e-8,'no pre-wave clearance snap');}assert.equal(result.samples.length,0);}
 let previous=before;
 for(let elapsed=10825;elapsed<=11225;elapsed+=25){const result=update(elapsed,{group}),points=[result.motions.get(0)!,result.motions.get(1)!];for(let slot=0;slot<2;slot++)assert.ok(Math.hypot(points[slot].x-previous[slot].x,points[slot].z-previous[slot].z)<=.100001);previous=points;}
 for(let slot=0;slot<2;slot++)assert.ok(Math.hypot(previous[slot].x-origins[slot].x,previous[slot].z-origins[slot].z)<1e-8);
 assert.deepEqual(samples,frozen);
});
