import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mergeResponseCookies } from './room-cookie-jar.mjs';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8787';
const local = !process.env.QA_BASE_URL;
const room = 'soundcheck';
const clients = [];
const presets = ['human-jiji', 'human-subeike', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'monster-blob', 'monster-tower', 'monster-star'];
const nextId = (snapshot, direction) => snapshot.playlistOrder[(snapshot.playlistOrder.indexOf(snapshot.track.id) + direction + snapshot.playlistOrder.length) % snapshot.playlistOrder.length];
let server;
if (local) {
  server = spawn(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--port', '8787', '--inspector-port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XDG_CONFIG_HOME: `${process.cwd()}/.sites-runtime/config`, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', WRANGLER_HIDE_BANNER: 'true', WRANGLER_REGISTRY_PATH: `${process.cwd()}/.wrangler/dev-registry`, MINIFLARE_REGISTRY_PATH: `${process.cwd()}/.wrangler/registry` } });
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => process.stderr.write(chunk));
}
async function request(client, command, overrides = {}) {
  const before = Date.now();
  const response = await fetch(`${base}/api/room?room=${room}`, {
    method: command ? 'POST' : 'GET',
    headers: { ...(client.cookie ? { Cookie: client.cookie } : {}), ...(command ? { 'Content-Type': 'application/json', Origin: base } : {}), ...overrides },
    body: command ? JSON.stringify({ roomId: room, ...command }) : undefined,
  });
  client.cookie = mergeResponseCookies(client.cookie, response.headers.getSetCookie());
  const json = await response.json();
  if (json.self) client.sequence = Math.max(client.sequence || 0, json.self.lastSequence);
  return { response, json, latency: Date.now() - before };
}
async function command(client, body) {
  const sequence = (client.sequence || 0) + 1;
  const result = await request(client, { requestId: randomUUID(), sequence, ...body });
  if (result.response.ok) client.sequence = sequence;
  return result;
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const r = await fetch(base); if (r.status < 500) { ready = true; break; } } catch {}
    await sleep(500);
  }
  assert(ready, 'HTTP server became reachable');
  for (let i = 0; i < 12; i++) {
    const client = { sequence: 0 };
    const first = await request(client);
    assert.equal(first.response.status, 200, JSON.stringify(first.json));
    assert(client.cookie, 'server issued guest capability cookie');
    assert.match(first.response.headers.get('cache-control') || '', /no-store/);
    assert.equal(first.json.participants.length, 0);
    assert.ok(Array.isArray(first.json.playlistOrder) && first.json.playlistOrder.length >= 2);
    assert.equal(new Set(first.json.playlistOrder).size, first.json.playlistOrder.length);
    clients.push(client);
  }
  const beforeVisitorControl = await request(clients[0]);
  const visitorControl = await command(clients[0], { type: 'track-step', direction: 1 });
  assert.equal(visitorControl.response.status, 200, JSON.stringify(visitorControl.json));
  assert.equal(visitorControl.json.self.role, 'visitor');
  assert.equal(visitorControl.json.participants.length, 0);
  assert.equal(visitorControl.json.track.id, nextId(beforeVisitorControl.json, 1));
  const visitorObserver = await request(clients[1]);
  assert.deepEqual(visitorObserver.json.track, visitorControl.json.track);
  assert.deepEqual(visitorObserver.json.playlistOrder, visitorControl.json.playlistOrder);
  await sleep(1100);
  const joined = await Promise.all(clients.map((client, i) => command(client, { type: 'join', name: `QA ${i + 1}`, preset: presets[i % presets.length] })));
  for (const result of joined) assert.equal(result.response.status, 200, JSON.stringify(result.json));
  const current = await Promise.all(clients.map(client => request(client)));
  assert.equal(current.filter(result => result.json.self.role === 'participant').length, 10);
  assert.equal(current.filter(result => result.json.self.role === 'spectator').length, 2);
  assert(current.every(result => result.json.participants.length === 10));
  assert.equal(new Set(current[0].json.participants.map(person => person.slot)).size, 10);
  const activeIndex = current.findIndex(result => result.json.self.role === 'participant');
  const spareIndex = current.findIndex(result => result.json.self.role === 'spectator');
  const active = clients[activeIndex];
  const changed = await command(active, { type: 'track', trackId: 'arabic-nights' });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.json));
  const observed = await request(clients[spareIndex]);
  assert.equal(observed.json.track.id, 'arabic-nights');
  assert.equal(observed.json.track.startedAt, changed.json.track.startedAt);
  assert.equal(observed.json.track.durationMs, changed.json.track.durationMs);
  assert.deepEqual(observed.json.playlistOrder, changed.json.playlistOrder);
  await sleep(1100);
  const spectatorNext = await command(clients[spareIndex], { type: 'track-step', direction: 1 });
  assert.equal(spectatorNext.response.status, 200, JSON.stringify(spectatorNext.json));
  assert.equal(spectatorNext.json.track.id, nextId(changed.json, 1));
  assert.equal(spectatorNext.json.self.role, 'spectator');
  assert.equal(spectatorNext.json.participants.length, 10);
  assert.deepEqual((await request(active)).json.track, spectatorNext.json.track);
  await sleep(1100);
  const spectatorPrevious = await command(clients[spareIndex], { type: 'track-step', direction: -1 });
  assert.equal(spectatorPrevious.response.status, 200, JSON.stringify(spectatorPrevious.json));
  assert.equal(spectatorPrevious.json.track.id, changed.json.track.id);
  await sleep(1100);
  const lightMode = spectatorPrevious.json.lightMode === 'ice' ? 'sunset' : 'ice';
  const spectatorLights = await command(clients[spareIndex], { type: 'lights', lightMode });
  assert.equal(spectatorLights.response.status, 200, JSON.stringify(spectatorLights.json));
  assert.equal(spectatorLights.json.self.role, 'spectator');
  assert.equal(spectatorLights.json.participants.length, 10);
  assert.equal((await request(active)).json.lightMode, lightMode);
  const deniedEmote = await command(clients[spareIndex], { type: 'action', action: 'wave' });
  assert.equal(deniedEmote.response.status, 403);
  assert.equal(deniedEmote.json.error.code, 'NOT_PARTICIPANT');
  const spoof = await request(clients[spareIndex], { type: 'action', action: 'spin', requestId: randomUUID(), sequence: clients[spareIndex].sequence + 1, actorId: changed.json.self.id });
  assert(!spoof.response.ok, 'spectator cannot spoof another actor');
  const csrf = await request(active, { type: 'action', action: 'wave', requestId: randomUUID(), sequence: active.sequence + 1 }, { Origin: 'https://evil.example' });
  assert.equal(csrf.response.status, 403);
  const spectatorCsrf = await request(clients[spareIndex], { type: 'lights', lightMode: 'neon', requestId: randomUUID(), sequence: clients[spareIndex].sequence + 1 }, { Origin: 'https://evil.example' });
  assert.equal(spectatorCsrf.response.status, 403);
  // Prove the rejected writes left shared state untouched before testing the
  // next mutation. This read also crosses Wrangler's local proxy boundary
  // after early body rejection; unlike POSTs, its GET recovery is safe.
  const afterRejectedRequests = await request(active);
  assert.equal(afterRejectedRequests.response.status, 200, JSON.stringify(afterRejectedRequests.json));
  assert.equal(afterRejectedRequests.json.revision, spectatorLights.json.revision);
  assert.deepEqual(afterRejectedRequests.json.track, spectatorLights.json.track);
  assert.equal(afterRejectedRequests.json.lightMode, spectatorLights.json.lightMode);
  const leave = await command(active, { type: 'leave' });
  assert.equal(leave.response.status, 200, JSON.stringify(leave.json));
  await sleep(1100);
  const entered = await command(clients[spareIndex], { type: 'join', name: 'QA replacement', preset: 'monster-star' });
  assert.equal(entered.response.status, 200, JSON.stringify(entered.json));
  assert.equal(entered.json.self.role, 'participant');
  assert.equal(entered.json.participants.length, 10);
  console.log(JSON.stringify({ passed: true, room, simultaneousClients: 12, seats: 10, overflow: 2, visitorControlsWithoutSeat: true, spectatorControlsAtCapacity: true, sharedShuffledNavigation: true, sharedTrackAnchor: true, csrfRejected: true, actorSpoofRejected: true, spectatorEmoteRejected: true, seatReuse: true, joinLatencyMs: joined.map(x => x.latency), snapshotLatencyMs: current.map(x => x.latency) }, null, 2));
} finally {
  await Promise.allSettled(clients.map(client => command(client, { type: 'leave' })));
  server?.kill('SIGTERM');
}
