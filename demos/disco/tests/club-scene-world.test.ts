import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import * as THREE from 'three';
import { makeClubWorld, type SceneAvatarAdapter, type SceneAvatarFactory } from '../lib/club-scene-world.ts';

function fixtureFactory(): { createAvatar: SceneAvatarFactory; updates: number[]; disposed: () => number } {
  let disposalCount = 0;
  const updates: number[] = [];
  return {
    updates,
    disposed: () => disposalCount,
    createAvatar: (_preset, _id, options) => {
      const root = new THREE.Group();
      const joint = new THREE.Bone();
      root.add(joint);
      let disposed = false;
      const avatar: SceneAvatarAdapter = {
        root, height: options?.mode === 'dj' ? 1.8 : 2.1, labelHeight: 2.25, footprintRadius: 0.65,
        loaded: true, ready: Promise.resolve(),
        update(beat) { joint.rotation.x = Math.sin(beat); updates.push(beat); },
        dispose() { if (!disposed) { disposed = true; disposalCount += 1; } },
      };
      return avatar;
    },
  };
}
function makeTestWorld() { return makeClubWorld({ createAvatar: fixtureFactory().createAvatar }); }
const participant = (slot = 0) => ({ id: `p${slot}`, name: `Dancer ${slot}`, preset: 'frog' as const, slot, joinedAt: 0, lastSeenAt: 0, action: 'dance' as const, actionAt: 0 });

test('initial cast contains five distinct current dancers and the separate Kunkun DJ', () => {
  const club = makeTestWorld();
  assert.equal(club.ambient.length, 5);
  assert.equal(new Set(club.ambient.map(rig => rig.preset)).size, 5, 'ambient cast never pads empty seats with duplicate species');
  assert.equal(new Set(club.ambient.map(rig => rig.slot)).size, 5);
  assert.deepEqual(club.ambient.map(rig => rig.preset).sort(), ['milk-frog', 'niulai', 'banana-cat', 'miaocuijiao', 'sword-shield-dog'].sort());
  assert.ok(club.ambient.every((rig) => rig.ambient && rig.name.length > 0 && !rig.name.includes('NPC')));
  for (const id of ['human-jiji', 'human-subeike', 'human-lx']) assert.ok(club.ambient.every((rig) => rig.preset !== id));
  assert.equal(club.dj.ambient, true);
  assert.equal(club.dj.preset, 'dj-kunkun');
  assert.equal(club.dj.model.root.parent, club.dj.root);
  assert.equal(club.scene.getObjectByName('central-dj-booth')?.position.length(), 0);
  club.dispose();
});

test('participant refresh reuses rigs, owns placement and removes departed dancers', () => {
  const club = makeTestWorld();
  club.syncParticipants([participant()], 'p0');
  const first = club.players.get('p0');
  assert.ok(first);
  assert.equal(first.isOwn, true);
  const position = first.root.position.clone();
  club.syncParticipants([{ ...participant(), action: 'wave' }], 'p0');
  assert.equal(club.players.get('p0'), first);
  club.update(2, 'neon', false, 0.8);
  assert.ok(first.root.position.equals(position));
  club.syncParticipants([], null);
  assert.equal(club.players.size, 0);
  assert.equal(first.root.parent, null);
  club.dispose();
});

test('real participants replace occupied NPC seats and retain all ten real seats', () => {
  const club = makeTestWorld();
  for (let count = 0; count <= 10; count += 1) {
    club.syncParticipants(Array.from({ length: count }, (_, slot) => participant(slot)), count ? 'p0' : null);
    const occupied = new Set([...club.players.values()].map((rig) => rig.slot));
    assert.ok(club.ambient.filter((rig) => rig.root.visible).every((rig) => !occupied.has(rig.slot)));
    assert.equal(club.players.size, count);
    assert.equal(club.players.size + club.ambient.filter((rig) => rig.root.visible).length, count + [1, 2, 3, 4, 5].filter(slot => !occupied.has(slot)).length);
  }
  club.dispose();
});

test('changing a preset replaces only that actor and disposes the previous model', () => {
  const fixture = fixtureFactory();
  const club = makeClubWorld({ createAvatar: fixture.createAvatar });
  club.syncParticipants([participant(), participant(1)], 'p0');
  const original = club.players.get('p0');
  const unchanged = club.players.get('p1');
  club.syncParticipants([{ ...participant(), preset: 'dog' }, participant(1)], 'p0');
  assert.notEqual(club.players.get('p0'), original);
  assert.equal(club.players.get('p1'), unchanged);
  assert.equal(original?.root.parent, null);
  assert.equal(fixture.disposed(), 1);
  club.dispose();
});

test('shared fractional beat and section energy reach every visible skeletal avatar and DJ', () => {
  const fixture = fixtureFactory();
  const club = makeClubWorld({ createAvatar: fixture.createAvatar });
  club.update(42.375, 'sunset', false, 0.9);
  assert.equal(fixture.updates.length, 6);
  assert.ok(fixture.updates.every((beat) => beat === 42.375));
  club.dispose();
});

