import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Run without dependencies: node --experimental-strip-types --test tests/club-audio.test.mjs
import * as catalog from '../lib/music-catalog.ts';
import * as audio from '../lib/club-audio.ts';

// Failed assertions must not leave the player's resync interval alive and hang
// the entire aggregate run while asset/catalog work is in progress.
const activePlayers = new Set();
class TestClubAudio extends audio.ClubAudio {
  constructor(options) { super(options); activePlayers.add(this); }
}
afterEach(async () => {
  await Promise.all([...activePlayers].map(player => player.dispose()));
  activePlayers.clear();
});

function fakeBuffer(track, duration = track.durationSeconds, sampleRate = 32000) {
  return { duration, length: Math.round(duration * sampleRate), sampleRate, numberOfChannels: 2 };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

class FakeParam {
  value = 1;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class FakeSource {
  playbackRate = new FakeParam();
  starts = [];
  stops = [];
  connect() {}
  disconnect() { this.disconnected = true; }
  start(...args) { this.starts.push(args); }
  stop(...args) { this.stops.push(args); }
}
class FakeContext {
  currentTime = 10;
  state = 'suspended';
  baseLatency = 0;
  outputLatency = 0;
  destination = {};
  sources = [];
  gains = [];
  listeners = new Map();
  sampleRate = 32000;
  decoded = [];
  async decodeAudioData(bytes) { this.decoded.push(bytes); return fakeBuffer(catalog.getTrack('arabic-nights')); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i], copyToChannel: (from, i) => data[i].set(from) };
  }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  createGain() {
    const node = { gain: new FakeParam(), connect() {}, disconnect() {} };
    this.gains.push(node); return node;
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

test('Web Audio schedules a looping buffer at the shared late-join offset, not at zero', async () => {
  assert.equal(typeof audio.ClubAudio, 'function', 'ClubAudio must exist');
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => 10250 });
  player.setTrack('arabic-nights', 1000, 750);
  assert.equal(player.getTiming().positionSeconds, 10);
  assert.equal(context.sources.length, 0, 'no audio before gesture unlock');
  assert.equal(await player.unlock(), true);
  const source = context.sources.at(-1);
  assert.equal(source.loop, true);
  assert.equal(source.loopEnd, catalog.getTrack('arabic-nights').durationSeconds);
  const [startAt, offset] = source.starts[0];
  assert.ok(startAt >= context.currentTime);
  assert.ok(Math.abs(offset - (10 + startAt - context.currentTime)) < 1e-7);
  const count = context.sources.length;
  player.setTrack('arabic-nights', 1000, 750);
  assert.equal(context.sources.length, count, 'duplicate snapshots do not restart audio');
  await player.dispose();
  assert.equal(context.state, 'closed');
});

test('resuming catches up, track changes replace buffers, and volume is clamped', async () => {
  assert.equal(typeof audio.ClubAudio, 'function', 'ClubAudio must exist');
  const context = new FakeContext();
  let now = 10000;
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => now });
  player.setTrack('arabic-nights', 0, 0);
  await player.unlock();
  player.setVolume(2);
  assert.equal(player.getStatus().volume, 1);
  player.setMuted(true);
  assert.equal(player.getStatus().muted, true);
  await player.suspend();
  now += 10000;
  await player.resume();
  let source = context.sources.at(-1);
  assert.ok(Math.abs(source.starts[0][1] - 20.03) < 1e-7);
  player.setTrack('meditative-groove', now, 0);
  await new Promise((resolve) => setImmediate(resolve));
  source = context.sources.at(-1);
  assert.equal(source.loopEnd, catalog.getTrack('meditative-groove').durationSeconds);
  player.setServerOffset(200);
  assert.equal(player.getTiming().positionMs, 200);
  await player.dispose();
  assert.equal(await player.unlock(), false);
});

test('future track anchor is scheduled in AudioContext time with a zero buffer offset', async () => {
  assert.equal(typeof audio.ClubAudio, 'function', 'ClubAudio must exist');
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => 1000 });
  player.setTrack('arabic-nights', 2000, 0);
  await player.unlock();
  assert.deepEqual(context.sources.at(-1).starts[0], [11, 0]);
  await player.dispose();
});

