import * as THREE from 'three';
import { clubCameraFrustum, stagePosition } from './club-scene-math.ts';

export type ClubCameraMode = 'overview' | 'third-person';
export interface CameraOrbit { yaw: number; pitch: number }
export interface CameraSubject {
  id?: string;
  position: { x: number; y: number; z: number };
  /** Navigation yaw only. An animated dance/spin pivot must never drive the camera. */
  heading: number;
  height: number;
  radius: number;
  /** Physical dimensions include this display scale; lens distance retains the authored framing. */
  displayScale?: number;
  /** Current hop/deck offset in world metres; navigation remains on the floor. */
  groundLift?: number;
  /** Optional real body for inexpensive, pose-dependent edge protection. */
  framingRoot?: THREE.Object3D;
}
export const DEFAULT_CAMERA_ORBIT: Readonly<CameraOrbit> = Object.freeze({ yaw: 0, pitch: 0 });
export const CAMERA_FOV = 52;
const CAMERA_CLEARANCE = 0.18;
export type CameraObstacle = THREE.Box3 | {
  bounds: THREE.Box3;
  worldToLocal: THREE.Matrix4;
  clearanceScale: number;
};

// Historical unscaled clients retain their original rest-height labels.
const AVATAR_LABEL_CLEARANCE: Readonly<Record<string, number>> = Object.freeze({
  cat: 1, frog: 1.1, dog: 0.95, capybara: 0.4, panda: 1.05,
  'banana-cat': 1.2, 'sword-shield-dog': 1,
  'human-jiji': 1.25, 'human-subeike': 0.9, 'human-lx': 1.15,
  'monster-blob': 1.15, 'monster-tower': 1.45, 'monster-star': 1.05,
  'dj-cockatoo': 0.4,
});

/** Start close to the rest crown and avoid only the currently animated skin.
 * Projection still changes with actor depth and camera movement.
 */
export function avatarLabelAnchor(navigationRoot: THREE.Object3D, height: number, target: THREE.Vector3, preset: string, groundLift = 0, framingRoot?: THREE.Object3D): THREE.Vector3 {
  navigationRoot.getWorldPosition(target);
  const scale = navigationRoot.userData.avatarDisplayScale ?? 1;
  // Keep the everyday name close to the authored crown. Only a current hop or
  // stage stretch raises it; do not reserve the largest possible action forever.
  const clearance = scale > 1 ? .18 : (AVATAR_LABEL_CLEARANCE[preset] ?? 1.45);
  const bodyScale = scale > 1 ? Math.max(scale, navigationRoot.scale.y) : scale;
  target.y += (height + Math.max(0, groundLift)) * bodyScale + clearance * scale;
  // Reuse the small cached skin-probe set only for this frame's visible crown.
  // This is live avoidance, not the old permanently raised action envelope.
  if (scale > 1 && framingRoot) for (const point of followSkinPoints(framingRoot)) target.y = Math.max(target.y, point.y + clearance * scale);
  return target;
}

/** Preserve a solid's rotation. A world AABB wrongly fills the free corners around the diagonal booth. */
export function createCameraObstacle(object: THREE.Object3D): CameraObstacle {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) throw new TypeError('Camera obstacles must be solid meshes');
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const scale = mesh.getWorldScale(new THREE.Vector3());
  return {
    bounds: mesh.geometry.boundingBox!.clone(),
    worldToLocal: mesh.matrixWorld.clone().invert(),
    clearanceScale: 1 / Math.max(0.001, Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))),
  };
}

export function dragCameraOrbit(orbit: CameraOrbit, deltaX: number, deltaY: number): CameraOrbit {
  const yaw = orbit.yaw - (Number.isFinite(deltaX) ? deltaX : 0) * 0.006;
  return {
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    pitch: THREE.MathUtils.clamp(orbit.pitch + (Number.isFinite(deltaY) ? deltaY : 0) * 0.004, -0.04, 0.38),
  };
}

