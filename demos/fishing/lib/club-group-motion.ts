import { dancerSlot, stagePosition } from './club-scene-math.ts';
import { clubMotionAt, clubMotionAtDistance, type ClubMotionState } from './club-scene-motion.ts';
import { GROUP_ACTION_LEAD_MS, GROUP_WAVE_LEAD_MS } from './room-types.ts';
import { BACKFLIP_DURATION_MS } from './club-backflip.ts';

/** Structural room contract; no renderer, mutable simulation or participant identity. */
export interface GroupMotionEvent {
  readonly kind: 'train' | 'wave' | 'unison' | 'battle' | 'grid';
  readonly version?: 1 | 2;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly beatMs: number;
  readonly sourceClockBySlot?: readonly number[];
}
export interface GroupPose {
  readonly kind: GroupMotionEvent['kind'];
  readonly version?: 1 | 2;
  readonly phase: 'prepare' | 'perform' | 'return';
  readonly beat: number;
  readonly weight: number;
  readonly wave: number;
  /** Per-dancer participation: held low at zero, full call/jump at one. */
  readonly activation?: number;
  /** Finite shared-clock somersault time; -1 holds the grounded recovery pose. */
  readonly backflipElapsedMs?: number;
}
type Placement = Pick<ClubMotionState, 'x' | 'z' | 'heading'>;
type GroupMotion = ClubMotionState & { readonly sampleAtDistance: (distance: number) => Placement };
export interface GroupMotionSample { readonly motion: GroupMotion; readonly pose: GroupPose }

export const GROUP_FORMATION_MS = 5000;
export const GROUP_RING_RADIUS = 4;
export const GROUP_SLOT_ORDER: readonly number[] = Object.freeze([3, 1, 9, 7, 8, 0, 2, 4, 6, 5]);
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const angleMix = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * clamp(t);
const indexOf = (slot: number) => ((Math.trunc(Number.isFinite(slot) ? slot : 0) % 10) + 10) % 10;
const heading = (dx: number, dz: number) => Math.atan2(dx, dz);
const span = (a: Pick<Placement, 'x' | 'z'>, b: Pick<Placement, 'x' | 'z'>) => Math.hypot(a.x - b.x, a.z - b.z);
const seat = (slot: number): Placement => ({ ...dancerSlot(slot), heading: Math.PI / 4 });
const spread = (slot: number): Placement => slot === 8 || slot === 9 ? { ...stagePosition(slot === 8 ? -2.2 : 2.2, 5.2), heading: Math.PI / 4 } : seat(slot);
const ringAngle = (slot: number) => -Math.PI / 10 + GROUP_SLOT_ORDER.indexOf(slot) * TAU / 10;

function ringPlacement(slot: number, distance = 0, faceCenter = false): Placement {
  const angle = ringAngle(slot) + distance / GROUP_RING_RADIUS;
  const p = stagePosition(GROUP_RING_RADIUS * Math.cos(angle), GROUP_RING_RADIUS * Math.sin(angle));
  const tangent = stagePosition(-Math.sin(angle), Math.cos(angle));
  return { ...p, heading: faceCenter ? heading(-p.x, -p.z) : heading(tangent.x, tangent.z) };
}

/** All actors use the same interpolation factor: separating planes remain valid. */
function lineMotion(slot: number, a: Placement, b: Placement, t: number, durationMs: number): GroupMotion {
  const progress = smooth(t), distance = span(a, b), travelHeading = distance > 1e-8 ? heading(b.x - a.x, b.z - a.z) : a.heading;
  const yaw = progress < 0.18 ? angleMix(a.heading, travelHeading, smooth(progress / 0.18)) : progress > 0.82 ? angleMix(travelHeading, b.heading, smooth((progress - 0.82) / 0.18)) : travelHeading;
  const sampleAtDistance = (at: number): Placement => {
    const p = distance > 1e-8 ? clamp(at / distance) : 0;
    return { x: a.x + (b.x - a.x) * p, z: a.z + (b.z - a.z) * p, heading: yaw };
  };
  const speed = distance * 6 * clamp(t) * (1 - clamp(t)) * 1000 / durationMs;
  return { slot, ...sampleAtDistance(progress * distance), distance: progress * distance, speed, walkBlend: smooth(speed / 0.18), action: 'dance', sampleAtDistance };
}

/** A short ease-in and ease-out, with a constant-speed middle rather than a fast cubic lap. */
function lapProgress(t: number) {
  const value = clamp(t), ramp = 0.1, scale = 1 / (1 - ramp);
  if (value < ramp) return { value: value * value / (2 * ramp) * scale, derivative: value / ramp * scale };
  if (value > 1 - ramp) return { value: 1 - (1 - value) ** 2 / (2 * ramp) * scale, derivative: (1 - value) / ramp * scale };
  return { value: (value - ramp / 2) * scale, derivative: scale };
}

