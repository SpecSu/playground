import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { MovementClient, mergeMovementRows } = await import('../lib/room-movement-client.ts');
const actor='me';
const point=(reason='move',x=1)=>({mode:'manual',x,z:2,heading:0,vx:reason==='stop'?0:1,vz:0,reason});
const row=(moveSequence,patch={})=>({actorId:actor,joinedAt:1,groupId:null,mode:'manual',x:1,z:2,heading:0,vx:1,vz:0,acceptedAt:10000,moveSequence,...patch});
const snapshot=(patch={})=>({roomId:'main',serverNow:10000,revision:3,self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:0},participants:[{id:actor,joinedAt:1}],...patch});
async function settle(){for(let n=0;n<12;n++)await Promise.resolve();}
function harness(){
 let time=10000,id=0;const timers=new Map(),requests=[],resets=[],states=[];let refreshes=0;
 const client=new MovementClient({now:()=>time,serverNow:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),fetcher:async(url,init)=>new Promise((resolve,reject)=>requests.push({url,init,body:JSON.parse(init.body),resolve,reject})),onReset:r=>resets.push(r),onChange:s=>states.push(s),onRefresh:()=>refreshes++});
 const advance=async(ms)=>{time+=ms;for(let pass=0;pass<20;pass++){let ran=false;for(const[k,v]of[...timers])if(v.at<=time){timers.delete(k);v.fn();ran=true;}await settle();if(!ran)break;}};
 const reply=(index,patch={})=>{const req=requests[index];req.resolve(new Response(JSON.stringify({roomId:'main',serverNow:time,accepted:true,lastMoveSequence:req.body.moveSequence,movement:{...req.body,actorId:actor,acceptedAt:time},...patch}),{status:200}));};
 const error=(index,code,status=409,extra={})=>requests[index].resolve(new Response(JSON.stringify({error:{code,message:code,...extra}}),{status}));
 client.setSnapshot(snapshot());
 return{client,requests,resets,states,advance,reply,error,get refreshes(){return refreshes;}};
}
test('movement lane has its own sequence and no actor identity in body',async()=>{const h=harness();h.client.offer(point('start'));assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/room/move');assert.equal(h.requests[0].body.moveSequence,1);assert.equal(h.requests[0].body.actorId,undefined);assert.equal(h.requests[0].body.joinedAt,1);assert.equal(h.requests[0].body.groupId,null);assert.equal(h.requests[0].init.credentials,'same-origin');h.client.close();});
test('coalesces latest input to 500ms with only one ordinary request in flight',async()=>{const h=harness();h.client.offer(point('start'));for(let i=0;i<50;i++)h.client.offer(point('move',i));await h.advance(600);assert.equal(h.requests.length,1);h.reply(0);await settle();assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.x,49);h.client.offer(point('move',50));h.reply(1);await settle();await h.advance(499);assert.equal(h.requests.length,2);await h.advance(1);assert.equal(h.requests.length,3);h.client.close();});
test('release sends higher-sequence stop ahead of slow in-flight motion and clears backlog',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('move',2));h.client.offer(point('stop',3));assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.moveSequence,2);assert.equal(h.requests[1].body.vx,0);h.reply(1);await settle();h.reply(0,{accepted:false,lastMoveSequence:2,movement:row(2,{x:3,vx:0})});await h.advance(1000);assert.equal(h.requests.length,2);assert.equal(h.resets.length,0);h.client.close();});
test('rate-limited stop is retained and retried unchanged before newer movement',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('stop',2));h.error(1,'RATE_LIMITED',429,{retryAfterMs:700});await settle();h.client.offer(point('start',3));await h.advance(699);assert.equal(h.requests.length,2);await h.advance(1);assert.equal(h.requests.length,3);assert.deepEqual(h.requests[2].body,h.requests[1].body);h.reply(2);h.reply(0);await settle();assert.equal(h.requests.length,4);assert.equal(h.requests[3].body.x,3);h.client.close();});
test('network-uncertain stop retries identical sequence and payload',async()=>{const h=harness();h.client.offer(point('stop'));h.requests[0].reject(new TypeError('offline'));await settle();await h.advance(500);assert.equal(h.requests.length,2);assert.deepEqual(h.requests[0].body,h.requests[1].body);h.client.close();});
test('old response after seat replacement cannot revive movement',async()=>{const h=harness();h.client.offer(point('start'));h.client.setSnapshot(snapshot({participants:[{id:actor,joinedAt:2}]}));h.reply(0);await settle();assert.equal(h.client.getState().movements.length,0);assert.equal(h.resets.at(-1),'epoch');h.client.offer(point('start'));assert.equal(h.requests[1].body.joinedAt,2);h.client.close();});
test('group count-in drops sends and old held gesture does not become pending',async()=>{const h=harness();const groupAction={id:'g',startsAt:13000,endsAt:18000};h.client.setSnapshot(snapshot({groupAction}));h.client.offer(point('start'));h.client.offer(point('stop'));assert.equal(h.requests.length,0);await h.advance(9000);assert.equal(h.requests.length,0);h.client.offer(point('start'));assert.equal(h.requests[0].body.groupId,'g');h.client.close();});
test('epoch/group rejection clears input and refreshes without replay',async()=>{for(const code of ['STALE_MOVEMENT_EPOCH','GROUP_ACTIVE','REQUEST_CONFLICT','INVALID_COMMAND']){const h=harness();h.client.offer(point('start'));h.client.offer(point('move',4));h.error(0,code,409,{lastMoveSequence:50});await settle();await h.advance(3000);assert.equal(h.requests.length,1);assert.equal(h.refreshes,1);assert.equal(h.resets.at(-1),code==='REQUEST_CONFLICT'?'superseded':'rejected');h.client.close();}});
test('lower-sequence reply never replays the rejected vector with a new sequence',async()=>{const h=harness();h.client.offer(point('start'));h.reply(0,{accepted:false,lastMoveSequence:70,movement:row(70)});await settle();await h.advance(1500);assert.equal(h.requests.length,1);assert.equal(h.resets.at(-1),'superseded');h.client.offer(point('start',4));assert.equal(h.requests[1].body.moveSequence,71);h.client.close();});
test('movement snapshots merge independently of ordinary revision and reject older membership',()=>{const current=[row(7)];assert.equal(mergeMovementRows(current,[row(8)],snapshot().participants)[0].moveSequence,8);assert.equal(mergeMovementRows(current,[row(6)],snapshot().participants)[0].moveSequence,7);assert.deepEqual(mergeMovementRows(current,[row(10)], [{id:actor,joinedAt:2}]),[]);const h=harness();h.client.observeSnapshot(snapshot({revision:1,movements:[row(8)]}));h.client.observeSnapshot(snapshot({revision:99,movements:[row(4)]}));assert.equal(h.client.getState().movements[0].moveSequence,8);h.client.close();});
test('old group row preserves mode, auto requires explicit renderer sample',()=>{const h=harness();h.client.observeSnapshot(snapshot({movements:[row(4)]}));h.client.setSnapshot(snapshot({groupAction:{id:'g',startsAt:1,endsAt:2}}));assert.equal(h.client.getState().movements[0].groupId,null);h.client.offer({...point('auto'),mode:'auto',vx:0,vz:0});assert.equal(h.requests[0].body.mode,'auto');assert.equal(h.requests[0].body.groupId,'g');h.client.close();});
test('close aborts requests and cancels coalesced input',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('move',2));h.client.close();assert.equal(h.requests[0].init.signal.aborted,true);h.reply(0);await h.advance(1000);assert.equal(h.requests.length,1);});
test('four-second replies never create catch-up bursts; stop still overtakes immediately',async()=>{const h=harness();h.client.offer(point('start'));for(let i=1;i<=80;i++){h.client.offer(point('move',i/10));await h.advance(50);}assert.equal(h.requests.length,1);h.reply(0);await settle();assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.x,8);for(let i=1;i<=40;i++){h.client.offer(point('move',8+i/10));await h.advance(50);}h.client.offer(point('stop',12));assert.equal(h.requests.length,3);assert.equal(h.requests[2].body.vx,0);assert.ok(h.requests[2].body.moveSequence>h.requests[1].body.moveSequence);h.reply(2);await settle();await h.advance(2000);h.reply(1);await settle();await h.advance(4000);assert.equal(h.requests.length,3);h.client.close();});
test('network interruption fences uncertain movement with a stop, never replays direction',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('move',2));h.requests[0].reject(new TypeError('connection lost'));await settle();assert.equal(h.resets.at(-1),'network');assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.vx,0);assert.equal(h.requests[1].body.x,2);h.reply(1);await h.advance(4000);assert.equal(h.requests.length,2);h.client.close();});
test('group-final stop retries rate limits and four-second in-flight latency until acknowledged',async()=>{const h=harness();h.client.setSnapshot(snapshot({groupAction:{id:'g2',startsAt:1,endsAt:9999}}));h.client.offer(point('stop',5));h.error(0,'RATE_LIMITED',429,{retryAfterMs:500});await settle();await h.advance(500);assert.equal(h.requests.length,2);await h.advance(4000);assert.equal(h.requests.length,2);assert.deepEqual(h.requests[0].body,h.requests[1].body);h.reply(1);await h.advance(1000);assert.equal(h.requests.length,2);h.client.close();});
test('stop overtaking first start corrects without a renderer and fences late moving start',async()=>{const h=harness();h.client.offer(point('start',1));h.client.offer(point('stop',7));h.error(1,'INVALID_COMMAND',400);await settle();assert.equal(h.resets.at(-1),'rejected');await h.advance(500);assert.equal(h.requests.length,3);const corrected=h.requests[2].body;assert.equal(corrected.moveSequence,3);assert.equal(corrected.vx,0);assert.equal(corrected.vz,0);assert.notEqual(corrected.x,7);h.reply(2);await settle();h.reply(0,{accepted:false,lastMoveSequence:3,movement:row(3,{x:corrected.x,z:corrected.z,vx:0})});await h.advance(3000);assert.equal(h.requests.length,3);assert.equal(h.client.getState().movements[0].vx,0);h.client.close();});
test('duplicate release callbacks do not spend a second stopped-position token',async()=>{const h=harness();h.client.offer(point('stop',2));h.client.offer(point('stop',2));assert.equal(h.requests.length,1);h.reply(0);await settle();h.client.offer(point('stop',2));await h.advance(1000);assert.equal(h.requests.length,1);h.client.close();});
test('accepted room snapshot from another tab resets pending intent before raw observer runs',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('move',7));h.client.setSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:80},movements:[row(80)]}));assert.equal(h.resets.at(-1),'superseded');assert.equal(h.requests[0].init.signal.aborted,true);await h.advance(4000);assert.equal(h.requests.length,1);h.client.close();});
test('known group rejection suppresses reconciliation stops until a fresh canonical snapshot',async()=>{const h=harness();h.client.offer(point('start'));h.error(0,'GROUP_ACTIVE',429,{retryAfterMs:3000});await settle();h.client.offer(point('stop'));h.client.setSnapshot(snapshot());h.client.offer(point('stop',2));assert.equal(h.requests.length,1);h.client.setSnapshot(snapshot({serverNow:10001,groupAction:{id:'g',startsAt:11000,endsAt:13000}}));h.client.offer(point('stop',3));assert.equal(h.requests.length,1);await h.advance(3500);h.client.offer(point('stop',4));assert.equal(h.requests.length,2);h.client.close();});