test('small drift changes playback rate gently while large drift seeks to the server position', async () => {
  const context = new FakeContext();
  let now = 10000;
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => now });
  player.setTrack('arabic-nights', 0, 0);
  await player.unlock();
  const firstSource = context.sources.at(-1);
  context.currentTime += 2;
  now += 2020;
  player.resync();
  assert.equal(context.sources.at(-1), firstSource);
  assert.ok(firstSource.playbackRate.value > 1 && firstSource.playbackRate.value <= 1.005);
  assert.ok(Math.abs(player.getStatus().driftMs - 20) < 0.001);
  now += 250;
  player.resync();
  assert.notEqual(context.sources.at(-1), firstSource);
  assert.ok(firstSource.stops.length > 0);
  assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 12.3) < 0.000001);
  await player.dispose();
});

test('output latency is accounted for when selecting the playback offset', async () => {
  const context = new FakeContext();
  context.outputLatency = 0.05;
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => 10000 });
  player.setTrack('arabic-nights', 0, 0);
  await player.unlock();
  assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 10.08) < 0.000001);
  await player.dispose();
});

test('future source is not reported as playing until the room anchor arrives', async () => {
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => 1000 });
  player.setTrack('arabic-nights', 2000, 0);
  await player.unlock();
  try { assert.equal(player.getStatus().playing, false); }
  finally { await player.dispose(); }
});

test('invalid state is rejected without contaminating the audio clock', () => {
  const player = new TestClubAudio();
  assert.throws(() => player.setTrack('invalid', 0), /Unknown track/);
  assert.throws(() => player.setTrack('arabic-nights', NaN), /finite/);
  assert.throws(() => player.setServerOffset(NaN), /finite/);
  assert.throws(() => player.setVolume(Infinity), /finite/);
  assert.equal(player.getTiming(), null);
  void player.dispose();
});

test('loop boundaries reset progress while preserving the recorded lead-in phase', () => {
  for (const id of catalog.TRACK_IDS) {
    const track = catalog.getTrack(id);
    for (const loop of [100, 1000]) {
      const timing = catalog.getTrackTiming(id, 0, track.durationMs * loop);
      const expectedBeat = loop * track.loopBeats - track.downbeatOffsetMs * track.bpm / 60000;
      assert.ok(Math.abs(timing.absoluteBeat + timing.beatPhase - expectedBeat) < 1e-8);
      assert.equal(timing.positionMs, 0);
      assert.equal(timing.progress, 0);
    }
  }
});

test('visibility restoration catches up automatically and manual suspend prevents autoplay', async () => {
  const oldDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  const context = new FakeContext();
  let now = 10000;
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track), now: () => now });
  try {
    player.setTrack('arabic-nights', 0, 0);
    await player.unlock();
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(context.state, 'suspended');
    now += 5000;
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.state, 'running');
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 15.03) < 1e-7);
    await player.suspend();
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.state, 'suspended');
  } finally {
    await player.dispose();
    globalThis.document = oldDocument;
  }
});

function deferredBuffers() {
  const calls = [];
  const loadBuffer = (track, context, signal) => new Promise((resolve, reject) => calls.push({ track, signal, resolve, reject }));
  const resolve = (index) => calls[index].resolve(fakeBuffer(calls[index].track));
  return { calls, loadBuffer, resolve };
}

test('preparation is async and stale completions never restart the previous track', async () => {
  const context = new FakeContext();
  const pending = deferredBuffers();
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000, loadBuffer: pending.loadBuffer });
  player.setTrack('arabic-nights', 0, 0);
  const unlock = player.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(pending.calls.length, 1, 'recording must be prepared asynchronously');
    assert.equal(player.getStatus().loading, true);
    assert.equal(context.sources.filter((s) => s.loop).length, 0);
    player.setTrack('meditative-groove', 5000, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(pending.calls.length, 2);
    pending.resolve(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.sources.at(-1).loopEnd, catalog.getTrack('meditative-groove').durationSeconds);
    const currentSource = context.sources.at(-1);
    pending.resolve(0);
    await unlock;
    assert.equal(context.sources.at(-1), currentSource);
    assert.equal(player.getStatus().loading, false);
  } finally { await player.dispose(); }
});

test('completed preparation after dispose never creates audio nodes', async () => {
  const context = new FakeContext();
  const pending = deferredBuffers();
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000, loadBuffer: pending.loadBuffer });
  player.setTrack('arabic-nights', 0, 0);
  const unlock = player.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(pending.calls.length, 1);
    await player.dispose();
    const count = context.sources.length;
    pending.resolve(0);
    await unlock;
    assert.equal(context.sources.length, count);
    assert.equal(player.getStatus().contextState, 'closed');
  } finally { await player.dispose(); }
});

