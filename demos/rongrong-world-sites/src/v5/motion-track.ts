import type {GridPoint} from './layout.ts';

export const DEFAULT_RENDER_DELAY_MS = 220;
export type MotionSnapshot = {position: GridPoint; at: number; route?: GridPoint[]};
export type MotionSample = {position: GridPoint; distance: number; speed: number; heading: number};
export type MotionPathSample = GridPoint & {heading: number};

type PathPoint = GridPoint & {distance: number};
type TrackSnapshot = {
  position: GridPoint;
  at: number;
  distance: number;
  heading: number;
  path: PathPoint[];
};
const MAX_SAMPLES = 120;
const copyPoint = (p: GridPoint): GridPoint => ({x: p.x, z: p.z});

/** The path contains positive-length edges with global cumulative distances. */
function pointOnPath(path: PathPoint[], distance: number): MotionPathSample {
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1], to = path[i];
    if (distance < to.distance || i === path.length - 1) {
      const fraction = Math.max(0, Math.min(1, (distance - from.distance) / (to.distance - from.distance)));
      return {
        x: from.x + (to.x - from.x) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        heading: Math.atan2(to.x - from.x, to.z - from.z),
      };
    }
  }
  // Only non-stationary snapshots call this helper.
  throw new Error('Motion path has no edges');
}

/** Renders buffered authority timestamps; paths are supplied by navigation. */
export class BufferedMotionTrack {
  private snapshots: TrackSnapshot[];
  private renderedAt: number;

  constructor(position: GridPoint, at: number) {
    this.snapshots = [{position: copyPoint(position), at, distance: 0, heading: 0, path: []}];
    this.renderedAt = at;
  }

  push({position, at, route = []}: MotionSnapshot): boolean {
    const previous = this.snapshots[this.snapshots.length - 1];
    if (at <= previous.at) return false;
    const path: PathPoint[] = [{...previous.position, distance: previous.distance}];
    // Property-only updates must not replay a stale route or retime earlier motion.
    if (position.x !== previous.position.x || position.z !== previous.position.z) {
      for (const p of [...route, position]) {
        const last = path[path.length - 1], length = Math.hypot(p.x - last.x, p.z - last.z);
        if (length > 0) path.push({...copyPoint(p), distance: last.distance + length});
      }
    }
    const distance = path[path.length - 1].distance;
    const heading = path.length > 1 ? pointOnPath(path, distance).heading : previous.heading;
    this.snapshots.push({position: copyPoint(position), at, distance, heading, path});
    if (this.snapshots.length > MAX_SAMPLES) {
      this.snapshots.shift();
      // The first retained timestamp is now the history boundary, not its old incoming edge.
      this.snapshots[0].path = [];
    }
    return true;
  }

  sample(now: number): MotionSample {
    const first = this.snapshots[0], latest = this.snapshots[this.snapshots.length - 1];
    // Remember only displayed authority time. A future wall clock must not consume late samples.
    const at = Math.max(this.renderedAt, first.at, Math.min(now - DEFAULT_RENDER_DELAY_MS, latest.at));
    this.renderedAt = at;
    if (at >= latest.at || at <= first.at) {
      const endpoint = at >= latest.at ? latest : first;
      return {position: copyPoint(endpoint.position), distance: endpoint.distance, speed: 0, heading: endpoint.heading};
    }
    for (let i = 1; i < this.snapshots.length; i++) {
      const previous = this.snapshots[i - 1], next = this.snapshots[i];
      if (at >= next.at) continue;
      const length = next.distance - previous.distance;
      if (length === 0) return {position: copyPoint(previous.position), distance: previous.distance, speed: 0, heading: previous.heading};
      const duration = next.at - previous.at;
      const distance = previous.distance + length * (at - previous.at) / duration;
      const {x, z, heading} = pointOnPath(next.path, distance);
      return {position: {x, z}, distance, speed: length / duration * 1000, heading};
    }
    throw new Error('Motion time is outside its buffered interval');
  }

  /** Query the same retained route in global distance coordinates for planted feet. */
  sampleAtDistance(distance: number): MotionPathSample {
    const first = this.snapshots[0], latest = this.snapshots[this.snapshots.length - 1];
    const clamped = Math.max(first.distance, Math.min(distance, latest.distance));
    for (let i = 1; i < this.snapshots.length; i++) {
      const next = this.snapshots[i];
      if (clamped < next.distance) return pointOnPath(next.path, clamped);
    }
    return {...copyPoint(latest.position), heading: latest.heading};
  }
}
