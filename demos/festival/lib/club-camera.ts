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
}
export const DEFAULT_CAMERA_ORBIT: Readonly<CameraOrbit> = Object.freeze({ yaw: 0, pitch: 0 });
export const CAMERA_FOV = 52;
const CAMERA_CLEARANCE = 0.18;
export type CameraObstacle = THREE.Box3 | {
  bounds: THREE.Box3;
  worldToLocal: THREE.Matrix4;
  clearanceScale: number;
};

// Fixed rest-height clearances measured against full skinned bounce/group envelopes,
// rounded up with a margin. These never change with head/body animation or camera mode.
const AVATAR_LABEL_CLEARANCE: Readonly<Record<string, number>> = Object.freeze({
  cat: 1, frog: 1.1, dog: 0.95, capybara: 0.4, panda: 1.05,
  'banana-cat': 1.2, 'sword-shield-dog': 1,
  'human-jiji': 1.25, 'human-subeike': 0.9, 'human-lx': 1.15,
  'monster-blob': 1.15, 'monster-tower': 1.45, 'monster-star': 1.05,
  'dj-cockatoo': 0.4,
});

/** Anchor to navigation, never an animated body/head or the avatar's fade scale.
 * The fixed clearance reserves the elastic hop envelope above each rest height.
 * Projection may still move vertically when the actor changes depth or the camera moves.
 */
export function avatarLabelAnchor(navigationRoot: THREE.Object3D, height: number, target: THREE.Vector3, preset: string): THREE.Vector3 {
  navigationRoot.getWorldPosition(target);
  target.y += height + (AVATAR_LABEL_CLEARANCE[preset] ?? 1.45);
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
    pitch: THREE.MathUtils.clamp(orbit.pitch - (Number.isFinite(deltaY) ? deltaY : 0) * 0.004, -0.04, 0.38),
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

export function thirdPersonCameraPose(subject: CameraSubject, aspect: number, orbit: CameraOrbit, obstacles: readonly CameraObstacle[] = []) {
  const height = THREE.MathUtils.clamp(subject.height || 1.8, 0.8, 4);
  const radius = THREE.MathUtils.clamp(subject.radius || 0.65, 0.25, 2);
  const safeAspect = Math.max(0.25, Number.isFinite(aspect) ? aspect : 0.75);
  const distance = Math.max(3.4, height * 3.05, radius / (Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * safeAspect) * 1.45 + radius);
  const pitch = THREE.MathUtils.clamp(orbit.pitch, -0.04, 0.38);
  const heading = Number.isFinite(subject.heading) ? subject.heading : 0;
  const origin = new THREE.Vector3(subject.position.x, subject.position.y, subject.position.z);
  const focus = origin.clone().add(new THREE.Vector3(0, height * 0.55, 0));
  const candidate = (angle: number) => {
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const position = origin.clone().addScaledVector(direction, -distance * Math.cos(pitch));
    position.y = origin.y + height * 1.2 + distance * Math.sin(pitch);
    const target = origin.clone().addScaledVector(direction, height * 0.7);
    target.y = origin.y + height * 0.88;
    return { position, target };
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
  return { ...best, distance, obstructed: bestFraction < 1 };
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
        const focus = new THREE.Vector3(options.subject.position.x, options.subject.position.y + options.subject.height * 0.55, options.subject.position.z);
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
