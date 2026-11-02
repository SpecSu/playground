import "./room-loader.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Tests exercise the production state machine through the same atomic storage contract
// used by D1. Changing seat admission, sequence checks, or CAS retries breaks these.
const moduleUrl = new URL('../lib/room-server.ts', import.meta.url);
async function backend() {
  const exists = await readFile(moduleUrl, 'utf8').then(() => true, () => false);
  assert.equal(exists, true, 'The persistent room service must be implemented');
  return await import(moduleUrl.href);
}

class MemoryStore {
  rooms = new Map();
  visits = new Map();
  conflicts = 0;
  async ensureRoom(id, initial) { if (!this.rooms.has(id)) this.rooms.set(id, structuredClone(initial)); }
  async readRoom(id) { return structuredClone(this.rooms.get(id)); }
  async ensureVisit(roomId, actorId, initial) { const key = `${roomId}:${actorId}`; if (!this.visits.has(key)) this.visits.set(key, structuredClone(initial)); }
  async readVisit(roomId, actorId) { return structuredClone(this.visits.get(`${roomId}:${actorId}`)); }
  async commit(roomId, expectedRevision, next, actorId, expectedSequence, visit) {
    // Yield before CAS so simultaneous commands see genuine conflicts.
    await Promise.resolve();
    const current = this.rooms.get(roomId);
    const key = `${roomId}:${actorId}`;
    if (current.revision !== expectedRevision || (visit && this.visits.get(key).lastSequence !== expectedSequence)) { this.conflicts++; return false; }
    this.rooms.set(roomId, structuredClone(next));
    if (visit) this.visits.set(key, structuredClone(visit));
    return true;
  }
}
const join = (i = 1) => ({roomId:'main', requestId:`join-request-${i}`, sequence:i, type:'join', name:'Guest', preset:'cat'});

async function setup() {
  const b = await backend(); const store = new MemoryStore();
  let now = 1_800_000_000_000;
  const service = b.createRoomService(store, { now: () => now });
  return {b,store,service,advance:(ms) => {now+=ms;}};
}

test('eleven concurrent joins allocate only ten seats and return spectator to the eleventh', async () => {
  const {service,store} = await setup();
  const results = await Promise.all(Array.from({length:11}, (_,i) => service.command(`actor-${i}`, join())));
  assert.equal(results.filter((r)=>r.self.role==='participant').length,10);
  assert.equal(results.filter((r)=>r.self.role==='spectator').length,1);
  const snapshot=await service.snapshot('main','actor-10');
  assert.equal(snapshot.participants.length,10);
  assert.equal(snapshot.totalVisits,11);
  assert.ok(store.conflicts>0);
});

test('duplicate commands are idempotent and old sequences cannot overwrite current state', async () => {
  const {service,advance} = await setup();
  await service.command('actor-1',join()); advance(1000);
  const command={roomId:'main',requestId:'track-request-2',sequence:2,type:'track',trackId:'sun-goes-down'};
  const first=await service.command('actor-1',command);
  const duplicate=await service.command('actor-1',command);
  assert.equal(duplicate.revision,first.revision);
  assert.deepEqual(duplicate.track,first.track);
  await assert.rejects(()=>service.command('actor-1',{...command,requestId:'stale-request',sequence:1,trackId:'mirrorball-disco'}),{code:'STALE_SEQUENCE'});
  await assert.rejects(()=>service.command('actor-1',{...command,trackId:'mirrorball-disco'}),{code:'REQUEST_CONFLICT'});
  assert.equal((await service.snapshot('main','actor-1')).track.id,'arabic-nights');
});

test('expired guests lose their seat and avatar controls, and a waiting spectator can join', async () => {
  const {service,advance}=await setup();
  for(let i=0;i<11;i++) await service.command(`actor-${i}`,join());
  advance(61_000);
  await assert.rejects(()=>service.command('actor-0',{roomId:'main',requestId:'stale-action-2',sequence:2,type:'action',action:'dance'}),{code:'NOT_PARTICIPANT'});
  const fresh=await service.command('actor-10',join(2));
  assert.equal(fresh.self.role,'participant'); assert.equal(fresh.participants.length,1); assert.equal(fresh.totalVisits,11);
});

test('heartbeat preserves a seat and explicit leave makes it immediately available', async () => {
  const {service,advance}=await setup();
  await service.command('actor-1',join()); advance(45_000);
  await service.command('actor-1',{roomId:'main',requestId:'heartbeat-2',sequence:2,type:'heartbeat'}); advance(30_000);
  assert.equal((await service.snapshot('main','actor-1')).participants.length,1);
  const left=await service.command('actor-1',{roomId:'main',requestId:'leave-request-3',sequence:3,type:'leave'});
  assert.equal(left.self.role,'visitor'); assert.equal(left.participants.length,0);
});

