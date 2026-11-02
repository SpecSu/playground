import { dancerSlot, stagePosition, stablePhase } from './club-scene-math.ts';
import { WALKING_SPEED_MULTIPLIER } from './room-movement.ts';
import { CLUB_AVATAR_SCALE } from './club-avatar-scale.ts';
import type { RoomAction } from './room-types';

export interface ClubPoint { readonly u: number; readonly v: number }
export interface ClubMotionState {
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  /** World yaw of the navigation root, independent of dance spins. */
  readonly heading: number;
  readonly speed: number;
  /** Unwrapped arc distance, in world metres, for planted-foot animation. */
  readonly distance: number;
  readonly walkBlend: number;
  readonly action: RoomAction;
  /** Optional route inverse for a shared group path; ordinary roaming uses its slot curve. */
  readonly sampleAtDistance?: (distance: number) => Pick<ClubMotionState, 'x' | 'z' | 'heading'>;
}

// This is an animated envelope, not the smaller rest-pose shadow radius.
export const CLUB_BODY_RADIUS = 0.7 * CLUB_AVATAR_SCALE;
// Keep the established choreography corridors while resizing the models. A
// smaller body must not silently expand roaming routes into train ingress paths.
const CLUB_ROUTE_RESERVATION_RADIUS = Math.max(CLUB_BODY_RADIUS, 1.4);
export const CLUB_BODY_GAP = 0.12;
// A separate mesh margin protects short armed avatars without changing peers.
export const CLUB_BOOTH_GAP = 0.14;
export const CLUB_BOOTH_BOUNDS = Object.freeze({ minU: -1.44, maxU: 1.44, minV: -2.3, maxV: 0.65 });
export const CLUB_WALK_BOUNDS = Object.freeze({ minU: -4.2, maxU: 4.2, minV: -4.2, maxV: 6 });
const COUNT = 10;
const ARC_STEPS = 48;
const ACTIONS: readonly RoomAction[] = ['dance', 'wave', 'bounce', 'dance', 'spin'];
const slotIndex = (slot: number) => ((Math.trunc(Number.isFinite(slot) ? slot : 0) % COUNT) + COUNT) % COUNT;
const mix = (a: ClubPoint, b: ClubPoint, t: number): ClubPoint => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
const length = (a: ClubPoint, b: ClubPoint) => Math.hypot(a.u - b.u, a.v - b.v);
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
const toHeading = (u: number, v: number) => { const d = stagePosition(u, v); return Math.atan2(d.x, d.z); };

/** Intersect a convex polygon with n dot p <= limit. All future curves stay in it. */
function clip(points: readonly ClubPoint[], nu: number, nv: number, limit: number): ClubPoint[] {
  const result: ClubPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = nu * a.u + nv * a.v - limit, db = nu * b.u + nv * b.v - limit;
    if (da <= 1e-10) result.push(a);
    if ((da < 0) !== (db < 0)) result.push(mix(a, b, da / (da - db)));
  }
  return result;
}

const seats: readonly ClubPoint[] = Array.from({ length: COUNT }, (_, slot) => {
  const p = dancerSlot(slot);
  return { u: (p.x - p.z) * Math.SQRT1_2, v: (p.x + p.z) * Math.SQRT1_2 };
});
const territories = seats.map((seat, slot) => {
  const b = CLUB_WALK_BOUNDS;
  let polygon: ClubPoint[] = [{ u: b.minU, v: b.minV }, { u: b.maxU, v: b.minV }, { u: b.maxU, v: b.maxV }, { u: b.minU, v: b.maxV }];
  seats.forEach((other, index) => {
    if (index === slot) return;
    const d = length(seat, other), nu = (other.u - seat.u) / d, nv = (other.v - seat.v) / d;
    polygon = clip(polygon, nu, nv, (nu * (seat.u + other.u) + nv * (seat.v + other.v)) / 2 - CLUB_ROUTE_RESERVATION_RADIUS - CLUB_BODY_GAP / 2);
  });
  // Select the outward face of the combined DJ/booth box. This deliberately
  // trades crossing the room for long, disjoint and provably safe territories.
  const booth = CLUB_BOOTH_BOUNDS;
  const boothV = seat.v < 0 ? -booth.minV : booth.maxV;
  if (Math.abs(seat.u) / booth.maxU > Math.abs(seat.v) / boothV) {
    polygon = clip(polygon, -Math.sign(seat.u), 0, -(booth.maxU + CLUB_ROUTE_RESERVATION_RADIUS + CLUB_BOOTH_GAP));
  } else {
    polygon = clip(polygon, 0, -Math.sign(seat.v), -(boothV + CLUB_ROUTE_RESERVATION_RADIUS + CLUB_BOOTH_GAP));
  }
  if (polygon.length < 3) throw new Error(`Empty club territory for slot ${slot}`);
  return Object.freeze(polygon.map((p) => Object.freeze(p)));
});

