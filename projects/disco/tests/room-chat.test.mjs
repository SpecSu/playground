import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { createRoomService, validateCommand } = await import('../lib/room-server.ts');
const { RoomClient } = await import('../lib/room-client.ts');

// Real service/client behavior through the production atomic storage contract.
class MemoryStore {
  rooms = new Map();
  visits = new Map();
  commits = 0;
  conflicts = 0;
  async ensureRoom(id, initial) { if (!this.rooms.has(id)) this.rooms.set(id, structuredClone(initial)); }
  async readRoom(id) { return structuredClone(this.rooms.get(id)); }
  async ensureVisit(roomId, actorId, initial) {
    const key = `${roomId}:${actorId}`;
    if (!this.visits.has(key)) this.visits.set(key, structuredClone(initial));
  }
  async readVisit(roomId, actorId) { return structuredClone(this.visits.get(`${roomId}:${actorId}`)); }
  async readState(roomId, actorId) { return { room: await this.readRoom(roomId), visit: await this.readVisit(roomId, actorId) }; }
  async commit(roomId, revision, next, actorId, sequence, visit) {
    await Promise.resolve();
    const key = `${roomId}:${actorId}`;
    if (this.rooms.get(roomId).revision !== revision || (visit && this.visits.get(key).lastSequence !== sequence)) {
      this.conflicts++;
      return false;
    }
    this.rooms.set(roomId, structuredClone(next));
    if (visit) this.visits.set(key, structuredClone(visit));
    this.commits++;
    return true;
  }
}

const EPOCH = 1_800_000_000_000;
const command = (sequence, input, requestId = `chat-request-${sequence}`) => ({ roomId: 'main', requestId, sequence, ...input });
const join = (sequence = 1) => command(sequence, { type: 'join', name: 'Guest', preset: 'cat' });
const chat = (text = 'Hello', sequence = 2, requestId) => command(sequence, { type: 'chat', text }, requestId);
const find = (snapshot, actorId) => snapshot.participants.find(person => person.id === actorId);
function setup() {
  const store = new MemoryStore();
  let now = EPOCH;
  const service = createRoomService(store, { now: () => now });
  return { store, service, now: () => now, advance: ms => { now += ms; } };
}

test('chat validation normalizes pasted whitespace and counts Unicode code points, preserving literal markup', () => {
  assert.equal(validateCommand(chat('  hello\t\r\n世界\u00a0  👋  ')).text, 'hello 世界 👋');
  assert.equal(validateCommand(chat('👋'.repeat(80))).text, '👋'.repeat(80));
  assert.equal(validateCommand(chat('<script>alert("hello")</script> & **hi**')).text, '<script>alert("hello")</script> & **hi**');
  for (const text of ['', ' \t\r\n\u3000 ', 'a'.repeat(81), '👋'.repeat(81), 'hi\u0000there', 'hi\u000bthere', '\u007f', '\u0085', 'hi\u202ethere', 'hi\u200bthere', '\ufeffhello', '\ud800', null, 5, ['hello']]) {
    assert.throws(() => validateCommand(chat(text)), { code: 'INVALID_COMMAND' }, JSON.stringify(text));
  }
});

test('chat cannot supply actor ownership, timestamps, expiry or other extra fields', () => {
  for (const extra of [{ actorId: 'other' }, { sentAt: EPOCH }, { expiresAt: EPOCH + 100000 }, { chat: {} }, { html: '<b>hello</b>' }]) {
    assert.throws(() => validateCommand({ ...chat(), ...extra }), { code: 'INVALID_COMMAND' });
  }
});

test('chat supports joined emoji and script joiners while rejecting bidi and invisible controls', () => {
  for (const text of ['👩‍🚀', '👨‍👩‍👧‍👦', 'می\u200cخواهم', 'क्\u200dष']) {
    assert.equal(validateCommand(chat(text)).text, text);
  }
  for (const control of ['\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069', '\u200b', '\u2060', '\ufeff']) {
    assert.throws(() => validateCommand(chat(`hello${control}world`)), { code: 'INVALID_COMMAND' });
  }
  for (const text of ['\u200c\u200d', ' \u200d ']) assert.throws(() => validateCommand(chat(text)), { code: 'INVALID_COMMAND' });
});

test('only currently seated participants can chat, excluding visitors, spectators and expired seats', async () => {
  const { service, advance } = setup();
  await assert.rejects(service.command('visitor', chat('hi', 1)), { code: 'NOT_PARTICIPANT' });
  for (let i = 0; i < 11; i++) await service.command(`actor-${i}`, join());
  await assert.rejects(service.command('actor-10', chat()), { code: 'NOT_PARTICIPANT' });
  advance(60_000);
  await assert.rejects(service.command('actor-0', chat()), { code: 'NOT_PARTICIPANT' });
});