/** First intersection along the subject-to-camera segment, expanded by a small camera radius. */
export function segmentObstacleFraction(start: THREE.Vector3, end: THREE.Vector3, obstacles: readonly CameraObstacle[], clearance = CAMERA_CLEARANCE): number {
  let nearest = 1;
  for (const obstacle of obstacles) {
    const box = obstacle instanceof THREE.Box3 ? obstacle : obstacle.bounds;
    if (box.isEmpty()) continue;
    const localStart = obstacle instanceof THREE.Box3 ? start : start.clone().applyMatrix4(obstacle.worldToLocal);
    const localEnd = obstacle instanceof THREE.Box3 ? end : end.clone().applyMatrix4(obstacle.worldToLocal);
    const padding = clearance * (obstacle instanceof THREE.Box3 ? 1 : obstacle.clearanceScale);
    const delta = new THREE.Vector3().subVectors(localEnd, localStart);
    let entry = 0;
    let exit = 1;
    let intersects = true;
    for (const axis of ['x', 'y', 'z'] as const) {
      const low = box.min[axis] - padding;
      const high = box.max[axis] + padding;
      if (Math.abs(delta[axis]) < 1e-9) {
        if (localStart[axis] < low || localStart[axis] > high) { intersects = false; break; }
      } else {
        const a = (low - localStart[axis]) / delta[axis];
        const b = (high - localStart[axis]) / delta[axis];
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (entry > exit) { intersects = false; break; }
      }
    }
    if (intersects && entry >= 0 && entry <= 1 && exit >= 0) nearest = Math.min(nearest, entry);
  }
  return nearest;
}

type FollowSkinProbe = { mesh: THREE.Mesh; vertex: number; world: THREE.Vector3 };
const followSkinProbes = new WeakMap<THREE.Object3D, FollowSkinProbe[]>();
const probeDirections = [-1, 0, 1].flatMap(x => [-1, 0, 1].flatMap(y => [-1, 0, 1].filter(z => x || y || z).map(z => new THREE.Vector3(x, y, z).normalize())));

/** Cache directional extrema for each dominant bone once. The followed body
 * needs only a few hundred skin probes per frame, rather than every vertex.
 * Grouping by bone retains small hands, feet and props during articulated poses.
 */
function followSkinPoints(root: THREE.Object3D): readonly THREE.Vector3[] {
  let probes = followSkinProbes.get(root);
  if (!probes) {
    probes = [];
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const position = node.geometry.attributes.position;
      if (!position) return;
      const groups = new Map<number, { values: number[]; vertices: number[] }>();
      const weights = node.geometry.attributes.skinWeight, bones = node.geometry.attributes.skinIndex;
      const point = new THREE.Vector3();
      for (let vertex = 0; vertex < position.count; vertex++) {
        let bone = -1, largest = -1;
        if (node instanceof THREE.SkinnedMesh && weights && bones) for (let component = 0; component < 4; component++) {
          const weight = weights.getComponent(vertex, component);
          if (weight > largest) { largest = weight; bone = bones.getComponent(vertex, component); }
        }
        let group = groups.get(bone);
        if (!group) { group = { values: probeDirections.map(() => -Infinity), vertices: probeDirections.map(() => vertex) }; groups.set(bone, group); }
        point.fromBufferAttribute(position, vertex);
        probeDirections.forEach((direction, index) => {
          const value = point.dot(direction);
          if (value > group!.values[index]) { group!.values[index] = value; group!.vertices[index] = vertex; }
        });
      }
      for (const vertex of new Set([...groups.values()].flatMap(group => group.vertices))) probes!.push({ mesh: node, vertex, world: new THREE.Vector3() });
    });
    // A loading placeholder must not permanently cache an empty body.
    if (probes.length) followSkinProbes.set(root, probes);
  }
  root.parent?.updateWorldMatrix(true, false);
  // The SkinnedMesh override refreshes bindMatrixInverse after carriers/scales.
  root.updateMatrixWorld(true);
  const skeletons = new Set<THREE.Skeleton>();
  for (const probe of probes) {
    if (probe.mesh instanceof THREE.SkinnedMesh && !skeletons.has(probe.mesh.skeleton)) {
      probe.mesh.skeleton.update(); skeletons.add(probe.mesh.skeleton);
    }
    probe.mesh.getVertexPosition(probe.vertex, probe.world).applyMatrix4(probe.mesh.matrixWorld);
  }
  return probes.map(probe => probe.world);
}

