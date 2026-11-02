import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as photo from '../lib/celebration-photo.ts';
const path = new URL('../lib/celebration-photo-export.ts', import.meta.url);
const capture = { roundIndex: 3, dataUrl: 'data:image/jpeg;base64,YWN0dWFs', capturedAt: 1_792_000_000_000 };
function harness(options = {}) {
  assert.ok(fs.existsSync(path), 'browser export module is implemented');
  const calls = [], timers = new Map(); let timer = 0;
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob(callback, type) { calls.push(['toBlob', type]); callback(options.emptyBlob ? null : new Blob(['png-result'], { type })); } };
  const context = { fillRect() {}, fillText() {}, drawImage(image) { calls.push(['drawImage', image.src]); } };
  class Image {
    width = 900; height = 900; naturalWidth = 900; naturalHeight = 900;
    set src(value) { this.source = value; if (value && !options.holdImage) queueMicrotask(() => options.badImage ? this.onerror?.(new Error('decode failed')) : this.onload?.()); }
    get src() { return this.source; }
  }
  const anchor = { style: {}, click() { calls.push(['click', this.download, this.href]); if (options.clickFailure) throw new Error('downloads unavailable'); }, remove() { calls.push(['remove']); } };
  const document = { createElement(type) { return type === 'canvas' ? canvas : anchor; }, body: { appendChild(node) { calls.push(['append', node]); } } };
  const navigator = { canShare: options.canShare, share: options.share };
  const window = { isSecureContext: options.secure ?? true, showSaveFilePicker: options.picker };
  const URL = { createObjectURL(file) { calls.push(['createURL', file]); return 'blob:memory-photo'; }, revokeObjectURL(url) { calls.push(['revokeURL', url]); } };
  const scope = vm.createContext({ exports: {}, Image, document, navigator, window, URL, File, Blob, DOMException, AbortController, Promise, Error, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); }, require(specifier) { if (specifier === './celebration-photo') return photo; throw new Error(specifier); } });
  vm.runInContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, scope);
  return { ...scope.exports, calls, canvas, timers, flushTimers() { for (const fn of [...timers.values()]) fn(); } };
}

