import assert from 'node:assert/strict';
import test from 'node:test';
import {createFishingCatchWorkerClient} from '../lib/fishing-catch-worker-client.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const input = name => ({name});
const result = name => ({name});
const cancelled = error => error?.name === 'AbortError';

class MockWorker {
  constructor() {
    this.messages = [];
    this.listeners = new Map();
    this.terminated = false;
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  postMessage(...args) {
    if (this.postError) throw this.postError;
    this.messages.push(args);
  }
  terminate() { this.terminated = true; }
  emit(type, data) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(data);
  }
  reply(value, id = this.messages.at(-1)[0].id) {
    this.emit('message', {data: {id, result: value}});
  }
}

function fixture(fallback = async value => result(`fallback:${value.name}`)) {
  const workers = [];
  const workerFactory = () => {
    const worker = new MockWorker();
    workers.push(worker);
    return worker;
  };
  return {workers, options: {workerFactory, fallback}};
}

function visibleClock(context) {
  context.mock.timers.enable({apis: ['setTimeout', 'Date'], now: 0});
  context.mock.method(performance, 'now', () => Date.now());
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = new class extends EventTarget {
    hidden = false;
    setHidden(hidden) {
      this.hidden = hidden;
      this.dispatchEvent(new Event('visibilitychange'));
    }
  }();
  Object.defineProperty(globalThis, 'document', {value: document, configurable: true});
  context.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else delete globalThis.document;
  });
  return {document, advance: ms => context.mock.timers.tick(ms)};
}

test('twelve clients share at most two workers and release them only after the last client', async () => {
  const {workers, options} = fixture();
  const clients = Array.from({length: 12}, () => createFishingCatchWorkerClient(options));
  try {
    assert.equal(workers.length, 0, 'worker creation is lazy');
    const promises = clients.map((client, index) => client.solve(input(String(index))));
    assert.equal(workers.length, 2);
    let completed = 0;
    while (completed < promises.length) {
      for (const worker of workers) {
        const message = worker.messages.at(-1)?.[0];
        if (!message || message.id === worker.lastReplied) continue;
        worker.lastReplied = message.id;
        worker.reply(result(message.input.name));
        completed += 1;
      }
      await tick();
    }
    assert.deepEqual(await Promise.all(promises), clients.map((_, index) => result(String(index))));
    assert.equal(workers.length, 2);
    for (const client of clients.slice(0, -1)) client.dispose();
    assert.ok(workers.every(worker => !worker.terminated));
    clients.at(-1).dispose();
    assert.ok(workers.every(worker => worker.terminated));
    assert.ok(workers.every(worker => [...worker.listeners.values()].every(set => set.size === 0)));
  } finally { clients.forEach(client => client.dispose()); }
});

test('request IDs route out-of-order results and ignore stale and unknown responses', async () => {
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const first = client.solve(input('first'));
    const second = client.solve(input('second'));
    const firstId = workers[0].messages[0][0].id;
    const secondId = workers[1].messages[0][0].id;
    assert.notEqual(firstId, secondId);
    workers[0].reply(result('wrong worker'), secondId);
    workers[1].reply(result('unknown'), secondId + 10000);
    workers[1].reply(result('second'));
    assert.deepEqual(await second, result('second'));
    workers[0].reply(result('first'));
    assert.deepEqual(await first, result('first'));
    const third = client.solve(input('third'));
    const busy = workers.find(worker => worker.messages.at(-1)[0].input.name === 'third');
    busy.reply(result('stale'), firstId);
    busy.reply(result('third'));
    assert.deepEqual(await third, result('third'));
  } finally { client.dispose(); }
});

test('queued cancellation does not consume a worker or disturb running requests', async () => {
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const first = client.solve(input('first'));
    const second = client.solve(input('second'));
    const abort = new AbortController();
    const queued = client.solve(input('queued'), abort.signal);
    const rejection = assert.rejects(queued, cancelled);
    abort.abort();
    await rejection;
    workers[0].reply(result('first'));
    workers[1].reply(result('second'));
    await Promise.all([first, second]);
    assert.equal(workers.length, 2);
    assert.equal(workers.reduce((count, worker) => count + worker.messages.length, 0), 2);
    assert.ok(workers.every(worker => !worker.terminated));
  } finally { client.dispose(); }
});

test('running cancellation retires only that worker and stale callbacks cannot settle replacement work', async () => {
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const abort = new AbortController();
    const first = client.solve(input('first'), abort.signal);
    const rejection = assert.rejects(first, cancelled);
    const second = client.solve(input('second'));
    const staleListener = [...workers[0].listeners.get('message')][0];
    const oldId = workers[0].messages[0][0].id;
    const third = client.solve(input('third'));
    abort.abort();
    await rejection;
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[1].terminated, false);
    assert.equal(workers.length, 3);
    assert.equal(workers.filter(worker => !worker.terminated).length, 2);
    staleListener({data: {id: oldId, result: result('stale')}});
    workers[2].reply(result('third'));
    workers[1].reply(result('second'));
    assert.deepEqual(await Promise.all([second, third]), [result('second'), result('third')]);
  } finally { client.dispose(); }
});

