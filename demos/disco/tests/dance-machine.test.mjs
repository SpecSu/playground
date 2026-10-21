import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {createRoomService}=await import('../lib/room-server.ts');
const {DANCE_DURATION_MS,DANCE_MAX_NOTES,generateDanceChart}=await import('../lib/dance-machine.ts');
const ROUND_TOTAL_MS=5000+DANCE_DURATION_MS;
class Store {
 rooms=new Map(); visits=new Map();
 async ensureRoom(k,v){if(!this.rooms.has(k))this.rooms.set(k,structuredClone(v));}
 async readRoom(k){return structuredClone(this.rooms.get(k));}
 async ensureVisit(r,a,v){if(!this.visits.has(r+a))this.visits.set(r+a,structuredClone(v));}
 async readVisit(r,a){return structuredClone(this.visits.get(r+a));}
 async commit(r,rev,v,a,seq,visit){await Promise.resolve();if(this.rooms.get(r).revision!==rev||(visit&&this.visits.get(r+a).lastSequence!==seq))return false;this.rooms.set(r,structuredClone(v));if(visit)this.visits.set(r+a,structuredClone(visit));return true;}
}
function setup(){let now=1800000000000;const store=new Store(), service=createRoomService(store,{now:()=>now});let n=0;const cmd=(a,type,rest={})=>service.command(a,{roomId:'main',requestId:`request-${++n}`,sequence:n,type,...rest});return {store,service,cmd,advance:ms=>now+=ms};}
const profile={name:'Guest',preset:'cat'};
test('dance start is joined-only, concurrent starts select one, track and group controls lock',async()=>{
 const {cmd}=setup();await assert.rejects(cmd('v','dance-start'),{code:'NOT_PARTICIPANT'});await assert.rejects(cmd('v','group-action',{kind:'wave'}),{code:'NOT_PARTICIPANT'});
 await cmd('a','join',profile);await cmd('b','join',profile);
 const starts=await Promise.allSettled([cmd('a','dance-start'),cmd('b','dance-start')]);assert.equal(starts.filter(x=>x.status==='fulfilled').length,1);
 const round=starts.find(x=>x.status==='fulfilled').value.danceRound;assert.equal(round.endsAt-round.startsAt,DANCE_DURATION_MS);assert.equal(round.startsAt-round.createdAt,5000);assert.equal(round.roster.length,6);
 for(const [type,data] of [['action',{action:'dance'}],['group-action',{kind:'wave'}],['track',{trackId:'arabic-nights'}],['track-step',{direction:1}]])await assert.rejects(cmd('a',type,data),{code:'RATE_LIMITED'});
 await cmd('a','chat',{text:'hi'});await cmd('a','lights',{lightMode:'ice'});
});
test('roster freezes at start, late joins watch, results recompute and reject repeats',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);let s=await cmd('a','dance-start');const id=s.danceRound.id;
 await cmd('b','join',profile);advance(5000);s=await service.snapshot('main','a');assert.equal(s.danceRound.rosterFrozen,true);assert.ok(s.danceRound.roster.some(x=>x.id==='b'));
 await cmd('c','join',profile);assert.ok(!(await service.snapshot('main','c')).danceRound.roster.some(x=>x.id==='c'));
 await assert.rejects(cmd('a','dance-submit',{roundId:id,hits:[]}),{code:'INVALID_COMMAND'});
 advance(30000);await cmd('a','heartbeat');await cmd('b','heartbeat');advance(DANCE_DURATION_MS-30000);
 await assert.rejects(cmd('c','dance-submit',{roundId:id,hits:[]}),{code:'NOT_PARTICIPANT'});
 const {generateDanceChart,scoreDanceHits}=await import('../lib/dance-machine.ts');const chart=generateDanceChart(s.danceRound.seed,s.danceRound.version);const hits=chart.map(x=>({noteId:x.id,offsetMs:0}));
 await assert.rejects(cmd('a','dance-submit',{roundId:id,hits:[hits[0],hits[0]]}),{code:'INVALID_COMMAND'});
 const result=await cmd('a','dance-submit',{roundId:id,hits});assert.equal(result.danceRound.results.find(x=>x.actorId==='a').score,scoreDanceHits(chart,hits).score);
 await assert.rejects(cmd('a','dance-submit',{roundId:id,hits:[]}),{code:'REQUEST_CONFLICT'});
 assert.ok(result.danceRound.results.filter(x=>x.actorId.startsWith('ambient-')).every(x=>x.score<scoreDanceHits(chart,hits).score));
});
test('chart and scoring are deterministic, ordered, bounded, and four-lane',async()=>{
 const m=await import('../lib/dance-machine.ts');const chart=m.generateDanceChart('seed');assert.deepEqual(chart,m.generateDanceChart('seed'));assert.ok(chart.length>=100);assert.deepEqual(m.DANCE_LANES,['left','up','down','right']);
 assert.ok(chart.every((x,i)=>x.atMs>=0&&x.atMs<60000&&x.lane>=0&&x.lane<4&&(!i||x.atMs>chart[i-1].atMs)));
 assert.deepEqual([0,51,111,181].map(m.judgeDanceOffset),['cool','good','bad','miss']);assert.equal(m.scoreDanceHits(chart,[]).counts.miss,chart.length);
});
test('round leaves normal music timeline intact, including after completion',async()=>{
 const {cmd,advance,service}=setup();const before=await cmd('a','join',profile);const start=await cmd('a','dance-start');assert.deepEqual(start.track,before.track);advance(ROUND_TOTAL_MS);assert.deepEqual((await service.snapshot('main','a')).track,before.track);
});
test('malformed hits, forged scores, wrong rounds, early and late submissions fail',async()=>{
 const {cmd,advance}=setup();await cmd('a','join',profile);const {danceRound:r}=await cmd('a','dance-start');advance(ROUND_TOTAL_MS);
 for(const hits of [[{noteId:-1,offsetMs:0}],[{noteId:DANCE_MAX_NOTES,offsetMs:0}],[{noteId:1.5,offsetMs:0}],[{noteId:1,offsetMs:181}],[{noteId:1,offsetMs:NaN}],[{noteId:1,offsetMs:Infinity}],[{noteId:1,offsetMs:0,score:99}],[{noteId:1,offsetMs:0},{noteId:1,offsetMs:1}],Array(DANCE_MAX_NOTES+1).fill({noteId:0,offsetMs:0})])await assert.rejects(cmd('a','dance-submit',{roundId:r.id,hits}),{code:'INVALID_COMMAND'});
 await assert.rejects(cmd('a','dance-submit',{roundId:r.id,hits:[],score:999999}),{code:'INVALID_COMMAND'});
 await assert.rejects(cmd('a','dance-submit',{roundId:'wrong',hits:[]}),{code:'INVALID_COMMAND'});
 advance(15001);await assert.rejects(cmd('a','dance-submit',{roundId:r.id,hits:[]}),{code:'INVALID_COMMAND'});
});
test('first late snapshot freezes eligible countdown roster before seat expiration',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);await cmd('a','dance-start');advance(2000);await cmd('b','join',profile);advance(64000);
 const state=await service.snapshot('main','a');assert.equal(state.participants.length,0);assert.ok(state.danceRound.roster.some(p=>p.id==='a'));assert.ok(state.danceRound.roster.some(p=>p.id==='b'));
 const result=await cmd('a','dance-submit',{roundId:state.danceRound.id,hits:[]});assert.equal(result.danceRound.results.find(x=>x.actorId==='a').score,0);
});
test('countdown leavers removed, midround leavers retained, duplicate submit request is idempotent',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);await cmd('b','join',profile);await cmd('a','dance-start');await cmd('b','leave');advance(5000);let state=await service.snapshot('main','a');assert.ok(!state.danceRound.roster.some(p=>p.id==='b'));await cmd('a','leave');advance(DANCE_DURATION_MS);
 const input={roomId:'main',requestId:'submit-idempotent',sequence:100,type:'dance-submit',roundId:state.danceRound.id,hits:[]};const first=await service.command('a',input);const duplicate=await service.command('a',input);assert.equal(first.revision,duplicate.revision);assert.equal(duplicate.danceRound.results.filter(p=>p.actorId==='a').length,1);
});
test('two simultaneous result submissions settle once and protect the complete grace window',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);await cmd('b','join',profile);const {danceRound:r}=await cmd('a','dance-start');advance(30000);await cmd('a','heartbeat');await cmd('b','heartbeat');advance(ROUND_TOTAL_MS-30000);
 const submissions=await Promise.allSettled([service.command('a',{roomId:'main',requestId:'result-concurrent-one',sequence:100,type:'dance-submit',roundId:r.id,hits:[]}),service.command('a',{roomId:'main',requestId:'result-concurrent-two',sequence:101,type:'dance-submit',roundId:r.id,hits:[{noteId:0,offsetMs:0}]})]);
 assert.equal(submissions.filter(s=>s.status==='fulfilled').length,1);assert.equal((await service.snapshot('main','a')).danceRound.results.filter(x=>x.actorId==='a').length,1);
 await assert.rejects(cmd('b','dance-start'),{code:'RATE_LIMITED',retryAfterMs:15000});advance(15000);const next=await cmd('b','dance-start');assert.notEqual(next.danceRound.id,r.id);
});
test('results stay hidden until shared end and missing notes count as misses',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);await cmd('a','dance-start');advance(5000);const playing=await service.snapshot('main','a');assert.deepEqual(playing.danceRound.results,[]);advance(DANCE_DURATION_MS);const end=await service.snapshot('main','a');assert.ok(end.danceRound.results.length>0);
 const s=await cmd('a','dance-submit',{roundId:end.danceRound.id,hits:[{noteId:0,offsetMs:0},{noteId:1,offsetMs:80},{noteId:2,offsetMs:150}]});const result=s.danceRound.results.find(x=>x.actorId==='a');assert.equal(result.score,1600);assert.equal(result.maxCombo,2);assert.deepEqual(result.counts,{cool:1,good:1,bad:1,miss:generateDanceChart(end.danceRound.seed,end.danceRound.version).length-3});
});
test('version two follows the measured authored song chart and actual duration',async()=>{
 const m=await import('../lib/dance-machine.ts');const {DANCE_TRACK,DANCE_TRACK_CHART}=await import('../lib/dance-track.ts');
 assert.deepEqual(m.generateDanceChart('first',2),DANCE_TRACK_CHART);assert.deepEqual(m.generateDanceChart('second',2),DANCE_TRACK_CHART);
 const {cmd}=setup();await cmd('a','join',profile);const {danceRound:r}=await cmd('a','dance-start');assert.equal(r.version,2);assert.equal(r.trackId,DANCE_TRACK.id);assert.equal(r.endsAt-r.startsAt,DANCE_TRACK.durationMs);
 assert.ok(DANCE_TRACK_CHART.every(n=>n.atMs>=0&&n.atMs+m.DANCE_HIT_WINDOW_MS<DANCE_TRACK.durationMs));
});
test('legacy version one chart remains byte-compatible and its stored round can settle',async()=>{
 const m=await import('../lib/dance-machine.ts');const legacy=m.generateDanceChart('legacy',1);assert.equal(legacy.length,116);assert.equal(legacy[0].atMs,2257.5);assert.equal(legacy.at(-1).atMs,59757.5);assert.deepEqual(m.generateDanceChart('legacy'),legacy);
 const {cmd,store,advance}=setup();const joined=await cmd('a','join',profile);const startsAt=joined.serverNow;
 store.rooms.get('main').danceRound={id:'legacy-test',version:1,seed:'legacy',trackId:'arabic-nights',createdAt:startsAt-5000,startsAt,endsAt:startsAt+60000,rosterFrozen:true,roster:[{id:'a',name:'Guest',preset:'cat',slot:0,isNpc:false}],results:[]};
 advance(60000);const settled=await cmd('a','dance-submit',{roundId:'legacy-test',hits:legacy.map(n=>({noteId:n.id,offsetMs:0}))});assert.equal(settled.danceRound.results[0].score,116000);
});
test('version two rejects legacy-only note IDs even within generic payload bounds',async()=>{
 const {cmd,advance}=setup();await cmd('a','join',profile);const {danceRound:r}=await cmd('a','dance-start');advance(r.endsAt-r.createdAt);
 const count=generateDanceChart(r.seed,r.version).length;assert.ok(count<DANCE_MAX_NOTES);
 await assert.rejects(cmd('a','dance-submit',{roundId:r.id,hits:[{noteId:count,offsetMs:0}]}),{code:'INVALID_COMMAND'});
});


