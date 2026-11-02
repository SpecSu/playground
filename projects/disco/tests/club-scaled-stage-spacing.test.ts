import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { ClubDanceStaging } from '../lib/club-dance-staging.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';

function stageBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      const u = (point.x - point.z) * Math.SQRT1_2;
      const v = (point.x + point.z) * Math.SQRT1_2;
      bounds.expandByPoint(new THREE.Vector3(u, point.y, v));
    }
  });
  return bounds;
}

for (const kind of UPLOADED_CAST) test(`twofold ${kind} stage crowd has no intersecting quiet skin bounds`, async () => {
  const template = await uploadedTemplate(kind);
  const rigs = Array.from({ length: 10 }, (_, slot) => {
    const model = createClubAvatar(kind, `spacing:${slot}`, { template });
    const root = new THREE.Group(); root.scale.setScalar(2); root.add(model.root);
    return { id: `spacing:${slot}`, name: kind, slot, preset: kind, root, model, shadow: new THREE.Mesh(), halo: new THREE.Mesh(), ambient: true, isOwn: false, desiredVisible: true, action: 'dance', motion: { slot, x: 0, z: 0, heading: 0, speed: 0, distance: 0, walkBlend: 0, action: 'dance' } } as AvatarRig;
  });
  const stage = new ClubDanceStaging();
  try {
    stage.apply(rigs, null, 0, true, 1, 1000, null);
    const bounds = rigs.map(rig => stageBounds(rig.model.root));
    for (let a = 0; a < bounds.length; a++) for (let b = a + 1; b < bounds.length; b++) {
      assert.ok(!bounds[a].intersectsBox(bounds[b]), `${kind}: crowd ${a}/${b} have separated actual skin envelopes`);
    }
    if (['milk-frog', 'niulai', 'miaocuijiao', 'sword-shield-dog'].includes(kind)) {
      const round = { id: 'spacing', seed: 'spacing', startsAt: 1000, endsAt: 61000 };
      for (const now of [3300, 3810, 4350, 5120, 6100, 7350]) {
        stage.apply(rigs, null, (now - 1000) / 500, false, 1, now, null, round);
        const dancing = rigs.map(rig => stageBounds(rig.model.root));
        for (let a = 0; a < dancing.length; a++) for (let b = a + 1; b < dancing.length; b++) {
          assert.ok(!dancing[a].intersectsBox(dancing[b]), `${kind}/${now}: crowd ${a}/${b} retain space during chart motion`);
        }
      }
    }
  } finally { stage.restore(); rigs.forEach(rig => rig.model.dispose()); }
});
