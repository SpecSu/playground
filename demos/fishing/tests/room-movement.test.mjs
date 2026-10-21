import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
const { createRoomService } = await import('../lib/room-server.ts');
const { D1RoomStore } = await import('../lib/room-server-d1.ts');
const { handleRoomRequest } = await import('../lib/room-server-http.ts');
const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
const { stagePosition } = await import('../lib/club-scene-math.ts');

class SQLiteD1 {
  sql=new DatabaseSync(':memory:'); statements=[];
  constructor(){this.sql.exec(`CREATE TABLE nightclub_rooms(room_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,state_json TEXT NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE nightclub_visits(room_id TEXT NOT NULL,actor_id TEXT NOT NULL,last_sequence INTEGER NOT NULL,state_json TEXT NOT NULL,updated_at INTEGER NOT NULL,move_sequence INTEGER NOT NULL DEFAULT 0,move_json TEXT,PRIMARY KEY(room_id,actor_id)); CREATE TABLE nightclub_sessions(token_hash TEXT PRIMARY KEY,actor_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL); CREATE TABLE nightclub_admission_buckets(bucket_hash TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,admissions INTEGER NOT NULL);`);}
  prepare(sql){const db=this.sql,statements=this.statements;let params=[];return{bind(...v){params=v;return this;},async first(){statements.push(sql);return db.prepare(sql).get(...params)??null;},async all(){statements.push(sql);return{results:db.prepare(sql).all(...params)};},async run(){statements.push(sql);return{success:true,meta:{changes:Number(db.prepare(sql).run(...params).changes)}};}};}
  async batch(stmts){this.sql.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const NOW=1_800_000_000_000;
async function module(){const path=new URL('../lib/room-movement-server.ts',import.meta.url);assert.ok(await readFile(path,'utf8').then(()=>true,()=>false),'movement server implementation must exist');return import(path.href);}
async function setup(start=NOW){const db=new SQLiteD1();let now=start;const rooms=createRoomService(new D1RoomStore(db),{now:()=>now});const a=await rooms.command('a',{roomId:'main',requestId:'join-actor-a',sequence:1,type:'join',name:'A',preset:'cat'});const b=await rooms.command('b',{roomId:'main',requestId:'join-actor-b',sequence:1,type:'join',name:'B',preset:'frog'});const {D1MovementStore}=await import('../lib/room-movement-d1.ts');const {createMovementService}=await module();const store=new D1MovementStore(db);const service=createMovementService(store,{now:()=>now});return{db,rooms,store,service,advance:(ms)=>{now+=ms;},now:()=>now,a:a.participants.find(p=>p.id==='a'),b:b.participants.find(p=>p.id==='b')};}
function move(p,seq=1,extra={}){const at=clubMotionAt(NOW,p.slot);return{roomId:'main',moveSequence:seq,joinedAt:p.joinedAt,groupId:null,mode:'manual',x:at.x,z:at.z,heading:0,vx:0.8,vz:0,...extra};}

test('movement contract exists and rejects actor spoofing and nonfinite inputs',async()=>{
 const {validateMovementCommand}=await module();const p={slot:0,joinedAt:NOW};assert.equal(validateMovementCommand(move(p)).moveSequence,1);
 for(const extra of [{actorId:'b'},{x:NaN},{z:Infinity},{vx:2},{moveSequence:0},{moveSequence:1.2},{joinedAt:-1},{groupId:''},{mode:'fly'}])assert.throws(()=>validateMovementCommand(move(p,1,extra)));
});

test('different actors move without changing room revision, normal sequences or state JSON',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());const before=await s.rooms.snapshot('main','a');const visit=s.db.sql.prepare('SELECT * FROM nightclub_visits WHERE actor_id=?').get('a');s.db.statements.length=0;
 const [a,b]=await Promise.all([s.service.command('a',move(s.a)),s.service.command('b',move(s.b))]);assert.equal(a.movement.actorId,'a');assert.equal(b.movement.actorId,'b');assert.equal(a.lastMoveSequence,1);assert.equal((await s.rooms.snapshot('main','a')).revision,before.revision);
 const next=s.db.sql.prepare('SELECT * FROM nightclub_visits WHERE actor_id=?').get('a');assert.equal(next.last_sequence,visit.last_sequence);assert.equal(next.state_json,visit.state_json);assert.equal(s.db.statements.filter(q=>/^UPDATE nightclub_rooms/.test(q)).length,0);
 await s.rooms.command('a',{roomId:'main',requestId:'profile-actor-a',sequence:2,type:'profile',name:'Changed',preset:'dog'});assert.equal(s.db.sql.prepare('SELECT move_sequence FROM nightclub_visits WHERE actor_id=?').get('a').move_sequence,1);
});

