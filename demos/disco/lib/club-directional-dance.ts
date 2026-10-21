import * as THREE from 'three';
import { resolveAvatarPreset } from './room-types.ts';
import type { AvatarRig } from './club-scene-world.ts';

export type DanceDirection = 'left' | 'up' | 'down' | 'right';
export const ARTICULATED_GESTURE_MS = 440;
const pulse = (t: number) => t > 0 && t < 1 ? Math.sin(Math.PI * t) ** 2 : 0;
/** Analytic phrases are reconstructible after seek/late join. No cumulative rotations. */
export function directionalDancePose(direction: DanceDirection | undefined, ageMs: number) {
  const t = ageMs / ARTICULATED_GESTURE_MS;
  const weight = direction ? pulse(t) : 0;
  const side = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const flight = direction === 'up' ? pulse((t - 0.18) / 0.62) : 0;
  const preload = direction === 'up' ? pulse(t / 0.24) : 0;
  const landing = direction === 'up' ? pulse((t - 0.76) / 0.24) : 0;
  return { weight, side, hipYaw: side * weight * 0.38, torsoYaw: side * weight * 0.62,
    crouch: direction === 'down' ? weight * 0.43 : (preload * 0.18 + landing * 0.23 + flight * 0.13 + Math.abs(side) * weight * 0.13),
    lift: flight * 1.08, tuck: flight * 0.13 };
}

/** Volume-preserving upper-body rubber, with a delayed head whip and spring-back. */
export function directionalElasticPose(direction: DanceDirection | undefined, ageMs: number) {
  const t = ageMs / ARTICULATED_GESTURE_MS;
  const weight = direction ? pulse(t) : 0;
  const side = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const rebound = direction === 'down' ? pulse((t - 0.55) / 0.45) : 0;
  const flight = direction === 'up' ? pulse((t - 0.18) / 0.62) : 0;
  const compression = direction === 'up' ? pulse(t / 0.24) + pulse((t - 0.76) / 0.24) : 0;
  return {
    torsoStretch: 1 + (direction === 'down' ? -0.18 * weight + 0.16 * rebound : direction === 'up' ? 0.20 * flight - 0.10 * compression : 0.12 * weight + Math.sin(t * Math.PI * 2) * weight * 0.08),
    headStretch: 1 + (direction === 'down' ? -0.16 * weight + 0.13 * rebound : direction === 'up' ? 0.16 * flight - 0.08 * compression : Math.sin(t * Math.PI * 2 - 0.65) * weight * 0.17),
    headWhip: side * Math.sin(t * Math.PI * 2 - 0.65) * weight * 0.27,
    headNod: (direction === 'down' ? weight * 0.20 - rebound * 0.25 : -flight * 0.14),
  };
}

type Save = (node: THREE.Object3D) => void;
type Contact = { upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone; front: boolean };
type Skeleton = { bones: Map<string, THREE.Bone>; contacts: Contact[]; quadruped: boolean };
const skeletons = new WeakMap<THREE.Object3D, Skeleton>();
function skeletonFor(root: THREE.Object3D): Skeleton {
  const cached = skeletons.get(root); if (cached) return cached;
  const bones = new Map<string, THREE.Bone>(); let quadruped = false;
  root.traverse(node => {
    if ((node as THREE.Bone).isBone) bones.set(node.name, node as THREE.Bone);
    if (node.userData.speciesRig === 'quadruped') quadruped = true;
  });
  const contacts: Contact[] = [];
  for (const front of quadruped ? [false, true] : [false]) for (const side of ['L', 'R']) {
    const upper = bones.get(`${front ? 'upperArm' : 'thigh'}_${side}`);
    const lower = bones.get(`${front ? 'forearm' : 'shin'}_${side}`);
    const foot = bones.get(`${front ? 'hand' : 'foot'}_${side}`);
    if (upper && lower && foot) contacts.push({ upper, lower, foot, front });
  }
  const result = { bones, contacts, quadruped };
  // Do not freeze the loading placeholder into the cache.
  if (bones.size) skeletons.set(root, result);
  return result;
}

function aim(bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, target: THREE.Vector3) {
  const from = end.clone().sub(start).normalize(), to = target.clone().sub(start).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).normalize().invert();
  bone.quaternion.copy(parent.multiply(delta.multiply(world))).normalize();
  bone.updateWorldMatrix(false, true);
}

/** A two-link analytic solve keeps both contact position and sole orientation fixed. */
function plant(contact: Contact, target: THREE.Vector3, sole: THREE.Quaternion, forward: THREE.Vector3, save: Save) {
  const { upper, lower, foot } = contact;
  save(upper); save(lower); save(foot);
  const a = upper.getWorldPosition(new THREE.Vector3());
  let b = lower.getWorldPosition(new THREE.Vector3()), c = foot.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  if (l1 < 1e-6 || l2 < 1e-6) return;
  const direction = target.clone().sub(a);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(l1-l2)+1e-7, l1+l2-1e-7);
  direction.normalize();
  const along = (l1*l1-l2*l2+distance*distance)/(2*distance);
  const bend = forward.clone().multiplyScalar(contact.front ? -1 : 1);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq()<1e-8) bend.set(1,0,0).addScaledVector(direction,-direction.x);
  bend.normalize();
  const knee = a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
  aim(upper,a,b,knee);
  b=lower.getWorldPosition(new THREE.Vector3()); c=foot.getWorldPosition(new THREE.Vector3());
  aim(lower,b,c,a.clone().addScaledVector(direction,distance));
  foot.quaternion.copy(foot.parent!.getWorldQuaternion(new THREE.Quaternion()).normalize().invert().multiply(sole)).normalize();
  foot.updateWorldMatrix(false,true);
}