test('failed recording load is retryable and never starts a procedural fallback', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const context = new FakeContext();
  let attempts = 0;
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    loadBuffer: async (track) => { if (++attempts === 1) throw new Error('Offline'); return fakeBuffer(track); },
  });
  try {
    player.setTrack('arabic-nights', 0);
    assert.equal(await player.unlock(), false);
    assert.match(player.getStatus().error, /retry/i);
    assert.equal(player.getStatus().loading, false);
    assert.equal(context.sources.filter((source) => source.loop).length, 0);
    assert.equal(await player.unlock(), true);
    assert.equal(player.getStatus().error, null);
    assert.equal(attempts, 2);
  } finally { await player.dispose(); }
});

test('obsolete recording requests are aborted and only the selected recording stays cached', async () => {
  const context = new FakeContext();
  const calls = [];
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    loadBuffer: async (track, _context, signal) => { calls.push({ track, signal }); return fakeBuffer(track); },
  });
  try {
    player.setTrack('arabic-nights', 0);
    await player.unlock();
    player.setTrack('meditative-groove', 0); await tick();
    player.setTrack('arabic-nights', 0); await tick();
    assert.deepEqual(calls.map(({ track }) => track.id), ['arabic-nights', 'meditative-groove', 'arabic-nights']);
    const count = calls.length;
    player.resync(true); await tick();
    assert.equal(calls.length, count, 'drift correction reuses the selected buffer');
  } finally { await player.dispose(); }
});

test('default asset loader fetches and decodes MP3 bytes without requiring a Worker', async () => {
  const context = new FakeContext();
  const calls = [];
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 1]).buffer;
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    fetcher: async (url, options) => { calls.push({ url, options }); return { ok: true, arrayBuffer: async () => bytes }; },
  });
  try {
    player.setTrack('arabic-nights', 0);
    assert.equal(await player.unlock(), true);
    assert.equal(calls[0].url, catalog.getTrack('arabic-nights').audioUrl);
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.deepEqual(context.decoded[0], bytes);
    assert.notEqual(context.decoded[0], bytes, "decode must not detach the reusable compressed cache");
    assert.equal(context.sources.at(-1).buffer.duration, catalog.getTrack('arabic-nights').durationSeconds);
  } finally { await player.dispose(); }
});

test('slow recording preparation chooses the current server offset after decoding', async () => {
  const context = new FakeContext();
  const pending = deferredBuffers();
  let now = 1000;
  const player = new TestClubAudio({ createContext: () => context, now: () => now, loadBuffer: pending.loadBuffer });
  try {
    player.setTrack('arabic-nights', 0);
    const unlocking = player.unlock(); await tick();
    now = catalog.getTrack('arabic-nights').durationMs + 2500;
    pending.resolve(0); await unlocking;
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 2.53) < 1e-7);
  } finally { await player.dispose(); }
});

test('malformed or shorter-than-declared buffers fail safely instead of desynchronizing', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    loadBuffer: async (track) => fakeBuffer(track, track.durationSeconds - 5),
  });
  try {
    player.setTrack('arabic-nights', 0);
    assert.equal(await player.unlock(), false);
    assert.match(player.getStatus().error, /retry/i);
    assert.equal(context.sources.filter((source) => source.loop).length, 0);
  } finally { await player.dispose(); }
});

test('circular timing correction takes the short path across the real clip boundary', () => {
  assert.ok(Math.abs(audio.circularTimingError(0.02, 61.327, 61.337) - 0.03) < 1e-9);
});

test('native decoding is serialized and obsolete queued recordings are skipped', async () => {
  const context = new FakeContext();
  const decodes = [];
  context.decodeAudioData = (bytes) => new Promise((resolve) => decodes.push({ bytes, resolve }));
  const fetched = [];
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    fetcher: async (url, options) => {
      fetched.push({ url, signal: options.signal });
      return { ok: true, arrayBuffer: async () => new Uint8Array([fetched.length]).buffer };
    },
  });
  try {
    player.setTrack('arabic-nights', 0);
    const unlocking = player.unlock(); await tick();
    assert.equal(decodes.length, 1);
    player.setTrack('meditative-groove', 0); await tick();
    assert.equal(fetched[0].signal.aborted, true);
    player.setTrack('arabic-nights', 5000); await tick();
    assert.equal(fetched[1].signal.aborted, true);
    assert.equal(decodes.length, 1, 'cannot start another native decode while one is running');
    decodes[0].resolve(fakeBuffer(catalog.getTrack('arabic-nights'))); await tick();
    assert.equal(decodes.length, 2, 'skip the obsolete middle track entirely');
    assert.equal(new Uint8Array(decodes[1].bytes)[0], 1, "re-selection reuses already fetched compressed bytes");
    assert.equal(fetched.length, 2, "no third network request is necessary");
    decodes[1].resolve(fakeBuffer(catalog.getTrack('arabic-nights'))); await tick(); await unlocking;
    assert.equal(context.sources.filter((source) => source.loop).length, 1);
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 5.03) < 1e-7);
  } finally { await player.dispose(); }
});