export function thirdPersonCameraPose(subject: CameraSubject, aspect: number, orbit: CameraOrbit, obstacles: readonly CameraObstacle[] = []) {
  const height = THREE.MathUtils.clamp(subject.height || 1.8, 0.8, 4);
  const radius = THREE.MathUtils.clamp(subject.radius || 0.65, 0.25, 2);
  const safeAspect = Math.max(0.25, Number.isFinite(aspect) ? aspect : 0.75);
  const framingScale = Math.max(1, subject.displayScale ?? 1);
  // Wide quadrupeds and fixed sword/shield props need a little shape-specific
  // edge room. This is capped at 20%, never a proportional 2x scale retreat.
  const shapeClearance = framingScale > 1 ? 1 + THREE.MathUtils.clamp((radius / height - 0.45) * 0.9, 0, 0.2) : 1;
  // A further requested 30% pullback multiplies the previous 20%: 1.2 × 1.3 = 1.56.
  const distance = Math.max(3.4, height / framingScale * 3.05, radius / framingScale / (Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * safeAspect) * 1.45 + radius / framingScale) * shapeClearance * (framingScale > 1 && safeAspect < 0.55 ? 1.09 : 1) * 1.56;
  const pitch = THREE.MathUtils.clamp(orbit.pitch, -0.04, 0.38);
  // Uploaded faces point along navigation +Z. Reverse the rear-camera basis
  // so the default looks at their faces; local orbit remains relative to it.
  const heading = (Number.isFinite(subject.heading) ? subject.heading : 0) + Math.PI;
  const lift = Number.isFinite(subject.groundLift) ? Math.max(0, subject.groundLift!) : 0;
  const origin = new THREE.Vector3(subject.position.x, subject.position.y + lift, subject.position.z);
  const skinPoints = subject.framingRoot ? followSkinPoints(subject.framingRoot) : [];
  const focus = origin.clone().add(new THREE.Vector3(0, height * 0.55, 0));
  const candidate = (angle: number) => {
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const position = origin.clone().addScaledVector(direction, -distance * Math.cos(pitch));
    position.y = origin.y + height * 1.2 + distance * Math.sin(pitch);
    const target = origin.clone().addScaledVector(direction, height / framingScale * 0.7);
    target.y = origin.y + height * (framingScale > 1 ? 0.60 : 0.88);
    // Shift composition upward before retreating. An asymmetric safe region
    // keeps the fixed nameplate above the body, while feet may use the lower
    // edge. Probe margins cover unsampled skin between authored extrema.
    const back = position.clone().sub(target).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
    const up = new THREE.Vector3().crossVectors(back, right);
    const relative = new THREE.Vector3(), tangent = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const top = .65, bottom = .88;
    let retreat = 0, lowerShift = -Infinity, upperShift = Infinity;
    for (const point of skinPoints) {
      relative.subVectors(point, position);
      const depth = -relative.dot(back);
      const vertical = relative.dot(up);
      retreat = Math.max(retreat, Math.abs(relative.dot(right)) / (tangent * safeAspect * .88) - depth);
      lowerShift = Math.max(lowerShift, vertical - top * tangent * depth);
      upperShift = Math.min(upperShift, vertical + bottom * tangent * depth);
    }
    retreat = Math.max(retreat, (lowerShift - upperShift) / (tangent * (top + bottom)));
    const shift = THREE.MathUtils.clamp(0, lowerShift - top * tangent * retreat, upperShift + bottom * tangent * retreat);
    position.addScaledVector(back, retreat).addScaledVector(up, shift);
    target.addScaledVector(up, shift);
    return { position, target, distance: distance + retreat };
  };
  let best = candidate(heading + orbit.yaw);
  let bestFraction = segmentObstacleFraction(focus, best.position, obstacles);
  // Keep the full body framing whenever a nearby clear orbit exists. No camera goes through a solid booth.
  if (bestFraction < 1) for (const offset of [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, Math.PI]) {
    const next = candidate(heading + orbit.yaw + offset);
    const fraction = segmentObstacleFraction(focus, next.position, obstacles);
    if (fraction > bestFraction) { best = next; bestFraction = fraction; }
    if (fraction === 1) break;
  }
  if (bestFraction < 1) best.position.lerpVectors(focus, best.position, Math.max(0, bestFraction - 0.03));
  return { ...best, obstructed: bestFraction < 1 };
}