test('late failed normal request cannot rewind a newer acknowledged parked endpoint',async()=>{const h=harness();h.client.offer(point('start',1));h.client.offer(point('stop',3));h.reply(1);await settle();h.requests[0].reject(new TypeError('late failure'));await settle();await h.advance(4000);assert.equal(h.requests.length,2);assert.equal(h.resets.length,0);assert.equal(h.client.getState().movements[0].x,3);assert.equal(h.client.getState().movements[0].vx,0);h.client.close();});
test('late failed normal request leaves newer in-flight stop and frozen retry untouched',async()=>{const h=harness();h.client.offer(point('start',1));h.client.offer(point('stop',3));h.requests[0].reject(new TypeError('late failure'));await settle();assert.equal(h.resets.length,0);assert.equal(h.requests.length,2);h.error(1,'RATE_LIMITED',429,{retryAfterMs:500});await settle();await h.advance(500);assert.deepEqual(h.requests[2].body,h.requests[1].body);h.reply(2);await h.advance(4000);assert.equal(h.requests.length,3);h.client.close();});
test('another tab taking over a settled parked avatar reconciles idle local prediction once',async()=>{const h=harness();h.client.offer(point('stop',1));h.reply(0);await settle();h.client.observeSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:2},movements:[row(2,{x:8})]}));assert.equal(h.resets.at(-1),'superseded');assert.equal(h.client.getState().movements[0].x,8);const count=h.resets.length;h.client.observeSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:3},movements:[row(3,{x:9})]}));assert.equal(h.resets.length,count,'already following the winner');assert.equal(h.requests.length,1,'observer never writes an automatic takeover');h.client.close();});
test('initial movement hydration and echoes of own ACK do not reset input',async()=>{const h=harness();h.client.setSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:5},movements:[row(5)]}));assert.equal(h.resets.length,0);h.client.offer(point('stop',2));h.reply(0);await settle();h.client.observeSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:6},movements:[row(6,{x:2,vx:0})]}));assert.equal(h.resets.length,0);h.client.close();});

