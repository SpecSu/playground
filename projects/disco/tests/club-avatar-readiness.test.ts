import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubWorld, type SceneAvatarAdapter } from '../lib/club-scene-world.ts';
const person = (preset = 'milk-frog') => ({ id: 'me', name: 'Me', preset, slot: 0, joinedAt: 0, lastSeenAt: 0, action: 'dance', actionAt: 0 }) as Parameters<ReturnType<typeof makeClubWorld>['syncParticipants']>[0][number];
function fixture() {
  const loads: { preset: string; avatar: SceneAvatarAdapter; resolve(): void; reject(): void; disposed: boolean }[] = [];
  const errors: unknown[] = [];
  const world = makeClubWorld({ onAvatarError: error => errors.push(error), createAvatar(preset, id) {
    let resolve!: () => void, reject!: (error: Error) => void;
    const ready = id === 'me' ? new Promise<void>((a, b) => { resolve = a; reject = b; }) : Promise.resolve();
    const entry = { preset, avatar: null! as SceneAvatarAdapter, resolve: () => { entry.avatar.loaded = true; resolve(); }, reject: () => reject(new Error('load failed')), disposed: false };
    entry.avatar = { root: new THREE.Group(), height: 2, labelHeight: 2.2, footprintRadius: .6, loaded: id !== 'me', ready, update() {}, dispose() { entry.disposed = true; } };
    if (id === 'me') loads.push(entry);
    return entry.avatar;
  }});
  return { world, loads, errors };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
test('replacement leaves old visible until the new model is installed and ready', async () => {
  const { world, loads } = fixture(); world.syncParticipants([person()], 'me'); loads[0].resolve(); await flush();
  const original = world.players.get('me')!;
  world.syncParticipants([person('banana-cat')], 'me');
  assert.equal(world.players.get('me'), original); assert.equal(original.root.visible, true); assert.equal(loads[0].disposed, false);
  loads[1].resolve(); await flush();
  assert.equal(world.players.get('me')!.preset, 'banana-cat'); assert.equal(world.players.get('me')!.root.visible, true); assert.equal(loads[0].disposed, true); world.dispose();
});
test('failed replacements preserve old model and can retry the same selected avatar', async () => {
  const { world, loads, errors } = fixture(); world.syncParticipants([person()], 'me'); loads[0].resolve(); await flush();
  const old = world.players.get('me'); world.syncParticipants([person('banana-cat')], 'me'); loads[1].reject(); await flush();
  assert.equal(world.players.get('me'), old); assert.equal(old!.root.visible, true); assert.equal(errors.length, 1);
  world.retryFailedAvatar('me', 'banana-cat'); assert.equal(loads.length, 3); loads[2].resolve(); await flush();
  assert.equal(world.players.get('me')!.preset, 'banana-cat'); world.dispose();
});
test('late replacement completion cannot override a newer choice or resurrect a departed player', async () => {
  const { world, loads } = fixture(); world.syncParticipants([person()], 'me'); loads[0].resolve(); await flush();
  world.syncParticipants([person('banana-cat')], 'me'); world.syncParticipants([person('niulai')], 'me');
  loads[1].resolve(); await flush(); assert.equal(world.players.get('me')!.preset, 'milk-frog'); assert.equal(loads[1].disposed, true);
  loads[2].resolve(); await flush(); assert.equal(world.players.get('me')!.preset, 'niulai');
  world.syncParticipants([person('banana-cat')], 'me'); world.syncParticipants([], null); loads[3].resolve(); await flush(); assert.equal(world.players.size, 0); assert.equal(loads[3].disposed, true); world.dispose();
});
test('failed first joins retry without replacing unrelated actors', async () => {
 const {world,loads}=fixture(); world.syncParticipants([person()],'me'); loads[0].reject(); await flush();
 assert.equal(world.players.get('me')!.root.visible,false); world.retryFailedAvatar('me','milk-frog'); assert.equal(loads.length,2);
 loads[1].resolve(); await flush(); assert.equal(world.players.get('me')!.root.visible,true); assert.equal(loads[0].disposed,true); world.dispose();
});
test('reverting to the current avatar cancels a pending swap and ignores its later error',async()=>{
 const {world,loads,errors}=fixture(); world.syncParticipants([person()],'me'); loads[0].resolve(); await flush();
 const old=world.players.get('me'); world.syncParticipants([person('banana-cat')],'me'); world.syncParticipants([person()],'me'); loads[1].reject(); await flush();
 assert.equal(world.players.get('me'),old); assert.equal(old!.root.visible,true); assert.equal(errors.length,0); world.dispose();
});
