import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { makeClubEnvironment } from '../lib/club-scene-environment.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';

async function cameraModule() {
  const url = new URL('../lib/club-camera.ts', import.meta.url);
  assert.ok(existsSync(url), 'The local camera controller must exist');
  return import(url.href);
}

const subject = (height = 2, radius = 0.65) => ({ position: { x: 2, y: 0, z: 3 }, heading: 0, height, radius });

test('third-person pose follows the navigation heading from behind with the whole own avatar visible', async () => {
  const { thirdPersonCameraPose, CAMERA_FOV } = await cameraModule();
  for (const height of [1.2, 1.7, 2.1, 2.7]) for (const aspect of [402 / 540, 0.46, 1.6]) {
    const actor = subject(height, 0.85);
    const pose = thirdPersonCameraPose(actor, aspect, { yaw: 0, pitch: 0 });
    assert.ok(pose.position.z < actor.position.z, 'camera stays behind +Z-facing navigation root');
    assert.ok(pose.position.y > height, 'camera sits slightly above the avatar');
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.08, 80);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    for (const y of [0, height + 0.45]) for (const x of [-0.85, 0.85]) {
      const projected = new THREE.Vector3(actor.position.x + x, y, actor.position.z).project(camera);
      assert.ok(Math.abs(projected.x) < 0.92, `avatar width remains framed at height ${height}`);
      assert.ok(Math.abs(projected.y) < 0.92, `avatar feet/head remain framed at height ${height}: ${projected.y}`);
    }
  }
});

test('camera turn follows navigation yaw and local orbit never uses the dancing spin pivot', async () => {
  const { thirdPersonCameraPose } = await cameraModule();
  const actor = { ...subject(), heading: Math.PI / 2 };
  const pose = thirdPersonCameraPose(actor, 0.75, { yaw: 0, pitch: 0 });
  assert.ok(pose.position.x < actor.position.x);
  assert.ok(Math.abs(pose.position.z - actor.position.z) < 1e-8);
  const orbited = thirdPersonCameraPose(actor, 0.75, { yaw: Math.PI / 2, pitch: 0.1 });
  assert.ok(orbited.position.z > actor.position.z);
  assert.ok(orbited.position.y > pose.position.y);
});

test('local drag orbit clamps elevation and reset returns to the behind-avatar default', async () => {
  const { dragCameraOrbit, DEFAULT_CAMERA_ORBIT } = await cameraModule();
  const dragged = dragCameraOrbit(DEFAULT_CAMERA_ORBIT, 120, -40);
  assert.notEqual(dragged.yaw, 0); assert.ok(dragged.pitch > 0);
  assert.ok(dragCameraOrbit(dragged, 0, -1e6).pitch <= 0.4);
  assert.ok(dragCameraOrbit(dragged, 0, 1e6).pitch >= -0.05);
  assert.deepEqual(DEFAULT_CAMERA_ORBIT, { yaw: 0, pitch: 0 });
});

test('solid booth obstruction chooses a clear orbit instead of putting the camera through the booth', async () => {
  const { thirdPersonCameraPose, segmentObstacleFraction } = await cameraModule();
  const actor = { ...subject(), position: { x: 0, y: 0, z: 0 } };
  const obstacle = new THREE.Box3(new THREE.Vector3(-0.9, 0, -3), new THREE.Vector3(0.9, 5, -2));
  const clear = thirdPersonCameraPose(actor, 0.75, { yaw: 0, pitch: 0 }, [obstacle]);
  const focus = new THREE.Vector3(0, actor.height * 0.55, 0);
  assert.equal(segmentObstacleFraction(focus, clear.position, [obstacle]), 1);
  assert.ok(Math.abs(clear.position.x) > 0.1, 'camera rotates around the obstruction');
});

test('controller falls back to overview without an own avatar and restores stable modes', async () => {
  const { ClubCameraController } = await cameraModule();
  const controller = new ClubCameraController();
  const view = { width: 402, height: 540, mode: 'third-person', orbit: { yaw: 0, pitch: 0 }, reducedMotion: false, deltaSeconds: 1 / 40 };
  const fallback = controller.update({ ...view, subject: null });
  assert.ok(fallback instanceof THREE.OrthographicCamera);
  const following = controller.update({ ...view, subject: subject() });
  assert.ok(following instanceof THREE.PerspectiveCamera);
  assert.ok(Number.isFinite(following.position.x));
  const reset = controller.update({ ...view, mode: 'overview', subject: subject() });
  assert.ok(reset instanceof THREE.OrthographicCamera);
  assert.ok(Math.abs((reset.right - reset.left) / (reset.top - reset.bottom) - 402 / 540) < 1e-12);
});

test('projected labels behind the perspective camera or outside the frame are hidden', async () => {
  const { projectCameraLabel } = await cameraModule();
  const camera = new THREE.PerspectiveCamera(52, 0.75, 0.08, 80);
  camera.position.set(0, 2, -6); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  assert.ok(projectCameraLabel(new THREE.Vector3(0, 1, 0), camera, 402, 540));
  assert.equal(projectCameraLabel(new THREE.Vector3(0, 2, -12), camera, 402, 540), null);
  assert.equal(projectCameraLabel(new THREE.Vector3(100, 1, 0), camera, 402, 540), null);
});