/** Standalone phrases own their jump/elasticity; the stage overlay adds joints to native dance.
 * Stage root rubber remains the sole owner of world lift and whole-body deformation. */
export function applyArticulatedDance(rig: AvatarRig, beat: number, feedback: { direction: DanceDirection; at: number } | null | undefined, now: number, save: Save, mode: 'standalone' | 'overlay' = 'standalone') {
  const overlay = mode === 'overlay';
  const pose = directionalDancePose(feedback?.direction, feedback ? now - feedback.at : -1);
  if (overlay && pose.weight === 0) return;
  const preset = rig.preset === 'dj-cockatoo' || rig.preset === 'dj-kunkun' ? rig.preset : resolveAvatarPreset(rig.preset);
  const { bones, contacts, quadruped } = skeletonFor(rig.model.root);
  const hips=bones.get('hips'); if (!hips || !contacts.length) return;
  rig.root.updateWorldMatrix(true,true);
  const targets=contacts.map(contact=>({point:contact.foot.getWorldPosition(new THREE.Vector3()),sole:contact.foot.getWorldQuaternion(new THREE.Quaternion()).normalize()}));
  const legLength=Math.min(...contacts.map(({upper,lower,foot})=>upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()))+lower.getWorldPosition(new THREE.Vector3()).distanceTo(foot.getWorldPosition(new THREE.Vector3()))));
  const groove=overlay ? 0 : Math.sin(beat*Math.PI), dip=overlay ? 0 : (1-Math.cos(beat*Math.PI*2))*0.012;
  const rotation=(name:string,x:number,y:number,z:number)=>{ const bone=bones.get(name); if(!bone)return; save(bone); bone.rotateX(x);bone.rotateY(y);bone.rotateZ(z); };
  save(hips);
  // Bulky frog thighs and the sword dog's fixed props have less ground clearance.
  const crouchGain = feedback?.direction === 'down' && (preset === 'milk-frog' || preset === 'sword-shield-dog') ? 0.65 : 1;
  hips.position.y-=(pose.crouch*crouchGain+dip)*legLength/Math.max(0.001,hips.parent!.getWorldScale(new THREE.Vector3()).y);
  // This low-bodied cat has short front chains; the old capybara yaw would
  // pull their shoulders beyond reachable planted paws. Keep torso yaw compact.
  const quadrupedTurn = preset === 'miaocuijiao' ? 0.16 : 0.42;
  const hipTurnGain = Math.min(1, legLength / Math.max(0.01, rig.model.height * rig.root.getWorldScale(new THREE.Vector3()).y * 0.35));
  rotation('hips',0,pose.hipYaw*(quadruped?quadrupedTurn:1)*hipTurnGain,groove*0.018*hipTurnGain);
  rotation('spine',pose.crouch*(quadruped?0.08:0.34),pose.torsoYaw*(quadruped?quadrupedTurn:1),-groove*0.025);
  rotation('chest',-pose.crouch*0.10,pose.side*pose.weight*0.10,0);
  rotation('neck',-pose.crouch*0.13,-pose.side*pose.weight*0.20,0);
  rotation('head',pose.crouch*0.10,-pose.side*pose.weight*0.14,groove*0.025);
  if (!quadruped) for(const side of ['L','R']) {
    const sign=side==='L'?1:-1;
    const lead=pose.side*sign;
    const shortArms=preset==='banana-cat'||preset==='sword-shield-dog';
    const reach=shortArms?0.45:1;
    rotation(`upperArm_${side}`,((overlay ? 0 : -0.22)-pose.weight*(0.3+Math.max(0,lead)*0.6)-pose.tuck*2+groove*sign*0.16)*reach,
      -pose.side*pose.weight*0.22*reach,sign*((overlay ? 0 : 0.28)+pose.weight*(0.35+Math.max(0,-lead)*0.5)+pose.tuck*3)*reach);
    rotation(`forearm_${side}`,((overlay ? 0 : -0.52)-pose.weight*0.5+groove*sign*0.10)*reach,0,-sign*pose.weight*0.12*reach);
    rotation(`hand_${side}`,0,-pose.side*pose.weight*0.18,0);
  }
  const elastic = directionalElasticPose(overlay ? undefined : feedback?.direction, feedback ? now-feedback.at : -1);
  const stretch = (name: string, y: number, gain = 1) => {
    const bone = bones.get(name); if (!bone) return;
    save(bone);
    const factor = 1 + (y - 1) * gain;
    bone.scale.multiply(new THREE.Vector3(1 / Math.sqrt(factor), factor, 1 / Math.sqrt(factor)));
  };
  // A quadruped's chest owns its forelegs: never stretch that contact chain.
  // Its head/neck recoil provides elasticity while all four paws retain exact IK.
  if (!quadruped) stretch('spine', elastic.torsoStretch, preset === 'sword-shield-dog' || preset === 'milk-frog' ? 0.45 : preset === 'banana-cat' ? 0.65 : 1);
  stretch('head', elastic.headStretch, preset === 'sword-shield-dog' ? 0.7 : 1);
  rotation('neck', elastic.headNod, 0, -elastic.headWhip * 0.45);
  rotation('head', -elastic.headNod * 0.35, 0, elastic.headWhip);
  const lift = overlay ? 0 : pose.lift;
  if (lift) { save(rig.root); rig.root.position.y += lift; }
  rig.root.updateWorldMatrix(true,true);
  const forward=new THREE.Vector3(0,0,1).transformDirection(rig.root.matrixWorld);
  contacts.forEach((contact,index)=> {
    targets[index].point.y+=lift+pose.tuck*legLength;
    plant(contact,targets[index].point,targets[index].sole,forward,save);
  });
  rig.root.updateWorldMatrix(true,true);
}
