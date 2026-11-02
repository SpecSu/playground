import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import { makeClubEnvironment } from '../lib/club-scene-environment.ts';
import { clubMotionAt } from '../lib/club-scene-motion.ts';

async function cameraModule() {
  const url = new URL('../lib/club-camera.ts', import.meta.url);
  assert.ok(existsSync(url), 'The local camera controller must exist');
  return import(url.href);
}

const subject = (height = 2, radius = 0.65) => ({ position: { x: 2, y: 0, z: 3 }, heading: 0, height, radius });

test('third-person pose follows the navigation heading from the front with the whole own avatar visible', async () => {
  const { thirdPersonCameraPose, CAMERA_FOV } = await cameraModule();
  for (const height of [1.2, 1.7, 2.1, 2.7]) for (const aspect of [402 / 540, 0.46, 1.6]) {
    const actor = subject(height, 0.85);
    const pose = thirdPersonCameraPose(actor, aspect, { yaw: 0, pitch: 0 });
    assert.ok(pose.position.z > actor.position.z, 'camera stays in front of the +Z-facing navigation root');
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
  assert.ok(pose.position.x > actor.position.x);
  assert.ok(Math.abs(pose.position.z - actor.position.z) < 1e-8);
  const orbited = thirdPersonCameraPose(actor, 0.75, { yaw: Math.PI / 2, pitch: 0.1 });
  assert.ok(orbited.position.z < actor.position.z);
  assert.ok(orbited.position.y > pose.position.y);
});

test('local drag orbit clamps elevation and reset returns to the front-avatar default', async () => {
  const { dragCameraOrbit, DEFAULT_CAMERA_ORBIT } = await cameraModule();
  const dragged = dragCameraOrbit(DEFAULT_CAMERA_ORBIT, 120, 40);
  assert.notEqual(dragged.yaw, 0); assert.ok(dragged.pitch > 0);
  assert.equal(dragCameraOrbit(dragged, 0, 1e6).pitch, 0.38);
  assert.equal(dragCameraOrbit(dragged, 0, -1e6).pitch, -0.04);
  assert.deepEqual(DEFAULT_CAMERA_ORBIT, { yaw: 0, pitch: 0 });
});

test('vertical drag reverses pitch while horizontal direction and sensitivity stay unchanged', async () => {
  const { dragCameraOrbit } = await cameraModule();
  const start = { yaw: .3, pitch: .16 };
  const down = dragCameraOrbit(start, 25, 20), up = dragCameraOrbit(start, 25, -20);
  assert.ok(Math.abs(down.pitch - .24) < 1e-12);
  assert.ok(Math.abs(up.pitch - .08) < 1e-12);
  assert.ok(Math.abs(down.yaw - .15) < 1e-12);
  assert.equal(up.yaw, down.yaw, 'vertical input cannot change horizontal rotation');
  assert.ok(Math.abs(dragCameraOrbit(start, NaN, NaN).yaw - start.yaw) < 1e-12);
  assert.equal(dragCameraOrbit(start, NaN, NaN).pitch, start.pitch);
});

test('solid booth obstruction chooses a clear orbit instead of putting the camera through the booth', async () => {
  const { thirdPersonCameraPose, segmentObstacleFraction } = await cameraModule();
  const actor = { ...subject(), position: { x: 0, y: 0, z: 0 } };
  const obstacle = new THREE.Box3(new THREE.Vector3(-0.9, 0, 2), new THREE.Vector3(0.9, 5, 3));
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


test('spectator DJ follow frames the 1.5x uploaded DJ without proportionally retreating', async () => {
  const { ClubCameraController, createCameraObstacle, segmentObstacleFraction } = await cameraModule();
  const { makeClubWorld } = await import('../lib/club-scene-world.ts');
  const world = makeClubWorld({ createAvatar() { return { root: new THREE.Group(), height: 1.74, labelHeight: 2, footprintRadius: .7, loaded: true, ready: Promise.resolve(), update() {}, dispose() {} }; } });
  world.scene.updateMatrixWorld(true);
  const obstacles: ReturnType<typeof createCameraObstacle>[] = [];
  world.scene.traverse(node => { if (node.userData.cameraObstacle === true) obstacles.push(createCameraObstacle(node)); });
  const dj = world.getCameraSubject(null)!;
  for (const [width, height] of [[402, 575], [390, 700], [1440, 900]]) {
    const camera = new ClubCameraController().update({ width, height, mode: 'third-person', orbit: { yaw: 0, pitch: 0 }, subject: dj, deltaSeconds: .025, reducedMotion: false, obstacles });
    assert.ok(camera instanceof THREE.PerspectiveCamera);
    assert.equal(dj.height,1.74 * CLUB_AVATAR_SCALE);
    assert.equal(dj.displayScale,CLUB_AVATAR_SCALE);
    assert.ok(camera.position.distanceTo(dj.position)>dj.height,'DJ remains outside the camera');
    assert.equal(segmentObstacleFraction(new THREE.Vector3(dj.position.x, dj.height * .55, dj.position.z), camera.position, obstacles), 1);
    for (const y of [0, dj.height + .3]) for (const x of [-.9, .9]) {
      const projected = new THREE.Vector3(dj.position.x + x, y, dj.position.z).project(camera);
      assert.ok(Math.abs(projected.x) < .92 && Math.abs(projected.y) < .92, 'full DJ fits in frame');
    }
  }
  world.dispose();
});

test('immersion adds 30 percent to the previous 20 percent pullback while keeping orbit and smooth turns', async()=>{
 const {thirdPersonCameraPose,ClubCameraController}=await cameraModule();
 const actor={...subject(),id:'self'};
 const rest=thirdPersonCameraPose(actor,.75,{yaw:0,pitch:0});
 assert.ok(Math.abs(rest.distance-2*3.05*1.2*1.3)<1e-10,'the additional 30 percent multiplies the already 20-percent-farther follow distance');
 const back=thirdPersonCameraPose(actor,.75,{yaw:Math.PI,pitch:0});
 assert.ok(back.position.z<actor.position.z,'the user can still deliberately orbit to the back');
 const controller=new ClubCameraController(); const options={width:400,height:700,mode:'third-person' as const,orbit:{yaw:0,pitch:0},subject:actor,deltaSeconds:.025,reducedMotion:false};
 const camera=controller.update(options), before=camera.position.clone();
 controller.update({...options,subject:{...actor,heading:Math.PI/2}});
 assert.ok(camera.position.x>before.x&&camera.position.z>actor.position.z,'front view follows the turn smoothly instead of snapping to the other side');
 for(let i=0;i<100;i++)controller.update({...options,subject:{...actor,heading:Math.PI/2}});
 assert.ok(camera.position.x>actor.position.x&&Math.abs(camera.position.z-actor.position.z)<1e-8);
});