test('disposing during native decoding aborts the fetch and drops the decoded buffer', async () => {
  const context = new FakeContext();
  let resolveDecode;
  let signal;
  context.decodeAudioData = () => new Promise((resolve) => { resolveDecode = resolve; });
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000,
    fetcher: async (_url, options) => { signal = options.signal; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
  });
  player.setTrack('arabic-nights', 0);
  const unlocking = player.unlock(); await tick();
  await player.dispose();
  assert.equal(signal.aborted, true);
  resolveDecode(fakeBuffer(catalog.getTrack('arabic-nights')));
  assert.equal(await unlocking, false);
  assert.equal(context.sources.filter((source) => source.loop).length, 0);
});

test('same-track new anchors cancel stale loads but duplicate snapshots share preparation', async () => {
  const context = new FakeContext();
  const pending = deferredBuffers();
  const player = new TestClubAudio({ createContext: () => context, now: () => 10000, loadBuffer: pending.loadBuffer });
  try {
    player.setTrack('arabic-nights', 0);
    const unlocking = player.unlock(); await tick();
    player.setTrack('arabic-nights', 0); await tick();
    assert.equal(pending.calls.length, 1);
    player.setTrack('arabic-nights', 5000); await tick();
    assert.equal(pending.calls[0].signal.aborted, true);
    pending.resolve(0); await unlocking;
    assert.equal(context.sources.filter((source) => source.loop).length, 0);
    pending.resolve(1); await tick();
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 5.03) < 1e-7);
  } finally { await player.dispose(); }
});

test('HTTP errors and oversize recordings never reach the decoder', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, arrayBuffer: async () => new ArrayBuffer(4 * 1024 * 1024 + 1) },
  ]) {
    const context = new FakeContext();
    const player = new TestClubAudio({ createContext: () => context, fetcher: async () => response });
    try {
      player.setTrack('arabic-nights', 0);
      assert.equal(await player.unlock(), false);
      assert.equal(context.decoded.length, 0);
      assert.match(player.getStatus().error, /retry/i);
    } finally { await player.dispose(); }
  }
});

test('a recording failure while hidden can be retried after returning to the foreground', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const oldDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  const context = new FakeContext();
  const pending = deferredBuffers();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: pending.loadBuffer });
  try {
    player.setTrack('arabic-nights', 0);
    const unlocking = player.unlock(); await tick();
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    pending.calls[0].reject(new Error('Network interrupted'));
    assert.equal(await unlocking, false);
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await tick();
    const retrying = player.unlock(); await tick();
    assert.equal(pending.calls.length, 2, 'a failed background request must not permanently latch the hidden flag');
    pending.resolve(1);
    assert.equal(await retrying, true);
    assert.equal(context.sources.filter((source) => source.loop).length, 1);
  } finally { await player.dispose(); globalThis.document = oldDocument; }
});

test('recording-specific loudness matching is applied before the independent personal volume', async () => {
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async (track) => fakeBuffer(track) });
  try {
    player.setTrack('arabic-nights', 0);
    player.setVolume(0.4);
    await player.unlock();
    const gain = catalog.getTrack('arabic-nights').playbackGain;
    assert.ok(Number.isFinite(gain) && gain > 0 && gain <= 2, 'recording uses measured loudness matching');
    assert.equal(context.gains.at(-1).gain.value, gain);
    assert.equal(context.gains[0].gain.value, 0.4);
  } finally { await player.dispose(); }
});

const AUDIO_TEST_IDS = ['arabic-nights', 'meditative-groove', 'filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove'];
function recordingFetchFixture(context) {
  const fetched = [];
  const decoded = [];
  context.decodeAudioData = async (bytes) => {
    const track = catalog.getTrack(AUDIO_TEST_IDS[new Uint8Array(bytes)[0]]);
    decoded.push(track.id);
    return fakeBuffer(track, track.durationSeconds, context.sampleRate);
  };
  return { fetched, decoded, fetcher: async (url) => {
    const index = AUDIO_TEST_IDS.findIndex(id => catalog.getTrack(id).audioUrl === url);
    fetched.push(AUDIO_TEST_IDS[index]);
    return { ok: true, arrayBuffer: async () => new Uint8Array([index]).buffer };
  } };
}
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

