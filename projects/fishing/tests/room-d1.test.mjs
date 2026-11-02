import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

// SQLite executes the real adapter SQL, including multi-statement atomic CAS.
class SQLiteD1 {
  sql=new DatabaseSync(':memory:');
  statements=[];
  constructor(){this.sql.exec(`CREATE TABLE nightclub_rooms(room_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,state_json TEXT NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE nightclub_visits(room_id TEXT NOT NULL,actor_id TEXT NOT NULL,last_sequence INTEGER NOT NULL,state_json TEXT NOT NULL,updated_at INTEGER NOT NULL,move_sequence INTEGER NOT NULL DEFAULT 0,move_json TEXT,PRIMARY KEY(room_id,actor_id)); CREATE TABLE nightclub_sessions(token_hash TEXT PRIMARY KEY,actor_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL); CREATE TABLE nightclub_admission_buckets(bucket_hash TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,admissions INTEGER NOT NULL);`);}
  prepare(sql){const db=this.sql,statements=this.statements;let params=[];return{bind(...v){params=v;return this;},async first(){statements.push(sql);return db.prepare(sql).get(...params)??null;},async all(){statements.push(sql);return{results:db.prepare(sql).all(...params)};},async run(){statements.push(sql);const r=db.prepare(sql).run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};}
  async batch(stmts){this.sql.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
async function load(){
  const path=new URL('../lib/room-server-d1.ts',import.meta.url);
  assert.ok(await readFile(path,'utf8').then(()=>true,()=>false),'D1 adapter must implement atomic persistence');
  return await import(path.href);
}
const room={revision:0,participants:[],events:[],totalVisits:0,lightMode:'neon',track:{id:'neon-house',startedAt:0,durationMs:32000},lastControlAt:0};
const visit={lastSequence:0,hasJoined:false,isPresent:false,receipts:[],lastActionAt:0,lastProfileAt:0,lastJoinAt:0,tokens:12,tokenAt:0};

test('established HTTP snapshots avoid bootstrap writes and load room plus visit in one consistent read',async()=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const db=new SQLiteD1();
  const url='https://club.example/api/room?room=main';
  const first=await handleRoomRequest(new Request(url),db);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const original=await first.json();
  db.statements.length=0;
  const response=await handleRoomRequest(new Request(url,{headers:{cookie}}),db);
  assert.equal(response.status,200);
  const snapshot=await response.json();
  assert.deepEqual(snapshot.track,original.track);
  assert.equal(snapshot.self.id,original.self.id);
  assert.deepEqual(db.statements.filter(sql=>/^(INSERT|UPDATE)/.test(sql)),[],'an existing listener poll must not issue any writes');
  assert.equal(db.statements.filter(sql=>/^SELECT/.test(sql)).length,3,'one capability read, one room/visit read and one bounded movement read');
});

test('established shared commands skip bootstrap writes but preserve the two-statement atomic CAS',async()=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const db=new SQLiteD1();
  const url='https://club.example/api/room?room=main';
  const first=await handleRoomRequest(new Request(url),db);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const original=await first.json();
  db.statements.length=0;
  const response=await handleRoomRequest(new Request(url,{method:'POST',headers:{cookie,origin:'https://club.example','content-type':'application/json'},body:JSON.stringify({roomId:'main',requestId:'warm-path-control',sequence:1,type:'lights',lightMode:'ice'})}),db);
  assert.equal(response.status,200);
  const changed=await response.json();
  assert.equal(changed.lightMode,'ice');
  assert.equal(changed.revision,original.revision+1);
  assert.equal(changed.self.lastSequence,1);
  assert.deepEqual(db.statements.filter(sql=>/^INSERT/.test(sql)),[]);
  assert.equal(db.statements.filter(sql=>/^UPDATE/.test(sql)).length,2);
  assert.equal(db.statements.filter(sql=>/^SELECT/.test(sql)).length,3);
});

test('joined reads bootstrap a missing visit without touching the existing room or another actor',async()=>{
  const {D1RoomStore}=await load();
  const {createRoomService}=await import('../lib/room-server.ts');
  const db=new SQLiteD1(),store=new D1RoomStore(db),service=createRoomService(store);
  const first=await service.snapshot('main','first-listener');
  db.statements.length=0;
  const second=await service.snapshot('main','second-listener');
  assert.deepEqual(second.track,first.track);
  assert.equal(second.revision,first.revision);
  assert.equal(second.self.id,'second-listener');
  assert.equal(second.self.lastSequence,0);
  assert.equal(db.statements.filter(sql=>/^INSERT INTO nightclub_rooms/.test(sql)).length,0);
  assert.equal(db.statements.filter(sql=>/^INSERT INTO nightclub_visits/.test(sql)).length,1);
  assert.equal((await store.readVisit('main','first-listener')).lastSequence,0);
});

test('D1 CAS updates room and guest sequence atomically and rejects stale revisions',async()=>{
  const {D1RoomStore}=await load();const d1=new SQLiteD1(),store=new D1RoomStore(d1);
  await store.ensureRoom('main',room);await store.ensureVisit('main','one',visit);
  assert.equal(await store.commit('main',0,{...room,revision:1,totalVisits:1},'one',0,{...visit,lastSequence:1}),true);
  assert.equal(await store.commit('main',0,{...room,revision:1,totalVisits:99},'one',0,{...visit,lastSequence:99}),false);
  assert.equal((await store.readRoom('main')).totalVisits,1);
  assert.equal((await store.readVisit('main','one')).lastSequence,1);
  assert.equal(await store.commit('main',1,{...room,revision:2,totalVisits:99},'one',0,{...visit,lastSequence:99}),false);
  assert.equal((await store.readRoom('main')).revision,1);
});

test('D1 session capabilities are server-issued, reused, and never stored plaintext',async()=>{
  const {resolveDeviceSession}=await load();const d1=new SQLiteD1();
  const first=await resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers:{'cf-connecting-ip':'192.0.2.1'}}),true);
  assert.match(first.setCookie,/HttpOnly/);assert.match(first.setCookie,/Secure/);assert.match(first.setCookie,/SameSite=Lax/);
  const cookie=first.setCookie.split(';')[0];
  const same=await resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers:{cookie}}),false);
  assert.equal(same.actorId,first.actorId);assert.equal(same.setCookie,undefined);
  const row=d1.sql.prepare('SELECT * FROM nightclub_sessions').get();
  assert.equal(row.token_hash.length,64);assert.notEqual(row.token_hash,cookie.split('=')[1]);
  await assert.rejects(()=>resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers:{cookie:'club_device=forged'}}),false),{code:'FORBIDDEN'});
});


