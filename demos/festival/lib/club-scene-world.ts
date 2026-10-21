import * as THREE from 'three';
import type { CameraSubject } from './club-camera';
import type { GroupAction, LightMode, Participant, RoomAction } from './room-types';
import { stagePosition } from './club-scene-math.ts';
import { makeClubEnvironment } from './club-scene-environment.ts';
import { clubMotionAt, clubMotionAtDistance, type ClubMotionState } from './club-scene-motion.ts';
import type { MusicSectionEnergy } from './music-catalog';
import { personalRouteTime } from './room-action-state.ts';
import { clubGroupMotionAt, type GroupPose } from './club-group-motion.ts';
import { ClubManualWorld } from './club-manual-world.ts';
import type { ParticipantMovement } from './room-movement';
import type { ClubManualControl, ClubMovementSample, ManualIntent } from './club-manual-motion';
import { isEmotionAction } from './club-emotion-motion.ts';

export type SceneAvatarKind = 'dj-cockatoo' | Participant['preset'] | 'human-jiji' | 'human-subeike' | 'human-lx' | 'monster-blob' | 'monster-tower' | 'monster-star';
/** Structural adapter: avatar geometry/skeleton/asset loading remain outside the scene owner. */
export interface SceneAvatarAdapter {
  root: THREE.Group;
  height: number;
  labelHeight: number;
  footprintRadius: number;
  loaded: boolean;
  ready: Promise<void>;
  readonly groundLift?: number;
  readonly landingImpact?: number;
  update(absoluteBeat: number, action: RoomAction, reducedMotion: boolean, energy?: number, locomotion?: ClubMotionState, groupPose?: GroupPose): void;
  dispose(): void;
}
export type SceneAvatarFactory = (preset: SceneAvatarKind, id: string, options?: { mode?: 'dance' | 'dj' }) => SceneAvatarAdapter;

export interface AvatarRig {
  id: string;
  name: string;
  preset: SceneAvatarKind;
  root: THREE.Group;
  model: SceneAvatarAdapter;
  shadow: THREE.Mesh;
  halo: THREE.Mesh;
  ambient: boolean;
  isOwn: boolean;
  desiredVisible: boolean;
  slot: number;
  action: RoomAction;
  motion: ClubMotionState;
  participant?: Participant;
}

const AMBIENT_CAST: readonly { id: string; name: string; preset: SceneAvatarKind; slot: number; action: RoomAction }[] = [
  { id: 'ambient-pepper', name: 'Pepper', preset: 'dog', slot: 4, action: 'dance' },
  { id: 'ambient-luna', name: 'Luna', preset: 'cat', slot: 5, action: 'dance' },
  { id: 'ambient-coco', name: 'Coco', preset: 'panda', slot: 6, action: 'wave' },
  { id: 'ambient-tower', name: '长长', preset: 'monster-tower', slot: 3, action: 'dance' },
  { id: 'ambient-stella', name: '星星', preset: 'monster-star', slot: 0, action: 'bounce' },
  { id: 'ambient-momo', name: '香蕉猫', preset: 'banana-cat', slot: 1, action: 'wave' },
  { id: 'ambient-capy', name: '慢慢', preset: 'capybara', slot: 2, action: 'dance' },
  { id: 'ambient-miso', name: '刀盾狗', preset: 'sword-shield-dog', slot: 8, action: 'dance' },
  { id: 'ambient-kiki', name: 'Kiki', preset: 'frog', slot: 9, action: 'bounce' },
];

