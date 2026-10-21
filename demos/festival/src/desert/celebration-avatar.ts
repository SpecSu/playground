import * as THREE from 'three';
import type { ClubAvatar } from '../../lib/club-avatar-rig.ts';
import { seededRandom } from './visual-math.ts';

type Pose = { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
const capture = (node: THREE.Object3D): Pose => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
const restore = (pose: Pose) => { pose.node.position.copy(pose.position); pose.node.quaternion.copy(pose.quaternion); pose.node.scale.copy(pose.scale); };
const matches = (pose: Pose) => pose.node.position.equals(pose.position) && pose.node.quaternion.equals(pose.quaternion) && pose.node.scale.equals(pose.scale);

/** A festival-only, reversible upper-body layer. Navigation still owns placement. */
export function createFestivalCelebrationAvatar(avatar: ClubAvatar, id: string) {
 const bones = new Map<string, THREE.Bone>(), rest = new Map<string, Pose>(), skeletons = new Set<THREE.Skeleton>();
 let pivot: THREE.Object3D | undefined, before: Pose[] = [], applied: Pose[] = [], initialized = false, disposed = false, lift = 0;
 let hash = 2166136261; for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
 const phase = seededRandom(hash)() * .24;
 const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3(), direction = new THREE.Vector3();
 const bend = new THREE.Vector3(), desiredElbow = new THREE.Vector3(), destination = new THREE.Vector3(), target = new THREE.Vector3();
 const from = new THREE.Vector3(), to = new THREE.Vector3(), delta = new THREE.Quaternion(), worldRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
 const affected: THREE.Object3D[] = [];
 const matrices = () => { avatar.root.parent?.updateWorldMatrix(true, false); avatar.root.updateMatrixWorld(true); for (const skeleton of skeletons) skeleton.update(); };
 const initialize = () => {
  if (initialized || !avatar.loaded) return;
  avatar.root.traverse(node => { if (node instanceof THREE.Bone) bones.set(node.name, node); if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
  pivot = avatar.root.getObjectByName('avatar-animation-pivot');
  const binds = new Map<THREE.Bone, THREE.Matrix4>();
  for (const skeleton of skeletons) skeleton.bones.forEach((bone, index) => binds.set(bone, skeleton.boneInverses[index].clone().invert()));
  for (const side of ['L', 'R']) for (const segment of ['upperArm', 'forearm', 'hand']) {
   const name = `${segment}_${side}`, bone = bones.get(name); if (!bone) continue;
   const pose = capture(bone), matrix = binds.get(bone)?.clone(), parentBind = bone.parent instanceof THREE.Bone ? binds.get(bone.parent) : undefined;
   if (matrix && parentBind) { matrix.premultiply(parentBind.clone().invert()); matrix.decompose(pose.position, pose.quaternion, pose.scale); }
   rest.set(name, pose); affected.push(bone);
  }
  if (!pivot || affected.length !== 6) return;
  affected.push(pivot); initialized = true;
 };
 const aim = (bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) => {
  from.subVectors(end, start).normalize(); to.subVectors(destination, start).normalize(); delta.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(worldRotation); bone.parent!.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.copy(parentRotation.multiply(delta.multiply(worldRotation))); bone.updateWorldMatrix(false, true);
 };
 const raiseHand = (side: 'L' | 'R', elapsed: number, weight: number) => {
  const upper = bones.get(`upperArm_${side}`)!, lower = bones.get(`forearm_${side}`)!, hand = bones.get(`hand_${side}`)!;
  upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist), reach = a + b;
  if (a < .00001 || b < .00001) return;
  const sideSign = side === 'L' ? 1 : -1;
  // Arm-length-relative targets support the authored human and animal rigs,
  // including the capybara's forepaws, without stretching any mesh or joint.
  // Short forepaws make a gentle low cheer while the body hops; Jiji's
  // hands cheer in front of her hair. Avoid human overhead poses on tiny legs.
  const sway = Math.sin(elapsed * 2.4 + phase) * .025;
  if (avatar.kind === 'miaocuijiao') destination.set(sideSign * (.5 + sway), -.65 + sway, .55);
  else if (avatar.kind === 'human-jiji') destination.set(sideSign * (.25 + sway), .35, .9);
  else destination.set(sideSign * (.34 + sway), .86, .1);
  destination.transformDirection(avatar.root.matrixWorld).multiplyScalar(reach).add(shoulder);
  const distance = THREE.MathUtils.clamp(direction.subVectors(destination, shoulder).length(), Math.abs(a - b) + .00001, a + b - .00001); direction.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance), sideways = Math.sqrt(Math.max(0, a * a - along * along));
  bend.set(sideSign, 0, .6).transformDirection(avatar.root.matrixWorld); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, sideways); target.copy(shoulder).addScaledVector(direction, distance);
  aim(upper, shoulder, elbow, desiredElbow); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist); aim(lower, elbow, wrist, target);
  for (const segment of ['upperArm', 'forearm', 'hand']) {
   const node = bones.get(`${segment}_${side}`)!, original = before.find(pose => pose.node === node)!;
   node.quaternion.slerp(original.quaternion, 1 - weight);
  }
 };
 const release = () => {
  if (!applied.length) return;
  if (applied.length && applied.every(matches)) before.forEach(restore);
  before = []; applied = []; lift = 0; matrices();
 };
 return {
  get lift() { return lift; },
  update(elapsed: number | null, reducedMotion = false, intensity = 1) {
   if (disposed) return;
   if (elapsed === null || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 35 || intensity <= 0) { release(); return; }
   initialize(); if (!initialized || !pivot) return;
   if (applied.length && applied.every(matches)) before.forEach(restore);
   before = affected.map(capture); for (const pose of rest.values()) restore(pose);
   const time = reducedMotion ? 0 : elapsed;
   const hopPhase = ((time + phase) / (120 / 124)) % 1, flight = (hopPhase - .12) / .63;
   lift = reducedMotion || flight < 0 || flight > 1 ? 0 : Math.sin(flight * Math.PI) ** 2 * Math.min(.32, avatar.height * .13) * intensity;
   pivot.position.y += lift; matrices();
   raiseHand('L', time, intensity); matrices(); raiseHand('R', time, intensity); matrices();
   applied = affected.map(capture);
  },
  dispose() { if (disposed) return; release(); disposed = true; bones.clear(); rest.clear(); skeletons.clear(); affected.length = 0; },
 };
}