test('duplicate requests are idempotent, conflicting reuse rejects, delayed movement cannot undo stop',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());const first=move(s.a);await s.service.command('a',first);s.db.statements.length=0;const replay=await s.service.command('a',first);assert.equal(replay.lastMoveSequence,1);assert.equal(s.db.statements.filter(q=>/^UPDATE/.test(q)).length,0);
 await assert.rejects(()=>s.service.command('a',{...first,heading:1}),{code:'REQUEST_CONFLICT'});
 const stop=await s.service.command('a',move(s.a,3,{vx:0,vz:0}));assert.equal(stop.movement.vx,0);const delayed=await s.service.command('a',move(s.a,2));assert.equal(delayed.accepted,false);assert.equal(delayed.lastMoveSequence,3);assert.equal(delayed.movement.vx,0);
});

test('own movement budget permits a real stop when exhausted but not unlimited repeated stopped writes',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());await s.service.command('a',move(s.a,1));await s.service.command('a',move(s.a,2));await assert.rejects(()=>s.service.command('a',move(s.a,3)),{code:'RATE_LIMITED'});
 const stopped=await s.service.command('a',move(s.a,4,{vx:0,vz:0}));assert.equal(stopped.movement.vx,0);await assert.rejects(()=>s.service.command('a',move(s.a,5,{vx:0,vz:0,heading:1})),{code:'RATE_LIMITED'});
 s.advance(500);await s.service.command('a',move(s.a,6));
});

test('floor, booth, excessive displacement and unseated identities are rejected',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());for(const extra of [{x:99},{x:0,z:0},stagePosition(4.3,6),stagePosition(-4.3,5.9)])await assert.rejects(()=>s.service.command('a',move(s.a,1,extra)),{code:'INVALID_COMMAND'});
 await assert.rejects(()=>s.service.command('nobody',move(s.a)),{code:'NOT_PARTICIPANT'});await s.service.command('a',move(s.a));s.advance(500);await assert.rejects(()=>s.service.command('a',move(s.a,2,stagePosition(3.8,5.5))),{code:'INVALID_COMMAND'});
});

test('first manual handoff adopts the valid yielded display pose and then enforces travel budget',async t=>{
 const epoch=1_791_806_400_000;
 // Actual renderer reproduction: a peer at slot zero's route makes the owner
 // yield 2.4143 m from its canonical route after 43.55 seconds.
 const displayed={x:-0.724461502839028,z:2.9300468778778126};
 for(const priorAuto of [false,true]){
  const s=await setup(epoch);t.after(()=>s.db.sql.close());
  if(priorAuto){const initial=clubMotionAt(epoch,s.a.slot);await s.service.command('a',move(s.a,1,{mode:'auto',x:initial.x,z:initial.z,vx:0,vz:0}));}
  s.advance(43550);
  const canonical=clubMotionAt(s.now(),s.a.slot);
  assert.ok(Math.hypot(displayed.x-canonical.x,displayed.z-canonical.z)>2.4);
  const sequence=priorAuto?2:1;
  const reply=await s.service.command('a',move(s.a,sequence,{...displayed,vx:0.1,vz:0}));
  assert.equal(reply.accepted,true);
  assert.equal(reply.movement.x,displayed.x);
  assert.equal(reply.movement.z,displayed.z);
  const stored=await s.store.readState('main','a');
  assert.equal(stored.movement.distanceCredit,1.8*1.5,'adoption only seeds the bounded jitter budget');
  await assert.rejects(()=>s.service.command('a',move(s.a,sequence+1,stagePosition(3.8,5.5))),{code:'INVALID_COMMAND'});
 }
});

