import * as THREE from 'three';
import type { ClubAvatar } from '../../lib/club-avatar-rig.ts';

/** The previous festival display scale was 2; this hotfix doubles it uniformly. */
export const FESTIVAL_AVATAR_SCENE_SCALE = 4;
const HEAD_GAP = .35;
type Envelope = { mesh: THREE.SkinnedMesh; bone: THREE.Bone; bounds: THREE.Box3 };

/** Cache head/neck skin envelopes once, then move only their corners with bones.
 * Excludes hands and props; no per-frame scan of the uploaded meshes is needed. */
export function createFestivalAvatarHeadAnchor(avatar: ClubAvatar) {
 const envelopes: Envelope[] = [], point = new THREE.Vector3(), transform = new THREE.Matrix4(), bounds = new THREE.Box3();
 let initialized = false, head: THREE.Object3D | undefined;
 const initialize = () => {
  if (initialized || !avatar.loaded) return;
  head = avatar.root.getObjectByName('head');
  avatar.root.traverse(node => {
   if (!(node instanceof THREE.SkinnedMesh)) return;
   const positions = node.geometry.attributes.position, weights = node.geometry.attributes.skinWeight, ids = node.geometry.attributes.skinIndex;
   if (!positions || !weights || !ids) return;
   const boxes = new Map<number, THREE.Box3>();
   for (let i = 0; i < positions.count; i++) {
    let headWeight = 0;
    for (let c = 0; c < 4; c++) if (['head', 'neck'].includes(node.skeleton.bones[ids.getComponent(i, c)].name)) headWeight += weights.getComponent(i, c);
    if (headWeight < .5) continue;
    for (let c = 0; c < 4; c++) {
     if (weights.getComponent(i, c) <= 0) continue;
     const boneIndex = ids.getComponent(i, c);
     let box = boxes.get(boneIndex); if (!box) { box = new THREE.Box3(); boxes.set(boneIndex, box); }
     point.fromBufferAttribute(positions, i).applyMatrix4(node.bindMatrix).applyMatrix4(node.skeleton.boneInverses[boneIndex]);
     box.expandByPoint(point);
    }
   }
   for (const [index, box] of boxes) envelopes.push({ mesh: node, bone: node.skeleton.bones[index], bounds: box });
  });
  initialized = true;
 };
 return {
  update(target: THREE.Vector3): THREE.Vector3 {
   initialize(); avatar.root.updateMatrixWorld(true);
   target.copy(avatar.root.position);
   if (!head || !envelopes.length) { target.y += Math.max(0, avatar.labelHeight - .22) * avatar.root.scale.y + HEAD_GAP; return target; }
   head.getWorldPosition(target);
   let top = -Infinity;
   for (const envelope of envelopes) {
    transform.multiplyMatrices(envelope.mesh.matrixWorld, envelope.mesh.bindMatrixInverse).multiply(envelope.bone.matrixWorld);
    bounds.copy(envelope.bounds).applyMatrix4(transform); top = Math.max(top, bounds.max.y);
   }
   target.y = top + HEAD_GAP; return target;
  },
 };
}
