import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// A missing module is an explicit missing-feature assertion during the first RED pass.
const ocean = await import('../lib/client/ocean-audio.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('surf synthesis preserves the exact legacy stereo samples and deterministic seam', () => {
  assert.equal(typeof ocean.createOceanNoise, 'function', 'the surf synthesis export exists');
  // Hashes from authorized legacy commit 55de7c92b90d54665d4f4772b793aa5be46e856b.
  const expected = [
    '5316a284b7266a3e768d15e9bc0a0ed84a50dba0c3e7f378d7fcfbf4ff7f874b',
    '062e0808619a19d9717cb9fb9e74780dc5d170798127cd97ae214563ca535533',
  ];
  const channels = ocean.createOceanNoise();
  assert.equal(channels.length, 2);
  assert.deepEqual(channels.map(data => createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex')), expected);
  assert.deepEqual(channels, ocean.createOceanNoise());
  assert.notDeepEqual(channels[0], channels[1]);
});

test('surf samples stay finite, centered, peak bounded and seam softened at supported lengths', () => {
  assert.equal(typeof ocean.createOceanNoise, 'function', 'the surf synthesis export exists');
  for (const [sampleRate, seconds] of [[22050, 2], [22050, 12], [44100, 1]]) {
    for (const data of ocean.createOceanNoise(sampleRate, seconds)) {
      assert.equal(data.length, sampleRate * seconds);
      let peak = 0, sum = 0;
      for (const value of data) {
        assert.ok(Number.isFinite(value));
        peak = Math.max(peak, Math.abs(value));
        sum += value;
      }
      assert.ok(peak > .1 && peak <= .76);
      assert.ok(Math.abs(sum / data.length) < .001);
      assert.ok(Math.abs(data[0] - data.at(-1)) < .15);
    }
  }
});

// These fakes model browser graph/lifecycle effects without creating audible output.
class AudioParam {
  value = 0;
  events = [];
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(['target', value, time, duration]); }
}
class AudioNode {
  connections = [];
  started = false;
  stopped = false;
  disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; this.disconnected = true; }
  start(...args) { this.started = true; this.startArgs = args; }
  stop() { this.stopped = true; }
}
class FakeAudioContext {
  state = 'suspended';
  currentTime = 12;
  destination = new AudioNode();
  sources = [];
  gains = [];
  filters = [];
  oscillators = [];
  resumes = 0;
  suspends = 0;
  closes = 0;
  blocked = false;
  resumeGate = null;
  suspendGate = null;
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({length: channels}, () => new Float32Array(length));
    return {length, sampleRate, numberOfChannels: channels, getChannelData: n => data[n]};
  }
  createBufferSource() { const node = new AudioNode(); this.sources.push(node); return node; }
  createGain() { const node = Object.assign(new AudioNode(), {gain: new AudioParam()}); this.gains.push(node); return node; }
  createBiquadFilter() { const node = Object.assign(new AudioNode(), {frequency: new AudioParam(), Q: new AudioParam()}); this.filters.push(node); return node; }
  createOscillator() { const node = Object.assign(new AudioNode(), {frequency: new AudioParam()}); this.oscillators.push(node); return node; }
  transition(state) { this.state = state; this.onstatechange?.(); }
  async resume() {
    this.resumes++;
    if (this.blocked) throw new Error('NotAllowedError');
    if (this.resumeGate) await this.resumeGate;
    if (this.state === 'closed') throw new Error('InvalidStateError');
    this.transition('running');
  }
  async suspend() {
    this.suspends++;
    if (this.suspendGate) await this.suspendGate;
    if (this.state === 'closed') throw new Error('InvalidStateError');
    this.transition('suspended');
  }
  async close() { this.closes++; this.transition('closed'); }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function setup(options = {}) {
  assert.equal(typeof ocean.createOceanAudioController, 'function', 'the vanilla audio controller exists');
  const ctx = new FakeAudioContext(), statuses = [], timers = new Map();
  const storage = new Map(options.muted === undefined ? [] : [[ocean.OCEAN_MUTE_KEY, String(options.muted)]]);
  let created = 0, timerId = 0;
  const audio = ocean.createOceanAudioController({
    createContext: () => { created++; return ctx; },
    storage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    onStatus: status => statuses.push(status),
    schedule: (fn, ms) => { const id = ++timerId; timers.set(id, {fn, ms}); return id; },
    cancel: id => timers.delete(id),
    ...options,
  });
  const fireTimers = async () => {
    for (const [id, {fn}] of [...timers]) { timers.delete(id); fn(); }
    await flush();
  };
  return {audio, ctx, statuses, timers, storage, created: () => created, fireTimers};
}