test('shared-order preloading waits for unlock, caches compressed alternatives, and switches a warm next track immediately', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  let now = 1000;
  const player = new TestClubAudio({ createContext: () => context, fetcher: fixture.fetcher, now: () => now });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove', 'filtered-chords', 'runway-poise']);
    player.setTrack('arabic-nights', 0);
    await settle();
    assert.equal(fixture.fetched.length, 0, 'no unsolicited fetching or decoding before the gesture');
    await player.unlock(); await settle();
    assert.deepEqual(fixture.fetched, ['arabic-nights', 'meditative-groove', 'runway-poise', 'filtered-chords']);
    assert.deepEqual(fixture.decoded, ['arabic-nights', 'meditative-groove'], 'only current plus next retain decoded PCM');
    assert.equal(player.getStatus().loading, false, 'background work is not foreground loading');
    const previous = context.sources.at(-1);
    now = 6500;
    player.setTrack('meditative-groove', 5000);
    assert.notEqual(context.sources.at(-1), previous, 'a warm selection schedules without waiting for network or decode');
    assert.equal(player.getStatus().loading, false);
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 1.53) < 1e-7, 'cached audio still joins the authoritative anchor');
    await settle();
    assert.equal(fixture.fetched.filter(id => id === 'meditative-groove').length, 1);
  } finally { await player.dispose(); }
});

test('selecting an in-flight prefetched track reuses its slow request and catches up after it resolves', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  let resolveNext;
  let nextCalls = 0;
  let now = 1000;
  const player = new TestClubAudio({ createContext: () => context, now: () => now, fetcher: async (url, options) => {
    if (url === catalog.getTrack('meditative-groove').audioUrl) {
      nextCalls++;
      return new Promise(resolve => { resolveNext = () => resolve({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }); });
    }
    return fixture.fetcher(url, options);
  } });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await tick();
    assert.equal(nextCalls, 1);
    player.setTrack('meditative-groove', 1000); await tick();
    assert.equal(nextCalls, 1, 'a foreground selection must not restart its in-flight prefetch');
    assert.equal(player.getStatus().loading, true);
    now = 9000; resolveNext(); await settle();
    assert.equal(player.getStatus().playing, true);
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 8.03) < 1e-7);
  } finally { await player.dispose(); }
});

test('background failure leaves current playback healthy and dispose aborts pending preload', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  let pendingSignal;
  let resolvePending;
  const player = new TestClubAudio({ createContext: () => context, fetcher: async (url, options) => {
    if (url === catalog.getTrack('meditative-groove').audioUrl) throw new Error('Prefetch unavailable');
    if (url === catalog.getTrack('runway-poise').audioUrl) {
      pendingSignal = options.signal;
      return new Promise(resolve => { resolvePending = () => resolve({ ok: true, arrayBuffer: async () => new Uint8Array([3]).buffer }); });
    }
    return fixture.fetcher(url, options);
  } });
  player.setPlaylistOrder(['arabic-nights', 'meditative-groove', 'runway-poise']);
  player.setTrack('arabic-nights', 0);
  await player.unlock(); await settle();
  assert.equal(player.getStatus().playing, true);
  assert.equal(player.getStatus().error, null);
  assert.equal(player.getStatus().loading, false);
  const sources = context.sources.length;
  await player.dispose();
  assert.equal(pendingSignal.aborted, true);
  resolvePending(); await settle();
  assert.equal(context.sources.length, sources);
});

test('high sample-rate contexts prefetch compressed tracks without exceeding the decoded warm-buffer budget', async () => {
  const context = new FakeContext();
  context.sampleRate = 96000;
  const fixture = recordingFetchFixture(context);
  const player = new TestClubAudio({ createContext: () => context, fetcher: fixture.fetcher });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove', 'filtered-chords', 'runway-poise']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await settle();
    assert.equal(fixture.fetched.length, 4);
    assert.deepEqual(fixture.decoded, ['arabic-nights'], 'no second 96 kHz PCM allocation on constrained budget');
  } finally { await player.dispose(); }
});