test('disposal frees every avatar and all visible environment geometries exactly once', () => {
  const fixture = fixtureFactory();
  const club = makeClubWorld({ createAvatar: fixture.createAvatar });
  club.syncParticipants([participant()], 'p0');
  const geometries = new Set<THREE.BufferGeometry>();
  club.scene.traverse((node) => { if ('geometry' in node) geometries.add(node.geometry as THREE.BufferGeometry); });
  let geometryDisposals = 0;
  geometries.forEach((geometry) => geometry.addEventListener('dispose', () => { geometryDisposals += 1; }));
  club.dispose();
  club.dispose();
  assert.equal(fixture.disposed(), 7);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(club.scene.children.length, 0);
});

test('late NPC model completion cannot take back an occupied real seat', async () => {
  const base = fixtureFactory();
  let complete: () => void = () => {};
  let pending: SceneAvatarAdapter | undefined;
  const club = makeClubWorld({ createAvatar: (preset, id, options) => {
    const avatar = base.createAvatar(preset, id, options);
    if (id === 'ambient-luna') {
      avatar.loaded = false;
      avatar.ready = new Promise<void>((resolve) => { complete = resolve; });
      pending = avatar;
    }
    return avatar;
  } });
  club.syncParticipants([participant(5)], 'p5');
  assert.ok(pending);
  pending.loaded = true;
  complete();
  await club.ready;
  assert.equal(club.ambient.find((rig) => rig.slot === 5)?.root.visible, false);
  assert.equal(club.players.get('p5')?.root.visible, true);
  club.dispose();
});

test('avatar asset errors are reported explicitly without substituting a fake stand-in', async () => {
  const base = fixtureFactory();
  const errors: unknown[] = [];
  const failure = new Error('Asset loading failed');
  const club = makeClubWorld({ onAvatarError: (error) => errors.push(error), createAvatar: (preset, id, options) => {
    const avatar = base.createAvatar(preset, id, options);
    if (id === 'ambient-pepper') { avatar.loaded = false; avatar.ready = Promise.reject(failure); }
    return avatar;
  } });
  await assert.rejects(club.ready, /Asset loading failed/);
  assert.equal(club.ambient.find((rig) => rig.id === 'ambient-pepper')?.root.visible, false);
  assert.equal(errors[0], failure);
  club.dispose();
});

test('world uses shared epoch navigation independently of track beat and preserves it on refresh', () => {
  const club = makeTestWorld();
  club.syncParticipants([participant()], 'p0');
  const rig = club.players.get('p0')!;
  club.update(42, 'neon', false, 0.8, 1_791_806_400_000);
  const position = rig.root.position.clone(), yaw = rig.root.rotation.y;
  club.update(0, 'ice', false, 0.2, 1_791_806_400_000);
  assert.ok(rig.root.position.equals(position), 'changing songs does not reset navigation');
  assert.equal(rig.root.rotation.y, yaw);
  assert.ok(rig.motion, 'world exposes canonical navigation state');
  assert.equal(rig.motion.heading, yaw);
  club.syncParticipants([{ ...participant(), name: 'New name', action: 'wave' }], 'p0');
  assert.ok(rig.root.position.equals(position), 'polling/profile/action refresh does not send a walker back to its seat');
  let excursion = 0;
  for (let offset = 1000; offset <= 25_000; offset += 1000) {
    club.update(0, 'ice', false, 0.2, 1_791_806_400_000 + offset);
    excursion = Math.max(excursion, rig.root.position.distanceTo(position));
  }
  assert.ok(excursion > 1, 'the world visibly moves its walkers between dance stops');
  club.dispose();
});

test('new arrivals inherit the currently moving NPC route and late viewers reconstruct the same roots', () => {
  const early = makeTestWorld(), late = makeTestWorld();
  const now = 1_791_806_404_230;
  early.update(13.2, 'neon', false, 1, now);
  const npc = early.ambient.find((rig) => rig.slot === 2)!;
  assert.ok(npc.motion, 'moving NPC exposes the same navigation contract as participants');
  const prior = npc.root.position.clone();
  early.syncParticipants([participant(2)], 'p2');
  late.syncParticipants([participant(2)], null);
  early.update(13.2, 'neon', false, 1, now);
  late.update(13.2, 'neon', false, 1, now);
  const a = early.players.get('p2')!, b = late.players.get('p2')!;
  assert.ok(a.root.position.equals(prior), 'replacement occupies the exact moving slot');
  assert.ok(a.root.position.equals(b.root.position));
  assert.equal(a.root.rotation.y, b.root.rotation.y);
  assert.deepEqual(a.motion, b.motion);
  early.dispose(); late.dispose();
});

test('world passes locomotion to dancers while the resident DJ remains at the mixer', () => {
  const base = fixtureFactory();
  const movement: { id: string; context: unknown }[] = [];
  const club = makeClubWorld({ createAvatar: (preset, id, options) => {
    const avatar = base.createAvatar(preset, id, options);
    avatar.update = (_beat, _action, _reduced, _energy, context) => { movement.push({ id, context }); };
    return avatar;
  } });
  const djPosition = club.dj.root.position.clone();
  club.update(2, 'sunset', false, 1, 1_791_806_400_000);
  assert.equal(movement.filter((item) => item.id !== 'house-dj' && item.context).length, 5);
  assert.equal(movement.find((item) => item.id === 'house-dj')?.context, undefined);
  assert.ok(club.dj.root.position.equals(djPosition));
  club.dispose();
});

