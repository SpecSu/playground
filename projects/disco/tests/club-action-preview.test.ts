import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import type { Participant, RoomSnapshot } from '../lib/room-types.ts';

async function subject() {
  assert.ok(existsSync(new URL('../lib/club-action-preview.ts', import.meta.url)), 'personal actions have a visual-only preview helper');
  return import('../lib/club-action-preview.ts');
}
const person = (id = 'me'): Participant => ({ id, name: id, preset: 'frog', slot: id === 'me' ? 0 : 1, joinedAt: 100, lastSeenAt: 1000, action: 'dance', actionAt: 100 });
const snapshot = (): RoomSnapshot => ({ roomId: 'main', revision: 1, serverNow: 1000, self: { id: 'me', role: 'participant', lastSequence: 1 }, participants: [person(), person('friend')], capacity: 10, track: { id: 'neon-house', startedAt: 100, durationMs: 60000 }, playlistOrder: ['neon-house'], lightMode: 'neon', events: [], totalVisits: 2 });

test('selecting a move immediately projects only the own avatar without mutating authoritative state', async () => {
  const { createOwnActionPreview, projectOwnAction } = await subject();
  const room = snapshot();
  const before = structuredClone(room);
  const preview = createOwnActionPreview(room, 'bounce', 1500, 1);
  assert.ok(preview);
  const projected = projectOwnAction(room.participants, room.self.id, preview);
  assert.equal(projected[0].action, 'bounce');
  assert.equal(projected[0].actionAt, 1500);
  assert.ok(projected[0].actionUntil! > 1500);
  assert.equal(projected[1], room.participants[1], 'another actor is never optimistically changed');
  assert.deepEqual(room, before, 'server state remains authoritative and untouched');
});

test('a stale poll keeps the preview while a newer authoritative action wins', async () => {
  const { createOwnActionPreview, projectOwnAction } = await subject();
  const room = snapshot();
  const preview = createOwnActionPreview(room, 'spin', 1500, 2);
  assert.equal(projectOwnAction([...room.participants], 'me', preview)[0].action, 'spin');
  const updated = [{ ...room.participants[0], action: 'wave' as const, actionAt: 1550 }, room.participants[1]];
  assert.equal(projectOwnAction(updated, 'me', preview), updated);
});

test('preview cannot fabricate membership or transfer across device identity', async () => {
  const { createOwnActionPreview, projectOwnAction } = await subject();
  const room = snapshot();
  const preview = createOwnActionPreview(room, 'wave', 1500, 3);
  assert.equal(createOwnActionPreview({ ...room, self: { ...room.self, role: 'spectator' } }, 'wave', 1500, 4), null);
  assert.equal(createOwnActionPreview({ ...room, participants: [] }, 'wave', 1500, 4), null);
  assert.equal(projectOwnAction(room.participants, 'friend', preview), room.participants);
  const departed = [room.participants[1]];
  assert.equal(projectOwnAction(departed, 'me', preview), departed);
});

test('settling or rejecting one request cannot clear a newer local preview', async () => {
  const { createOwnActionPreview, settleOwnActionPreview, projectOwnAction } = await subject();
  const room = snapshot();
  const first = createOwnActionPreview(room, 'bounce', 1500, 4);
  const latest = createOwnActionPreview(room, 'spin', 1900, 5);
  assert.equal(settleOwnActionPreview(latest, 4), latest);
  assert.equal(settleOwnActionPreview(first, 4), null);
  const rolledBack = projectOwnAction(room.participants, 'me', settleOwnActionPreview(latest, 5));
  assert.equal(rolledBack, room.participants);
  assert.equal(rolledBack[0].action, 'dance');
});

test('preview repeats the same action with a fresh start and keeps completed route pauses', async () => {
  const { createOwnActionPreview } = await subject();
  const room = snapshot();
  room.participants[0] = { ...person(), action: 'bounce', actionAt: 1000, actionUntil: 4000, routePauseMs: 200 };
  const preview = createOwnActionPreview(room, 'bounce', 1800, 6);
  assert.ok(preview);
  assert.equal(preview.participant.actionAt, 1800);
  assert.equal(preview.participant.routePauseMs, 1000);
});

