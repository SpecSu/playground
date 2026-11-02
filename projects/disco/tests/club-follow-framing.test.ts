import './room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { makeClubWorld } from '../lib/club-scene-world.ts';
import { CAMERA_FOV, ClubCameraController, thirdPersonCameraPose } from '../lib/club-camera.ts';
import { UPLOADED_CAST, uploadedTemplate } from './helpers/uploaded-avatar.ts';

function skinPositions(root: THREE.Object3D): number[] {
  root.parent?.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true);
  const positions: number[] = [], point = new THREE.Vector3();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
    for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
      node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
  });
  return positions;
}

function projectedBounds(positions: readonly number[], camera: THREE.Camera) {
  const point = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    point.fromArray(positions, index).project(camera);
    assert.ok([point.x, point.y, point.z].every(Number.isFinite) && point.z > -1 && point.z < 1);
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  return { x: Math.max(-minX, maxX), y: Math.max(-minY, maxY), top: maxY, bottom: minY, width: maxX - minX, height: maxY - minY };
}

/** Frozen v0.5.0 follow equation: later framing changes cannot move this baseline. */
function originalFollowCamera(height: number, radius: number, position: THREE.Vector3, heading: number, aspect: number) {
  const distance = Math.max(3.4, height * 3.05, radius / (Math.tan(THREE.MathUtils.degToRad(26)) * aspect) * 1.45 + radius);
  const direction = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const origin = position.clone().addScaledVector(direction, -distance); origin.y += height * 1.2;
  const target = position.clone().addScaledVector(direction, height * .7); target.y += height * .88;
  const camera = new THREE.PerspectiveCamera(52, aspect, .08, 80);
  camera.position.copy(origin); camera.lookAt(target); camera.updateMatrixWorld();
  return camera;
}

async function worldFor(kind: typeof UPLOADED_CAST[number]) {
  const model = createClubAvatar(kind, 'follow-self', { template: await uploadedTemplate(kind) });
  const world = makeClubWorld({ createAvatar(_preset, id) {
    return id === 'follow-self' ? model : { root: new THREE.Group(), height: 1.5, labelHeight: 2, footprintRadius: .6, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} };
  } });
  world.syncParticipants([{ id: 'follow-self', name: 'Self', preset: kind, slot: 0, joinedAt: 0, lastSeenAt: 0, action: 'dance', actionAt: 0 }], 'follow-self');
  return { world, model, root: world.players.get('follow-self')!.root };
}

test('follow framing contains the actual enlarged frog while a bounce changes height and width', async () => {
  const { world, model } = await worldFor('milk-frog');
  try {
    const camera = new ClubCameraController();
    for (const [beat, aspect] of [[.25, .7], [.625, .4]]) {
      model.update(beat, 'bounce', false, 1);
      const actual = skinPositions(model.root);
      const bounds = projectedBounds(actual, camera.update({ width: aspect * 700, height: 700, mode: 'third-person', orbit: { yaw: 0, pitch: 0 }, subject: world.getCameraSubject('follow-self'), deltaSeconds: .025, reducedMotion: false }));
      assert.ok(bounds.x < .99 && bounds.top < .70 && bounds.bottom > -.94, `bounce ${beat}/${aspect}: actual skin needs full framing below the nameplate, got ${JSON.stringify(bounds)}`);
    }
  } finally { world.dispose(); }
});

for (const kind of UPLOADED_CAST) test(`${kind}: actual follow-view skin stays framed through dance, bounce and backflip`, async context => {
  const { world, model } = await worldFor(kind);
  let worstX = 0, worstY = 0, highest = -Infinity, lowest = Infinity;
  try {
    for (const action of ['dance', 'bounce', 'wave'] as const) for (let frame = 0; frame <= 32; frame++) {
      model.update(frame / 8, action, false, 1);
      const actual = skinPositions(model.root), subject = world.getCameraSubject('follow-self')!;
      for (const aspect of [.4, .7, 1.8]) {
        const pose = thirdPersonCameraPose(subject, aspect, { yaw: 0, pitch: 0 });
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, .08, 80);
        camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
        const bounds = projectedBounds(actual, camera);
        worstX = Math.max(worstX, bounds.x); worstY = Math.max(worstY, bounds.y);
        highest = Math.max(highest, bounds.top); lowest = Math.min(lowest, bounds.bottom);
        assert.ok(bounds.x < .99 && bounds.top < .70 && bounds.bottom > -.94, `${kind}/${action}/${frame / 8}/${aspect}: ${JSON.stringify(bounds)}`);
      }
    }
    context.diagnostic(JSON.stringify({ kind, poses: 99, projections: 297, worstX, worstY, highest, lowest }));
  } finally { world.dispose(); }
});