test('floor shadows tighten during a jump and spread on landing without moving the tracking root', () => {
  const base = fixtureFactory();
  let lift = 0, impact = 0;
  const club = makeClubWorld({ createAvatar: (preset, id, options) => ({ ...base.createAvatar(preset, id, options), get groundLift() { return lift; }, get landingImpact() { return impact; } }) });
  const rig = club.ambient[0];
  club.update(1, 'neon', false, 1);
  const baseline = rig.shadow.scale.x, position = rig.root.position.clone();
  lift = 0.5;
  club.update(1, 'neon', false, 1);
  assert.ok(rig.shadow.scale.x < baseline * 0.85, 'airborne contact shadow becomes distinctly smaller');
  lift = 0; impact = 1;
  club.update(1, 'neon', false, 1);
  assert.ok(rig.shadow.scale.x > baseline * 1.09, 'landing has a readable contact response');
  assert.ok(rig.root.position.equals(position), 'jumping never bobs the camera tracking root');
  club.dispose();
});

test('an explicit action immediately interrupts full walking and holds its exact route coordinate', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const epoch = 1_791_806_400_000;
  let now = epoch;
  while (clubMotionAt(now, 0).walkBlend < 1) now += 50;
  const base = fixtureFactory();
  const poses: { beat: number; action: string; walkBlend: number }[] = [];
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    if (id === 'p0') avatar.update = (beat, action, _reduced, _energy, motion) => { poses.push({ beat, action, walkBlend: motion?.walkBlend ?? -1 }); };
    return avatar;
  } });
  club.syncParticipants([participant()], 'p0');
  club.update(5, 'neon', false, 1, now);
  const rig = club.players.get('p0')!, position = rig.root.position.clone(), heading = rig.motion.heading;
  assert.equal(rig.motion.walkBlend, 1);
  club.syncParticipants([{ ...participant(), action: 'bounce', actionAt: now, actionUntil: now + 6000, routePauseMs: 0 }], 'p0');
  club.update(5, 'neon', false, 1, now);
  assert.equal(rig.motion.walkBlend, 0, 'pressed dance has full weight on the first draw');
  assert.equal(poses.at(-1)?.action, 'bounce');
  assert.equal(poses.at(-1)?.walkBlend, 0);
  for (const elapsed of [1, 200, 2000, 5999]) {
    club.update(5 + elapsed / 500, 'neon', false, 1, now + elapsed);
    assert.ok(rig.root.position.distanceTo(position) < 1e-9, 'personal action freezes rather than sliding through a dance');
    assert.equal(rig.motion.heading, heading, 'follow camera never follows an internal spin');
  }
  club.update(17, 'neon', false, 1, now + 6000);
  assert.ok(rig.root.position.distanceTo(position) < 1e-9, 'resume starts from the held coordinate');
  club.update(17.002, 'neon', false, 1, now + 6001);
  assert.ok(rig.root.position.distanceTo(position) < 0.001, 'resume is continuous');
  club.dispose();
});

test('same-action retrigger restarts the pose without a route jump and late viewers agree', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  let now = 1_791_806_400_000;
  while (clubMotionAt(now, 0).walkBlend < 1) now += 50;
  const early = makeTestWorld(), late = makeTestWorld();
  const first = { ...participant(), action: 'spin' as const, actionAt: now, actionUntil: now + 6000, routePauseMs: 0 };
  early.syncParticipants([first], 'p0');
  early.update(8, 'neon', false, 1, now + 1000);
  const position = early.players.get('p0')!.root.position.clone();
  const repeated = { ...first, actionAt: now + 1000, actionUntil: now + 7000, routePauseMs: 1000 };
  early.syncParticipants([repeated], 'p0');
  late.syncParticipants([repeated], null);
  early.update(8, 'neon', false, 1, now + 1000);
  late.update(8, 'neon', false, 1, now + 1000);
  assert.ok(early.players.get('p0')!.root.position.equals(position));
  assert.deepEqual(early.players.get('p0')!.motion, late.players.get('p0')!.motion);
  assert.equal(early.players.get('p0')!.motion.walkBlend, 0);
  early.dispose(); late.dispose();
});

test('rejecting an own preview restores canonical navigation and reduced motion remains still', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const club = makeTestWorld(), now = 1_791_806_402_000;
  club.syncParticipants([{ ...participant(), action: 'bounce', actionAt: now, actionUntil: now + 6000, routePauseMs: 0 }], 'p0');
  club.update(1, 'neon', false, 1, now + 700);
  club.syncParticipants([participant()], 'p0');
  club.update(2.4, 'neon', false, 1, now + 700);
  club.update(3.4, 'neon', false, 1, now + 1200);
  assert.deepEqual(club.players.get('p0')!.motion, clubMotionAt(now + 1200, 0));
  club.syncParticipants([{ ...participant(), action: 'spin', actionAt: now, actionUntil: now + 6000 }], 'p0');
  club.update(2.4, 'neon', true, 1, now + 700);
  const position = club.players.get('p0')!.root.position.clone();
  club.update(5, 'neon', true, 1, now + 2000);
  assert.ok(club.players.get('p0')!.root.position.equals(position));
  assert.equal(club.players.get('p0')!.motion.walkBlend, 0);
  club.dispose();
});

