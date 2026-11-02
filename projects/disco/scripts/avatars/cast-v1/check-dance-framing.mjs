/**
 * Exact uploaded-skin QA: 12 avatars × 4 keys × 6 ages × 6 beats = 1,728 poses.
 * Run from the repository root:
 *   node --experimental-strip-types scripts/avatars/cast-v1/check-dance-framing.mjs
 *   node --experimental-strip-types scripts/avatars/cast-v1/check-dance-framing.mjs --aspects 0.4,0.75,1.8
 *
 * JSON Lines report per-avatar magnification and worst projected vertices.
 * Exit 1 means clipping, a nickname overlap, invalid projection, or static width/height below 90% of the scene multiplier over
 * the frozen v0.5.0 framing. Exit 2 means invalid command-line arguments.
 * No renderer/browser, generated assets, or production-state changes are needed.
 */
import '../../../tests/room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../../../lib/club-avatar-scale.ts';
import * as THREE from 'three';
import { createClubAvatar } from '../../../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, uploadedTemplate } from '../../../tests/helpers/uploaded-avatar.ts';
import { ClubDanceStaging, danceStagePosition, DANCE_STAGE_HEADING } from '../../../lib/club-dance-staging.ts';
import { danceStageCameraPose, CAMERA_FOV, avatarLabelAnchor, projectFollowNameplate } from '../../../lib/club-camera.ts';
import { stagePosition } from '../../../lib/club-scene-math.ts';

const usage = 'Usage: node --experimental-strip-types scripts/avatars/cast-v1/check-dance-framing.mjs [--aspects 0.4,0.75,1.8]';
const args = process.argv.slice(2);
let aspects = [0.4, 0.75, 1.8];
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') {
    console.log(usage);
    process.exit(0);
  }
  const value = arg === '--aspects' ? args[++index] : arg.startsWith('--aspects=') ? arg.slice('--aspects='.length) : null;
  if (!value || value.split(',').some(part => !part.trim() || !Number.isFinite(Number(part)) || Number(part) <= 0)) {
    console.error(`${usage}\nInvalid argument: ${arg}${value ? ` ${value}` : ''}`);
    process.exit(2);
  }
  aspects = [...new Set(value.split(',').map(Number))];
}

const DISPLAY_SCALE = CLUB_AVATAR_SCALE;
const MIN_MAGNIFICATION = DISPLAY_SCALE * .9;
const EPSILON = 1e-6;
const directions = ['left', 'right', 'down', 'up'];
const ages = [40, 80, 150, 220, 330, 400];
const beats = [0, 0.25, 0.75, 1.25, 1.75, 4.25];
const point = new THREE.Vector3();

/** Frozen v0.5.0 equation: do not let later camera edits alter the comparison. */
function oldStageCameraPose(model, aspect) {
  const height = THREE.MathUtils.clamp(model.height, 0.8, 4);
  const safeAspect = Math.max(0.25, aspect);
  const centre = danceStagePosition(0, true);
  const target = new THREE.Vector3(centre.x, height * 0.55, centre.z);
  const distance = Math.max(
    6.8,
    (height + 1.25) * 2.7,
    (model.footprintRadius + 0.9) / (Math.tan(THREE.MathUtils.degToRad(52 / 2)) * safeAspect) * 1.5,
  );
  const forward = stagePosition(0, distance);
  return { target, position: target.clone().add(new THREE.Vector3(forward.x, distance * 0.16, forward.z)) };
}

function cameraFor(model, aspect, baseline = false) {
  const pose = baseline ? oldStageCameraPose(model, aspect) : danceStageCameraPose({
    position: { ...danceStagePosition(0, true), y: 0 },
    heading: DANCE_STAGE_HEADING,
    height: model.height * DISPLAY_SCALE,
    radius: model.footprintRadius * DISPLAY_SCALE,
    displayScale: DISPLAY_SCALE,
  }, aspect);
  const camera = new THREE.PerspectiveCamera(baseline ? 52 : CAMERA_FOV, aspect, 0.08, 80);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  return camera;
}

/** Full deformed vertices, not a world AABB whose empty corners overstate clipping. */
function skinnedPositions(root) {
  root.updateMatrixWorld(true);
  const positions = [];
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
    for (let index = 0; index < node.geometry.attributes.position.count; index++) {
      node.getVertexPosition(index, point).applyMatrix4(node.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
  });
  if (!positions.length) throw new Error(`No visible vertices found in ${root.name}`);
  return positions;
}

function projectBounds(positions, camera) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let invalidVertices = 0;
  for (let index = 0; index < positions.length; index += 3) {
    point.fromArray(positions, index).project(camera);
    if (![point.x, point.y, point.z].every(Number.isFinite) || point.z < -1 || point.z > 1) invalidVertices++;
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  return {
    minX, maxX, minY, maxY,
    maxAbsX: Math.max(-minX, maxX), maxAbsY: Math.max(-minY, maxY),
    width: maxX - minX, height: maxY - minY, invalidVertices,
  };
}

