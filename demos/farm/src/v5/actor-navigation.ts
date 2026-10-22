import {findPath, isWalkable, type GridPoint, type Layout} from './layout.ts';

const distance = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** Shortest cardinal route including the actual endpoints, even between cell centres. */
export function findActorPath(layout: Layout, from: GridPoint, to: GridPoint): GridPoint[] | null {
  if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return null;
  const clear = (a: GridPoint, b: GridPoint) => {
    if (Math.abs(a.x - b.x) > 1e-8 && Math.abs(a.z - b.z) > 1e-8) return false;
    const count = Math.max(1, Math.ceil(distance(a, b) * 12));
    for (let i = 0; i <= count; i++) if (!isWalkable(layout, {
      x: Math.round(a.x + (b.x - a.x) * i / count),
      z: Math.round(a.z + (b.z - a.z) * i / count),
    })) return false;
    return true;
  };
  if (clear(from, to)) {
    const route = [{...from}];
    if (distance(from, to) < 1e-8) return route;
    const axis = Math.abs(to.x - from.x) > 1e-8 ? 'x' : 'z', direction = Math.sign(to[axis] - from[axis]);
    // Retain intermediate grid nodes so live routes can detect construction
    // placed between their endpoints after the route was authorized.
    for (let value = direction > 0 ? Math.floor(from[axis]) + 1 : Math.ceil(from[axis]) - 1;
      (to[axis] - value) * direction > 1e-8; value += direction) route.push({...from, [axis]: value});
    route.push({...to});
    return route;
  }
  // Fractional points on an edge can leave through either legal endpoint. The
  // rounded cell alone can be behind a mover and repeatedly erase its progress.
  const endpoints = (p: GridPoint) => [...new Map([
    {x: Math.floor(p.x), z: Math.round(p.z)}, {x: Math.ceil(p.x), z: Math.round(p.z)},
    {x: Math.round(p.x), z: Math.floor(p.z)}, {x: Math.round(p.x), z: Math.ceil(p.z)},
  ].filter(q => clear(p, q)).map(q => [`${q.x},${q.z}`, q])).values()];
  let best: GridPoint[] | null = null, bestLength = Infinity;
  for (const a of endpoints(from)) for (const b of endpoints(to)) {
    const path = findPath(layout, a, b); if (!path) continue;
    const route = [{...from}, ...path, {...to}].filter((q, i, all) => !i || distance(q, all[i - 1]) > 1e-8);
    const length = route.slice(1).reduce((sum, q, i) => sum + distance(route[i], q), 0);
    if (length < bestLength - 1e-8) { best = route; bestLength = length; }
  }
  return best;
}
