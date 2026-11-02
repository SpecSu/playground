import { MOVEMENT_SPEED_LIMIT } from '../lib/room-movement.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';

const MEME_KINDS = ['banana-cat', 'sword-shield-dog'] as const;
async function source(kind: string) {
  const directory = process.env.MEME_ASSET_DIR;
  const bytes = readFileSync(directory && (MEME_KINDS as readonly string[]).includes(kind) ? resolve(directory, `${kind}.glb`) : new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const coreVertexMask = (root: THREE.Object3D) => {
  const core = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
  const masks = new Map<THREE.Mesh, boolean[]>();
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    masks.set(node, Array.from({ length: indices.count }, (_, vertex) => {
      let weight = 0;
      for (let channel = 0; channel < 4; channel++) {
        if (core.has(node.skeleton.bones[indices.getComponent(vertex, channel)]?.name)) weight += weights.getComponent(vertex, channel);
      }
      return weight >= .5;
    }));
  });
  return masks;
};
const boneState = (root: THREE.Object3D) => {
  const state: Record<string, number[]> = {};
  root.traverse(node => { if (node instanceof THREE.Bone) state[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]; });
  return state;
};

test('banana cat sways and sword-shield dog waddles with distinct torso mechanics at the same shared beat', async () => {
  // One existing animal template isolates choreography from different geometry.
  const template = await source('cat');
  const signatures = [];
  for (const kind of MEME_KINDS) {
    const avatar = createClubAvatar(kind, 'same-meme-dancer', { template });
    const samples = [];
    for (const beat of [.17, .53, 1.27, 2.6]) {
      avatar.update(beat, 'dance', false, 1, undefined, { kind: 'wave', version: 2, phase: 'perform', beat, weight: 1, wave: .4 });
      const state = boneState(avatar.root);
      samples.push(['hips', 'spine', 'chest', 'neck', 'head'].map(name => state[name]));
    }
    signatures.push(JSON.stringify(samples));
    avatar.dispose();
  }
  assert.equal(new Set(signatures).size, 2, 'new silhouettes need their own torso motion, not a shared generic biped');
});

test('short meme arms keep restrained joint excursions during personal and collective actions', async () => {
  const template = await source('cat');
  for (const kind of MEME_KINDS) {
    const avatar = createClubAvatar(kind, 'meme-held-props', { template });
    for (const action of ['dance', 'bounce', 'spin', 'wave'] as const) for (const beat of [.17, .53, 1.27, 2.6, 3.3]) {
      for (const group of [undefined, 'wave', 'battle', 'grid', 'train', 'unison'] as const) {
        const groupPose = group ? { kind: group, version: 2 as const, phase: 'perform' as const, beat, weight: 1, wave: 1, activation: 1 } : undefined;
        avatar.update(beat, action, false, 1, undefined, groupPose);
        for (const side of ['L', 'R']) for (const joint of ['upperArm', 'forearm', 'hand']) {
          const name = `${joint}_${side}`;
          const angle = avatar.root.getObjectByName(name)!.quaternion.angleTo(template.getObjectByName(name)!.quaternion);
          assert.ok(angle <= (kind === 'sword-shield-dog' ? .65 : 1.1), `${kind}/${action}/${group}/${name} holds its compact silhouette: ${angle}`);
        }
      }
    }
    avatar.dispose();
  }
});