/** Camera objects are reused; switching views never reconstructs the renderer, world or avatar rigs. */
export class ClubCameraController {
  readonly overview = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.08, 80);
  readonly thirdPerson = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.08, 80);
  private target = new THREE.Vector3();
  private followPosition = new THREE.Vector3();
  private followHeading = 0;
  private orbit = { ...DEFAULT_CAMERA_ORBIT };
  private previousMode: ClubCameraMode | null = null;
  private previousSubject: string | undefined;

  reset() { this.previousMode = null; }

  update(options: {
    width: number; height: number; mode: ClubCameraMode; orbit: CameraOrbit;
    subject: CameraSubject | null; deltaSeconds: number; reducedMotion: boolean; obstacles?: readonly CameraObstacle[];
    /** Freeze navigation yaw during a manual gesture; position following remains active. */
    headingLock?: number;
  }): THREE.OrthographicCamera | THREE.PerspectiveCamera {
    const aspect = Math.max(1, options.width) / Math.max(1, options.height);
    const mode = options.mode === 'third-person' && options.subject ? 'third-person' : 'overview';
    const camera = mode === 'third-person' ? this.thirdPerson : this.overview;
    const snap = this.previousMode !== mode || this.previousSubject !== options.subject?.id || options.reducedMotion;
    const alpha = snap ? 1 : 1 - Math.exp(-10 * THREE.MathUtils.clamp(options.deltaSeconds || 0, 0, 0.1));
    const blendAngle = (current: number, next: number) => snap ? next : current + Math.atan2(Math.sin(next - current), Math.cos(next - current)) * alpha;
    this.orbit.yaw = blendAngle(this.orbit.yaw, options.orbit.yaw);
    this.orbit.pitch += (options.orbit.pitch - this.orbit.pitch) * alpha;
    let pose: { position: THREE.Vector3; target: THREE.Vector3 };
    if (mode === 'third-person' && options.subject) {
      this.followPosition.lerp(options.subject.position, alpha);
      this.followHeading = blendAngle(this.followHeading, options.headingLock ?? options.subject.heading);
      pose = thirdPersonCameraPose({ ...options.subject, position: this.followPosition, heading: this.followHeading }, aspect, this.orbit, options.obstacles);
      if (options.obstacles?.length) {
        const lift = Number.isFinite(options.subject.groundLift) ? Math.max(0, options.subject.groundLift!) : 0;
        const focus = new THREE.Vector3(options.subject.position.x, options.subject.position.y + lift + options.subject.height * 0.55, options.subject.position.z);
        if (segmentObstacleFraction(focus, pose.position, options.obstacles) < 1) {
          pose = thirdPersonCameraPose({ ...options.subject, heading: this.followHeading }, aspect, this.orbit, options.obstacles);
        }
      }
      this.thirdPerson.aspect = aspect;
    } else {
      const center = stagePosition(0, 0.9);
      const target = new THREE.Vector3(center.x, 1.3, center.z);
      const yaw = Math.PI / 4 + this.orbit.yaw;
      const pitch = THREE.MathUtils.clamp(Math.atan2(10, Math.sqrt(200)) + this.orbit.pitch, 0.42, 1.05);
      const radius = Math.sqrt(300);
      pose = { target, position: target.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius, Math.cos(yaw) * Math.cos(pitch) * radius)) };
      Object.assign(this.overview, clubCameraFrustum(options.width, options.height));
    }
    // Smooth the orbit angles, never the chord between camera positions: a 180° drag must not cross the avatar.
    camera.position.copy(pose.position);
    this.target.copy(pose.target);
    camera.lookAt(this.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.previousMode = mode;
    this.previousSubject = options.subject?.id;
    return camera;
  }
}