function returnToRoam(slot: number, base: ClubMotionState, t: number): GroupMotion {
  const origin = seat(slot), progress = smooth(t), distanceToBase = span(origin, base);
  const location = { x: origin.x + (base.x - origin.x) * progress, z: origin.z + (base.z - origin.z) * progress };
  const normalSample = base.sampleAtDistance ?? ((distance: number) => clubMotionAtDistance(slot, distance));
  // Approach the canonical gait distance, too. The translated route sampler
  // converges to the normal sampler so expiry cannot reset planted-foot phase.
  const distance = base.distance - (1 - progress) * distanceToBase;
  const normalOrigin = normalSample(distance);
  const correction = { x: location.x - normalOrigin.x, z: location.z - normalOrigin.z };
  const travelHeading = distanceToBase > 1e-8 ? heading(base.x - origin.x, base.z - origin.z) : base.heading;
  const yaw = progress < 0.18 ? angleMix(origin.heading, travelHeading, smooth(progress / 0.18)) : angleMix(travelHeading, base.heading, smooth((progress - 0.65) / 0.35));
  const sampleAtDistance = (at: number): Placement => {
    const sample = normalSample(at);
    return { x: sample.x + correction.x, z: sample.z + correction.z, heading: angleMix(yaw, sample.heading, progress) };
  };
  const transitionSpeed = distanceToBase * 6 * clamp(t) * (1 - clamp(t)) / 2;
  const speed = transitionSpeed + base.speed * progress;
  const walkBlend = 1 - (1 - smooth(transitionSpeed / 0.18)) * (1 - progress * base.walkBlend);
  return { ...base, slot, ...location, heading: yaw, distance, speed, walkBlend, sampleAtDistance };
}

/**
 * Shared-clock choreography overlay. Base roaming continues underneath it.
 * Ingress: route→seat (2s), front-pair spread (1s), circle (2s).
 * Egress reverses the formation, then reaches the CURRENT safe roam position.
 * The front-pair waypoint is essential: a direct seat→ring morph clips 7/8/9.
 */
