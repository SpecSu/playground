import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('../components/ClubScene.tsx', import.meta.url), 'utf8');

// This source-level guard complements browser QA: dynamically depth-sorted tags may
// never escape the scene and occlude the app's sheets or the WebGL retry controls.
test('scene establishes a local stacking context below app sheets', () => {
  assert.match(component, /className=\{className\} style=\{\{[^\n]*isolation: 'isolate'[^\n]*zIndex: 0/);
});

test('projected tags and graphics fallback have explicitly ordered scene-local layers', () => {
  assert.match(component, /ref=\{labelsRef\}[^\n]*zIndex: 1/);
  assert.match(component, /role="status"[^\n]*zIndex: 3/);
});

test('projected name tags are readable passive spans and never intercept scene taps', () => {
  assert.match(component, /fontSize: '11px'/);
  assert.match(component, /tag = document\.createElement\('span'\)/);
  const tagStyle = component.match(/Object\.assign\(tag\.style, \{([\s\S]*?)\}\);/)?.[1] ?? '';
  assert.match(tagStyle, /pointerEvents: 'none'/);
  assert.doesNotMatch(component, /addEventListener\('click'/);
  assert.doesNotMatch(tagStyle, /minHeight|minWidth/);
});

test('all actor nicknames use 70% white text without a nameplate surface', () => {
  const nicknameStyles = component.slice(component.indexOf('const syncTags ='), component.indexOf('if (!rig.ambient && !emotionBubbles.has'));
  assert.match(nicknameStyles, /color: 'rgba\(255, 255, 255, \.7\)'/);
  assert.doesNotMatch(nicknameStyles, /backdropFilter|borderRadius|boxShadow/);
  assert.doesNotMatch(nicknameStyles, /padding: '(?!0')|background: '(?!transparent')|border: '(?!0')/);
  assert.doesNotMatch(nicknameStyles, /\.style\.(?:color|background|border|opacity)\s*=/);
});

test('projected visible and accessible labels display nicknames without role suffixes', () => {
  assert.match(component, /bubble\.textContent = rig\.name;/);
  assert.match(component, /tag\.setAttribute\('aria-label', rig\.name\)/);
  assert.doesNotMatch(component, / · YOU|ambient dancer| · NPC/);
});

