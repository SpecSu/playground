import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';

async function avatar(kind: 'human-subeike' | 'frog' | 'monster-blob' = 'human-subeike') {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return createClubAvatar(kind, 'elastic-regression', { template: scene });
}

test('rubbery head recoil sweeps a much larger arc with a travelling torso wave', async () => {
  for (const kind of ['human-subeike', 'frog', 'monster-blob'] as const) {
    const figure = await avatar(kind);
    const head = figure.root.getObjectByName('head')!;
    const chest = figure.root.getObjectByName('chest')!;
    const neck = figure.root.getObjectByName('neck')!;
    const poses: THREE.Quaternion[] = [];
    let chestScaleMin = Infinity, chestScaleMax = -Infinity;
    let neckTiltSpan = 0;
    for (let frame = 0; frame <= 160; frame++) {
      figure.update(frame / 40, 'dance', false, 1);
      poses.push(head.quaternion.clone());
      chestScaleMin = Math.min(chestScaleMin, chest.scale.y);
      chestScaleMax = Math.max(chestScaleMax, chest.scale.y);
      neckTiltSpan = Math.max(neckTiltSpan, Math.abs(new THREE.Euler().setFromQuaternion(neck.quaternion).x));
    }
    const span = Math.max(...poses.flatMap((a) => poses.map((b) => a.angleTo(b))));
    assert.ok(span > 1.45, `${kind} head recoil exceeds 83 degrees, got ${span}`);
    assert.ok(chestScaleMax - chestScaleMin > 0.07, `${kind} flowing stretch reaches the chest, not only the face`);
    assert.ok(neckTiltSpan > 0.1, `${kind} neck visibly follows the torso wave`);
    figure.dispose();
  }
});

function skin(figure: Awaited<ReturnType<typeof avatar>>) {
  const result: number[] = [];
  const point = new THREE.Vector3();
  figure.root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    // Real deformed vertices, including small face/hand details, not bone origins.
    for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
      node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
      result.push(point.x, point.y, point.z);
    }
  });
  return result;
}

test('squash, takeoff and touchdown have continuous skinned-vertex velocity', async () => {
  const figure = await avatar('frog');
  const h = 0.0001;
  const pose = { kind: 'unison' as const, phase: 'perform' as const, weight: 1, wave: 0, beat: 0 };
  for (const beat of [0.01, 0.13, 0.16, 0.25, 0.68, 0.88, 1]) {
    const frames = [-h, 0, h].map((offset) => {
      figure.update(0, 'bounce', false, 1, undefined, { ...pose, beat: beat + offset });
      return skin(figure);
    });
    const velocityChange = Math.max(...frames[0].map((value, i) => Math.abs(frames[2][i] - 2 * frames[1][i] + value) / h));
    assert.ok(velocityChange < 0.12, `beat ${beat} has no rigid takeoff/landing snap: velocity change ${velocityChange}`);
  }
  figure.dispose();
});

test('cockatoo has a bigger delayed head recoil while keeping its scratch hands on the decks', async () => {
  const bytes = readFileSync(new URL('../public/avatars/dj-cockatoo.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const figure = createClubAvatar('dj-cockatoo', 'elastic-dj', { template: scene, mode: 'dj' });
  const poses: THREE.Quaternion[] = [];
  for (let frame = 0; frame < 80; frame++) {
    figure.update(frame / 40, 'dance', false, 1);
    poses.push(figure.root.getObjectByName('head')!.quaternion.clone());
    for (const side of ['L', 'R']) {
      const hand = figure.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3());
      assert.ok(hand.y >= 1.14 && hand.y <= 1.19 && hand.z >= .40 && hand.z <= .56, 'scratch remains locked to the deck surface');
    }
  }
  assert.ok(Math.max(...poses.flatMap((a) => poses.map((b) => a.angleTo(b)))) > .95, 'DJ head has a distinctly larger whipping arc');
  figure.dispose();
});