test('already aborted requests never create or post to a worker', async () => {
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  const abort = new AbortController();
  abort.abort();
  try {
    await assert.rejects(client.solve(input('cancelled'), abort.signal), cancelled);
    assert.equal(workers.length, 0);
  } finally { client.dispose(); }
});

test('disposing a client rejects its running and queued requests without cancelling another client', async () => {
  const {workers, options} = fixture();
  const firstClient = createFishingCatchWorkerClient(options);
  const otherClient = createFishingCatchWorkerClient(options);
  try {
    const running = firstClient.solve(input('first'));
    const other = otherClient.solve(input('other'));
    const queued = firstClient.solve(input('queued'));
    const rejected = [assert.rejects(running, cancelled), assert.rejects(queued, cancelled)];
    firstClient.dispose();
    firstClient.dispose();
    await Promise.all(rejected);
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[1].terminated, false);
    workers[1].reply(result('other'));
    assert.deepEqual(await other, result('other'));
    await assert.rejects(firstClient.solve(input('late')), cancelled);
  } finally { firstClient.dispose(); otherClient.dispose(); }
});

test('Worker construction failure schedules bounded cooperative fallback after a timer heartbeat', async () => {
  const events = [];
  let constructions = 0;
  let active = 0;
  let maximumActive = 0;
  const fallback = async value => {
    events.push(`fallback:${value.name}`);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await tick();
    active -= 1;
    return result(value.name);
  };
  const options = {workerFactory: () => { constructions += 1; throw new Error('unsupported'); }, fallback};
  const client = createFishingCatchWorkerClient(options);
  try {
    setTimeout(() => events.push('heartbeat'), 0);
    const promises = Array.from({length: 6}, (_, index) => client.solve(input(String(index))));
    assert.deepEqual(events, [], 'fallback is never invoked synchronously');
    assert.deepEqual(await Promise.all(promises), Array.from({length: 6}, (_, index) => result(String(index))));
    assert.equal(events[0], 'heartbeat');
    assert.equal(constructions, 1, 'unsupported workers are not repeatedly constructed');
    assert.ok(maximumActive <= 2);
  } finally { client.dispose(); }
});

for (const failure of ['error', 'messageerror', 'postMessage', 'reported error']) {
  test(`${failure} retires a broken worker and resolves with asynchronously scheduled fallback`, async () => {
    const fallbackCalls = [];
    const {workers, options} = fixture(async value => {
      fallbackCalls.push(value.name);
      return result(`recovered:${value.name}`);
    });
    if (failure === 'postMessage') {
      const factory = options.workerFactory;
      options.workerFactory = () => { const worker = factory(); worker.postError = new Error('post failed'); return worker; };
    }
    const client = createFishingCatchWorkerClient(options);
    try {
      const solved = client.solve(input('first'));
      const worker = workers[0];
      if (failure === 'reported error') worker.emit('message', {data: {id: worker.messages[0][0].id, error: 'solve failed'}});
      else if (failure !== 'postMessage') worker.emit(failure, {message: 'failed', preventDefault() {}});
      assert.equal(worker.terminated, true);
      assert.deepEqual(fallbackCalls, []);
      assert.deepEqual(await solved, result('recovered:first'));
      assert.deepEqual(fallbackCalls, ['first']);
    } finally { client.dispose(); }
  });
}

test('fallback rejection settles the request and frees the queue slot', async () => {
  const error = new Error('fallback failed');
  const client = createFishingCatchWorkerClient({workerFactory: () => { throw new Error('unsupported'); }, fallback: async () => { throw error; }});
  try {
    await assert.rejects(client.solve(input('first')), value => value === error);
    await assert.rejects(client.solve(input('second')), value => value === error);
  } finally { client.dispose(); }
});

test('fallback cancellation propagates its signal and suppresses late completion', async () => {
  let fallbackSignal;
  let release;
  const client = createFishingCatchWorkerClient({
    workerFactory: () => { throw new Error('unsupported'); },
    fallback: (_value, signal) => {
      fallbackSignal = signal;
      return new Promise(resolve => { release = resolve; });
    },
  });
  try {
    const abort = new AbortController();
    const solved = client.solve(input('first'), abort.signal);
    const rejected = assert.rejects(solved, cancelled);
    await tick();
    assert.equal(fallbackSignal.aborted, false);
    abort.abort();
    await rejected;
    assert.equal(fallbackSignal.aborted, true);
    release(result('late'));
    await tick();
  } finally { client.dispose(); }
});

