import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CLUB_AVATAR_KINDS, createClubAvatar } from '../lib/club-avatar-rig.ts';
import * as THREE from 'three';
import * as camera from '../lib/club-camera.ts';

const anchor = (root: THREE.Object3D, height: number, target: THREE.Vector3, preset = 'human-jiji') => {
  assert.equal(typeof camera.avatarLabelAnchor, 'function', 'nameplates need a static world anchor');
  return camera.avatarLabelAnchor(root, height, target, preset);
};

test('nameplates follow navigation XZ at a fixed height across body bounce, rotation and scale', () => {
  const navigation = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  navigation.add(body); body.add(head);
  const point = new THREE.Vector3();
  const height = 2;
  const fixedY = anchor(navigation, height, point).y;
  assert.ok(fixedY > height + 0.5, 'a fixed clearance reserves space for the full elastic hop');
  for (let frame = 0; frame < 100; frame++) {
    const phase = frame / 10;
    navigation.position.set(frame / 20, 0, -frame / 30);
    navigation.rotation.y = phase;
    navigation.scale.setScalar(0.2 + frame / 125);
    body.position.y = 0.53 * Math.sin(phase);
    body.scale.y = 1 + Math.sin(phase) * 0.17;
    head.position.y = 2 + Math.sin(phase);
    head.rotation.x = phase;
    assert.equal(anchor(navigation, height, point), point, 'reuses the render-loop vector');
    assert.deepEqual(point.toArray(), [navigation.position.x, fixedY, navigation.position.z]);
  }
});

test('fixed world anchors still project naturally with navigation depth and camera changes', () => {
  const navigation = new THREE.Group();
  const view = new THREE.PerspectiveCamera(52, 402 / 575, 0.1, 80);
  view.position.set(0, 4, -9); view.lookAt(0, 1, 0); view.updateMatrixWorld();
  const point = new THREE.Vector3();
  const before = camera.projectCameraLabel(anchor(navigation, 1.7, point), view, 402, 575)!;
  const worldY = point.y;
  navigation.position.z = 2;
  const moved = camera.projectCameraLabel(anchor(navigation, 1.7, point), view, 402, 575)!;
  assert.equal(point.y, worldY);
  assert.notEqual(moved.y, before.y, 'world-height stability must not pin the label to a screen Y');
  view.position.x = 2; view.lookAt(0, 1, 0); view.updateMatrixWorld();
  const orbited = camera.projectCameraLabel(point, view, 402, 575)!;
  assert.notEqual(orbited.x, moved.x);
});


test('static per-model anchors clear actual elastic skin peaks instead of following animation', async () => {
  const point = new THREE.Vector3();
  const bounds = new THREE.Box3();
  for (const kind of ['cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'human-jiji', 'human-subeike', 'human-lx', 'monster-blob', 'monster-tower', 'monster-star'] as const) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const figure = createClubAvatar(kind, `static-nameplate:${kind}`, { template: scene });
    const navigation = new THREE.Group(); navigation.add(figure.root);
    const fixedY = anchor(navigation, figure.height, point, kind).y;
    try {
      for (const group of [undefined, 'unison', 'grid'] as const) for (let frame = 0; frame < 32; frame++) {
        figure.update(frame / 8, 'bounce', false, 1, undefined, group ? { kind: group, version: 2, phase: 'perform', weight: 1, wave: 0, beat: frame / 8 } : undefined);
        navigation.updateMatrixWorld(true);
        bounds.setFromObject(figure.root, true);
        assert.equal(anchor(navigation, figure.height, point, kind).y, fixedY);
        assert.ok(fixedY - bounds.max.y >= 0.08, `${kind}/${group ?? 'bounce'}/${frame / 8} must clear the full skin peak by at least 8 cm`);
      }
    } finally { figure.dispose(); }
  }
});

test('complete personal backflips keep fixed labels and all twelve skins and props inside narrow phone follow views', async () => {
  const point = new THREE.Vector3();
  const projected = new THREE.Vector3();
  // The retired blob ID resolves to the star; inspect each live asset once.
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const figure = createClubAvatar(kind, `backflip-nameplate:${kind}`, { template: scene });
    const navigation = new THREE.Group(); navigation.add(figure.root);
    const fixedY = anchor(navigation, figure.height, point, kind).y;
    const views = [[402, 575], [390, 700], [320, 640]].map(([width, height]) => ({ width, height,
      camera: new camera.ClubCameraController().update({
        width, height, mode: 'third-person', orbit: { yaw: 0, pitch: 0 },
        subject: { id: kind, position: { x: 0, y: 0, z: 0 }, heading: 0, height: figure.height, radius: figure.footprintRadius },
        deltaSeconds: 0, reducedMotion: false,
      }),
    }));
    const meshes: THREE.Mesh[] = [];
    figure.root.traverseVisible(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    try {
      // The complete six-second command includes crouch, airborne inversion,
      // landing and quiet finish, rather than only a handful of mid-flight poses.
      for (let frame = 0; frame <= 60; frame++) {
        figure.update(frame / 5, 'wave', false, 1);
        assert.equal(anchor(navigation, figure.height, point, kind).y, fixedY, `${kind} name does not rotate or ride its airborne body`);
        for (const view of views) assert.ok(camera.projectCameraLabel(point, view.camera, view.width, view.height), `${kind} fixed label stays visible at ${view.width}×${view.height}`);
        for (const mesh of meshes) for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          // A brief high somersault may pass behind the fixed foreground name.
          // The established anchor must not chase the airborne silhouette.
          for (const view of views) {
            projected.copy(point).project(view.camera);
            assert.ok(Math.abs(projected.x) < .94 && Math.abs(projected.y) < .94, `${kind}/${frame / 5} full backflip and held props fit ${view.width}×${view.height}: ${projected.x}, ${projected.y}`);
          }
        }
      }
    } finally { figure.dispose(); }
  }
});