function legacyGroupMotionAt(nowServerMs: number, slot: number, event: GroupMotionEvent | null | undefined, baseMotion: ClubMotionState, reducedMotion = false): GroupMotionSample | null {
  if (!event || reducedMotion || !Number.isFinite(nowServerMs) || !Number.isFinite(event.startsAt) || !Number.isFinite(event.endsAt) || !Number.isFinite(event.beatMs) || event.beatMs <= 0 || event.endsAt - event.startsAt <= GROUP_FORMATION_MS * 2 || nowServerMs < event.startsAt - GROUP_ACTION_LEAD_MS || nowServerMs >= event.endsAt) return null;
  const index = indexOf(slot), elapsed = nowServerMs - event.startsAt, duration = event.endsAt - event.startsAt;
  const returningAt = duration - GROUP_FORMATION_MS;
  const phase: GroupPose['phase'] = elapsed < GROUP_FORMATION_MS ? 'prepare' : elapsed >= returningAt ? 'return' : 'perform';
  const sourceClock = event.sourceClockBySlot?.[index];
  const source = clubMotionAt(Number.isFinite(sourceClock) ? sourceClock! : event.startsAt, index);
  // A replacement occupant can have a different personal pause clock. Gently
  // line up with the captured slot during the count-in rather than snap at zero.
  // Both endpoints are inside the same convex, collision-safe slot territory.
  if (elapsed < 0) {
    const t = (elapsed + GROUP_ACTION_LEAD_MS) / GROUP_ACTION_LEAD_MS;
    const alignment = lineMotion(index, baseMotion, source, t, GROUP_ACTION_LEAD_MS);
    const speed = alignment.speed + baseMotion.speed * (1 - smooth(t));
    const walkBlend = 1 - (1 - alignment.walkBlend) * (1 - (1 - smooth(t)) * baseMotion.walkBlend);
    return { motion: { ...alignment, speed, walkBlend }, pose: { kind: event.kind, phase: 'prepare', beat: 0, weight: 0, wave: 0 } };
  }
  const ring = ringPlacement(index, 0, event.kind !== 'train');
  let motion: GroupMotion;
  if (elapsed < 2000) motion = lineMotion(index, source, seat(index), elapsed / 2000, 2000);
  else if (elapsed < 3000) motion = lineMotion(index, seat(index), spread(index), (elapsed - 2000) / 1000, 1000);
  else if (elapsed < GROUP_FORMATION_MS) motion = lineMotion(index, spread(index), ring, (elapsed - 3000) / 2000, 2000);
  else if (elapsed < returningAt) {
    const time = (elapsed - GROUP_FORMATION_MS) / (returningAt - GROUP_FORMATION_MS);
    const lap = event.kind === 'train' ? lapProgress(time) : { value: 0, derivative: 0 };
    const distance = lap.value * TAU * GROUP_RING_RADIUS;
    const speed = lap.derivative * TAU * GROUP_RING_RADIUS * 1000 / (returningAt - GROUP_FORMATION_MS);
    const sampleAtDistance = (at: number) => ringPlacement(index, at, event.kind !== 'train');
    motion = { slot: index, ...sampleAtDistance(distance), speed, distance, walkBlend: smooth(speed / 0.18), action: event.kind === 'unison' ? 'bounce' : event.kind === 'wave' ? 'wave' : 'dance', sampleAtDistance };
  } else if (elapsed < returningAt + 2000) motion = lineMotion(index, ring, spread(index), (elapsed - returningAt) / 2000, 2000);
  else if (elapsed < returningAt + 3000) motion = lineMotion(index, spread(index), seat(index), (elapsed - returningAt - 2000) / 1000, 1000);
  else motion = returnToRoam(index, baseMotion, (elapsed - returningAt - 3000) / 2000);
  const beat = Math.max(0, elapsed - GROUP_FORMATION_MS) / event.beatMs;
  // One travelling wave, with enough overlap to read as a ripple. A wrapped
  // pulse would leave the last arms raised when the return abruptly begins.
  const performanceMs = returningAt - GROUP_FORMATION_MS;
  const pulseMs = Math.min(900, performanceMs);
  const delayMs = (performanceMs - pulseMs) / 9;
  const wavePhase = (elapsed - GROUP_FORMATION_MS - GROUP_SLOT_ORDER.indexOf(index) * delayMs) / pulseMs;
  const wave = phase === 'perform' && event.kind === 'wave' && wavePhase > 0 && wavePhase < 1 ? Math.sin(wavePhase * Math.PI) ** 2 : 0;
  return { motion, pose: { kind: event.kind, phase, beat, weight: smooth(elapsed / 1000) * smooth((duration - elapsed) / 1000), wave } };
}

/** Version-two formations use explicit traffic-clearance waypoints, not a circle morph. */
const placements = (points: readonly (readonly [number, number])[]): readonly Placement[] => points.map(([u, v]) => ({ ...stagePosition(u, v), heading: Math.PI / 4 }));
const seats = Array.from({ length: 10 }, (_, slot) => seat(slot));
const unison = placements([[-3.3, 1.9], [3.3, 1.9], [-3.3, -.8], [3.3, -.8], [-3.3, -3.5], [3.3, -3.5], [0, -3.5], [0, 1.9], [-1.65, 4.5], [1.65, 4.5]]);
const grid = placements([[-3.3, 2.2], [3.3, 2.2], [-3.3, -.5], [3.3, -.5], [-3.3, -3.2], [3.3, -3.2], [0, -3.2], [0, 2.2], [-3.3, 5.4], [3.3, 5.4]]);
const leftTeam = new Set([6, 4, 2, 0, 8]);
const battle = placements([[-3.2, 3.35], [3.2, .9], [-3.2, .9], [3.2, -1.55], [-3.2, -1.55], [3.2, -4], [-3.2, -4], [3.2, 5.8], [-3.2, 5.8], [3.2, 3.35]])
  .map((point, slot) => ({ ...point, heading: leftTeam.has(slot) ? Math.PI * .75 : -Math.PI * .25 }));
const battleClearance = placements([[-2.8, 2.8], [2.8, 2.8], [-3.2, 0], [3.2, 0], [-2.8, -2.8], [2.8, -2.8], [0, -4.2], [0, 3.4], [-3.2, 5.2], [3.2, 5.2]]);
const battleFront = battleClearance.map((point, slot) => slot === 7 ? { ...stagePosition(0, 6), heading: Math.PI / 4 } : point);

type FormationKind = Exclude<GroupMotionEvent['kind'], 'train' | 'wave'>;
interface FormationPlan { readonly points: readonly (readonly Placement[])[]; readonly stageMs: readonly number[] }
const formations: Record<FormationKind, FormationPlan> = {
  unison: { points: [seats, unison], stageMs: [2000] },
  battle: { points: [seats, battleClearance, battleFront, battle], stageMs: [1000, 2000, 2000] },
  grid: { points: [seats, grid], stageMs: [2000] },
};
const gridRelayOrder = [4, 6, 5, 3, 2, 0, 7, 1, 9, 8];
const gridParity = [0, 0, 1, 1, 0, 0, 1, 1, 1, 1];