test('new session admission atomically caps sixty per network per minute without a lifetime cap',async()=>{
  const {resolveDeviceSession}=await load();const d1=new SQLiteD1();
  const request=()=>new Request('https://club.example/api/room',{headers:{'cf-connecting-ip':'192.0.2.25'}});
  const results=await Promise.allSettled(Array.from({length:65},()=>resolveDeviceSession(d1,request(),true)));
  assert.equal(results.filter((r)=>r.status==='fulfilled').length,60);
  for(const r of results.filter((r)=>r.status==='rejected'))assert.equal(r.reason.code,'RATE_LIMITED');
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_sessions').get().n,60);
  const bucket=d1.sql.prepare('SELECT * FROM nightclub_admission_buckets').get();
  assert.equal(bucket.admissions,60);assert.equal(bucket.bucket_hash.length,64);assert.equal(JSON.stringify(bucket).includes('192.0.2.25'),false);
  const first=results.find((r)=>r.status==='fulfilled').value;
  const existing=await resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers:{cookie:first.setCookie.split(';')[0]}}),true);
  assert.equal(existing.actorId,first.actorId);
  d1.sql.prepare('UPDATE nightclub_admission_buckets SET window_started_at = ?').run(Date.now()-61_000);
  await resolveDeviceSession(d1,request(),true);
  assert.equal(d1.sql.prepare('SELECT admissions FROM nightclub_admission_buckets').get().admissions,1);
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_admission_buckets').get().n,1);
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_sessions').get().n,61);
});

test('missing and malformed trusted addresses share one conservative global admission bucket',async()=>{
  const {resolveDeviceSession}=await load();const d1=new SQLiteD1();
  for(let i=0;i<60;i++){
    const headers=i%2?{'cf-connecting-ip':`not-an-ip-${i}`}:{'x-forwarded-for':`192.0.2.${i}`};
    const session=await resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers}),true);
    assert.ok(session.actorId);
  }
  for(const headers of [{},{'x-forwarded-for':'203.0.113.9'},{'cf-connecting-ip':'bad'}]){
    await assert.rejects(()=>resolveDeviceSession(d1,new Request('https://club.example/api/room',{headers}),true),{code:'RATE_LIMITED'});
  }
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_admission_buckets').get().n,1);
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_sessions').get().n,60);
  const local=await resolveDeviceSession(d1,new Request('http://127.0.0.1:8787/api/room'),true);
  assert.ok(local.actorId);
  assert.equal(d1.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_admission_buckets').get().n,2);
});

