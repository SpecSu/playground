import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { createFestivalService } = await import('../lib/festival-server.ts');
const { projectFestivalAmbientParticipants } = await import('../lib/festival-ambient.ts');
const { festivalRoundAt, projectParticipant, getFestivalPlacementIssue, FESTIVAL_ROUND_MS,
  FESTIVAL_INSTALLATION_RADII, FESTIVAL_MONUMENT_RADIUS, FESTIVAL_CAMPFIRE_POSITIONS,
  FESTIVAL_CAMPFIRE_RADIUS, FESTIVAL_CAMP_POSITIONS, FESTIVAL_CAMP_RADIUS, FESTIVAL_WORLD_RADIUS } = await import('../lib/festival-types.ts');

class Store {
  room = null; visits = new Map(); writes = 0; collisions = 0; rejectOnce = null;
  async readState(actor) { return structuredClone({ room: this.room, visit: this.visits.get(actor) ?? null }); }
  async ensureRoom(initial) { if (!this.room) { this.room = structuredClone(initial); this.writes++; } }
  async ensureVisit(actor, initial) { if (!this.visits.has(actor)) { this.visits.set(actor, structuredClone(initial)); this.writes++; } }
  async commit(revision, room, actor, sequence, visit) {
    await Promise.resolve();
    if (this.rejectOnce) { const fn = this.rejectOnce; this.rejectOnce = null; fn(); this.collisions++; return false; }
    if (this.room.revision !== revision || (visit && this.visits.get(actor).lastSequence !== sequence)) { this.collisions++; return false; }
    this.room = structuredClone(room); if (visit) this.visits.set(actor, structuredClone(visit)); this.writes++; return true;
  }
}
const start = 1_800_000_000_000;
function setup() { const store = new Store(); let now = start; const service = createFestivalService(store, { now: () => now }); return { store, service, setNow: value => { now = value; }, now: () => now }; }
const join = id => ({ type: 'join', name: `Player${id}`, preset: 'cat', requestId: `npc-qa-join-${id}`, sequence: 1 });

test('NPC review: concurrent viewers create each scheduled artwork exactly once, with no fake visits or per-poll writes', async () => {
  const h = setup(); await h.service.snapshot('viewer');
  const before = h.store.writes;
  h.setNow(start + 7999); const quiet = await h.service.snapshot('viewer');
  assert.equal(quiet.ambientParticipants.length, 4); assert.equal(quiet.ambientInstallations.length, 0); assert.equal(h.store.writes, before);
  h.setNow(start + 8000);
  const first = await Promise.all(Array.from({ length: 16 }, () => h.service.snapshot('viewer')));
  assert.ok(first.every(snapshot => snapshot.ambientInstallations.length === 1));
  assert.equal(new Set(first.flatMap(snapshot => snapshot.ambientInstallations.map(art => art.id))).size, 1);
  assert.equal(h.store.writes, before + 1); assert.ok(h.store.collisions > 0);
  h.setNow(start + 95000);
  const second = await Promise.all(Array.from({ length: 16 }, () => h.service.snapshot('viewer')));
  assert.ok(second.every(snapshot => snapshot.ambientInstallations.length === 2));
  assert.equal(h.store.writes, before + 2);
  const revision = h.store.room.revision;
  for (let i = 0; i < 100; i++) { h.setNow(start + 96000 + i * 500); const snapshot = await h.service.snapshot('viewer'); assert.equal(snapshot.revision, revision); }
  assert.equal(h.store.writes, before + 2);
  assert.deepEqual([...h.store.visits.keys()], ['viewer']);
  assert.equal(h.store.room.installations.length, 0); assert.equal(h.store.room.participants.length, 0);
  assert.equal(h.store.room.ambientInstallations.length, 2);
});