test('track changes share one anchor with late joiners and are immutable to invalid payloads', async () => {
  const {service,advance}=await setup();
  await service.command('actor-1',join()); advance(1000);
  const changed=await service.command('actor-1',{roomId:'main',requestId:'track-request-2',sequence:2,type:'track',trackId:'mirrorball-disco'});
  advance(5000); const joined=await service.command('actor-2',join());
  assert.deepEqual(joined.track,changed.track); assert.equal(joined.serverNow-changed.track.startedAt,5000); assert.ok(joined.track.durationMs>0);
  await assert.rejects(()=>service.command('actor-1',{roomId:'main',requestId:'bad-track-3',sequence:3,type:'track',trackId:'https://evil.example/audio'}),{code:'INVALID_COMMAND'});
});

test('spectators can change shared lights without a seat but cannot send emotes, and event history stays capped', async () => {
  const {service,advance}=await setup();
  for(let i=0;i<11;i++) await service.command(`actor-${i}`,join());
  const changed=await service.command('actor-10',{roomId:'main',requestId:'spectator-lights',sequence:2,type:'lights',lightMode:'ice'});
  assert.equal(changed.lightMode,'ice');
  assert.equal(changed.self.role,'spectator');
  assert.equal(changed.participants.length,10);
  assert.equal(changed.participants.some(person=>person.id==='actor-10'),false);
  await assert.rejects(()=>service.command('actor-10',{roomId:'main',requestId:'spectator-action',sequence:3,type:'action',action:'wave'}),{code:'NOT_PARTICIPANT'});
  for(let i=2;i<62;i++){advance(1000);await service.command('actor-0',{roomId:'main',requestId:`action-request-${i}`,sequence:i,type:'action',action:i%2?'dance':'wave'});}
  const snapshot=await service.snapshot('main','actor-0'); assert.ok(snapshot.events.length<=40); assert.ok(JSON.stringify(snapshot).length<24_000);
});

test('a first-time visitor changes songs and lights authoritatively without joining or occupying a seat', async () => {
  const {service,advance}=await setup();
  const before=await service.snapshot('main','listener');
  const changed=await service.command('listener',{roomId:'main',requestId:'visitor-track-1',sequence:1,type:'track',trackId:'sun-goes-down'});
  assert.equal(changed.self.id,before.self.id);
  assert.equal(changed.self.role,'visitor');
  assert.equal(changed.self.lastSequence,1);
  assert.equal(changed.revision,before.revision+1);
  assert.equal(changed.participants.length,0);
  assert.equal(changed.totalVisits,before.totalVisits,'using shared controls does not fabricate a dance-floor join');
  assert.equal(changed.track.id,'arabic-nights');
  assert.equal(changed.track.startedAt,changed.serverNow);
  assert.deepEqual(changed.events.map(event=>event.type),['track']);
  assert.equal(changed.events.at(-1).actorId,'listener');
  assert.equal(changed.events.at(-1).name,'一位听众');
  advance(1200);
  const lit=await service.command('listener',{roomId:'main',requestId:'visitor-lights-2',sequence:2,type:'lights',lightMode:'sunset'});
  const observer=await service.snapshot('main','another-listener');
  assert.deepEqual(observer.track,changed.track);
  assert.equal(observer.lightMode,'sunset');
  assert.equal(observer.revision,lit.revision);
  assert.equal(observer.participants.length,0);
  await assert.rejects(()=>service.command('listener',{roomId:'main',requestId:'visitor-profile-3',sequence:3,type:'profile',name:'Not on stage',preset:'cat'}),{code:'NOT_PARTICIPANT'});
});

test('visitor controls preserve shared cooldowns, idempotency, sequence and actor validation', async () => {
  const {service,advance,store}=await setup();
  const change={roomId:'main',requestId:'visitor-control-1',sequence:1,type:'track',trackId:'sun-goes-down'};
  const first=await service.command('listener',change);
  const duplicate=await service.command('listener',change);
  assert.equal(duplicate.revision,first.revision);
  assert.deepEqual(duplicate.track,first.track);
  await assert.rejects(()=>service.command('listener',{...change,trackId:'neon-house'}),{code:'REQUEST_CONFLICT'});
  const lights={roomId:'main',requestId:'visitor-control-2',sequence:2,type:'lights',lightMode:'ice'};
  await assert.rejects(()=>service.command('listener',lights),{code:'RATE_LIMITED',retryAfterMs:1000});
  await assert.rejects(()=>service.command('other-listener',{...lights,sequence:1}),{code:'RATE_LIMITED'});
  assert.equal((await store.readVisit('main','listener')).lastSequence,1);
  advance(1000);
  const lit=await service.command('listener',lights);
  await assert.rejects(()=>service.command('listener',{...change,requestId:'visitor-stale-1'}),{code:'STALE_SEQUENCE'});
  await assert.rejects(()=>service.command('listener',{...lights,requestId:'visitor-forged-3',sequence:3,actorId:'another-person'}),{code:'INVALID_COMMAND'});
  assert.equal((await service.snapshot('main','listener')).revision,lit.revision);
});

