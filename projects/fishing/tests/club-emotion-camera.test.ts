import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CLUB_AVATAR_KINDS, createClubAvatar } from '../lib/club-avatar-rig.ts';
import { ClubCameraController, avatarLabelAnchor, projectCameraLabel } from '../lib/club-camera.ts';
import { emotionBubbleAnchor, projectEmotionBubble } from '../lib/club-emotion-bubble.ts';

// Actual weighted vertices catch camera regressions that joint-only bounds miss,
// especially the armed dog's rigid props and the tall monster's raised hands.
test('all emotion skins, props and fixed bubbles stay inside narrow phone follow cameras', async () => {
  const point = new THREE.Vector3(), projected = new THREE.Vector3(), scratch = new THREE.Vector3();
  for (const kind of CLUB_AVATAR_KINDS.filter(kind => kind !== 'monster-blob')) {
    const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const figure = createClubAvatar(kind, `emotion-camera:${kind}`, { template: scene });
    const navigation = new THREE.Group(); navigation.position.set(3, 0, 4); navigation.rotation.y = .7; navigation.add(figure.root);
    const views = [[402, 575, 0], [320, 640, 0], [402, 575, Math.PI / 2], [402, 575, Math.PI]].map(([width, height, yaw]) => ({ width, height,
      camera: new ClubCameraController().update({ width, height, mode: 'third-person', orbit: { yaw, pitch: 0 },
        subject: { id: kind, position: navigation.position, heading: .7, height: figure.height, radius: figure.footprintRadius },
        deltaSeconds: 0, reducedMotion: false,
      }),
    }));
    const meshes: THREE.Mesh[] = [];
    figure.root.traverseVisible(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    const anchorY = emotionBubbleAnchor(navigation, figure.height, point, kind).y;
    try {
      for (const action of ['love', 'laugh', 'punch', 'ghost'] as const) for (const elapsed of [0, 200, 920, 1620, 2600, 3900, 5200, 5999]) {
        figure.update(elapsed / 500, action, false, 1);
        assert.equal(emotionBubbleAnchor(navigation, figure.height, point, kind).y, anchorY, `${kind}/${action} bubble never follows an animated head`);
        for (const view of views) {
          const nameplate = projectCameraLabel(avatarLabelAnchor(navigation, figure.height, scratch, kind), view.camera, view.width, view.height);
          assert.ok(nameplate, `${kind} nickname stays visible in its own follow view`);
          const bubble = projectEmotionBubble(point, view.camera, view.width, view.height, scratch, nameplate.y);
          assert.ok(bubble, `${kind} own bubble stays visible`);
          assert.ok(bubble.x >= 34 && bubble.x <= view.width - 34 && bubble.y >= 52 && bubble.y <= view.height - 12);
          assert.ok(bubble.y <= nameplate.y - 27.8, `${kind}/${view.width}x${view.height} bubble clears its nickname: ${bubble.y} vs ${nameplate.y}`);
        }
        for (const mesh of meshes) for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          for (const view of views) {
            projected.copy(point).project(view.camera);
            assert.ok(Math.abs(projected.x) < .94 && Math.abs(projected.y) < .94,
              `${kind}/${action}/${elapsed} actual skin and props fit ${view.width}x${view.height}: ${projected.x},${projected.y}`);
          }
        }
      }
    } finally { figure.dispose(); }
  }
});
