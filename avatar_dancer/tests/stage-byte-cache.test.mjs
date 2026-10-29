import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage from '../src/stage.js';

test('byte cache deduplicates in-flight downloads and keeps originals for reparsing', async () => {
  let downloads = 0, resolve;
  const cache = stage.createAssetByteCache(() => { downloads++; return new Promise(r => resolve = r); }, {maxBytes: 8});
  const first = cache.get('a'), second = cache.get('a');
  await Promise.resolve(); resolve(new Uint8Array([1,2,3,4]).buffer);
  assert.equal(await first, await second);
  assert.equal(await cache.get('a'), await first); assert.equal(downloads, 1);
  cache.clear(); assert.equal(cache.bytes, 0);
  await assert.rejects(cache.get('a'), /disposed/);
});

test('byte cache evicts least-recently-used bytes and retries failed downloads', async () => {
  const counts = new Map();
  const cache = stage.createAssetByteCache(async url => {
    const n = (counts.get(url) || 0) + 1; counts.set(url,n);
    if (url === 'bad' && n === 1) throw new Error('offline');
    return new ArrayBuffer(4);
  }, {maxBytes: 8});
  await cache.get('a'); await cache.get('b'); await cache.get('a'); await cache.get('c');
  assert.equal(cache.bytes,8);
  await cache.get('a'); assert.equal(counts.get('a'),1);
  await cache.get('b'); assert.equal(counts.get('b'),2);
  await assert.rejects(cache.get('bad'),/offline/); await cache.get('bad');
  assert.equal(counts.get('bad'),2);
});

test('clear during download cannot repopulate byte cache', async () => {
  let finish;
  const cache = stage.createAssetByteCache(() => new Promise(resolve => finish = resolve));
  const pending = cache.get('a'); await Promise.resolve(); cache.clear();
  finish(new ArrayBuffer(4)); await pending;
  assert.equal(cache.bytes,0); assert.equal(cache.size,0);
});

test('parse queue never decodes multiple models concurrently and skips superseded outfits', async () => {
  const wanted = new Set(['a']), calls = [], finishes = {};
  const parse = stage.createSerialAssetParser((data, url) => {
    calls.push(url); return new Promise(resolve => finishes[url] = resolve);
  }, url => wanted.has(url));
  const a = parse(new ArrayBuffer(1),'a'); await Promise.resolve();
  wanted.clear(); wanted.add('c');
  const b = parse(new ArrayBuffer(1),'b');
  const c = parse(new ArrayBuffer(1),'c');
  const stale = assert.rejects(b,/superseded/);
  assert.deepEqual(calls,['a']);
  finishes.a('A'); assert.equal(await a,'A'); await stale;
  for (let i=0;i<5 && !finishes.c;i++) await Promise.resolve();
  assert.deepEqual(calls,['a','c']); finishes.c('C'); assert.equal(await c,'C');
});
