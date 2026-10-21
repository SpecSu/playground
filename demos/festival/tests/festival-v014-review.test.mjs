import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const { D1FestivalStore } = await import('../lib/festival-d1.ts');
const { createFestivalService } = await import('../lib/festival-server.ts');
const festival = await import('../lib/festival-types.ts');

class ReviewD1 {
  sql = new DatabaseSync(':memory:');
  queue = Promise.resolve();
  constructor() { this.sql.exec(fs.readFileSync(new URL('../drizzle/0003_desert_festival.sql', import.meta.url), 'utf8')); }
  prepare(statement) {
    const sql = this.sql; let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { return sql.prepare(statement).get(...values) ?? null; },
      async run() { return { success: true, meta: { changes: Number(sql.prepare(statement).run(...values).changes) } }; },
    };
  }
  batch(statements) {
    const pending = this.queue.then(async () => {
      this.sql.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sql.exec('COMMIT'); return results; }
      catch (error) { this.sql.exec('ROLLBACK'); throw error; }
    });
    this.queue = pending.catch(() => undefined); return pending;
  }
}
function serviceFixture(t) {
  const db = new ReviewD1(), store = new D1FestivalStore(db);
  let now = 1_800_000_000_000;
  const service = createFestivalService(store, { now: () => now });
  t.after(() => db.sql.close());
  return { db, store, service, now: () => now, advance: ms => { now += ms; } };
}
const cmd = (type, sequence, fields = {}, requestId = `${type}-review-${sequence}`) => ({ type, sequence, requestId, ...fields });
const joinReview = sequence => cmd('join', sequence, { name: 'Review Nomad', preset: 'cat' });
const buildReview = (sequence, fields = {}) => cmd('build', sequence, { kind: 0, x: -60.125, z: -3.875, roundIndex: 1, ...fields });


test('v0.1.4 D1 rejected replacement preserves original job, reservation, receipt and quota atomically', async t => {
 const {service,store}=serviceFixture(t);
 await service.command('one',joinReview(1));
 await service.command('one',buildReview(2));
 const before=await store.readState('one');
 await assert.rejects(service.command('one',buildReview(3,{x:0,z:0})),{code:'PLACEMENT_BLOCKED'});
 assert.deepEqual(await store.readState('one'),before);
 const next=await service.command('one',buildReview(3,{x:60.125,z:-3.875}));
 assert.equal(next.installations.length,1);
 assert.notEqual(next.installations[0].id,before.room.installations[0].id);
 assert.equal(next.participants[0].buildTask.installationId,next.installations[0].id);
 const replay=await service.command('one',buildReview(2));
 assert.deepEqual(replay.installations,next.installations,'old receipt cannot resurrect superseded reservation');
});

test('v0.1.4 D1 approaching departure frees reservation and arrival departure keeps committed construction running',async t=>{
 const {service,now,advance}=serviceFixture(t);
 await service.command('one',joinReview(1));
 await service.command('one',buildReview(2));
 const left=await service.command('one',cmd('leave',3));
 assert.equal(left.installations.length,0);assert.equal(left.participants.length,0);
 await service.command('one',joinReview(4));
 const started=await service.command('one',buildReview(5));
 advance(started.participants[0].buildTask.arrivalAt-now()+4321);
 const partial=await service.command('one',cmd('leave',6));
 assert.equal(partial.installations.length,1);
 assert.equal(partial.installations[0].constructionStoppedAt,undefined);
 advance(started.participants[0].buildTask.finishAt-now());
 const completed=await service.snapshot('observer');
 assert.deepEqual(completed.installations,partial.installations);
 const {installationConstruction}=await import('../src/desert/visual-math.ts');
 assert.equal(installationConstruction(now(),completed.installations[0].createdAt,completed.round.burnAt).progress,1);
});