/** Perspective projection can flip an off-screen point; reject camera-space depth first. */
export function projectCameraLabel(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const cameraSpace = point.clone().applyMatrix4(camera.matrixWorldInverse);
  if (cameraSpace.z >= -0.08) return null;
  const ndc = point.clone().project(camera);
  const x = (ndc.x * 0.5 + 0.5) * width;
  const y = (-ndc.y * 0.5 + 0.5) * height;
  if (!Number.isFinite(x + y + ndc.z) || ndc.z < -1 || ndc.z > 1 || x < 8 || x > width - 8 || y < 8 || y > height - 8) return null;
  return { x, y, depth: ndc.z };
}

/** Keep the followed actor's fixed name reachable without pulling the lens away.
 * Only a visible body can receive this edge treatment; background names retain
 * ordinary projection. The top inset also reserves space for chat/emotion above.
 */
export function projectFollowNameplate(point: THREE.Vector3, body: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const visibleBody = projectCameraLabel(body, camera, width, height);
  if (!visibleBody) return null;
  const cameraSpace = point.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = point.clone().project(camera);
  const inFront = cameraSpace.z < -0.08 && Number.isFinite(ndc.x + ndc.y);
  const x = inFront ? (ndc.x * .5 + .5) * width : visibleBody.x;
  const y = inFront ? (-ndc.y * .5 + .5) * height : 0;
  const horizontalInset = Math.min(68, width / 2);
  return { x: THREE.MathUtils.clamp(x, horizontalInset, width - horizontalInset),
    y: THREE.MathUtils.clamp(y, Math.min(76, height - 8), height - 8), depth: visibleBody.depth };
}

/** Locked front-of-avatar rhythm framing; the actual DJ booth stays on the rear centreline. */
export function danceStageCameraPose(subject: CameraSubject | null, aspect: number) {
  const height = THREE.MathUtils.clamp(subject?.height ?? 2, 0.8, 4);
  const safeAspect = Math.max(0.25, Number.isFinite(aspect) ? aspect : 0.75);
  const centre = subject?.position ?? { ...stagePosition(0, 2.6), y: 0 };
  const framingScale = Math.max(1, subject?.displayScale ?? 1);
  // Reserve the jump above the body by raising composition, not by undoing
  // the twofold avatar size. Narrow phones get only the small edge allowance
  // required by the actual lateral skin poses (rather than a 2x lens retreat).
  const target = new THREE.Vector3(centre.x, centre.y + height * 0.55 + .75 * Math.min(1, framingScale - 1), centre.z);
  const edgeAllowance = framingScale > 1 && safeAspect < 0.55 ? 1.09 : 1;
  const distance = subject ? Math.max(6.8, (height / framingScale + 1.25) * 2.7, (subject.radius / framingScale + 0.9) / (Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * safeAspect) * 1.5) * edgeAllowance : Math.max(12, 13 / safeAspect);
  const forward = stagePosition(0, distance);
  const position = target.clone().add(new THREE.Vector3(forward.x, subject ? distance * 0.16 : distance * 0.4, forward.z));
  if (subject && framingScale > 1 && safeAspect >= .55) {
    // Translate parallel to the image plane: reserve the fixed nickname above
    // the highest keyed jump without retreating or reducing physical scale.
    // Narrow views already have sufficient vertical headroom from their width fit.
    const headroom = new THREE.Vector3(-forward.x * .16 / distance, 1, -forward.z * .16 / distance).normalize().multiplyScalar(.8 * Math.min(1, framingScale - 1));
    position.add(headroom); target.add(headroom);
  }
  return { target, position };
}
