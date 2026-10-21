import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createYachtWorld } from '../lib/fishing-world.ts';
import { FishingCameraController } from '../lib/fishing-camera.ts';
import { createFishingSeaLife, sampleFishingSeaLife } from '../lib/fishing-sea-life.ts';

const VIEWPORTS = [[390, 758], [1440, 900]];
// The production surface is -.17 plus waves with amplitudes .22, .13 and .065.
// Testing both full-amplitude extremes conservatively covers arbitrary wave phase.
const WATER_EXTREMES = [-.17 - .22 - .13 - .065, -.17 + .22 + .13 + .065];
const EVENT_NAMES = { dolphins: 'Dolphin pod', shark: 'Shark fin visit', whale: 'Whale visit' };
const point = new THREE.Vector3(), projected = new THREE.Vector3();

function overviewFixture(width, height) {
  const world = createYachtWorld();
  // Match YachtScene: capture only the authored yacht before adding scenery or anglers.
  const overviewBounds = new THREE.Box3().setFromObject(world.yacht), overviewHull = [];
  const hull = world.scene.getObjectByName('Sculpted ivory hull');
  const positions = hull.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    overviewHull.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(hull.matrixWorld));
  }
  const pose = new FishingCameraController().update({ overviewBounds, overviewHull, mode: 'overview' }, 35, width / height);
  const camera = new THREE.PerspectiveCamera(35, width / height, .15, 240);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  // The production 66px overview offset materially affects the top edge.
  camera.setViewOffset(width, height, 0, 66, width, height);
  camera.updateMatrixWorld();
  return { world, camera, overviewBounds, overviewHull, pose };
}

function measure(root, camera) {
  const bounds = new THREE.Box3(), ndc = new THREE.Box3();
  let vertices = 0, radialMinimum = Infinity;
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    const positions = object.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      bounds.expandByPoint(point);
      radialMinimum = Math.min(radialMinimum, Math.hypot(point.x, point.z));
      if (camera) ndc.expandByPoint(projected.copy(point).project(camera));
      vertices++;
    }
  });
  return { bounds, ndc, vertices, radialMinimum };
}

function fullyFramed(measured) {
  return measured.vertices > 0 && ['x', 'y', 'z'].every(axis =>
    measured.ndc.min[axis] >= -1 && measured.ndc.max[axis] <= 1);
}

function firstCycleEnd() {
  for (let second = 1; second <= 180; second++) {
    if (sampleFishingSeaLife(second).kind === 'whale') return second + 10;
  }
  assert.fail('a whale event must occur within three active minutes');
}

for (const [width, height] of VIEWPORTS) {
  test(`${width}x${height} production overview frames every dolphin, shark and complete whale effect`, () => {
    const { world, camera } = overviewFixture(width, height), seen = new Set();
    try {
      for (const water of WATER_EXTREMES) {
        const sea = createFishingSeaLife(() => water);
        world.scene.add(sea.root); sea.update(0);
        try {
          for (let step = 0; step < firstCycleEnd() * 10; step++) {
            const time = step / 10; sea.update(time);
            if (sea.state.kind === 'none') continue;
            const name = `${sea.state.kind}:${sea.state.stage}`;
            const measured = measure(sea.root.getObjectByName(EVENT_NAMES[sea.state.kind]), camera);
            seen.add(name);
            // All vertices of visible drawables, including submerged body geometry,
            // are a stronger enclosure than just the surfaced animal silhouette.
            assert.ok(fullyFramed(measured), `${name} at ${time}s / water ${water}: NDC ${measured.ndc.min.toArray()} to ${measured.ndc.max.toArray()}`);
          }
        } finally { sea.dispose(); }
      }
      assert.deepEqual([...seen].sort(), ['dolphins:swim', 'shark:swim', 'whale:breach', 'whale:splash', 'whale:spout']);
    } finally { world.dispose(); }
  });

  test(`${width}x${height} default overview has two fully framed, readable-sized boats`, () => {
    const { world, camera } = overviewFixture(width, height);
    try {
      for (const water of WATER_EXTREMES) {
        const sea = createFishingSeaLife(() => water);
        world.scene.add(sea.root); sea.update(0);
        try {
          for (let time = 0; time <= 180; time += 2) {
            sea.update(time);
            const framed = sea.boats.filter(boat => {
              const measured = measure(boat.root, camera);
              if (!fullyFramed(measured)) return false;
              const pixels = measured.ndc.getSize(new THREE.Vector3());
              return pixels.x * width / 2 >= 20 && pixels.y * height / 2 >= 20;
            });
            assert.ok(framed.length >= 2, `two complete boat silhouettes at ${time}s / water ${water}`);
            assert.ok(framed.some(boat => boat.root.userData.kind === 'sailboat'));
            assert.ok(framed.some(boat => boat.root.userData.kind === 'speedboat'));
          }
        } finally { sea.dispose(); }
      }
    } finally { world.dispose(); }
  });
}

test('scenery preserves the authored yacht bounds and existing overview camera fit', () => {
  const expected = [
    [24.420615699226268, 33.08848462335972, 35.695514992710905],
    [17.503916675246096, 24, 25.585404062200027],
  ];
  for (let i = 0; i < VIEWPORTS.length; i++) {
    const [width, height] = VIEWPORTS[i], fixture = overviewFixture(width, height);
    const { world, camera, overviewBounds, overviewHull, pose } = fixture;
    const sea = createFishingSeaLife(world.waterHeightAt);
    try {
      world.scene.add(sea.root);
      assert.equal(sea.root.parent, world.scene, 'scenery must not expand yacht-fit geometry');
      assert.ok(overviewBounds.equals(new THREE.Box3().setFromObject(world.yacht)));
      assert.ok(camera.position.distanceTo(new THREE.Vector3(...expected[i])) < 1e-9, 'existing camera fit is unchanged');
      const next = new FishingCameraController().update({ overviewBounds, overviewHull, mode: 'overview' }, camera.fov, width / height);
      assert.deepEqual(next, pose);
      assert.equal(camera.view.offsetY, 66);
    } finally { sea.dispose(); world.dispose(); }
  }
});

test('animal bodies clear the yacht and decorative boats throughout each event', () => {
  const world = createYachtWorld(), sea = createFishingSeaLife(world.waterHeightAt);
  world.scene.add(sea.root); sea.update(0);
  try {
    for (let step = 0; step < firstCycleEnd() * 10; step++) {
      const time = step / 10; sea.update(time);
      if (sea.state.kind === 'none' || sea.state.stage === 'splash') continue;
      // Expanding splash rings may pass under a nearby boat; the animal body may not.
      const root = sea.root.getObjectByName(sea.state.kind === 'whale' ? 'Whale body' : EVENT_NAMES[sea.state.kind]);
      const animal = measure(root);
      assert.ok(animal.radialMinimum > 12, `${sea.state.kind} body clears the yacht/cast area at ${time}s`);
      for (const boat of sea.boats) {
        const boatBounds = measure(boat.root).bounds;
        const separateHorizontally = animal.bounds.max.x < boatBounds.min.x || animal.bounds.min.x > boatBounds.max.x
          || animal.bounds.max.z < boatBounds.min.z || animal.bounds.min.z > boatBounds.max.z;
        assert.ok(separateHorizontally, `${sea.state.kind} body clears ${boat.root.userData.kind} at ${time}s`);
      }
    }
  } finally { sea.dispose(); world.dispose(); }
});