test('group and membership epochs prevent old packets from reviving after transitions',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());await s.service.command('a',move(s.a));const group=await s.rooms.command('b',{roomId:'main',requestId:'group-epoch-1',sequence:2,type:'group-action',kind:'wave'});
 await assert.rejects(()=>s.service.command('a',move(s.a,2)),{code:'STALE_MOVEMENT_EPOCH'});await assert.rejects(()=>s.service.command('a',move(s.a,2,{groupId:group.groupAction.id})),{code:'GROUP_ACTIVE'});
 s.advance(group.groupAction.endsAt-s.now()+1);await s.service.command('a',move(s.a,2,{groupId:group.groupAction.id}));
 await s.rooms.command('a',{roomId:'main',requestId:'leave-epoch-a',sequence:2,type:'leave'});s.advance(1100);const rejoined=await s.rooms.command('a',{roomId:'main',requestId:'rejoin-epoch-a',sequence:3,type:'join',name:'A',preset:'cat'});await assert.rejects(()=>s.service.command('a',move(s.a,3,{groupId:group.groupAction.id})),{code:'STALE_MOVEMENT_EPOCH'});assert.notEqual(rejoined.participants.find(p=>p.id==='a').joinedAt,s.a.joinedAt);
});

test('room revision guard retries a changed room only once and cannot write through active group',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());const original=s.store.commit.bind(s.store);let count=0;s.store.commit=async(...args)=>{count++;if(count===1)await s.rooms.command('b',{roomId:'main',requestId:'racing-group-b',sequence:2,type:'group-action',kind:'wave'});return original(...args);};await assert.rejects(()=>s.service.command('a',move(s.a)),{code:'STALE_MOVEMENT_EPOCH'});assert.equal(count,1);assert.equal(s.db.sql.prepare('SELECT move_sequence FROM nightclub_visits WHERE actor_id=?').get('a').move_sequence,0);
});

test('movement reads are bounded to supplied participants and preserve old group mode for presentation',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());await s.service.command('a',move(s.a));await s.service.command('b',move(s.b));const one=await s.store.readParticipantMovements('main',[s.a]);assert.equal(one.length,1);assert.equal(one[0].actorId,'a');assert.deepEqual(await s.store.readParticipantMovements('main',[]),[]);assert.deepEqual(await s.store.readParticipantMovements('main',[{...s.a,joinedAt:NOW+1}]),[]);
});

test('HTTP requires existing cookie, same-origin JSON, server membership and strict fields',async t=>{
 const {handleMovementRequest}=await import('../lib/room-movement-http.ts');const db=new SQLiteD1();t.after(()=>db.sql.close());const url='https://club.example/api/room';const boot=await handleRoomRequest(new Request(url),db);const cookie=boot.headers.get('set-cookie').split(';')[0];const postRoom=async body=>(await handleRoomRequest(new Request(url,{method:'POST',headers:{cookie,origin:'https://club.example','content-type':'application/json'},body:JSON.stringify(body)}),db)).json();const joined=await postRoom({roomId:'main',requestId:'http-movement-join',sequence:1,type:'join',name:'A',preset:'cat'});const p=joined.participants[0];const point=clubMotionAt(Date.now(),p.slot);const body=move(p,1,{x:point.x,z:point.z});
 const request=(headers={},payload=body,method='POST')=>new Request(`${url}/move`,{method,headers:{cookie,origin:'https://club.example','content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(payload)}:{})});
 for(const [req,status] of [[request({cookie:''}),403],[request({origin:'https://evil.example'}),403],[request({'content-type':'text/plain'}),415],[request({}, {...body,actorId:'spoof'}),400],[request({},body,'GET'),405]])assert.equal((await handleMovementRequest(req,db)).status,status);
 const response=await handleMovementRequest(request(),db);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const data=await response.json();assert.equal(data.movement.actorId,joined.self.id);assert.equal(data.lastMoveSequence,1);assert.equal((await handleMovementRequest(request(),undefined)).status,503);
});

test('a delayed start followed quickly by its stop accepts plausible travel without using a client clock',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());const initial=move(s.a);await s.service.command('a',initial);s.advance(50);const shifted={...initial,moveSequence:2,x:initial.x+0.5,z:initial.z,vx:0,vz:0};const stopped=await s.service.command('a',shifted);assert.equal(stopped.movement.x,shifted.x);assert.equal(stopped.movement.vx,0);
});

test('four-second delayed movement accepts plausible travel without allowing the same immediate teleport',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());const initial=move(s.a);
 await s.service.command('a',initial);
 // Slot zero has a clear horizontal stage lane above the booth.
 const travel=1.8*4,far={...initial,moveSequence:2,x:initial.x+travel*Math.SQRT1_2,z:initial.z-travel*Math.SQRT1_2,vx:1.8*Math.SQRT1_2,vz:-1.8*Math.SQRT1_2};
 await assert.rejects(()=>s.service.command('a',far),{code:'INVALID_COMMAND'});
 s.advance(4000);
 const accepted=await s.service.command('a',far);
 assert.equal(accepted.accepted,true);
 assert.equal(accepted.movement.x,far.x);
 assert.equal(accepted.movement.z,far.z);
 const back={...initial,moveSequence:3};
 await assert.rejects(()=>s.service.command('a',back),{code:'INVALID_COMMAND'});
 s.advance(4000);
 assert.equal((await s.service.command('a',back)).accepted,true);
 s.advance(30000);
 await s.service.command('a',{...initial,moveSequence:4,vx:0,vz:0});
 const state=await s.store.readState('main','a');
 assert.ok(Math.abs(state.movement.distanceCredit-(1.8*10+1.8*1.5))<1e-8,'long gaps cannot accrue unbounded travel credit');
});

