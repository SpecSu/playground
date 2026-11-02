import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../lib/feed-local-likes.ts', import.meta.url);
const load = async () => {
  assert.equal(existsSync(moduleUrl), true, 'the local liked-work persistence module exists');
  return import(moduleUrl.href);
};

test('an unsaved or malformed liked preference never creates a liked live-room entry', async () => {
  const { readLiveWorkLiked } = await load();
  for (const value of [null, '', '0', 'true', 'false', '{}', 'not-json']) {
    assert.equal(readLiveWorkLiked({ getItem: () => value }), false);
  }
  assert.equal(readLiveWorkLiked({ getItem: () => '1' }), true);
});

test('toggling the liked live-room entry survives reload and cancellation', async () => {
  const { readLiveWorkLiked, saveLiveWorkLiked, LIVE_WORK_LIKE_KEY } = await load();
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  assert.equal(saveLiveWorkLiked(storage, true), true);
  assert.equal(items.get(LIVE_WORK_LIKE_KEY), '1');
  assert.equal(readLiveWorkLiked(storage), true);
  assert.equal(saveLiveWorkLiked(storage, false), true);
  assert.equal(readLiveWorkLiked(storage), false);
  assert.equal(items.size, 1, 'a bounded local preference, no fake count or account identity');
});

test('blocked preference storage degrades to unsaved state without crashing the feed', async () => {
  const { readLiveWorkLiked, saveLiveWorkLiked } = await load();
  const storage = { getItem: () => { throw new Error('Denied'); }, setItem: () => { throw new Error('Full'); } };
  assert.equal(readLiveWorkLiked(storage), false);
  assert.equal(saveLiveWorkLiked(storage, true), false);
});