export function clubTerritory(slot: number): readonly ClubPoint[] { return territories[slotIndex(slot)]; }

interface Segment {
  a: ClubPoint;
  b: ClubPoint;
  c: ClubPoint;
  arc: readonly number[];
  distance: number;
  offset: number;
  incoming: number;
  outgoing: number;
  durationMs: number;
  startsAtMs: number;
}
interface Route { segments: readonly Segment[]; durationMs: number; phaseMs: number; distance: number }

function pointOn(segment: Pick<Segment, 'a' | 'b' | 'c'>, t: number): ClubPoint {
  return mix(mix(segment.a, segment.b, t), mix(segment.b, segment.c, t), t);
}
function tangentOn(segment: Pick<Segment, 'a' | 'b' | 'c'>, t: number): ClubPoint {
  return { u: 2 * ((1 - t) * (segment.b.u - segment.a.u) + t * (segment.c.u - segment.b.u)), v: 2 * ((1 - t) * (segment.b.v - segment.a.v) + t * (segment.c.v - segment.b.v)) };
}
function headingOn(segment: Segment, t: number): number {
  const tangent = tangentOn(segment, t);
  if (Math.hypot(tangent.u, tangent.v) > 1e-10) return toHeading(tangent.u, tangent.v);
  if (segment.distance > 1e-10) {
    const direction = tangentOn(segment, t < 0.5 ? 0.001 : 0.999);
    return toHeading(direction.u, direction.v);
  }
  const turn = Math.atan2(Math.sin(segment.outgoing - segment.incoming), Math.cos(segment.outgoing - segment.incoming));
  return segment.incoming + turn * smooth(t);
}

const routes: readonly Route[] = territories.map((polygon, slot) => {
  const center = polygon.reduce((p, q) => ({ u: p.u + q.u / polygon.length, v: p.v + q.v / polygon.length }), { u: 0, v: 0 });
  let a = polygon[0], b = polygon[1], longest = 0;
  for (const p of polygon) for (const q of polygon) if (length(p, q) > longest) { longest = length(p, q); a = p; b = q; }
  if (slot % 2) [a, b] = [b, a];
  // Retain 94% of the available reach, rather than smoothing away the stroll.
  a = mix(center, a, 0.94); b = mix(center, b, 0.94);
  const side = (p: ClubPoint) => (b.u - a.u) * (p.v - center.v) - (b.v - a.v) * (p.u - center.u);
  const ordered = [...polygon].sort((p, q) => side(p) - side(q));
  const c = mix(center, ordered[0], 0.65), d = mix(center, ordered.at(-1)!, 0.65);
  // Repeated end controls create real dance stops. Midpoint quadratic segments
  // join C1, close without a reset, and remain inside the polygon's convex hull.
  const controls = [a, a, a, c, b, b, b, d];
  const segmentMs = 2600 + Math.floor(stablePhase(`club-route-speed:${slot}`) * 900);
  let offset = 0;
  let durationMs = 0;
  const segments = controls.map((p, index): Segment => {
    const previous = controls[(index + controls.length - 1) % controls.length], next = controls[(index + 1) % controls.length];
    const curve = { a: mix(previous, p, 0.5), b: p, c: mix(p, next, 0.5) };
    let last = curve.a, distance = 0;
    const arc = [0];
    for (let step = 1; step <= ARC_STEPS; step++) { const at = pointOn(curve, step / ARC_STEPS); distance += length(last, at); arc.push(distance); last = at; }
    // Speed up translation only; in-place dance stops retain their full duration.
    const duration = distance < 1e-10 ? segmentMs * 3 : segmentMs / WALKING_SPEED_MULTIPLIER;
    const segment = { ...curve, arc, distance, offset, incoming: 0, outgoing: 0, durationMs: duration, startsAtMs: durationMs };
    offset += distance;
    durationMs += duration;
    return segment;
  });
  segments.forEach((segment, index) => {
    if (segment.distance > 1e-10) return;
    const previous = segments[(index + segments.length - 1) % segments.length], next = segments[(index + 1) % segments.length];
    const incoming = tangentOn(previous, 0.999), outgoing = tangentOn(next, 0.001);
    segment.incoming = toHeading(incoming.u, incoming.v); segment.outgoing = toHeading(outgoing.u, outgoing.v);
  });
  return { segments, durationMs, phaseMs: Math.floor(stablePhase(`club-route-phase:${slot}`) * durationMs), distance: offset };
});

