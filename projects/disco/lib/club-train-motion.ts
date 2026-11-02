import type { Participant } from './room-types.ts';
import { personalRouteTime } from './room-action-state.ts';
import { dancerSlot, stagePosition } from './club-scene-math.ts';
import { clubMotionAt, clubMotionAtDistance, type ClubMotionState } from './club-scene-motion.ts';

/** Versioned, absolute-clock train choreography shared by rendering and recovery. */
export interface TrainEvent { readonly kind: string; readonly version?: number; readonly startsAt: number; readonly endsAt: number; readonly beatMs?: number; readonly trainStartDistance?: number; readonly trainReleasePauseBySlot?: readonly number[] }
export const TRAIN_DURATION_MS = 16000;
export const TRAIN_JUMP_MS = 700;
export const TRAIN_RING_RADIUS = 4;
export const TRAIN_CARRIAGE_ANGLE = .55;
export const TRAIN_ENGINE_LEAD_ANGLE = .55;
export const TRAIN_DECK_HEIGHT = .64;
export const TRAIN_SINK_DEPTH = 2.4;
export const TRAIN_TOTAL_DISTANCE = 5 * Math.PI * TRAIN_RING_RADIUS;
export const TRAIN_SLOT_ORDER: readonly number[] = Object.freeze([3, 5, 6, 4, 2, 0, 8, 7, 9, 1]);
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const slotIndex = (slot: number) => ((Math.trunc(Number.isFinite(slot) ? slot : 0) % 10) + 10) % 10;
type Placement = { x: number; z: number; heading: number };
/** +Z faces forward; formation compresses the passenger arc to leave room ahead. */
export function trainRingPlacement(index: number, distance = 0, target: Placement = { x: 0, z: 0, heading: 0 }, formation = 0): Placement {
  const compression = clamp(formation);
  const angle = -Math.PI / 10 - index * TAU / 10 + (index - 4.5) * (TAU / 10 - TRAIN_CARRIAGE_ANGLE) * compression + distance / TRAIN_RING_RADIUS;
  const c = Math.cos(angle), s = Math.sin(angle);
  target.x = TRAIN_RING_RADIUS * (c + s) * Math.SQRT1_2;
  target.z = TRAIN_RING_RADIUS * (s - c) * Math.SQRT1_2;
  target.heading = Math.atan2(c - s, c + s);
  return target;
}
/** Engine leads the first carriage; the tail is deliberately not linked back. */
export function trainLocomotivePlacement(distance: number, formation = 1, target: Placement = { x: 0, z: 0, heading: 0 }): Placement {
  const compression = clamp(formation);
  const angle = -Math.PI / 10 + Math.PI / 10 * (1 - compression) + (TRAIN_ENGINE_LEAD_ANGLE - 4.5 * (TAU / 10 - TRAIN_CARRIAGE_ANGLE)) * compression + distance / TRAIN_RING_RADIUS;
  const c = Math.cos(angle), s = Math.sin(angle);
  target.x = TRAIN_RING_RADIUS * (c + s) * Math.SQRT1_2;
  target.z = TRAIN_RING_RADIUS * (s - c) * Math.SQRT1_2;
  target.heading = Math.atan2(c - s, c + s);
  return target;
}
export function trainSlotPlacement(slot: number, distance = 0, formation = 0): Placement { return trainRingPlacement(TRAIN_SLOT_ORDER.indexOf(slotIndex(slot)), distance, undefined, formation); }
export interface TrainFrame {
  readonly formation: number;
  readonly phase: 'jump' | 'hop' | 'rise' | 'ride' | 'sink';
  readonly seconds: number;
  readonly distance: number;
  readonly emergence: number;
  readonly lift: number;
  readonly hop: number;
  readonly jumpProgress: number;
}
export function sampleTrainFrame(now: number, event: TrainEvent | null | undefined, reducedMotion = false): TrainFrame | null {
  if (reducedMotion || event?.kind !== 'train' || event.version !== 3 || !Number.isFinite(now) || !Number.isFinite(event.startsAt) || !Number.isFinite(event.endsAt) || event.endsAt <= event.startsAt || event.beatMs !== undefined && (!Number.isFinite(event.beatMs) || event.beatMs <= 0)) return null;
  const elapsed = now - event.startsAt;
  if (elapsed < 0 || now >= event.endsAt) return null;
  // Normalized against the accepted duration, so stored events remain reconstructable.
  const t = elapsed * TRAIN_DURATION_MS / (event.endsAt - event.startsAt);
  const half = Math.PI * TRAIN_RING_RADIUS;
  let phase: TrainFrame['phase'], distance = 0, emergence = 0, lift = 0, hop = 0;
  if (t < TRAIN_JUMP_MS) { phase = 'jump'; hop = Math.sin(Math.PI * t / TRAIN_JUMP_MS) ** 2; }
  else if (t < 5500) {
    phase = 'hop';
    const hops = (t - TRAIN_JUMP_MS) / 600, cycle = hops % 1;
    const flight = clamp((cycle - .08) / .84);
    hop = Math.sin(Math.PI * flight) ** 2;
    distance = half * (Math.floor(hops) + smooth(flight)) / 8;
    lift = hop * .62;
  } else if (t < 6500) { phase = 'rise'; distance = half; emergence = smooth((t - 5500) / 1000); }
  else if (t < 14500) {
    phase = 'ride'; emergence = 1;
    const p = (t - 6500) / 8000, ramp = .1;
    const lap = p < ramp ? p * p / (2 * ramp) / (1 - ramp) : p > 1 - ramp ? 1 - (1 - p) ** 2 / (2 * ramp) / (1 - ramp) : (p - ramp / 2) / (1 - ramp);
    distance = half + TAU * TRAIN_RING_RADIUS * 2 * lap;
  } else { phase = 'sink'; distance = TRAIN_TOTAL_DISTANCE; emergence = 1 - smooth((t - 14500) / 1500); }
  if (phase === 'rise' || phase === 'ride' || phase === 'sink') lift = Math.max(0, TRAIN_DECK_HEIGHT - TRAIN_SINK_DEPTH * (1 - emergence));
  // Compress while every solid train part is still below the floor, then
  // reopen only after it has sunk. Riders share this exact transform and land
  // on the unchanged release circle. 0.55 rad retains >2.17m rider clearance.
  const formation = smooth((t - 5500) / 250) * (1 - smooth((t - 15500) / 500));
  return { formation, phase, seconds: elapsed / 1000, distance: distance + (event.trainStartDistance ?? 0), emergence, lift, hop, jumpProgress: smooth(t / TRAIN_JUMP_MS) };
}

