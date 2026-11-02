import * as THREE from 'three';
import { resolveAvatarPreset, SEAT_TTL_MS, type Participant } from './room-types.ts';
import type { AvatarRig } from './club-scene-world';

export const CLUB_SELF_MARKER_COLOR = 0xffd84d;
export const CLUB_SELF_MARKER_EDGE_COLOR = 0x2d2512;
export const CLUB_SELF_MARKER_FLOOR_OFFSET = 0.02;
export const CLUB_SELF_MARKER_MAX_RADIUS = 0.84;
const TARGET_DIAMETER_PX = 34;

/** Rest-pose support radii measured from the shipped GLBs' foot-weighted
 * vertices (also front paws for the capybara). Head, tail and held props do not
 * enlarge the marker. Keep these catalog values stable throughout animation.
 */
const FOOTPRINTS: Readonly<Record<string, { radius: number; height: number }>> = Object.freeze({
  cat: { radius: 0.384, height: 1.445 },
  frog: { radius: 0.592, height: 1.071 },
  dog: { radius: 0.295, height: 1.947 },
  capybara: { radius: 0.603, height: 1.239 },
  panda: { radius: 0.442, height: 1.816 },
  'milk-frog': { radius: 0.292, height: 1.25 },
  niulai: { radius: 0.367, height: 1.5 },
  feidudu: { radius: 0.276, height: 1.25 },
  miaocuijiao: { radius: 0.318, height: 1.125 },
  'banana-cat': { radius: 0.244, height: 1.5 },
  'sword-shield-dog': { radius: 0.544, height: 0.95 },
  'human-jiji': { radius: 0.245, height: 1.45 },
  'human-subeike': { radius: 0.276, height: 1.45 },
  'human-lx': { radius: 0.285, height: 1.45 },
  'human-kelly': { radius: 0.237, height: 1.45 },
  'human-bear': { radius: 0.245, height: 1.45 },
  'human-jiaxin': { radius: 0.284, height: 1.45 },
  'monster-tower': { radius: 0.485, height: 2.467 },
  'monster-star': { radius: 0.485, height: 1.733 },
  'monster-blob': { radius: 0.485, height: 1.733 },
});

/** A small screen-space assist, never an unlimited distant billboard. The
 * 34px goal yields to the 18% enlargement and absolute world-space size caps.
 */
export function clubSelfMarkerRadius(preset: string, height: number, pixelsPerWorldUnit?: number): number {
  const footprint = FOOTPRINTS[preset] ?? { radius: 0.4, height: 1.8 };
  const modelHeight = Number.isFinite(height) && height > 0 ? height : footprint.height;
  const scale = THREE.MathUtils.clamp(modelHeight / footprint.height, 0.75, 1.5);
  const natural = Math.max((footprint.radius + 0.13) * scale, preset.startsWith('human-') ? modelHeight * 0.3 : 0);
  const base = THREE.MathUtils.clamp(natural, 0.48, 0.76);
  const desired = pixelsPerWorldUnit !== undefined && Number.isFinite(pixelsPerWorldUnit) && pixelsPerWorldUnit > 0
    ? TARGET_DIAMETER_PX / (2 * pixelsPerWorldUnit) : base;
  return Math.min(CLUB_SELF_MARKER_MAX_RADIUS, base * 1.18, Math.max(base, desired));
}

type Membership = Pick<Participant, 'id' | 'joinedAt' | 'lastSeenAt' | 'preset' | 'slot'>;
export type ClubSelfMarkerAvatar = Pick<AvatarRig, 'id' | 'preset' | 'root' | 'ambient' | 'desiredVisible' | 'slot'> & {
  participant?: Membership;
  motion: { x: number; z: number };
  model: Pick<AvatarRig['model'], 'root' | 'height' | 'loaded'>;
};

export interface ClubSelfMarkerFrame {
  /** Current authoritative participant identity, never a camera-follow target. */
  ownId: string | null;
  participants: readonly Membership[];
  players: ReadonlyMap<string, ClubSelfMarkerAvatar>;
  /** Shared server clock: expire a retained snapshot before the next refresh. */
  nowServer?: number;
  /** World-space horizontal standing surface, independent of animated feet. */
  floorY?: number;
  camera?: THREE.Camera;
  /** CSS pixels, not the device-pixel-ratio-scaled drawing buffer. */
  viewportHeight?: number;
}

function visibleInScene(node: THREE.Object3D, scene: THREE.Scene): boolean {
  for (let parent: THREE.Object3D | null = node; parent; parent = parent.parent) {
    if (!parent.visible) return false;
    if (parent === scene) return true;
  }
  return false;
}