test('construction and visibility changes stay silent until a direct user gesture', async () => {
  const h = setup();
  assert.deepEqual(h.audio.status, {muted: false, playing: false, needsGesture: false, unavailable: false});
  h.audio.setHidden(true); h.audio.setHidden(false);
  await flush();
  assert.equal(h.created(), 0);
  assert.equal(h.storage.size, 0, 'default state never overwrites saved preferences');
  h.audio.startFromGesture();
  assert.equal(h.ctx.resumes, 1, 'resume is invoked synchronously in the gesture call stack');
  await flush();
  assert.equal(h.audio.status.playing, true);
  h.audio.dispose();
});

test('one waves-only graph preserves both legacy layers, routing, offsets and quiet master', async () => {
  const h = setup(); h.audio.startFromGesture(); await flush();
  assert.equal(h.ctx.sources.length, 2);
  assert.equal(h.ctx.oscillators.length, 2);
  assert.deepEqual(h.ctx.sources.map(node => node.startArgs), [[0, 0], [0, 5.3]]);
  assert.ok(h.ctx.sources.every(node => node.loop && node.buffer.numberOfChannels === 2 && node.buffer.sampleRate === 22050 && node.buffer.length === 264600));
  assert.equal(h.ctx.sources[0].buffer, h.ctx.sources[1].buffer);
  assert.deepEqual(h.ctx.filters.map(node => [node.type, node.frequency.value, node.Q.value]), [
    ['highpass', 85, .5], ['lowpass', 950, .5], ['highpass', 620, .5], ['lowpass', 2300, .5],
  ]);
  assert.deepEqual(h.ctx.gains.map(node => node.gain.value), [.18, .3575, .208, .06175, .052]);
  assert.deepEqual(h.ctx.oscillators.map(node => [node.type, node.frequency.value]), [['sine', .076], ['sine', .057]]);
  assert.deepEqual(h.ctx.gains[0].connections, [h.ctx.destination]);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(h.ctx.sources[i].connections, [h.ctx.filters[i * 2]]);
    assert.deepEqual(h.ctx.filters[i * 2].connections, [h.ctx.filters[i * 2 + 1]]);
    assert.deepEqual(h.ctx.filters[i * 2 + 1].connections, [h.ctx.gains[i * 2 + 1]]);
    assert.deepEqual(h.ctx.gains[i * 2 + 1].connections, [h.ctx.gains[0]]);
    assert.deepEqual(h.ctx.oscillators[i].connections, [h.ctx.gains[i * 2 + 2]]);
    assert.deepEqual(h.ctx.gains[i * 2 + 2].connections, [h.ctx.gains[i * 2 + 1].gain]);
  }
  assert.ok(h.ctx.gains[0].gain.events.some(event => event[0] === 'target' && event[1] === .18 && event[3] === .35));
  h.audio.startFromGesture(); h.audio.startFromGesture(); await flush();
  assert.equal(h.created(), 1); assert.equal(h.ctx.sources.length, 2);
  h.audio.dispose();
});

test('saved mute survives ordinary gestures and hidden/visible transitions until explicit unmute', async () => {
  const h = setup({muted: true});
  assert.equal(ocean.OCEAN_MUTE_KEY, 'manor-next:ocean-muted:v1');
  h.audio.startFromGesture(); h.audio.setHidden(true); h.audio.setHidden(false); await flush();
  assert.equal(h.created(), 0); assert.equal(h.audio.status.muted, true);
  h.audio.toggleMute();
  assert.equal(h.ctx.resumes, 1);
  await flush();
  assert.equal(h.storage.get(ocean.OCEAN_MUTE_KEY), 'false');
  assert.equal(h.audio.status.muted, false); assert.equal(h.audio.status.playing, true);
  h.audio.dispose();
});

test('mute before first playback persists and cannot be cleared by unrelated gestures', async () => {
  const h = setup(); h.audio.toggleMute(); h.audio.startFromGesture(); await flush();
  assert.equal(h.audio.status.muted, true); assert.equal(h.created(), 0);
  assert.equal(h.storage.get(ocean.OCEAN_MUTE_KEY), 'true');
  h.audio.dispose();
});

