import './room-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { removeFishingAvatarProps } from '../lib/fishing-avatar-props.ts';

async function source(kind = 'sword-shield-dog') {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function meshes(root) {
  const result = [];
  root.traverse(node => { if (node.isSkinnedMesh) result.push(node); });
  return result;
}
function snapshot(root) {
  return meshes(root).map(mesh => ({
    index: Array.from(mesh.geometry.index.array),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])),
  }));
}
// Independently identify complete authored islands by connectivity. All nineteen
// weapon islands are rigidly hand-bound and non-golden; palms/fingers are gold.
function islands(mesh) {
  const g = mesh.geometry, p = g.attributes.position, parent = new Map(), triangles = [];
  const find = key => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== root) { const next = parent.get(key); parent.set(key, root); key = next; }
    return root;
  };
  for (let offset = 0; offset < g.index.count; offset += 3) {
    const ids = [0, 1, 2].map(n => g.index.getX(offset + n));
    const keys = ids.map(i => [0, 1, 2].map(n => p.getComponent(i, n).toFixed(5)).join(','));
    parent.set(find(keys[1]), find(keys[0])); parent.set(find(keys[2]), find(keys[0]));
    triangles.push({ ids, keys });
  }
  const components = new Map();
  for (const triangle of triangles) {
    const key = find(triangle.keys[0]);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(triangle.ids);
  }
  return [...components.values()].map(faces => {
    const vertices = [...new Set(faces.flat())], bones = new Set();
    for (const vertex of vertices) for (let channel = 0; channel < 4; channel++) {
      if (g.attributes.skinWeight.getComponent(vertex, channel) > .001) bones.add(mesh.skeleton.bones[g.attributes.skinIndex.getComponent(vertex, channel)].name);
    }
    const gold = vertices.every(vertex => Math.abs(g.attributes.color.getX(vertex) - .539479) < .0001 && Math.abs(g.attributes.color.getY(vertex) - .266356) < .0001 && Math.abs(g.attributes.color.getZ(vertex) - .088656) < .0001);
    const weapon = bones.size === 1 && [...bones][0].startsWith('hand_') && !gold;
    return { faces, vertices, weapon, gold, bones };
  });
}
function faceSignature(mesh, face) {
  return face.map(vertex => Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, Array.from({ length: attribute.itemSize }, (_, n) => attribute.getComponent(vertex, n))]));
}

test('real GLB loses exactly the nineteen sword/shield islands and keeps every body and paw triangle', async () => {
  const template = await source();
  const avatar = createClubAvatar('sword-shield-dog', 'fishing-prop-removal', { template });
  const vinyl = meshes(avatar.root).find(mesh => mesh.material.name === 'Meme_vinyl');
  const parts = islands(vinyl), weapons = parts.filter(part => part.weapon), body = parts.filter(part => !part.weapon);
  assert.equal(weapons.length, 19, 'the actual asset has separate blade, handle, rivets and shield islands');
  assert.equal(weapons.reduce((sum, part) => sum + part.faces.length, 0), 1876);
  const expectedBody = body.flatMap(part => part.faces.map(face => JSON.stringify(faceSignature(vinyl, face)))).sort();
  const expectedPawVertices = body.filter(part => part.gold && [...part.bones].every(bone => bone.startsWith('hand_'))).reduce((sum, part) => sum + part.vertices.length, 0);
  const expectedTop = Math.max(...body.flatMap(part => part.vertices.map(vertex => vinyl.geometry.attributes.position.getY(vertex))));
  const glossBefore = snapshot(avatar.root)[1];
  assert.equal(removeFishingAvatarProps(avatar.root, 'sword-shield-dog'), 1876);
  const remaining = islands(vinyl);
  assert.equal(remaining.filter(part => part.weapon).length, 0);
  assert.deepEqual(remaining.flatMap(part => part.faces.map(face => JSON.stringify(faceSignature(vinyl, face)))).sort(), expectedBody);
  assert.equal(remaining.filter(part => part.gold && [...part.bones].every(bone => bone.startsWith('hand_'))).reduce((sum, part) => sum + part.vertices.length, 0), expectedPawVertices, 'all golden palms and curled fingers survive');
  assert.deepEqual(snapshot(avatar.root)[1], glossBefore, 'eyes and nose are untouched');
  assert.equal(vinyl.geometry.boundingBox.max.y, expectedTop, 'unused knife vertices are removed from bounds too');
  assert.ok(expectedTop < 1, 'the remaining silhouette excludes the high knife tip');
  assert.equal(removeFishingAvatarProps(avatar.root, 'sword-shield-dog'), 0, 'repeat initialization is harmless');
  avatar.dispose();
});

test('fishing-only filtering leaves the cached GLB and independent club avatar unchanged', async () => {
  const template = await source();
  const before = snapshot(template);
  const club = createClubAvatar('sword-shield-dog', 'club-still-armed', { template });
  const fishing = createClubAvatar('sword-shield-dog', 'fishing-unarmed', { template });
  const clubBefore = snapshot(club.root);
  assert.equal(removeFishingAvatarProps(fishing.root, 'sword-shield-dog'), 1876);
  assert.deepEqual(snapshot(template), before);
  assert.deepEqual(snapshot(club.root), clubBefore);
  club.update(.3, 'wave', false);
  assert.deepEqual(snapshot(club.root), clubBefore, 'club animation still uses intact props');
  fishing.dispose(); club.dispose();
});

test('filtered geometry keeps its existing owner and is disposed once without disposing shared sources', async () => {
  const template = await source();
  const avatar = createClubAvatar('sword-shield-dog', 'owned-fishing-geometry', { template });
  const owned = meshes(avatar.root).map(mesh => mesh.geometry), disposed = new Map();
  let sourceDisposals = 0;
  for (const mesh of meshes(template)) mesh.geometry.addEventListener('dispose', () => sourceDisposals++);
  for (const geometry of owned) geometry.addEventListener('dispose', () => disposed.set(geometry, (disposed.get(geometry) ?? 0) + 1));
  assert.equal(removeFishingAvatarProps(avatar.root, 'sword-shield-dog'), 1876);
  assert.deepEqual(meshes(avatar.root).map(mesh => mesh.geometry), owned);
  assert.equal(disposed.size, 0, 'filtering does not dispose active geometry');
  avatar.dispose(); avatar.dispose();
  assert.equal(sourceDisposals, 0);
  assert.deepEqual(owned.map(geometry => disposed.get(geometry)), [1, 1]);
});

test('the filter does nothing for another avatar kind, even with the same template', async () => {
  const template = await source();
  const avatar = createClubAvatar('dog', 'ordinary-dog', { template });
  const before = snapshot(avatar.root);
  assert.equal(removeFishingAvatarProps(avatar.root, 'dog'), 0);
  assert.deepEqual(snapshot(avatar.root), before);
  avatar.dispose();
});

test('all other checked-in fishing species keep byte-identical geometry', async () => {
  for (const kind of ['human-jiji', 'human-subeike', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'monster-blob', 'monster-tower', 'monster-star']) {
    const template = await source(kind), before = snapshot(template);
    assert.equal(removeFishingAvatarProps(template, kind), 0, kind);
    assert.deepEqual(snapshot(template), before, kind);
  }
});