export function clubRouteDurationMs(slot: number): number { return routes[slotIndex(slot)].durationMs; }

/** O(1) shared-epoch placement. No renderer history, song anchor or random state. */
export function clubMotionAt(nowServerMs: number, slot: number, reducedMotion = false): ClubMotionState {
  const index = slotIndex(slot);
  if (reducedMotion) {
    const polygon = territories[index];
    const center = polygon.reduce((p, q) => ({ u: p.u + q.u / polygon.length, v: p.v + q.v / polygon.length }), { u: 0, v: 0 });
    return { slot: index, ...stagePosition(center.u, center.v), heading: Math.PI / 4, speed: 0, distance: 0, walkBlend: 0, action: 'dance' };
  }
  const route = routes[index], clock = Math.max(0, Number.isFinite(nowServerMs) ? nowServerMs : 0) + route.phaseMs;
  const loop = Math.floor(clock / route.durationMs), local = clock - loop * route.durationMs;
  const segmentIndex = route.segments.findIndex((segment) => local < segment.startsAtMs + segment.durationMs);
  const segment = route.segments[segmentIndex < 0 ? route.segments.length - 1 : segmentIndex];
  const t = (local - segment.startsAtMs) / segment.durationMs;
  const point = pointOn(segment, t), tangent = tangentOn(segment, t), speed = Math.hypot(tangent.u, tangent.v) * 1000 / segment.durationMs;
  const arcIndex = Math.min(ARC_STEPS - 1, Math.floor(t * ARC_STEPS)), blend = t * ARC_STEPS - arcIndex;
  const distance = loop * route.distance + segment.offset + segment.arc[arcIndex] + (segment.arc[arcIndex + 1] - segment.arc[arcIndex]) * blend;
  const actionIndex = Math.floor(stablePhase(`club-action:${index}:${loop}:${segmentIndex < 4 ? 0 : 1}`) * ACTIONS.length);
  return { slot: index, ...stagePosition(point.u, point.v), heading: headingOn(segment, t), speed, distance, walkBlend: smooth((speed - 0.018) / 0.075), action: ACTIONS[actionIndex] };
}

/** Arc-length inverse used to plant feet at repeatable world-space contacts. */
export function clubMotionAtDistance(slot: number, distance: number): Pick<ClubMotionState, 'x' | 'z' | 'heading'> {
  const route = routes[slotIndex(slot)], finite = Number.isFinite(distance) ? distance : 0;
  const local = ((finite % route.distance) + route.distance) % route.distance;
  const segment = route.segments.find((item) => item.distance > 1e-10 && local < item.offset + item.distance) ?? route.segments.find((item) => item.distance > 1e-10)!;
  const remaining = Math.max(0, local - segment.offset);
  let step = 1;
  while (step < ARC_STEPS && segment.arc[step] < remaining) step++;
  const span = segment.arc[step] - segment.arc[step - 1];
  const t = (step - 1 + (span > 0 ? (remaining - segment.arc[step - 1]) / span : 0)) / ARC_STEPS;
  const point = pointOn(segment, t);
  return { ...stagePosition(point.u, point.v), heading: headingOn(segment, t) };
}
