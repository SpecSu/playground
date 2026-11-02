import * as THREE from 'three';
import { measureAvatarGroundFootprint } from './avatar-ground-footprint.ts';
import { CLUB_AVATAR_MODEL_URLS } from './club-avatar-catalog.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CANONICAL_AVATAR_PRESETS, AVATAR_PRESETS, resolveAvatarPreset, type AvatarPreset } from './room-types.ts';
import { clubMotionAtDistance, type ClubMotionState } from './club-scene-motion.ts';
import type { GroupPose } from './club-group-motion.ts';
import { backflipAt, personalBackflipTime } from './club-backflip.ts';
import { emotionMotionAt, isEmotionAction, type EmotionAction } from './club-emotion-motion.ts';

export const CLUB_AVATAR_KINDS = CANONICAL_AVATAR_PRESETS;
export type ClubAvatarKind = AvatarPreset | 'dj-cockatoo';
export type ClubAvatarAction = 'dance' | 'bounce' | 'spin' | 'wave' | EmotionAction;
export interface ClubAvatar {
  readonly root: THREE.Group;
  readonly kind: ClubAvatarKind;
  readonly height: number;
  readonly labelHeight: number;
  readonly footprintRadius: number;
  readonly groundFootprintRadius: number;
  readonly loaded: boolean;
  readonly ready: Promise<void>;
  readonly groundLift: number;
  readonly landingImpact: number;
  update(absoluteBeat: number, action: ClubAvatarAction, reducedMotion: boolean, energy?: number, locomotion?: ClubMotionState, groupPose?: GroupPose): void;
  dispose(): void;
}

const templates = new Map<ClubAvatarKind, Promise<THREE.Group>>();
const TAU = Math.PI * 2;
const JOINTS = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'] as const;
type Contact = 'L' | 'R' | 'FL' | 'FR';
const contactBones = (side: Contact) => side.length === 2
  ? [`upperArm_${side[1]}`, `forearm_${side[1]}`, `hand_${side[1]}`]
  : [`thigh_${side}`, `shin_${side}`, `foot_${side}`];
type RestJoint = { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; dancePosition: THREE.Vector3; danceQuaternion: THREE.Quaternion };

function loadTemplate(kind: ClubAvatarKind): Promise<THREE.Group> {
  if (kind !== 'dj-cockatoo') kind = resolveAvatarPreset(kind);
  const cached = templates.get(kind);
  if (cached) return cached;
  const loading = new GLTFLoader().loadAsync(kind === 'dj-cockatoo' ? '/avatars/dj-cockatoo.glb' : CLUB_AVATAR_MODEL_URLS[resolveAvatarPreset(kind)]).then(({ scene }) => scene).catch((error: unknown) => {
    // A failed request is observable through ready and must not poison later retries.
    templates.delete(kind);
    throw error;
  });
  templates.set(kind, loading);
  return loading;
}

/** Warms the same-origin GLB cache; a server render never starts browser requests. */
export async function prewarmClubAvatars(kinds: readonly ClubAvatarKind[] = CLUB_AVATAR_KINDS): Promise<void> {
  if (typeof window === 'undefined') return;
  await Promise.all(kinds.map(loadTemplate));
}

