import './room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
import { emotionBubbleAnchor } from '../lib/club-emotion-bubble.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as camera from '../lib/club-camera.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';
import { ClubDanceStaging, danceStagePosition, DANCE_STAGE_HEADING } from '../lib/club-dance-staging.ts';
import type { AvatarRig } from '../lib/club-scene-world.ts';

test('scene-scale names stay close to the quiet crown and only explicit hop lift raises them', async () => {
  for (const kind of UPLOADED_CAST) {
    const model = createClubAvatar(kind, `name:${kind}`, { template: await uploadedTemplate(kind) });
    const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.userData.avatarDisplayScale = CLUB_AVATAR_SCALE; root.add(model.root);
    try {
      model.update(0, 'dance', true); root.updateMatrixWorld(true);
      const bounds = actualBounds(model.root);
      const quietAnchor = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind);
      const quietLiveAnchor = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind, 0, model.root);
      assert.ok(quietLiveAnchor.y < bounds.max.y + .35 * CLUB_AVATAR_SCALE, `${kind}: live skin avoidance does not add permanent action headroom`);
      assert.ok(quietAnchor.y > bounds.max.y + .1, `${kind}: quiet nickname clears the actual crown`);
      assert.ok(quietAnchor.y < bounds.max.y + .35 * CLUB_AVATAR_SCALE, `${kind}: quiet nickname stays close to its crown`);
      const bubble = emotionBubbleAnchor(root, model.height, new THREE.Vector3(), kind);
      assert.ok(bubble.y > quietAnchor.y + .15 && bubble.y < quietAnchor.y + .3, `${kind}: speech bubble stays close above the nickname`);
      for (const action of ['dance', 'bounce', 'wave'] as const) for (const beat of [0, .25, .625, 1.325, 1.75, 1.875, 1.9375, 2.25, 3.125]) {
        model.update(beat, action, false, 1); root.updateMatrixWorld(true);
        const actual = actualBounds(model.root);
        const live = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind, model.groundLift, model.root);
        assert.ok(live.y > actual.max.y + .1, `${kind}/${action}/${beat}: live nickname clears the current actual skin`);
        const fixed = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind);
        assert.equal(fixed.y, quietAnchor.y, 'rotated bones do not reserve the largest possible flip envelope');
        const lifted = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind, model.groundLift);
        assert.ok(Math.abs(lifted.y - quietAnchor.y - Math.max(0, model.groundLift) * CLUB_AVATAR_SCALE) < 1e-8, `${kind}/${action}/${beat}: hop lift is applied exactly once`);
        const liftedBubble = emotionBubbleAnchor(root, model.height, new THREE.Vector3(), kind, model.groundLift);
        assert.ok(Math.abs(liftedBubble.y - bubble.y - Math.max(0, model.groundLift) * CLUB_AVATAR_SCALE) < 1e-8, 'speech follows the same hop lift');
      }
    } finally { model.dispose(); }
  }
});

test('follow nickname stays on screen when its fixed action-safe anchor is above the close view', () => {
  const view = new THREE.PerspectiveCamera(52, .7, .08, 80);
  view.position.set(0, 3, -4); view.lookAt(0, 1.6, 0); view.updateMatrixWorld();
  const body = new THREE.Vector3(0, 1.5, 0), label = new THREE.Vector3(0, 6, 0);
  assert.equal(camera.projectCameraLabel(label, view, 392, 560), null, 'fixture must reproduce an above-frame label');
  const projected = camera.projectFollowNameplate(label, body, view, 392, 560);
  assert.ok(projected && projected.y >= 76 && projected.y <= 552, 'keep nickname and space for a speech bubble in the viewport');
  assert.equal(camera.projectFollowNameplate(label, new THREE.Vector3(100, 1.5, 0), view, 392, 560), null, 'never pin an invisible actor onto the screen');
});