test('selecting an in-progress warm decode reuses it and never schedules the stale track afterward', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  const decode = context.decodeAudioData.bind(context);
  let resolveWarm;
  let warmDecodes = 0;
  context.decodeAudioData = bytes => {
    if (new Uint8Array(bytes)[0] === 1) {
      warmDecodes++;
      return new Promise(resolve => { resolveWarm = () => resolve(fakeBuffer(catalog.getTrack('meditative-groove'))); });
    }
    return decode(bytes);
  };
  let now = 1000;
  const player = new TestClubAudio({ createContext: () => context, now: () => now, fetcher: fixture.fetcher });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await settle();
    assert.equal(warmDecodes, 1);
    player.setTrack('meditative-groove', 1000); await tick();
    assert.equal(player.getStatus().loading, true);
    now = 7500; resolveWarm(); await settle();
    assert.equal(warmDecodes, 1, 'selected warm work is promoted instead of duplicated');
    assert.equal(context.sources.at(-1).buffer.duration, 96);
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 6.53) < 1e-7);
    assert.equal(player.getStatus().error, null);
  } finally { await player.dispose(); }
});

test('previous-track switching uses compressed prefetch without another network request', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  const player = new TestClubAudio({ createContext: () => context, fetcher: fixture.fetcher });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove', 'filtered-chords', 'runway-poise']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await settle();
    assert.ok(!fixture.decoded.includes('runway-poise'), 'previous is compressed, keeping PCM bounded');
    player.setTrack('runway-poise', 0); await settle();
    assert.equal(fixture.fetched.filter(id => id === 'runway-poise').length, 1);
    assert.ok(fixture.decoded.includes('runway-poise'));
    assert.equal(player.getStatus().playing, true);
  } finally { await player.dispose(); }
});

test('rapid selection abandons unrelated prefetch and does not reuse an already aborted promise', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  let firstSignal;
  let releaseFirst;
  let sunRequests = 0;
  const player = new TestClubAudio({ createContext: () => context, fetcher: async (url, options) => {
    if (url === catalog.getTrack('meditative-groove').audioUrl && ++sunRequests === 1) {
      firstSignal = options.signal;
      return new Promise(resolve => { releaseFirst = () => resolve({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }); });
    }
    return fixture.fetcher(url, options);
  } });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove', 'runway-poise']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await tick();
    player.setTrack('runway-poise', 0); await tick();
    assert.equal(firstSignal.aborted, true, 'foreground selection cancels an unrelated background fetch');
    player.setTrack('meditative-groove', 0); await settle();
    assert.equal(sunRequests, 2, 'an aborted prefetch must be retried rather than adopted');
    assert.equal(player.getStatus().playing, true);
    assert.equal(player.getStatus().error, null);
    const source = context.sources.at(-1);
    releaseFirst(); await settle();
    assert.equal(context.sources.at(-1), source, 'stale background response cannot start a source');
  } finally { await player.dispose(); }
});

test('compressed cache stays bounded without repeatedly fetching evicted background assets', async () => {
  const context = new FakeContext();
  const fixture = recordingFetchFixture(context);
  const player = new TestClubAudio({ createContext: () => context, fetcher: async (url, options) => {
    await tick();
    const response = await fixture.fetcher(url, options);
    const identifier = new Uint8Array(await response.arrayBuffer())[0];
    const bytes = new Uint8Array(3 * 1024 * 1024);
    bytes[0] = identifier;
    return { ok: true, arrayBuffer: async () => bytes.buffer };
  } });
  try {
    player.setPlaylistOrder(AUDIO_TEST_IDS);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await settle();
    assert.equal(fixture.fetched.length, 6, 'each background asset is attempted only once per selection');
    for (let i = 0; i < 3; i++) player.setPlaylistOrder(AUDIO_TEST_IDS);
    await settle();
    assert.equal(fixture.fetched.length, 6, 'duplicate snapshots do not create a prefetch/eviction loop');
    // Neon plus warm Sun is not an unbounded whole-playlist decoded cache.
    assert.deepEqual(fixture.decoded, ['arabic-nights', 'meditative-groove']);
  } finally { await player.dispose(); }
});

test('hiding while selected audio shares a warm preload cancels work without relocking audio and resumes at room time', async () => {
  const oldDocument = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  const context = new FakeContext();
  let calls = 0;
  let now = 1000;
  const player = new TestClubAudio({ createContext: () => context, now: () => now, loadBuffer: (track, _context, signal) => {
    if (track.id !== 'meditative-groove' || ++calls > 1) return Promise.resolve(fakeBuffer(track));
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
  } });
  try {
    player.setPlaylistOrder(['arabic-nights', 'meditative-groove']);
    player.setTrack('arabic-nights', 0);
    await player.unlock(); await tick();
    player.setTrack('meditative-groove', 1000); await tick();
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await tick();
    assert.equal(player.getStatus().unlocked, true, 'expected background cancellation is not a failed user unlock');
    assert.equal(player.getStatus().error, null);
    now = 10000;
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await settle();
    assert.equal(player.getStatus().playing, true);
    assert.equal(calls, 2, 'foreground restoration retries the current song once');
    assert.ok(Math.abs(context.sources.at(-1).starts[0][1] - 9.03) < 1e-7);
  } finally { await player.dispose(); globalThis.document = oldDocument; }
});