function identityPhase(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/**
 * Owns only the loaded model, its bones and animation pivot. The outer root's
 * placement, facing and scale belong to the room. No primitive loading stand-in.
 */
export function createClubAvatar(
  kind: ClubAvatarKind,
  id: string,
  options: { mode?: 'dance' | 'dj' | 'desert'; template?: THREE.Group | Promise<THREE.Group> } = {},
): ClubAvatar {
  if (kind !== 'dj-cockatoo' && !(AVATAR_PRESETS as readonly string[]).includes(kind)) throw new Error(`Unknown club avatar: ${kind}`);
  // Explicit historical templates are retained for offline fixture compatibility.
  // Every normal scene load resolves saved IDs to the current uploaded cast.
  if (!options.template && kind !== 'dj-cockatoo') kind = resolveAvatarPreset(kind);
  const root = new THREE.Group();
  root.name = `avatar:${id}`;
  const pivot = new THREE.Group();
  pivot.name = 'avatar-animation-pivot';
  const joints = new Map<string, RestJoint>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const euler = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const beforeGroupRotation = new THREE.Quaternion();
  const phase = identityPhase(id);
  let disposed = false;
  let loaded = false;
  let height = kind === 'dj-cockatoo' ? 2.8 : kind.startsWith('human-') ? 2.28 : kind === 'monster-tower' ? 2.4 : 1.7;
  let footprintRadius = kind.startsWith('human-') ? 0.62 : 0.65;
  let groundFootprintRadius = footprintRadius;
  let lastPose: { beat: number; action: ClubAvatarAction; reduced: boolean; energy: number; locomotion?: ClubMotionState; groupPose?: GroupPose } = { beat: 0, action: 'dance', reduced: true, energy: 0.5 };
  let speciesRig = false;
  let quadruped = false;
  const feet = new Map<Contact, { position: THREE.Vector3; quaternion: THREE.Quaternion; dancePosition: THREE.Vector3; danceQuaternion: THREE.Quaternion }>();
  const dancePivot = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const rootWorld = new THREE.Vector3();
  const walkingScale = new THREE.Vector3();
  let strideLength = 0.38;
  let groundLift = 0;
  let landingImpact = 0;
  let labelLift = 0;

  const rotate = (name: string, x: number, y = 0, z = 0) => {
    const joint = joints.get(name);
    if (joint) joint.bone.quaternion.copy(joint.quaternion).multiply(rotation.setFromEuler(euler.set(x, y, z)));
  };
  const matrices = () => {
    root.parent?.updateWorldMatrix(true, false);
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse; updateWorldMatrix
    // alone leaves moved roots with stale skin-space bounds/contact transforms.
    root.updateMatrixWorld(true);
    for (const skeleton of skeletons) skeleton.update();
  };

  // All IK work is in world space, including conversion back into the parent's
  // local rotation, so a room can freely place, rotate and uniformly scale DJs.
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
  const target = new THREE.Vector3(), direction = new THREE.Vector3(), bend = new THREE.Vector3();
  const desiredElbow = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const worldRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion(), deltaRotation = new THREE.Quaternion();
  const aim = (bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) => {
    from.subVectors(end, start).normalize();
    to.subVectors(destination, start).normalize();
    deltaRotation.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(worldRotation).normalize();
    bone.parent!.getWorldQuaternion(parentRotation).normalize().invert();
    bone.quaternion.copy(parentRotation.multiply(deltaRotation.multiply(worldRotation))).normalize();
    bone.updateWorldMatrix(false, true);
  };
  const placeDjHand = (side: 'L' | 'R', x: number, y: number, z: number) => {
    const upper = joints.get(`upperArm_${side}`)?.bone;
    const forearm = joints.get(`forearm_${side}`)?.bone;
    const hand = joints.get(`hand_${side}`)?.bone;
    if (!upper || !forearm || !hand) return;
    upper.getWorldPosition(shoulder);
    forearm.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);
    target.set(x, y, z);
    pivot.localToWorld(target);
    const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(wrist);
    const distance = THREE.MathUtils.clamp(direction.subVectors(target, shoulder).length(), Math.abs(upperLength - lowerLength) + 0.0001, upperLength + lowerLength - 0.0001);
    direction.normalize();
    const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    // Elbows naturally point out and down rather than crossing through the torso.
    bend.set(side === 'L' ? 1 : -1, -0.45, 0).transformDirection(pivot.matrixWorld);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, sideways);
    target.copy(shoulder).addScaledVector(direction, distance);
    aim(upper, shoulder, elbow, desiredElbow);
    forearm.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);
    aim(forearm, elbow, wrist, target);
  };

  const footTarget = new THREE.Vector3();
  const footRotation = new THREE.Quaternion();
  const localMatrix = new THREE.Matrix4();
  const matrixPosition = new THREE.Vector3(), matrixScale = new THREE.Vector3();
  const rotationInPivot = (node: THREE.Object3D, destination: THREE.Quaternion) => {
    matrixInPivot(node, localMatrix).decompose(matrixPosition, destination, matrixScale);
    return destination.normalize();
  };
  const matrixInPivot = (node: THREE.Object3D, destination: THREE.Matrix4): THREE.Matrix4 => {
    if (node === pivot) return destination.identity();
    if (node.parent) matrixInPivot(node.parent, destination); else destination.identity();
    if (node.matrixAutoUpdate) node.updateMatrix();
    return destination.multiply(node.matrix);
  };
  const aimInPivot = (bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) => {
    from.subVectors(end, start).normalize(); to.subVectors(destination, start).normalize();
    deltaRotation.setFromUnitVectors(from, to);
    rotationInPivot(bone, worldRotation);
    rotationInPivot(bone.parent!, parentRotation).invert();
    bone.quaternion.copy(parentRotation.multiply(deltaRotation.multiply(worldRotation))).normalize();
  };
  // Dance contacts are solved in the model's own basis. Besides being cheaper,
  // this keeps a late-loaded pose identical under any outer placement/rotation.
  const placeDanceFoot = (side: Contact, destination: THREE.Vector3) => {
    const names = contactBones(side);
    const thigh = joints.get(names[0])?.bone, shin = joints.get(names[1])?.bone, foot = joints.get(names[2])?.bone;
    const rest = feet.get(side);
    if (!thigh || !shin || !foot || !rest) return;
    shoulder.setFromMatrixPosition(matrixInPivot(thigh, localMatrix));
    elbow.setFromMatrixPosition(matrixInPivot(shin, localMatrix));
    wrist.setFromMatrixPosition(matrixInPivot(foot, localMatrix));
    const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(wrist);
    const distance = THREE.MathUtils.clamp(direction.subVectors(destination, shoulder).length(), Math.abs(upperLength - lowerLength) + 0.0001, upperLength + lowerLength - 0.0001);
    direction.normalize();
    const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const bendSign = side.length === 2 ? -1 : 1;
    bend.set(0, 0, bendSign).addScaledVector(direction, -direction.z * bendSign).normalize();
    desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, sideways);
    target.copy(shoulder).addScaledVector(direction, distance);
    aimInPivot(thigh, shoulder, elbow, desiredElbow);
    elbow.setFromMatrixPosition(matrixInPivot(shin, localMatrix));
    wrist.setFromMatrixPosition(matrixInPivot(foot, localMatrix));
    aimInPivot(shin, elbow, wrist, target);
    rotationInPivot(foot.parent!, parentRotation).invert();
    foot.quaternion.copy(parentRotation.multiply(rest.quaternion));
  };
  const placeFoot = (side: Contact, destination: THREE.Vector3, heading: number, blend: number) => {
    const names = contactBones(side);
    const thigh = joints.get(names[0])?.bone, shin = joints.get(names[1])?.bone, foot = joints.get(names[2])?.bone;
    const rest = feet.get(side);
    if (!thigh || !shin || !foot || !rest) return;
    thigh.getWorldPosition(shoulder); shin.getWorldPosition(elbow); foot.getWorldPosition(wrist);
    target.copy(destination);
    const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(wrist);
    const distance = THREE.MathUtils.clamp(direction.subVectors(target, shoulder).length(), Math.abs(upperLength - lowerLength) + 0.0001, upperLength + lowerLength - 0.0001);
    direction.normalize();
    const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    // Knees bend toward the walking direction; the feet keep their planted yaw.
    bend.set(0, 0, side.length === 2 ? -1 : 1).transformDirection(pivot.matrixWorld);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, sideways);
    target.copy(shoulder).addScaledVector(direction, distance);
    aim(thigh, shoulder, elbow, desiredElbow);
    shin.getWorldPosition(elbow); foot.getWorldPosition(wrist);
    aim(shin, elbow, wrist, target);
    foot.parent!.getWorldQuaternion(parentRotation).normalize().invert();
    footRotation.setFromAxisAngle(up, heading).multiply(rest.quaternion);
    footRotation.copy(rest.danceQuaternion.slerp(footRotation, blend));
    foot.quaternion.copy(parentRotation.multiply(footRotation)).normalize();
    foot.updateWorldMatrix(false, true);
  };

  const applyWalking = (motion: ClubMotionState, clock: number) => {
    const blend = THREE.MathUtils.clamp(motion.walkBlend, 0, 1);
    if (blend <= 0 || !Number.isFinite(motion.distance)) return;
    for (const [side, rest] of feet) {
      const foot = joints.get(contactBones(side)[2])?.bone;
      if (foot && rest) { foot.getWorldPosition(rest.dancePosition); foot.getWorldQuaternion(rest.danceQuaternion); }
    }
    for (const joint of joints.values()) {
      joint.dancePosition.copy(joint.bone.position); joint.danceQuaternion.copy(joint.bone.quaternion);
      joint.bone.position.copy(joint.position); joint.bone.quaternion.copy(joint.quaternion);
    }
    dancePivot.copy(pivot.quaternion); pivot.quaternion.identity();
    // Authored foot rests are model-local, but route samples and IK are world-
    // space. Uniform room scaling must affect contacts and stride together.
    const scale = root.getWorldScale(walkingScale).x, worldStrideLength = strideLength * scale;
    const step = motion.distance / worldStrideLength, cycle = (step % 1) * TAU;
    const swing = Math.sin(cycle);
    const hips = joints.get('hips');
    const walkCrouch = kind === 'sword-shield-dog' ? .008 : quadruped ? .024 : .042;
    if (hips) hips.bone.position.y -= walkCrouch + Math.cos(cycle * 2) * .006;
    rotate('hips', 0, swing * 0.028, swing * 0.018);
    rotate('spine', 0.04, -swing * 0.025);
    rotate('chest', -0.015, swing * 0.018);
    rotate('head', 0.055 + Math.sin(clock) * 0.16, Math.sin(clock * 0.5 + phase * TAU) * 0.1, Math.cos(clock * 0.5) * 0.06);
    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1;
      rotate(`upperArm_${side}`, sign * swing * 0.25 - 0.06, 0, sign * 0.1);
      rotate(`forearm_${side}`, -0.28 - sign * swing * 0.1);
      rotate(`hand_${side}`, -0.06);
    }
    if (quadruped) {
      rotate('hips', 0, swing * 0.024, swing * 0.025);
      rotate('spine', Math.sin(cycle * 2) * 0.025, -swing * 0.025);
      rotate('chest', 0, swing * 0.016);
      rotate('head', 0.08 + Math.sin(clock) * 0.19, Math.sin(clock / 2) * 0.12);
    }
    // Blend the body first, then solve the feet. Blending two already-solved
    // knee rotations would shorten the leg and push transitional soles down.
    for (const joint of joints.values()) {
      joint.bone.position.lerpVectors(joint.dancePosition, joint.bone.position, blend);
      joint.bone.quaternion.copy(joint.danceQuaternion.slerp(joint.bone.quaternion, blend));
    }
    pivot.quaternion.copy(dancePivot.slerp(pivot.quaternion, blend));
    matrices();
    root.getWorldPosition(rootWorld);
    for (const [side, rest] of feet) {
      const sidePhase = side === 'L' ? 0 : side === 'R' ? 0.5 : side === 'FL' ? 0.5 : 0;
      const stride = Math.floor(step + sidePhase), footPhase = step + sidePhase - stride;
      const strike = (stride - sidePhase) * worldStrideLength;
      const first = motion.sampleAtDistance?.(strike) ?? clubMotionAtDistance(motion.slot, strike);
      const second = motion.sampleAtDistance?.(strike + worldStrideLength) ?? clubMotionAtDistance(motion.slot, strike + worldStrideLength);
      const stance = 0.62, swingProgress = Math.max(0, (footPhase - stance) / (1 - stance));
      const ease = swingProgress ** 3 * (swingProgress * (swingProgress * 6 - 15) + 10);
      const forward = (rest.position.z + strideLength * 0.28) * scale, sideways = rest.position.x * scale;
      const firstX = first.x + Math.cos(first.heading) * sideways + Math.sin(first.heading) * forward;
      const firstZ = first.z - Math.sin(first.heading) * sideways + Math.cos(first.heading) * forward;
      const secondX = second.x + Math.cos(second.heading) * sideways + Math.sin(second.heading) * forward;
      const secondZ = second.z - Math.sin(second.heading) * sideways + Math.cos(second.heading) * forward;
      const lift = Math.sin(swingProgress * Math.PI) ** 2 * Math.min(0.09, strideLength * 0.22) * scale;
      footTarget.set(firstX + (secondX - firstX) * ease, rootWorld.y + rest.position.y * scale + lift, firstZ + (secondZ - firstZ) * ease);
      footTarget.lerpVectors(rest.dancePosition, footTarget, blend);
      footTarget.y = Math.max(rootWorld.y + rest.position.y * scale, footTarget.y);
      const turn = Math.atan2(Math.sin(second.heading - first.heading), Math.cos(second.heading - first.heading));
      placeFoot(side, footTarget, first.heading + turn * ease, blend);
    }
  };

  const flipCenter = new THREE.Vector3(), rotatedFlipCenter = new THREE.Vector3();
  const applyBackflip = (elapsedMs: number) => {
    const pose = backflipAt(elapsedMs);
    const { tuck, crouch, landing } = pose;
    const compression = crouch * .9 + landing;
    const shortLegs = kind === 'banana-cat' || kind === 'sword-shield-dog';
    const hips = joints.get('hips')!;
    hips.bone.position.y -= compression * (shortLegs ? .012 : quadruped ? .055 : kind === 'feidudu' ? .06 : .10);
    rotate('hips', (quadruped ? .025 : .10) * tuck + .05 * compression);
    rotate('spine', (quadruped ? .05 : kind === 'monster-tower' ? .85 : kind.startsWith('human-') ? .45 : .25) * tuck + .055 * compression);
    rotate('chest', (quadruped ? -.05 : kind === 'monster-tower' ? .50 : kind.startsWith('human-') ? .30 : .15) * tuck);
    rotate('neck', -.15 * tuck);
    rotate('head', -.10 * tuck + .035 * compression);
    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1;
      const armGain = kind === 'sword-shield-dog' ? .18 : kind === 'banana-cat' ? .38 : 1;
      rotate(`upperArm_${side}`, (-.65 * tuck + .18 * crouch - .15 * landing) * armGain, 0, sign * .12 * tuck * armGain);
      rotate(`forearm_${side}`, -.95 * tuck * armGain);
      rotate(`hand_${side}`, .05 * tuck * armGain);
      rotate(`thigh_${side}`, -1.15 * tuck);
      rotate(`shin_${side}`, 2.05 * tuck);
      rotate(`foot_${side}`, -.8 * tuck);
    }
    if (quadruped && tuck > 0) {
      for (const side of ['L', 'R']) {
        rotate(`upperArm_${side}`, 1.0 * tuck);
        rotate(`forearm_${side}`, -1.65 * tuck);
        rotate(`hand_${side}`, .65 * tuck);
      }
    }
    // Grounded anticipation and recovery bend the knees while keeping the
    // authored soles/paws planted. Airborne limbs fold naturally with no IK.
    if (tuck === 0) for (const [side, rest] of feet) placeDanceFoot(side, footTarget.copy(rest.position));
    groundLift = pose.lift * (quadruped ? 1.1 : 1.18) + (kind === 'monster-tower' ? .36 * pose.clearance : 0);
    landingImpact = landing;
    pivot.rotation.x = pose.rotation;
    // The full-size joint tuck rotates around its mass, centered over the root. The
    // navigation root, contact shadow and fixed nameplate never orbit the feet.
    flipCenter.set(0, height * (kind === 'monster-tower' ? .37 : kind === 'human-jiji' ? .54 : kind.startsWith('human-') ? .51 : .55), tuck * (kind === 'human-jiji' ? .33 : kind.startsWith('human-') ? .37 : kind === 'monster-tower' ? .64 : .1));
    rotatedFlipCenter.copy(flipCenter).applyQuaternion(pivot.quaternion);
    pivot.position.set(0, flipCenter.y + groundLift, 0).sub(rotatedFlipCenter);
  };

  const emotionShoulder = new THREE.Vector3(), emotionWrist = new THREE.Vector3();
  const applyEmotion = (action: EmotionAction, elapsedMs: number) => {
    const pose = emotionMotionAt(action, elapsedMs);
    const { weight, hug, chuckle, sway, leftPunch, rightPunch, anticipation, spooky } = pose;
    const shortArms = kind === 'banana-cat' || kind === 'sword-shield-dog';
    const armed = kind === 'sword-shield-dog';
    const torsoGain = shortArms ? .42 : quadruped ? .5 : kind === 'monster-tower' ? .7 : 1;
    const torque = rightPunch - leftPunch;
    const hips = joints.get('hips')!;
    // Only bones move: the navigation root, collision scale and fixed nameplate
    // retain their room placement. Small grounded bends are solved by foot IK.
    if (action === 'love') {
      hips.bone.position.y -= .015 * hug * torsoGain;
      rotate('hips', -.025 * hug * torsoGain, 0, sway * .025 * torsoGain);
      rotate('spine', -.045 * hug * torsoGain, sway * .025 * torsoGain, -sway * .025 * torsoGain);
      rotate('chest', .055 * hug * torsoGain);
      rotate('neck', -.045 * hug * torsoGain);
      rotate('head', -.09 * hug * torsoGain, sway * .08, sway * .12 * torsoGain);
    } else if (action === 'laugh') {
      hips.bone.position.y -= (.025 * weight + Math.abs(chuckle) * .008) * torsoGain;
      rotate('hips', (.02 * weight + chuckle * .01) * torsoGain, 0, sway * .025 * torsoGain);
      rotate('spine', (.075 * weight + chuckle * .025) * torsoGain, 0, -sway * .025 * torsoGain);
      rotate('chest', (-.035 * weight - chuckle * .045) * torsoGain, sway * .025 * torsoGain);
      rotate('neck', (-.025 * weight + chuckle * .025) * torsoGain);
      rotate('head', (-.13 * weight + chuckle * .17) * torsoGain, sway * .09, chuckle * .065 * torsoGain);
    } else if (action === 'punch') {
      const attack = leftPunch + rightPunch;
      const drive = torsoGain * (kind === 'human-jiji' ? .68 : kind.startsWith('human-') ? .94 : (kind === 'panda' || kind === 'feidudu') ? .80 : 1);
      // Root placement stays fixed. The hips drive the weight into the punch,
      // while counter-rotated head and planted feet keep it readable and solid.
      hips.bone.position.y -= (.025 * weight + .02 * anticipation) * drive;
      hips.bone.position.z += (quadruped ? .020 : .09) * attack * drive;
      rotate('hips', ((quadruped ? .015 : .045) * attack - .04 * anticipation) * drive, torque * .09 * drive);
      rotate('spine', (.025 * weight + (quadruped ? .035 : .085) * attack - .06 * anticipation) * drive, torque * .15 * drive);
      rotate('chest', attack * (quadruped ? .03 : .065) * drive, torque * (quadruped ? .38 : .32) * drive);
      rotate('neck', -.04 * weight * drive, -torque * .10 * drive);
      rotate('head', .025 * weight * drive, -torque * .14 * drive);
    } else {
      hips.bone.position.y -= .016 * weight * torsoGain;
      rotate('hips', 0, sway * .04 * torsoGain, sway * .03 * torsoGain);
      rotate('spine', spooky * .025 * torsoGain, -sway * .05 * torsoGain, -sway * .035 * torsoGain);
      rotate('chest', -spooky * .03 * torsoGain, sway * .05 * torsoGain, spooky * .025 * torsoGain);
      rotate('neck', -spooky * .045 * torsoGain);
      rotate('head', spooky * .12 * torsoGain, sway * .12, sway * .16 * torsoGain);
    }
    if (quadruped) {
      // Capybara stays on four limbs. Affection and laughter are soft paw taps;
      // boxing reaches one front paw forward at a time while both hind paws plant.
      for (const [side, rest] of feet) {
        const front = side.length === 2, sign = side.endsWith('L') ? 1 : -1;
        footTarget.copy(rest.position);
        if (front) {
          const jab = sign > 0 ? leftPunch : rightPunch;
          const paw = action === 'love' ? .045 * hug
            : action === 'laugh' ? .018 * weight + Math.max(0, sign * chuckle) * .035
            : action === 'punch' ? .19 * jab : (.04 * weight + sign * spooky * .022);
          footTarget.y += paw;
          footTarget.z += action === 'punch' ? .27 * jab : action === 'love' ? .018 * hug : 0;
          footTarget.x -= sign * (action === 'love' ? .02 * hug : action === 'ghost' ? .025 * weight : 0);
        }
        placeDanceFoot(side, footTarget);
      }
    } else {
      for (const [side, rest] of feet) placeDanceFoot(side, footTarget.copy(rest.position));
      matrices();
      for (const side of ['L', 'R'] as const) {
        const sign = side === 'L' ? 1 : -1;
        const jab = side === 'L' ? leftPunch : rightPunch;
        if (armed && action === 'punch') {
          // Splayed tiny arms strike by yawing toward +Z. Rotating the rigid
          // grips preserves the knife/shield rather than stretching a long arm.
          rotate(`upperArm_${side}`, -.05 * weight, -sign * (.12 * weight + .50 * jab), sign * .02 * weight);
          rotate(`forearm_${side}`, -.05 * weight, -sign * (.08 * weight + .50 * jab));
          rotate(`hand_${side}`, 0, sign * (.14 * weight + .44 * jab));
          continue;
        }
        const upper = joints.get(`upperArm_${side}`)!.bone;
        const forearm = joints.get(`forearm_${side}`)!.bone;
        const hand = joints.get(`hand_${side}`)!.bone;
        emotionShoulder.setFromMatrixPosition(matrixInPivot(upper, localMatrix));
        elbow.setFromMatrixPosition(matrixInPivot(forearm, localMatrix));
        emotionWrist.setFromMatrixPosition(matrixInPivot(hand, localMatrix));
        const reach = emotionShoulder.distanceTo(elbow) + elbow.distanceTo(emotionWrist);
        footTarget.copy(emotionShoulder);
        if (action === 'love') {
          footTarget.x = sign * reach * (.24 - hug * .12);
          footTarget.y -= reach * .20;
          footTarget.z += reach * (.63 - hug * .14);
        } else if (action === 'laugh') {
          footTarget.x = sign * reach * .20;
          footTarget.y -= reach * (.38 + sign * chuckle * .055);
          footTarget.z += reach * .42;
        } else if (action === 'punch') {
          footTarget.x -= sign * reach * (.12 - jab * .05);
          footTarget.y -= reach * (.20 - jab * .16);
          footTarget.z += reach * (.23 + jab * .765 - anticipation * .10);
        } else {
          footTarget.x += sign * reach * .13;
          footTarget.y -= reach * (.03 + sign * spooky * .10);
          footTarget.z += reach * .63;
        }
        // Tiny meme limbs express a compact version of the same gesture. The
        // held knife and shield are rigid skin, with no affine body stretching.
        footTarget.lerpVectors(emotionWrist, footTarget, weight * (armed ? .24 : kind === 'banana-cat' ? (action === 'punch' ? .90 : .62) : 1));
        placeDjHand(side, footTarget.x, footTarget.y, footTarget.z);
        rotate(`hand_${side}`, (action === 'ghost' ? .50 * weight + sign * spooky * .14 : action === 'punch' ? -.10 * weight : -.05 * weight) * (armed ? .2 : 1));
        // The IK solution can choose a different elbow plane at the same wrist
        // position. Blend rotations too, so first/last frames meet authored rest
        // without a branch snap; short limbs keep their compact joint ranges.
        const armWeight = weight * (armed ? .58 : kind === 'banana-cat' ? (action === 'punch' ? .80 : .54) : 1);
        for (const segment of ['upperArm', 'forearm', 'hand']) {
          const joint = joints.get(`${segment}_${side}`)!;
          joint.bone.quaternion.slerp(joint.quaternion, 1 - armWeight);
          const angle = joint.bone.quaternion.angleTo(joint.quaternion);
          const limit = armed ? .62 : kind === 'banana-cat' ? (action === 'punch' ? 1.35 : 1.06) : Math.PI;
          if (angle > limit) joint.bone.quaternion.slerp(joint.quaternion, 1 - limit / angle);
        }
      }
    }
    rotate('tail', 0, (action === 'love' ? sway * .35 : spooky * .20), sway * .06);
    rotate('tailTip', 0, sway * .24);
    for (const side of ['L', 'R']) rotate(`ear_${side}`, chuckle * .12 + spooky * .08);
  };

  const update = (absoluteBeat: number, action: ClubAvatarAction, reducedMotion: boolean, energy = 0.5, locomotion?: ClubMotionState, groupPose?: GroupPose) => {
    if (disposed) return;
    if (groupPose && groupPose.weight <= 0) groupPose = undefined;
    const animationBeat = groupPose?.beat ?? absoluteBeat;
    const beat = Number.isFinite(animationBeat) ? animationBeat % 1024 : 0;
    const posePhase = groupPose ? 0 : phase;
    const selectiveGroup = groupPose?.kind === 'battle' || groupPose?.kind === 'grid';
    const activation = selectiveGroup ? THREE.MathUtils.clamp(groupPose?.activation ?? 1, 0, 1) : 1;
    const unisonPhrase = groupPose?.kind === 'unison' && groupPose.version === 2;
    if (groupPose?.kind === 'unison' || selectiveGroup) action = 'bounce';
    else if (groupPose) action = 'dance';
    const intensity = Number.isFinite(energy) ? THREE.MathUtils.clamp(energy, 0, 1) : 0.5;
    lastPose = { beat, action, reduced: reducedMotion, energy: intensity, locomotion, groupPose };
    if (!loaded) return;
    for (const joint of joints.values()) {
      joint.bone.matrixAutoUpdate = true;
      joint.bone.position.copy(joint.position);
      joint.bone.quaternion.copy(joint.quaternion);
      joint.bone.scale.copy(joint.scale);
    }
    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    groundLift = 0;
    landingImpact = 0;
    labelLift = 0;
    // Small ID-dependent offsets retain a shared beat without identical clones.
    const clock = reducedMotion ? 0 : (beat + posePhase * 0.14) * TAU;
    const groove = Math.sin(clock / 2), counter = Math.cos(clock / 2);
    const pulse = (1 - Math.cos(clock)) * 0.5;
    const power = reducedMotion ? 0 : 0.35 + intensity * 0.65;

    if (options.mode === 'dj') {
      rotate('hips', 0, groove * 0.035 * power, groove * 0.025 * power);
      rotate('spine', 0.04 + pulse * 0.04 * power, -groove * 0.025 * power);
      rotate('chest', 0.02, groove * 0.045 * power);
      rotate('neck', -0.025);
      rotate('head', 0.045 + Math.sin(clock) * 0.24 * power, counter * 0.16 * power, groove * 0.1 * power);
      const cockatoo = kind === 'dj-cockatoo';
      if (cockatoo) {
        rotate('neck', -0.025 - Math.sin(clock - 0.3) * 0.075 * power);
        rotate('head', 0.085 + (Math.sin(clock - 0.55) * 0.48 + Math.sin(clock * 2 - 1.65) * 0.055) * power, Math.cos(clock * 0.5 - 0.35) * 0.24 * power, Math.sin(clock * 0.5 - 0.45) * 0.18 * power);
        rotate('crest', -0.08 + Math.sin(clock - 1) * 0.30 * power, Math.sin(clock * 0.5) * 0.08 * power, Math.sin(clock * 0.5 + 0.6) * 0.095 * power);
        const head = joints.get('head');
        const stretch = 1 + Math.sin(clock - 0.45) * 0.045 * power;
        if (head) head.bone.scale.set(head.scale.x / Math.sqrt(stretch), head.scale.y * stretch, head.scale.z / Math.sqrt(stretch));
        labelLift = height * 0.04 * power;
        // The bird grooves above planted talons; neither its root nor the booth
        // bobs, so the existing floor and camera obstacle remain authoritative.
        for (const side of ['L', 'R'] as const) {
          const rest = feet.get(side);
          if (rest) placeDanceFoot(side, footTarget.copy(rest.position));
        }
      }
      matrices();
      if (cockatoo) {
        const scratch = Math.sin(clock) * 0.065 * power;
        placeDjHand('L', 0.72 + groove * 0.035 * power, 1.16 + pulse * 0.01 * power, 0.48 + scratch);
        placeDjHand('R', -0.72 + counter * 0.035 * power, 1.16 + (1 - pulse) * 0.01 * power, 0.48 - scratch);
      } else {
        placeDjHand('L', 0.4 + groove * 0.025 * power, 1.1 + pulse * 0.012 * power, 0.4 + counter * 0.018 * power);
        placeDjHand('R', -0.4 + counter * 0.02 * power, 1.1 + (1 - pulse) * 0.015 * power, 0.4 - groove * 0.025 * power);
      }
      rotate('hand_L', -0.18, 0.09 * groove * power);
      rotate('hand_R', -0.18, -0.09 * counter * power);
      matrices();
      return;
    }

    // A quiet rest pose is identical for every time/action/energy under reduced motion.
    if (reducedMotion || (options.mode === 'desert' && intensity === 0 && (locomotion?.walkBlend ?? 0) === 0)) {
      if (!quadruped) {
        rotate('forearm_L', -0.12);
        rotate('forearm_R', -0.12);
      }
      matrices();
      return;
    }

    if (isEmotionAction(action) && !groupPose) {
      // As with the finite backflip, navigation owns the feet while moving.
      if ((locomotion?.walkBlend ?? 0) === 0) {
        applyEmotion(action, absoluteBeat * 500);
        matrices();
        return;
      }
      action = 'dance';
    }

    if (options.mode === 'desert' && action === 'wave' && (locomotion?.walkBlend ?? 0) === 0) {
      rotate('upperArm_R', -0.2, 0, -1.85);
      rotate('forearm_R', -0.15, Math.sin(clock * 0.55) * 0.35, Math.sin(clock * 0.7) * 0.24);
      rotate('head', 0.03, Math.sin(clock * 0.25) * 0.08);
      matrices();
      return;
    }

    const personalFlip = action === 'wave' && !groupPose;
    const teamFlip = groupPose?.kind === 'battle' && groupPose.version === 2 && groupPose.phase === 'perform';
    if ((personalFlip || teamFlip) && (locomotion?.walkBlend ?? 0) === 0) {
      const elapsed = teamFlip
        ? groupPose!.backflipElapsedMs ?? (activation > .5 ? personalBackflipTime(groupPose!.beat * 500) : -1)
        : personalBackflipTime(absoluteBeat * 500);
      applyBackflip(elapsed);
      matrices();
      return;
    }
    // Manual navigation has priority over an emote, with four real capy paws.
    if (personalFlip) action = 'dance';

    const bounce = action === 'bounce';
    const spin = action === 'spin';
    const wave = action === 'wave';
    const inPlace = 1 - THREE.MathUtils.clamp(locomotion?.walkBlend ?? 0, 0, 1);
    const drive = (0.72 + intensity * 0.28) * activation;
    const style = groupPose ? 0 : identityPhase(kind) * TAU;
    const elastic = kind.startsWith('monster-') || (kind === 'frog' || kind === 'milk-frog');
    const heavy = (kind === 'panda' || kind === 'feidudu') || kind === 'capybara' || (kind === 'dog' || kind === 'niulai');
    // The long peel column compounds spine/chest/neck/head stretch more than
    // short-bodied rigs; preserve the root bounce while bounding its height.
    const gum = (kind === 'banana-cat' ? 0.62 : elastic ? 1 : heavy ? 0.72 : 0.84) * inPlace * activation;
    const bang = Math.sin(clock + style * 0.25);
    const shake = Math.sin(clock * 0.5 + style);
    // A band-limited recoil has a fast throw and a soft return. Every joint
    // samples the same wave at a later phase, so the motion travels up the body
    // rather than hinging an otherwise rigid figure at its neck. It is analytic
    // (no per-frame spring integration), preserving late-join/seek determinism.
    const recoil = (delay: number) => Math.sin(clock + style * 0.25 - delay) + Math.sin(clock * 2 + style * 0.5 - delay * 2 - 0.55) * 0.18;
    const hipWave = recoil(0), torsoWave = recoil(0.32), chestWave = recoil(0.57);
    const neckWave = recoil(0.82), headWave = recoil(1.02);
    const hopBeats = bounce ? 1 : !groupPose && speciesRig && (kind === 'panda' || kind === 'feidudu') ? 4 : !groupPose && speciesRig && kind === 'cat' ? 1 : 2;
    const hopPhase = (((beat + posePhase * 0.22) / hopBeats) % 1 + 1) % 1;
    const flightPhase = (hopPhase - 0.16) / 0.52;
    const phrase = ((beat % 4) + 4) % 4;
    const pulseWithin = (time: number, start: number, end: number) => {
      const t = (time - start) / (end - start);
      return t > 0 && t < 1 ? Math.sin(t * Math.PI) ** 2 : 0;
    };
    const firstHop = unisonPhrase ? pulseWithin(phrase, 1, 1.65) : 0;
    const secondHop = unisonPhrase ? pulseWithin(phrase, 2, 2.75) : 0;
    const clap = unisonPhrase ? pulseWithin(phrase, 2.95, 3.65) * inPlace * groupPose!.weight : 0;
    const flight = unisonPhrase ? firstHop * 0.76 + secondHop : (groupPose?.kind === 'wave' ? groupPose.wave * groupPose.weight * 0.65 : flightPhase > 0 && flightPhase < 1 ? Math.sin(flightPhase * Math.PI) ** 2 : 0) * activation;
    const preload = unisonPhrase ? pulseWithin(phrase, 0.25, 1) * 1.15 + pulseWithin(phrase, 1.7, 2) * 0.65 : pulseWithin(hopPhase, 0.01, 0.25) * activation;
    const impactPhase = (hopPhase - 0.68) / 0.2;
    const landing = unisonPhrase ? pulseWithin(phrase, 1.65, 1.95) + pulseWithin(phrase, 2.75, 3.05) : (impactPhase > 0 && impactPhase < 1 ? Math.sin(impactPhase * Math.PI) ** 2 : 0) * activation;
    const hopHeight = quadruped ? (bounce ? 0.25 : 0.065) : bounce ? ((kind === 'frog' || kind === 'milk-frog') ? 0.53 : elastic ? 0.45 : heavy ? 0.34 : 0.42) : spin ? 0.12 : wave ? 0.16 : elastic ? 0.25 : 0.2;
    groundLift = flight * hopHeight * drive * inPlace ** 3;
    landingImpact = landing * drive * inPlace;
    pivot.position.y = groundLift;
    if (quadruped) {
      // A horizontal barrel rolls between four grounded limbs. Forelimbs are
      // actual contacts, never remapped into a humanoid arm-pumping animation.
      const rock = Math.sin(clock / 2) * drive;
      const thump = Math.sin(clock) * drive;
      const hips = joints.get('hips');
      if (hips) {
        hips.bone.position.y -= (0.018 + preload * 0.022 + landing * 0.028) * drive * inPlace;
        hips.bone.position.x += rock * 0.016 * inPlace;
      }
      rotate('hips', thump * 0.035, rock * 0.035, rock * 0.065);
      rotate('spine', -thump * 0.045, -rock * 0.045, -rock * 0.035);
      rotate('chest', Math.sin(clock - 0.45) * 0.055 * drive, rock * 0.025);
      rotate('neck', -Math.sin(clock - 0.7) * 0.065 * drive);
      rotate('head', 0.04 + Math.sin(clock - 0.9) * 0.30 * drive, Math.sin(clock / 2 - 0.4) * 0.20 * drive, -rock * 0.08);
      labelLift = height * 0.13 * drive;
      if (spin) pivot.rotation.y = beat * TAU / 2;
      if (unisonPhrase) pivot.rotation.y = (firstHop - secondHop) * Math.PI / 2 * inPlace ** 3 * groupPose!.weight;
      for (const [side, rest] of feet) {
        const front = side.length === 2;
        const sign = side.endsWith('L') ? 1 : -1;
        let tap = front && wave
          ? Math.max(0, sign * Math.sin(clock)) ** 2 * 0.10 * drive
          : Math.max(0, sign * Math.sin(clock / 2 + (front ? Math.PI : 0))) ** 2 * 0.028 * drive;
        if (front && groupPose) {
          const weight = THREE.MathUtils.clamp(groupPose.weight, 0, 1);
          const gesture = groupPose.kind === 'wave' ? groupPose.wave * 0.10
            : groupPose.kind === 'battle' ? Math.max(0, sign * Math.sin(clock)) ** 2 * 0.12
            : groupPose.kind === 'grid' ? pulse * 0.075
            : unisonPhrase ? clap * 0.10 : 0;
          if (groupPose.kind !== 'train') tap = tap * (1 - weight) + gesture * drive * weight;
        }
        footTarget.copy(rest.position); footTarget.y += tap * inPlace;
        placeDanceFoot(side, footTarget);
      }
      if (locomotion) applyWalking(locomotion, clock);
      matrices();
      return;
    }
    const squash = (preload * 0.5 + landing) * drive * inPlace;
    const bodyStretch = 1 - squash * (elastic ? 0.17 : 0.13) + flight * inPlace ** 3 * (elastic ? 0.17 : 0.13);
    // Keep the grounded base narrower than the freely deforming upper bones;
    // full root-volume compensation would push wide hands out of their lane.
    const bodyWidth = bodyStretch ** -0.25;
    pivot.scale.set(bodyWidth, bodyStretch, bodyWidth);
    const crouchScale = kind === 'niulai' ? .35 : kind === 'feidudu' ? .12
      : kind === 'sword-shield-dog' ? .03
      : kind.startsWith('human-') ? Math.min(1, height / 2.28)
      : !speciesRig ? 1
      : kind === 'frog' || kind === 'milk-frog' ? .28
      : kind === 'banana-cat' ? .35 : kind === 'cat' ? .45 : kind === 'panda' ? .65 : 1;
    const crouch = (0.045 + (preload * 0.09 + landing * 0.13) * (bounce ? 1 : 0.65)) * drive * crouchScale;
    const hips = joints.get('hips');
    if (hips) { hips.bone.position.y -= crouch; hips.bone.position.x += shake * 0.055 * drive; }
    rotate('hips', -0.035 + hipWave * 0.045 * drive, shake * (spin ? 0.24 : 0.17) * drive, hipWave * 0.09 * drive);
    rotate('spine', 0.09 + torsoWave * 0.16 * drive, -shake * 0.16 * drive, -torsoWave * 0.095 * drive);
    rotate('chest', -chestWave * 0.16 * drive, Math.sin(clock * 0.5 + style - 0.35) * 0.12 * drive, chestWave * 0.08 * drive);
    rotate('neck', -neckWave * 0.14 * drive, -Math.sin(clock * 0.5 + style - 0.65) * 0.10 * drive, -neckWave * 0.045 * drive);
    rotate('head', 0.12 + headWave * (bounce ? 0.88 : spin ? 0.73 : 0.81) * drive, Math.sin(clock * 0.5 + style - 0.85) * (heavy ? 0.27 : 0.35) * drive, Math.cos(clock * 0.5 + style - 0.7) * (elastic ? 0.31 : 0.25) * drive);
    if (speciesRig) {
      // Anatomical movement signatures use different axes and musical periods,
      // not a phase offset applied to the same human skeleton performance.
      if (kind === 'cat') {
        rotate('hips', -0.025 + bang * 0.045 * drive, shake * 0.11 * drive, bang * 0.10 * drive);
        rotate('spine', 0.045 + Math.sin(clock * 2 - 0.25) * 0.10 * drive, -shake * 0.10 * drive);
        rotate('chest', -Math.sin(clock * 2 - 0.55) * 0.11 * drive, 0, -bang * 0.07 * drive);
        rotate('head', 0.10 + headWave * 0.62 * drive, shake * 0.22 * drive, Math.sin(clock - 0.5) * 0.23 * drive);
      } else if ((kind === 'frog' || kind === 'milk-frog')) {
        rotate('hips', -0.06 - preload * 0.14 * drive + flight * 0.06 * drive, shake * 0.07 * drive, hipWave * 0.035 * drive);
        rotate('spine', 0.12 + torsoWave * 0.21 * drive, -shake * 0.09 * drive);
        rotate('chest', -chestWave * 0.19 * drive, 0, chestWave * 0.035 * drive);
      } else if ((kind === 'dog' || kind === 'niulai')) {
        rotate('hips', hipWave * 0.045 * drive, shake * 0.08 * drive, hipWave * 0.10 * drive);
        rotate('spine', 0.055 + torsoWave * 0.13 * drive, 0, -torsoWave * 0.15 * drive);
        rotate('chest', -chestWave * 0.14 * drive, shake * 0.10 * drive, chestWave * 0.12 * drive);
        rotate('neck', -neckWave * 0.16 * drive, -shake * 0.08 * drive);
        rotate('head', 0.10 + headWave * 0.66 * drive, Math.sin(clock / 2 - 0.8) * 0.28 * drive, -headWave * 0.18 * drive);
      } else if (kind === 'banana-cat') {
        // A tall peel suit sways as one soft column; the tiny face nods inside it.
        const sway = Math.sin(clock / 2), lag = Math.sin(clock / 2 - 0.4);
        rotate('hips', hipWave * 0.025 * drive, sway * 0.055 * drive, sway * 0.08 * drive);
        rotate('spine', torsoWave * 0.045 * drive, -sway * 0.045 * drive, -lag * 0.09 * drive);
        rotate('chest', -chestWave * 0.05 * drive, lag * 0.04 * drive, Math.sin(clock / 2 - 0.8) * 0.07 * drive);
        rotate('neck', -neckWave * 0.035 * drive);
        rotate('head', 0.04 + headWave * 0.20 * drive, -lag * 0.13 * drive, Math.sin(clock - 0.7) * 0.10 * drive);
      } else if (kind === 'sword-shield-dog') {
        // The squat orb waddles while its head and hand-held props stay composed.
        const waddle = Math.sin(clock / 2), lag = Math.sin(clock / 2 - 0.35);
        rotate('hips', hipWave * 0.022 * drive, waddle * 0.09 * drive, waddle * 0.075 * drive);
        rotate('spine', torsoWave * 0.035 * drive, -waddle * 0.065 * drive, -lag * 0.065 * drive);
        rotate('chest', -chestWave * 0.04 * drive, lag * 0.05 * drive, lag * 0.045 * drive);
        rotate('neck', -neckWave * 0.03 * drive);
        rotate('head', 0.025 + headWave * 0.14 * drive, -lag * 0.12 * drive, -headWave * 0.045 * drive);
      } else if ((kind === 'panda' || kind === 'feidudu')) {
        const roll = Math.sin(clock / 2), lag = Math.sin(clock / 2 - 0.45);
        rotate('hips', 0.035 + Math.sin(clock) * 0.035 * drive, roll * 0.16 * drive, roll * 0.16 * drive);
        rotate('spine', 0.09 + lag * 0.11 * drive, -roll * 0.10 * drive, -lag * 0.12 * drive);
        rotate('chest', -Math.sin(clock / 2 - 0.8) * 0.10 * drive, lag * 0.09 * drive);
        rotate('neck', -Math.sin(clock / 2 - 1) * 0.12 * drive);
        rotate('head', 0.1 + headWave * 0.55 * drive, -lag * 0.22 * drive, Math.cos(clock / 2 - 0.8) * 0.22 * drive);
      }
    }
    // Volume-compensated deformation follows the rotation wave. Neck stretch
    // stays subtle to keep the face joined; chest/spine carry the soft-body feel.
    const headStretch = 1 + gum * (flight * 0.13 + Math.sin(clock - 1.05) * 0.12 - landing * 0.07);
    const neckStretch = 1 + gum * (Math.sin(clock - 0.8) * 0.045 + flight * 0.035);
    labelLift = height * (inPlace * 0.12 + Math.max(0, headStretch - 1) * 0.4 + Math.max(0, neckStretch - 1) * 0.2);
    for (const [name, stretch] of [
      ['head', headStretch], ['neck', neckStretch],
      ['chest', 1 + gum * (Math.sin(clock - 0.6) * 0.065 + flight * 0.035 - landing * 0.035)],
      ['spine', 1 + gum * (Math.sin(clock - 0.35) * 0.055 + flight * 0.045 - landing * 0.04)],
    ] as const) {
      const joint = joints.get(name);
      if (joint) joint.bone.scale.set(joint.scale.x / Math.sqrt(stretch), joint.scale.y * stretch, joint.scale.z / Math.sqrt(stretch));
    }

    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1;
      const pump = (1 + Math.sin(clock + sign * Math.PI * 0.5 + style * 0.3)) * 0.5;
      if (bounce) {
        rotate(`upperArm_${side}`, -0.2 - pump * 0.35, sign * shake * 0.16, sign * (0.8 + flight * 1.35 + pump * 0.35) * drive);
        rotate(`forearm_${side}`, -0.7 - (1 - flight) * 0.65, 0, sign * 0.12);
      } else if (spin) {
        rotate(`upperArm_${side}`, -0.2 + sign * bang * 0.2, sign * 0.12, sign * (0.65 + pump * 0.7) * drive);
        rotate(`forearm_${side}`, -0.9 - pump * 0.35);
      } else {
        rotate(`upperArm_${side}`, -0.2 + sign * bang * 0.34 * drive, sign * shake * 0.12, sign * (0.55 + pump * 1.4) * drive);
        rotate(`forearm_${side}`, -0.5 - (1 - (1 + Math.sin(clock + sign * Math.PI * 0.5 + style * 0.3 - 0.42)) * 0.5) * 0.75, sign * chestWave * 0.12);
      }
      if (speciesRig && (kind === 'panda' || kind === 'feidudu') && !bounce) {
        rotate(`upperArm_${side}`, -0.20 + sign * bang * 0.22 * drive, sign * shake * 0.08, sign * (0.4 + pump * 0.85) * drive);
        rotate(`forearm_${side}`, -1.15 - (1 - pump) * 0.38);
      }
      rotate(`hand_${side}`, -0.08, sign * shake * 0.16, sign * Math.sin(clock + sign * Math.PI * 0.5 - 0.8) * 0.26 * drive);
    }
    if (spin) pivot.rotation.y = beat * TAU / 2;
    if (unisonPhrase) pivot.rotation.y = (firstHop - secondHop) * Math.PI / 2 * inPlace ** 3 * groupPose!.weight;
    if (wave) {
      rotate('upperArm_L', -0.2, -0.15, 2.3 + bang * 0.2 * drive);
      rotate('forearm_L', -0.15, Math.sin(clock * 2) * 0.2 * drive, 0.55 + Math.sin(clock * 2) * 0.6 * drive);
      rotate('hand_L', 0, 0, Math.cos(clock * 2) * 0.4 * drive);
    }
    if (inPlace > 0) {
      for (const side of ['L', 'R'] as const) {
        const rest = feet.get(side);
        if (!rest) continue;
        const sign = side === 'L' ? 1 : -1;
        const stepLift = bounce ? flight * 0.035 : Math.max(0, sign * Math.sin(clock * 0.5)) ** 2 * 0.055;
        footTarget.set(rest.position.x, rest.position.y + stepLift, rest.position.z + sign * shake * 0.035 * activation);
        placeDanceFoot(side, footTarget);
      }
    }
    if (locomotion) applyWalking(locomotion, clock);
    if (speciesRig) {
      const appendageDrive = drive * (0.55 + inPlace * 0.45);
      rotate('tail', Math.sin(clock / 2 - 0.7) * 0.18 * appendageDrive, Math.sin(clock - 0.5) * 0.42 * appendageDrive, Math.cos(clock / 2) * 0.16 * appendageDrive);
      rotate('tailTip', Math.sin(clock - 1.1) * 0.24 * appendageDrive, Math.sin(clock - 1) * 0.35 * appendageDrive);
      for (const side of ['L', 'R'] as const) {
        const sign = side === 'L' ? 1 : -1;
        rotate(`ear_${side}`, Math.sin(clock - 1.35 + sign * 0.18) * 0.27 * appendageDrive, 0, sign * (0.08 + Math.sin(clock - 1.1) * 0.19) * appendageDrive);
      }
    }
    // Upper-body choreography is layered after foot IK, so the train can reach
    // forward while its feet continue to plant on the actual shared path.
    if (groupPose && groupPose.weight > 0 && groupPose.kind !== 'unison') {
      const weight = THREE.MathUtils.clamp(groupPose.weight, 0, 1);
      const groupRotate = (name: string, x: number, y: number, z: number) => {
        const joint = joints.get(name);
        if (!joint) return;
        beforeGroupRotation.copy(joint.bone.quaternion);
        rotate(name, x, y, z);
        joint.bone.quaternion.copy(beforeGroupRotation.slerp(joint.bone.quaternion, weight));
      };
      for (const side of ['L', 'R'] as const) {
        const sign = side === 'L' ? 1 : -1;
        if (groupPose.kind === 'wave') {
          groupRotate(`upperArm_${side}`, -0.12, 0, sign * (0.22 + groupPose.wave * 2.1));
          groupRotate(`forearm_${side}`, speciesRig && (kind === 'panda' || kind === 'feidudu') ? -0.78 : -0.28, 0, sign * groupPose.wave * 0.12);
          groupRotate(`hand_${side}`, -0.08, 0, sign * groupPose.wave * 0.15);
        } else if (groupPose.kind === 'battle') {
          const throwArm = (1 + sign * Math.sin(clock)) * 0.5;
          groupRotate(`upperArm_${side}`, -0.15 - activation * (0.45 + throwArm * 0.7), sign * activation * 0.12, sign * (0.25 + activation * throwArm * 0.9));
          groupRotate(`forearm_${side}`, (speciesRig && (kind === 'panda' || kind === 'feidudu') ? -1.0 : -0.8) - activation * (1 - throwArm) * 0.55, 0, 0);
          groupRotate(`hand_${side}`, -0.08, 0, sign * activation * 0.12);
        } else if (groupPose.kind === 'grid') {
          groupRotate(`upperArm_${side}`, -0.18, 0, sign * (0.22 + activation * (1.35 + flight * 0.65)));
          groupRotate(`forearm_${side}`, -0.3 - activation * (speciesRig && (kind === 'panda' || kind === 'feidudu') ? 0.75 : 0.55), 0, sign * activation * 0.08);
          groupRotate(`hand_${side}`, -0.06, 0, sign * activation * 0.18);
        } else {
          groupRotate(`upperArm_${side}`, -0.95 + Math.sin(clock) * 0.08, 0, sign * 0.18);
          groupRotate(`forearm_${side}`, -0.45, 0, 0);
          groupRotate(`hand_${side}`, 0.12, 0, 0);
        }
      }
    }
    if (clap > 0) {
      const chest = joints.get('chest')?.bone;
      if (chest) {
        rootWorld.setFromMatrixPosition(matrixInPivot(chest, localMatrix));
        const clapY = rootWorld.y + height * 0.025, clapZ = height * 0.145;
        matrices();
        for (const side of ['L', 'R'] as const) {
          const hand = joints.get(`hand_${side}`)?.bone;
          if (!hand) continue;
          footTarget.setFromMatrixPosition(matrixInPivot(hand, localMatrix));
          footTarget.x += ((side === 'L' ? 0.035 : -0.035) - footTarget.x) * clap;
          footTarget.y += (clapY - footTarget.y) * clap;
          footTarget.z += (clapZ - footTarget.z) * clap;
          placeDjHand(side, footTarget.x, footTarget.y, footTarget.z);
        }
      }
    }
    if (kind === 'banana-cat' || kind === 'sword-shield-dog') {
      // Apply after personal, walking, and group layers so even a clap or arm
      // wave respects tiny limbs. Dog props remain rigidly held by their hands.
      const armGain = kind === 'sword-shield-dog' ? 0.20 : 0.34;
      for (const side of ['L', 'R']) for (const segment of ['upperArm', 'forearm', 'hand']) {
        const joint = joints.get(`${segment}_${side}`);
        if (joint) joint.bone.quaternion.slerp(joint.quaternion, 1 - armGain);
      }
    }
    matrices();
  };

  const release = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    geometries.clear(); materials.clear(); skeletons.clear(); joints.clear(); feet.clear();
    root.remove(pivot);
    pivot.clear();
    loaded = false;
  };
  const install = (source: THREE.Group) => {
    if (disposed) return;
    const model = cloneSkeleton(source) as THREE.Group;
    model.traverse((node) => {
      if (node.userData.speciesRig === 'animal-v2' || node.userData.speciesRig === 'quadruped') speciesRig = true;
      if (node.userData.speciesRig === 'quadruped') quadruped = true;
    });
    const geometryCopies = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const materialCopies = new Map<THREE.Material, THREE.Material>();
    const copyMaterial = (sourceMaterial: THREE.Material) => {
      let copy = materialCopies.get(sourceMaterial);
      if (!copy) {
        copy = sourceMaterial.clone();
        materialCopies.set(sourceMaterial, copy);
        materials.add(copy);
      }
      // Textures, if added to future assets, remain owned by the cached template.
      return copy;
    };
    model.traverse((node) => {
      if (node.userData.role === 'dj') node.visible = options.mode === 'dj';
      if (node instanceof THREE.Bone) joints.set(node.name, { bone: node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), dancePosition: new THREE.Vector3(), danceQuaternion: new THREE.Quaternion() });
      if (!(node instanceof THREE.Mesh)) return;
      let geometry = geometryCopies.get(node.geometry);
      if (!geometry) {
        const copy: THREE.BufferGeometry = node.geometry.clone();
        geometry = copy;
        geometryCopies.set(node.geometry, copy);
        geometries.add(copy);
      }
      node.geometry = geometry;
      node.material = Array.isArray(node.material) ? node.material.map(copyMaterial) : copyMaterial(node.material);
      if (node instanceof THREE.SkinnedMesh) {
        // glTF material primitives can each clone the exact same skin. Share one
        // palette/texture inside this avatar while keeping people independent.
        const identical = [...skeletons].find((skeleton) =>
          skeleton.bones.length === node.skeleton.bones.length
          && skeleton.bones.every((bone, index) => bone === node.skeleton.bones[index]
            && skeleton.boneInverses[index].equals(node.skeleton.boneInverses[index])),
        );
        if (identical && identical !== node.skeleton) {
          node.skeleton.dispose();
          node.skeleton = identical;
        }
        skeletons.add(node.skeleton);
        // Rest-pose bounds do not contain every arm raise; avoid animation popping.
        node.frustumCulled = false;
      }
    });
    if (!skeletons.size || JOINTS.some((name) => !joints.has(name))) {
      release();
      throw new Error(`Avatar ${kind} does not contain the complete dance skeleton`);
    }
    // Refresh inverse binds after authored root scale before measuring actual skin.
    model.updateMatrixWorld(true);
    for (const skeleton of skeletons) skeleton.update();
    model.traverse(node => {
      if (node instanceof THREE.SkinnedMesh) {
        node.computeBoundingBox();
        node.computeBoundingSphere();
      }
    });
    const bounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    model.traverseVisible((node) => {
      if (node instanceof THREE.Mesh) bounds.union(meshBounds.setFromObject(node));
    });
    height = bounds.max.y - bounds.min.y;
    footprintRadius = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z));
    groundFootprintRadius = measureAvatarGroundFootprint(model);
    for (const side of (quadruped ? ['L', 'R', 'FL', 'FR'] : ['L', 'R']) as Contact[]) {
      const foot = joints.get(contactBones(side)[2])!.bone;
      feet.set(side, { position: foot.getWorldPosition(new THREE.Vector3()), quaternion: foot.getWorldQuaternion(new THREE.Quaternion()), dancePosition: new THREE.Vector3(), danceQuaternion: new THREE.Quaternion() });
    }
    const thigh = joints.get('thigh_L')!.bone.getWorldPosition(new THREE.Vector3());
    strideLength = THREE.MathUtils.clamp((thigh.y - feet.get('L')!.position.y) * 0.72, 0.24, 0.5);
    pivot.add(model);
    root.add(pivot);
    loaded = true;
    update(lastPose.beat, lastPose.action, lastPose.reduced, lastPose.energy, lastPose.locomotion, lastPose.groupPose);
  };

  let ready: Promise<void>;
  if (options.template) {
    if (options.template instanceof THREE.Group) {
      install(options.template);
      ready = Promise.resolve();
    } else ready = options.template.then(install);
  } else {
    ready = typeof window === 'undefined' ? Promise.resolve() : loadTemplate(kind).then(install);
  }
  return {
    root, kind,
    get height() { return height; },
    get labelHeight() { return height * pivot.scale.y + 0.22 + groundLift + labelLift; },
    get footprintRadius() { return footprintRadius; },
    get groundFootprintRadius() { return groundFootprintRadius; },
    get loaded() { return loaded; },
    get groundLift() { return groundLift; },
    get landingImpact() { return landingImpact; },
    ready, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
