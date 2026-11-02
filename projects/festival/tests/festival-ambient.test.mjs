import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { projectFestivalAmbientParticipants, planFestivalAmbientInstallation, FESTIVAL_AMBIENT_BUILD_DELAYS } = await import('../lib/festival-ambient.ts');
const { festivalRoundAt, projectParticipant, getFestivalPlacementIssue, FESTIVAL_ROUND_MS } = await import('../lib/festival-types.ts');
const start=1_800_000_000_000;

test('four ambient festival visitors share stable distinct profiles and moving, talking schedules',()=>{
 const round=festivalRoundAt(7,start,start), first=projectFestivalAmbientParticipants(round,start,[]);
 assert.equal(first.length,4);
 assert.deepEqual(first,projectFestivalAmbientParticipants(round,start,[]));
 assert.equal(new Set(first.map(p=>p.preset)).size,4);
 assert.equal(new Set(first.map(p=>p.name)).size,4);
 assert.ok(first.every(p=>p.ambient&&p.slot>=10));
 let moving=0,talking=0;
 for(let at=start;at<start+90_000;at+=1000){
  const people=projectFestivalAmbientParticipants(round,at,[]);
  assert.deepEqual(people.map(p=>[p.id,p.name,p.preset]),first.map(p=>[p.id,p.name,p.preset]));
  for(const p of people){const pos=projectParticipant(p,at);assert.ok(Math.hypot(pos.x,pos.z)>=15);if(pos.speed>0)moving++;if(p.message?.expiresAt>at)talking++;}
 }
 assert.ok(moving>20);assert.ok(talking>=10&&talking<=20,'Only a few brief comments across the whole cast');
});

test('ambient art uses the shared footprint validator and round burn clock',()=>{
 const round=festivalRoundAt(1,start,start),participants=projectFestivalAmbientParticipants(round,start,[]),works=[];
 for(let i=0;i<2;i++){
  const art=planFestivalAmbientInstallation(round,i,works,participants,start+FESTIVAL_AMBIENT_BUILD_DELAYS[i]);
  assert.ok(art);assert.equal(art.ambient,true);assert.equal(art.roundIndex,1);
  assert.equal(getFestivalPlacementIssue(art.kind,art.x,art.z,works,participants,art.createdAt),null);
  works.push(art);
 }
 assert.equal(getFestivalPlacementIssue(0,works[0].x,works[0].z,works,[],start),'installation');
 const duringBurn=projectFestivalAmbientParticipants(festivalRoundAt(1,start,start+310_000),start+310_000,works);
 assert.equal(duringBurn.length,4);
 const next=projectFestivalAmbientParticipants(festivalRoundAt(2,start+FESTIVAL_ROUND_MS,start+FESTIVAL_ROUND_MS),start+FESTIVAL_ROUND_MS,[]);
 assert.equal(next.length,4);
});

class MemoryStore {
 room=null;visits=new Map();writes=0;
 async readState(actor){return structuredClone({room:this.room,visit:this.visits.get(actor)??null});}
 async ensureRoom(initial){this.room??=structuredClone(initial);}
 async ensureVisit(actor,initial){if(!this.visits.has(actor))this.visits.set(actor,structuredClone(initial));}
 async commit(revision,next,actor,sequence,visit){await Promise.resolve();if(this.room.revision!==revision||(visit&&this.visits.get(actor).lastSequence!==sequence))return false;this.room=structuredClone(next);if(visit)this.visits.set(actor,structuredClone(visit));this.writes++;return true;}
}
const {createFestivalService}=await import('../lib/festival-server.ts');
const cmd=(type,sequence,fields={})=>({type,sequence,requestId:`ambient-test-${type}-${sequence}`,...fields});
test('four ambient visitors never consume ten human seats or create authenticated visits',async()=>{
 let now=start;const store=new MemoryStore(),service=createFestivalService(store,{now:()=>now});
 const empty=await service.snapshot('observer');assert.equal(empty.participants.length,0);assert.equal(empty.ambientParticipants.length,4);
 assert.deepEqual(empty.ambientParticipants,(await service.snapshot('other')).ambientParticipants);
 for(let i=0;i<7;i++){now+=1000;await service.snapshot('observer');}
 assert.equal(store.writes,0);assert.equal(store.visits.size,2);
 const joined=await Promise.all(Array.from({length:11},(_,i)=>service.command(`human-${i}`,cmd('join',1,{name:'旅人',preset:'cat'}))));
 assert.equal(joined.filter(s=>s.self.role==='participant').length,10);assert.equal(joined.filter(s=>s.self.role==='spectator').length,1);
 const full=await service.snapshot('observer');assert.equal(full.participants.length,10);assert.equal(full.ambientParticipants.length,4);assert.equal(full.capacity,10);
 await assert.rejects(()=>service.command('ambient:festival:0',cmd('join',1,{name:'伪造',preset:'cat'})),{code:'FORBIDDEN'});
 await assert.rejects(()=>service.command('human-0',cmd('heartbeat',2,{ambientParticipants:[]})),{code:'INVALID_COMMAND'});
 assert.ok([...store.visits.keys()].every(id=>!id.startsWith('ambient:')));
});