test('mute uses the original short fade then suspends, while rapid unmute cancels the timer', async () => {
  const h = setup(); h.audio.startFromGesture(); await flush(); h.audio.toggleMute();
  assert.equal(h.audio.status.playing, false);
  assert.ok(h.ctx.gains[0].gain.events.some(event => event[0] === 'target' && event[1] === 0 && event[3] === .035));
  assert.equal([...h.timers.values()][0].ms, 180);
  await h.fireTimers(); assert.equal(h.ctx.state, 'suspended');
  h.audio.toggleMute(); await flush();
  h.audio.toggleMute(); const staleTimer = [...h.timers.values()][0].fn;
  h.audio.toggleMute(); staleTimer(); await flush(); await h.fireTimers();
  assert.equal(h.ctx.state, 'running'); assert.equal(h.audio.status.playing, true);
  h.audio.dispose();
});

test('an already pending suspend cannot win over a newer gesture unmute', async () => {
  const h = setup(); h.audio.startFromGesture(); await flush();
  const gate = deferred(); h.ctx.suspendGate = gate.promise;
  h.audio.toggleMute(); await h.fireTimers();
  assert.equal(h.ctx.suspends, 1);
  h.audio.toggleMute(); await flush();
  gate.resolve(); await flush();
  assert.equal(h.ctx.state, 'running'); assert.equal(h.audio.status.playing, true);
  assert.equal(h.ctx.sources.length, 2, 'recovery reuses the original graph');
  h.audio.dispose();
});

test('hidden/pagehide immediately silences and returning resumes only an already requested stream', async () => {
  const h = setup(); h.audio.setHidden(true); h.audio.startFromGesture();
  h.audio.setHidden(false); await flush(); assert.equal(h.created(), 0);
  h.audio.startFromGesture(); await flush(); h.audio.setHidden(true);
  assert.equal(h.ctx.gains[0].gain.value, 0); assert.equal(h.audio.status.playing, false);
  assert.equal(h.ctx.suspends, 1); await flush(); assert.equal(h.ctx.state, 'suspended');
  h.audio.setHidden(false); await flush(); assert.equal(h.audio.status.playing, true);
  h.audio.setHidden(true); h.audio.toggleMute(); h.audio.setHidden(false); await flush();
  assert.equal(h.audio.status.muted, true); assert.equal(h.ctx.state, 'suspended');
  h.audio.dispose();
});

test('hide then show while suspend is pending restores running state without a second gesture', async () => {
  const h = setup(); h.audio.startFromGesture(); await flush();
  const gate = deferred(); h.ctx.suspendGate = gate.promise;
  h.audio.setHidden(true); h.audio.setHidden(false); await flush();
  gate.resolve(); await flush();
  assert.equal(h.ctx.state, 'running'); assert.equal(h.audio.status.playing, true);
  h.audio.dispose();
});

test('a pending resume cannot override explicit mute or hidden state', async () => {
  for (const pause of [audio => audio.toggleMute(), audio => audio.setHidden(true)]) {
    const h = setup(), gate = deferred(); h.ctx.resumeGate = gate.promise;
    h.audio.startFromGesture(); pause(h.audio); gate.resolve(); await flush(); await h.fireTimers();
    assert.equal(h.audio.status.playing, false); assert.equal(h.ctx.gains[0].gain.value, 0);
    assert.equal(h.ctx.state, 'suspended'); h.audio.dispose();
  }
});

test('gesture rejection stays retryable, and explicit toggle still means mute', async () => {
  const h = setup(); h.ctx.blocked = true; h.audio.startFromGesture(); await flush();
  assert.equal(h.audio.status.needsGesture, true); assert.equal(h.audio.status.unavailable, false);
  h.audio.toggleMute();
  assert.equal(h.audio.status.muted, true); assert.equal(h.audio.status.needsGesture, false);
  h.ctx.blocked = false; h.audio.toggleMute(); await flush();
  assert.equal(h.audio.status.playing, true); assert.equal(h.audio.status.needsGesture, false);
  h.audio.dispose();
});

test('synchronous resume failure and external interruption allow another direct gesture', async () => {
  const h = setup(), resume = h.ctx.resume.bind(h.ctx);
  h.ctx.resume = () => { throw new Error('NotAllowedError'); };
  assert.doesNotThrow(() => h.audio.startFromGesture());
  assert.equal(h.audio.status.needsGesture, true); assert.equal(h.audio.status.unavailable, false);
  h.ctx.resume = resume; h.audio.startFromGesture(); await flush();
  h.ctx.transition('interrupted'); assert.equal(h.audio.status.playing, false);
  assert.equal(h.audio.status.needsGesture, true);
  h.audio.startFromGesture(); await flush(); assert.equal(h.audio.status.playing, true);
  h.audio.dispose();
});