test('NPC review: human admission and art quotas remain separate, but ambient art is a real placement obstacle', async () => {
  const h = setup(); await h.service.snapshot('viewer'); h.setNow(start + 95000); await h.service.snapshot('viewer');
  const guests = await Promise.all(Array.from({ length: 11 }, (_, id) => h.service.command(`human-${id}`, join(id))));
  assert.equal(guests.filter(snapshot => snapshot.self.role === 'participant').length, 10);
  assert.equal(guests.filter(snapshot => snapshot.self.role === 'spectator').length, 1);
  const snapshot = await h.service.snapshot('viewer');
  assert.equal(snapshot.capacity, 10); assert.equal(snapshot.participants.length, 10); assert.equal(snapshot.ambientParticipants.length, 4);
  assert.equal(snapshot.installations.length, 0); assert.equal(snapshot.ambientInstallations.length, 2);
  for (const art of snapshot.ambientInstallations) {
    await assert.rejects(h.service.command('human-0', { type: 'build', requestId: `npc-blocked-${art.id.replaceAll(':', '-')}`, sequence: 2,
      kind: 0, x: art.x, z: art.z, roundIndex: snapshot.round.index }), { code: 'PLACEMENT_BLOCKED' });
    assert.equal(getFestivalPlacementIssue(art.kind, art.x, art.z, snapshot.ambientInstallations.filter(other => other.id !== art.id), [], h.now()), null);
  }
  const before = h.store.writes;
  for (const person of snapshot.ambientParticipants) await assert.rejects(h.service.command(person.id, join(person.slot)), { code: 'FORBIDDEN' });
  assert.equal(h.store.writes, before);
  assert.ok([...h.store.visits.keys()].every(id => !id.startsWith('ambient:')));
  assert.ok(snapshot.participants.every(p => p.slot < 10));
});

test('NPC review: CAS retry cannot create artwork after burn, and round reset starts an independent schedule', async () => {
  const h = setup(); await h.service.snapshot('viewer');
  h.setNow(start + 299999); h.store.rejectOnce = () => h.setNow(start + 300000);
  const burning = await h.service.snapshot('viewer');
  assert.equal(burning.round.phase, 'burning'); assert.equal(burning.ambientInstallations.length, 0);
  assert.equal(h.store.room.ambientBuildAttempts?.length ?? 0, 0, 'losing CAS cannot persist schedule receipts');
  h.setNow(start + FESTIVAL_ROUND_MS); const reset = await h.service.snapshot('viewer');
  assert.equal(reset.round.index, 2); assert.equal(reset.round.phase, 'building'); assert.equal(reset.ambientInstallations.length, 0);
  h.setNow(start + FESTIVAL_ROUND_MS + 8000); const next = await h.service.snapshot('viewer');
  assert.equal(next.ambientInstallations.length, 1); assert.equal(next.ambientInstallations[0].roundIndex, 2);
  h.setNow(start + 2 * FESTIVAL_ROUND_MS); const third = await h.service.snapshot('viewer');
  assert.equal(third.round.index, 3); assert.equal(third.ambientInstallations.length, 0); assert.equal(third.installations.length, 0);
});

test('NPC review: full walking circuits respect monument, fire, tents, artwork and world boundary across rounds', () => {
  for (let roundIndex = 1; roundIndex <= 12; roundIndex++) {
    const round = festivalRoundAt(roundIndex, start, start);
    const works = Array.from({ length: 6 }, (_, i) => ({ id: `qa-${i}`, actorId: 'human', kind: i,
      x: Math.sin(i * 1.04) * 42, z: Math.cos(i * 1.04) * 42, createdAt: start, roundIndex }));
    for (let elapsed = 0; elapsed <= 90000; elapsed += 500) {
      for (const person of projectFestivalAmbientParticipants(round, start + elapsed, works)) {
        const p = projectParticipant(person, start + elapsed), radius = Math.hypot(p.x, p.z);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
        assert.ok(radius - 1.5 >= FESTIVAL_MONUMENT_RADIUS, 'whole avatar stays off monument');
        assert.ok(radius + 1.5 <= FESTIVAL_WORLD_RADIUS, 'whole avatar stays in world');
        for (const [x, z] of FESTIVAL_CAMPFIRE_POSITIONS) assert.ok(Math.hypot(p.x - x, p.z - z) >= 1.5 + FESTIVAL_CAMPFIRE_RADIUS);
        for (const camp of FESTIVAL_CAMP_POSITIONS) assert.ok(Math.hypot(p.x - camp.x, p.z - camp.z) >= 1.5 + FESTIVAL_CAMP_RADIUS);
        for (const art of works) assert.ok(Math.hypot(p.x - art.x, p.z - art.z) >= 1.5 + FESTIVAL_INSTALLATION_RADII[art.kind]);
      }
    }
  }
});