test('spectator HTTP controls persist shared state through issued cookies without a join, retaining CSRF and actor protection', async t => {
  const { handleRoomRequest } = await import('../lib/room-server-http.ts');
  const db = new SQLiteD1();
  t.after(() => db.sql.close());
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const url = 'https://club.example/api/room?room=main';
  const bootstrap = async () => {
    const response = await handleRoomRequest(new Request(url), db);
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], snapshot: await response.json() };
  };
  const listener = await bootstrap();
  const observer = await bootstrap();
  assert.notEqual(listener.snapshot.self.id, observer.snapshot.self.id);
  assert.equal(listener.snapshot.self.role, 'visitor');
  const post = (body, cookie = listener.cookie, origin = 'https://club.example') => handleRoomRequest(new Request(url, {
    method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), db);
  const track = { roomId: 'main', requestId: 'http-listener-track', sequence: 1, type: 'track', trackId: 'sun-goes-down' };
  for (const [cookie, origin] of [['', 'https://club.example'], ['club_device=forged', 'https://club.example'], [listener.cookie, 'https://foreign.example']]) {
    const denied = await post(track, cookie, origin);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  }
  const changedResponse = await post(track);
  assert.equal(changedResponse.status, 200);
  const changed = await changedResponse.json();
  assert.equal(changed.self.id, listener.snapshot.self.id);
  assert.equal(changed.self.role, 'visitor');
  assert.equal(changed.self.lastSequence, 1);
  assert.equal(changed.participants.length, 0);
  assert.equal(changed.track.id, 'arabic-nights');
  assert.equal(changed.events.at(-1).actorId, listener.snapshot.self.id);
  const seenResponse = await handleRoomRequest(new Request(url, { headers: { cookie: observer.cookie } }), db);
  const seen = await seenResponse.json();
  assert.equal(seen.self.id, observer.snapshot.self.id);
  assert.deepEqual(seen.track, changed.track);
  const duplicate = await post(track);
  assert.equal((await duplicate.json()).revision, changed.revision);
  const lights = { roomId: 'main', requestId: 'http-listener-lights', sequence: 1, type: 'lights', lightMode: 'ice' };
  const limited = await post(lights, observer.cookie);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  now += 1000;
  const litResponse = await post(lights, observer.cookie);
  assert.equal(litResponse.status, 200);
  const lit = await litResponse.json();
  assert.equal(lit.lightMode, 'ice');
  assert.equal(lit.events.at(-1).actorId, observer.snapshot.self.id);
  assert.equal(lit.participants.length, 0);
  const forged = await post({ ...track, requestId: 'http-spoofed-actor', sequence: 2, actorId: observer.snapshot.self.id });
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).error.code, 'INVALID_COMMAND');
  const finalResponse = await handleRoomRequest(new Request(url, { headers: { cookie: listener.cookie } }), db);
  const final = await finalResponse.json();
  assert.equal(final.lightMode, lit.lightMode);
  assert.deepEqual(final.track, changed.track);
  assert.equal(final.revision, lit.revision);
  assert.equal(final.self.lastSequence, 1);
  assert.equal(final.participants.length, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM nightclub_visits').get().n, 2);
  now += 1000;
  const stepResponse = await post({ roomId: 'main', requestId: 'http-shuffle-next', sequence: 2, type: 'track-step', direction: 1 });
  assert.equal(stepResponse.status, 200);
  const stepped = await stepResponse.json();
  assert.equal(stepped.track.id, final.playlistOrder[(final.playlistOrder.indexOf(final.track.id) + 1) % final.playlistOrder.length]);
  assert.deepEqual(stepped.playlistOrder, final.playlistOrder);
  assert.equal(stepped.track.startedAt, now);
  const lateResponse = await handleRoomRequest(new Request(url, { headers: { cookie: observer.cookie } }), db);
  const late = await lateResponse.json();
  assert.deepEqual(late.track, stepped.track);
  assert.deepEqual(late.playlistOrder, stepped.playlistOrder);
});

