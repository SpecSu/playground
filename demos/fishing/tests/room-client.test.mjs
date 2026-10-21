import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function clientModule() {
  const url = new URL('../lib/room-client.ts', import.meta.url);
  assert.equal(await readFile(url, 'utf8').then(() => true, () => false), true, 'The live room client must exist');
  return import(url.href);
}
function snapshot(revision = 1, sequence = 0, overrides = {}) {
  return { roomId: 'main', revision, serverNow: 1000 + revision,
    self: { id: 'me', role: 'visitor', lastSequence: sequence }, participants: [],
    capacity: 10, track: { id: 'midnight-drive', startedAt: 1000, durationMs: 120000 },
    lightMode: 'neon', events: [], totalVisits: 1, ...overrides };
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {'content-type':'application/json'} });

test('clock measures server time from the network midpoint and prefers low latency', async () => {
  const { ServerClock } = await clientModule();
  const clock = new ServerClock();
  assert.equal(clock.offsetMs, 0);
  clock.observe(1100, 100, 200);
  assert.equal(clock.offsetMs, 950);
  clock.observe(1600, 200, 1000);
  assert.equal(clock.offsetMs, 950, 'Slow requests must not drag the audio timeline');
  clock.observe(1520, 500, 520);
  assert.equal(clock.offsetMs, 1010);
  assert.equal(clock.serverTime(2000), 3010);
});

test('clock discards invalid samples and ages out old best latency measurements', async () => {
  const { ServerClock } = await clientModule();
  const clock = new ServerClock();
  clock.observe(1010, 0, 20);
  clock.observe(Number.NaN, 0, 20);
  clock.observe(0, 100, 20);
  assert.equal(clock.offsetMs, 1000);
  clock.observe(73050, 70000, 70100);
  assert.equal(clock.offsetMs, 3000);
  clock.observe(76050, 72000, 72100);
  assert.equal(clock.offsetMs, 3000, 'Equal-latency recent samples should remain stable within window');
});

test('stale and out-of-order room responses cannot rewind the current track', async () => {
  const { shouldAcceptSnapshot } = await clientModule();
  assert.equal(shouldAcceptSnapshot(null, snapshot()), true);
  assert.equal(shouldAcceptSnapshot(snapshot(8), snapshot(7)), false);
  assert.equal(shouldAcceptSnapshot(snapshot(8, 2), snapshot(8, 1)), false);
  assert.equal(shouldAcceptSnapshot(snapshot(8, 2), snapshot(8, 2, {serverNow: 900})), false);
  assert.equal(shouldAcceptSnapshot(snapshot(8), snapshot(9)), true);
});