/** One scene-owned, reusable ground marker. Never attach it to an avatar's
 * navigation root, animated model, skeleton, or a tidal-wave carrier.
 */
export function createClubSelfMarker(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'self-avatar-ground-marker';
  root.visible = false;
  root.userData.floorPickThrough = true;
  const material = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
    color, opacity, transparent: true, depthTest: true, depthWrite: false,
    toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.9, 96), material(CLUB_SELF_MARKER_COLOR, 0.15));
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.89, 1, 96), material(CLUB_SELF_MARKER_EDGE_COLOR));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.908, 0.984, 96), material(CLUB_SELF_MARKER_COLOR));
  fill.name = 'self-marker-fill';
  edge.name = 'self-marker-edge';
  ring.name = 'self-marker-ring';
  const meshes = [fill, edge, ring];
  meshes.forEach((mesh, index) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = index * 0.001;
    mesh.renderOrder = index;
    mesh.userData.floorPickThrough = true;
    root.add(mesh);
  });
  scene.add(root);
  const cameraPoint = new THREE.Vector3();
  const avatarWorldScale = new THREE.Vector3();
  let disposed = false;

  function hide() {
    root.visible = false;
    delete root.userData.participantId;
    delete root.userData.joinedAt;
  }

  return {
    root,
    update(frame: ClubSelfMarkerFrame) {
      if (disposed) return;
      const member = frame.ownId ? frame.participants.find(person => person.id === frame.ownId) : undefined;
      const avatar = member ? frame.players.get(member.id) : undefined;
      const floorY = frame.floorY ?? 0;
      // Rejoining under the same ID and profile replacement must never highlight
      // a stale entity. Model load, removal and observer transitions fail closed.
      if (!member || !avatar || avatar.id !== member.id || avatar.ambient || avatar.preset === 'dj-cockatoo' || avatar.preset === 'dj-kunkun'
        || resolveAvatarPreset(avatar.preset) !== resolveAvatarPreset(member.preset) || avatar.slot !== member.slot
        || avatar.participant?.id !== member.id || avatar.participant.joinedAt !== member.joinedAt
        || resolveAvatarPreset(avatar.participant.preset) !== resolveAvatarPreset(member.preset) || avatar.participant.slot !== member.slot
        || !Number.isFinite(member.joinedAt) || !avatar.desiredVisible || !avatar.model.loaded
        || frame.nowServer !== undefined && (!Number.isFinite(frame.nowServer) || !Number.isFinite(member.lastSeenAt) || frame.nowServer - member.lastSeenAt >= SEAT_TTL_MS)
        || !visibleInScene(avatar.root, scene) || !visibleInScene(avatar.model.root, scene)
        || !Number.isFinite(avatar.motion.x) || !Number.isFinite(avatar.motion.z) || !Number.isFinite(floorY)) {
        hide();
        return;
      }
      // motion is the authoritative navigation projection in world space. The
      // body's jumping Y, rolling quaternion and cosmetic float never enter it.
      root.position.set(avatar.motion.x, floorY + CLUB_SELF_MARKER_FLOOR_OFFSET, avatar.motion.z);
      let pixelsPerUnit: number | undefined;
      if (frame.camera && Number.isFinite(frame.viewportHeight) && frame.viewportHeight! > 0) {
        const camera = frame.camera;
        camera.updateWorldMatrix(true, false);
        cameraPoint.copy(root.position).applyMatrix4(camera.matrixWorldInverse);
        const projectedScale = frame.viewportHeight! * Math.abs(camera.projectionMatrix.elements[5]) / 2;
        if (camera instanceof THREE.OrthographicCamera) pixelsPerUnit = projectedScale;
        else if (camera instanceof THREE.PerspectiveCamera && cameraPoint.z < -camera.near) pixelsPerUnit = projectedScale / -cameraPoint.z;
      }
      // The marker is scene-owned, so explicitly carry across the navigation
      // scale while ignoring animated model/carrier offsets and rotations.
      avatar.root.getWorldScale(avatarWorldScale);
      const supportScale = Math.max(Math.abs(avatarWorldScale.x), Math.abs(avatarWorldScale.z));
      const radius = clubSelfMarkerRadius(resolveAvatarPreset(avatar.preset), avatar.model.height, pixelsPerUnit === undefined ? undefined : pixelsPerUnit * supportScale) * supportScale;
      root.scale.set(radius, 1, radius);
      root.visible = true;
      root.userData.participantId = member.id;
      root.userData.joinedAt = member.joinedAt;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hide();
      root.removeFromParent();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      root.clear();
    },
  };
}