test('group HTTP commands persist one server-timed event under cookie identity and reject forged clocks and cross-site triggers',async t=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const db=new SQLiteD1();
  t.after(()=>db.sql.close());
  let now=1_800_000_000_000;
  t.mock.method(Date,'now',()=>now);
  const url='https://club.example/api/room?room=main';
  async function bootstrap(){const response=await handleRoomRequest(new Request(url),db);return {cookie:response.headers.get('set-cookie').split(';')[0],snapshot:await response.json()};}
  const caller=await bootstrap(),observer=await bootstrap();
  const post=(body,cookie=caller.cookie,origin='https://club.example')=>handleRoomRequest(new Request(url,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),db);
  const command={roomId:'main',requestId:'http-group-unison',sequence:1,type:'group-action',kind:'unison'};
  for(const [body,cookie,origin,status] of [
    [command,'','https://club.example',403],
    [command,caller.cookie,'https://foreign.example',403],
    [{...command,startsAt:now},caller.cookie,'https://club.example',400],
    [{...command,actorId:observer.snapshot.self.id},caller.cookie,'https://club.example',400],
    [{...command,version:1},caller.cookie,'https://club.example',400],
    [{...command,version:2},caller.cookie,'https://club.example',400],
  ]){
    const denied=await post(body,cookie,origin);
    assert.equal(denied.status,status);
  }
  const acceptedResponse=await post(command);
  assert.equal(acceptedResponse.status,200);
  const accepted=await acceptedResponse.json();
  assert.equal(accepted.self.id,caller.snapshot.self.id);
  assert.equal(accepted.self.role,'visitor');
  assert.equal(accepted.participants.length,0);
  assert.equal(accepted.groupAction.version,2);
  assert.equal(accepted.groupAction.startsAt,now+3000);
  assert.equal(accepted.groupAction.endsAt,now+21000);
  assert.equal(accepted.groupAction.sourceClockBySlot.length,10);
  assert.equal(accepted.events.at(-1).actorId,caller.snapshot.self.id);
  const replay=await post(command);
  assert.equal((await replay.json()).revision,accepted.revision);
  const competing=await post({...command,requestId:'http-competing-group'},observer.cookie);
  assert.equal(competing.status,429);
  assert.equal(competing.headers.get('retry-after'),'26');
  const rejected=await competing.json();
  assert.equal(rejected.snapshot.self.lastSequence,0);
  assert.deepEqual(rejected.snapshot.groupAction,accepted.groupAction);
  now+=30000;
  const lateResponse=await handleRoomRequest(new Request(url,{headers:{cookie:observer.cookie}}),db);
  const late=await lateResponse.json();
  assert.deepEqual(late.groupAction,accepted.groupAction);
  assert.equal(late.revision,accepted.revision,'event expiry alone performs no persistence mutation');
  assert.equal(late.participants.length,0);
});

test('HTTP accepts all five version-two formations with frozen durations and shared descriptor identity',async t=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const db=new SQLiteD1();
  t.after(()=>db.sql.close());
  let now=1_800_000_000_000;
  t.mock.method(Date,'now',()=>now);
  const url='https://club.example/api/room?room=soundcheck';
  const first=await handleRoomRequest(new Request(url),db);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const observer=await handleRoomRequest(new Request(url),db);
  const observerCookie=observer.headers.get('set-cookie').split(';')[0];
  let sequence=0;
  for(const [kind,duration] of Object.entries({train:28000,wave:10000,unison:18000,battle:26000,grid:22000})) {
    const lead=kind==='wave'?350:3000;
    const command={roomId:'soundcheck',requestId:`http-version-two-${kind}`,sequence:++sequence,type:'group-action',kind};
    const response=await handleRoomRequest(new Request(url,{method:'POST',headers:{cookie,origin:'https://club.example','content-type':'application/json'},body:JSON.stringify(command)}),db);
    assert.equal(response.status,200,kind);
    const accepted=await response.json();
    assert.equal(accepted.groupAction.kind,kind);
    assert.equal(accepted.groupAction.version,2);
    assert.equal(accepted.groupAction.startsAt,now+lead);
    assert.equal(accepted.groupAction.endsAt,now+lead+duration);
    assert.equal(accepted.self.lastSequence,sequence);
    assert.equal(accepted.self.role,'visitor');
    assert.equal(accepted.totalVisits,0);
    const read=await handleRoomRequest(new Request(url,{headers:{cookie:observerCookie}}),db);
    assert.deepEqual((await read.json()).groupAction,accepted.groupAction);
    now=accepted.groupAction.endsAt+5000;
  }
});