function formationStage(slot: number, plan: FormationPlan, elapsed: number, reverse = false): GroupMotion {
  let offset = 0;
  for (let stage = 0; stage < plan.stageMs.length; stage++) {
    const index = reverse ? plan.stageMs.length - stage - 1 : stage;
    const duration = plan.stageMs[index];
    if (elapsed <= offset + duration || stage === plan.stageMs.length - 1) {
      const a = plan.points[reverse ? index + 1 : index][slot], b = plan.points[reverse ? index : index + 1][slot];
      return lineMotion(slot, a, b, (elapsed - offset) / duration, duration);
    }
    offset += duration;
  }
  throw new Error('A group formation requires at least one stage.');
}

function pulse(time: number, duration: number) { return time > 0 && time < duration ? Math.sin(time / duration * Math.PI) ** 2 : 0; }
function alternatingActivation(time: number, blockMs: number, side: number) {
  const block = Math.floor(Math.max(0, time) / blockMs), within = Math.max(0, time) % blockMs;
  const isActive = block % 2 === side, fade = smooth(within / Math.min(180, blockMs / 4));
  return isActive ? fade : block === 0 ? 0 : 1 - fade;
}
function performanceSignals(kind: FormationKind, slot: number, time: number, duration: number, beatMs: number) {
  const waveAmount = 0;
  let activation = 1;
  let backflipElapsedMs: number | undefined;
  if (kind === 'battle') {
    const blockMs = Math.max(BACKFLIP_DURATION_MS + 100, beatMs * 4);
    const block = Math.floor(time / blockMs), within = time - block * blockMs;
    const ownTurn = block % 2 === (leftTeam.has(slot) ? 0 : 1);
    // Never start a somersault that cannot land and recover before ingress.
    const complete = block * blockMs + BACKFLIP_DURATION_MS <= duration;
    backflipElapsedMs = ownTurn && complete && within < BACKFLIP_DURATION_MS ? within : -1;
    activation = ownTurn && complete ? smooth(within / 180) * smooth((blockMs - within) / 180) : 0;
  } else if (kind === 'grid') {
    const relayMs = duration * .45, checkerEnd = duration * .78;
    if (time < relayMs) {
      const pulseMs = Math.min(1100, relayMs), delay = (relayMs - pulseMs) / 9;
      activation = pulse(time - gridRelayOrder.indexOf(slot) * delay, pulseMs);
    } else if (time < checkerEnd) {
      activation = alternatingActivation(time - relayMs, beatMs * 2, gridParity[slot]);
    } else {
      const prior = alternatingActivation(checkerEnd - relayMs, beatMs * 2, gridParity[slot]);
      activation = prior + (1 - prior) * smooth((time - checkerEnd) / 300);
    }
  }
  // Settle raised arms and any active hop before locomotion resumes. The song
  // tempo need not divide the authored duration into whole musical beats.
  if (kind === 'grid') activation *= smooth((duration - time) / 300);
  return { wave: waveAmount, activation, ...(backflipElapsedMs === undefined ? {} : { backflipElapsedMs }) };
}

/** Instant sea-wave: hold the captured route spot, never assemble into rows.
 * Manual/parked positions take priority in ClubManualWorld. The short final
 * blend returns only automatic actors to their current safe route and gait.
 */