test('a long user recording decodes through the bounded-rate decoder even when hardware playback falls back to 96 kHz', async () => {
  const oldAudio = globalThis.AudioContext;
  const oldOffline = globalThis.OfflineAudioContext;
  const context = new FakeContext();
  context.sampleRate = 96000;
  const constructions = [];
  let decodes = 0;
  globalThis.AudioContext = function(options) {
    constructions.push(options);
    if (options.sampleRate) throw new Error('Requested rate unavailable');
    return context;
  };
  globalThis.OfflineAudioContext = function(channels, frames, sampleRate) {
    assert.deepEqual([channels, frames, sampleRate], [2, 1, 32000]);
    return { sampleRate, decodeAudioData: async () => { decodes++; return fakeBuffer(catalog.getTrack('filtered-chords')); } };
  };
  const player = new TestClubAudio({ fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3_400_000) }) });
  try {
    player.setTrack('filtered-chords', 0);
    assert.equal(await player.unlock(), true);
    assert.equal(constructions[0].sampleRate, 32000);
    assert.equal(constructions.length, 2);
    assert.equal(decodes, 1);
    assert.equal(context.sources.at(-1).buffer.sampleRate, 32000);
    assert.equal(context.sources.at(-1).loopEnd, catalog.getTrack('filtered-chords').durationSeconds);
  } finally { await player.dispose(); globalThis.AudioContext = oldAudio; globalThis.OfflineAudioContext = oldOffline; }
});

test('offline decoder rejection falls back to the actual playback rate and releases retired PCM before a long selection', async () => {
  const oldOffline = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = function() { throw new Error('Offline decoder unsupported'); };
  const context = new FakeContext();
  context.sampleRate = 96000;
  let selected = 'arabic-nights';
  context.decodeAudioData = async () => fakeBuffer(catalog.getTrack(selected), catalog.getTrack(selected).durationSeconds, 96000);
  const player = new TestClubAudio({ createContext: () => context, fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) });
  try {
    player.setTrack('arabic-nights', 0);
    await player.unlock();
    const retired = context.sources.at(-1);
    selected = 'filtered-chords';
    player.setTrack(selected, 0);
    assert.equal(retired.buffer, null, 'cold-switch retirement releases application-held PCM before decode');
    await settle();
    assert.equal(player.getStatus().playing, true, 'a normal hardware-rate fallback can play a full-length song');
    const selectedBuffer = context.sources.at(-1).buffer;
    assert.ok(selectedBuffer.length * selectedBuffer.numberOfChannels * 4 <= 160 * 1024 * 1024);
    assert.equal(selectedBuffer.sampleRate, 96000);
  } finally { await player.dispose(); globalThis.OfflineAudioContext = oldOffline; }
});

test('an offline decode failure gives one retryable foreground error and succeeds on the next gesture', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const oldOffline = globalThis.OfflineAudioContext;
  const context = new FakeContext();
  let attempts = 0;
  globalThis.OfflineAudioContext = function() {
    return { sampleRate: 32000, decodeAudioData: async () => {
      if (++attempts === 1) throw new Error('Decoder rejected recording');
      return fakeBuffer(catalog.getTrack('filtered-chords'));
    } };
  };
  const player = new TestClubAudio({ createContext: () => context, fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) });
  try {
    player.setTrack('filtered-chords', 0);
    assert.equal(await player.unlock(), false);
    assert.match(player.getStatus().error, /retry/i);
    assert.equal(attempts, 1);
    assert.equal(await player.unlock(), true);
    assert.equal(attempts, 2);
    assert.equal(player.getStatus().error, null);
  } finally { await player.dispose(); globalThis.OfflineAudioContext = oldOffline; }
});

test('retiring crossfade nodes release their PCM before suspend or a following cold decode', async () => {
  const context = new FakeContext();
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track) });
  try {
    player.setTrack('arabic-nights', 0);
    await player.unlock();
    const retired = context.sources.at(-1);
    player.resync(true);
    assert.ok(retired.stops.length > 0);
    await player.suspend();
    assert.equal(retired.buffer, null, 'retiring source is released even before its delayed onended callback');
  } finally { await player.dispose(); }
});