test('concurrent spectator shared changes commit one winner and enforce the global control cooldown', async () => {
  const {service,store}=await setup();
  const results=await Promise.allSettled([
    service.command('first-listener',{roomId:'main',requestId:'competing-track-1',sequence:1,type:'track',trackId:'sun-goes-down'}),
    service.command('second-listener',{roomId:'main',requestId:'competing-lights-1',sequence:1,type:'lights',lightMode:'ice'}),
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'RATE_LIMITED');
  const state=await service.snapshot('main','observer');
  assert.equal(state.revision,1);
  assert.equal(state.events.length,1);
  assert.equal(state.participants.length,0);
  assert.ok(store.conflicts>0);
});

test('spectator controls still consume the existing per-device token bucket', async () => {
  const {service}=await setup();
  for(let sequence=1;sequence<=12;sequence++) {
    await service.command('busy-listener',{roomId:'main',requestId:`visitor-heartbeat-${sequence}`,sequence,type:'heartbeat'});
  }
  await assert.rejects(()=>service.command('busy-listener',{roomId:'main',requestId:'visitor-out-of-tokens',sequence:13,type:'lights',lightMode:'ice'}),{code:'RATE_LIMITED',retryAfterMs:1000});
  const snapshot=await service.snapshot('main','busy-listener');
  assert.equal(snapshot.lightMode,'neon');
  assert.equal(snapshot.self.lastSequence,12);
});

test('leaving or losing a dance-floor seat does not remove shared music and lighting access', async () => {
  const {service,advance}=await setup();
  await service.command('former-dancer',join());
  await service.command('former-dancer',{roomId:'main',requestId:'leave-to-listen-2',sequence:2,type:'leave'});
  const changed=await service.command('former-dancer',{roomId:'main',requestId:'listen-track-3',sequence:3,type:'track',trackId:'sun-goes-down'});
  assert.equal(changed.self.role,'visitor');
  assert.equal(changed.participants.length,0);
  await service.command('expired-dancer',join());
  advance(61_000);
  const lit=await service.command('expired-dancer',{roomId:'main',requestId:'expired-lights-2',sequence:2,type:'lights',lightMode:'ice'});
  assert.equal(lit.self.role,'spectator');
  assert.equal(lit.participants.length,0);
  assert.equal(lit.lightMode,'ice');
  await assert.rejects(()=>service.command('expired-dancer',{roomId:'main',requestId:'expired-wave-3',sequence:3,type:'action',action:'wave'}),{code:'NOT_PARTICIPANT'});
});

test('server validates unknown fields, commands, profile limits and throttles burst actions', async () => {
  const {service}=await setup(); await service.command('actor-1',join());
  await assert.rejects(()=>service.command('actor-1',{...join(2),actorId:'actor-2'}),{code:'INVALID_COMMAND'});
  await assert.rejects(()=>service.command('actor-1',{...join(2),name:'x'.repeat(30)}),{code:'INVALID_COMMAND'});
  await service.command('actor-1',{roomId:'main',requestId:'action-request-2',sequence:2,type:'action',action:'dance'});
  await assert.rejects(()=>service.command('actor-1',{roomId:'main',requestId:'action-request-3',sequence:3,type:'action',action:'wave'}),{code:'RATE_LIMITED'});
});

test('demo room allowlist prevents arbitrary persistent room creation',async()=>{
  const {service,store}=await setup();
  await assert.rejects(()=>service.snapshot('attacker-created-room','actor-new'),{code:'INVALID_COMMAND'});
  await assert.rejects(()=>service.command('actor-new',{...join(),roomId:'attacker-created-room'}),{code:'INVALID_COMMAND'});
  assert.equal(store.rooms.size,0);assert.equal(store.visits.size,0);
  assert.equal((await service.snapshot('soundcheck','actor-new')).roomId,'soundcheck');
});

test('catalog duration refreshes legacy public snapshots without changing the shared anchor or revision', async () => {
  const { service, store } = await setup();
  const { getTrack } = await import('../lib/music-catalog.ts');
  await service.snapshot('main', 'actor-1');
  const stored = store.rooms.get('main');
  stored.track.durationMs = 32000;
  stored.track.startedAt -= 45000;
  const legacy = structuredClone(stored);
  const snapshot = await service.snapshot('main', 'actor-1');
  assert.equal(snapshot.track.durationMs, getTrack('filtered-chords').durationMs);
  assert.equal(snapshot.track.startedAt, legacy.track.startedAt);
  assert.equal(snapshot.revision, legacy.revision);
  assert.deepEqual(store.rooms.get('main'), legacy, 'derived metadata needs no persistence write or revision bump');
});

test('commands and late joins expose the current catalog duration while preserving the original track anchor', async () => {
  const { service, store, advance } = await setup();
  const { getTrack } = await import('../lib/music-catalog.ts');
  await service.command('actor-1', join());
  const stored = store.rooms.get('main');
  stored.track.durationMs = 32000;
  const startedAt = stored.track.startedAt;
  const revision = stored.revision;
  advance(1000);
  const heartbeat = await service.command('actor-1', {roomId:'main',requestId:'duration-heartbeat',sequence:2,type:'heartbeat'});
  assert.equal(heartbeat.revision, revision + 1, 'only the requested command advances the revision');
  assert.equal(heartbeat.track.durationMs, getTrack('filtered-chords').durationMs);
  assert.equal(heartbeat.track.startedAt, startedAt);
  const lateJoin = await service.command('actor-2', join());
  assert.deepEqual(lateJoin.track, heartbeat.track);
});

test('legacy third-track rooms resolve to the recorded catalog without resetting their anchor or revision', async () => {
  const { service, store } = await setup();
  await service.snapshot('main', 'legacy-listener');
  const stored = store.rooms.get('main');
  stored.track.id = 'mirrorball-disco';
  const before = structuredClone(stored);
  const snapshot = await service.snapshot('main', 'legacy-listener');
  const { getTrack } = await import('../lib/music-catalog.ts');
  assert.equal(snapshot.track.id, 'arabic-nights');
  assert.equal(snapshot.track.durationMs, getTrack('neon-house').durationMs);
  assert.equal(snapshot.track.startedAt, before.track.startedAt);
  assert.equal(snapshot.revision, before.revision);
  assert.deepEqual(store.rooms.get('main'), before);
});

test('all thirteen mixed-cast preset IDs pass existing join and profile validation',async()=>{
  const {b}=await setup();
  const presets=['cat','frog','dog','capybara','panda','banana-cat','sword-shield-dog','human-jiji','human-subeike','human-lx','monster-blob','monster-tower','monster-star'];
  for(const preset of presets){
    for(const type of ['join','profile'])assert.equal(b.validateCommand({...join(),type,preset}).preset,preset);
  }
  for(const preset of ['human-dancer','human-skater','unknown','__proto__',null,{},42]){
    for(const type of ['join','profile'])assert.throws(()=>b.validateCommand({...join(),type,preset}),{code:'INVALID_COMMAND'});
  }
});

test('legacy animal room data remains readable and live profile changes preserve identity and seat',async()=>{
  const {service,advance}=await setup();
  const animals=['cat','frog','dog','capybara','panda'];
  for(const preset of animals)await service.command(`legacy-${preset}`,{...join(),preset});
  const before=await service.snapshot('main','legacy-cat');
  assert.deepEqual(before.participants.map(person=>person.preset),animals);
  const original=before.participants.find(person=>person.id==='legacy-cat');
  let sequence=1;
  for(const preset of ['banana-cat','sword-shield-dog','human-jiji','human-subeike','human-lx','monster-blob','monster-tower','monster-star','cat']){
    advance(1100);sequence++;
    const result=await service.command('legacy-cat',{roomId:'main',requestId:`profile-mixed-${sequence}`,sequence,type:'profile',name:'同一个我',preset});
    const current=result.participants.find(person=>person.id==='legacy-cat');
    assert.equal(current.preset,preset);
    assert.equal(current.slot,original.slot);
    assert.equal(current.joinedAt,original.joinedAt);
    assert.equal(result.participants.length,5);
    assert.equal(result.self.role,'participant');
    assert.equal(result.self.lastSequence,sequence);
    const observer=await service.snapshot('main','legacy-dog');
    assert.equal(observer.participants.find(person=>person.id==='legacy-cat').preset,preset);
    assert.equal(observer.events.at(-1).type,'profile');
  }
});

test('each room exposes one complete shuffled catalog order shared by late listeners and service restarts', async () => {
  const { b, service, store, advance } = await setup();
  const { MUSIC_CATALOG } = await import('../lib/music-catalog.ts');
  const first = await service.snapshot('main', 'early-listener');
  assert.ok(Array.isArray(first.playlistOrder));
  assert.deepEqual([...first.playlistOrder].sort(), MUSIC_CATALOG.map(track => track.id).sort());
  assert.equal(new Set(first.playlistOrder).size, MUSIC_CATALOG.length);
  advance(10_000);
  const late = await service.snapshot('main', 'late-listener');
  assert.deepEqual(late.playlistOrder, first.playlistOrder);
  assert.deepEqual(late.track, first.track);
  const restarted = b.createRoomService(store, { now: () => first.serverNow + 20_000 });
  assert.deepEqual((await restarted.snapshot('main', 'restart-listener')).playlistOrder, first.playlistOrder);
});

test('legacy rooms gain a stable shared playlist order without resetting the current anchor or writing on reads', async () => {
  const { b, service, store } = await setup();
  await service.snapshot('main', 'listener');
  delete store.rooms.get('main').playlistSeed;
  const before = structuredClone(store.rooms.get('main'));
  const first = await service.snapshot('main', 'listener');
  assert.ok(Array.isArray(first.playlistOrder));
  const restarted = b.createRoomService(store, { now: () => first.serverNow + 3000 });
  const second = await restarted.snapshot('main', 'another-listener');
  assert.deepEqual(second.playlistOrder, first.playlistOrder);
  assert.deepEqual(second.track, first.track);
  assert.equal(second.revision, first.revision);
  assert.deepEqual(store.rooms.get('main'), before);
});

test('spectator next and previous advance the server playlist once, wrap, and share one fresh anchor', async () => {
  const { service, advance } = await setup();
  let current = await service.snapshot('main', 'listener');
  assert.ok(Array.isArray(current.playlistOrder));
  const order = current.playlistOrder;
  const originalId = current.track.id;
  let sequence = 0;
  for (let index = 0; index < order.length; index++) {
    const expected = order[(order.indexOf(current.track.id) + 1) % order.length];
    const command = { roomId: 'main', requestId: `playlist-step-${++sequence}`, sequence, type: 'track-step', direction: 1 };
    current = await service.command('listener', command);
    assert.equal(current.track.id, expected);
    assert.equal(current.track.startedAt, current.serverNow);
    assert.equal(current.participants.length, 0);
    assert.equal(current.events.at(-1).type, 'track');
    assert.equal(current.events.at(-1).value, expected);
    const replay = await service.command('listener', command);
    assert.equal(replay.revision, current.revision);
    assert.deepEqual(replay.track, current.track);
    assert.deepEqual((await service.snapshot('main', 'observer')).track, current.track);
    advance(1000);
  }
  assert.equal(current.track.id, originalId, 'one full shuffled cycle wraps to the same song');
  const previous = order[(order.indexOf(originalId) - 1 + order.length) % order.length];
  const back = await service.command('listener', { roomId: 'main', requestId: 'playlist-previous', sequence: ++sequence, type: 'track-step', direction: -1 });
  assert.equal(back.track.id, previous);
  assert.deepEqual(back.playlistOrder, order);
});

test('direction commands follow the latest server song even when the listener has an old snapshot', async () => {
  const { service, advance } = await setup();
  const stale = await service.snapshot('main', 'stale-listener');
  assert.ok(Array.isArray(stale.playlistOrder));
  const otherId = stale.playlistOrder.find(id => id !== stale.track.id);
  await service.command('other-listener', { roomId: 'main', requestId: 'someone-picked-song', sequence: 1, type: 'track', trackId: otherId });
  advance(1000);
  const stepped = await service.command('stale-listener', { roomId: 'main', requestId: 'stale-next-click', sequence: 1, type: 'track-step', direction: 1 });
  const expected = stale.playlistOrder[(stale.playlistOrder.indexOf(otherId) + 1) % stale.playlistOrder.length];
  assert.equal(stepped.track.id, expected);
  await assert.rejects(() => service.command('other-listener', { roomId: 'main', requestId: 'another-next-click', sequence: 2, type: 'track-step', direction: 1 }), { code: 'RATE_LIMITED' });
});

test('track direction commands accept only exact signed steps and no client-selected actor or song', async () => {
  const { b } = await setup();
  const step = { roomId: 'main', requestId: 'validate-track-step', sequence: 1, type: 'track-step', direction: 1 };
  assert.equal(b.validateCommand(step).direction, 1);
  assert.equal(b.validateCommand({ ...step, direction: -1 }).direction, -1);
  for (const direction of [0, 2, -2, '1', null, undefined, true, {}, []]) {
    assert.throws(() => b.validateCommand({ ...step, direction }), { code: 'INVALID_COMMAND' });
  }
  for (const extra of [{ actorId: 'another-listener' }, { trackId: 'neon-house' }]) {
    assert.throws(() => b.validateCommand({ ...step, ...extra }), { code: 'INVALID_COMMAND' });
  }
});

test('retired Beat Timed Grime room state resolves to the replacement without resetting its shared anchor or revision', async () => {
  const {service,store}=await setup();
  await service.snapshot('main','legacy-listener');
  const room=store.rooms.get('main');
  room.track.id='midnight-techno';
  room.track.durationMs=64000;
  room.track.startedAt-=45000;
  const before=structuredClone(room);
  const state=await service.snapshot('main','legacy-listener');
  assert.equal(state.track.id,'arabic-nights');
  assert.equal(state.track.durationMs,64000);
  assert.equal(state.track.startedAt,before.track.startedAt);
  assert.equal(state.revision,before.revision);
  assert.equal(state.playlistOrder.includes('midnight-techno'),false);
  assert.deepEqual(store.rooms.get('main'),before);
});

test('personal actions use a six-second route hold and accumulate completed pause without changing seats', async () => {
  const {service,advance}=await setup();
  const joined=await service.command('dancer',join());
  const original=joined.participants[0];
  const first=await service.command('dancer',{roomId:'main',requestId:'personal-bounce-1',sequence:2,type:'action',action:'bounce'});
  const held=first.participants[0];
  assert.equal(held.actionUntil-held.actionAt,6000);
  assert.equal(held.routePauseMs,0);
  advance(1500);
  const second=await service.command('dancer',{roomId:'main',requestId:'personal-bounce-2',sequence:3,type:'action',action:'bounce'});
  const retriggered=second.participants[0];
  assert.equal(retriggered.routePauseMs,1500);
  assert.equal(retriggered.actionAt,held.actionAt+1500);
  assert.equal(retriggered.actionUntil,retriggered.actionAt+6000);
  assert.equal(retriggered.slot,original.slot);
  assert.equal(retriggered.joinedAt,original.joinedAt);
  const late=await service.snapshot('main','late-listener');
  assert.deepEqual(late.participants,second.participants);
});

for (const action of ['love', 'laugh', 'punch', 'ghost']) {
  test(`${action} emotion uses the accepted six-second personal action, membership and replay rules`, async () => {
    const { b, service, advance } = await setup();
    const command = { roomId: 'main', requestId: `emotion-${action}-first`, sequence: 2, type: 'action', action };
    assert.deepEqual(b.validateCommand(command), command);
    assert.throws(() => b.validateCommand({ ...command, actionAt: 123 }), { code: 'INVALID_COMMAND' });
    await assert.rejects(() => service.command('visitor', command), { code: 'NOT_PARTICIPANT' });
    const joined = await service.command('dancer', join());
    const accepted = await service.command('dancer', command);
    const person = accepted.participants[0];
    assert.equal(person.action, action);
    assert.equal(person.actionAt, accepted.serverNow);
    assert.equal(person.actionUntil, accepted.serverNow + 6000);
    assert.equal(person.slot, joined.participants[0].slot);
    assert.equal(person.joinedAt, joined.participants[0].joinedAt);
    assert.equal(accepted.events.at(-1).value, action);
    advance(100);
    await assert.rejects(() => service.command('dancer', { ...command, requestId: `emotion-${action}-fast`, sequence: 3 }), { code: 'RATE_LIMITED', retryAfterMs: 250 });
    advance(6100);
    const replay = await service.command('dancer', command);
    assert.equal(replay.revision, accepted.revision);
    assert.deepEqual(replay.participants[0], person, 'a replay after expiry never restarts the emotion');
    const { activePersonalAction } = await import('../lib/room-action-state.ts');
    assert.equal(activePersonalAction(replay.participants[0], replay.serverNow), null);
    const repeated = await service.command('dancer', { ...command, requestId: `emotion-${action}-repeat`, sequence: 3 });
    assert.equal(repeated.participants[0].actionAt, repeated.serverNow);
    assert.equal(repeated.participants[0].actionUntil, repeated.serverNow + 6000);
    assert.equal(repeated.participants[0].routePauseMs, 6000);
    assert.deepEqual((await service.snapshot('main', 'observer')).participants, repeated.participants);
  });
}

test('visitors can schedule authoritative group events for all ten slots without joining', async () => {
  const {service}=await setup();
  const {getTrack}=await import('../lib/music-catalog.ts');
  const before=await service.snapshot('main','observer');
  const group=await service.command('observer',{roomId:'main',requestId:'group-wave-first',sequence:1,type:'group-action',kind:'wave'});
  assert.equal(group.self.role,'visitor');
  assert.equal(group.participants.length,0);
  assert.equal(group.totalVisits,before.totalVisits);
  assert.equal(group.groupAction.kind,'wave');
  assert.equal(group.groupAction.version,2);
  assert.equal(group.groupAction.startsAt,group.serverNow+350);
  assert.equal(group.groupAction.endsAt,group.groupAction.startsAt+10000);
  assert.equal(group.groupAction.beatMs,60000/getTrack(group.track.id).bpm);
  assert.equal(group.groupAction.sourceClockBySlot.length,10);
  assert.ok(group.groupAction.sourceClockBySlot.every(time=>time===group.groupAction.startsAt));
  assert.equal(group.events.at(-1).type,'group-action');
  assert.equal(group.events.at(-1).value,'wave');
  assert.equal(group.events.at(-1).actorId,'observer');
  const late=await service.snapshot('main','other-observer');
  assert.deepEqual(late.groupAction,group.groupAction);
});

test('group actions preserve the ten-seat cap and snapshot personal source clocks at the future start', async () => {
  const {service,advance}=await setup();
  for(let i=0;i<11;i++)await service.command(`dancer-${i}`,join());
  const action=await service.command('dancer-0',{roomId:'main',requestId:'dance-before-group',sequence:2,type:'action',action:'spin'});
  advance(1000);
  const grouped=await service.command('dancer-10',{roomId:'main',requestId:'full-room-train',sequence:2,type:'group-action',kind:'train'});
  assert.equal(grouped.self.role,'spectator');
  assert.equal(grouped.participants.length,10);
  assert.equal(grouped.groupAction.endsAt-grouped.groupAction.startsAt,28000);
  assert.equal(grouped.groupAction.sourceClockBySlot[action.participants[0].slot],action.participants[0].actionAt);
  assert.equal(grouped.participants[0].actionUntil,action.participants[0].actionUntil,'group overlay does not double count or rewrite a personal pause');
});

test('group overlap and cooldown have exact retries while music remains independent and personal actions resume at the end', async () => {
  const {service,advance}=await setup();
  await service.command('dancer',join());
  const command={roomId:'main',requestId:'group-unison-first',sequence:1,type:'group-action',kind:'unison'};
  const first=await service.command('listener',command);
  assert.equal(first.groupAction.endsAt-first.groupAction.startsAt,18000);
  const duplicate=await service.command('listener',command);
  assert.equal(duplicate.revision,first.revision);
  assert.deepEqual(duplicate.groupAction,first.groupAction);
  await assert.rejects(()=>service.command('other',{roomId:'main',requestId:'group-overlap-countin',sequence:1,type:'group-action',kind:'wave'}),{code:'RATE_LIMITED',retryAfterMs:26000});
  await assert.rejects(()=>service.command('dancer',{roomId:'main',requestId:'personal-during-countin',sequence:2,type:'action',action:'wave'}),{code:'RATE_LIMITED',retryAfterMs:21000});
  const changed=await service.command('listener',{roomId:'main',requestId:'music-during-group',sequence:2,type:'track',trackId:'sun-goes-down'});
  assert.deepEqual(changed.groupAction,first.groupAction,'music changes do not retime an accepted group event');
  advance(21000);
  const resumed=await service.command('dancer',{roomId:'main',requestId:'personal-after-group',sequence:2,type:'action',action:'wave'});
  assert.equal(resumed.participants[0].action,'wave');
  await assert.rejects(()=>service.command('other',{roomId:'main',requestId:'group-cooldown',sequence:1,type:'group-action',kind:'wave'}),{code:'RATE_LIMITED',retryAfterMs:5000});
  advance(5000);
  const next=await service.command('other',{roomId:'main',requestId:'group-after-cooldown',sequence:1,type:'group-action',kind:'wave'});
  assert.notEqual(next.groupAction.id,first.groupAction.id);
  assert.equal(next.groupAction.startsAt,next.serverNow+350);
});

test('concurrent group triggers produce one winner with no queued or overlapping events', async () => {
  const {service,store}=await setup();
  const kinds=['battle','grid','train','wave','unison'];
  const results=await Promise.allSettled(Array.from({length:12},(_,i)=>service.command(`listener-${i}`,{roomId:'main',requestId:`simultaneous-group-${i}`,sequence:1,type:'group-action',kind:kinds[i%kinds.length]})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  for(const rejected of results.filter(result=>result.status==='rejected'))assert.equal(rejected.reason.code,'RATE_LIMITED');
  const state=await service.snapshot('main','observer');
  assert.equal(state.revision,1);
  assert.equal(state.events.filter(event=>event.type==='group-action').length,1);
  assert.equal(state.participants.length,0);
  assert.ok(store.conflicts>0);
});

test('group event expiry requires no write and group payloads reject client clocks, actors and unknown kinds', async () => {
  const {service,store,b,advance}=await setup();
  const command={roomId:'main',requestId:'group-validation',sequence:1,type:'group-action',kind:'wave'};
  assert.equal(b.validateCommand(command).kind,'wave');
  for(const extra of [{kind:'unknown'},{kind:'__proto__'},{startsAt:1},{endsAt:1},{actorId:'someone-else'},{beatMs:1},{sourceClockBySlot:[]},{version:1},{version:2}]) {
    assert.throws(()=>b.validateCommand({...command,...extra}),{code:'INVALID_COMMAND'});
  }
  const accepted=await service.command('listener',command);
  const stored=structuredClone(store.rooms.get('main'));
  advance(60000);
  const expired=await service.snapshot('main','observer');
  assert.deepEqual(expired.groupAction,accepted.groupAction);
  assert.equal(expired.revision,accepted.revision);
  assert.deepEqual(store.rooms.get('main'),stored);
});

test('all five new group kinds use version two, fixed durations and independent five-second cooldowns', async () => {
  for(const [kind,duration] of Object.entries({train:28000,wave:10000,unison:18000,battle:26000,grid:22000})) {
    const lead=kind==='wave'?350:3000;
    const {service,advance}=await setup();
    const command={roomId:'main',requestId:`version-two-${kind}`,sequence:1,type:'group-action',kind};
    const accepted=await service.command('observer',command);
    const event=accepted.groupAction;
    assert.equal(event.kind,kind);
    assert.equal(event.version,2);
    assert.equal(event.startsAt,accepted.serverNow+lead);
    assert.equal(event.endsAt,event.startsAt+duration);
    assert.equal(accepted.self.role,'visitor');
    assert.equal(accepted.totalVisits,0);
    assert.equal(accepted.participants.length,0);
    assert.deepEqual((await service.command('observer',command)).groupAction,event);
    advance(duration+lead);
    const expired=await service.snapshot('main','late-listener');
    assert.deepEqual(expired.groupAction,event);
    assert.equal(expired.revision,accepted.revision);
    await assert.rejects(()=>service.command('other',{...command,requestId:`cooldown-${kind}`}),{code:'RATE_LIMITED',retryAfterMs:5000});
    advance(5000);
    const next=await service.command('other',{...command,requestId:`next-${kind}`});
    assert.equal(next.groupAction.version,2);
    assert.notEqual(next.groupAction.id,event.id);
  }
});

for(const [version,duration] of [[1,14000],[2,24000]]) test(`stored version-${version} wave keeps its original timestamps and cooldown until a new event wins`, async () => {
  const {service,store,advance}=await setup();
  const joined=await service.command('dancer',join());
  const startsAt=joined.serverNow+3000;
  const legacy={id:`legacy-v${version}-wave`,kind:'wave',startsAt,endsAt:startsAt+duration,beatMs:500,version,sourceClockBySlot:Array(10).fill(startsAt)};
  store.rooms.get('main').groupAction=structuredClone(legacy);
  const persisted=structuredClone(store.rooms.get('main'));
  const first=await service.snapshot('main','late-listener');
  assert.deepEqual(first.groupAction,legacy);
  assert.deepEqual(store.rooms.get('main'),persisted,'reading a stored event must not upgrade or retime its descriptor');
  await assert.rejects(()=>service.command('dancer',{roomId:'main',requestId:'v1-personal-block',sequence:2,type:'action',action:'spin'}),{code:'RATE_LIMITED',retryAfterMs:3000+duration});
  advance(3000+duration);
  const resumed=await service.command('dancer',{roomId:'main',requestId:'v1-personal-resume',sequence:2,type:'action',action:'spin'});
  assert.deepEqual(resumed.groupAction,legacy);
  assert.equal(resumed.participants[0].routePauseMs,0);
  advance(4999);
  const next={roomId:'main',requestId:'v1-replaced-by-v2',sequence:1,type:'group-action',kind:'battle'};
  await assert.rejects(()=>service.command('observer',next),{code:'RATE_LIMITED',retryAfterMs:1});
  advance(1);
  const replaced=await service.command('observer',next);
  assert.equal(replaced.groupAction.kind,'battle');
  assert.equal(replaced.groupAction.version,2);
  assert.equal(replaced.groupAction.endsAt-replaced.groupAction.startsAt,26000);
  assert.deepEqual(legacy,{...persisted.groupAction});
});

test('every removed music ID maps to a current recording without rewriting the room epoch or persisted state', async () => {
  const { service, store } = await setup();
  const initial = await service.snapshot('main', 'listener');
  assert.equal(initial.track.id, 'filtered-chords');
  assert.equal(initial.playlistOrder.length, 6);
  for (const id of ['neon-house', 'midnight-techno', 'mirrorball-disco', 'sun-goes-down', 'deep-woyak']) {
    const room = store.rooms.get('main');
    room.track = { id, startedAt: 12345, durationMs: 60000 };
    const before = structuredClone(room);
    const state = await service.snapshot('main', 'late-listener');
    assert.equal(state.track.id, 'arabic-nights');
    assert.equal(state.track.durationMs, 64000);
    assert.equal(state.track.startedAt, 12345);
    assert.equal(state.revision, before.revision);
    assert.ok(!state.playlistOrder.includes(id));
    assert.deepEqual(store.rooms.get('main'), before);
  }
});

test('ten real guests may share a new animal preset without an ambient uniqueness restriction',async()=>{
  const {service}=await setup();
  for(let slot=0;slot<10;slot++) await service.command(`banana-${slot}`,{...join(),preset:'banana-cat'});
  const snapshot=await service.snapshot('main','banana-0');
  assert.equal(snapshot.capacity,10);
  assert.equal(snapshot.participants.length,10);
  assert.ok(snapshot.participants.every(person=>person.preset==='banana-cat'));
  const overflow=await service.command('shield-overflow',{...join(),preset:'sword-shield-dog'});
  assert.equal(overflow.self.role,'spectator');
});