test('graphics diagnostics expose bounded reason codes and log captured exceptions', () => {
  assert.match(component, /data-graphics-status=/);
  assert.match(component, /data-graphics-reason=/);
  assert.match(component, /console\.warn\('\[club-graphics\]', reason, error\)/);
  assert.match(component, /catch \(error\)/);
  assert.doesNotMatch(component, /catch \{/);
  assert.match(component, /graphicsFailureMessage\(graphics\.reason\)/);
  assert.match(component, /重试 3D 画面/);
});

test('scene connects bone avatars, actual clip timing and full section energy to the local camera views', () => {
  assert.match(component, /createAvatar: createClubAvatar/);
  assert.match(component, /const \{ beat, section \} = danceStageTiming\(snapshot\.track, snapshot\.danceRound, nowServer\)/);
  const staging = readFileSync(new URL('../lib/club-dance-staging.ts', import.meta.url), 'utf8');
  assert.match(staging, /getTrackTiming\(source\.id, source\.startedAt, now\)/);
  assert.match(staging, /getMusicSectionEnergy\(source\.id, timing\)/);
  assert.match(component, /world\.update\(beat, lightMode, Boolean\(snapshot\.reducedMotion\), section\.energy, nowServer, section, \{\s*groupAction: danceActive \? null : snapshot\.groupAction, deltaSeconds,/);
  assert.match(component, /new ClubCameraController\(\)/);
  assert.match(component, /world\.installStudioEnvironment\(renderer\)/);
  assert.match(component, /data-avatar-status=/);
  assert.doesNotMatch(component, /rig\.body/);
});

test('renderer enables local floor clipping and describes the complete mixed cast accessibly', () => {
  assert.match(component, /renderer\.localClippingEnabled = true/);
  assert.match(component, /人物、动物和小怪兽/);
});

test('camera follows navigation state, rejects behind-camera labels and only collects solid obstructions', () => {
  assert.match(component, /subject: tidalWave\?\.cameraSubject\(world\.getCameraSubject\(snapshot\.ownId\)\)/);
  assert.match(component, /projectCameraLabel\(projected, camera, width, height\)/);
  assert.match(component, /node\.userData\.cameraObstacle === true/);
});

test('local camera drag handlers are removed on disposal and do not capture app overlay buttons', () => {
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown']) {
    assert.ok(component.includes(`canvas.addEventListener('${name}'`), `${name} is attached only to the canvas`);
    assert.ok(component.includes(`canvas.removeEventListener('${name}'`), `${name} is cleaned up`);
  }
  assert.match(component, /touchAction: 'pinch-zoom'/);
  assert.match(component, /canvas\.tabIndex = 0/);
});


test('scene projects only the local action hint and supplies the authoritative group event to the world', () => {
  assert.match(component, /ownActionPreview\?: OwnActionPreview/);
  assert.match(component, /world\.syncParticipants\(projectOwnAction\(snapshot\.participants, snapshot\.ownId, snapshot\.ownActionPreview\), snapshot\.ownId\)/);
  assert.match(component, /previousActionPreview !== snapshot\.ownActionPreview/);
  assert.match(component, /groupAction: danceActive \? null : snapshot\.groupAction/);
});


test('nickname projection uses stable model height and navigation position without animated label height', () => {
  assert.match(component, /avatarLabelAnchor\(rig\.root, rig\.model\.height, projected, rig\.preset, rig\.model\.groundLift, rig\.model\.root\)/);
  assert.doesNotMatch(component, /rig\.model\.labelHeight|rig\.root\.localToWorld\(projected\)/);
});

test('emotion speech bubbles use reusable passive native-emoji spans in the projected label layer', () => {
  assert.match(component, /const emotionBubbles = new Map<string, HTMLSpanElement>/);
  assert.match(component, /emotionBubbleAt\(rig\.participant, nowServer, reducedMotion\)/);
  assert.match(component, /emotionBubbleAnchor\(rig\.root, rig\.model\.height, projected, rig\.preset, rig\.model\.groundLift, rig\.model\.root\)/);
  assert.match(component, /projectEmotionBubble\(projected, camera, width, height, bubbleProjected,/);
  assert.match(component, /Apple Color Emoji/);
  assert.match(component, /Segoe UI Emoji/);
  assert.match(component, /Noto Color Emoji/);
  assert.match(component, /emotionBubbles\.forEach\(\(bubble\) => bubble\.remove\(\)\)/);
  assert.match(component, /emotionBubbles\.clear\(\)/);
  assert.doesNotMatch(component, /CanvasTexture|new THREE\.Texture|setEmotion/);
  assert.match(component, /bubble\.setAttribute\('aria-hidden', visible \? 'false' : 'true'\)/);
});


test('scene projects the persisted lighting cycle on its existing shared-clock frame without a local cycle timer', () => {
  assert.match(component, /lightCycle\?: RoomLightCycle/);
  assert.match(component, /const lightMode = lightModeAt\(snapshot\.lightCycle, nowServer, snapshot\.lightMode\)/);
  assert.doesNotMatch(component, /setInterval|setTimeout/);
});

test('avatar preparation stays silent while loading state and failure recovery remain wired', () => {
  assert.doesNotMatch(component, /正在准备舞者/);
  assert.match(component, /data-avatar-status=\{avatarStatus\}/);
  assert.match(component, /setAvatarStatus\('loading'\)/);
  assert.match(component, /world\.ready\.then/);
  assert.match(component, /setAvatarStatus\('ready'\)/);
  assert.match(component, /markFailed\('avatar-assets', error\)/);
  assert.match(component, /重试 3D 画面/);
});