test('a valid slot-seven route beside the rotated booth never collapses the camera into the avatar', async () => {
  const { createCameraObstacle, thirdPersonCameraPose, segmentObstacleFraction } = await cameraModule();
  assert.equal(typeof createCameraObstacle, 'function', 'Rotated solids need local-space camera bounds');
  const environment = makeClubEnvironment();
  environment.scene.updateMatrixWorld(true);
  const obstacles: unknown[] = [];
  environment.scene.traverse((node) => { if (node.userData.cameraObstacle === true) obstacles.push(createCameraObstacle(node)); });
  const motion = clubMotionAt(1791806400000, 7);
  for (const height of [1.26, 1.44077, 1.7, 2.1, 2.47]) {
    const actor = { id: 'slot-seven', position: { x: motion.x, y: 0, z: motion.z }, heading: motion.heading, height, radius: 0.8 };
    const pose = thirdPersonCameraPose(actor, 402 / 575, { yaw: 0, pitch: 0 }, obstacles);
    const focus = new THREE.Vector3(motion.x, height * 0.55, motion.z);
    assert.ok(pose.position.distanceTo(focus) > height * 2, 'follow camera keeps a third-person distance');
    assert.equal(segmentObstacleFraction(focus, pose.position, obstacles), 1);
  }
  environment.dispose();
});

test('a half-turn orbit stays on a safe follow arc instead of cutting through the avatar', async () => {
  const { ClubCameraController } = await cameraModule();
  const controller = new ClubCameraController();
  const actor = { ...subject(1.4407668433, 0.510342), position: { x: 10, y: 0, z: 10 } };
  const options = { width: 402, height: 575, mode: 'third-person', subject: actor, deltaSeconds: 1 / 40, reducedMotion: false };
  controller.update({ ...options, orbit: { yaw: 0, pitch: -0.04 } });
  for (let frame = 0; frame < 30; frame++) {
    const camera = controller.update({ ...options, orbit: { yaw: Math.PI, pitch: -0.04 } });
    assert.ok(Math.hypot(camera.position.x - 10, camera.position.z - 10) > 3, 'orbit interpolation preserves safe radius');
    for (const y of [0, actor.height + 0.45]) {
      const projected = new THREE.Vector3(10, y, 10).project(camera);
      assert.ok(Math.abs(projected.y) < 0.92, 'own avatar remains framed during an orbit reversal');
    }
  }
});

test('gesture heading lock prevents camera-relative steering feedback while position still follows', async () => {
 const { ClubCameraController }=await cameraModule();
 const controller=new ClubCameraController();const subject={id:'self',position:new THREE.Vector3(0,0,4),heading:0,height:2,radius:.65};
 const options={width:400,height:700,mode:'third-person' as const,orbit:{yaw:0,pitch:0},subject,deltaSeconds:.025,reducedMotion:false,headingLock:0};
 const camera=controller.update(options);const offset=camera.position.clone().sub(subject.position);
 for(let i=0;i<100;i++)controller.update({...options,subject:{...subject,heading:Math.PI/2}});
 assert.ok(camera.position.clone().sub(subject.position).distanceTo(offset)<1e-6);
 const before=camera.position.clone();for(let i=0;i<100;i++)controller.update({...options,subject:{...subject,position:new THREE.Vector3(1,0,4),heading:Math.PI/2}});
 assert.ok(camera.position.distanceTo(before)>.9);
});


test('spectator DJ follow frames the full 2.8m cockatoo from third-person outside the booth', async () => {
  const { ClubCameraController, createCameraObstacle, segmentObstacleFraction } = await cameraModule();
  const { makeClubWorld } = await import('../lib/club-scene-world.ts');
  const world = makeClubWorld({ createAvatar() { return { root: new THREE.Group(), height: 2.8, labelHeight: 3, footprintRadius: .9, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} }; } });
  world.scene.updateMatrixWorld(true);
  const obstacles: ReturnType<typeof createCameraObstacle>[] = [];
  world.scene.traverse(node => { if (node.userData.cameraObstacle === true) obstacles.push(createCameraObstacle(node)); });
  const dj = world.getCameraSubject(null)!;
  for (const [width, height] of [[402, 575], [390, 700], [1440, 900]]) {
    const camera = new ClubCameraController().update({ width, height, mode: 'third-person', orbit: { yaw: 0, pitch: 0 }, subject: dj, deltaSeconds: .025, reducedMotion: false, obstacles });
    assert.ok(camera instanceof THREE.PerspectiveCamera);
    assert.ok(camera.position.distanceTo(dj.position) > dj.height * 2, 'DJ remains visibly third-person');
    assert.equal(segmentObstacleFraction(new THREE.Vector3(dj.position.x, dj.height * .55, dj.position.z), camera.position, obstacles), 1);
    for (const y of [0, dj.height + .3]) for (const x of [-.9, .9]) {
      const projected = new THREE.Vector3(dj.position.x + x, y, dj.position.z).project(camera);
      assert.ok(Math.abs(projected.x) < .92 && Math.abs(projected.y) < .92, 'full DJ fits in frame');
    }
  }
  world.dispose();
});
