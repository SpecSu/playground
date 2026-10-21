import * as THREE from 'three';
import { fishingAvatarModelUrl, resolveFishingAvatarPreset } from './fishing-avatar-catalog.ts';
import { createClubAvatar } from './club-avatar-rig.ts';
import { createFishingSurfaceContact, createFishingCatchSurface, type FishingCatchSurface } from './fishing-surface-contact.ts';
import { captureFishingMeshSnapshot, measureFishingCatchBounds } from './fishing-catch-snapshot.ts';
import { getFishingCatchLayout } from './fishing-catch-layout-cache.ts';
import type { FishingCatchWorkerClient } from './fishing-catch-worker-client.ts';
import { removeFishingAvatarProps } from './fishing-avatar-props.ts';
import type { AvatarPreset } from './room-types.ts';
import type { FishingState } from './fishing-types.ts';
import type { FishingActionPose } from './fishing-action-motion.ts';

/** Authored GLB skeletons, grounded feet, and a rod anchored to the solved wrists. */
export function createFishingAvatar(kind: AvatarPreset, id: string, options: { template?: THREE.Group } = {}) {
  // Explicit templates retain their declared identity for offline legacy fixtures.
  // Network-loaded aliases must use the same canonical identity as their asset.
  if (!options.template) kind = resolveFishingAvatarPreset(kind);
  const rig = createClubAvatar(kind, id, { ...options, modelUrl: fishingAvatarModelUrl(kind) });
  let disposed = false, prepared = false, texturedSwordDog = false, uploadedRig = false, lowForelimbs = false;
  let surfaces: ReturnType<typeof createFishingSurfaceContact> | undefined, catchSurface: FishingCatchSurface | undefined;
  let catchLayout: THREE.Vector3 | undefined;
  let catchGeneration = 0, catchController: AbortController | undefined, catchWorker: FishingCatchWorkerClient | undefined;
  const invalidateCatch = () => { catchGeneration++; catchController?.abort(); catchController = undefined; catchLayout = undefined; };
  let lowCatchSpread = false, lowCatchTall = false;
  const supportPose = () => lowForelimbs ? { dy: lowCatchTall ? .2 : -.4, angle: -.2, pitch: .3, pitchR: .3, lean: lowCatchTall ? -.5 : -.35, clavicle: 0 } : texturedSwordDog ? { dy: -.3, angle: -.4, pitch: 0, pitchR: Math.PI / 2, lean: 0, clavicle: 1.05 } : { dy: -.1, angle: -.3, pitch: -Math.PI / 2, pitchR: -Math.PI / 2, lean: 0, clavicle: .15 };
  let lastFishing: Parameters<typeof updateFishing> = [0, 'idle'];
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), worldQ = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const target = new THREE.Vector3(), elbow = new THREE.Vector3(), direction = new THREE.Vector3(), bend = new THREE.Vector3();
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), euler = new THREE.Euler();
  const bones = new Map<string, THREE.Bone>();
  const catchApproachDirection = new THREE.Vector3(0, 0, 1);
  const rodPosition = new THREE.Vector3(), catchPosition = new THREE.Vector3(), rodQuaternion = new THREE.Quaternion();
  const rodGripAxis = new THREE.Vector3(.02, .9, .85).normalize();
  const restGrip = new THREE.Vector3(), restFreeHand = new THREE.Vector3();
  const uprightRod = new THREE.Quaternion().setFromUnitVectors(rodGripAxis, new THREE.Vector3(0, 1, 0));
  const gripDirection = new THREE.Vector3(), lowerGrip = new THREE.Vector3(), upperGrip = new THREE.Vector3();
  const supportLeft = new THREE.Vector3(), supportRight = new THREE.Vector3(), actualUpper = new THREE.Vector3();
  const shoulderLeft = new THREE.Vector3(), shoulderRight = new THREE.Vector3(), upperCenter = new THREE.Vector3();
  const reachDelta = new THREE.Vector3(), pitchAxis = new THREE.Vector3(1, 0, 0);
  const sync = () => {
    rig.root.parent?.updateWorldMatrix(true, false);
    rig.root.updateMatrixWorld(true);
    rig.root.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.skeleton.update(); });
  };
  const aim = (bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) => {
    from.subVectors(end, start).normalize(); to.subVectors(destination, start).normalize();
    q.setFromUnitVectors(from, to); bone.getWorldQuaternion(worldQ).normalize();
    bone.parent!.getWorldQuaternion(parentQ).normalize().invert();
    bone.quaternion.copy(parentQ.multiply(q.multiply(worldQ))).normalize();
    bone.updateWorldMatrix(false, true);
  };
  const hand = (side: 'L' | 'R', point: THREE.Vector3) => {
    const upper = bones.get(`upperArm_${side}`), forearm = bones.get(`forearm_${side}`), wrist = bones.get(`hand_${side}`);
    if (!upper || !forearm || !wrist) return;
    upper.getWorldPosition(a); forearm.getWorldPosition(b); wrist.getWorldPosition(c);
    target.copy(point); rig.root.localToWorld(target);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c); if (l1 < .001 || l2 < .001) return;
    const distance = THREE.MathUtils.clamp(direction.subVectors(target, a).length(), Math.abs(l1 - l2) + .0001, l1 + l2 - .0001);
    direction.normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const sideways = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    bend.set(side === 'L' ? 1 : -1, -.6, uploadedRig ? .8 : 0).transformDirection(rig.root.matrixWorld);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    elbow.copy(a).addScaledVector(direction, along).addScaledVector(bend, sideways);
    target.copy(a).addScaledVector(direction, distance);
    aim(upper, a, b, elbow); forearm.getWorldPosition(b); wrist.getWorldPosition(c);
    aim(forearm, b, c, target);
  };
  const turn = (name: string, x: number, y = 0, z = 0) => {
    const bone = bones.get(name); if (bone) bone.quaternion.multiply(rotation.setFromEuler(euler.set(x, y, z)));
  };
  const reach = (side: 'L' | 'R', shoulder: THREE.Vector3) => {
    bones.get(`upperArm_${side}`)!.getWorldPosition(shoulder); rig.root.worldToLocal(shoulder);
    bones.get(`forearm_${side}`)!.getWorldPosition(a); rig.root.worldToLocal(a);
    bones.get(`hand_${side}`)!.getWorldPosition(b); rig.root.worldToLocal(b);
    return (shoulder.distanceTo(a) + a.distanceTo(b)) * .975;
  };
  const constrainGrip = (center: THREE.Vector3, radius: number) => {
    reachDelta.subVectors(lowerGrip, center);
    if (reachDelta.lengthSq() > radius * radius) lowerGrip.copy(center).add(reachDelta.setLength(radius));
  };
  function updateFishing(time: number, phase: FishingState['phase'], reducedMotion = false, catchWidth = 1, pose?: FishingActionPose, hopProgress?: number, catchSize?: THREE.Vector3) {
    if (disposed) return;
    lastFishing = [time, phase, reducedMotion, catchWidth, pose, hopProgress, catchSize];
    rig.update(0, 'dance', true, 0); if (!rig.loaded) return;
    if (!prepared) {
      removeFishingAvatarProps(rig.root, kind);
      rig.root.traverse(node => { if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name.startsWith('tripo_material')) uploadedRig = true; });
      if (kind === 'sword-shield-dog') rig.root.traverse(node => {
        if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'tripo_material_bbe4da48-88ba-439f-b4fb-f1a42b2075d8') texturedSwordDog = true;
      });
      catchApproachDirection.set(0, 0, 1);
      prepared = true;
    }
    if (!bones.size) rig.root.traverse(o => { if (o instanceof THREE.Bone) bones.set(o.name, o); });
    if (uploadedRig && !surfaces) {
      sync(); surfaces = createFishingSurfaceContact(rig.root, rig.height, texturedSwordDog ? .1 : undefined);
      bones.get('upperArm_L')!.getWorldPosition(a); rig.root.worldToLocal(a);
      lowForelimbs = a.y / rig.height < .3;
    }
    const t = reducedMotion ? 0 : time, breath = Math.sin(t * 1.8) * .012;
    const restMix = pose?.restProgress ?? (phase === 'idle' || phase === 'escaped' ? 1 : 0);
    const h = rig.height, quad = kind === 'capybara';
    const holdingMix = phase === 'holding' ? (pose?.showcaseProgress ?? 1) : 0;
    const holding = supportPose();
    const bodyLean = reducedMotion || lowForelimbs ? 0 : pose?.bodyLean ?? 0;
    const pitch = reducedMotion ? 0 : pose?.rodPitch ?? (phase === 'bite' ? -.1 : 0);
    const tension = phase === 'bite' && !reducedMotion ? Math.sin(t * 18) * .016 : 0;
    turn('head', lowForelimbs ? 0 : .1 - holdingMix * .14 - bodyLean * .4, lowForelimbs ? 0 : Math.sin(t * .55) * .025 * (1 - holdingMix));
    turn('spine', bodyLean * .7 + (lowForelimbs ? 0 : tension));
    turn('chest', bodyLean * .3 + (lowForelimbs ? 0 : breath * .6 * (1 - holdingMix)) + holding.lean * holdingMix - (lowForelimbs ? .5 * (1 - holdingMix) : 0));
    turn('tail', 0, Math.sin(t * 1.2) * .05);
    if (!reducedMotion && hopProgress !== undefined && Number.isFinite(hopProgress) && hopProgress > 0 && hopProgress < 1) {
      // The server-owned seat timeline still moves the outer group. These real
      // bone rotations only add a compact takeoff/flight/landing leg tuck.
      const tuck = Math.sin(hopProgress * Math.PI) ** 2;
      for (const side of ['L', 'R']) {
        turn(`thigh_${side}`, -.28 * tuck);
        turn(`shin_${side}`, .58 * tuck);
        turn(`foot_${side}`, -.3 * tuck);
      }
    }
    if (holding.clavicle && holdingMix > 0) {
      for (const side of ['L','R'] as const) {
        const bone = bones.get(`upperArm_${side}`)!.parent!;
        if (!bone.name.includes('Shoulder')) continue;
        bone.getWorldQuaternion(worldQ).normalize(); rig.root.getWorldQuaternion(parentQ).normalize();
        q.copy(parentQ).invert().multiply(worldQ);
        q.premultiply(rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),(side==='L'?-1:1)*holding.clavicle*holdingMix));
        worldQ.copy(parentQ).multiply(q); bone.parent!.getWorldQuaternion(parentQ).normalize().invert();
        bone.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      }
    }
    sync();

    // Both wrists grip the same physical first rod segment. The body bends above
    // the hips only, so the leg/foot contacts established by the base rig survive.
    gripDirection.copy(rodGripAxis).applyAxisAngle(pitchAxis, pitch + tension);
    const leftReach = reach('L', shoulderLeft), rightReach = reach('R', shoulderRight);
    const halfShoulders = shoulderLeft.distanceTo(shoulderRight) * .5;
    const forwardReach = Math.sqrt(Math.max(.01, Math.min(leftReach, rightReach) ** 2 - halfShoulders ** 2));
    const gripSpan = Math.min(h * .13, forwardReach * .43);
    const oneHanded = halfShoulders >= Math.min(leftReach, rightReach);
    lowerGrip.copy(shoulderLeft).add(shoulderRight).multiplyScalar(.5);
    lowerGrip.y += -forwardReach * .3 + h * (reducedMotion ? 0 : pose?.gripLift ?? 0);
    lowerGrip.z += forwardReach * .55 + h * (reducedMotion ? 0 : pose?.gripReach ?? 0);
    // Project one common handle into both arms' reachable volumes. Independent
    // clamping would leave the wrists apart and turn the rod across the body.
    upperCenter.copy(shoulderLeft).addScaledVector(gripDirection, -gripSpan);
    for (let i = 0; i < 16; i++) { constrainGrip(shoulderRight, rightReach); constrainGrip(upperCenter, leftReach); }
    upperGrip.copy(lowerGrip).addScaledVector(gripDirection, gripSpan);
    if (oneHanded) {
      // This broad-bodied short-arm rig cannot bring its paws together. Use a
      // proper one-handed grip rather than stretching it or pointing the rod sideways.
      lowerGrip.copy(shoulderRight).add(new THREE.Vector3(texturedSwordDog ? -.18 : .075, texturedSwordDog ? .09 : -.055, .105));
      lowerGrip.y += h * (reducedMotion ? 0 : pose?.gripLift ?? 0);
      lowerGrip.z += h * (reducedMotion ? 0 : pose?.gripReach ?? 0);
      constrainGrip(shoulderRight, rightReach);
      upperGrip.copy(shoulderLeft).add(new THREE.Vector3(-.075, -.07, .085));
      upperGrip.y += h * (reducedMotion ? 0 : pose?.gripLift ?? 0) * .45;
    }
    if (holdingMix > 0) {
      const giant = catchWidth > 2.3, span = Math.min(h * .27, Math.max(.1, catchWidth * .27));
      const y = kind === 'miaocuijiao' ? .19 : h * (quad ? .43 : .47), z = kind === 'miaocuijiao' ? .4 : quad ? .95 : giant ? .49 : .54;
      supportLeft.set(span, y, z); supportRight.set(-span, y, z);
      if (texturedSwordDog) supportRight.set(-.6, .44, .35);
      upperGrip.lerp(supportLeft, holdingMix); lowerGrip.lerp(supportRight, holdingMix);
    }
    if (restMix > 0) {
      // Relax the free arm beside the body instead of letting it hover near the
      // handle. The right wrist holds the upright rod just forward of its hip.
      restGrip.copy(shoulderRight).add(new THREE.Vector3(-rightReach * .8, -rightReach * (texturedSwordDog ? .05 : .45), rightReach * .35));
      restFreeHand.copy(shoulderLeft).add(new THREE.Vector3(h * .025, -leftReach * .94, leftReach * .08));
      lowerGrip.lerp(restGrip, restMix); upperGrip.lerp(restFreeHand, restMix);
    }
    if (uploadedRig && !texturedSwordDog) {
      // The authored bodies are much deeper than their short arm bones. Keep the
      // wrist path on a forward/outside reach arc instead of intersecting two
      // abstract arm spheres at the chest. A single hand works the rod; the other
      // can support a catch without having to pass through the body to the shaft.
      const lowPaws = Math.min(shoulderLeft.y, shoulderRight.y) / h < .3;
      const spread = lowCatchSpread ? THREE.MathUtils.smoothstep(holdingMix, 0, 1) : 0;
      for (const [side, grip, shoulder, radius] of [
        ['R', lowerGrip, shoulderRight, rightReach], ['L', upperGrip, shoulderLeft, leftReach],
      ] as const) {
        const sign = side === 'L' ? 1 : -1;
        const lift = h * (reducedMotion ? 0 : pose?.gripLift ?? 0);
        // Raise the short front paws within their original reach. The chest
        // leans back above grounded hips, leaving the lifted forearms outside it.
        const dy = lowPaws ? radius * .1
          : THREE.MathUtils.clamp(-radius * .3 + lift * .4, -radius * .5, -radius * .12);
        const supportAngle = THREE.MathUtils.lerp(.3, lowCatchTall ? .5 : 1.1, spread);
        const angle = THREE.MathUtils.lerp(lowPaws ? supportAngle : .12, side === 'R' ? (lowPaws ? .3 : 1.15) : .35, restMix);
        const horizontal = Math.sqrt(Math.max(.00001, (radius * .98) ** 2 - dy * dy));
        grip.copy(shoulder).add(new THREE.Vector3(sign * horizontal * Math.sin(angle), dy, horizontal * Math.cos(angle)));
      }
    }
    if (uploadedRig && holdingMix > 0) {
      // Meet in front of the body with level support surfaces. Shoulder protraction
      // changes joint angles only: the original upper/forearm lengths stay intact.
      const commonY = (shoulderLeft.y + shoulderRight.y) * .5 + Math.min(leftReach, rightReach) * holding.dy;
      for (const [side, point, shoulder, radius] of [
        ['R', supportRight, shoulderRight, rightReach], ['L', supportLeft, shoulderLeft, leftReach],
      ] as const) {
        const dy = radius * holding.dy;
        const horizontal = Math.sqrt(Math.max(.00001, (radius * .98) ** 2 - dy * dy));
        point.copy(shoulder).add(new THREE.Vector3((side === 'L' ? 1 : -1) * horizontal * Math.sin(holding.angle), dy, horizontal * Math.cos(holding.angle)));
        point.y = commonY;
      }
      supportLeft.z = supportRight.z = Math.min(supportLeft.z, supportRight.z);
      lowerGrip.lerp(supportRight, holdingMix); upperGrip.lerp(supportLeft, holdingMix);
    }
    hand('R', lowerGrip); hand('L', upperGrip);
    turn('hand_L', -.15 * (1 - restMix) - holdingMix * .2, 0, holdingMix * .12);
    turn('hand_R', -.18 - holdingMix * .17, 0, -holdingMix * .12);
    if (kind === 'miaocuijiao' && holdingMix > 0) {
      // This cat's shoulders are its low front paws, not humanoid shoulders.
      // Roll the real palms forward in avatar space while the rod is stowed.
      for (const side of ['L', 'R']) {
        const wrist = bones.get(`hand_${side}`)!;
        wrist.getWorldQuaternion(worldQ).normalize();
        rig.root.getWorldQuaternion(parentQ).normalize();
        q.copy(parentQ).invert().multiply(worldQ);
        q.premultiply(rotation.setFromEuler(euler.set((side === 'L' ? .65 : .85) * holdingMix, 0, 0)));
        worldQ.copy(parentQ).multiply(q);
        wrist.parent!.getWorldQuaternion(parentQ).normalize().invert();
        wrist.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      }
    }
    if (texturedSwordDog) {
      // Keep the authored blade facing away from the shaft. The broad dog holds
      // its rod outside the shoulder; wrist orientation keeps both real props
      // intact without cutting its textured palms or stretching the short arm.
      const wrist = bones.get('hand_R')!;
      rotation.setFromEuler(euler.set(.5, 0, 1.3));
      if (holdingMix > 0) rotation.slerp(q.setFromEuler(euler.set(Math.PI / 2, 0, 0)), holdingMix);
      rig.root.getWorldQuaternion(worldQ).normalize().multiply(rotation);
      wrist.parent!.getWorldQuaternion(parentQ).normalize().invert();
      wrist.quaternion.copy(parentQ.multiply(worldQ)).normalize();
    }
    if (uploadedRig && !texturedSwordDog) {
      const lowPaws = Math.min(shoulderLeft.y, shoulderRight.y) / h < .3;
      for (const side of ['L', 'R']) {
        const wrist = bones.get(`hand_${side}`)!;
        const palmPitch = lowPaws ? .3 : THREE.MathUtils.lerp(-.9, -Math.PI / 2, holdingMix);
        rig.root.getWorldQuaternion(worldQ).normalize().multiply(rotation.setFromEuler(euler.set(palmPitch, 0, 0)));
        wrist.parent!.getWorldQuaternion(parentQ).normalize().invert();
        wrist.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      }
    }
    sync();

    if (uploadedRig && holdingMix > 0) {
      for (const side of ['L', 'R'] as const) {
        const wrist = bones.get(`hand_${side}`)!;
        wrist.getWorldQuaternion(q).normalize();
        rig.root.getWorldQuaternion(worldQ).normalize().multiply(rotation.setFromEuler(euler.set(side === 'R' ? holding.pitchR : holding.pitch, 0, 0)));
        worldQ.copy(q.slerp(worldQ, holdingMix));
        wrist.parent!.getWorldQuaternion(parentQ).normalize().invert(); wrist.quaternion.copy(parentQ.multiply(worldQ)).normalize();
      }
      sync();
    }
    // Read the solved wrists rather than assuming every rig has the same
    // arm reach. This keeps the visible rod attached even on the short animal rigs.
    const right = bones.get('hand_R'), left = bones.get('hand_L');
    if (right && left) {
      right.getWorldPosition(rodPosition); rig.root.worldToLocal(rodPosition);
      left.getWorldPosition(actualUpper); rig.root.worldToLocal(actualUpper);
      catchPosition.copy(actualUpper).add(rodPosition).multiplyScalar(.5);
      actualUpper.sub(rodPosition);
      if ((oneHanded || uploadedRig) && holdingMix === 0) rodQuaternion.setFromAxisAngle(pitchAxis, pitch + tension);
      else if (actualUpper.lengthSq() > .000001) rodQuaternion.setFromUnitVectors(rodGripAxis, actualUpper.normalize());
      if (restMix > 0) {
        // The free hand is leaving the shaft, so it must no longer steer the rod.
        rodQuaternion.setFromUnitVectors(rodGripAxis, gripDirection).slerp(uprightRod, restMix);
      }
      if (uploadedRig && surfaces && pose?.rodVisible !== false) {
        surfaces.update(false);
        let slope = 0;
        for (const p of surfaces.bodyPoints) {
          const dy = p.y - rodPosition.y;
          if (dy > .08 && Math.abs(p.x - rodPosition.x) < .065) slope = Math.max(slope, (p.z - rodPosition.z + .055) / dy);
        }
        // The low-paw grip needs a steeper presentation across the real main
        // and upper rails. Body clearance below remains authoritative; the
        // complete reel/shaft and every station are tested in world space.
        const requested = Math.min(lowForelimbs ? .6 : Infinity, Math.atan2(rodGripAxis.z, rodGripAxis.y) + pitch + tension);
        const safeAngle = Math.min(texturedSwordDog ? .85 : Math.PI / 2, Math.max(requested * (1 - restMix), Math.atan(slope)));
        gripDirection.set(0, Math.cos(safeAngle), Math.sin(safeAngle));
        rodQuaternion.setFromUnitVectors(rodGripAxis, gripDirection);
      }
    }
  }
  // Synchronous compatibility path for offline geometry audits. The live scene
  // only calls prepareCatchAsync + the cached-only positionCatchReady accessor.
  const positionCatch = (destination: THREE.Vector3, size: THREE.Vector3) => {
    if (surfaces) {
      if (catchLayout) return destination.copy(catchLayout);
      // Solve the final contact pose once. The arriving fish and supporting
      // hands then converge on the same stable destination during the haul.
      const restore = lastFishing;
      updateFishing(0, 'holding', true, lastFishing[3], undefined, undefined, size);
      surfaces.update();
      const palms = surfaces.palmPoints;
      const points = [...palms.L, ...palms.R];
      const box = new THREE.Box3().setFromPoints(points), center = box.getCenter(new THREE.Vector3());
      const supportCenter = catchSurface?.supportBounds.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
      const palmCenters = [palms.L, palms.R].map(ps => new THREE.Box3().setFromPoints(ps).getCenter(new THREE.Vector3()));
      const middleX = (palmCenters[0].x + palmCenters[1].x) * .5 - supportCenter.x;
      const back = catchSurface?.backAt ?? ((x: number, y: number) => {
        const norm = (x / Math.max(.001, size.x * .5)) ** 2 + (y / Math.max(.001, size.y * .5)) ** 2;
        return norm < 1 ? -size.z * .5 * Math.sqrt(1 - norm) : Infinity;
      });
      const supportBack = catchSurface?.supportBackAt ?? back;
      const floor = lowForelimbs && catchSurface ? .003 - catchSurface.bounds.min.y : size.y * .5 + .025;
      let best = Infinity, bestContactGap = Infinity, testedCandidates = 0;
      const candidates: { x: number; y: number; z: number; contact: number; penalty: number; score: number }[] = [];
      for (const lateral of [0, -.05, .05, -.1, .1, -.15, .15, -.2, .2, -.25, .25, -.3, .3, -.4, .4, -.5, .5, -.6, .6, -.7, .7]) for (let step = 0; step <= 24; step++) {
        const x = middleX + lateral * Math.min(size.x, size.y > 2 ? .6 : .2);
        const y = Math.max(floor, center.y + size.y * (step / 24 - .5));
        let contact = -Infinity;
        for (const p of points) {
          const surface = supportBack(p.x - x, p.y - y);
          if (Number.isFinite(surface)) contact = Math.max(contact, p.z - surface + .004);
        }
        if (!Number.isFinite(contact)) continue;
        let z = contact;
        for (const p of surfaces.bodyPoints) {
          const backZ = back(p.x - x, p.y - y), frontZ = catchSurface?.frontAt(p.x - x, p.y - y) ?? -backZ;
          if (p.z > z + backZ - .008 && p.z < z + frontZ + .008) z = Math.max(z, p.z - backZ + .006);
        }
        const gap = z - contact;
        const penalty = Math.abs(y - (center.y + size.y * .2)) * .1 + Math.abs(lateral) * .1;
        const contacts = [palms.L, palms.R].map(ps => { let value = -Infinity; for (const p of ps) { const surface = supportBack(p.x-x,p.y-y); if (Number.isFinite(surface)) value = Math.max(value,p.z-surface+.004); } return value; });
        const balance = Number.isFinite(contacts[0]) && Number.isFinite(contacts[1]) ? Math.abs(contacts[0]-contacts[1]) : 1;
        const score = gap * 10 + balance * 10 + penalty;
        candidates.push({ x, y, z, contact, penalty, score });
        if (score < best) { best = score; destination.set(x, y, z); }
      }
      if (catchSurface) {
        // A flat palm can also support the actual underside. This matters for
        // tiny catches and armed hands, whose frontmost vertex is not a shelf.
        for (const lateral of [0, -.05, .05, -.1, .1, -.15, .15, -.2, .2, -.25, .25, -.3, .3]) for (const forward of [0, .025, .05, .08, .12, .18, .25, .4, .65]) {
          const x = middleX + lateral * Math.min(size.x, size.y > 2 ? .6 : .2), originalZ = center.z + forward;
          let y = -Infinity;
          for (const p of points) {
            const bottom = catchSurface.supportBottomAt(p.x - x, p.z - originalZ);
            if (Number.isFinite(bottom)) y = Math.max(y, p.y - bottom + .006);
          }
          if (!Number.isFinite(y)) continue;
          y = Math.max(floor, y);
          let z = originalZ;
          for (const p of surfaces.bodyPoints) {
            const surface = back(p.x - x, p.y - y), frontZ = catchSurface.frontAt(p.x - x, p.y - y);
            if (p.z > z + surface - .008 && p.z < z + frontZ + .008) z = Math.max(z, p.z - surface + .006);
          }
          const penalty = Math.abs(y - (center.y + size.y * .2)) * .1 + Math.abs(lateral) * .1;
          candidates.push({ x, y, z, contact: originalZ, penalty, score: (z - originalZ) * 10 + penalty });
        }
        const front = surfaces.exactFront();
        best = Infinity;
        for (const candidate of candidates.sort((a, b) => a.score - b.score)) {
          // Upright tall fish can invalidate the early coarse candidates. Only
          // extend the bounded list if the first 100 have no bilateral support.
          if (testedCandidates >= 100 && bestContactGap <= .04) break;
          testedCandidates++;
          const offset = new THREE.Vector3(candidate.x, candidate.y, candidate.z);
          for (let pass = 0; pass < 3; pass++) {
            let push = 0;
            for (let i = 0; i < catchSurface.points.length; i += texturedSwordDog && size.z > 2 ? 1 : 4) {
              const p = catchSurface.points[i]; push = Math.max(push, front(p.x + offset.x, p.y + offset.y, p.z + offset.z));
            }
            if (push <= 0) break; offset.z += push + .003;
          }
          if (front.intersects(catchSurface.triangles, offset)) continue;
          // Once no surfaces cross, a point per connected procedural mesh also
          // rejects containment; the triangle test remains full-resolution.
          if (catchSurface.componentPoints.some(p => front(p.x + offset.x, p.y + offset.y, p.z + offset.z) > 0)) continue;
          const relative = new THREE.Vector3();
          const gaps = (['L','R'] as const).map(side => {
            let gap = Infinity;
            for (let i=0;i<palms[side].length;i+=8) gap = Math.min(gap, catchSurface!.supportDistance(relative.copy(palms[side][i]).sub(offset)));

            return gap;
          });
          const gap = Math.max(...gaps);
          const score = gap * 10 + candidate.penalty;
          if (score >= best) continue;
          best = score; bestContactGap = gap; destination.copy(offset);
          // The ordered search stops at an actual supported, non-intersecting
          // main-body contact. It need not minimize a sub-millimetre gap.
          if (gap < .025) break;
        }
        // Refine only a near miss in the coarse grid. Both palms drive this
        // bounded translation search; a fin or a single hand cannot satisfy it.
        if (Number.isFinite(best) && bestContactGap > .025) {
          const surface = catchSurface, relative = new THREE.Vector3();
          for (const step of [.025, .0125]) {
            const origin = destination.clone(), refinements: { offset: THREE.Vector3; gap: number }[] = [];
            for (const x of [-step, 0, step]) for (const y of [-step, 0, step]) for (const z of [-step, 0, step]) {
              const offset = origin.clone().add(new THREE.Vector3(x, y, z));
              if (offset.y < floor) continue;
              const gaps = (['L', 'R'] as const).map(side => {
                let gap = Infinity;
                for (let i = 0; i < palms[side].length; i += 8) gap = Math.min(gap, surface.supportDistance(relative.copy(palms[side][i]).sub(offset)));
                return gap;
              });
              const gap = Math.max(...gaps);
              if (gap < bestContactGap) refinements.push({ offset, gap });
            }
            for (const candidate of refinements.sort((a, b) => a.gap - b.gap)) {
              if (front.intersects(surface.triangles, candidate.offset)) continue;
              if (surface.componentPoints.some(p => front(p.x + candidate.offset.x, p.y + candidate.offset.y, p.z + candidate.offset.z) > 0)) continue;
              destination.copy(candidate.offset); bestContactGap = candidate.gap; break;
            }
            if (bestContactGap < .025) break;
          }
        }
        if (Number.isFinite(best)) {
          // Fins, tails and wings can miss the body at rest yet sweep a palm on
          // their way in. Choose the final approach against this actual posed
          // mesh, rather than assigning exceptions to individual characters.
          const directions = [catchApproachDirection.clone(), new THREE.Vector3(0, 1, 1).normalize(),
            new THREE.Vector3(-1, 1, 1).normalize(), new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0)];
          const offset = new THREE.Vector3();
          for (const candidate of directions) {
            const distance = Math.max(.8, (Math.abs(candidate.x) * size.x + Math.abs(candidate.z) * size.z) * .75);
            let clear = true;
            for (let step = 1; step <= 40; step++) {
              offset.copy(destination).addScaledVector(candidate, distance * (step / 40) ** 2);
              if (front.intersects(catchSurface.triangles, offset)) { clear = false; break; }
            }
            if (clear) { catchApproachDirection.copy(candidate); break; }
          }
        }
      }
      rig.root.userData.fishingCatchSolve = { tested: testedCandidates, total: candidates.length };
      if (!Number.isFinite(best)) destination.set(center.x, box.max.y + size.y * .5 + .004, box.max.z + size.z * .5 + .004);
      catchLayout = destination.clone();
      updateFishing(...restore);
      return destination;
    }
    destination.copy(catchPosition);
    destination.y += Math.min(.14, size.y * .25);
    destination.z += Math.min(.1, size.z * .2);
    if (texturedSwordDog) {
      // The armed, broad dog displays the catch on its outside palm. Its sword
      // points down during the support pose instead of running through the fish.
      destination.copy(rodPosition);
      destination.x -= Math.max(0, size.x - .352) * .5;
      const round = size.z > size.x * .5 && size.y > size.x * .65
        ? THREE.MathUtils.clamp((size.x - .4) / .4, 0, 1) : 0;
      // A rounded catch touches its surface, not the empty corner of its box.
      destination.y += .025 + size.y * (.5 - .15 * round);
      destination.z += THREE.MathUtils.lerp(Math.max(.05, size.z * .5), .075, round);
    }
    if (kind === 'miaocuijiao') {
      // Actual palm/contact measurements: the rounded belly is ahead of the
      // wrist joints. Present small catches low; deeper catches clear its front.
      destination.x -= .02;
      destination.y = .25;
      const front = size.y > .21 ? (size.y > size.z * 2 ? .423 : .412) : .402;
      destination.z = Math.max(.465, front + size.z * .5);
    }
    return destination;
  };
  function prepareCatch(model: THREE.Group) {
    invalidateCatch();
    catchApproachDirection.set(0, 0, 1);
    model.rotation.set(0, 0, 0); model.updateMatrixWorld(true);
    const natural = createFishingCatchSurface(model).bounds.getSize(new THREE.Vector3());
    lowCatchSpread = lowForelimbs && natural.y > .3;
    lowCatchTall = natural.y > .65 ;
    // Authored marine models use +Y for their back/dorsal direction and +Z for
    // their broad side. Never roll a catch to improve its contact score: keep
    // its natural upright silhouette and solve the hands/placement around it.
    // A yaw-only turn fans broad ray wings across the viewer without tipping
    // the dorsal surface sideways or changing the original dimensions.
    // Low front paws meet the broader belly on the opposite side of tall fish.
    // A half-turn changes which side is shown, but keeps its back upright.
    if (lowForelimbs && lowCatchTall) model.rotation.y = Math.PI;
    if (model.userData.speciesId === 'manta-ray' && natural.z > 2) model.rotation.y = 1.1;
    model.updateMatrixWorld(true);
    catchSurface = createFishingCatchSurface(model); catchLayout = undefined;
    return catchSurface.bounds.getSize(new THREE.Vector3());
  }
  async function prepareCatchAsync(model: THREE.Group, signal?: AbortSignal): Promise<THREE.Vector3> {
    invalidateCatch();
    const generation = catchGeneration, controller = new AbortController(); catchController = controller;
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted || disposed) controller.abort();
    const check = () => { if (disposed || controller.signal.aborted || generation !== catchGeneration) throw new DOMException('Catch preparation cancelled.', 'AbortError'); };
    try {
      check();
      const cached = uploadedRig && getFishingCatchLayout(kind, model.userData.speciesId, model.userData.lengthCm, model.scale.x);
      if (cached && model.scale.y === cached.scale && model.scale.z === cached.scale) {
        // Normal gameplay is a fixed 12 x 20 lookup. No skinning, bounds pass,
        // snapshot, Worker startup or candidate search runs at catch time.
        lowCatchSpread = lowForelimbs && cached.naturalSize[1] > .3;
        lowCatchTall = cached.naturalSize[1] > .65;
        model.rotation.set(cached.rotation[0], cached.rotation[1], cached.rotation[2]);
        catchSurface = undefined;
        catchLayout = new THREE.Vector3().fromArray(cached.position);
        catchApproachDirection.fromArray(cached.approachDirection);
        rig.root.userData.fishingCatchSolve = { tested: cached.tested, total: cached.total };
        rig.root.userData.fishingCatchLayoutSource = 'precomputed';
        return new THREE.Vector3().fromArray(cached.size);
      }
      rig.root.userData.fishingCatchLayoutSource = 'asynchronous-diagnostic';
      // Return to the renderer before even the small orientation/snapshot work.
      await new Promise<void>(resolve => setTimeout(resolve, 0)); check();
      catchApproachDirection.set(0, 0, 1); model.rotation.set(0, 0, 0);
      const natural = measureFishingCatchBounds(model).getSize(new THREE.Vector3());
      lowCatchSpread = lowForelimbs && natural.y > .3; lowCatchTall = natural.y > .65;
      if (lowForelimbs && lowCatchTall) model.rotation.y = Math.PI;
      if (model.userData.speciesId === 'manta-ray' && natural.z > 2) model.rotation.y = 1.1;
      const size = measureFishingCatchBounds(model).getSize(new THREE.Vector3());
      catchSurface = undefined;
      if (!surfaces) {
        check(); catchLayout = positionCatch(new THREE.Vector3(), size); return size;
      }
      const restore = lastFishing;
      let input;
      try {
        updateFishing(0, 'holding', true, lastFishing[3], undefined, undefined, size);
        surfaces.update();
        input = {
          avatar: captureFishingMeshSnapshot(rig.root, 'avatar'), fish: captureFishingMeshSnapshot(model, 'catch'),
          palms: { L: surfaces.palmPoints.L.map(p => p.toArray()), R: surfaces.palmPoints.R.map(p => p.toArray()) },
          bodyPoints: surfaces.bodyPoints.map(p => p.toArray()), size: size.toArray(), lowForelimbs, texturedSwordDog,
          approachDirection: catchApproachDirection.toArray(),
        };
      } finally { updateFishing(...restore); }
      check();
      if (!catchWorker) { const { createFishingCatchWorkerClient } = await import('./fishing-catch-worker-client.ts'); check(); catchWorker = createFishingCatchWorkerClient(); }
      const result = await catchWorker.solve(input, controller.signal); check();
      catchLayout = new THREE.Vector3().fromArray(result.position); catchApproachDirection.fromArray(result.approachDirection);
      rig.root.userData.fishingCatchSolve = { tested: result.tested, total: result.total };
      return size;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (catchController === controller) catchController = undefined;
    }
  }
  function positionCatchReady(destination: THREE.Vector3) {
    if (!catchLayout || disposed) return false;
    destination.copy(catchLayout); return true;
  }
  if (rig.loaded) updateFishing(...lastFishing);
  const ready = rig.ready.then(() => { if (!disposed && rig.loaded) updateFishing(...lastFishing); });
  return { ...rig, ready, dispose() { disposed = true; invalidateCatch(); catchWorker?.dispose(); bones.clear(); rig.dispose(); }, get height() { return rig.height; }, get footprintRadius() { return rig.footprintRadius; }, get loaded() { return rig.loaded; }, rodPosition, rodQuaternion, catchPosition, catchApproachDirection, positionCatch, positionCatchReady, prepareCatch, prepareCatchAsync, setCatchSurface(surface: FishingCatchSurface | undefined) { invalidateCatch(); catchSurface = surface; }, updateFishing };
}