test('new dance rounds score only the five visible ambient identities and never fill empty seats',async()=>{
 const {cmd,advance,service}=setup();await cmd('a','join',profile);const snapshot=await cmd('a','dance-start');
 const expected=['ambient-pepper','ambient-luna','ambient-tower','ambient-momo','ambient-capy'].sort();
 assert.deepEqual(snapshot.danceRound.roster.filter(p=>p.isNpc).map(p=>p.id).sort(),expected);
 assert.equal(snapshot.danceRound.roster.length,6);
 advance(5000);await cmd('a','heartbeat');advance(DANCE_DURATION_MS);
 const end=await service.snapshot('main','a');assert.deepEqual(end.danceRound.results.filter(p=>p.actorId.startsWith('ambient-')).map(p=>p.actorId).sort(),expected);
});


test('current and persisted NPC ranking names follow their character while human names and chats stay untouched', async () => {
 const {CLUB_AVATAR_CATALOG}=await import('../lib/club-avatar-catalog.ts');
 const {AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
 const {cmd,store,service}=setup();
 const nickname='Momo 自己的昵称';
 await cmd('human','join',{name:nickname,preset:'milk-frog'});
 const current=await cmd('human','dance-start');
 const canonicalName=preset=>CLUB_AVATAR_CATALOG.find(avatar=>avatar.id===resolveAvatarPreset(preset)).label;
 for(const entry of current.danceRound.roster) assert.equal(entry.name,entry.isNpc?canonicalName(entry.preset):nickname);
 await cmd('human','chat',{text:'奶蛙是我的分身，昵称我自己取'});
 const room=store.rooms.get('main');
 room.danceRound.rosterFrozen=true;
 room.danceRound.startsAt=current.serverNow-60000;
 room.danceRound.endsAt=current.serverNow;
 room.danceRound.roster=AVATAR_PRESETS.flatMap((preset,index)=>[
  {id:`npc-${index}`,name:`旧昵称-${index}`,preset,slot:index,isNpc:true},
  {id:`ambient-${index}`,name:`自填昵称-${index}`,preset,slot:index,isNpc:false},
 ]);
 room.danceRound.results=room.danceRound.roster.map((entry,index)=>({actorId:entry.id,score:index*100,maxCombo:index,counts:{cool:index,good:0,bad:0,miss:0},submittedAt:current.serverNow}));
 const before=structuredClone(room);
 const snapshot=await service.snapshot('main','human');
 for(const [index,entry] of snapshot.danceRound.roster.entries()) assert.equal(entry.name,entry.isNpc?canonicalName(entry.preset):`自填昵称-${Math.floor(index/2)}`);
 assert.equal(snapshot.participants[0].name,nickname);
 assert.equal(snapshot.participants[0].chat.text,'奶蛙是我的分身，昵称我自己取');
 assert.deepEqual(snapshot.events,before.events);
 assert.deepEqual(snapshot.danceRound.results,before.danceRound.results);
 assert.deepEqual(store.rooms.get('main'),before,'legacy name projection does not rewrite scores, rounds or human data');
 assert.deepEqual((await service.snapshot('main','late-viewer')).danceRound,snapshot.danceRound);
});
