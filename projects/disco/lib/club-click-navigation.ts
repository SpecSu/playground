import { CLUB_BOOTH_BOUNDS } from './club-scene-motion.ts';
import { isManualWalkable, manualPeerClearance, sweepManualPosition, type ManualBlocker, type ManualPoint } from './club-manual-motion.ts';
import { MOVEMENT_BODY_RADIUS, MOVEMENT_SPEED_LIMIT } from './room-movement.ts';

export const CLICK_ARRIVAL_RADIUS = .12;
const distance = (a: ManualPoint, b: ManualPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const fromUV = (u: number, v: number): ManualPoint => ({ x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 });
const clearance = (blocker: ManualBlocker) => manualPeerClearance(blocker.radius);
const safe = (point: ManualPoint, blockers: readonly ManualBlocker[]) => isManualWalkable(point) && blockers.every(blocker => distance(point, blocker) >= clearance(blocker) + .02);
const visible = (a: ManualPoint, b: ManualPoint, blockers: readonly ManualBlocker[]) => distance(sweepManualPosition(a, { x: b.x - a.x, z: b.z - a.z }, blockers), b) < .0001;

function availableTarget(requested: ManualPoint, start: ManualPoint, blockers: readonly ManualBlocker[]): ManualPoint | null {
 if (safe(requested, blockers)) return requested;
 // At most 256 candidates within 1.6 m. Crowded endpoints never push another person.
 for (let ring = 1; ring <= 8; ring++) {
  let best: ManualPoint | null = null, nearest = Infinity;
  for (let ray = 0; ray < 32; ray++) {
   const angle = ray * Math.PI / 16, point = { x: requested.x + Math.cos(angle) * ring * .2, z: requested.z + Math.sin(angle) * ring * .2 };
   if (!safe(point, blockers)) continue;
   const span = distance(start, point); if (span < nearest) { nearest = span; best = point; }
  }
  if (best) return best;
 }
 return null;
}

/** Tiny visibility graph: four booth corners and eight outside points per body (maximum nine bodies).
 * This is a bounded local detour, not a guarantee of a route through every crowd arrangement.
 */
function routeTo(start: ManualPoint, target: ManualPoint, blockers: readonly ManualBlocker[]): ManualPoint[] {
 if (visible(start, target, blockers)) return [target];
 const b = CLUB_BOOTH_BOUNDS, pad = MOVEMENT_BODY_RADIUS + .07;
 const candidates = [fromUV(b.minU - pad, b.minV - pad), fromUV(b.minU - pad, b.maxV + pad), fromUV(b.maxU + pad, b.minV - pad), fromUV(b.maxU + pad, b.maxV + pad)];
 for (const blocker of blockers) for (let ray = 0; ray < 8; ray++) {
  const angle = ray * Math.PI / 4, radius = (clearance(blocker) + .06) / Math.cos(Math.PI / 8);
  candidates.push({ x: blocker.x + Math.cos(angle) * radius, z: blocker.z + Math.sin(angle) * radius });
 }
 const nodes = [start, target, ...candidates.filter(point => safe(point, blockers))];
 const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), seen = new Set<number>(); costs[0] = 0;
 for (let pass = 0; pass < nodes.length; pass++) {
  let at = -1;
  for (let i = 0; i < nodes.length; i++) if (!seen.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
  if (at < 0 || !Number.isFinite(costs[at]) || at === 1) break;
  seen.add(at);
  for (let next = 0; next < nodes.length; next++) {
   if (seen.has(next)) continue;
   const cost = costs[at] + distance(nodes[at], nodes[next]);
   if (cost >= costs[next] || !visible(nodes[at], nodes[next], blockers)) continue;
   costs[next] = cost; previous[next] = at;
  }
 }
 if (previous[1] < 0) return [];
 const route: ManualPoint[] = [];
 for (let at = 1; at > 0; at = previous[at]) route.unshift(nodes[at]);
 return route;
}

export class ClickNavigation {
 private requested: ManualPoint | null;
 private endpoint: ManualPoint | null;
 private arrived: ManualPoint | null = null;
 private route: ManualPoint[] = [];
 private replanIn = 0;
 private stalled = 0;
 private elapsed = 0;
 constructor(target: ManualPoint) { this.requested = isManualWalkable(target) ? { ...target } : null; this.endpoint = this.requested; }
 get active() { return this.requested !== null; }
 get destination(): ManualPoint | null { return this.endpoint; }
 /** Display-only endpoint retained on arrival, never on cancellation or a stalled route. */
 get arrivalDestination(): ManualPoint | null { return this.arrived; }
 cancel() { this.requested = null; this.endpoint = null; this.arrived = null; this.route = []; }
 private arrive() { const endpoint = this.endpoint; this.cancel(); this.arrived = endpoint; }
 step(start: ManualPoint, deltaSeconds: number, incoming: readonly ManualBlocker[]): ManualPoint {
  if (!this.requested) return start;
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(.1, deltaSeconds)) : 0;
  if (!dt) return start;
  const blockers = incoming.filter(point => Number.isFinite(point.x + point.z)).slice(0, 9);
  this.elapsed += dt; this.replanIn -= dt;
  if (this.elapsed >= 30) { this.cancel(); return start; }
  if (this.replanIn <= 0 && (!this.route.length || !visible(start, this.route[0], blockers) || !this.endpoint || !safe(this.endpoint, blockers))) {
   this.endpoint = availableTarget(this.requested, start, blockers);
   this.route = this.endpoint ? routeTo(start, this.endpoint, blockers) : [];
   this.replanIn = .4;
  }
  if (this.endpoint && distance(start, this.endpoint) <= CLICK_ARRIVAL_RADIUS) { this.arrive(); return start; }
  // Consume only a waypoint already reached; never snap across even a small gap.
  while (this.route.length > 1 && distance(start, this.route[0]) < .04) this.route.shift();
  const target = this.route[0];
  if (!target) { this.stalled += dt; if (this.stalled >= 1.5) this.cancel(); return start; }
  const span = distance(start, target), amount = Math.min(span, MOVEMENT_SPEED_LIMIT * dt), scale = span ? amount / span : 0;
  const next = sweepManualPosition(start, { x: (target.x - start.x) * scale, z: (target.z - start.z) * scale }, blockers);
  this.stalled = distance(start, next) < .0001 ? this.stalled + dt : 0;
  if (this.stalled >= 1.5) this.cancel();
  else if (this.endpoint && distance(next, this.endpoint) <= CLICK_ARRIVAL_RADIUS) this.arrive();
  return next;
 }
}