test('commands serialize and use the latest sequence while returning authoritative state', async () => {
  const { RoomClient } = await clientModule();
  const sent = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = new RoomClient('main', { fetcher: async (_url, init) => {
    if (init.method === 'GET') return response(snapshot(1, 4));
    const body = JSON.parse(init.body); sent.push(body);
    if (sent.length === 1) await gate;
    return response(snapshot(1 + sent.length, body.sequence));
  }});
  await client.refresh();
  const first = client.command({type:'join',name:'Nora',preset:'cat'});
  const second = client.command({type:'action',action:'wave'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.equal(client.getState().pendingCount, 2);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.self.lastSequence, 5);
  assert.equal(b.self.lastSequence, 6);
  assert.deepEqual(sent.map(command => command.sequence), [5,6]);
  assert.equal(client.getState().snapshot.revision, 3);
  assert.equal(client.getState().pendingCount, 0);
  client.stop();
});

test('uncertain commands retry the identical request without inventing local success', async () => {
  const { RoomClient } = await clientModule();
  const sent = [];
  const client = new RoomClient('main', { fetcher: async (_url, init) => {
    if (init.method === 'GET') return response(snapshot());
    const body = JSON.parse(init.body); sent.push(body);
    if (sent.length === 1) throw new TypeError('Connection lost');
    return response(snapshot(2, body.sequence));
  }});
  await client.command({type:'join',name:'Nora',preset:'frog'});
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(client.getState().status, 'live');
  client.stop();
});

test('stale sequence recovers from server state before issuing a new command identity', async () => {
  const { RoomClient } = await clientModule();
  const sent = []; let reads = 0;
  const client = new RoomClient('main', { fetcher: async (_url, init) => {
    if (init.method === 'GET') return response(snapshot(++reads, reads === 1 ? 4 : 8));
    const body = JSON.parse(init.body); sent.push(body);
    if (sent.length === 1) return response({error:{code:'STALE_SEQUENCE',message:'Refresh',lastSequence:8}},409);
    return response(snapshot(3,body.sequence));
  }});
  await client.command({type:'join',name:'Nora',preset:'panda'});
  assert.deepEqual(sent.map(command => command.sequence), [5,9]);
  assert.notEqual(sent[0].requestId, sent[1].requestId);
  client.stop();
});

test('failed network refresh keeps last confirmed snapshot and a visible reconnect state', async () => {
  const { RoomClient } = await clientModule(); let online = true;
  const client = new RoomClient('main', { fetcher: async () => {
    if (!online) throw new TypeError('Offline');
    return response(snapshot(5));
  }});
  await client.refresh(); online = false;
  await assert.rejects(client.refresh());
  assert.equal(client.getState().snapshot.revision, 5);
  assert.equal(client.getState().status, 'reconnecting');
  assert.ok(client.getState().error);
  online = true; await client.refresh();
  assert.equal(client.getState().error, null);
  assert.equal(client.getState().status, 'live');
  client.stop();
});

test('a higher room revision cannot roll back this guest’s confirmed command sequence', async () => {
  const { shouldAcceptSnapshot } = await clientModule();
  assert.equal(shouldAcceptSnapshot(snapshot(8, 5), snapshot(9, 4)), false);
});

test('join rejection applies the fresh spectator snapshot and does not retry forbidden commands', async () => {
  const { RoomClient } = await clientModule(); let writes = 0;
  const client = new RoomClient('main', { fetcher: async (_url, init) => {
    if (init.method === 'GET') return response(snapshot(1, 2, {self:{id:'me',role:'participant',lastSequence:2}}));
    writes++;
    return response({error:{code:'NOT_PARTICIPANT',message:'Your spot has expired.'}, snapshot:snapshot(2,2)},403);
  }});
  await assert.rejects(client.command({type:'action',action:'wave'}), /expired/);
  assert.equal(client.getState().snapshot.self.role, 'visitor');
  assert.equal(writes, 1);
  client.stop();
});

test('unavailable initial room reads expose a useful visible error, including admission limits', async () => {
  const { RoomClient } = await clientModule();
  const client = new RoomClient('main', {fetcher:async()=>response({error:{code:'RATE_LIMITED',message:'Too many visitors. Try again shortly.'}},429)});
  await assert.rejects(client.refresh());
  assert.equal(client.getState().status,'reconnecting');
  assert.match(client.getState().error,/Too many visitors/);
  assert.equal(client.getState().snapshot,null);
  client.stop();
});

test('leaving the page cancels queued commands before they can create a room contribution', async () => {
  const { RoomClient } = await clientModule(); let requests = 0;
  const client = new RoomClient('main',{fetcher:async()=>{requests++;return response(snapshot());}});
  const joining = client.command({type:'join',name:'Nora',preset:'cat'});
  client.stop();
  await assert.rejects(joining);
  assert.equal(requests,0);
});

test('rate-limited room polling respects the bounded server retry delay', async t => {
  const { RoomClient } = await clientModule();
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
  let reads=0;
  const client=new RoomClient('main',{fetcher:async()=>{reads++;return response({error:{code:'RATE_LIMITED',message:'Please wait.',retryAfterMs:12000}},429);}});
  client.start();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);
  t.mock.timers.tick(11999);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1,'Polling must not hammer the admission limit');
  t.mock.timers.tick(1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,2);
  client.stop();
});

