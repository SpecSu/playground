import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

async function navigationModule() {
  const url = new URL('../lib/music-navigation.ts', import.meta.url);
  assert.ok(existsSync(url), 'Shared playlist navigation must exist');
  return import(url.href);
}

test('previous and next wrap the current catalog with no hardcoded track count', async () => {
  const { adjacentTrack } = await navigationModule();
  for (const tracks of [[{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]]) {
    assert.equal(adjacentTrack(tracks, 'a', -1)?.id, tracks.at(-1)?.id);
    assert.equal(adjacentTrack(tracks, tracks.at(-1)!.id, 1)?.id, 'a');
    assert.equal(adjacentTrack(tracks, 'a', 1)?.id, 'b');
  }
});

test('playlist navigation has safe empty, single-track and retired-ID behavior', async () => {
  const { adjacentTrack } = await navigationModule();
  assert.equal(adjacentTrack([], 'missing', 1), null);
  assert.equal(adjacentTrack([{ id: 'a' }], 'a', 1), null);
  assert.equal(adjacentTrack([{ id: 'a' }, { id: 'b' }], 'retired', 1)?.id, 'b');
});

test('all connected listeners can navigate tracks while pending and server retry guards remain enforced', async () => {
  const { canNavigateTracks, controlRetryUntil } = await navigationModule();
  const ready = { ready: true, pending: false, now: 1000, blockedUntil: 0, trackCount: 2 };
  assert.equal(canNavigateTracks(ready), true);
  for (const patch of [{ ready: false }, { pending: true }, { blockedUntil: 1001 }, { trackCount: 1 }]) {
    assert.equal(canNavigateTracks({ ...ready, ...patch }), false);
  }
  assert.equal(controlRetryUntil(1000, 350), 1350);
  assert.equal(controlRetryUntil(1000, undefined), 2000);
});

test('shared lights and music use the same connection, pending and cooldown gate without requiring a seat', async () => {
  const navigation = await navigationModule();
  assert.equal(typeof navigation.canUseSharedControls, 'function');
  const ready = { ready: true, pending: false, now: 1000, blockedUntil: 1000 };
  assert.equal(navigation.canUseSharedControls(ready), true);
  for (const patch of [{ ready: false }, { pending: true }, { blockedUntil: 1001 }]) {
    assert.equal(navigation.canUseSharedControls({ ...ready, ...patch }), false);
  }
});

test('a server seed gives every listener the same complete shuffled order without mutating the catalog', async () => {
  const navigation = await navigationModule();
  assert.equal(typeof navigation.seededShuffle, 'function');
  const catalog = Object.freeze(['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights']);
  const first = navigation.seededShuffle(catalog, 'afterhours:main:playlist-v1');
  assert.deepEqual(first, navigation.seededShuffle(catalog, 'afterhours:main:playlist-v1'));
  assert.deepEqual([...first].sort(), [...catalog].sort());
  assert.notEqual(first, catalog);
  assert.deepEqual(catalog, ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights']);
  const orders = new Set(Array.from({ length: 50 }, (_, index) => navigation.seededShuffle(catalog, `room-seed-${index}`).join(',')));
  assert.ok(orders.size >= 8, 'different room seeds genuinely vary the order');
  assert.deepEqual(navigation.seededShuffle([], 'empty'), []);
  assert.deepEqual(navigation.seededShuffle(['only'], 'one'), ['only']);
});