test('ambient artwork is persisted once at each event, shared, placement-protected, burned and reset',async()=>{
 let now=start;const store=new MemoryStore(),service=createFestivalService(store,{now:()=>now});
 await service.snapshot('observer');
 now=start+FESTIVAL_AMBIENT_BUILD_DELAYS[0];
 const [first,second]=await Promise.all([service.snapshot('observer'),service.snapshot('other')]);
 assert.equal(first.ambientInstallations.length,1);assert.deepEqual(first.ambientInstallations,second.ambientInstallations);assert.equal(store.writes,1);
 for(let i=0;i<20;i++){now+=1000;await service.snapshot('observer');}
 assert.equal(store.writes,1,'Ambient animation and speech never write per tick');
 now=start+FESTIVAL_AMBIENT_BUILD_DELAYS[1];const two=await service.snapshot('observer');assert.equal(two.ambientInstallations.length,2);assert.equal(store.writes,2);assert.equal(two.installations.length,0);
 await service.command('human',cmd('join',1,{name:'我',preset:'cat'}));
 const art=two.ambientInstallations[0];
 await assert.rejects(()=>service.command('human',cmd('build',2,{kind:0,x:art.x,z:art.z,roundIndex:1})),{code:'PLACEMENT_BLOCKED'});
 assert.equal((await service.snapshot('human')).self.lastSequence,1);
 now=start+300_000;const fire=await service.snapshot('observer');assert.equal(fire.round.phase,'burning');assert.deepEqual(fire.ambientInstallations,two.ambientInstallations);
 now=start+335_000;assert.equal((await service.snapshot('observer')).round.phase,'ashes');
 now=start+FESTIVAL_ROUND_MS;const reset=await service.snapshot('observer');assert.equal(reset.round.index,2);assert.equal(reset.ambientInstallations.length,0);assert.equal(reset.ambientParticipants.length,4);
 assert.deepEqual(store.room.ambientBuildAttempts,[]);assert.ok([...store.visits.keys()].every(id=>!id.startsWith('ambient:')));
});

test('ambient artwork respects pre-existing human footprints and creator quota remains human-only',async()=>{
 let now=start;const store=new MemoryStore(),service=createFestivalService(store,{now:()=>now});
 await service.command('human',cmd('join',1,{name:'我',preset:'cat'}));
 const initial=await service.snapshot('human');
 const planned=planFestivalAmbientInstallation(initial.round,0,[],initial.ambientParticipants,start+8_000);
 await service.command('human',cmd('build',2,{kind:planned.kind,x:planned.x,z:planned.z,roundIndex:1}));
 now=start+8_000;const s=await service.snapshot('human');
 assert.equal(s.installations.length,1);assert.equal(s.ambientInstallations.length,1);
 const placed=s.ambientInstallations[0];
 assert.equal(getFestivalPlacementIssue(placed.kind,placed.x,placed.z,s.installations,[],now),null);
 assert.equal(s.installations.filter(art=>art.actorId==='human').length,1);
 const {festivalSceneState}=await import('../lib/festival-ambient.ts');
 const visual=festivalSceneState(s,now);assert.equal(visual.participants.length,5);assert.equal(visual.installations.length,2);
 assert.equal(s.participants.length,1,'Visual merging never mutates actual online membership');
});