test('real enlarged follow poses keep the live nickname above the current skin silhouette', async () => {
  for (const kind of UPLOADED_CAST) {
    const model = createClubAvatar(kind, `name-view:${kind}`, { template: await uploadedTemplate(kind) });
    const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.userData.avatarDisplayScale = CLUB_AVATAR_SCALE; root.add(model.root);
    const point = new THREE.Vector3();
    try {
      for (const action of ['bounce', 'wave'] as const) for (const beat of [.25, .625, 1.325, 1.875]) {
        model.update(beat, action, false, 1); root.updateMatrixWorld(true); actualBounds(model.root);
        for (const aspect of [.4, .7, 1.8]) {
          const pose = camera.thirdPersonCameraPose({ height: model.height * CLUB_AVATAR_SCALE, radius: model.footprintRadius * CLUB_AVATAR_SCALE, displayScale: CLUB_AVATAR_SCALE, groundLift: model.groundLift * CLUB_AVATAR_SCALE, framingRoot: model.root, heading: 0, position: root.position }, aspect, { yaw: 0, pitch: 0 });
          const view = new THREE.PerspectiveCamera(camera.CAMERA_FOV, aspect, .08, 80);
          view.position.copy(pose.position); view.lookAt(pose.target); view.updateMatrixWorld();
          let skinTop = Infinity;
          model.root.traverseVisible(node => {
            if (!(node instanceof THREE.Mesh)) return;
            for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
              node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld).project(view);
              skinTop = Math.min(skinTop, (1 - point.y) * 575 / 2);
            }
          });
          const anchor = camera.avatarLabelAnchor(root, model.height, point, kind, model.groundLift, model.root);
          const body = new THREE.Vector3(0, (model.height * .55 + model.groundLift) * CLUB_AVATAR_SCALE, 0);
          const name = camera.projectFollowNameplate(anchor, body, view, 575 * aspect, 575);
          assert.ok(name && name.y < skinTop - 2, `${kind}/${action}/${beat}/${aspect}: live name ${name?.y} must stay above actual skin ${skinTop}`);
        }
      }
    } finally { model.dispose(); }
  }
});

test('the dance-machine jump leaves room for the own nickname above the enlarged skin', async () => {
  const model = createClubAvatar('feidudu', 'stage-name', { template: await uploadedTemplate('feidudu') });
  const root = new THREE.Group(); root.scale.setScalar(CLUB_AVATAR_SCALE); root.userData.avatarDisplayScale = CLUB_AVATAR_SCALE; root.add(model.root);
  const rig: AvatarRig = { id: 'stage-name', name: 'Stage name', preset: 'feidudu', slot: 0, root, model,
    shadow: new THREE.Mesh(), halo: new THREE.Mesh(), ambient: false, isOwn: true, desiredVisible: true, action: 'dance',
    motion: { slot: 0, x: 0, z: 0, heading: 0, speed: 0, distance: 0, walkBlend: 0, action: 'dance' } };
  const stage = new ClubDanceStaging();
  try {
    stage.apply([rig], rig.id, 1.25, false, 1, 1220, { direction: 'up', at: 1000 });
    root.updateMatrixWorld(true); actualBounds(model.root);
    for (const aspect of [.4, .75, 1.8]) {
      const pose = camera.danceStageCameraPose({ position: { ...danceStagePosition(0, true), y: 0 }, heading: DANCE_STAGE_HEADING, height: model.height * CLUB_AVATAR_SCALE, radius: model.footprintRadius * CLUB_AVATAR_SCALE, displayScale: CLUB_AVATAR_SCALE }, aspect);
      const view = new THREE.PerspectiveCamera(camera.CAMERA_FOV, aspect, .08, 80);
      view.position.copy(pose.position); view.lookAt(pose.target); view.updateMatrixWorld();
      const point = new THREE.Vector3(); let skinTop = Infinity;
      model.root.traverseVisible(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
          node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld).project(view);
          skinTop = Math.min(skinTop, (1 - point.y) * 575 / 2);
        }
      });
      const anchor = camera.avatarLabelAnchor(root, model.height, new THREE.Vector3(), rig.preset, model.groundLift, model.root);
      const body = root.getWorldPosition(new THREE.Vector3()); body.y += (model.height * .55 + model.groundLift) * CLUB_AVATAR_SCALE;
      const name = camera.projectFollowNameplate(anchor, body, view, 575 * aspect, 575);
      assert.ok(name && name.y < skinTop - 2, `jump ${aspect}: name ${name?.y} must stay above skin ${skinTop}`);
    }
  } finally { stage.restore(); model.dispose(); }
});