test('disposing before fallback starts prevents any solver invocation', async () => {
  let calls = 0;
  const client = createFishingCatchWorkerClient({
    workerFactory: () => { throw new Error('unsupported'); },
    fallback: async () => { calls += 1; return result('unused'); },
  });
  const solved = client.solve(input('first'));
  const rejected = assert.rejects(solved, cancelled);
  client.dispose();
  await rejected;
  await tick();
  assert.equal(calls, 0);
});

test('posting geometry does not transfer or detach caller-owned buffers', async () => {
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  const positions = new Float32Array([1, 2, 3]);
  try {
    const solved = client.solve({name: 'geometry', positions});
    assert.equal(workers[0].messages[0].length, 1, 'no transfer list is supplied');
    assert.equal(positions.byteLength, 12);
    workers[0].reply(result('geometry'));
    await solved;
    assert.deepEqual([...positions], [1, 2, 3]);
  } finally { client.dispose(); }
});

test('default factory creates a module Worker from the solver worker URL', async () => {
  const oldWorker = globalThis.Worker;
  const constructed = [];
  globalThis.Worker = class extends MockWorker {
    constructor(url, options) { super(); constructed.push({worker: this, url, options}); }
  };
  const client = createFishingCatchWorkerClient({fallback: async value => value});
  try {
    const solved = client.solve(input('default'));
    assert.equal(constructed.length, 1);
    assert.match(constructed[0].url.href, /\/lib\/fishing-catch\.worker\.ts$/);
    assert.deepEqual(constructed[0].options, {type: 'module'});
    constructed[0].worker.reply(result('default'));
    assert.deepEqual(await solved, result('default'));
  } finally {
    client.dispose();
    if (oldWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = oldWorker;
  }
});

test('a Worker that exceeds its visible running budget is retired and recovered through fallback', async context => {
  const {advance} = visibleClock(context);
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const solved = client.solve(input('stalled'));
    void solved.catch(() => {});
    advance(44999);
    assert.equal(workers[0].terminated, false);
    advance(1);
    assert.equal(workers[0].terminated, true);
    advance(1);
    assert.deepEqual(await solved, result('fallback:stalled'));
  } finally { client.dispose(); }
});

test('hidden time is excluded from Worker timeouts without resetting the consumed visible budget', async context => {
  const {document, advance} = visibleClock(context);
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const solved = client.solve(input('background'));
    void solved.catch(() => {});
    advance(10000);
    document.setHidden(true);
    advance(180000);
    assert.equal(workers[0].terminated, false);
    document.setHidden(false);
    advance(34999);
    assert.equal(workers[0].terminated, false);
    advance(1);
    assert.equal(workers[0].terminated, true);
    advance(1);
    assert.deepEqual(await solved, result('fallback:background'));
  } finally { client.dispose(); }
});

test('a nonresponsive fallback rejects with TimeoutError and receives an aborted signal', async context => {
  const {advance} = visibleClock(context);
  let fallbackSignal;
  let release;
  const client = createFishingCatchWorkerClient({
    workerFactory: () => { throw new Error('unsupported'); },
    fallback: (_input, signal) => {
      fallbackSignal = signal;
      return new Promise(resolve => { release = resolve; });
    },
  });
  try {
    const solved = client.solve(input('stalled'));
    let timedOut = false;
    const rejected = assert.rejects(solved, error => {
      timedOut = error?.name === 'TimeoutError';
      return timedOut;
    });
    void rejected.catch(() => {});
    advance(1);
    advance(45000);
    await Promise.resolve();
    assert.equal(fallbackSignal.aborted, true);
    await rejected;
    assert.equal(timedOut, true);
    release(result('too late'));
    await Promise.resolve();
  } finally { client.dispose(); }
});

test('a request started in a hidden document receives its full visible timeout budget', async context => {
  const {document, advance} = visibleClock(context);
  document.setHidden(true);
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const solved = client.solve(input('initially hidden'));
    void solved.catch(() => {});
    advance(180000);
    assert.equal(workers[0].terminated, false);
    document.setHidden(false);
    advance(44999);
    assert.equal(workers[0].terminated, false);
    workers[0].reply(result('ready'));
    assert.deepEqual(await solved, result('ready'));
  } finally { client.dispose(); }
});

test('completed requests remove their deadlines before a worker is reused', async context => {
  const {advance} = visibleClock(context);
  const {workers, options} = fixture();
  const client = createFishingCatchWorkerClient(options);
  try {
    const first = client.solve(input('first'));
    advance(10000);
    workers[0].reply(result('first'));
    await first;
    const second = client.solve(input('second'));
    void second.catch(() => {});
    advance(35000);
    assert.equal(workers[0].terminated, false, 'the first request deadline cannot retire the second request');
    workers[0].reply(result('second'));
    assert.deepEqual(await second, result('second'));
    advance(10000);
    assert.equal(workers[0].terminated, false, 'a completed request leaves no delayed retirement');
  } finally { client.dispose(); }
});
