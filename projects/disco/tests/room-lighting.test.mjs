import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { createRoomService } = await import('../lib/room-server.ts');
const { LIGHT_MODES } = await import('../lib/room-types.ts');

class MemoryStore {
  rooms = new Map();
  visits = new Map();
  commits = 0;
  conflicts = 0;
  async ensureRoom(id, initial) { if (!this.rooms.has(id)) this.rooms.set(id, structuredClone(initial)); }
  async readRoom(id) { return structuredClone(this.rooms.get(id)); }
  async ensureVisit(roomId, actorId, initial) { const key = `${roomId}:${actorId}`; if (!this.visits.has(key)) this.visits.set(key, structuredClone(initial)); }
  async readVisit(roomId, actorId) { return structuredClone(this.visits.get(`${roomId}:${actorId}`)); }
  async readState(roomId, actorId) { return { room: await this.readRoom(roomId), visit: await this.readVisit(roomId, actorId) }; }
  async commit(roomId, revision, next, actorId, sequence, visit) {
    await Promise.resolve();
    const key = `${roomId}:${actorId}`;
    if (this.rooms.get(roomId).revision !== revision || (visit && this.visits.get(key).lastSequence !== sequence)) { this.conflicts++; return false; }
    this.rooms.set(roomId, structuredClone(next));
    if (visit) this.visits.set(key, structuredClone(visit));
    this.commits++;
    return true;
  }
}

const EPOCH = 1_800_000_000_000;
function setup() {
  const store = new MemoryStore();
  let now = EPOCH;
  const service = createRoomService(store, { now: () => now });
  return { store, service, setNow: value => { now = value; }, advance: value => { now += value; } };
}
const lightCommand = (lightMode, sequence = 1) => ({ roomId: 'main', requestId: `manual-light-${sequence}`, sequence, type: 'lights', lightMode });

test('a new empty room rotates exactly every 60 seconds in catalog order without events or persistence writes', async () => {
  const { store, service, setNow } = setup();
  const first = await service.snapshot('main', 'observer');
  assert.deepEqual(first.lightCycle, { mode: 'neon', startedAt: EPOCH });
  for (let step = 0; step < LIGHT_MODES.length * 3; step++) {
    setNow(EPOCH + step * 60_000);
    const current = await service.snapshot('main', 'observer');
    assert.equal(current.lightMode, LIGHT_MODES[step % LIGHT_MODES.length]);
    assert.equal(current.revision, first.revision);
    assert.deepEqual(current.lightCycle, first.lightCycle);
    assert.deepEqual(current.events, []);
    assert.equal(current.participants.length, 0);
    assert.equal(current.totalVisits, 0);
    setNow(EPOCH + (step + 1) * 60_000 - 1);
    assert.equal((await service.snapshot('main', 'observer')).lightMode, current.lightMode);
  }
  assert.equal(store.commits, 0);
  assert.equal(store.rooms.get('main').lightMode, 'neon', 'stored color is the manual anchor, not the projected frame');
});

test('manual color changes and same-color reselection reset the room clock, but replay does not', async () => {
  const { service, advance } = setup();
  await service.snapshot('main', 'listener');
  advance(61_000);
  const selected = await service.command('listener', lightCommand('sunset'));
  assert.equal(selected.lightMode, 'sunset');
  assert.deepEqual(selected.lightCycle, { mode: 'sunset', startedAt: EPOCH + 61_000 });
  advance(59_000);
  const reselected = await service.command('listener', lightCommand('sunset', 2));
  assert.deepEqual(reselected.lightCycle, { mode: 'sunset', startedAt: EPOCH + 120_000 });
  assert.equal(reselected.events.filter(event => event.type === 'lights').length, 2);
  advance(59_999);
  const replayed = await service.command('listener', lightCommand('sunset', 2));
  assert.deepEqual(replayed.lightCycle, reselected.lightCycle);
  assert.equal(replayed.lightMode, 'sunset');
  assert.equal(replayed.revision, reselected.revision);
  advance(1);
  const rotated = await service.snapshot('main', 'late-listener');
  assert.equal(rotated.lightMode, 'ice');
  assert.deepEqual(rotated.events, reselected.events, 'automatic rotation never creates a toast-producing event');
  assert.equal(rotated.revision, reselected.revision);
  assert.equal(rotated.self.role, 'visitor');
});

test('join, profile, personal action, music, group action, presence and leave never reset lighting inactivity', async () => {
  const { service, setNow } = setup();
  const first = await service.snapshot('main', 'dancer');
  const commands = [
    { type: 'join', name: 'Dancer', preset: 'cat' },
    { type: 'profile', name: 'Still dancing', preset: 'frog' },
    { type: 'action', action: 'bounce' },
    { type: 'track', trackId: 'neon-house' },
    { type: 'track-step', direction: 1 },
    { type: 'group-action', kind: 'unison' },
    { type: 'heartbeat' },
    { type: 'leave' },
  ];
  for (const [index, command] of commands.entries()) {
    setNow(EPOCH + (index + 1) * 5000);
    const snapshot = await service.command('dancer', { roomId: 'main', requestId: `unrelated-control-${index}`, sequence: index + 1, ...command });
    assert.deepEqual(snapshot.lightCycle, first.lightCycle, command.type);
  }
  setNow(EPOCH + 60_000);
  assert.equal((await service.snapshot('main', 'dancer')).lightMode, 'sunset');
});

