import * as THREE from 'three';
import type { GroupAction } from './room-types';
import type { AvatarRig } from './club-scene-world';
import type { CameraSubject } from './club-camera';
import { createDisposalScope, stagePosition } from './club-scene-math.ts';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
// A wave now occupies the accepted event directly. There is no formation or
// local countdown: server startsAt/endsAt also reconstruct late viewers.
export interface TidalWaveFrame {
  readonly progress: number;
  readonly seconds: number;
  readonly crestU: number;
  readonly crestStrength: number;
  readonly pool: number;
  readonly waterHeight: number;
  readonly phase: 'surge' | 'float' | 'recede';
}

/** Absolute accepted server clock only: late viewers and repeated plays agree. */
export function sampleTidalWave(now: number, event: GroupAction | null | undefined, reducedMotion = false): TidalWaveFrame | null {
  if (reducedMotion || event?.kind !== 'wave' || event.version !== 2 || !Number.isFinite(now) || !Number.isFinite(event.startsAt) || !Number.isFinite(event.endsAt) || !Number.isFinite(event.beatMs) || event.beatMs <= 0) return null;
  const duration = event.endsAt - event.startsAt;
  const elapsed = now - event.startsAt;
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return null;
  const progress = elapsed / duration;
  const pool = smooth(progress / .18) * smooth((.98 - progress) / .26);
  const incoming = progress < .3;
  const crestU = incoming ? -7.2 + 14.6 * clamp(progress / .24) : 8 - 16 * smooth((progress - .65) / .32);
  const crestStrength = incoming
    ? smooth(progress / .02) * smooth((.3 - progress) / .06)
    : .38 * smooth((progress - .65) / .08) * smooth((.98 - progress) / .1);
  return { progress, seconds: elapsed / 1000, crestU, crestStrength, pool, waterHeight: .12 + pool * .46, phase: progress < .28 ? 'surge' : progress < .68 ? 'float' : 'recede' };
}

/** Whole-model buoyancy, never body scaling or a change to navigation position. */
export function sampleTidalFloat(frame: TidalWaveFrame, slot: number, stageU: number, stageV = 0) {
  const index = ((Math.trunc(slot) % 10) + 10) % 10;
  const phase = index * 2.3999632297;
  const arrival = .24 * clamp((stageU + 7.2) / 14.6) - .025;
  const amount = smooth((frame.progress - arrival) / .06) * smooth((.95 - frame.progress) / .2);
  const bob = Math.sin(frame.seconds * 2.5 + phase);
  // A slot-seeded broad tumble makes a messy floating crowd, not two rows.
  // Keep visual scatter on the stage; authoritative roots remain untouched.
  const du = .8 + Math.sin(phase) * .7 + Math.sin(frame.seconds * 1.55 + phase) * .38;
  const dv = Math.cos(phase) * 1.15 + Math.cos(frame.seconds * 1.9 + phase) * .35;
  const drift = stagePosition(Math.max(-4.2, Math.min(4.2, stageU + du)) - stageU, Math.max(-4.2, Math.min(6, stageV + dv)) - stageV);
  return {
    x: drift.x * amount, y: (2.05 + bob * .38 + Math.sin(phase) * .34) * amount, z: drift.z * amount,
    pitch: Math.cos(frame.seconds * 2.05 + phase) * .26 * amount,
    roll: Math.sin(frame.seconds * 2.35 + phase) * .43 * amount,
    yaw: Math.sin(frame.seconds * 1.15 + phase) * .4 * amount,
    amount,
  };
}