function tidalGroupMotionAt(now: number, slot: number, event: GroupMotionEvent, base: ClubMotionState, reducedMotion: boolean): GroupMotionSample | null {
  const duration = event.endsAt - event.startsAt, elapsed = now - event.startsAt;
  if (reducedMotion || !Number.isFinite(now) || !Number.isFinite(event.startsAt) || !Number.isFinite(event.endsAt) || !Number.isFinite(event.beatMs) || event.beatMs <= 0 || duration <= 0 || elapsed < -GROUP_WAVE_LEAD_MS || elapsed >= duration) return null;
  const index = indexOf(slot), sourceClock = event.sourceClockBySlot?.[index];
  const source = clubMotionAt(Number.isFinite(sourceClock) ? sourceClock! : event.startsAt, index);
  const returnMs = Math.min(1200, duration * .2), returnAt = duration - returnMs;
  const progress = smooth((elapsed - returnAt) / returnMs);
  const location = elapsed < 0 ? base : { x: source.x + (base.x - source.x) * progress, z: source.z + (base.z - source.z) * progress, heading: angleMix(source.heading, base.heading, progress) };
  const distance = elapsed < 0 ? base.distance : source.distance + (base.distance - source.distance) * progress;
  const path = base.sampleAtDistance ?? ((at: number) => clubMotionAtDistance(index, at));
  const origin = path(distance);
  const sampleAtDistance = elapsed < 0 ? path : progress === 0 ? () => source : (at: number) => {
    const sample = path(at); return { x: sample.x + location.x - origin.x, z: sample.z + location.z - origin.z, heading: location.heading };
  };
  const motion: GroupMotion = { ...base, ...location, slot: index, distance, speed: elapsed < 0 ? base.speed : base.speed * progress, walkBlend: elapsed < 0 ? base.walkBlend : base.walkBlend * progress, action: 'dance', sampleAtDistance };
  const weight = smooth(elapsed / 250) * smooth((duration - elapsed) / 500);
  return { motion, pose: { kind: 'wave', version: 2, phase: elapsed < 0 ? 'prepare' : elapsed < returnAt ? 'perform' : 'return', beat: Math.max(0, elapsed) / event.beatMs, weight, wave: (.55 + .3 * Math.sin(elapsed / 420 + index * 2.39996)) * weight } };
}

/** Shared-clock public resolver, preserving in-flight version-one choreography. */
export function clubGroupMotionAt(nowServerMs: number, slot: number, event: GroupMotionEvent | null | undefined, baseMotion: ClubMotionState, reducedMotion = false): GroupMotionSample | null {
  if (event?.version !== 2 || event.kind === 'train') {
    const legacy = legacyGroupMotionAt(nowServerMs, slot, event, baseMotion, reducedMotion);
    return legacy ? { ...legacy, pose: { ...legacy.pose, version: event?.version ?? 1 } } : null;
  }
  if (event.kind === 'wave') return tidalGroupMotionAt(nowServerMs, slot, event, baseMotion, reducedMotion);
  const kind = event.kind;
  if (!Object.hasOwn(formations, kind)) return null;
  const plan = formations[kind], formationMs = 2000 + plan.stageMs.reduce((sum, value) => sum + value, 0);
  if (reducedMotion || !Number.isFinite(nowServerMs) || !Number.isFinite(event.startsAt) || !Number.isFinite(event.endsAt) || !Number.isFinite(event.beatMs) || event.beatMs <= 0 || event.endsAt - event.startsAt <= formationMs * 2 || nowServerMs < event.startsAt - GROUP_ACTION_LEAD_MS || nowServerMs >= event.endsAt) return null;
  const index = indexOf(slot), elapsed = nowServerMs - event.startsAt, duration = event.endsAt - event.startsAt;
  const returningAt = duration - formationMs, performingMs = returningAt - formationMs;
  const sourceClock = event.sourceClockBySlot?.[index];
  const source = clubMotionAt(Number.isFinite(sourceClock) ? sourceClock! : event.startsAt, index);
  let motion: GroupMotion;
  if (elapsed < 0) {
    const t = (elapsed + GROUP_ACTION_LEAD_MS) / GROUP_ACTION_LEAD_MS;
    const alignment = lineMotion(index, baseMotion, source, t, GROUP_ACTION_LEAD_MS);
    const speed = alignment.speed + baseMotion.speed * (1 - smooth(t));
    motion = { ...alignment, speed, walkBlend: 1 - (1 - alignment.walkBlend) * (1 - (1 - smooth(t)) * baseMotion.walkBlend) };
  } else if (elapsed < 2000) motion = lineMotion(index, source, seat(index), elapsed / 2000, 2000);
  else if (elapsed < formationMs) motion = formationStage(index, plan, elapsed - 2000);
  else if (elapsed < returningAt) {
    const target = plan.points.at(-1)![index];
    motion = { slot: index, ...target, speed: 0, distance: 0, walkBlend: 0, action: 'bounce', sampleAtDistance: () => target };
  } else if (elapsed < duration - 2000) motion = formationStage(index, plan, elapsed - returningAt, true);
  else motion = returnToRoam(index, baseMotion, (elapsed - duration + 2000) / 2000);
  const phase: GroupPose['phase'] = elapsed < formationMs ? 'prepare' : elapsed < returningAt ? 'perform' : 'return';
  const time = Math.max(0, elapsed - formationMs);
  const signals = phase === 'perform' ? performanceSignals(kind, index, time, performingMs, event.beatMs) : { wave: 0, activation: 0 };
  return { motion, pose: { kind, version: 2, phase, beat: time / event.beatMs, weight: elapsed < 0 ? 0 : smooth(elapsed / 1000) * smooth((duration - elapsed) / 1000), ...signals } };
}