test('quiet front-follow framing respects the requested pullback with a small cached skin-probe budget', async context => {
  let minimumWidth = Infinity, minimumHeight = Infinity, maximumProbes = 0;
  for (const kind of UPLOADED_CAST) {
    const { world, model, root } = await worldFor(kind);
    try {
      model.update(0, 'dance', true);
      root.scale.setScalar(1);
      const native = skinPositions(model.root);
      root.scale.setScalar(CLUB_AVATAR_SCALE);
      const enlarged = skinPositions(model.root), subject = world.getCameraSubject('follow-self')!;
      for (const aspect of [.4, .7, 1.8]) {
        const baseline = projectedBounds(native, originalFollowCamera(model.height, model.footprintRadius, root.position, root.rotation.y, aspect));
        const pose = thirdPersonCameraPose(subject, aspect, { yaw: 0, pitch: 0 });
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, .08, 80);
        camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
        const current = projectedBounds(enlarged, camera);
        const width = current.width / baseline.width, height = current.height / baseline.height;
        minimumWidth = Math.min(minimumWidth, width); minimumHeight = Math.min(minimumHeight, height);
        // The requested successive 20% and 30% pullbacks supersede the close-view minimum.
        const minimum = CLUB_AVATAR_SCALE * .7 / (1.2 * 1.3);
        assert.ok(width >= minimum && height >= minimum, `${kind}/${aspect}: preserve physical enlargement with the requested pullback, got ${width} × ${height}`);
      }
      let probes = 0, vertices = 0;
      const restore: (() => void)[] = [];
      model.root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        vertices += node.geometry.attributes.position.count;
        const original = node.getVertexPosition;
        node.getVertexPosition = function(index, target) { probes++; return original.call(this, index, target); };
        restore.push(() => { node.getVertexPosition = original; });
      });
      try { thirdPersonCameraPose(subject, .4, { yaw: 0, pitch: 0 }); } finally { restore.forEach(reset => reset()); }
      maximumProbes = Math.max(maximumProbes, probes);
      assert.ok(probes > 0 && probes < 1000 && probes < vertices / 5, `${kind}: ${probes} camera probes versus ${vertices} skin vertices`);
    } finally { world.dispose(); }
  }
  context.diagnostic(JSON.stringify({ minimumWidth, minimumHeight, maximumProbes }));
});

test('world follow subjects carry one scaled hop offset while their navigation position stays grounded', async () => {
  const { world, model, root } = await worldFor('milk-frog');
  try {
    model.update(.25, 'bounce', false, 1);
    const subject = world.getCameraSubject('follow-self')!;
    assert.ok(model.groundLift > 0);
    assert.equal(subject.groundLift, model.groundLift * CLUB_AVATAR_SCALE);
    assert.equal(subject.position, root.position);
    assert.equal(subject.position.y, 0);
    assert.equal(subject.framingRoot, model.root);
  } finally { world.dispose(); }
});

test('follow probes refresh skin binding after a floating carrier moves between simulation and rendering', async () => {
  const { world, model, root } = await worldFor('milk-frog');
  try {
    const carrier = new THREE.Group(); root.add(carrier); carrier.add(model.root);
    model.update(.25, 'bounce', false, 1);
    // Match the tidal-wave order: bones update first; the render-only carrier
    // moves afterward. Do not refresh the skin before the camera sees it.
    carrier.position.set(.35, 1.2, -.25);
    const offset = carrier.position.clone().applyMatrix4(root.matrixWorld).sub(root.position);
    const subject = world.getCameraSubject('follow-self')!;
    const pose = thirdPersonCameraPose({ ...subject, position: root.position.clone().add(offset) }, .7, { yaw: 0, pitch: 0 });
    model.root.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const identity = node.bindMatrixInverse.clone().multiply(node.matrixWorld);
      assert.ok(identity.elements.every((value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) < 1e-8), 'camera must use the same refreshed skin binding as the renderer');
    });
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, .7, .08, 80);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    const bounds = projectedBounds(skinPositions(model.root), camera);
    assert.ok(bounds.x < .99 && bounds.top < .70 && bounds.bottom > -.94, `floating rendered body: ${JSON.stringify(bounds)}`);
  } finally { world.dispose(); }
});