for (const kind of MEME_KINDS) test(`${kind} keeps real animated skin above the floor and inside its one-metre route envelope`, async (t) => {
  const avatar = createClubAvatar(kind, `meme-envelope:${kind}`, { template: await source(kind) });
  const point = new THREE.Vector3();
  const coreMask = coreVertexMask(avatar.root);
  let peakY = 0, minY = Infinity, maxCoreRadius = 0, maxRadius = 0;
  try {
    for (const mode of ['dance', 'bounce', 'spin', 'wave', 'group-wave', 'battle', 'grid', 'train', 'unison'] as const) {
      for (const activation of [0, .5, 1]) for (let beat = 0; beat < 4; beat += .125) {
        const personal = mode === 'dance' || mode === 'bounce' || mode === 'spin' || mode === 'wave';
        const groupPose = personal ? undefined : { kind: mode === 'group-wave' ? 'wave' as const : mode, version: 2 as const, phase: 'perform' as const, beat, weight: 1, wave: (1 - Math.cos(beat * Math.PI * 2)) / 2, activation };
        if (personal && activation !== 1) continue;
        avatar.update(beat, personal ? mode : 'dance', false, 1, undefined, groupPose);
        const airborneFlip = (mode === 'wave' || mode === 'battle') && avatar.groundLift > 0;
        if (airborneFlip) assert.deepEqual(avatar.root.getObjectByName('avatar-animation-pivot')!.scale.toArray(), [1, 1, 1], `${kind}/${mode}/${beat} keeps its full authored size`);
        avatar.root.traverseVisible(node => {
          if (!(node instanceof THREE.Mesh)) return;
          for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
            node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
            peakY = Math.max(peakY, point.y); minY = Math.min(minY, point.y);
            maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.z));
            if (coreMask.get(node)?.[vertex]) maxCoreRadius = Math.max(maxCoreRadius, Math.hypot(point.x, point.z));
            assert.ok(Number.isFinite(point.x + point.y + point.z), `${kind}/${mode}/${beat} finite skin`);
            assert.ok(point.y >= -.025, `${kind}/${mode}/${activation}/${beat} actual skin clears floor: ${point.y}`);
            assert.ok(Math.hypot(point.x, point.z) <= 1, `${kind}/${mode}/${activation}/${beat} actual skin remains in its safe route envelope: ${Math.hypot(point.x, point.z)}`);
            // Full-size inversion uses the one-metre envelope above booth height.
            // Grounded frames, every other action, and low airborne core points
            // still retain the original physical booth clearance requirement.
            if (coreMask.get(node)?.[vertex] && (!airborneFlip || point.y <= 1.12)) assert.ok(Math.hypot(point.x, point.z) <= .65, `${kind}/${mode}/${activation}/${beat} solid body clears the physical booth envelope: ${Math.hypot(point.x, point.z)}`);
          }
        });
      }
    }
    t.diagnostic(JSON.stringify({ kind, restHeight: avatar.height, peakY, minY, maxCoreRadius, maxRadius }));
  } finally { avatar.dispose(); }
});

for (const kind of MEME_KINDS) test(`${kind} has lively rubber deformation, deterministic seeking and a quiet reduced-motion pose`, async () => {
  const avatar = createClubAvatar(kind, `meme-bounce:${kind}`, { template: await source(kind) });
  const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!;
  const head = avatar.root.getObjectByName('head')!;
  let bodyMin = 1, bodyMax = 1, headMin = 1, headMax = 1;
  try {
    for (let beat = 0; beat < 4; beat += .0625) {
      avatar.update(beat, 'bounce', false, 1);
      bodyMin = Math.min(bodyMin, pivot.scale.y); bodyMax = Math.max(bodyMax, pivot.scale.y);
      headMin = Math.min(headMin, head.scale.y); headMax = Math.max(headMax, head.scale.y);
    }
    assert.ok(bodyMax - bodyMin > .18, `${kind} compresses and rebounds visibly`);
    assert.ok(headMax - headMin > .15, `${kind} has independent elastic head movement`);
    avatar.update(.31, 'dance', false, .7); const first = boneState(avatar.root);
    avatar.update(90, 'wave', false, 1); avatar.update(.31, 'dance', false, .7);
    assert.deepEqual(boneState(avatar.root), first);
    avatar.update(.1, 'bounce', true, 1); const quiet = boneState(avatar.root);
    avatar.update(27, 'wave', true, .1);
    assert.deepEqual(boneState(avatar.root), quiet);
    assert.deepEqual(pivot.scale.toArray(), [1, 1, 1]);
  } finally { avatar.dispose(); }
});