test('shared group choreography overrides personal holds, supplies foot routes, and keeps the DJ at the booth', async () => {
  const { clubGroupMotionAt } = await import('../lib/club-group-motion.ts');
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const start = 1_791_806_402_000, now = start + 7000;
  const event = { id: 'group-1', kind: 'train' as const, version: 1 as const, startsAt: start, endsAt: start + 28000, beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
  const base = fixtureFactory();
  const poses = new Map<string, unknown>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (_beat, _action, _reduced, _energy, _motion, pose) => { poses.set(id, pose); };
    return avatar;
  } });
  club.syncParticipants([{ ...participant(), action: 'spin', actionAt: start + 6000, actionUntil: start + 12000, routePauseMs: 0 }], 'p0');
  const djPosition = club.dj.root.position.clone();
  club.update(12, 'neon', false, 1, now, undefined, { groupAction: event });
  const rig = club.players.get('p0')!;
  const expected = clubGroupMotionAt(now, 0, event, clubMotionAt(start + 6000, 0))!;
  assert.equal(rig.motion.x, expected.motion.x);
  assert.equal(rig.motion.z, expected.motion.z);
  assert.equal(rig.motion.heading, expected.motion.heading);
  assert.equal(typeof rig.motion.sampleAtDistance, 'function');
  assert.deepEqual(poses.get('p0'), expected.pose);
  assert.ok(club.dj.root.position.equals(djPosition));
  assert.equal(poses.get('house-dj'), undefined, 'the resident DJ keeps its music clock instead of freezing on the formation count-in');
  club.dispose();
});

test('group late arrivals share roots and its return meets current roaming continuously', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const start = 1_791_806_402_000;
  const event = { id: 'group-2', kind: 'wave' as const, version: 1 as const, startsAt: start, endsAt: start + 14000, beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
  const early = makeTestWorld(), late = makeTestWorld();
  early.syncParticipants([participant(7)], 'p7');
  for (const now of [start, start + 1000, start + 5500, start + 10900]) early.update(1, 'neon', false, 1, now, undefined, { groupAction: event });
  late.syncParticipants([participant(7)], null);
  late.update(1, 'neon', false, 1, start + 10900, undefined, { groupAction: event });
  const a = early.players.get('p7')!, b = late.players.get('p7')!;
  assert.ok(a.root.position.equals(b.root.position));
  assert.equal(a.motion.heading, b.motion.heading);
  assert.equal(typeof a.motion.sampleAtDistance, 'function', 'late viewers are actually inside the group route');
  early.update(1, 'neon', false, 1, event.endsAt - 1, undefined, { groupAction: event });
  const before = a.root.position.clone(), heading = a.motion.heading;
  early.update(1, 'neon', false, 1, event.endsAt, undefined, { groupAction: event });
  assert.deepEqual(a.motion, clubMotionAt(event.endsAt, 7));
  assert.ok(a.root.position.distanceTo(before) < 0.002, 'group expiry never teleports to a stale roam position');
  assert.ok(Math.abs(Math.atan2(Math.sin(a.motion.heading - heading), Math.cos(a.motion.heading - heading))) < 0.002);
  early.update(9, 'neon', true, 1, start + 6000, undefined, { groupAction: event });
  assert.deepEqual(a.motion, clubMotionAt(start + 6000, 7, true));
  early.dispose(); late.dispose();
});

test('slow action acknowledgements ease the displayed root to the authoritative pause without a pop', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const { beginPersonalAction, personalRouteTime } = await import('../lib/room-action-state.ts');
  let now = 1_791_806_400_000;
  while (clubMotionAt(now, 0).walkBlend < 1) now += 50;
  const club = makeTestWorld();
  club.syncParticipants([participant()], 'p0');
  club.update(1, 'neon', false, 1, now);
  club.syncParticipants([beginPersonalAction(participant(), 'bounce', now)], 'p0');
  club.update(2, 'neon', false, 1, now + 700);
  const rig = club.players.get('p0')!, before = rig.root.position.clone();
  const accepted = beginPersonalAction(participant(), 'bounce', now + 600);
  club.syncParticipants([accepted], 'p0');
  club.update(2, 'neon', false, 1, now + 700);
  assert.ok(rig.root.position.distanceTo(before) < 1e-9, 'ACK does not snap the followed avatar along its path');
  club.update(3, 'neon', false, 1, now + 1200);
  assert.deepEqual(rig.motion, { ...clubMotionAt(personalRouteTime(accepted, now + 1200), 0), speed: 0, walkBlend: 0, action: 'bounce' });
  club.dispose();
});