/** Apply only personal holds accrued after this train; shared performance never pauses. */
export function trainReleaseClock(now: number, participant: Pick<Participant, 'slot' | 'joinedAt' | 'actionAt' | 'actionUntil' | 'routePauseMs'> | null | undefined, event: TrainEvent | null | undefined): number {
  if (!participant || event?.kind !== 'train' || event.version !== 3 || now < event.endsAt) return now;
  const baseline = participant.joinedAt <= event.startsAt ? event.trainReleasePauseBySlot?.[participant.slot] ?? 0 : 0;
  const pause = Math.max(0, now - personalRouteTime(participant, now) - baseline);
  return Math.max(event.endsAt, now - pause);
}

/** Walk away from the landing circle into the closest existing route territory.
 * The front pair use a clearance waypoint, so dispersal never cuts through the
 * DJ or another actor. Five seconds later the ordinary full roam is restored.
 * No return-to-start or teleport; late viewers reconstruct the same transition.
 */
export function trainReleaseMotion(now: number, slot: number, event: TrainEvent | null | undefined): ClubMotionState | null {
  if (event?.kind !== 'train' || event.version !== 3 || !Number.isFinite(now) || !Number.isFinite(event.endsAt) || !Number.isFinite(event.startsAt) || event.endsAt <= event.startsAt || now < event.endsAt) return null;
  const index = slotIndex(slot), elapsed = now - event.endsAt;
  const offset = event.trainStartDistance ?? 0;
  const shift = Math.round(offset / (TAU * TRAIN_RING_RADIUS / 10));
  const mapped = TRAIN_SLOT_ORDER[((TRAIN_SLOT_ORDER.indexOf(index) + 5 - shift) % 10 + 10) % 10];
  const base = clubMotionAt(now, mapped), ring = trainSlotPlacement(index, TRAIN_TOTAL_DISTANCE + offset);
  const seat: Placement = { ...dancerSlot(mapped), heading: Math.PI / 4 };
  const spread: Placement = mapped === 8 || mapped === 9 ? { ...stagePosition(mapped === 8 ? -2.2 : 2.2, 5.2), heading: Math.PI / 4 } : seat;
  if (elapsed >= 5000) return { ...base, slot: index, sampleAtDistance: (at: number) => clubMotionAtDistance(mapped, at) };
  const a = elapsed < 2000 ? ring : elapsed < 3000 ? spread : seat;
  const b = elapsed < 2000 ? spread : elapsed < 3000 ? seat : base;
  const duration = elapsed < 2000 ? 2000 : elapsed < 3000 ? 1000 : 2000;
  const t = clamp((elapsed - (elapsed < 2000 ? 0 : elapsed < 3000 ? 2000 : 3000)) / duration), p = smooth(t);
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  const travelHeading = length > 1e-8 ? Math.atan2(dx, dz) : a.heading;
  const angleMix = (from: number, to: number, amount: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * clamp(amount);
  const returning = elapsed >= 3000;
  // The destination itself moves while merging back into roaming. Face the
  // derivative of the displayed path, not a blend toward a future pose: that
  // blend could turn a still-walking rider almost 180 degrees backward.
  const progressSpeed = 6 * t * (1 - t) * 1000 / duration;
  const vx = dx * progressSpeed + (returning ? Math.sin(base.heading) * base.speed * p : 0);
  const vz = dz * progressSpeed + (returning ? Math.cos(base.heading) * base.speed * p : 0);
  const speed = Math.hypot(vx, vz);
  const restHeading = p < .18 ? angleMix(a.heading, travelHeading, smooth(p / .18)) : p > .65 ? angleMix(travelHeading, b.heading, smooth((p - .65) / .35)) : travelHeading;
  // Only ease the endpoint turn while nearly stationary; normal steps always
  // face their true tangent. Shortest-angle mixing also crosses +/-pi safely.
  const heading = angleMix(restHeading, speed > 1e-8 ? Math.atan2(vx, vz) : restHeading, smooth(speed / .08));
  const point = { x: a.x + dx * p, z: a.z + dz * p, heading };
  const distance = returning ? base.distance - (1 - p) * length : p * length;
  const pathOrigin = clubMotionAtDistance(mapped, distance);
  const contactTurn = angleMix(pathOrigin.heading, heading, 1) - pathOrigin.heading;
  const sampleAtDistance = returning ? (at: number): Placement => {
    const sample = clubMotionAtDistance(mapped, at);
    return { x: sample.x + point.x - pathOrigin.x, z: sample.z + point.z - pathOrigin.z, heading: sample.heading + contactTurn };
  } : (at: number): Placement => { const q = length > 1e-8 ? clamp(at / length) : 0; return { x: a.x + dx * q, z: a.z + dz * q, heading }; };
  const transitionSpeed = length * progressSpeed;
  const walkBlend = 1 - (1 - smooth(transitionSpeed / .18)) * (1 - (returning ? p * base.walkBlend : 0));
  return { slot: index, ...point, speed, distance, walkBlend, action: 'dance', sampleAtDistance };
}