test('preparation creates a PNG containing the actual frame and releases its canvas', async () => {
  const h = harness();
  const file = await h.prepareCelebrationPhoto(capture);
  assert.equal(file.type, 'image/png'); assert.match(file.name, /^desert-ritual-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
  assert.equal(file.size, 10);
  assert.deepEqual(h.calls.filter(call => call[0] === 'drawImage'), [['drawImage', capture.dataUrl]]);
  assert.deepEqual(h.calls.find(call => call[0] === 'toBlob'), ['toBlob', 'image/png']);
  assert.equal(h.canvas.width, 0); assert.equal(h.canvas.height, 0, 'pixel backing store is released after encoding');
});

test('failed image decoding and failed PNG encoding produce no fabricated download', async () => {
  for (const options of [{ badImage: true }, { emptyBlob: true }]) {
    const h = harness(options);
    await assert.rejects(h.prepareCelebrationPhoto(capture));
    assert.equal(h.calls.some(call => call[0] === 'createURL'), false);
  }
});

test('aborting preparation removes late image callbacks and never resolves a stale file', async () => {
  const h = harness({ holdImage: true }), controller = new AbortController();
  const preparing = h.prepareCelebrationPhoto(capture, controller.signal);
  controller.abort();
  await assert.rejects(preparing, { name: 'AbortError' });
  assert.equal(h.calls.some(call => call[0] === 'toBlob'), false);
});

const png = () => new File(['png'], 'round.png', { type: 'image/png' });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function writableHandle(options = {}) {
  const calls = [];
  const stream = {
    async write(file) { calls.push(['write', file]); if (options.write) await options.write(file); },
    async close() { calls.push(['close']); if (options.close) await options.close(); },
    async abort() { calls.push(['abort']); },
  };
  return { calls, stream, async createWritable() { calls.push(['createWritable']); return options.create ? options.create(stream) : stream; } };
}

test('Save downloads even when native file sharing is supported', async () => {
  let shares = 0;
  const h = harness({ canShare: () => true, share: () => { shares++; return Promise.resolve(); } });
  assert.equal(await h.saveCelebrationPhoto(png()), 'download-requested');
  assert.equal(shares, 0);
  assert.deepEqual(h.calls.find(call => call[0] === 'click'), ['click', 'round.png', 'blob:memory-photo']);
  h.flushTimers();
});

test('secure file picker opens synchronously in Save gesture and commits the prepared PNG before success', async () => {
  const selected = deferred(), closed = deferred(), closing = deferred(), handle = writableHandle({ close: () => { closing.resolve(); return closed.promise; } });
  let options;
  const h = harness({ picker: value => { options = value; return selected.promise; }, canShare: () => true, share: () => { throw new Error('must not share'); } });
  const file = png(), result = h.saveCelebrationPhoto(file);
  assert.ok(options, 'no asynchronous preparation or capability probe may consume user activation');
  assert.equal(options.suggestedName, 'round.png');
  assert.equal(options.types[0].accept['image/png'][0], '.png');
  assert.equal(options.excludeAcceptAllOption, true);
  let finished = false; result.then(() => { finished = true; });
  selected.resolve(handle);
  await closing.promise;
  assert.deepEqual(handle.calls, [['createWritable'], ['write', file], ['close']]);
  assert.equal(finished, false, 'write alone is not a completed save');
  closed.resolve(); assert.equal(await result, 'saved');
  assert.equal(h.calls.some(call => call[0] === 'createURL'), false);
});

test('missing picker and insecure contexts dispatch browser downloads without native share', async () => {
  for (const options of [{}, { secure: false, picker: () => { throw new Error('insecure picker must not open'); } }]) {
    const h = harness(options);
    assert.equal(h.canChooseCelebrationPhotoLocation(), false);
    assert.equal(await h.saveCelebrationPhoto(png()), 'download-requested');
    assert.ok(h.calls.some(call => call[0] === 'click'));
    h.flushTimers();
  }
  assert.equal(harness({ picker: () => {} }).canChooseCelebrationPhotoLocation(), true);
});

test('picker cancellation and permission denial never silently download or claim a save', async () => {
  for (const [name, expected] of [['AbortError', 'cancelled'], ['NotAllowedError', 'save-blocked'], ['SecurityError', 'save-blocked'], ['NotSupportedError', 'save-blocked']]) {
    const h = harness({ picker: () => Promise.reject(new DOMException('no', name)) });
    assert.equal(await h.saveCelebrationPhoto(png()), expected);
    assert.equal(h.calls.some(call => call[0] === 'click'), false);
  }
});

test('a blocked file picker can be explicitly retried as a browser download with a fresh gesture', async () => {
  let pickers = 0;
  const h = harness({ picker: () => { pickers++; throw new DOMException('blocked', 'SecurityError'); } });
  assert.equal(await h.saveCelebrationPhoto(png()), 'save-blocked');
  assert.equal(await h.saveCelebrationPhoto(png(), { downloadOnly: true }), 'download-requested');
  assert.equal(pickers, 1);
  assert.equal(h.calls.filter(call => call[0] === 'click').length, 1);
  h.flushTimers();
});

test('closing while picker is open prevents a late file selection from writing', async () => {
  const selected = deferred(), handle = writableHandle(), controller = new AbortController();
  const h = harness({ picker: () => selected.promise });
  const result = h.saveCelebrationPhoto(png(), { signal: controller.signal });
  controller.abort(); selected.resolve(handle);
  assert.equal(await result, 'cancelled');
  assert.deepEqual(handle.calls, []);
  assert.equal(h.calls.length, 0);
});

test('closing before writable stream opens aborts it without writing or committing', async () => {
  const opened = deferred(), opening = deferred(), handle = writableHandle({ create: () => { opening.resolve(); return opened.promise; } }), controller = new AbortController();
  const h = harness({ picker: async () => handle });
  const result = h.saveCelebrationPhoto(png(), { signal: controller.signal });
  await opening.promise; controller.abort(); opened.resolve(handle.stream);
  assert.equal(await result, 'cancelled');
  assert.deepEqual(handle.calls, [['createWritable'], ['abort']]);
});

test('closing after PNG writing begins lets the chosen file finish cleanly', async () => {
  const writing = deferred(), started = deferred(), handle = writableHandle({ write: () => { started.resolve(); return writing.promise; } }), controller = new AbortController();
  const h = harness({ picker: async () => handle }), file = png();
  const result = h.saveCelebrationPhoto(file, { signal: controller.signal });
  await started.promise;
  controller.abort(); writing.resolve();
  assert.equal(await result, 'saved');
  assert.deepEqual(handle.calls, [['createWritable'], ['write', file], ['close']]);
});

test('write and commit failures abort the stream, never claim a save or start downloads', async () => {
  for (const stage of ['write', 'close']) {
    const handle = writableHandle({ [stage]: () => { throw new Error('disk unavailable'); } });
    const h = harness({ picker: async () => handle });
    await assert.rejects(h.saveCelebrationPhoto(png()), /disk unavailable/);
    assert.equal(handle.calls.at(-1)[0], 'abort');
    assert.equal(h.calls.length, 0);
  }
  const handle = writableHandle({ create: () => { throw new DOMException('denied', 'NotAllowedError'); } });
  assert.equal(await harness({ picker: async () => handle }).saveCelebrationPhoto(png()), 'save-blocked');
});

test('supported Share starts synchronously only from the separate share action', async () => {
  let shared = false;
  const wait = deferred();
  const h = harness({ canShare: data => data.files[0].type === 'image/png', share: data => { shared = true; assert.equal(data.title, '余烬之后'); return wait.promise; } });
  assert.equal(h.canShareCelebrationPhoto(png()), true);
  const result = h.shareCelebrationPhoto(png());
  assert.equal(shared, true, 'prepared file retains the exact Share click activation');
  wait.resolve(); assert.equal(await result, 'shared');
  assert.equal(h.calls.length, 0);
});

test('Share cancellation, permission denial and unsupported APIs never trigger download', async () => {
  for (const [name, expected] of [['AbortError', 'cancelled'], ['NotAllowedError', 'share-blocked']]) {
    const h = harness({ canShare: () => true, share: () => Promise.reject(new DOMException('no', name)) });
    assert.equal(await h.shareCelebrationPhoto(png()), expected);
    assert.equal(h.calls.length, 0);
  }
  for (const options of [{}, { canShare: () => false, share() {} }, { canShare: () => { throw new Error('blocked'); }, share() {} }]) {
    const h = harness(options);
    assert.equal(h.canShareCelebrationPhoto(png()), false);
    assert.equal(await h.shareCelebrationPhoto(png()), 'share-blocked');
    assert.equal(h.calls.length, 0);
  }
});

test('download URLs survive immediate Close, then are revoked once after browser consumption', async () => {
  const h = harness(), controller = new AbortController();
  assert.equal(await h.saveCelebrationPhoto(png(), { signal: controller.signal }), 'download-requested');
  controller.abort();
  assert.equal(h.calls.filter(call => call[0] === 'revokeURL').length, 0);
  assert.ok(h.calls.some(call => call[0] === 'remove'));
  h.flushTimers(); h.flushTimers();
  assert.deepEqual(h.calls.filter(call => call[0] === 'revokeURL'), [['revokeURL', 'blob:memory-photo']]);
  assert.equal(h.timers.size, 0);
});

test('failed download dispatch removes the anchor and immediately releases its Blob URL', async () => {
  const h = harness({ clickFailure: true });
  await assert.rejects(h.saveCelebrationPhoto(png()));
  assert.equal(h.calls.filter(call => call[0] === 'revokeURL').length, 1);
  assert.ok(h.calls.some(call => call[0] === 'remove'));
  assert.equal(h.timers.size, 0);
});

test('aborting before either action dispatches no picker, share, URL or download', async () => {
  const h = harness({ picker: () => { throw new Error('must not open'); }, canShare: () => true, share: () => { throw new Error('must not share'); } });
  const controller = new AbortController(); controller.abort();
  assert.equal(await h.saveCelebrationPhoto(png(), { signal: controller.signal }), 'cancelled');
  assert.equal(await h.shareCelebrationPhoto(png(), { signal: controller.signal }), 'cancelled');
  assert.equal(h.calls.length, 0);
});