test('replacing a paused occupant during group count-in reaches its captured start without a hard seam', () => {
  const start = 1_791_806_400_000;
  const event = { id: 'group-replace-start', kind: 'train' as const, version: 1 as const, startsAt: start, endsAt: start + 28000, beatMs: 500, sourceClockBySlot: Array.from({ length: 10 }, (_, slot) => start - (slot === 5 ? 10549 : 0)) };
  const club = makeTestWorld();
  club.syncParticipants([{ ...participant(5), routePauseMs: 10549 }], 'p5');
  club.update(1, 'neon', false, 1, start - 2000, undefined, { groupAction: event });
  const before = club.players.get('p5')!.root.position.clone();
  club.syncParticipants([], null);
  club.update(1, 'neon', false, 1, start - 2000, undefined, { groupAction: event });
  const replacement = club.ambient.find((rig) => rig.slot === 5)!;
  assert.ok(replacement.root.position.distanceTo(before) < 1e-9, 'replacement begins at the displayed slot coordinate');
  club.update(1, 'neon', false, 1, start - 1, undefined, { groupAction: event });
  const beforeStart = replacement.root.position.clone(), heading = replacement.motion.heading;
  club.update(1, 'neon', false, 1, start, undefined, { groupAction: event });
  assert.ok(replacement.root.position.distanceTo(beforeStart) < 0.002, 'captured source no longer teleports at group start');
  assert.ok(Math.abs(Math.atan2(Math.sin(replacement.motion.heading - heading), Math.cos(replacement.motion.heading - heading))) < 0.002);
  club.dispose();
});

test('replacing a paused occupant during final return stays continuous through group expiry', () => {
  const start = 1_791_806_400_000;
  const event = { id: 'group-replace-end', kind: 'wave' as const, version: 1 as const, startsAt: start, endsAt: start + 14000, beatMs: 500, sourceClockBySlot: Array.from({ length: 10 }, (_, slot) => start - (slot === 5 ? 10549 : 0)) };
  const club = makeTestWorld();
  club.syncParticipants([{ ...participant(5), routePauseMs: 10549 }], 'p5');
  club.update(1, 'neon', false, 1, event.endsAt - 800, undefined, { groupAction: event });
  const before = club.players.get('p5')!.root.position.clone();
  club.syncParticipants([], null);
  club.update(1, 'neon', false, 1, event.endsAt - 800, undefined, { groupAction: event });
  const replacement = club.ambient.find((rig) => rig.slot === 5)!;
  assert.ok(replacement.root.position.distanceTo(before) < 1e-9, 'return target replacement is visually continuous');
  club.update(1, 'neon', false, 1, event.endsAt - 1, undefined, { groupAction: event });
  const beforeEnd = replacement.root.position.clone();
  club.update(1, 'neon', false, 1, event.endsAt, undefined, { groupAction: event });
  assert.ok(replacement.root.position.distanceTo(beforeEnd) < 0.006, 'expiry continues the same corrected target');
  club.dispose();
});

test('same-action presses restart the visible pose timeline even when the music beat is unchanged', async () => {
  const { beginPersonalAction } = await import('../lib/room-action-state.ts');
  const base = fixtureFactory(), poses: number[] = [];
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    if (id === 'p0') avatar.update = (beat) => { poses.push(beat); };
    return avatar;
  } });
  const now = 1_791_806_400_000, first = beginPersonalAction(participant(), 'spin', now);
  club.syncParticipants([first], 'p0');
  club.update(14, 'neon', false, 1, now + 1000);
  assert.equal(poses.at(-1), 2);
  club.syncParticipants([beginPersonalAction(first, 'spin', now + 1000)], 'p0');
  club.update(14, 'neon', false, 1, now + 1000);
  assert.equal(poses.at(-1), 0, 'the same button is a fresh action, not an unchanged state label');
  club.dispose();
});

test('world forwards all five v2 routines and their deterministic roots, shared activation, return and quiet mode', async () => {
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const { clubGroupMotionAt } = await import('../lib/club-group-motion.ts');
  const { GROUP_ACTION_DURATIONS_MS } = await import('../lib/room-types.ts');
  const base = fixtureFactory();
  const poses = new Map<string, Parameters<SceneAvatarAdapter['update']>[5]>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (_beat, _action, _reduced, _energy, _motion, pose) => { poses.set(id, pose); };
    return avatar;
  } });
  club.syncParticipants([participant(6), participant(5)], 'p6');
  const start = 1_791_806_400_000;
  for (const kind of ['train', 'wave', 'unison', 'battle', 'grid'] as const) {
    const event = { id: `v2-${kind}`, version: 2 as const, kind, startsAt: start, endsAt: start + GROUP_ACTION_DURATIONS_MS[kind], beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
    const now = start + (kind === 'wave' || kind === 'battle' ? 8100 : 7100);
    club.update(5, 'neon', false, 1, now, undefined, { groupAction: event });
    for (const slot of [5, 6]) {
      const rig = club.players.get(`p${slot}`)!, expected = clubGroupMotionAt(now, slot, event, clubMotionAt(now, slot))!;
      assert.equal(rig.motion.x, expected.motion.x);
      assert.equal(rig.motion.z, expected.motion.z);
      assert.equal(rig.root.rotation.y, expected.motion.heading, 'follow camera keeps the authored formation heading');
      assert.deepEqual(poses.get(rig.id), expected.pose);
      assert.equal(poses.get(rig.id)?.version, 2);
    }
    if (kind === 'battle') assert.notEqual(poses.get('p5')?.activation, poses.get('p6')?.activation, 'opposing team responses reach their rigs');
    club.update(5, 'neon', false, 1, event.endsAt, undefined, { groupAction: event });
    assert.deepEqual(club.players.get('p6')!.motion, clubMotionAt(event.endsAt, 6));
    club.update(5, 'neon', true, 1, now, undefined, { groupAction: event });
    assert.deepEqual(club.players.get('p6')!.motion, clubMotionAt(now, 6, true));
    assert.equal(poses.get('house-dj'), undefined);
  }
  club.dispose();
});