test('a bootstrap response arriving after stop never launches its waiting join', async () => {
  const { RoomClient } = await clientModule();
  const methods = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = new RoomClient('main',{fetcher:async(_url,init)=>{
    methods.push(init.method);
    if(init.method==='GET') await gate;
    return response(snapshot());
  }});
  const joining=client.command({type:'join',name:'Nora',preset:'cat'});
  await new Promise(resolve=>setImmediate(resolve));
  client.stop(); release();
  await assert.rejects(joining);
  assert.deepEqual(methods,['GET']);
  assert.equal(client.getState().snapshot,null);
});

test('a stopped in-flight command cannot report late success or retry', async () => {
  const { RoomClient } = await clientModule();
  const methods = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const client=new RoomClient('main',{fetcher:async(_url,init)=>{
    methods.push(init.method);
    if(init.method==='POST')await gate;
    return response(snapshot());
  }});
  const joining=client.command({type:'join',name:'Nora',preset:'cat'});
  await new Promise(resolve=>setImmediate(resolve));
  client.stop();release();
  await assert.rejects(joining);
  assert.deepEqual(methods,['GET','POST']);
});

test('browser fetch uses its global receiver rather than the RoomClient instance', async t => {
  const { RoomClient } = await clientModule();
  const receivers=[];
  t.mock.method(globalThis, 'fetch', async function (_url, init) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return response(snapshot(init.method === 'GET' ? 1 : 2));
  });
  const client=new RoomClient('main');
  await client.refresh();
  await client.command({type:'join',name:'Nora',preset:'cat'});
  assert.equal(client.getState().status,'live');
  assert.equal(receivers.length,2);
  assert.ok(receivers.every(receiver=>receiver===globalThis));
  client.stop();
});

test('transport diagnostics report bounded error identity without request data or error extras', async t => {
  const { RoomClient } = await clientModule();
  const warnings=[];
  t.mock.method(console,'warn',(...args)=>warnings.push(args));
  const error=new TypeError('Illegal invocation');
  error.headers={cookie:'private-cookie'};
  error.body='private-name';
  const client=new RoomClient('main',{fetcher:async()=>{throw error;}});
  await assert.rejects(client.refresh());
  await assert.rejects(client.refresh());
  assert.equal(warnings.length,1,'Repeated identical transport failures log once until an HTTP response succeeds');
  assert.deepEqual(warnings[0],['[room-client] Transport failed before HTTP response.',{name:'TypeError',message:'Illegal invocation'}]);
  assert.doesNotMatch(JSON.stringify(warnings),/private-cookie|private-name|headers|body/);
  client.stop();
});

test('transport diagnostics redact URLs and header-shaped text from bounded messages', async t => {
  const { RoomClient } = await clientModule();
  const warnings=[];
  t.mock.method(console,'warn',(...args)=>warnings.push(args));
  const client=new RoomClient('main',{fetcher:async()=>{
    throw new TypeError('Failure at https://private.example/api?token=secret\nCookie: private-cookie\nAuthorization: Bearer private-token\n'+'x'.repeat(500));
  }});
  await assert.rejects(client.refresh());
  const diagnostic=warnings[0]?.[1];
  assert.equal(diagnostic?.name,'TypeError');
  assert.ok(diagnostic.message.length<=240);
  assert.doesNotMatch(diagnostic.message,/private|secret|Bearer/);
  client.stop();
});

