import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

async function actionState() {
  const url = new URL('../lib/room-action-state.ts', import.meta.url);
  assert.ok(existsSync(url), 'Personal actions need one authoritative pause transition shared with previews');
  return import(url.href);
}
const participant = { id: 'one', name: 'One', preset: 'cat' as const, slot: 2, joinedAt: 1000, lastSeenAt: 1000, action: 'dance' as const, actionAt: 1000 };

test('legacy participants continue their route until an explicit personal action starts', async () => {
  const { personalRouteTime, beginPersonalAction, PERSONAL_ACTION_MS } = await actionState();
  assert.equal(PERSONAL_ACTION_MS, 6000);
  assert.equal(personalRouteTime(participant, 9000), 9000);
  const held = beginPersonalAction(Object.freeze(participant), 'wave', 9000);
  assert.equal(held.action, 'wave');
  assert.equal(held.actionAt, 9000);
  assert.equal(held.actionUntil, 15000);
  assert.equal(held.routePauseMs, 0);
  assert.equal(held.id, participant.id);
  assert.equal(held.slot, participant.slot);
  assert.equal(participant.action, 'dance', 'the preview helper must not mutate the canonical participant');
  assert.equal(personalRouteTime(held, 9000), 9000);
  assert.equal(personalRouteTime(held, 11000), 9000);
  assert.equal(personalRouteTime(held, 15000), 9000);
  assert.equal(personalRouteTime(held, 17000), 11000);
});

test('retriggering while frozen accumulates elapsed pause and never moves the route root', async () => {
  const { personalRouteTime, beginPersonalAction } = await actionState();
  const first = beginPersonalAction(participant, 'bounce', 9000);
  const second = beginPersonalAction(first, 'bounce', 10500);
  assert.equal(second.routePauseMs, 1500);
  assert.equal(second.actionAt, 10500);
  assert.equal(second.actionUntil, 16500);
  assert.equal(personalRouteTime(second, 10500), personalRouteTime(first, 10500));
  assert.equal(personalRouteTime(second, 16500), 9000);
  assert.equal(personalRouteTime(second, 17500), 10000);
  const third = beginPersonalAction(second, 'spin', 18500);
  assert.equal(third.routePauseMs, 7500);
  assert.equal(personalRouteTime(third, 18500), personalRouteTime(second, 18500));
});

test('a late listener derives the same effective route from authoritative pause fields alone', async () => {
  const { personalRouteTime, beginPersonalAction } = await actionState();
  const first = beginPersonalAction(participant, 'dance', 10_000);
  const second = beginPersonalAction(first, 'wave', 18_000);
  const restored = JSON.parse(JSON.stringify(second));
  for (const now of [18_000, 21_000, 24_000, 39_000]) {
    assert.equal(personalRouteTime(restored, now), personalRouteTime(second, now));
  }
  assert.equal(personalRouteTime({ ...participant, actionUntil: 0, routePauseMs: 0 }, 9000), 9000);
});
