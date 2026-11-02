import { FESTIVAL_MONUMENT_RADIUS, FESTIVAL_MOVE_SPEED, FESTIVAL_WORLD_RADIUS, festivalMovementSpeed, projectParticipant, type FestivalMovement, type FestivalParticipant } from './festival-types';

/** Covers all bounded transport retries; completion normally settles it much sooner. */
export const FESTIVAL_PREDICTION_TTL_MS = 30_000;
export type FestivalPrediction = FestivalMovement & { actorId: string; expiresAt: number; token: number };
export type FestivalVisualMotion = ReturnType<typeof projectParticipant> & { walkBlend: number };
export type FestivalRenderedSelf = FestivalVisualMotion & { actorId: string };

export function selectFestivalMovement(participant: FestivalParticipant, prediction: FestivalPrediction | null, now: number): FestivalMovement {
  return prediction && prediction.actorId === participant.id && prediction.expiresAt > now ? prediction : participant;
}

/** The route stays server-owned. Only its rendered pose is reconciled, at bounded speed. */
export function stepFestivalMotion(previous: FestivalVisualMotion | null, source: FestivalMovement, now: number, frameSeconds: number): FestivalVisualMotion {
  const raw = projectParticipant(source, now);
  if (!previous) return { ...raw, distance: 0, walkBlend: raw.speed > 0 ? 1 : 0 };
  const dt = Math.max(0, Math.min(.05, frameSeconds));
  if (dt === 0) return previous;
  // Sampling this frame's slice avoids replaying a multi-second gap after a paused RAF.
  const before = projectParticipant(source, now - dt * 1000);
  const dx = raw.x - before.x, dz = raw.z - before.z;
  let x = previous.x + dx, z = previous.z + dz;
  // Prediction may be ahead of a later-started server route. Never walk past its destination.
  if (Math.hypot(source.targetX - previous.x, source.targetZ - previous.z) < Math.hypot(dx, dz)) {
    x = source.targetX; z = source.targetZ;
  }
  const constrain = () => {
    const radius = Math.hypot(x, z);
    const bounded = Math.max(FESTIVAL_MONUMENT_RADIUS, Math.min(FESTIVAL_WORLD_RADIUS, radius));
    if (radius > 0 && radius !== bounded) { x *= bounded / radius; z *= bounded / radius; }
  };
  constrain();
  // At walking speed correction is slower than forward motion, so an acknowledged
  // same-target command cannot yank a locally predicted walker backwards.
  const sourceSpeed = festivalMovementSpeed(source);
  const correctionSpeed = raw.speed > 0 ? sourceSpeed * .5 : sourceSpeed;
  const corrected = projectParticipant({ x, z, targetX: raw.x, targetZ: raw.z, moveAt: 0, heading: raw.heading }, dt * correctionSpeed / FESTIVAL_MOVE_SPEED * 1000);
  // At the shared destination, a late same-target acknowledgement must not pull
  // the locally arrived walker backwards while authority finishes its route.
  if (!(raw.speed > 0 && Math.hypot(source.targetX - x, source.targetZ - z) < 1e-8)) {
    x = corrected.x; z = corrected.z;
  }
  constrain();
  const travelled = Math.hypot(x - previous.x, z - previous.z);
  const speed = travelled / dt;
  const turn = Math.atan2(Math.sin(raw.heading - previous.heading), Math.cos(raw.heading - previous.heading));
  const heading = previous.heading + turn * (1 - Math.exp(-dt * 14));
  const blend = speed > .05 ? 1 : 0;
  return { x, z, heading, speed, distance: previous.distance + travelled, walkBlend: blend + (previous.walkBlend - blend) * Math.exp(-dt * 12) };
}

/** A monotonic timebase with gradual clock correction, independent of Date.now changes. */
export class FestivalClock {
  private offset: number;
  private targetOffset: number;
  private lastLocal: number;
  private initialized = false;
  private readonly localNow: () => number;
  constructor(localNow: () => number = () => performance.now(), wallNow = Date.now()) {
    this.localNow = localNow;
    this.lastLocal = localNow();
    this.offset = this.targetOffset = wallNow - this.lastLocal;
  }
  now(): number {
    const local = Math.max(this.lastLocal, this.localNow());
    const allowance = (local - this.lastLocal) * .1;
    this.offset += Math.max(-allowance, Math.min(allowance, this.targetOffset - this.offset));
    this.lastLocal = local;
    return local + this.offset;
  }
  accept(serverNow: number, started: number, ended: number): void {
    this.now();
    const offset = serverNow - (started + ended) / 2;
    if (!this.initialized) { this.offset = offset; this.initialized = true; }
    this.targetOffset = offset;
  }
}