test('a track click posts during an in-flight poll and confirms immediately without waiting for the poll timer', async t => {
  const { RoomClient } = await clientModule();
  const before=snapshot(1,0,{track:{id:'neon-house',startedAt:1000,durationMs:64000}});
  const after=snapshot(2,1,{track:{id:'sun-goes-down',startedAt:2000,durationMs:64000}});
  let reads=0,posts=0,releasePoll,releaseCommand;
  const pollGate=new Promise(resolve=>{releasePoll=resolve;});
  const commandGate=new Promise(resolve=>{releaseCommand=resolve;});
  const client=new RoomClient('main',{fetcher:async(_url,init)=>{
    if(init.method==='GET'){
      reads++;
      if(reads>1)await pollGate;
      return response(before);
    }
    posts++;
    await commandGate;
    return response(after);
  }});
  t.after(()=>client.stop());
  await client.refresh();
  const polling=client.refresh();
  const changing=client.command({type:'track-step',direction:1});
  assert.equal(client.getState().pendingCount,1,'pending is published synchronously when the click is accepted');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posts,1,'the click must not wait for an already-running poll');
  assert.deepEqual(client.getState().snapshot.track,before.track,'a requested song is not fabricated before server confirmation');
  releaseCommand();
  const confirmed=await changing;
  assert.deepEqual(confirmed.track,after.track);
  assert.deepEqual(client.getState().snapshot.track,after.track,'the command response applies without another GET');
  assert.equal(client.getState().pendingCount,0);
  releasePoll();await polling;
  assert.deepEqual(client.getState().snapshot.track,after.track,'the delayed old poll cannot roll the song back');
});

test('a failed song switch clears pending feedback, keeps the confirmed song and permits an explicit retry', async t => {
  const { RoomClient } = await clientModule();
  const before=snapshot(1,0,{track:{id:'neon-house',startedAt:1000,durationMs:64000}});
  let posts=0;
  const client=new RoomClient('main',{fetcher:async(_url,init)=>{
    if(init.method==='GET')return response(before);
    posts++;
    const command=JSON.parse(init.body);
    if(posts===1)return response({error:{code:'RATE_LIMITED',message:'Please wait.',retryAfterMs:400},snapshot:before},429);
    return response(snapshot(2,command.sequence,{track:{id:'sun-goes-down',startedAt:3000,durationMs:64000}}));
  }});
  t.after(()=>client.stop());
  await client.refresh();
  await assert.rejects(client.command({type:'track-step',direction:1}),{code:'RATE_LIMITED',retryAfterMs:400});
  assert.equal(posts,1,'rate-limited clicks are not silently retried or queued');
  assert.equal(client.getState().pendingCount,0);
  assert.deepEqual(client.getState().snapshot.track,before.track);
  const retried=await client.command({type:'track-step',direction:1});
  assert.equal(posts,2);
  assert.equal(retried.track.id,'sun-goes-down');
  assert.equal(client.getState().pendingCount,0);
});

test('group triggers send only a kind and never invent timestamps before the authoritative response',async t=>{
  const {RoomClient}=await clientModule();
  const groupAction={id:'server-issued-event',kind:'battle',startsAt:4000,endsAt:30000,beatMs:500,version:2,sourceClockBySlot:Array(10).fill(4000)};
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const sent=[];
  const client=new RoomClient('main',{fetcher:async(_url,init)=>{
    if(init.method==='GET')return response(snapshot());
    const body=JSON.parse(init.body);sent.push(body);await gate;
    return response(snapshot(2,body.sequence,{groupAction}));
  }});
  t.after(()=>client.stop());
  await client.refresh();
  const trigger=client.command({type:'group-action',kind:'battle'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.length,1);
  assert.deepEqual(Object.keys(sent[0]).sort(),['kind','requestId','roomId','sequence','type']);
  assert.equal(sent[0].kind,'battle');
  assert.equal(client.getState().snapshot.groupAction,undefined);
  release();
  const confirmed=await trigger;
  assert.deepEqual(confirmed.groupAction,groupAction);
  assert.deepEqual(client.getState().snapshot.groupAction,groupAction);
  assert.equal(client.getState().pendingCount,0);
});

test('client snapshots retain the original version-one group descriptor while newer clients are available',async t=>{
  const {RoomClient}=await clientModule();
  const legacy={id:'legacy-wave',kind:'wave',startsAt:4000,endsAt:18000,beatMs:500,version:1,sourceClockBySlot:Array(10).fill(4000)};
  const client=new RoomClient('main',{fetcher:async()=>response(snapshot(5,0,{groupAction:legacy}))});
  t.after(()=>client.stop());
  await client.refresh();
  assert.deepEqual(client.getState().snapshot.groupAction,legacy);
});