test('same-sequence conflict yields passive supersession, never a corrective takeover stop',async()=>{const h=harness();h.client.offer(point('start'));h.error(0,'REQUEST_CONFLICT',409,{lastMoveSequence:1});await settle();assert.equal(h.resets.at(-1),'superseded');h.client.observeSnapshot(snapshot({self:{id:actor,role:'participant',lastSequence:9,lastMoveSequence:1},movements:[row(1,{x:6})]}));await h.advance(4000);assert.equal(h.requests.length,1);assert.equal(h.client.getState().movements[0].x,6);h.client.close();});

test('uncertain HTTP failure also fences motion without waiting for renderer correction',async()=>{const h=harness();h.client.offer(point('start'));h.client.offer(point('move',3));h.error(0,'UNAVAILABLE',503);await settle();assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.vx,0);assert.equal(h.requests[1].body.x,3);assert.equal(h.resets.at(-1),'network');h.client.close();});

// Node's timers accept arbitrary receivers; Window timers do not. Exercise the
// production defaults with browser-style receiver checks, not injected arrows.
test('browser-owned default timers and fetch keep their global receiver during movement', async t => {
  let time = 10000, timerId = 0;
  const timers = new Map(), requests = [];
  t.mock.method(globalThis, 'setTimeout', function (callback, delay) {
    assert.equal(this, globalThis, 'setTimeout requires its browser global receiver');
    timers.set(++timerId, { callback, at: time + delay });
    return timerId;
  });
  t.mock.method(globalThis, 'clearTimeout', function (id) {
    assert.equal(this, globalThis, 'clearTimeout requires its browser global receiver');
    timers.delete(id);
  });
  t.mock.method(globalThis, 'fetch', function (url, init) {
    assert.equal(this, globalThis, 'fetch requires its browser global receiver');
    return new Promise(resolve => requests.push({ url, body: JSON.parse(init.body), resolve }));
  });
  const client = new MovementClient({ now: () => time, serverNow: () => time });
  t.after(() => client.close());
  client.setSnapshot(snapshot());
  assert.doesNotThrow(() => client.offer(point('start')));
  assert.equal(requests.length, 1, 'first drag reaches the movement endpoint');
  const reply = index => {
    const request = requests[index];
    request.resolve(new Response(JSON.stringify({
      roomId: 'main', serverNow: time, accepted: true,
      lastMoveSequence: request.body.moveSequence,
      movement: { ...request.body, actorId: actor, acceptedAt: time },
    }), { status: 200 }));
  };
  reply(0);
  await settle();
  assert.equal(timers.size, 0, 'acknowledged request clears its timeout');
  client.offer(point('move', 2));
  assert.equal(requests.length, 1, 'next moving sample is coalesced');
  assert.equal(timers.size, 1, 'coalesced movement schedules a wake');
  time += 500;
  for (const [id, timer] of [...timers]) if (timer.at <= time) {
    timers.delete(id); timer.callback();
  }
  assert.equal(requests.length, 2, 'timer wake publishes the coalesced movement');
  assert.doesNotThrow(() => client.offer(point('stop', 3)));
  assert.equal(requests.length, 3, 'release sends its stop ahead of pending motion');
  reply(1); reply(2);
  await settle();
  assert.equal(client.getState().movements[0].vx, 0);
  assert.equal(timers.size, 0, 'both movement request timeouts are cleared');
  client.offer(point('move', 4));
  assert.equal(timers.size, 1);
  client.close();
  assert.equal(timers.size, 0, 'close clears a pending coalescing timer');
});