test('default-enabled startup requests playback without returning a promise or claiming blocked audio is playing', async () => {
  const context = new FakeContext();
  let resumes = 0;
  context.resume = () => {
    if (++resumes === 1) return new Promise(() => {});
    context.state = 'running';
    return Promise.resolve();
  };
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track) });
  player.setTrack('arabic-nights', 0);
  assert.equal(player.requestPlayback(), undefined, 'startup must not block the UI on autoplay policy');
  assert.equal(player.getStatus().desiredEnabled, true);
  assert.equal(player.getStatus().needsGesture, true);
  assert.equal(player.getStatus().playing, false);
  assert.equal(player.getStatus().error, null);
  player.requestPlayback(); // A direct intentional-interaction handler can try again.
  await settle();
  assert.equal(resumes, 2);
  assert.equal(player.getStatus().playing, true);
  assert.equal(player.getStatus().needsGesture, false);
});

test('browser autoplay rejection is a gesture-needed state, then a permitted interaction resumes music', async () => {
  const context = new FakeContext();
  let attempts = 0;
  context.resume = async () => {
    if (++attempts === 1) throw new DOMException('Gesture required', 'NotAllowedError');
    context.state = 'running';
  };
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track) });
  player.setTrack('arabic-nights', 0);
  player.requestPlayback(); await settle();
  assert.equal(player.getStatus().needsGesture, true);
  assert.equal(player.getStatus().error, null, 'policy refusal is not a failed music download');
  assert.equal(player.getStatus().playing, false);
  player.requestPlayback(); await settle();
  assert.equal(player.getStatus().playing, true);
});

test('fresh launches default to music on even after a persisted mute, while same-session mute stays sticky', async () => {
  const oldStorage = globalThis.localStorage;
  const values = new Map([["afterhours:music-muted", "true"]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    let contexts = 0;
    const createContext = () => { contexts++; return new FakeContext(); };
    const first = new TestClubAudio({ createContext, loadBuffer: async track => fakeBuffer(track) });
    assert.equal(first.getStatus().muted, false, 'ignore an old stored mute on a fresh launch');
    first.setMuted(true);
    first.requestPlayback();
    assert.equal(contexts, 0);
    await first.dispose();
    const next = new TestClubAudio({ createContext, loadBuffer: async track => fakeBuffer(track) });
    next.setTrack('arabic-nights', 0);
    next.requestPlayback(); await tick();
    assert.equal(contexts, 1, 'a new launch independently requests its default-on music');
    assert.equal(next.getStatus().muted, false);
    assert.equal(next.getStatus().desiredEnabled, true);
    await settle();
    assert.equal(next.getStatus().playing, true);
    next.setMuted(true); next.requestPlayback(); await tick();
    assert.equal(next.getStatus().muted, true);
    assert.equal(next.getStatus().playing, false);
  } finally { globalThis.localStorage = oldStorage; }
});

test('disposal settles a stalled resume without starting a source afterward', async () => {
  const context = new FakeContext();
  context.resume = () => new Promise(() => {});
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track) });
  player.setTrack('arabic-nights', 0);
  const pending = player.unlock();
  await tick();
  await player.dispose();
  assert.equal(await pending, false);
  assert.equal(context.sources.filter(source => source.loop).length, 0);
});

test('a resume that becomes running after the bounded wait is adopted without another user click', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = new FakeContext();
  context.resume = () => new Promise(() => {});
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track) });
  player.setTrack('arabic-nights', 0);
  player.requestPlayback();
  t.mock.timers.tick(450); await tick();
  assert.equal(player.getStatus().playing, false);
  context.state = 'running';
  context.listeners.get('statechange')();
  await settle();
  assert.equal(player.getStatus().playing, true);
  assert.equal(player.getStatus().needsGesture, false);
});

test('scheduled future music notifies playback state once its room anchor arrives', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = new FakeContext();
  let now = 1000;
  const statuses = [];
  const player = new TestClubAudio({ createContext: () => context, loadBuffer: async track => fakeBuffer(track), now: () => now, onStateChange: status => statuses.push(status) });
  player.setTrack('arabic-nights', 2000);
  await player.unlock();
  assert.equal(statuses.at(-1).playing, false);
  now = 2050; context.currentTime = 11.05;
  t.mock.timers.tick(1050); await settle();
  assert.equal(statuses.at(-1).playing, true, 'the UI hears about source start even without another room event or gesture');
});
