import {buildingFootprint, isOwned, isWalkable, terrainAt, type Building, type GridPoint, type Layout} from './layout.ts';
import {findActorPath} from './actor-navigation.ts';

export type LookoutPoint = GridPoint & {height: number};
export type LookoutPhase = 'approach' | 'ascent' | 'settle' | 'watching' | 'descent' | 'done';
export interface TowerAccess {
  buildingId: string;
  entry: GridPoint;
  top: LookoutPoint;
  route: LookoutPoint[];
}
export interface LookoutState {
  buildingId: string;
  position: GridPoint;
  height: number;
  phase: LookoutPhase;
  path: LookoutPoint[];
  pathIndex: number;
  phaseMs: number;
  access: TowerAccess;
  alerted: boolean;
  reportMs: number;
}
const HEIGHT = 2.23, SPEED = 1.5 / 1000, SETTLE_MS = 600, WATCH_MS = 8000, REPORT_MS = 800;
const EPS = 1e-8;
const point = (p: GridPoint): GridPoint => ({x: p.x, z: p.z});
const same = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z) < EPS;
const distance = (a: LookoutPoint, b: LookoutPoint) => Math.hypot(a.x - b.x, a.z - b.z, a.height - b.height);
const pose = (s: LookoutState): LookoutPoint => ({...s.position, height: s.height});
const finite = (p: LookoutPoint) => !!p && [p.x, p.z, p.height].every(Number.isFinite);
const phases: LookoutPhase[] = ['approach', 'ascent', 'settle', 'watching', 'descent', 'done'];

function futureLayout(layout: Layout): Layout {
  if (!layout.construction) return layout;
  const future = {...layout, ...layout.construction.target};
  delete future.construction;
  return future;
}

/** The only exception to solid-tower collision is this one tower's stairs.
 * Rotation is clockwise around its footprint centre. Render these exact points,
 * subtracting 5.5 from x/z; height is the actor's foot height, not its centre. */
export function towerAccess(layout: Layout, building: Building): TowerAccess | null {
  const b = layout.buildings.find(candidate => candidate.id === building.id);
  if (!b || b.kind !== 'tower' || b.x !== building.x || b.z !== building.z || b.rotation !== building.rotation) return null;
  // Demolition has no reserved footprint; validate the eventual geometry too.
  if (layout.construction && !towerAccess(futureLayout(layout), b)) return null;
  const footprint = buildingFootprint(b);
  if (footprint.some(p => !isOwned(layout, p) || terrainAt(p) !== 'grass')) return null;
  if (layout.buildings.some(other => other.id !== b.id && buildingFootprint(other).some(p => footprint.some(q => same(p, q))))) return null;
  if (layout.construction?.footprint.some(p => footprint.some(q => same(p, q)))) return null;
  const rotate = (p: LookoutPoint): LookoutPoint => {
    let x = p.x - .5, z = p.z - .5;
    for (let turns = 0; turns < b.rotation / 90; turns++) [x, z] = [-z, x];
    return {x: b.x + .5 + x, z: b.z + .5 + z, height: p.height};
  };
  const route = [
    {x: 0, z: 2, height: 0}, {x: 0, z: 1, height: HEIGHT / 2}, {x: 0, z: 0, height: HEIGHT},
    {x: .5, z: 0, height: HEIGHT}, {x: .5, z: .5, height: HEIGHT},
  ].map(rotate);
  const entry = point(route[0]);
  if (!isWalkable(layout, entry)) return null;
  return {buildingId: b.id, entry, top: {...route[route.length - 1]}, route};
}

function validState(state: LookoutState | null | undefined): state is LookoutState {
  return !!state && phases.includes(state.phase) && finite(pose(state)) &&
    Array.isArray(state.path) && state.path.length > 0 && state.path.every(finite) &&
    Number.isInteger(state.pathIndex) && state.pathIndex >= 1 && state.pathIndex <= state.path.length &&
    Number.isFinite(state.phaseMs) && state.phaseMs >= 0 && Number.isFinite(state.reportMs) && state.reportMs >= 0 &&
    !!state.access && state.buildingId === state.access.buildingId && finite(state.access.top) &&
    Array.isArray(state.access.route) && state.access.route.length > 1 && state.access.route.every(finite);
}

function matchingAccess(layout: Layout, state: LookoutState): TowerAccess | null {
  const building = layout.buildings.find(b => b.id === state.buildingId);
  const access = building && towerAccess(layout, building);
  return access && access.route.length === state.access.route.length &&
    access.route.every((p, i) => distance(p, state.access.route[i]) < EPS) ? access : null;
}

/** Use at every layout commit/undo entry point, including aggregate blueprints.
 * Both construction-time and installed geometry must retain the occupied route. */
export function lookoutReservationSafe(layout: Layout, state?: LookoutState | null): boolean {
  if (!state || state.phase === 'done') return true;
  if (!validState(state)) return false;
  const access = matchingAccess(layout, state);
  if (!access) return false;
  return state.phase !== 'approach' || (!!findActorPath(layout, state.position, access.entry) &&
    (!layout.construction || !!findActorPath(futureLayout(layout), state.position, access.entry)));
}

/** Passing the current active traversal reserves its tower and makes repeated
 * commands idempotent. There is one guardian, so there is no global lock store. */