test('chat belongs to the server identity, refreshes presence and is shared with every reader', async () => {
  const { service, advance } = setup();
  await service.command('speaker', join());
  await service.command('other', join());
  advance(55_000);
  const spoken = await service.command('speaker', chat('  Hello\nworld  '));
  const expected = { text: 'Hello world', sentAt: EPOCH + 55_000, expiresAt: EPOCH + 63_000 };
  assert.deepEqual(find(spoken, 'speaker').chat, expected);
  assert.equal(find(spoken, 'speaker').lastSeenAt, expected.sentAt);
  assert.equal(find(spoken, 'other').chat, undefined);
  advance(5000);
  const observer = await service.snapshot('main', 'unjoined-viewer');
  assert.equal(observer.self.role, 'visitor');
  assert.deepEqual(find(observer, 'speaker').chat, expected);
  assert.ok(find(observer, 'speaker'), 'accepted chat keeps the seat alive');
  assert.equal(observer.events.some(event => event.value === expected.text), false, 'ephemeral messages do not enter persistent event history');
});

test('chat expires exactly after eight seconds without snapshot writes, revision bumps or stored mutation', async () => {
  const { service, store, advance } = setup();
  await service.command('speaker', join());
  const spoken = await service.command('speaker', chat());
  const commits = store.commits;
  advance(7999);
  assert.deepEqual(find(await service.snapshot('main', 'observer'), 'speaker').chat, find(spoken, 'speaker').chat);
  advance(1);
  for (const actor of ['speaker', 'observer', 'late-reader']) {
    const expired = await service.snapshot('main', actor);
    assert.equal(find(expired, 'speaker').chat, undefined);
    assert.equal(expired.revision, spoken.revision);
    assert.deepEqual(expired.events, spoken.events);
  }
  assert.equal(store.commits, commits);
  assert.deepEqual(store.rooms.get('main').participants[0].chat, find(spoken, 'speaker').chat, 'projection never mutates persisted room data');
});

test('chat receipts do not retain plaintext, and normal room writes discard expired stored messages', async () => {
  const { service, store, advance } = setup();
  await service.command('speaker', join());
  await service.command('speaker', chat('Ephemeral personal message'));
  assert.doesNotMatch(JSON.stringify(store.visits.get('main:speaker').receipts), /Ephemeral personal message/);
  advance(8000);
  await service.command('speaker', command(3, { type: 'heartbeat' }));
  assert.equal(store.rooms.get('main').participants[0].chat, undefined);
});

test('a snapshot that already needs a seat-expiry write also discards expired stored chat', async () => {
  const { service, store, advance } = setup();
  await service.command('speaker', join());
  await service.command('idle', join());
  advance(55_000);
  await service.command('speaker', chat());
  const commits = store.commits;
  advance(9000);
  const snapshot = await service.snapshot('main', 'observer');
  assert.equal(find(snapshot, 'idle'), undefined);
  assert.equal(find(snapshot, 'speaker').chat, undefined);
  assert.equal(store.rooms.get('main').participants[0].chat, undefined);
  assert.equal(store.commits, commits + 1, 'chat cleanup shares the necessary seat-expiry write');
});

test('each participant has an independent 1500ms chat cooldown and legacy visits work without lastChatAt', async () => {
  const { service, store, advance } = setup();
  await service.command('alice', join());
  await service.command('bob', join());
  delete store.visits.get('main:alice').lastChatAt;
  await service.command('alice', chat('first'));
  await service.command('bob', chat('independent'));
  const commits = store.commits;
  advance(1499);
  await assert.rejects(service.command('alice', chat('too soon', 3)), { code: 'RATE_LIMITED', retryAfterMs: 1 });
  assert.equal(store.commits, commits);
  assert.equal(store.visits.get('main:alice').lastSequence, 2);
  advance(1);
  const replaced = await service.command('alice', chat('next', 3));
  assert.equal(find(replaced, 'alice').chat.text, 'next');
  assert.equal(find(replaced, 'alice').chat.expiresAt, EPOCH + 9500);
  assert.equal(store.visits.get('main:alice').lastChatAt, EPOCH + 1500);
});

test('idempotent chat replay never extends expiry or replays an older message over a newer one', async () => {
  const { service, store, advance } = setup();
  await service.command('speaker', join());
  const first = await service.command('speaker', chat('first'));
  advance(1000);
  const duplicate = await service.command('speaker', chat('first'));
  assert.deepEqual(find(duplicate, 'speaker').chat, find(first, 'speaker').chat);
  assert.equal(duplicate.revision, first.revision);
  await assert.rejects(service.command('speaker', chat('changed')), { code: 'REQUEST_CONFLICT' });
  advance(500);
  const latest = await service.command('speaker', chat('second', 3));
  const commits = store.commits;
  assert.deepEqual(find(await service.command('speaker', chat('first')), 'speaker').chat, find(latest, 'speaker').chat);
  advance(8000);
  const expired = await service.command('speaker', chat('second', 3));
  assert.equal(find(expired, 'speaker').chat, undefined);
  assert.equal(store.commits, commits);
});