function curlGeometry() {
  // One open breaking-wave sheet. Its hooked profile and white lip read as a
  // sea wave from either camera, without a screen-filling opaque water wall.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.1, .04, 0), new THREE.Vector3(-2.2, .36, 0),
    new THREE.Vector3(-1.35, 1.3, 0), new THREE.Vector3(-.85, 2.28, 0),
    new THREE.Vector3(-.38, 2.77, 0), new THREE.Vector3(.28, 2.62, 0),
    new THREE.Vector3(.53, 2.16, 0), new THREE.Vector3(.3, 1.9, 0),
    new THREE.Vector3(-.02, 2.08, 0),
  ]);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const sections = 28, widthSegments = 36;
  const dark = new THREE.Color('#087cb7'), bright = new THREE.Color('#57f0ed');
  const color = new THREE.Color();
  for (let row = 0; row <= sections; row++) {
    const p = curve.getPoint(row / sections);
    color.copy(dark).lerp(bright, clamp(p.y / 2.8));
    for (let column = 0; column <= widthSegments; column++) {
      const v = (column / widthSegments - .5) * 13;
      const edge = .48 + .52 * smooth((6.5 - Math.abs(v)) / 1.25);
      const scallop = Math.sin(v * 2.2) * .075 * Math.min(1, p.y);
      positions.push(p.x + Math.sin(v * 1.65) * .1, (p.y + scallop) * edge, v + .5);
      colors.push(color.r, color.g, color.b);
      if (row < sections && column < widthSegments) {
        const a = row * (widthSegments + 1) + column, b = a + widthSegments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

interface FloatCarrier {
  readonly rig: AvatarRig;
  readonly carrier: THREE.Group;
  readonly offset: THREE.Vector3;
}

/** Six pooled draw calls. prepareFrame MUST run before avatar world-space IK. */
export function createClubTidalWave(scene: THREE.Scene) {
  const scope = createDisposalScope();
  const root = new THREE.Group(); root.name = 'shared-tidal-wave'; root.rotation.y = Math.PI / 4; root.visible = false;
  scene.add(root);
  let disposed = false;
  const carriers = new Map<AvatarRig, FloatCarrier>();
  const transform = new THREE.Object3D();
  const actorWorld = new THREE.Vector3(), actorScale = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const water = scope.track(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, emissive: 0x087a98, emissiveIntensity: .4,
    roughness: .24, metalness: .12, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  }));
  const poolMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0x20c7e2, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const foamMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0xd7ffff, transparent: true, opacity: .92, depthWrite: false }));
  const wakeMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0xd7ffff, transparent: true, opacity: .7, depthWrite: false }));
  const sprayMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0x9ffaff, transparent: true, opacity: .85, depthWrite: false }));
  const rippleMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0x9cf8ff, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const crest = new THREE.Mesh(scope.track(curlGeometry()), water); crest.name = 'tidal-curl'; root.add(crest);
  const poolGeometry = scope.track(new THREE.RingGeometry(.23, 1, 64, 6)); poolGeometry.rotateX(-Math.PI / 2); poolGeometry.scale(6.6, 1, 6.9);
  const pool = new THREE.Mesh(poolGeometry, poolMaterial); pool.name = 'tidal-water-surface'; root.add(pool);
  const foamGeometry = scope.track(new THREE.IcosahedronGeometry(1, 1));
  const foam = new THREE.InstancedMesh(foamGeometry, foamMaterial, 72); foam.name = 'tidal-whitecaps'; root.add(foam);
  const spray = new THREE.InstancedMesh(foamGeometry, sprayMaterial, 64); spray.name = 'tidal-spray'; root.add(spray);
  const ringGeometry = scope.track(new THREE.TorusGeometry(1, .026, 4, 40)); ringGeometry.rotateX(-Math.PI / 2);
  const ripples = new THREE.InstancedMesh(ringGeometry, rippleMaterial, 18); ripples.name = 'tidal-floor-ripples'; root.add(ripples);
  const actorFoam = new THREE.InstancedMesh(ringGeometry, wakeMaterial, 10); actorFoam.name = 'tidal-dancer-wakes'; root.add(actorFoam);
  for (const mesh of [foam, spray, ripples, actorFoam]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; }

  const instance = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) => {
    transform.position.set(x, y, z); transform.rotation.set(0, yaw, 0); transform.scale.set(sx, sy, sz); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
  };
  function release(entry: FloatCarrier) {
    entry.carrier.remove(entry.rig.model.root);
    entry.rig.root.add(entry.rig.model.root);
    entry.carrier.removeFromParent();
    carriers.delete(entry.rig);
  }
  function prepareFrame() {
    for (const { carrier, offset } of carriers.values()) {
      carrier.position.set(0, 0, 0); carrier.rotation.set(0, 0, 0); offset.set(0, 0, 0);
    }
  }
  function update(now: number, event: GroupAction | null | undefined, reducedMotion: boolean, rigs: Iterable<AvatarRig>) {
    if (disposed) return;
    const frame = sampleTidalWave(now, event, reducedMotion);
    root.visible = Boolean(frame);
    const current = new Set(rigs);
    for (const entry of carriers.values()) if (!frame || !current.has(entry.rig) || !entry.rig.root.visible) release(entry);
    if (!frame) return;
    const { seconds, crestStrength, crestU, pool: waterAmount, waterHeight } = frame;
    crest.visible = crestStrength > .001;
    crest.position.set(crestU, .04, 0); crest.scale.y = crestStrength;
    water.opacity = .48 * Math.min(1, crestStrength * 3);
    pool.visible = waterAmount > .001; pool.position.y = waterHeight;
    pool.scale.set(1, 1, .94 + .06 * Math.sin(seconds)); poolMaterial.opacity = .22 * waterAmount;
    foam.visible = spray.visible = crestStrength > .001;
    for (let index = 0; index < foam.count; index++) {
      const v = (index % 36 / 35 - .5) * 12.8;
      const edge = .48 + .52 * smooth((6.5 - Math.abs(v)) / 1.25);
      const backLip = index >= 36;
      const bob = Math.sin(v * 2.2 + seconds * 4) * .085;
      const size = (.14 + .05 * Math.sin(index * 2.7) ** 2) * Math.min(1, crestStrength * 2);
      instance(foam, index, crestU + (backLip ? -.32 : .34) + Math.sin(v * 1.65) * .1, ((backLip ? 2.74 : 2.2) + bob) * edge * crestStrength + .055, v + .5, size * 1.1, size * .8, size * 1.9);
    }
    for (let index = 0; index < spray.count; index++) {
      const life = (seconds * .68 + index * .61803398875) % 1;
      const v = Math.sin(index * 2.39996) * 6.1 + .5;
      const size = Math.sin(life * Math.PI) * (.035 + (index % 4) * .018) * Math.min(1, crestStrength * 3);
      instance(spray, index, crestU + .3 + life * (1.3 + index % 3 * .2), (1.7 + Math.sin(life * Math.PI) * 1.7) * crestStrength, v, size, size * (1.6 - life), size);
    }
    for (let index = 0; index < ripples.count; index++) {
      const cycle = .5 - .5 * Math.cos(seconds * 1.55 + index * 2.39996);
      const radius = .3 + cycle * 1.6;
      const angle = index * 2.39996, distance = 2.4 + (index % 4) * .9;
      const fade = Math.sin(cycle * Math.PI) * waterAmount;
      instance(ripples, index, Math.cos(angle) * distance, waterHeight + .025 + index * .001, Math.sin(angle) * distance + .3, radius, fade, radius * .64);
    }
    rippleMaterial.opacity = .45 * waterAmount;
    wakeMaterial.opacity = .7 * waterAmount;
    let wake = 0;
    for (const rig of current) {
      if (!rig.root.visible || rig.id === 'house-dj') continue;
      let entry = carriers.get(rig);
      if (!entry) {
        const carrier = new THREE.Group(); carrier.name = `tidal-float:${rig.id}`;
        rig.root.add(carrier); carrier.add(rig.model.root);
        entry = { rig, carrier, offset: new THREE.Vector3() }; carriers.set(rig, entry);
      }
      const u = (rig.root.position.x - rig.root.position.z) * Math.SQRT1_2;
      const v = (rig.root.position.x + rig.root.position.z) * Math.SQRT1_2;
      const pose = sampleTidalFloat(frame, rig.slot, u, v);
      entry.offset.set(pose.x, pose.y, pose.z);
      // Buoyancy is already expressed in world metres. Convert through the
      // complete navigation transform so enlarged roots do not double drift.
      rig.root.getWorldPosition(actorWorld);
      entry.carrier.position.copy(actorWorld).add(entry.offset);
      rig.root.worldToLocal(entry.carrier.position);
      entry.carrier.rotation.set(pose.pitch, pose.yaw, pose.roll);
      if (wake < actorFoam.count) {
        rig.root.getWorldScale(actorScale);
        const radius = Math.max(.45, rig.model.footprintRadius) * Math.max(Math.abs(actorScale.x), Math.abs(actorScale.z)) * (1 + .22 * Math.sin(seconds * 3 + rig.slot));
        instance(actorFoam, wake++, u + (pose.x - pose.z) * Math.SQRT1_2, waterHeight + .045, v + (pose.x + pose.z) * Math.SQRT1_2, radius, pose.amount, radius * .8);
      }
    }
    // Fixed pool capacity: hidden/replaced NPCs and leave/join cannot leave rings behind.
    for (; wake < actorFoam.count; wake++) instance(actorFoam, wake, 0, 0, 0, 0, 0, 0);
    actorFoam.visible = waterAmount > .001;
    for (const mesh of [foam, spray, ripples, actorFoam]) mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    root, prepareFrame, update,
    addVisualOffset(rig: AvatarRig, target: THREE.Vector3) { const entry = carriers.get(rig); if (entry) target.add(entry.offset); return target; },
    cameraSubject(subject: CameraSubject | null): CameraSubject | null {
      if (!subject) return null;
      for (const entry of carriers.values()) if (entry.rig.id === subject.id) {
        offset.copy(subject.position).add(entry.offset);
        return { ...subject, position: { x: offset.x, y: offset.y, z: offset.z } };
      }
      return subject;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of carriers.values()) release(entry);
      root.removeFromParent(); root.clear(); scope.dispose();
      for (const mesh of [foam, spray, ripples, actorFoam]) mesh.dispose();
    },
  };
}