export function startLookout(layout: Layout, from: GridPoint, buildingId?: string, active?: LookoutState | null): LookoutState | null {
  if (validState(active) && active.phase !== 'done') return active;
  let best: {access: TowerAccess; path: LookoutPoint[]; length: number} | undefined;
  for (const building of layout.buildings) {
    if (building.kind !== 'tower' || (buildingId !== undefined && building.id !== buildingId)) continue;
    const access = towerAccess(layout, building); if (!access) continue;
    const ground = findActorPath(layout, from, access.entry); if (!ground) continue;
    if (layout.construction && !findActorPath(futureLayout(layout), from, access.entry)) continue;
    const path = ground.map(p => ({...p, height: 0}));
    const length = path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
    if (!best || length < best.length) best = {access, path, length};
  }
  if (!best) return null;
  return {buildingId: best.access.buildingId, position: point(from), height: 0, phase: 'approach',
    path: best.path, pathIndex: 1, phaseMs: 0, access: best.access, alerted: false, reportMs: 0};
}

function changePath(state: LookoutState, phase: LookoutPhase, route: LookoutPoint[]) {
  state.phase = phase; state.phaseMs = 0;
  state.path = [pose(state), ...route].filter((p, i, all) => !i || distance(p, all[i - 1]) >= EPS);
  state.pathIndex = 1;
}

function descend(state: LookoutState) {
  if (state.phase === 'done' || state.phase === 'descent') return;
  if (state.phase === 'approach') {changePath(state, 'done', []); return;}
  const traversed = state.phase === 'ascent' ? state.path.slice(0, state.pathIndex) : state.access.route;
  changePath(state, 'descent', [...traversed].reverse());
}

function groundRouteClear(layout: Layout, state: LookoutState) {
  let previous = state.position;
  for (const target of state.path.slice(state.pathIndex)) {
    const count = Math.max(1, Math.ceil(Math.hypot(target.x - previous.x, target.z - previous.z) * 12));
    for (let i = 0; i <= count; i++) if (!isWalkable(layout, {
      x: Math.round(previous.x + (target.x - previous.x) * i / count),
      z: Math.round(previous.z + (target.z - previous.z) * i / count),
    })) return false;
    previous = target;
  }
  return true;
}

/** Pure, JSON-safe authority. Normal x/z navigation must not also advance this
 * route. A blocked stair/exit waits safely, retaining its reservation; callers
 * must reject edits to an occupied tower or its entry until phase is done. */
export function advanceLookout(layout: Layout, state: LookoutState | null | undefined, dtMs: number,
  options: {cancel?: boolean; alert?: boolean} = {}): LookoutState | null {
  if (!validState(state)) return null;
  const next = structuredClone(state);
  let remaining = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  if (state.phase === 'done') return next;
  if (options.cancel) descend(next);
  if (options.alert && !next.alerted && next.phase !== 'done' && next.phase !== 'descent') {
    next.alerted = true; next.reportMs = 0;
  }
  if (next.alerted && next.phase !== 'descent' && next.phase !== 'done') {
    const report = Math.min(remaining, Math.max(0, REPORT_MS - next.reportMs));
    next.reportMs += report; remaining -= report;
    if (next.reportMs < REPORT_MS) return next;
    descend(next);
  }
  const access = matchingAccess(layout, next);
  if (!access) {
    descend(next);
    return next; // Do not walk through a newly obstructed exit or replacement tower.
  }
  if (next.phase === 'approach' && !groundRouteClear(layout, next)) {
    const path = findActorPath(layout, next.position, access.entry);
    if (!path) {changePath(next, 'done', []); return next;}
    changePath(next, 'approach', path.map(p => ({...p, height: 0})));
  }
  while (next.phase !== 'done') {
    if (next.phase === 'settle' || next.phase === 'watching') {
      const duration = next.phase === 'settle' ? SETTLE_MS : WATCH_MS;
      const used = Math.min(remaining, Math.max(0, duration - next.phaseMs));
      next.phaseMs += used; remaining -= used;
      if (next.phaseMs + EPS < duration) break;
      if (next.phase === 'settle') {next.phase = 'watching'; next.phaseMs = 0;}
      else descend(next);
    } else if (next.pathIndex >= next.path.length) {
      if (next.phase === 'approach') changePath(next, 'ascent', access.route);
      else if (next.phase === 'ascent') {next.phase = 'settle'; next.phaseMs = 0;}
      else changePath(next, 'done', []);
    } else {
      const target = next.path[next.pathIndex], length = distance(pose(next), target);
      const used = Math.min(remaining, length / SPEED), fraction = length < EPS ? 1 : Math.min(1, used * SPEED / length);
      next.position.x += (target.x - next.position.x) * fraction;
      next.position.z += (target.z - next.position.z) * fraction;
      next.height += (target.height - next.height) * fraction;
      remaining -= used;
      if (fraction < 1 - EPS) break;
      next.position = point(target); next.height = target.height; next.pathIndex++;
    }
    // Resolve zero-time phase boundaries, but never consume a phase's timer twice.
    if (remaining <= EPS && next.pathIndex < next.path.length) break;
  }
  return next;
}

/** A command, an occupied tower, or an ascent alone never grants sight. */
export function lookoutIsReady(layout: Layout, state: LookoutState | null | undefined): boolean {
  return validState(state) && state.phase === 'watching' && !state.alerted &&
    Math.abs(state.height - HEIGHT) < EPS && same(state.position, state.access.top) && !!matchingAccess(layout, state);
}