test('ambient walking circuits remain continuous and clear of artwork throughout their loops',()=>{
 for(let index=1;index<=12;index++){
  const round=festivalRoundAt(index,start+index*FESTIVAL_ROUND_MS,start+index*FESTIVAL_ROUND_MS),works=[];
  for(let build=0;build<2;build++){
   const now=round.startsAt+FESTIVAL_AMBIENT_BUILD_DELAYS[build],people=projectFestivalAmbientParticipants(round,now,works);
   const art=planFestivalAmbientInstallation(round,build,works,people,now);if(art)works.push(art);
  }
  let previous;
  for(let elapsed=0;elapsed<90_000;elapsed+=250){
   const now=round.startsAt+elapsed,people=projectFestivalAmbientParticipants(round,now,works),positions=people.map(p=>projectParticipant(p,now));
   positions.forEach((p,i)=>{
    for(const art of works.filter(art=>art.createdAt<=now))assert.ok(Math.hypot(p.x-art.x,p.z-art.z)>=1.5+[6.5,7.5,12,7.5,9,9.5,8.5,7.5,10,10,9.5,7.5][art.kind]);
    if(previous)assert.ok(Math.hypot(p.x-previous[i].x,p.z-previous[i].z)<=7*.25+1e-6,'No phase-boundary teleport');
   });
   previous=positions;
  }
 }
});

test('ambient creators approach, hammer for twelve seconds, and return to roaming without teleporting',()=>{
 const round=festivalRoundAt(21,start,start),now=start+8_000;
 const before=projectFestivalAmbientParticipants(round,now,[]);
 const art=planFestivalAmbientInstallation(round,0,[],before,now);
 assert.ok(art?.ambientBuild,'The shared ambient installation persists its builder route');
 const job=art.ambientBuild;
 assert.equal(art.createdAt,job.task.arrivalAt);
 assert.equal(job.task.finishAt-art.createdAt,12_000);
 assert.ok(art.createdAt>now);
 const sample=time=>{const p=projectFestivalAmbientParticipants(round,time,[art]).find(p=>p.id===art.actorId);return {p,pos:projectParticipant(p,time)};};
 const origin=projectParticipant(before.find(p=>p.id===art.actorId),now);
 assert.ok(Math.hypot(sample(now).pos.x-origin.x,sample(now).pos.z-origin.z)<1e-7);
 assert.equal(sample(now).p.buildTask.installationId,art.id);
 assert.equal(sample(art.createdAt+1000).pos.speed,0);
 assert.equal(sample(art.createdAt+1000).pos.heading,job.task.facing);
 assert.notEqual(sample(art.createdAt+1000).p.message?.text,'这个梦，刚刚搭好了');
 assert.equal(sample(job.task.finishAt+1).p.message,undefined,'Finishing construction does not create unscheduled chatter');
 let completionComment;
 for(let at=job.task.finishAt;at<job.task.finishAt+40_000;at+=100)if(sample(at).p.message?.text==='这个梦，刚刚搭好了')completionComment=sample(at).p.message;
 assert.ok(completionComment,'The builder can celebrate on the next shared speaking turn');
 assert.equal(sample(job.task.finishAt+1).p.buildTask,undefined);
 for(const boundary of [art.createdAt,job.task.finishAt,job.resumeAt]){
  const a=sample(boundary-1).pos,b=sample(boundary+1).pos;
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=.015,'No transition teleports');
 }
 assert.ok(sample(job.resumeAt+20).pos.speed>0,'Builder resumes a clear local roaming loop');
});

test('a late ambient build stops hammering at ignition and returns without a jump or premature completion claim',()=>{
 const now=start+8_000,round={...festivalRoundAt(21,start,now),burnAt:now+9_000};
 const art=planFestivalAmbientInstallation(round,0,[],projectFestivalAmbientParticipants(round,now,[]),now);
 assert.ok(art);assert.ok(art.ambientBuild.task.finishAt>round.burnAt);
 const get=t=>projectFestivalAmbientParticipants(round,t,[art]).find(p=>p.id===art.actorId);
 const a=projectParticipant(get(round.burnAt-1),round.burnAt-1),b=projectParticipant(get(round.burnAt+1),round.burnAt+1);
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.015,'Ignition must not teleport the unfinished builder');
 assert.equal(get(round.burnAt+1).buildTask,undefined);
 assert.notEqual(get(art.ambientBuild.task.finishAt+1).message?.text,'这个梦，刚刚搭好了');
});