test('group feedback separates server count-in, active choreography, cooldown and expiry', async () => {
  const { groupActionFeedback } = await subject();
  const group = { id: 'group-one', kind: 'wave' as const, startsAt: 5000, endsAt: 19000, beatMs: 500, version: 1 as const, sourceClockBySlot: Array(10).fill(5000) };
  assert.equal(groupActionFeedback(group, 3000).phase, 'countdown');
  assert.equal(groupActionFeedback(group, 3000).personalBlocked, true);
  assert.match(groupActionFeedback(group, 3000).message!, /2/);
  assert.equal(groupActionFeedback(group, 5000).phase, 'active');
  assert.equal(groupActionFeedback(group, 19000).personalBlocked, false);
  assert.equal(groupActionFeedback(group, 19000).groupBlocked, true);
  assert.equal(groupActionFeedback(group, 24000).phase, 'idle');
  assert.equal(groupActionFeedback(group, 24000).groupBlocked, false);
  assert.equal(groupActionFeedback(null, 3000).message, null);
});

test('a delayed command renders immediately, survives a stale poll and reconciles the real client response', async () => {
  const { RoomClient } = await import('../lib/room-client.ts');
  const { createOwnActionPreview, projectOwnAction, settleOwnActionPreview } = await subject();
  const room = snapshot();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const response = (data: unknown) => new Response(JSON.stringify(data));
  const client = new RoomClient('main', { now: () => 1500, fetcher: async (_url, init) => {
    if (init?.method === 'GET') return response(room);
    await gate;
    return response({ ...room, revision: 2, serverNow: 1550, self: { ...room.self, lastSequence: 2 }, participants: [{ ...room.participants[0], action: 'bounce', actionAt: 1550, actionUntil: 7550, routePauseMs: 0 }, room.participants[1]] });
  } });
  await client.refresh();
  let preview = createOwnActionPreview(client.getState().snapshot, 'bounce', 1500, 7);
  const pending = client.command({ type: 'action', action: 'bounce' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.getState().pendingCount, 1);
  assert.equal(client.getState().snapshot!.participants[0].action, 'dance');
  assert.equal(projectOwnAction(client.getState().snapshot!.participants, 'me', preview)[0].action, 'bounce');
  await client.refresh();
  assert.equal(projectOwnAction(client.getState().snapshot!.participants, 'me', preview)[0].actionAt, 1500);
  release();
  await pending;
  preview = settleOwnActionPreview(preview, 7);
  assert.equal(projectOwnAction(client.getState().snapshot!.participants, 'me', preview)[0].actionAt, 1550);
  assert.equal(preview, null);
  client.stop();
});

test('a rejected move rolls back to the included authoritative snapshot and retains its retry delay', async () => {
  const { RoomClient, RoomRequestError } = await import('../lib/room-client.ts');
  const { createOwnActionPreview, projectOwnAction, settleOwnActionPreview } = await subject();
  const room = snapshot();
  const latest = { ...room, revision: 2, serverNow: 1600, participants: [{ ...room.participants[0], action: 'wave' as const, actionAt: 1580 }, room.participants[1]] };
  const client = new RoomClient('main', { fetcher: async (_url, init) => init?.method === 'GET' ? new Response(JSON.stringify(room)) : new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Wait', retryAfterMs: 320 }, snapshot: latest }), { status: 429 }) });
  await client.refresh();
  let preview = createOwnActionPreview(client.getState().snapshot, 'spin', 1500, 8);
  await assert.rejects(client.command({ type: 'action', action: 'spin' }), error => {
    assert.ok(error instanceof RoomRequestError);
    assert.equal(error.retryAfterMs, 320);
    return true;
  });
  preview = settleOwnActionPreview(preview, 8);
  assert.equal(projectOwnAction(client.getState().snapshot!.participants, 'me', preview)[0].action, 'wave');
  assert.equal(client.getState().pendingCount, 0);
  client.stop();
});

test('version-two group feedback names all five routines and preserves their authoritative timing', async () => {
  const { groupActionFeedback } = await subject();
  const routines = [
    ['train', '开小火车', 28000],
    ['wave', '大浪冲入', 10000],
    ['unison', '集合齐跳', 18000],
    ['battle', '左右对跳', 26000],
    ['grid', '跳格接力', 22000],
  ] as const;
  for (const [kind, label, duration] of routines) {
    const group = { id: `v2-${kind}`, kind, startsAt: 5000, endsAt: 5000 + duration, beatMs: 500, version: 2 as const, sourceClockBySlot: Array(10).fill(5000) };
    assert.equal(groupActionFeedback(group, 2000).message, `${label} · 3 秒后一起开始`);
    assert.equal(groupActionFeedback(group, 5000).message, `${label}进行中 · 还有 ${duration / 1000} 秒`);
    assert.equal(groupActionFeedback(group, 5000).personalBlocked, true);
    assert.equal(groupActionFeedback(group, group.endsAt).personalBlocked, false);
    assert.equal(groupActionFeedback(group, group.endsAt).groupBlocked, true);
    assert.equal(groupActionFeedback(group, group.endsAt + 5000).phase, 'idle');
  }
});


test('wave feedback follows the saved event clocks instead of recalculating its shortened duration', async () => {
  const { groupActionFeedback } = await subject();
  const { GROUP_WAVE_LEAD_MS, GROUP_ACTION_LEAD_MS, GROUP_ACTION_DURATIONS_MS } = await import('../lib/room-types.ts');
  assert.equal(GROUP_WAVE_LEAD_MS, 350);
  assert.equal(GROUP_ACTION_LEAD_MS, 3000);
  assert.equal(GROUP_ACTION_DURATIONS_MS.wave, 10000);
  const savedWave = { id: 'saved-v2-wave', kind: 'wave' as const, startsAt: 5000, endsAt: 29000, beatMs: 500, version: 2 as const, sourceClockBySlot: Array(10).fill(5000) };
  assert.equal(groupActionFeedback(savedWave, 4650).phase, 'countdown');
  assert.equal(groupActionFeedback(savedWave, 5000).message, '大浪冲入进行中 · 还有 24 秒');
  assert.equal(groupActionFeedback(savedWave, 15000).phase, 'active');
  assert.equal(groupActionFeedback(savedWave, 28999).personalBlocked, true);
  assert.equal(groupActionFeedback(savedWave, 29000).personalBlocked, false);
  assert.equal(groupActionFeedback(savedWave, 33999).groupBlocked, true);
  assert.equal(groupActionFeedback(savedWave, 34000).phase, 'idle');
});

test('active version-one events retain wording that matches their legacy choreography', async () => {
  const { groupActionFeedback } = await subject();
  const group = { id: 'legacy-wave', kind: 'wave' as const, startsAt: 5000, endsAt: 19000, beatMs: 500, version: 1 as const, sourceClockBySlot: Array(10).fill(5000) };
  assert.equal(groupActionFeedback(group, 6000).message, '人浪进行中 · 还有 13 秒');
  assert.equal(groupActionFeedback({ ...group, kind: 'unison' }, 6000).message, '齐舞进行中 · 还有 13 秒');
});

test('a rejoined membership never inherits a previous membership preview with matching actor and base action time', async () => {
  const { createOwnActionPreview, projectOwnAction } = await subject();
  const room = snapshot();
  const preview = createOwnActionPreview(room, 'punch', 1500, 9);
  const rejoined = [{ ...room.participants[0], joinedAt: 2000 }, room.participants[1]];
  assert.equal(projectOwnAction(rejoined, 'me', preview), rejoined);
  assert.equal(projectOwnAction(rejoined, 'me', preview)[0].action, 'dance');
});