test('late rejected resume cannot overwrite a newer successful playback request', async () => {
  const h = setup(), gate = deferred(), resume = h.ctx.resume.bind(h.ctx);
  h.ctx.resume = () => gate.promise; h.audio.startFromGesture();
  h.ctx.resume = resume; h.audio.startFromGesture(); await flush();
  gate.reject(new Error('stale NotAllowedError')); await flush();
  assert.equal(h.audio.status.playing, true); assert.equal(h.audio.status.needsGesture, false);
  h.audio.dispose();
});

test('partial graph failure stops/disconnects all created nodes and retry uses a fresh graph', async () => {
  const first = new FakeAudioContext(), second = new FakeAudioContext();
  const makeFilter = first.createBiquadFilter.bind(first); let filters = 0, attempts = 0;
  first.createBiquadFilter = () => { if (++filters === 3) throw new Error('graph failed'); return makeFilter(); };
  const h = setup({createContext: () => ++attempts === 1 ? first : second});
  h.audio.startFromGesture();
  assert.equal(h.audio.status.unavailable, true); assert.equal(first.closes, 1);
  assert.ok([...first.sources, ...first.gains, ...first.filters, ...first.oscillators].every(node => node.disconnected));
  assert.ok([...first.sources, ...first.oscillators].every(node => node.stopped));
  h.audio.startFromGesture(); await flush();
  assert.equal(h.audio.status.playing, true); assert.equal(h.audio.status.unavailable, false);
  h.audio.dispose();
});

test('closed contexts are rebuilt only for a later requested playback', async () => {
  const first = new FakeAudioContext(), second = new FakeAudioContext(); let calls = 0;
  const h = setup({createContext: () => ++calls === 1 ? first : second});
  h.audio.startFromGesture(); await flush(); first.transition('closed');
  assert.equal(h.audio.status.playing, false);
  h.audio.startFromGesture(); await flush();
  assert.equal(calls, 2); assert.equal(second.state, 'running');
  assert.ok(first.sources.every(node => node.stopped && node.disconnected));
  h.audio.dispose();
});

test('unavailable Web Audio and denied storage remain quiet and do not block controls', () => {
  const h = setup({
    createContext: () => { throw new Error('unavailable'); },
    storage: {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }},
  });
  assert.doesNotThrow(() => h.audio.startFromGesture());
  assert.equal(h.audio.status.unavailable, true); assert.equal(h.audio.status.playing, false);
  assert.doesNotThrow(() => h.audio.toggleMute());
  assert.equal(h.audio.status.muted, true); h.audio.dispose();
});

test('status snapshots and subscriptions cannot mutate playback and unsubscribe/dispose stop delivery', async () => {
  const h = setup(), received = [];
  const unsubscribe = h.audio.subscribe(status => { received.push(status); status.muted = true; });
  assert.equal(received.length, 1);
  h.audio.state.muted = true; h.audio.status.muted = true;
  assert.equal(h.audio.status.muted, false);
  h.audio.startFromGesture(); await flush(); assert.equal(h.audio.status.playing, true);
  unsubscribe(); const count = received.length; h.audio.toggleMute(); await flush();
  assert.equal(received.length, count);
  h.audio.dispose(); const delivered = h.statuses.length;
  h.audio.toggleMute(); h.audio.startFromGesture(); h.audio.setHidden(true); await flush();
  assert.equal(h.statuses.length, delivered); assert.equal(h.audio.state.playing, false);
});

test('dispose is idempotent, closes/stops the whole graph, clears timers and ignores late operations', async () => {
  for (const operation of ['resume', 'suspend']) {
    const h = setup(), gate = deferred();
    if (operation === 'resume') h.ctx.resumeGate = gate.promise;
    h.audio.startFromGesture(); await flush();
    if (operation === 'suspend') { h.ctx.suspendGate = gate.promise; h.audio.setHidden(true); }
    h.audio.dispose(); h.audio.dispose(); const delivered = h.statuses.length;
    gate.resolve(); await flush();
    assert.equal(h.ctx.closes, 1); assert.equal(h.ctx.onstatechange, null);
    assert.ok([...h.ctx.sources, ...h.ctx.oscillators].every(node => node.stopped));
    assert.ok([...h.ctx.sources, ...h.ctx.gains, ...h.ctx.filters, ...h.ctx.oscillators].every(node => node.disconnected));
    assert.equal(h.audio.status.playing, false); assert.equal(h.timers.size, 0);
    assert.equal(h.statuses.length, delivered);
    h.audio.startFromGesture(); assert.equal(h.created(), 1);
  }
});
