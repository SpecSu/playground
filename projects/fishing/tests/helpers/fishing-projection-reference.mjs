// Frozen v0.3.3 projection/depth pairing used to check exact numeric equivalence.
export function projectedSurface(triangles                  , vertical           , minimum         ) {
  const grid = new Map                           (), cell = .045, depth = vertical === 'y' ? 'z' : 'y';
  for (const { a, b, c } of triangles) {
    const den = (b[vertical] - c[vertical]) * (a.x - c.x) + (c.x - b.x) * (a[vertical] - c[vertical]);
    if (Math.abs(den) < 1e-12) continue;
    const tri = { ux: (b[vertical] - c[vertical]) / den, uy: (c.x - b.x) / den, u0: 0,
      vx: (c[vertical] - a[vertical]) / den, vy: (a.x - c.x) / den, v0: 0, a: a[depth], b: b[depth], c: c[depth] };
    tri.u0 = -tri.ux * c.x - tri.uy * c[vertical]; tri.v0 = -tri.vx * c.x - tri.vy * c[vertical];
    const minX = Math.floor(Math.min(a.x, b.x, c.x) / cell), maxX = Math.floor(Math.max(a.x, b.x, c.x) / cell);
    const minY = Math.floor(Math.min(a[vertical], b[vertical], c[vertical]) / cell), maxY = Math.floor(Math.max(a[vertical], b[vertical], c[vertical]) / cell);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = x * 4096 + y; if (!grid.has(key)) grid.set(key, []); grid.get(key) .push(tri);
    }
  }
  return (x        , y        , depthAt         ) => {
    const layers                       = depthAt === undefined ? undefined : [];
    let result = minimum ? Infinity : -Infinity;
    for (const tri of grid.get(Math.floor(x / cell) * 4096 + Math.floor(y / cell)) ?? []) {
      const u = tri.ux * x + tri.uy * y + tri.u0, v = tri.vx * x + tri.vy * y + tri.v0;
      if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) {
        const z = u * tri.a + v * tri.b + (1 - u - v) * tri.c;
        result = minimum ? Math.min(result, z) : Math.max(result, z);
        layers?.push(z);
      }
    }
    if (layers && depthAt !== undefined) {
      const unique = layers.sort((a, b) => a - b).filter((n, i, sorted) => !i || Math.abs(n - sorted[i - 1]) > 1e-5);
      for (let i = 0; i + 1 < unique.length; i += 2) if (depthAt > unique[i] + .001 && depthAt < unique[i + 1] - .001) return unique[i + 1] - depthAt;
      return 0;
    }
    return result;
  };
}