test('manual intent is integrated into the same world and a released owner parks', () => {
 const world=makeTestWorld();const p=participant();world.syncParticipants([p],p.id);const samples:unknown[]=[];
 const now=1_791_806_400_000;
 world.update(0,'neon',false,.8,now,undefined,{manualIntent:{vx:0,vz:1.8,active:true,enabled:true},deltaSeconds:.025,onOwnMovement:sample=>samples.push(sample)});
 const rig=world.players.get(p.id)!;const moving={x:rig.motion.x,z:rig.motion.z};assert.equal(samples.length,1);
 world.update(0,'neon',false,.8,now+25,undefined,{manualIntent:{vx:0,vz:0,active:false},deltaSeconds:.025,onOwnMovement:sample=>samples.push(sample)});
 world.update(0,'neon',false,.8,now+2500,undefined,{deltaSeconds:.1});
 assert.equal(rig.motion.x,moving.x);assert.equal(rig.motion.z,moving.z);assert.ok(rig.motion.sampleAtDistance);world.dispose();
});


test('spectator third-person subject is the DJ, then a joined human avatar, then the DJ after leaving', () => {
  const club = makeTestWorld();
  const dj = club.getCameraSubject(null)!;
  assert.equal(dj.id, 'house-dj');
  assert.equal(dj.position, club.dj.root.position);
  assert.equal(dj.heading, club.dj.root.rotation.y);
  assert.equal(dj.height, club.dj.model.height * CLUB_AVATAR_SCALE);
  assert.equal(dj.displayScale, CLUB_AVATAR_SCALE);
  for (const preset of ['human-jiji', 'human-subeike', 'human-lx'] as const) {
    club.syncParticipants([{ ...participant(), preset }], 'p0');
    assert.equal(club.players.get('p0')?.preset, preset);
    assert.equal(club.getCameraSubject('p0')?.id, 'p0');
  }
  club.syncParticipants([], null);
  assert.equal(club.getCameraSubject('p0')?.id, 'house-dj');
  club.dj.root.visible = false;
  assert.equal(club.getCameraSubject(null), null);
  club.dispose();
});

test('real guests can choose duplicate new characters while each seat hides only its ambient dancer', () => {
  const club = makeTestWorld();
  const participants = Array.from({ length: 10 }, (_, slot) => ({ ...participant(slot), preset: 'banana-cat' as const }));
  club.syncParticipants(participants, 'p0');
  assert.equal(club.players.size, 10);
  assert.ok([...club.players.values()].every(rig => rig.preset === 'banana-cat' && rig.root.visible));
  assert.equal(club.ambient.filter(rig => rig.root.visible).length, 0);
  club.syncParticipants([], null);
  assert.equal(club.ambient.filter(rig => rig.root.visible).length, 5);
  assert.equal(new Set(club.ambient.map(rig => rig.preset)).size, 5);
  club.dispose();
});

test('finite personal backflips use accepted elapsed time and never restart when a song changes after expiry', async () => {
  const { beginPersonalAction } = await import('../lib/room-action-state.ts');
  const base = fixtureFactory();
  const poses = new Map<string, { beat: number; action: string }>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (beat, action) => { poses.set(id, { beat, action }); };
    return avatar;
  } });
  const now = 1_791_806_400_000;
  const first = beginPersonalAction(participant(), 'wave', now);
  club.syncParticipants([first], 'p0');
  for (const musicBeat of [200, 0, 0.4]) {
    club.update(musicBeat, 'neon', false, 1, now + 880);
    assert.deepEqual(poses.get('p0'), { beat: 1.76, action: 'wave' }, 'a track change cannot seek an active flip');
  }
  club.update(0, 'neon', false, 1, now + 5999);
  assert.deepEqual(poses.get('p0'), { beat: 11.998, action: 'wave' }, 'the command reaches its grounded finish before expiry');
  for (const musicBeat of [0, 1.76, 200]) {
    club.update(musicBeat, 'neon', false, 1, now + 6000);
    assert.deepEqual(poses.get('p0'), { beat: musicBeat, action: 'dance' }, 'stored action history cannot replay or hold the expired flip');
  }
  club.syncParticipants([beginPersonalAction(first, 'wave', now + 7000)], 'p0');
  club.update(200, 'neon', false, 1, now + 7000);
  assert.deepEqual(poses.get('p0'), { beat: 0, action: 'wave' }, 'a fresh explicit press still starts immediately');
  club.dispose();
});