test('late joins and recreated services use the persisted room anchor after multiple idle periods', async () => {
  const { service, store, setNow } = setup();
  const initial = await service.command('first-listener', lightCommand('moon'));
  setNow(EPOCH + 7 * 60_000 + 25_000);
  const late = await service.snapshot('main', 'late-listener');
  assert.equal(late.lightMode, 'neon');
  assert.deepEqual(late.lightCycle, initial.lightCycle);
  const restarted = createRoomService(store, { now: () => EPOCH + 7 * 60_000 + 25_000 });
  const reconnected = await restarted.snapshot('main', 'first-listener');
  assert.deepEqual(reconnected.lightCycle, late.lightCycle);
  assert.equal(reconnected.lightMode, late.lightMode);
  assert.equal(reconnected.revision, initial.revision);
  assert.equal(store.commits, 1, 'only the manual command writes');
});

test('simultaneous legacy readers install one shared anchor once, preserving the current mode', async () => {
  const { service, store, setNow } = setup();
  const initial = await service.snapshot('main', 'old-listener');
  const legacy = store.rooms.get('main');
  delete legacy.lightChangedAt;
  legacy.lightMode = 'acid';
  legacy.lastControlAt = EPOCH - 500_000;
  const views = await Promise.all(Array.from({ length: 8 }, (_, index) => service.snapshot('main', `legacy-reader-${index}`)));
  assert.equal(store.commits, 1);
  assert.ok(store.conflicts > 0);
  for (const view of views) {
    assert.equal(view.lightMode, 'acid');
    assert.deepEqual(view.lightCycle, { mode: 'acid', startedAt: EPOCH });
    assert.equal(view.revision, initial.revision + 1);
    assert.deepEqual(view.events, initial.events);
  }
  setNow(EPOCH + 60_000);
  assert.equal((await service.snapshot('main', 'old-listener')).lightMode, 'moon');
  assert.equal(store.commits, 1);
});

test('a non-light command upgrades legacy lighting once without binding it to later music changes', async () => {
  const { service, store, advance } = setup();
  await service.snapshot('main', 'listener');
  delete store.rooms.get('main').lightChangedAt;
  store.rooms.get('main').lightMode = 'ember';
  advance(10_000);
  const first = await service.command('listener', { roomId: 'main', requestId: 'legacy-track-one', sequence: 1, type: 'track', trackId: 'neon-house' });
  assert.deepEqual(first.lightCycle, { mode: 'ember', startedAt: EPOCH + 10_000 });
  advance(59_000);
  const second = await service.command('listener', { roomId: 'main', requestId: 'legacy-track-two', sequence: 2, type: 'track-step', direction: 1 });
  assert.deepEqual(second.lightCycle, first.lightCycle);
  advance(1000);
  assert.equal((await service.snapshot('main', 'listener')).lightMode, 'acid');
});

test('frame projection uses the calibrated server clock and catches up even when its cached snapshot is old', async () => {
  const { lightModeAt, LIGHT_IDLE_INTERVAL_MS } = await import('../lib/room-lighting.ts');
  const { ServerClock, shouldAcceptSnapshot } = await import('../lib/room-client.ts');
  const { service, setNow } = setup();
  const initial = await service.snapshot('main', 'observer');
  assert.equal(LIGHT_IDLE_INTERVAL_MS, 60_000);
  const clock = new ServerClock();
  clock.observe(EPOCH, EPOCH - 3505, EPOCH - 3495);
  assert.equal(clock.offsetMs, 3500);
  const before = clock.serverTime(EPOCH + 60_000 - 3501);
  const boundary = clock.serverTime(EPOCH + 60_000 - 3500);
  assert.equal(lightModeAt(initial.lightCycle, before, initial.lightMode), 'neon');
  assert.equal(lightModeAt(initial.lightCycle, boundary, initial.lightMode), 'sunset');
  assert.equal(lightModeAt(initial.lightCycle, EPOCH + 17 * 60_000, initial.lightMode), 'moon');
  setNow(EPOCH + 60_000);
  const newer = await service.snapshot('main', 'observer');
  assert.equal(newer.revision, initial.revision);
  assert.equal(shouldAcceptSnapshot(initial, newer), true, 'time-projected changes are accepted without a revision bump');
  assert.equal(shouldAcceptSnapshot(newer, initial), false, 'an old same-revision response cannot rewind the lighting');
  const manual = await service.command('observer', lightCommand('ice'));
  assert.equal(shouldAcceptSnapshot(manual, { ...newer, serverNow: manual.serverNow + 1000 }), false);
  assert.equal(lightModeAt(manual.lightCycle, manual.serverNow + 59_999, manual.lightMode), 'ice');
});

test('projection preserves legacy snapshots and handles future epochs and invalid clocks safely', async () => {
  const { lightModeAt } = await import('../lib/room-lighting.ts');
  assert.equal(lightModeAt(undefined, EPOCH, 'ember'), 'ember');
  assert.equal(lightModeAt({ mode: 'moon', startedAt: EPOCH + 60_000 }, EPOCH, 'ember'), 'moon');
  assert.equal(lightModeAt({ mode: 'ice', startedAt: Number.NaN }, EPOCH, 'ember'), 'ember');
  assert.equal(lightModeAt({ mode: 'ice', startedAt: EPOCH }, Number.NaN, 'ember'), 'ember');
  assert.equal(lightModeAt({ mode: 'invalid', startedAt: EPOCH }, EPOCH, 'ember'), 'ember');
  for (const mode of LIGHT_MODES) {
    assert.equal(lightModeAt({ mode, startedAt: 0 }, 0), mode, 'epoch zero is a valid anchor');
    assert.equal(lightModeAt({ mode, startedAt: EPOCH }, EPOCH + 6 * 60_000), mode);
  }
});
