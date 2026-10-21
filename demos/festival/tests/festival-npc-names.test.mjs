import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { ambientProfiles } = await import('../lib/ambient-world.ts');
const { CLUB_AVATAR_CATALOG } = await import('../lib/club-avatar-catalog.ts');
const { festivalSceneState, planFestivalAmbientInstallation, projectFestivalAmbientParticipants } = await import('../lib/festival-ambient.ts');
const { createFestivalService } = await import('../lib/festival-server.ts');
const { festivalRoundAt } = await import('../lib/festival-types.ts');

const start = 1_800_000_000_000;
const names = new Map(CLUB_AVATAR_CATALOG.map(avatar => [avatar.id, avatar.label]));

test('ambient names always match the character panel without changing deterministic presets or identities', () => {
  for (const seed of [0, 1, 42, 1001]) {
    const people = ambientProfiles('festival', seed, 12);
    assert.equal(new Set(people.map(person => person.preset)).size, 12);
    for (const person of people) assert.equal(person.name, names.get(person.preset));
    assert.deepEqual(people, ambientProfiles('festival', seed, 12));
  }
  assert.deepEqual(ambientProfiles('festival', 42, 4).map(({ id, preset }) => [id, preset]), [
    ['ambient:festival:0', 'human-jiji'], ['ambient:festival:1', 'niulai'],
    ['ambient:festival:2', 'sword-shield-dog'], ['ambient:festival:3', 'miaocuijiao'],
  ]);
});

test('new NPC artwork captures the same original name as its visible creator', () => {
  const round = festivalRoundAt(1, start, start), now = start + 8_000;
  const people = projectFestivalAmbientParticipants(round, now);
  const art = planFestivalAmbientInstallation(round, 0, [], people, now);
  assert.ok(art);
  const creator = people.find(person => person.id === art.actorId);
  assert.equal(art.creatorName, names.get(creator.preset));
  assert.equal(art.creatorName, creator.name);
});

test('scene nameplates and speaking NPCs use original names while human names and messages stay untouched', () => {
  const round = festivalRoundAt(1, start, start), now = start + 15_000;
  const ambientParticipants = projectFestivalAmbientParticipants(round, now);
  const human = { ...ambientParticipants[0], id: 'human', ambient: false, name: '汽水',
    message: { text: '我选的昵称就是汽水', at: now, expiresAt: now + 8_000 } };
  const scene = festivalSceneState({ round, participants: [human], installations: [], ambientParticipants, ambientInstallations: [] }, now);
  assert.equal(scene.participants[0], human);
  assert.equal(scene.participants[0].name, '汽水');
  assert.equal(scene.participants[0].message.text, '我选的昵称就是汽水');
  const npcs = scene.participants.slice(1);
  assert.equal(npcs.filter(person => person.message).length, 1);
  for (const person of npcs) assert.equal(person.name, names.get(person.preset));
});

class MemoryStore {
  room = null;
  visits = new Map();
  writes = 0;
  conflicts = 0;
  async readState(actor) { return structuredClone({ room: this.room, visit: this.visits.get(actor) ?? null }); }
  async ensureRoom(initial) { this.room ??= structuredClone(initial); }
  async ensureVisit(actor, initial) { if (!this.visits.has(actor)) this.visits.set(actor, structuredClone(initial)); }
  async commit(revision, next, actor, sequence, visit) {
    await Promise.resolve();
    if (this.room.revision !== revision || (visit && this.visits.get(actor).lastSequence !== sequence)) {
      this.conflicts++; return false;
    }
    this.room = structuredClone(next);
    if (visit) this.visits.set(actor, structuredClone(visit));
    this.writes++; return true;
  }
}

test('legacy NPC authors migrate once through CAS without rewriting human profiles or saved artwork authors', async () => {
  const store = new MemoryStore(), service = createFestivalService(store, { now: () => start });
  await service.command('human', { type: 'join', name: '汽水', preset: 'cat', requestId: 'npc-name-human-join', sequence: 1 });
  const before = await service.snapshot('human');
  const work = { kind: 0, x: -38, z: 39, createdAt: start - 20_000, roundIndex: 1 };
  store.room.installations = [
    { ...work, id: 'human-art', actorId: 'human', creatorName: '旧玩家昵称' },
    { ...work, id: 'departed-art', actorId: 'departed-human', creatorName: '阿遥' },
  ];
  store.room.ambientInstallations = before.ambientParticipants.slice(0, 2).map((person, index) => ({
    ...work, id: `ambient:art:1:${index}`, actorId: person.id, ambient: true,
    ...(index === 0 ? { creatorName: '小满' } : {}),
  }));
  const humanBefore = structuredClone(store.room.participants);
  const humanArtBefore = structuredClone(store.room.installations);
  const writes = store.writes, revision = store.room.revision;
  const snapshots = await Promise.all([service.snapshot('viewer-a'), service.snapshot('viewer-b')]);
  for (const snapshot of snapshots) {
    assert.deepEqual(snapshot.participants, humanBefore);
    assert.deepEqual(snapshot.installations, humanArtBefore);
    for (const art of snapshot.ambientInstallations) {
      const creator = snapshot.ambientParticipants.find(person => person.id === art.actorId);
      assert.equal(art.creatorName, names.get(creator.preset));
      assert.equal(art.createdAt, work.createdAt);
    }
  }
  assert.equal(store.room.revision, revision + 1);
  assert.equal(store.writes, writes + 1);
  assert.ok(store.conflicts > 0, 'concurrent old-room readers exercise the CAS retry');
  assert.equal(store.visits.get('human').lastSequence, 1);
  await service.snapshot('viewer-c');
  assert.equal(store.writes, writes + 1, 'already migrated author names do not write on every poll');
});