test('real SQLite guard permits both actors against one room revision and blocks stale room/sequence writes',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());await s.service.command('a',move(s.a));await s.service.command('b',move(s.b));const a=await s.store.readState('main','a'),b=await s.store.readState('main','b');const newer=state=>({...state.movement,sample:{...state.movement.sample,moveSequence:2}});assert.equal(await s.store.commit('main','a',a.room.revision,1,newer(a)),true);assert.equal(await s.store.commit('main','b',a.room.revision,1,newer(b)),true);assert.equal(await s.store.commit('main','a',a.room.revision,1,newer(a)),false);s.db.sql.prepare('UPDATE nightclub_rooms SET revision=revision+1 WHERE room_id=?').run('main');assert.equal(await s.store.commit('main','a',a.room.revision,2,{...newer(a),sample:{...newer(a).sample,moveSequence:3}}),false);
});

test('two failed commits yield a bounded busy response and expired seats cannot move',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());let attempts=0;s.store.commit=async()=>{attempts++;return false;};await assert.rejects(()=>s.service.command('a',move(s.a)),{code:'ROOM_BUSY'});assert.equal(attempts,2);s.advance(60000);await assert.rejects(()=>s.service.command('a',move(s.a)),{code:'NOT_PARTICIPANT'});
});

test('snapshot enrichment exposes only public movement, self sequence and at most eleven keyed rows',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());await s.service.command('a',move(s.a));await s.service.command('b',move(s.b));const {withMovementSnapshot}=await import('../lib/room-movement-snapshot.ts');const original=await s.rooms.snapshot('main','a');s.db.statements.length=0;const snapshot=await withMovementSnapshot(original,s.db);assert.equal(snapshot.self.lastMoveSequence,1);assert.equal(snapshot.movements.length,2);assert.equal(snapshot.revision,original.revision);assert.equal(snapshot.self.lastSequence,original.self.lastSequence);assert.equal(JSON.stringify(snapshot).includes('distanceCredit'),false);assert.equal(JSON.stringify(snapshot).includes('fingerprint'),false);assert.equal(s.db.statements.length,1);assert.match(s.db.statements[0],/actor_id IN/);
});

test('migration preserves existing visits and defaults movement sequence without changing ordinary state',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE nightclub_visits(room_id TEXT,actor_id TEXT,last_sequence INTEGER,state_json TEXT,updated_at INTEGER); INSERT INTO nightclub_visits VALUES (\'main\',\'a\',7,\'{"kept":true}\',100);');const sql=await readFile(new URL('../drizzle/0002_independent_movement.sql',import.meta.url),'utf8');db.exec(sql);const row=db.prepare('SELECT * FROM nightclub_visits').get();assert.equal(row.last_sequence,7);assert.equal(row.state_json,'{"kept":true}');assert.equal(row.move_sequence,0);assert.equal(row.move_json,null);
});

test('ten actor movement load has one successful narrow write each and no room revision churn',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());for(let i=2;i<10;i++)await s.rooms.command(`actor-${i}`,{roomId:'main',requestId:`load-join-${i}`,sequence:1,type:'join',name:`P${i}`,preset:'cat'});const room=await s.rooms.snapshot('main','a');let writes=0;const commit=s.store.commit.bind(s.store);s.store.commit=async(...args)=>{writes++;return commit(...args);};s.db.statements.length=0;
 for(let tick=0;tick<20;tick++){if(tick)s.advance(500);await Promise.all(room.participants.map(p=>s.service.command(p.id,move(p,tick+1))));}
 assert.equal(writes,200);assert.equal(s.db.statements.filter(q=>/^UPDATE nightclub_visits SET move_sequence/.test(q)).length,200);assert.equal(s.db.statements.filter(q=>/^UPDATE nightclub_rooms/.test(q)).length,0);assert.equal((await s.rooms.snapshot('main','a')).revision,room.revision);
});

