import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFishingAvatar } from '../lib/fishing-avatar.ts';
import { createMarineModel } from '../components/fishing/MarineModels.ts';
import { FISHING_AVATAR_CATALOG } from '../lib/fishing-avatar-catalog.ts';
import { MARINE_SPECIES } from '../lib/fishing-catalog.ts';
import { catchDisplayScale } from '../lib/fishing-world.ts';
import { uploadedAvatar } from './helpers/uploaded-avatar.mjs';

test('every held catch keeps its authored dorsal direction up instead of rolling its side toward the sky', async () => {
  for (const { id } of FISHING_AVATAR_CATALOG) {
    const avatar = createFishingAvatar(id, 'orientation', { template: await uploadedAvatar(id) });
    for (const species of MARINE_SPECIES) {
      for (const cm of [species.minCm, species.maxCm]) {
        const fish = createMarineModel(species.id, cm), scale = catchDisplayScale(cm);
        fish.scale.setScalar(scale);
        avatar.prepareCatch(fish);
        const dorsal = new THREE.Vector3(0, 1, 0).applyQuaternion(fish.quaternion);
        assert.ok(dorsal.y > .999999, `${id}/${species.id}/${cm}: dorsal axis must stay up, got ${dorsal.toArray()}`);
        assert.deepEqual(fish.scale.toArray(), [scale, scale, scale]);
        if (species.id !== 'manta-ray') {
          const side = new THREE.Vector3(0, 0, 1).applyQuaternion(fish.quaternion);
          assert.ok(Math.abs(side.z) > .999999, `${species.id}: broad side should face the showcase camera`);
        }
      }
    }
    avatar.dispose();
  }
});

test('raising low front paws for upright large fish preserves arm/body mesh clearance through the haul', async () => {
  const { createFishingTriangleClearanceProbe } = await import('./helpers/fishing-triangle-clearance.mjs');
  const { sampleFishingAction } = await import('../lib/fishing-action-motion.ts');
  for (const id of ['miaocuijiao', 'feidudu']) {
    const avatar = createFishingAvatar(id, 'upright-clearance', { template: await uploadedAvatar(id) });
    const probe = createFishingTriangleClearanceProbe(avatar.root);
    for (const [species, cm] of [['pufferfish', 55], ['tuna', 160]]) {
      const fish = createMarineModel(species, cm); fish.scale.setScalar(catchDisplayScale(cm));
      const size = avatar.prepareCatch(fish);
      for (let elapsed = 0; elapsed <= 1600; elapsed += 40) {
        const pose = sampleFishingAction({ phase: 'holding', catch: { caughtAt: 1000 } }, 1000 + elapsed);
        avatar.updateFishing((1000 + elapsed) / 1000, 'holding', false, fish.scale.x * 1.6, pose, undefined, size);
        assert.equal(probe().armBody.count, 0, `${id}/${species}/${elapsed}: actual arm triangles stay outside body`);
      }
    }
    avatar.dispose();
  }
});
