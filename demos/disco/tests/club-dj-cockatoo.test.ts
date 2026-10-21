import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { AVATAR_PRESETS, CANONICAL_AVATAR_PRESETS } from '../lib/room-types.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';

async function decode(path: string) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

test('resident Kunkun is DJ-only and preserves participant capacity and booth geometry', () => {
  const requests: { kind: string; mode?: string }[] = [];
  const world = makeClubWorld({ createAvatar(kind, _id, options) {
    requests.push({ kind, mode: options?.mode });
    return { root: new THREE.Group(), height: 2.8, labelHeight: 3, footprintRadius: .7, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} };
  } });
  assert.deepEqual(requests.find((request) => request.mode === 'dj'), { kind: 'dj-kunkun', mode: 'dj' });
  assert.equal(CANONICAL_AVATAR_PRESETS.length, 12);
  assert.equal(AVATAR_PRESETS.length, 20);
  assert.ok(!(AVATAR_PRESETS as readonly string[]).includes('dj-kunkun'));
  assert.ok(!(AVATAR_PRESETS as readonly string[]).includes('dj-cockatoo'));
  assert.equal(world.ambient.length, 5);
  assert.equal(world.scene.getObjectByName('central-dj-booth')?.position.length(), 0);
  world.dispose();
});

test('legacy cockatoo fixture drives an independent crest while wing tips scratch the unchanged mixer plane', async () => {
  const source = await decode('../public/avatars/dj-cockatoo.glb');
  const avatar = createClubAvatar('dj-cockatoo', 'crest-contract', { mode: 'dj', template: source });
  avatar.root.position.set(2, 0, -3); avatar.root.rotation.y = .7;
  const poses: THREE.Quaternion[] = [];
  const wingZ: number[] = [];
  for (let beat = 0; beat < 4; beat += .0625) {
    avatar.update(beat, 'dance', false, 1);
    poses.push(avatar.root.getObjectByName('crest')!.quaternion.clone());
    for (const side of ['L', 'R']) {
      const tip = avatar.root.worldToLocal(avatar.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()));
      assert.ok(tip.y >= 1.14 && tip.y <= 1.19, 'wing tips stay on the mixer surface');
      assert.ok(tip.z >= .40 && tip.z <= .56);
      assert.ok(Math.abs(Math.abs(tip.x) - .72) <= .065);
      if (side === 'L') wingZ.push(tip.z);
    }
  }
  assert.ok(Math.max(...poses.map((pose) => pose.angleTo(poses[0]))) > .25, 'yellow crest bobs independently of the head');
  assert.ok(Math.max(...wingZ) - Math.min(...wingZ) > .1, 'wing tips visibly scratch forward and back');
  assert.deepEqual(avatar.root.position.toArray(), [2, 0, -3]);
  assert.equal(avatar.root.rotation.y, .7);
  avatar.update(1, 'dance', true, 1);
  const quiet = avatar.root.getObjectByName('crest')!.quaternion.clone();
  avatar.update(4, 'spin', true, .2);
  assert.ok(quiet.equals(avatar.root.getObjectByName('crest')!.quaternion));
  avatar.dispose();
});