test('automatic roam choices cannot start a finite backflip from a song clock', () => {
  const base = fixtureFactory();
  const actions = new Map<string, string>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (_beat, action) => { actions.set(id, action); };
    return avatar;
  } });
  const now = 1_791_806_400_000;
  let waveRoutes = 0;
  for (let elapsed = 0; elapsed < 60000; elapsed += 500) {
    club.update(1.76, 'neon', false, 1, now + elapsed);
    for (const rig of club.ambient) {
      if (rig.motion.action !== 'wave') continue;
      waveRoutes++;
      assert.equal(actions.get(rig.id), 'dance', 'a looping route selection is not an explicit somersault command');
    }
  }
  assert.ok(waveRoutes > 0, 'the regression exercised real automatic wave route choices');
  club.dispose();
});

test('emotion poses restart on accepted taps, survive track changes and stop at expiry without ambient replay', async () => {
  const { beginPersonalAction } = await import('../lib/room-action-state.ts');
  const base = fixtureFactory();
  const poses = new Map<string, { beat: number; action: string }>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (beat, action) => { poses.set(id, { beat, action }); };
    return avatar;
  } });
  const now = 1_791_806_400_000;
  try {
    for (const action of ['love', 'laugh', 'punch', 'ghost'] as const) {
      const person = beginPersonalAction(participant(), action, now);
      club.syncParticipants([person], 'p0');
      club.update(200, 'neon', false, 1, now - 1);
      assert.equal(poses.get('p0')?.action, 'dance', 'future or missing acceptance cannot show an emotion');
      for (const musicBeat of [200, 0, 0.4]) {
        club.update(musicBeat, 'neon', false, 1, now + 800);
        assert.deepEqual(poses.get('p0'), { beat: 1.6, action }, 'personal elapsed time is independent of track changes');
        assert.ok(club.ambient.every(rig => !['love', 'laugh', 'punch', 'ghost'].includes(poses.get(rig.id)?.action ?? '')));
      }
      club.update(1.6, 'neon', false, 1, now + 6000);
      assert.equal(poses.get('p0')?.action, 'dance', 'stored action is history after the six-second interval');
      club.syncParticipants([beginPersonalAction(person, action, now + 7000)], 'p0');
      club.update(200, 'neon', false, 1, now + 7000);
      assert.deepEqual(poses.get('p0'), { beat: 0, action }, 'a repeated tap starts from the beginning');
      club.syncParticipants([{ ...person, joinedAt: now + 500 }], 'p0');
      club.update(200, 'neon', false, 1, now + 800);
      assert.equal(poses.get('p0')?.action, 'dance', 'an action from old membership cannot animate a rejoined actor');
    }
  } finally { club.dispose(); }
});

test('group choreography owns the body while the accepted emotion remains available for its bubble', async () => {
  const { beginPersonalAction } = await import('../lib/room-action-state.ts');
  const base = fixtureFactory();
  const poses = new Map<string, { action: string; group: string | undefined }>();
  const club = makeClubWorld({ createAvatar: (kind, id, options) => {
    const avatar = base.createAvatar(kind, id, options);
    avatar.update = (_beat, action, _reduced, _energy, _motion, group) => { poses.set(id, { action, group: group?.kind }); };
    return avatar;
  } });
  const now = 1_791_806_400_000;
  const person = beginPersonalAction(participant(), 'punch', now);
  const group = { id: 'group', kind: 'unison' as const, startsAt: now + 500, endsAt: now + 18500, beatMs: 500, version: 2 as const, sourceClockBySlot: Array(10).fill(now) };
  try {
    club.syncParticipants([person], 'p0');
    club.update(10, 'neon', false, 1, now + 1000, undefined, { groupAction: group });
    assert.equal(poses.get('p0')?.group, 'unison');
    assert.notEqual(poses.get('p0')?.action, 'punch');
    assert.equal(club.players.get('p0')?.participant?.action, 'punch', 'presentation still has the accepted event for social feedback');
  } finally { club.dispose(); }
});

test('ground selection exposes real floor and only visible solid actor/booth roots',()=>{
 const club=makeTestWorld();club.syncParticipants([participant(1)], 'p1');
 assert.equal(club.floor.name,'isometric-grid-floor');
 const blockers=club.getFloorPickBlockers();assert.ok(blockers.includes(club.scene.getObjectByName('central-dj-booth')!));
 assert.ok(blockers.includes(club.dj.model.root));assert.ok(blockers.includes(club.players.get('p1')!.model.root));
 assert.ok(!blockers.includes(club.ambient.find(rig=>rig.slot===1)!.model.root));
 for(const rig of [...club.players.values(),...club.ambient,club.dj]){assert.ok(!blockers.includes(rig.halo));assert.ok(!blockers.includes(rig.shadow));}
 club.dispose();
});
test('click destination ring is reused and its resources dispose exactly once',()=>{
 const club=makeTestWorld();club.syncParticipants([participant()], 'p0');
 const ring=club.scene.getObjectByName('click-walk-target') as THREE.Mesh;assert.ok(ring);assert.equal(ring.visible,false);
 let disposed=0;ring.geometry.addEventListener('dispose',()=>disposed++);
 (ring.material as THREE.Material).addEventListener('dispose',()=>disposed++);
 club.dispose();club.dispose();assert.equal(disposed,2);
});