for (const kind of MEME_KINDS) test(`${kind} stays finite, grounded and compact through maximum-speed manual turns`, async () => {
  const { ManualWalkTrail } = await import('../lib/club-manual-motion.ts');
  const avatar = createClubAvatar(kind, 'meme-manual-turn', { template: await source(kind) });
  const trail = new ManualWalkTrail({ x: -3, z: 3 }, Math.PI / 2);
  const point = new THREE.Vector3();
  const coreMask = coreVertexMask(avatar.root);
  try {
    for (let frame = 1; frame <= 40; frame++) {
      const location = frame < 20 ? { x: -3 + frame * (MOVEMENT_SPEED_LIMIT/40), z: 3 } : { x: -3 + 19*(MOVEMENT_SPEED_LIMIT/40), z: 3 + (frame - 19) * (MOVEMENT_SPEED_LIMIT/40) };
      const heading = frame < 20 ? Math.PI / 2 : 0;
      trail.append(location, heading);
      const motion = trail.motion(0, location, heading, MOVEMENT_SPEED_LIMIT, 'dance');
      avatar.root.position.set(location.x, 0, location.z); avatar.root.rotation.y = heading;
      avatar.update(frame / 40, 'dance', false, 1, motion);
      avatar.root.traverseVisible(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
          node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
          assert.ok(Number.isFinite(point.x + point.y + point.z), `${kind} finite manual skin`);
          assert.ok(point.y >= -.04, `${kind}/${frame} feet do not sink: ${point.y}`);
          assert.ok(Math.hypot(point.x - location.x, point.z - location.z) <= 1, `${kind}/${frame} manual skin stays in its safe route envelope`);
          if (coreMask.get(node)?.[vertex]) assert.ok(Math.hypot(point.x - location.x, point.z - location.z) <= .65, `${kind}/${frame} solid body clears the physical booth envelope: ${Math.hypot(point.x - location.x, point.z - location.z)}`);
        }
      });
    }
  } finally { avatar.dispose(); }
});

test('banana cat short legs absorb the exact unison landing without driving the peel below ground', async () => {
  const avatar = createClubAvatar('banana-cat', 'species-probe:banana-cat', { template: await source('banana-cat') });
  const point = new THREE.Vector3();
  try {
    const beats = [11 / 6, ...Array.from({ length: 31 }, (_, index) => 1.65 + index * .01)];
    for (const beat of beats) {
      avatar.update(beat, 'dance', false, 1, undefined, { kind: 'unison', version: 2, phase: 'perform', beat, weight: 1, wave: .25, activation: 1 });
      let minY = Infinity;
      avatar.root.traverseVisible(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
          node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
          minY = Math.min(minY, point.y);
        }
      });
      assert.ok(minY >= -.025, `short-leg unison landing ${beat} remains above ground: ${minY}`);
    }
  } finally { avatar.dispose(); }
});

test('banana cat long torso keeps compounded elastic height below thirty percent through takeoff', async () => {
  const avatar = createClubAvatar('banana-cat', 'bounds-test', { template: await source('banana-cat') });
  const bounds = new THREE.Box3(), size = new THREE.Vector3();
  try {
    for (const mode of ['bounce', 'unison', 'grid'] as const) {
      for (const beat of [1.3, ...Array.from({ length: 96 }, (_, index) => index / 24)]) {
        const groupPose = mode === 'bounce' ? undefined : { kind: mode, version: 2 as const, phase: 'perform' as const, beat, weight: 1, wave: 1, activation: 1 };
        avatar.update(beat, 'bounce', false, 1, undefined, groupPose);
        bounds.setFromObject(avatar.root, true); bounds.getSize(size);
        assert.ok(size.y < avatar.height * 1.3, `${mode}/${beat} limits compound torso stretch: ${size.y / avatar.height}`);
      }
    }
  } finally { avatar.dispose(); }
});