test('inclusive floor boundaries remain valid after world-to-stage floating point conversion',async()=>{
 const {isMovementPositionWalkable}=await module();for(const [u,v] of [[-4.2,-4.2],[-4.2,6],[4.2,-4.2],[4.2,6]]){const point=stagePosition(u,v);assert.equal(isMovementPositionWalkable(point.x,point.z),true,`${u},${v}`);}
});

test('a manual avatar can restart from its parked train-final pose after canonical roaming has moved away',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());
 for(let i=2;i<10;i++)await s.rooms.command(`actor-${i}`,{roomId:'main',requestId:`parked-join-${i}`,sequence:1,type:'join',name:`P${i}`,preset:'cat'});
 const before=await s.rooms.snapshot('main','a');
 const end=s.now()+3000+28000;
 let chosen;
 for(const participant of before.participants)for(let wait=0;wait<25000;wait+=100){
  const parked=clubMotionAt(end,participant.slot),later=clubMotionAt(end+wait,participant.slot);
  const distance=Math.hypot(parked.x-later.x,parked.z-later.z);
  if(!chosen||distance>chosen.distance)chosen={participant,parked,wait,distance};
 }
 assert.ok(chosen.distance>2.05,'fixture must exceed the ordinary first-packet allowance');
 await s.service.command(chosen.participant.id,move(chosen.participant,1,{vx:0,vz:0}));
 const group=await s.rooms.command('b',{roomId:'main',requestId:'parked-group-train',sequence:2,type:'group-action',kind:'train'});
 assert.equal(group.groupAction.endsAt,end);
 s.advance(end+chosen.wait-s.now());
 const drifted=clubMotionAt(s.now(),chosen.participant.slot);
 await assert.rejects(()=>s.service.command(chosen.participant.id,move(chosen.participant,2,{groupId:group.groupAction.id,x:drifted.x,z:drifted.z,vx:0.1,vz:0})),{code:'INVALID_COMMAND'},'known old-manual group endpoint cannot be replaced by an unrelated first adoption');
 const reply=await s.service.command(chosen.participant.id,move(chosen.participant,2,{groupId:group.groupAction.id,x:chosen.parked.x,z:chosen.parked.z,vx:0.1,vz:0}));
 assert.equal(reply.accepted,true);
 assert.equal(reply.movement.x,chosen.parked.x);
 assert.equal(reply.movement.z,chosen.parked.z);
});


test('a version-two wave preserves accepted manual positions without granting group-time travel credit',async t=>{
 const s=await setup();t.after(()=>s.db.sql.close());
 const parked=stagePosition(3.8,5.5);
 const initial=await s.service.command('a',move(s.a,1,{...parked,vx:0,vz:0}));
 const group=await s.rooms.command('b',{roomId:'main',requestId:'stay-parked-wave',sequence:2,type:'group-action',kind:'wave'});
 assert.equal(group.groupAction.version,2);
 assert.equal(group.groupAction.startsAt,s.now()+350);
 assert.equal(group.groupAction.endsAt,s.now()+10350);
 s.advance(group.groupAction.endsAt-s.now()+15000);
 const canonical=clubMotionAt(group.groupAction.endsAt,s.a.slot);
 assert.ok(Math.hypot(parked.x-canonical.x,parked.z-canonical.z)>2.05,'fixture must distinguish the accepted point from the canonical endpoint');
 await assert.rejects(()=>s.service.command('a',move(s.a,2,{groupId:group.groupAction.id,x:canonical.x,z:canonical.z,vx:0.1,vz:0})),{code:'INVALID_COMMAND'},'an unrelated canonical endpoint cannot replace the retained manual point');
 const reply=await s.service.command('a',move(s.a,2,{groupId:group.groupAction.id,...parked,vx:0.1,vz:0}));
 assert.equal(reply.accepted,true);
 assert.equal(reply.movement.x,initial.movement.x);
 assert.equal(reply.movement.z,initial.movement.z);
 assert.equal(reply.movement.groupId,group.groupAction.id);
 const stored=await s.store.readState('main','a');
 assert.equal(stored.movement.distanceCredit,1.8*1.5,'the group interval cannot accumulate a teleport allowance');
 await assert.rejects(()=>s.service.command('a',move(s.a,3,{groupId:group.groupAction.id,x:canonical.x,z:canonical.z,vx:0.1,vz:0})),{code:'INVALID_COMMAND'});
});