let totalPoses = 0, totalProjections = 0, clippedProjections = 0, invalidProjections = 0;
let nameplateOverlaps = 0;
const nameplateFailures = [];
let minimumWidthRatio = Infinity, minimumHeightRatio = Infinity;
const magnificationFailures = [];
const globalWorst = aspects.map(aspect => ({ aspect, maxNdcX: 0, maxNdcY: 0, worstX: null, worstY: null }));
console.log(JSON.stringify({ check: 'dance-framing', aspects, displayScale: DISPLAY_SCALE, minimumMagnification: MIN_MAGNIFICATION, poseCount: UPLOADED_CAST.length * directions.length * ages.length * beats.length }));

for (const kind of UPLOADED_CAST) {
  const model = createClubAvatar(kind, `camera:${kind}`, { template: await uploadedTemplate(kind) });
  await model.ready;
  const root = new THREE.Group(); root.name = `qa:${kind}`; root.add(model.root);
  root.userData.avatarDisplayScale = DISPLAY_SCALE;
  const rig = { id: kind, preset: kind, slot: 0, root, model, motion: { slot: 0, x: 0, z: 0, heading: 0, speed: 0, distance: 0, walkBlend: 0, action: 'dance' } };
  const cameras = aspects.map(aspect => cameraFor(model, aspect));
  const staticBounds = [];
  for (const scale of [1, DISPLAY_SCALE]) {
    root.scale.setScalar(scale);
    const stage = new ClubDanceStaging();
    stage.apply([rig], kind, 4.25, false, 1, 1000, null);
    const positions = skinnedPositions(root);
    staticBounds.push(aspects.map((aspect, index) => projectBounds(positions, scale === 1 ? cameraFor(model, aspect, true) : cameras[index])));
    stage.restore();
  }
  const magnification = aspects.map((aspect, index) => {
    const old = staticBounds[0][index], current = staticBounds[1][index];
    const width = current.width / old.width, height = current.height / old.height;
    minimumWidthRatio = Math.min(minimumWidthRatio, width);
    minimumHeightRatio = Math.min(minimumHeightRatio, height);
    if (!Number.isFinite(width + height) || width < MIN_MAGNIFICATION - EPSILON || height < MIN_MAGNIFICATION - EPSILON) magnificationFailures.push({ kind, aspect, width, height });
    return { aspect, width, height };
  });
  root.scale.setScalar(DISPLAY_SCALE);
  const worst = aspects.map(aspect => ({ aspect, maxNdcX: 0, maxNdcY: 0, clipped: 0, invalid: 0, worstX: null, worstY: null }));
  for (const direction of directions) for (const ageMs of ages) for (const beat of beats) {
    const stage = new ClubDanceStaging();
    stage.apply([rig], kind, beat, false, 1, 1000 + ageMs, { direction, at: 1000 });
    const positions = skinnedPositions(root);
    totalPoses++;
    cameras.forEach((camera, index) => {
      const bounds = projectBounds(positions, camera);
      const anchor = avatarLabelAnchor(root, model.height, new THREE.Vector3(), kind, model.groundLift ?? 0, model.root);
      const body = root.getWorldPosition(new THREE.Vector3()); body.y += (model.height * .55 + (model.groundLift ?? 0)) * DISPLAY_SCALE;
      const name = projectFollowNameplate(anchor, body, camera, 575 * aspects[index], 575);
      if (!name || name.y >= (1 - bounds.maxY) * 575 / 2 - 2) {
        nameplateOverlaps++;
        if (nameplateFailures.length < 12) nameplateFailures.push({ kind, direction, ageMs, beat, aspect: aspects[index], nameY: name?.y, skinTop: (1 - bounds.maxY) * 575 / 2 });
      }
      const frame = { kind, direction, ageMs, beat, bounds };
      totalProjections++;
      if (bounds.maxAbsX > 1 + EPSILON || bounds.maxAbsY > 1 + EPSILON) { worst[index].clipped++; clippedProjections++; }
      if (bounds.invalidVertices) { worst[index].invalid++; invalidProjections++; }
      if (bounds.maxAbsX > worst[index].maxNdcX) { worst[index].maxNdcX = bounds.maxAbsX; worst[index].worstX = frame; }
      if (bounds.maxAbsY > worst[index].maxNdcY) { worst[index].maxNdcY = bounds.maxAbsY; worst[index].worstY = frame; }
      if (bounds.maxAbsX > globalWorst[index].maxNdcX) { globalWorst[index].maxNdcX = bounds.maxAbsX; globalWorst[index].worstX = frame; }
      if (bounds.maxAbsY > globalWorst[index].maxNdcY) { globalWorst[index].maxNdcY = bounds.maxAbsY; globalWorst[index].worstY = frame; }
    });
    stage.restore();
  }
  console.log(JSON.stringify({ kind, magnification, worst }));
  model.dispose();
}

const passed = clippedProjections === 0 && invalidProjections === 0 && nameplateOverlaps === 0 && magnificationFailures.length === 0;
console.log(JSON.stringify({ final: true, passed, totalPoses, totalProjections, clippedProjections, invalidProjections, nameplateOverlaps, nameplateFailures, minimumWidthRatio, minimumHeightRatio, magnificationFailures, globalWorst }));
if (!passed) process.exitCode = 1;
