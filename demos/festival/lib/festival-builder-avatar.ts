import { FESTIVAL_CONSTRUCTION_SECONDS } from './festival-timing.ts';
import * as THREE from 'three';
import type { ClubAvatar } from './club-avatar-rig.ts';

export interface FestivalBuilderAvatar {
  /** Seconds since authoritative arrival. Call after avatar.update; null releases the tool. */
  update(elapsedSeconds: number | null, reducedMotion?: boolean): void;
  dispose(): void;
}

type Pose = { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
const capture = (node: THREE.Object3D): Pose => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
const restore = (pose: Pose) => { pose.node.position.copy(pose.position); pose.node.quaternion.copy(pose.quaternion); pose.node.scale.copy(pose.scale); };
const matches = (pose: Pose) => pose.node.position.equals(pose.position) && pose.node.quaternion.equals(pose.quaternion) && pose.node.scale.equals(pose.scale);
const smooth = (a: number, b: number, value: number) => THREE.MathUtils.smoothstep(value, a, b);

/** Festival-only upper-body layer. Shared club rigs and their animation remain unchanged. */
export function createFestivalBuilderAvatar(avatar: ClubAvatar): FestivalBuilderAvatar {
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, Pose>();
  const skeletons = new Set<THREE.Skeleton>();
  let pivot: THREE.Object3D | undefined;
  let quadruped = false;
  let disposed = false;
  let initialized = false;
  let before: Pose[] = [];
  let applied: Pose[] = [];
  let hammer: THREE.Group | undefined;
  let impact: THREE.Group | undefined;
  let impactMaterial: THREE.MeshBasicMaterial | undefined;
  let length = .48;
  const leftSupport = new THREE.Vector3();
  const leftRotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const delta = new THREE.Quaternion();
  const point = new THREE.Vector3();
  const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
  const direction = new THREE.Vector3(), bend = new THREE.Vector3(), desiredElbow = new THREE.Vector3(), target = new THREE.Vector3();
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const parentRotation = new THREE.Quaternion(), worldRotation = new THREE.Quaternion();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const matrices = () => {
    avatar.root.parent?.updateWorldMatrix(true, false);
    avatar.root.updateMatrixWorld(true);
    for (const skeleton of skeletons) skeleton.update();
  };
  const rotate = (name: string, x: number, y = 0, z = 0) => {
    const pose = rest.get(name);
    if (pose) pose.node.quaternion.copy(pose.quaternion).multiply(delta.setFromEuler(euler.set(x, y, z)));
  };
  const aim = (bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) => {
    from.subVectors(end, start).normalize(); to.subVectors(destination, start).normalize();
    delta.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(worldRotation); bone.parent!.getWorldQuaternion(parentRotation).invert();
    bone.quaternion.copy(parentRotation.multiply(delta.multiply(worldRotation)));
    bone.updateWorldMatrix(false, true);
  };
  const placeHand = (side: 'L' | 'R', destination: THREE.Vector3) => {
    const upper = bones.get(`upperArm_${side}`), lower = bones.get(`forearm_${side}`), hand = bones.get(`hand_${side}`);
    if (!upper || !lower || !hand) return;
    upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    if (a < .00001 || b < .00001) return;
    const distance = THREE.MathUtils.clamp(direction.subVectors(destination, shoulder).length(), Math.abs(a - b) + .00001, a + b - .00001);
    direction.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, a * a - along * along));
    bend.set(side === 'R' ? -1 : 1, -.45, quadruped ? -1 : 0).transformDirection(avatar.root.matrixWorld);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    desiredElbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, sideways);
    target.copy(shoulder).addScaledVector(direction, distance);
    aim(upper, shoulder, elbow, desiredElbow);
    lower.getWorldPosition(elbow); hand.getWorldPosition(wrist); aim(lower, elbow, wrist, target);
  };
  const buildHammer = () => {
    const group = new THREE.Group(); group.name = 'festival-builder-hammer';
    const wood = new THREE.MeshStandardMaterial({ color: '#db9a47', roughness: .78 });
    const steel = new THREE.MeshStandardMaterial({ color: '#c4d4d7', roughness: .32, metalness: .75 });
    const grip = new THREE.MeshStandardMaterial({ color: '#303b45', roughness: .9 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, y: number) => {
      geometries.add(geometry); materials.add(material);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.y = y; mesh.castShadow = true; group.add(mesh); return mesh;
    };
    add(new THREE.CylinderGeometry(.032, .038, length, 8), wood, 'festival-builder-hammer-handle', length * .35);
    add(new THREE.CylinderGeometry(.043, .043, length * .24, 8), grip, 'festival-builder-hammer-grip', 0);
    add(new THREE.BoxGeometry(length * .57, length * .24, length * .27), steel, 'festival-builder-hammer-head', length * .84);
    return group;
  };
  const initialize = () => {
    if (initialized || !avatar.loaded) return;
    avatar.root.traverse(node => {
      if (node instanceof THREE.Bone) bones.set(node.name, node);
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
      if (node.userData.speciesRig === 'quadruped') quadruped = true;
    });
    pivot = avatar.root.getObjectByName('avatar-animation-pivot');
    // Decode authored local rest transforms from inverse binds rather than sampling
    // an arbitrary dance/walk frame. This also handles models that arrive mid-job.
    const bind = new Map<THREE.Bone, THREE.Matrix4>();
    for (const skeleton of skeletons) skeleton.bones.forEach((bone, i) => bind.set(bone, skeleton.boneInverses[i].clone().invert()));
    for (const [name, bone] of bones) {
      const pose = capture(bone), matrix = bind.get(bone)?.clone();
      const parentBind = bone.parent instanceof THREE.Bone ? bind.get(bone.parent) : undefined;
      if (matrix && parentBind) { matrix.premultiply(parentBind.clone().invert()); matrix.decompose(pose.position, pose.quaternion, pose.scale); }
      rest.set(name, pose);
    }
    const upper = bones.get('upperArm_R'), lower = bones.get('forearm_R'), hand = bones.get('hand_R');
    if (!upper || !lower || !hand || !pivot) return;
    const reach = rest.get('forearm_R')!.position.length() + rest.get('hand_R')!.position.length();
    length = THREE.MathUtils.clamp(reach * .8, .36, .72);
    hammer = buildHammer();
    // The dog already grips its authored blade. Turn the additional hammer
    // around the same palm so both tools retain independent silhouettes.
    if (avatar.kind === 'sword-shield-dog') hammer.rotation.x = -.95;
    impact = new THREE.Group(); impact.name = 'festival-builder-impact'; impact.visible = false;
    const dustGeometry = new THREE.IcosahedronGeometry(.026, 0);
    impactMaterial = new THREE.MeshBasicMaterial({ color: '#f9d996', transparent: true, opacity: 0, depthWrite: false });
    geometries.add(dustGeometry); materials.add(impactMaterial);
    for (let i = 0; i < 5; i++) impact.add(new THREE.Mesh(dustGeometry, impactMaterial));
    initialized = true;
  };
  const release = () => {
    if (!applied.length && !hammer?.parent) return;
    // If avatar.update already supplied the new walk/emote pose, never overwrite it.
    if (applied.length && applied.every(matches)) before.forEach(restore);
    before = []; applied = []; hammer?.removeFromParent(); impact?.removeFromParent(); matrices();
  };
  return {
    update(elapsedSeconds, reducedMotion = false) {
      if (disposed) return;
      if (elapsedSeconds === null || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= FESTIVAL_CONSTRUCTION_SECONDS) { release(); return; }
      initialize(); if (!initialized || !hammer || !pivot) return;
      // Repeated calls without the base animator are also seekable and reversible.
      if (applied.length && applied.every(matches)) before.forEach(restore);
      before = [...bones.values(), pivot].map(capture);
      for (const pose of rest.values()) restore(pose);
      pivot.position.set(0, 0, 0); pivot.quaternion.identity(); pivot.scale.set(1, 1, 1);
      matrices();
      const left = bones.get('hand_L')!;
      left.getWorldPosition(leftSupport); left.getWorldQuaternion(leftRotation);
      const t = reducedMotion ? .8 : elapsedSeconds;
      const pickup = reducedMotion ? 1 : smooth(0, .6, t);
      // Slow anticipation, crisp downstroke, then a short contact pause.
      const cycle = Math.max(0, t - .6) % 1.2 / 1.2;
      const lift = cycle < .55 ? smooth(0, .55, cycle) : 1 - smooth(.55, .76, cycle);
      const strike = 1 - lift;
      const compact = avatar.kind === 'banana-cat' || avatar.kind === 'sword-shield-dog';
      const lean = (quadruped ? .035 : compact ? .055 : .11) * pickup;
      rotate('spine', lean * (.5 + strike * .5));
      rotate('chest', lean * .35, -.05 * lift * pickup);
      rotate('neck', .05 * pickup); rotate('head', .13 * pickup + strike * .035, -.08 * pickup);
      matrices();
      const upper = bones.get('upperArm_R')!, lower = bones.get('forearm_R')!, hand = bones.get('hand_R')!;
      upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
      const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
      const scale = avatar.root.getWorldScale(point).x;
      point.copy(shoulder); avatar.root.worldToLocal(point);
      const lowForepaw = avatar.kind === 'miaocuijiao';
      point.x -= reach / scale * (lowForepaw ? .06 + lift * .15 : .06 + lift * .49);
      point.y += reach / scale * (lowForepaw ? -.85 + lift * .25 : -.52 + lift * .74);
      point.z += reach / scale * (lowForepaw ? .5 + lift * .05 : .72 - lift * .05);
      avatar.root.localToWorld(point); point.lerpVectors(wrist, point, pickup);
      placeHand('R', point);
      if (quadruped) {
        placeHand('L', leftSupport);
        left.parent!.getWorldQuaternion(parentRotation).invert(); left.quaternion.copy(parentRotation.multiply(leftRotation));
      } else {
        rotate('upperArm_L', -.22 * pickup, 0, -.08 * pickup);
        rotate('forearm_L', -.55 * pickup);
      }
      // Raise the tool to the outside/front of large heads instead of back through
      // their faces. The arm stays within its authored two-bone reach.
      // Hammer orientation is controlled in the avatar's facing basis, independent
      // of species-specific wrist axes. Its origin stays inside the gripping hand.
      avatar.root.getWorldQuaternion(worldRotation);
      worldRotation.multiply(delta.setFromEuler(euler.set((1.25 - lift * .65) * pickup, 0, -.1 + lift * .95)));
      if (lowForepaw) {
        // Keep the short quadruped paw in its natural authored wrist basis.
        // Only the held prop turns; forcing a human wrist axis folds its skin.
        hand.getWorldQuaternion(parentRotation).invert();
        hammer.quaternion.copy(parentRotation.multiply(worldRotation));
      } else {
        hand.parent!.getWorldQuaternion(parentRotation).invert(); hand.quaternion.copy(parentRotation.multiply(worldRotation));
      }
      hand.add(hammer); hammer.visible = true;
      matrices();
      if (impact && impactMaterial) {
        avatar.root.add(impact);
        const burst = (cycle - .76) / .22;
        impact.visible = !reducedMotion && elapsedSeconds > .6 && burst >= 0 && burst < 1;
        if (impact.visible) {
          hammer.getObjectByName('festival-builder-hammer-head')!.getWorldPosition(point);
          impact.position.copy(avatar.root.worldToLocal(point));
          impactMaterial.opacity = (1 - burst) * .72;
          impact.children.forEach((speck, i) => {
            const angle = i * Math.PI * 2 / 5;
            speck.position.set(Math.cos(angle) * burst * .15, burst * .09 - .04, Math.sin(angle) * burst * .12);
            speck.scale.setScalar(1 + burst * 1.7);
          });
        }
      }
      applied = [...bones.values(), pivot].map(capture);
    },
    dispose() {
      if (disposed) return;
      release(); disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear(); materials.clear(); hammer?.clear(); impact?.clear(); bones.clear(); rest.clear(); skeletons.clear();
    },
  };
}