for(const [version,duration] of [[1,14000],[2,24000]]) test(`HTTP preserves a persisted version-${version} wave and its original timestamps`,async t=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const {D1RoomStore}=await load();
  const db=new SQLiteD1();
  t.after(()=>db.sql.close());
  const now=1_800_000_000_000;
  t.mock.method(Date,'now',()=>now);
  const legacy={id:`persisted-v${version}-wave`,kind:'wave',version,startsAt:now-2000,endsAt:now-2000+duration,beatMs:500,sourceClockBySlot:Array(10).fill(now-2000)};
  await new D1RoomStore(db).ensureRoom('soundcheck',{...room,groupAction:legacy});
  db.statements.length=0;
  const response=await handleRoomRequest(new Request('https://club.example/api/room?room=soundcheck'),db);
  assert.equal(response.status,200);
  const snapshot=await response.json();
  assert.deepEqual(snapshot.groupAction,legacy);
  assert.equal(snapshot.revision,1,'only the missing lighting epoch receives a one-time upgrade');
  assert.deepEqual(snapshot.lightCycle,{mode:'neon',startedAt:now});
  assert.equal(db.statements.filter(sql=>/^UPDATE nightclub_rooms/.test(sql)).length,1);
  assert.deepEqual((await new D1RoomStore(db).readRoom('soundcheck')).groupAction,legacy);
  db.statements.length=0;
  const reread=await handleRoomRequest(new Request('https://club.example/api/room?room=soundcheck',{headers:{cookie:response.headers.get('set-cookie').split(';')[0]}}),db);
  assert.deepEqual((await reread.json()).groupAction,legacy);
  assert.equal(db.statements.filter(sql=>/^(INSERT|UPDATE)/.test(sql)).length,0);
});

test('HTTP lighting cycles are shared read-only projections and same-mode manual commands reset the durable epoch',async t=>{
  const {handleRoomRequest}=await import('../lib/room-server-http.ts');
  const {D1RoomStore}=await load();
  const db=new SQLiteD1();
  t.after(()=>db.sql.close());
  const epoch=1_800_000_000_000;
  let now=epoch;
  t.mock.method(Date,'now',()=>now);
  const url='https://club.example/api/room?room=main';
  async function bootstrap(){const response=await handleRoomRequest(new Request(url),db);return {cookie:response.headers.get('set-cookie').split(';')[0],snapshot:await response.json()};}
  const caller=await bootstrap(),observer=await bootstrap();
  assert.deepEqual(caller.snapshot.lightCycle,{mode:'neon',startedAt:epoch});
  assert.deepEqual(observer.snapshot.lightCycle,caller.snapshot.lightCycle);
  const read=async cookie=>(await handleRoomRequest(new Request(url,{headers:{cookie}}),db)).json();
  const post=body=>handleRoomRequest(new Request(url,{method:'POST',headers:{cookie:caller.cookie,origin:'https://club.example','content-type':'application/json'},body:JSON.stringify(body)}),db);
  now+=10_000;
  const command={roomId:'main',requestId:'http-idle-light-one',sequence:1,type:'lights',lightMode:'ice'};
  const selected=await (await post(command)).json();
  assert.deepEqual(selected.lightCycle,{mode:'ice',startedAt:now});
  assert.equal(selected.lightMode,'ice');
  db.statements.length=0;
  now=epoch+69_999;
  assert.equal((await read(observer.cookie)).lightMode,'ice');
  now++;
  const rotated=await read(caller.cookie);
  const seen=await read(observer.cookie);
  assert.equal(rotated.lightMode,'ember');
  assert.equal(seen.lightMode,rotated.lightMode);
  assert.equal(rotated.revision,selected.revision);
  assert.deepEqual(rotated.lightCycle,selected.lightCycle);
  assert.deepEqual(rotated.events,selected.events);
  assert.deepEqual(db.statements.filter(sql=>/^(INSERT|UPDATE)/.test(sql)),[],'idle rotation never writes through D1');
  const persisted=await new D1RoomStore(db).readRoom('main');
  assert.equal(persisted.lightMode,'ice');
  assert.equal(persisted.lightChangedAt,epoch+10_000);
  now=epoch+75_000;
  const reset=await (await post({...command,requestId:'http-idle-light-two',sequence:2,lightMode:'ember'})).json();
  assert.equal(reset.lightMode,'ember');
  assert.deepEqual(reset.lightCycle,{mode:'ember',startedAt:now});
  for(const forged of [{lightChangedAt:epoch},{lightCycle:{mode:'moon',startedAt:epoch}}]){
    const denied=await post({...command,requestId:'http-forged-light-clock',sequence:3,...forged});
    assert.equal(denied.status,400);
  }
  now=epoch+134_999;
  const replay=await (await post(command)).json();
  assert.deepEqual(replay.lightCycle,reset.lightCycle);
  assert.equal(replay.lightMode,'ember');
  now++;
  const next=await read(observer.cookie);
  assert.equal(next.lightMode,'acid');
  assert.deepEqual(next.events,reset.events);
  assert.equal(next.revision,reset.revision);
  assert.equal(next.participants.length,0);
  assert.equal(next.totalVisits,0);
  assert.equal(next.capacity,10);
});