test('one shared NPC speaking turn every 25–40 seconds, with quiet gaps and deterministic expiry',()=>{
 for(const index of [1,7,21,1001]){
  const round=festivalRoundAt(index,start,start),events=new Map();
  for(let at=start;at<round.endsAt;at+=100){
   const people=projectFestivalAmbientParticipants(round,at,[]),speakers=people.filter(p=>p.message);
   assert.ok(speakers.length<=1,'Only one NPC speaks at a time');
   for(const actor of speakers){
    const message=actor.message;
    assert.ok(at>=message.at&&at<message.expiresAt);
    assert.ok(message.expiresAt-message.at<=5000,'Speech disappears after at most five seconds');
    events.set(message.at,actor.id);
    assert.deepEqual(people,projectFestivalAmbientParticipants(round,at,[]),'Same clock yields the same speech without rerender randomness');
    assert.equal(projectFestivalAmbientParticipants(round,message.expiresAt,[]).find(p=>p.id===actor.id).message,undefined);
   }
  }
  const times=[...events.keys()];assert.ok(times.length>=8&&times.length<=14);
  for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=25_000&&times[i]-times[i-1]<=40_000,'Cadence is shared by all four NPCs');
  assert.equal(new Set(events.values()).size,4,'All four visitors still get a turn');
  assert.ok(times[0]-round.startsAt>=10_000,'Entering a fresh round begins quietly');
 }
});

test('finished NPC artwork shares the same quiet speech budget; human text and emoji stay untouched',async()=>{
 const {festivalSceneState}=await import('../lib/festival-ambient.ts');
 const {festivalBubbleContent}=await import('../src/desert/speech-bubble.ts');
 const round=festivalRoundAt(21,start,start),works=[];
 for(let index=0;index<2;index++){
  const at=start+FESTIVAL_AMBIENT_BUILD_DELAYS[index],people=projectFestivalAmbientParticipants(round,at,works);
  const art=planFestivalAmbientInstallation(round,index,works,people,at);assert.ok(art);works.push(art);
 }
 const events=new Set();
 for(let at=start;at<round.endsAt;at+=100){
  const actors=projectFestivalAmbientParticipants(round,at,works),speakers=actors.filter(p=>p.message);
  assert.ok(speakers.length<=1,'Build completions cannot overlap another NPC comment');
  for(const p of speakers)events.add(p.message.at);
 }
 const times=[...events];for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=25_000&&times[i]-times[i-1]<=40_000);
 const at=start+70_000,humans=[
  {...projectFestivalAmbientParticipants(round,at,works)[0],id:'human-text',ambient:false,message:{text:'这是我的消息',at,expiresAt:at+8000},emoteAt:0},
  {...projectFestivalAmbientParticipants(round,at,works)[1],id:'human-emoji',ambient:false,message:undefined,emote:'love',emoteAt:at},
 ];
 const snapshot={round,participants:humans,installations:[],ambientParticipants:projectFestivalAmbientParticipants(round,at,works),ambientInstallations:works};
 const scene=festivalSceneState(snapshot,at+1000);
 assert.equal(scene.participants[0],humans[0]);assert.equal(scene.participants[1],humans[1]);
 assert.equal(festivalBubbleContent(scene.participants[0],at+1000),'这是我的消息');assert.equal(festivalBubbleContent(scene.participants[1],at+1000),'❤️');
 assert.equal(festivalBubbleContent(scene.participants[0],at+8000),'');assert.equal(festivalBubbleContent(scene.participants[1],at+5000),'');
});


test('round rollover and late/resumed viewers never replay or overlap old NPC comments',()=>{
 const times=[];
 for(const index of [18,19,20]){
  const begins=start+(index-18)*FESTIVAL_ROUND_MS,round=festivalRoundAt(index,begins,begins);
  const events=new Set();
  for(let at=begins;at<round.endsAt;at+=1000){
   const actors=projectFestivalAmbientParticipants(round,at,[]);
   for(const p of actors)if(p.message)events.add(p.message.at);
  }
  times.push(...events);
  assert.ok(projectFestivalAmbientParticipants(round,begins,[]).every(p=>!p.message&&p.emoteAt===0),'Old-round speech cannot leak into a fresh round');
  const afterGap=begins+200_000,seen=projectFestivalAmbientParticipants(round,afterGap,[]);
  assert.ok(seen.every(p=>!p.message||p.message.at>=afterGap-5000),'A late viewer only sees a still-active turn');
  assert.deepEqual(seen,projectFestivalAmbientParticipants(round,afterGap,[]));
 }
 for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=25_000&&times[i]-times[i-1]<=40_000,'Shared cadence remains quiet across round rollover');
});