/** Ten real seats replace a unique nine-character ambient cast. The DJ is separate. */
export function makeClubWorld(options: {
  createAvatar: SceneAvatarFactory;
  onAvatarError?: (error: unknown) => void;
  manualControl?: Pick<ClubManualControl, 'autoRequest' | 'reconcileRequest' | 'targetRequest' | 'targetSequence' | 'cancelRequest'>;
}) {
  const environment = makeClubEnvironment();
  const scene = environment.scene;
  const players = new Map<string, AvatarRig>();
  const manualWorld = new ClubManualWorld(options.manualControl);
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(.14, .2, 32), new THREE.MeshBasicMaterial({ color: 0xe9ffac, transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  targetRing.renderOrder = 2;
  targetRing.name = 'click-walk-target'; targetRing.rotation.x = -Math.PI / 2; targetRing.position.y = .015; targetRing.visible = false; scene.add(targetRing);
  let movementSamples: readonly ParticipantMovement[] = [];
  let currentParticipants: readonly Participant[] = [];
  let currentOwnId: string | null = null;
  const activeRigs = new Set<AvatarRig>();
  let visualRevision = 0;
  let disposed = false;
  let lastServerMs: number | undefined;
  let lastReducedMotion = false;
  const baseMotions = new Map<number, ClubMotionState>();
  const motionInputs = new Map<number, string>();
  const corrections = new Map<number, { from: ClubMotionState; at: number; duration: number }>();

  function normalMotion(participant: Participant | undefined, slot: number, now: number | undefined, reduced: boolean): ClubMotionState {
    const routeTime = participant && now !== undefined ? personalRouteTime(participant, now) : now ?? 0;
    const motion = clubMotionAt(routeTime, slot, reduced || now === undefined);
    if (participant && now !== undefined && now >= participant.actionAt && now < (participant.actionUntil ?? 0)) {
      return { ...motion, speed: 0, walkBlend: 0, action: participant.action };
    }
    return motion;
  }

  function correctedMotion(base: ClubMotionState, now: number | undefined, reduced: boolean): ClubMotionState {
    const correction = corrections.get(base.slot);
    if (!correction || now === undefined) return base;
    const t = Math.max(0, Math.min(1, (now - correction.at) / correction.duration));
    if (reduced || t >= 1) { corrections.delete(base.slot); return base; }
    const progress = t * t * (3 - 2 * t), from = correction.from;
    const x = from.x + (base.x - from.x) * progress, z = from.z + (base.z - from.z) * progress;
    const turn = Math.atan2(Math.sin(base.heading - from.heading), Math.cos(base.heading - from.heading));
    const heading = from.heading + turn * progress;
    const path = base.sampleAtDistance ?? ((distance: number) => clubMotionAtDistance(base.slot, distance));
    const source = path(base.distance), dx = x - source.x, dz = z - source.z;
    // Both endpoints belong to the same convex safe territory. Only presentation
    // eases; the authoritative clock remains untouched and converges exactly.
    return { ...base, x, z, heading, sampleAtDistance: (distance) => {
      const point = path(distance);
      return { x: point.x + dx, z: point.z + dz, heading: point.heading + (heading - base.heading) };
    } };
  }

  function makeAvatar(id: string, name: string, preset: SceneAvatarKind, slot: number, ambient = false, mode: 'dance' | 'dj' = 'dance'): AvatarRig {
    const model = options.createAvatar(preset, id, { mode });
    const root = new THREE.Group();
    root.name = mode === 'dj' ? 'resident-dj' : `dancer-slot-${slot}`;
    root.rotation.y = Math.PI / 4;
    const motion = clubMotionAt(lastServerMs ?? 0, slot, lastReducedMotion || lastServerMs === undefined);
    const position = motion;
    root.position.set(position.x, 0, position.z);
    root.rotation.y = motion.heading;
    root.add(model.root);
    const shadow = environment.createShadow(model.footprintRadius);
    const halo = environment.createHalo(model.footprintRadius);
    root.add(shadow, halo);
    root.visible = model.loaded;
    scene.add(root);
    const rig: AvatarRig = { id, name, preset, root, model, shadow, halo, ambient, isOwn: false, desiredVisible: true, slot, action: 'dance', motion };
    activeRigs.add(rig);
    void model.ready.then(() => {
      if (disposed || !activeRigs.has(rig)) return;
      root.visible = rig.desiredVisible && model.loaded;
      halo.scale.setScalar(Math.max(0.65, model.footprintRadius) / 0.66);
      visualRevision += 1;
    }).catch((error: unknown) => {
      if (!disposed && activeRigs.has(rig)) options.onAvatarError?.(error);
    });
    return rig;
  }

  function removeAvatar(rig: AvatarRig) {
    scene.remove(rig.root);
    activeRigs.delete(rig);
    rig.model.dispose();
  }

  const ambient = AMBIENT_CAST.map((actor) => {
    const rig = makeAvatar(actor.id, actor.name, actor.preset, actor.slot, true);
    rig.action = actor.action;
    return rig;
  });
  const dj = makeAvatar('house-dj', 'DJ 凤头鹦鹉', 'dj-cockatoo', 0, true, 'dj');
  const djPosition = stagePosition(0, -0.55);
  dj.root.position.set(djPosition.x, 0, djPosition.z);
  dj.shadow.scale.set(1.65, 1.25, 1);
  dj.halo.visible = false;
  const ready = Promise.all([...ambient, dj].map((rig) => rig.model.ready)).then(() => undefined);
  // The caller observes ready; this side branch prevents a disposal-before-await unhandled rejection.
  void ready.catch(() => undefined);

  function syncParticipants(participants: readonly Participant[], ownId: string | null) {
    if (disposed) return;
    const boundedParticipants = participants.slice(0, 10);
    currentParticipants = boundedParticipants; currentOwnId = ownId;
    manualWorld.sync(boundedParticipants, ownId, movementSamples);
    const activeIds = new Set(boundedParticipants.map((participant) => participant.id));
    for (const [id, rig] of players) {
      if (!activeIds.has(id)) {
        removeAvatar(rig);
        players.delete(id);
      }
    }
    for (const participant of boundedParticipants) {
      let rig = players.get(participant.id);
      if (rig && rig.preset !== participant.preset) {
        removeAvatar(rig);
        players.delete(participant.id);
        rig = undefined;
      }
      if (!rig) {
        rig = makeAvatar(participant.id, participant.name, participant.preset, participant.slot);
        players.set(participant.id, rig);
      }
      rig.name = participant.name;
      if (rig.slot !== participant.slot) {
        rig.motion = clubMotionAt(lastServerMs ?? 0, participant.slot, lastReducedMotion || lastServerMs === undefined);
        rig.root.position.set(rig.motion.x, 0, rig.motion.z);
        rig.root.rotation.y = rig.motion.heading;
      }
      rig.slot = participant.slot;
      rig.action = participant.action;
      rig.participant = participant;
      rig.isOwn = participant.id === ownId;
      rig.halo.visible = rig.isOwn;
    }
    const bySlot = new Map(boundedParticipants.map((participant) => [participant.slot, participant]));
    for (let slot = 0; slot < 10; slot++) {
      const participant = bySlot.get(slot);
      const input = participant ? `${participant.id}:${participant.actionAt}:${participant.actionUntil ?? 0}:${participant.routePauseMs ?? 0}` : 'ambient';
      const old = motionInputs.get(slot), previous = baseMotions.get(slot);
      if (old !== undefined && old !== input && previous && lastServerMs !== undefined && !lastReducedMotion) {
        const target = normalMotion(participant, slot, lastServerMs, false);
        const distance = Math.hypot(previous.x - target.x, previous.z - target.z);
        const turn = Math.atan2(Math.sin(previous.heading - target.heading), Math.cos(previous.heading - target.heading));
        if (distance > 1e-8 || Math.abs(turn) > 1e-8) corrections.set(slot, { from: previous, at: lastServerMs, duration: Math.max(400, Math.min(1600, distance * 650)) });
      }
      motionInputs.set(slot, input);
    }
    const occupied = new Set(boundedParticipants.map((participant) => participant.slot));
    for (const rig of ambient) {
      rig.desiredVisible = !occupied.has(rig.slot);
      rig.root.visible = rig.desiredVisible && rig.model.loaded;
    }
    visualRevision += 1;
  }

  function update(beat: number, lightMode: LightMode, reducedMotion: boolean, energy = 0.65, nowServerMs?: number, sectionEnergy?: MusicSectionEnergy, context?: { groupAction?: GroupAction | null; manualIntent?: ManualIntent; deltaSeconds?: number; onOwnMovement?: (sample: ClubMovementSample) => void }) {
    if (disposed) return;
    lastServerMs = nowServerMs;
    lastReducedMotion = reducedMotion;
    environment.update(beat, lightMode, reducedMotion, energy, sectionEnergy);
    const bySlot = new Map([...players.values()].map((rig) => [rig.slot, rig.participant]));
    for (let slot = 0; slot < 10; slot++) {
      baseMotions.set(slot, correctedMotion(normalMotion(bySlot.get(slot), slot, nowServerMs, reducedMotion), nowServerMs, reducedMotion));
      if (!motionInputs.has(slot)) motionInputs.set(slot, 'ambient');
    }
    const groupMotions = new Map<number, ReturnType<typeof clubGroupMotionAt>>();
    const canonical = new Map<number, ClubMotionState>();
    for (let slot = 0; slot < 10; slot++) {
      const base = baseMotions.get(slot)!;
      const group = nowServerMs === undefined ? null : clubGroupMotionAt(nowServerMs, slot, context?.groupAction, base, reducedMotion);
      groupMotions.set(slot, group); canonical.set(slot, group?.motion ?? base);
    }
    const manual = nowServerMs === undefined ? null : manualWorld.update({
      now: nowServerMs, deltaSeconds: context?.deltaSeconds ?? 1 / 40, canonical,
      canonicalAt: (slot, at) => normalMotion(bySlot.get(slot), slot, at, false),
      group: context?.groupAction, intent: context?.manualIntent, reducedMotion,
    });
    const destination = manualWorld.markerDestination;
    targetRing.visible = Boolean(destination);
    // Arrival/no-op acknowledgement extends beyond the feet for just 650 ms.
    // During travel the original compact destination marker stays unchanged.
    targetRing.scale.setScalar(manualWorld.destination ? 1 : 4);
    targetRing.material.opacity = manualWorld.destination ? .85 : .5;
    if (destination) targetRing.position.set(destination.x, .015, destination.z);
    for (const sample of manual?.samples ?? []) context?.onOwnMovement?.(sample);
    for (const rig of activeRigs) {
      if (!rig.root.visible) continue;
      const base = baseMotions.get(rig.slot)!;
      const group = groupMotions.get(rig.slot) ?? null;
      if (rig !== dj) {
        rig.motion = manual?.motions.get(rig.slot) ?? group?.motion ?? base;
        rig.root.scale.setScalar(manual?.scales.get(rig.slot) ?? 1);
        rig.root.position.set(rig.motion.x, 0, rig.motion.z);
        rig.root.rotation.y = rig.motion.heading;
      }
      const personalActive = rig.participant && nowServerMs !== undefined && Number.isFinite(rig.participant.actionAt) && Number.isFinite(rig.participant.actionUntil) && rig.participant.actionAt >= rig.participant.joinedAt && nowServerMs >= rig.participant.actionAt && nowServerMs < (rig.participant.actionUntil ?? 0);
      let action = group && rig !== dj ? group.motion.action : rig.ambient && rig !== dj && nowServerMs !== undefined ? rig.motion.action : rig.action;
      // Finite somersaults and emotions need an accepted action clock. Stored
      // history and automatic routes must not replay them when a song restarts.
      if ((action === 'wave' || isEmotionAction(action)) && !group && !personalActive) action = 'dance';
      // Explicit commands restart a short pose timeline on every actionAt,
      // including repeated presses of the same button. Group poses take priority.
      const poseBeat = personalActive ? (nowServerMs! - rig.participant!.actionAt) / 500 : beat;
      rig.model.update(poseBeat, action, reducedMotion, energy, rig === dj ? undefined : rig.motion, rig === dj ? undefined : group?.pose);
      // Contact stays on the floor while actual movement occurs inside the bone rig.
      const breath = reducedMotion ? 1 : 1 + (1 - Math.cos(beat * Math.PI * 2)) * 0.025;
      const contact = reducedMotion ? 1 : (1 + (rig.model.landingImpact ?? 0) * 0.12) / (1 + (rig.model.groundLift ?? 0) * 0.55);
      rig.shadow.scale.x = rig.model.footprintRadius * 2.85 * breath * contact;
      rig.shadow.scale.y = rig.model.footprintRadius * 2.15 * breath * contact;
    }
  }

  return {
    scene,
    floor: environment.floor,
    getFloorPickBlockers(): THREE.Object3D[] { return [environment.booth, ...[...activeRigs].filter(rig => rig.root.visible && rig.desiredVisible).map(rig => rig.model.root)]; },
    players,
    ambient,
    dj,
    ready,
    get visualRevision() { return visualRevision; },
    /** Spectators follow the resident DJ; membership switches naturally to their own rig. */
    getCameraSubject(ownId: string | null): CameraSubject | null {
      const own = ownId ? players.get(ownId) : undefined;
      const rig = own?.root.visible ? own : dj.root.visible ? dj : null;
      return rig ? { id: rig.id, position: rig.root.position, heading: rig === dj ? rig.root.rotation.y : rig.motion.heading, height: rig.model.height, radius: rig.model.footprintRadius } : null;
    },
    syncParticipants,
    syncMovements(samples: readonly ParticipantMovement[]) { movementSamples = samples; manualWorld.sync(currentParticipants, currentOwnId, samples); },
    update,
    installStudioEnvironment: environment.installStudioEnvironment,
    dispose() {
      if (disposed) return;
      disposed = true;
      targetRing.geometry.dispose(); targetRing.material.dispose();
      for (const rig of activeRigs) rig.model.dispose();
      activeRigs.clear();
      players.clear();
      baseMotions.clear(); motionInputs.clear(); corrections.clear();
      environment.dispose();
    },
  };
}