test('ordinary automatic wave roots agree for a countdown observer and a fresh late viewer',()=>{
 const start=1791806400000,event={id:'shared-wave',kind:'wave' as const,version:2 as const,startsAt:start+350,endsAt:start+10350,beatMs:500,sourceClockBySlot:Array(10).fill(start+350)};
 const early=makeTestWorld(),late=makeTestWorld();early.syncParticipants([participant()], 'p0');late.syncParticipants([participant()], 'p0');
 early.update(0,'neon',false,1,start-25);early.update(0,'neon',false,1,start,undefined,{groupAction:event});
 early.update(0,'neon',false,1,start+1550,undefined,{groupAction:event});late.update(0,'neon',false,1,start+1550,undefined,{groupAction:event});
 for(const slot of [0,1,4,5]){const a=slot===0?early.players.get('p0')!:early.ambient.find(rig=>rig.slot===slot)!,b=slot===0?late.players.get('p0')!:late.ambient.find(rig=>rig.slot===slot)!;assert.ok(a.root.position.distanceTo(b.root.position)<1e-8);}
 early.dispose();late.dispose();
});

test('train prop follows shared clock, expires cleanly and releases dancers in place for late viewers',async()=>{
 const {trainSlotPlacement,TRAIN_TOTAL_DISTANCE}=await import('../lib/club-train-motion.ts');
 const start=1791806400000,event={id:'new-train',kind:'train' as const,version:3 as const,startsAt:start,endsAt:start+16000,beatMs:500,sourceClockBySlot:Array(10).fill(start)};
 const early=makeTestWorld(),late=makeTestWorld();early.syncParticipants([participant()], 'p0');late.syncParticipants([participant()], 'p0');
 early.update(0,'neon',false,1,start+10000,undefined,{groupAction:event});
 assert.equal(early.scene.getObjectByName('shared-toy-train')?.visible,true);
 early.update(0,'neon',false,1,event.endsAt,undefined,{groupAction:event});
 const point=trainSlotPlacement(0,TRAIN_TOTAL_DISTANCE),root=early.players.get('p0')!.root;
 assert.ok(Math.hypot(root.position.x-point.x,root.position.z-point.z)<1e-8,'dancer lands where the train sinks');
 assert.equal(early.scene.getObjectByName('shared-toy-train')?.visible,false);
 early.update(0,'neon',false,1,event.endsAt+7000,undefined,{groupAction:event});late.update(0,'neon',false,1,event.endsAt+7000,undefined,{groupAction:event});
 assert.ok(early.players.get('p0')!.root.position.distanceTo(late.players.get('p0')!.root.position)<1e-8);
 early.dispose();late.dispose();
});

test('personal actions after a train freeze the released roaming root', async()=>{
 const {beginPersonalAction}=await import('../lib/room-action-state.ts');
 const start=1791806400000,event={id:'train-hold',kind:'train' as const,version:3 as const,startsAt:start,endsAt:start+16000,beatMs:500,sourceClockBySlot:Array(10).fill(start)};
 for(let offset=23000;offset<45000;offset+=2500){const club=makeTestWorld(),person=beginPersonalAction(participant(),'love',start+offset);club.syncParticipants([person],'p0');
 club.update(0,'neon',false,1,start+offset+1000,undefined,{groupAction:event});const origin=club.players.get('p0')!.root.position.clone();
 club.update(0,'neon',false,1,start+offset+3000,undefined,{groupAction:event});assert.ok(origin.distanceTo(club.players.get('p0')!.root.position)<1e-8);
 club.dispose();}
});

test('group effects keep five ambient bodies without populating empty guest seats or replacing the DJ',()=>{
 const club=makeTestWorld(),start=1791806400000,dj=club.dj,original=club.ambient.map(rig=>rig.id).sort();
 for(const kind of ['train','wave'] as const){
  const group={id:kind,kind,version:kind==='train'?3 as const:2 as const,startsAt:start,endsAt:start+(kind==='train'?16000:10000),beatMs:500,sourceClockBySlot:Array(10).fill(start)};
  for(const elapsed of [0,6000,9000,16001]){club.update(10,'neon',false,1,start+elapsed,undefined,{groupAction:group});assert.deepEqual(club.ambient.filter(rig=>rig.root.visible).map(rig=>rig.id).sort(),original);assert.equal(club.ambient.length,5);assert.equal(club.players.size,0);assert.equal(club.dj,dj);assert.equal(club.dj.preset,'dj-kunkun');}
 }
 club.dispose();
});


test('NPC nameplates use original character names and never replace real nicknames', async () => {
  const { CLUB_AVATAR_CATALOG } = await import('../lib/club-avatar-catalog.ts');
  const club = makeTestWorld();
  for (const npc of club.ambient) {
    assert.equal(npc.name, CLUB_AVATAR_CATALOG.find(avatar => avatar.id === npc.preset)?.label);
  }
  assert.equal(club.dj.name, '坤坤鸡');
  const human = { ...participant(), name: '我的自填昵称', preset: 'milk-frog' as const };
  club.syncParticipants([human], human.id);
  assert.equal(club.players.get(human.id)?.name, human.name);
  club.syncParticipants([{ ...human, name: '第二个自填昵称', preset: 'banana-cat' }], human.id);
  assert.equal(club.players.get(human.id)?.name, '第二个自填昵称');
  club.dispose();
});