for(const [kind,version,keepsManual] of [['wave',2,true],['wave',1,false],['train',2,false]]) test(`version-${version} ${kind} stop recovery uses its authoritative parked origin`,async()=>{
 const {clubMotionAt}=await import('../lib/club-scene-motion.ts');
 const h=harness();
 const previous=row(4,{x:5,z:4,heading:0.7,vx:0});
 const participant={id:actor,joinedAt:1,slot:0,actionAt:1,actionUntil:0,routePauseMs:0};
 const groupAction={id:`recovery-${kind}-${version}`,kind,version,startsAt:100,endsAt:9000,beatMs:500,sourceClockBySlot:Array(10).fill(100)};
 h.client.setSnapshot(snapshot({participants:[participant],movements:[previous],groupAction}));
 h.client.offer(point('stop',7));
 h.error(0,'INVALID_COMMAND',400);
 await settle();await h.advance(500);
 assert.equal(h.requests.length,2);
 const recovered=h.requests[1].body;
 const expected=keepsManual?previous:clubMotionAt(groupAction.endsAt,0);
 assert.equal(recovered.x,expected.x);
 assert.equal(recovered.z,expected.z);
 assert.equal(recovered.heading,expected.heading);
 assert.equal(recovered.groupId,groupAction.id);
 assert.equal(recovered.moveSequence,6);
 assert.equal(recovered.vx,0);
 assert.equal(recovered.vz,0);
 h.reply(1);await settle();
 assert.equal(h.client.getState().movements[0].x,expected.x);
 h.client.close();
});