test('legacy cockatoo fixture skin remains inside the existing DJ reservation and is framed at phone and desktop sizes', async () => {
  const { ClubCameraController, DEFAULT_CAMERA_ORBIT } = await import('../lib/club-camera.ts');
  const { stagePosition } = await import('../lib/club-scene-math.ts');
  const { CLUB_BOOTH_BOUNDS } = await import('../lib/club-scene-motion.ts');
  const source = await decode('../public/avatars/dj-cockatoo.glb');
  const avatar = createClubAvatar('dj-cockatoo', 'house-dj', { mode: 'dj', template: source });
  assert.ok(avatar.height >= 2.65 && avatar.height <= 3.0, 'legacy cockatoo fixture is deliberately taller than the ordinary cast');
  const point = new THREE.Vector3(), local = new THREE.Vector3(), projected = new THREE.Vector3();
  const cameraController = new ClubCameraController();
  const cameras = [[390, 620], [390, 420], [1440, 900]].map(([width, height]) => cameraController.update({ width, height, mode: 'overview', orbit: DEFAULT_CAMERA_ORBIT, subject: null, deltaSeconds: 0, reducedMotion: true }).clone());
  const location = stagePosition(0, -.55);
  avatar.root.position.set(location.x, 0, location.z); avatar.root.rotation.y = Math.PI / 4;
  let checked = 0;
  for (let beat = 0; beat < 8; beat += .0625) {
    avatar.update(beat, 'dance', false, 1);
    const inverse = avatar.root.matrixWorld.clone().invert();
    for (const side of ['L', 'R']) {
      const tip = avatar.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
      assert.ok(tip.y >= 1.14 && tip.y <= 1.19 && tip.z >= .40 && tip.z <= .56, `authored ${side} wing reaches the decks`);
      assert.ok(Math.abs(Math.abs(tip.x) - .72) <= .065);
    }
    avatar.root.traverseVisible((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        local.copy(point).applyMatrix4(inverse);
        assert.ok(local.y >= -.025, `bird floor clearance ${local.y}`);
        assert.ok(local.x >= CLUB_BOOTH_BOUNDS.minU && local.x <= CLUB_BOOTH_BOUNDS.maxU, 'white wings stay in the protected DJ width');
        assert.ok(local.z - .55 >= CLUB_BOOTH_BOUNDS.minV && local.z - .55 <= CLUB_BOOTH_BOUNDS.maxV, `head, crest and tail fit the unchanged DJ depth: ${local.z}`);
        for (const camera of cameras) {
          projected.copy(point).project(camera);
          assert.ok(Math.abs(projected.x) < .94 && Math.abs(projected.y) < .94 && projected.z > -1 && projected.z < 1, 'oversized DJ is visible in the existing overview framing');
        }
        checked++;
      }
    });
  }
  assert.ok(checked > 100_000, 'checks actual animated mesh vertices, not only joint centers');
  avatar.dispose();
});

test('the legacy cockatoo fixture has real wing and crest skin weights and independent reduced-motion poses', async () => {
  const source = await decode('../public/avatars/dj-cockatoo.glb');
  const a = createClubAvatar('dj-cockatoo', 'bird-pose', { mode: 'dj', template: source });
  const b = createClubAvatar('dj-cockatoo', 'bird-pose', { mode: 'dj', template: source });
  const influenced = new Set<string>();
  let triangles = 0;
  source.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    for (let i = 0; i < indices.count; i++) {
      let total = 0;
      for (let j = 0; j < 4; j++) {
        const weight = weights.getComponent(i, j); total += weight;
        if (weight > .01) influenced.add(node.skeleton.bones[indices.getComponent(i, j)].name);
      }
      assert.ok(Math.abs(total - 1) < .0001);
    }
  });
  for (const bone of ['head', 'crest', 'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R']) assert.ok(influenced.has(bone), `${bone} deforms actual bird geometry`);
  assert.ok(triangles < 20_000);
  const state = (root: THREE.Object3D) => {
    const result: number[] = [];
    root.traverse((node) => { if (node instanceof THREE.Bone) result.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()); });
    return result;
  };
  a.update(7.3, 'dance', false, 1);
  b.update(1.2, 'dance', false, .2); b.update(7.3, 'dance', false, 1);
  assert.deepEqual(state(a.root), state(b.root));
  a.update(1, 'dance', true, 1); const quiet = state(a.root);
  a.update(80, 'spin', true, .1); assert.deepEqual(state(a.root), quiet);
  a.dispose(); b.dispose();
});

test('legacy cockatoo binary matches the reviewed compact asset metadata', () => {
  const bytes = readFileSync(new URL('../public/avatars/dj-cockatoo.glb', import.meta.url));
  const metadata = JSON.parse(readFileSync(new URL('../scripts/avatars/cockatoo/asset-metadata.json', import.meta.url), 'utf8'));
  assert.equal(bytes.byteLength, metadata.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  assert.equal(metadata.joints, 19);
  assert.equal(metadata.material_groups, 4);
});