test('v0.1.4 concurrent D1 reservations for one footprint have exactly one authority and quota owner',async t=>{
 const {service}=serviceFixture(t);
 await Promise.all(['one','two'].map(id=>service.command(id,joinReview(1))));
 const results=await Promise.allSettled(['one','two'].map(id=>service.command(id,buildReview(2))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'PLACEMENT_BLOCKED');
 const snapshot=await service.snapshot('observer');
 assert.equal(snapshot.installations.length,1);
 assert.equal(snapshot.participants.filter(p=>p.buildTask).length,1);
 const builder=snapshot.participants.find(p=>p.buildTask);
 assert.equal(builder.id,snapshot.installations[0].actorId);
 assert.equal(builder.buildTask.arrivalAt,snapshot.installations[0].createdAt);
});

const { planFestivalBuildApproach }=await import('../lib/festival-build-job.ts');
test('v0.1.4 every sampled approach has an exterior stand point and never traverses its reserved artwork',()=>{
 let accepted=0;
 const person={id:'one',x:-13.5,z:44,targetX:-13.5,targetZ:44,moveAt:1000,heading:Math.PI};
 for(let kind=0;kind<12;kind++)for(let x=-60;x<=60;x+=15)for(let z=-60;z<=60;z+=15){
  if(festival.getFestivalPlacementIssue(kind,x,z,[],[person],1000))continue;
  const art={kind,x,z},approach=planFestivalBuildApproach(person,art,[],1000);
  if(!approach)continue;
  accepted++;
  const m=approach.movement,r=festival.FESTIVAL_INSTALLATION_RADII[kind];
  assert.ok(Math.hypot(m.targetX-x,m.targetZ-z)>=r+festival.FESTIVAL_AVATAR_RADIUS+.74);
  const endpointRadius=Math.hypot(m.targetX,m.targetZ);
  assert.ok(endpointRadius>=festival.FESTIVAL_MONUMENT_RADIUS+festival.FESTIVAL_AVATAR_RADIUS);
  assert.ok(endpointRadius<=festival.FESTIVAL_WORLD_RADIUS-festival.FESTIVAL_AVATAR_RADIUS);
  for(let i=0;i<=1000;i++){
   const point=festival.projectParticipant(m,1000+(approach.arrivalAt-1000)*i/1000);
   assert.ok(Math.hypot(point.x-x,point.z-z)>=r+festival.FESTIVAL_AVATAR_RADIUS+.24);
  }
  const end=festival.projectParticipant(m,approach.arrivalAt+.01);
  assert.ok(Math.hypot(end.x-m.targetX,end.z-m.targetZ)<1e-7);
 }
 assert.ok(accepted>100,`meaningful coverage: ${accepted}`);
});

const ambientReview=await import('../lib/festival-ambient.ts');
test('v0.1.4 ambient job insertion, arrival, hammer finish and resumed roam remain position-continuous',()=>{
 let checked=0;
 for(let index=1;index<=12;index++){
  const round=festival.festivalRoundAt(index,1_800_000_000_000,1_800_000_000_000),works=[];
  for(let builder=0;builder<2;builder++){
   const now=round.startsAt+ambientReview.FESTIVAL_AMBIENT_BUILD_DELAYS[builder];
   const before=ambientReview.projectFestivalAmbientParticipants(round,now,works);
   const art=ambientReview.planFestivalAmbientInstallation(round,builder,works,before,now);assert.ok(art);
   works.push(art);const job=art.ambientBuild;assert.ok(job);checked++;
   const after=ambientReview.projectFestivalAmbientParticipants(round,now,works);
   for(const old of before){const p=festival.projectParticipant(old,now),q=festival.projectParticipant(after.find(n=>n.id===old.id),now);assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<.00001,'inserting reservation never teleports anyone');}
   assert.equal(job.task.finishAt-job.task.arrivalAt,12000);assert.equal(art.createdAt,job.task.arrivalAt);
   for(const boundary of [job.task.arrivalAt,job.task.finishAt,job.resumeAt]){
    const at=time=>festival.projectParticipant(ambientReview.projectFestivalAmbientParticipants(round,time,works).find(p=>p.id===art.actorId),time);
    const left=at(boundary-.001),right=at(boundary+.001);
    assert.ok(Math.hypot(left.x-right.x,left.z-right.z)<.0001,`continuous boundary ${boundary}`);
   }
   const builderBefore=ambientReview.projectFestivalAmbientParticipants(round,job.task.finishAt-1,works).find(p=>p.id===art.actorId);
   assert.notEqual(builderBefore.message?.text,'这个梦，刚刚搭好了');
   const finished=ambientReview.projectFestivalAmbientParticipants(round,job.task.finishAt+1,works).find(p=>p.id===art.actorId);
   assert.equal(finished.buildTask,undefined);
   // Completion joins the next shared NPC speaking turn instead of opening an
   // extra bubble immediately when the hammer stops. Movement checks stay exact.
   let completion;
   for(let time=job.task.finishAt;time<job.task.finishAt+40_000&&!completion;time+=100){
    const people=ambientReview.projectFestivalAmbientParticipants(round,time,works);
    assert.ok(people.filter(person=>person.message).length<=1,'completion respects the single-speaker budget');
    const message=people.find(person=>person.id===art.actorId).message;
    if(message?.text==='这个梦，刚刚搭好了')completion=message;
   }
   assert.ok(completion,'the finished builder speaks on the next shared turn');
   assert.ok(completion.at>=job.task.finishAt&&completion.at-job.task.finishAt<=32_000);
   assert.ok(ambientReview.projectFestivalAmbientParticipants(round,completion.at,[]).some(person=>person.message?.at===completion.at),'completion reuses an already scheduled speaking turn');
  }
 }
 assert.equal(checked,24);
});

test('v0.1.4 ignition interrupts ambient hammering without relocation or false completion speech',()=>{
 let checked=0;
 for(let index=1;index<=12;index++){
  const round=festival.festivalRoundAt(index,1_800_000_000_000,1_800_000_000_000),now=round.burnAt-12000;
  const people=ambientReview.projectFestivalAmbientParticipants(round,now,[]),art=ambientReview.planFestivalAmbientInstallation(round,0,[],people,now);
  if(!art)continue;checked++;
  assert.ok(art.ambientBuild.task.finishAt>round.burnAt);
  const at=time=>ambientReview.projectFestivalAmbientParticipants(round,time,[art]).find(p=>p.id===art.actorId);
  const before=festival.projectParticipant(at(round.burnAt-.001),round.burnAt-.001),after=festival.projectParticipant(at(round.burnAt+.001),round.burnAt+.001);
  assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<.0001);
  assert.equal(at(round.burnAt).buildTask,undefined);
  assert.notEqual(at(art.ambientBuild.task.finishAt+1).message?.text,'这个梦，刚刚搭好了');
 }
 assert.ok(checked>=8);
});