test('leave and rejoin discard chat, and replay cannot resurrect the previous membership message', async () => {
  const { service, advance } = setup();
  await service.command('speaker', join());
  await service.command('speaker', chat());
  await service.command('speaker', command(3, { type: 'leave' }));
  advance(1000);
  const rejoined = await service.command('speaker', join(4));
  assert.equal(find(rejoined, 'speaker').chat, undefined);
  assert.equal(find(await service.command('speaker', chat()), 'speaker').chat, undefined);
  advance(60_000);
  const afterTimeout = await service.command('speaker', join(5));
  assert.equal(find(afterTimeout, 'speaker').chat, undefined);
});

test('simultaneous speakers survive compare-and-swap conflicts without overwriting each other', async () => {
  const { service, store } = setup();
  await service.command('alice', join());
  await service.command('bob', join());
  // Hold the first two writes at the actual CAS boundary regardless of hash timing.
  const commit = store.commit.bind(store);
  let arrivals = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  store.commit = async (...args) => {
    if (++arrivals <= 2) {
      if (arrivals === 2) release();
      await gate;
    }
    return commit(...args);
  };
  await Promise.all([service.command('alice', chat('Alice')), service.command('bob', chat('Bob'))]);
  const shared = await service.snapshot('main', 'observer');
  assert.equal(find(shared, 'alice').chat.text, 'Alice');
  assert.equal(find(shared, 'bob').chat.text, 'Bob');
  assert.ok(store.conflicts > 0);
});

test('independent RoomClients share chat, and uncertain transport retry retains the original expiry', async t => {
  const { service, advance, now, store } = setup();
  const posts = [];
  let loseFirstChatResponse = true;
  const clientFor = actor => new RoomClient('main', {
    now,
    fetcher: async (_url, init) => {
      const body = init.body ? JSON.parse(init.body) : undefined;
      const result = body ? await service.command(actor, body) : await service.snapshot('main', actor);
      if (body?.type === 'chat') {
        posts.push(body);
        if (loseFirstChatResponse) {
          loseFirstChatResponse = false;
          advance(2000);
          return new Response(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Retry' } }), { status: 503 });
        }
      }
      return new Response(JSON.stringify(result), { status: 200 });
    },
  });
  const alice = clientFor('alice');
  const bob = clientFor('bob');
  t.after(() => { alice.stop(); bob.stop(); });
  await alice.command({ type: 'join', name: 'Alice', preset: 'cat' });
  await bob.command({ type: 'join', name: 'Bob', preset: 'frog' });
  const pending = alice.command({ type: 'chat', text: '<b>literal</b>' });
  assert.equal(find(alice.getState().snapshot, 'alice').chat, undefined, 'no optimistic local bubble');
  const confirmed = await pending;
  await bob.refresh();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], posts[1]);
  assert.deepEqual(Object.keys(posts[0]).sort(), ['requestId', 'roomId', 'sequence', 'text', 'type']);
  assert.deepEqual(find(bob.getState().snapshot, 'alice').chat, find(confirmed, 'alice').chat);
  assert.deepEqual(find(confirmed, 'alice').chat, { text: '<b>literal</b>', sentAt: EPOCH, expiresAt: EPOCH + 8000 });
  assert.equal(store.commits, 3, 'two joins and exactly one accepted chat');
  advance(6000);
  await bob.refresh();
  assert.equal(find(bob.getState().snapshot, 'alice').chat, undefined, 'same-revision expiry snapshot is accepted');
});

test('shared chat helpers project the authoritative window without mutating legacy or expired participants', async () => {
  const { CHAT_MAX_CHARACTERS, CHAT_DURATION_MS, CHAT_COOLDOWN_MS, normalizeChatText, chatAt } = await import('../lib/room-chat.ts');
  assert.equal(CHAT_MAX_CHARACTERS, 80);
  assert.equal(CHAT_DURATION_MS, 8000);
  assert.equal(CHAT_COOLDOWN_MS, 1500);
  assert.equal(normalizeChatText('\t One\u2003\u2028\u2029two\n'), 'One two');
  assert.equal(normalizeChatText('hello\u202e'), 'hello\u202e', 'unsafe controls survive normalization so validation can reject them');
  const participant = { chat: { text: 'hello', sentAt: EPOCH, expiresAt: EPOCH + 8000 } };
  assert.equal(chatAt(participant, EPOCH - 1), null);
  assert.equal(chatAt(participant, EPOCH), participant.chat);
  assert.equal(chatAt(participant, EPOCH + 7999), participant.chat);
  assert.equal(chatAt(participant, EPOCH + 8000), null);
  assert.equal(chatAt(participant, Number.NaN), null);
  assert.equal(chatAt({}, EPOCH), null);
  assert.equal(chatAt(null, EPOCH), null);
  assert.equal(chatAt({ chat: { ...participant.chat, expiresAt: Infinity } }, EPOCH), null);
  assert.equal(participant.chat.text, 'hello');
});
