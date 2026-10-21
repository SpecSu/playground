// Frozen v0.3.3 reference: exact boolean/edge tolerances before allocation-only optimization.
import * as THREE from 'three';
export function triangleIntersectionProbe(obstacles                  ) {
  const cell = .08, grid = new Map                  ();
  const boxes = obstacles.map(t => new THREE.Box3().setFromPoints([t.a, t.b, t.c]));
  const whole = new THREE.Box3(); for (const bounds of boxes) whole.union(bounds);
  for (let i = 0; i < obstacles.length; i++) {
    const { min, max } = boxes[i];
    for (let x = Math.floor(min.x / cell); x <= Math.floor(max.x / cell); x++)
      for (let y = Math.floor(min.y / cell); y <= Math.floor(max.y / cell); y++)
        for (let z = Math.floor(min.z / cell); z <= Math.floor(max.z / cell); z++) {
          const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key) .push(i);
        }
  }
  const shifted = new THREE.Triangle(), box = new THREE.Box3(), ray = new THREE.Ray(), hit = new THREE.Vector3(), direction = new THREE.Vector3();
  const edgeCrosses = (a                , b                ) => {
    const corners = [a.a, a.b, a.c];
    for (let edge = 0; edge < 3; edge++) {
      ray.origin.copy(corners[edge]); direction.subVectors(corners[(edge + 1) % 3], corners[edge]);
      const length = direction.length(); if (length < 1e-6) continue;
      ray.direction.copy(direction).multiplyScalar(1 / length);
      if (ray.intersectTriangle(b.a, b.b, b.c, false, hit)) {
        const distance = hit.distanceTo(ray.origin);
        if (distance > 1e-5 && distance < length - 1e-5) return true;
      }
    }
    return false;
  };
  return (subjects                  , offset               ) => {
    for (const triangle of subjects) {
      shifted.a.copy(triangle.a).add(offset); shifted.b.copy(triangle.b).add(offset); shifted.c.copy(triangle.c).add(offset);
      box.setFromPoints([shifted.a, shifted.b, shifted.c]);
      if (!box.intersectsBox(whole)) continue;
      box.intersect(whole); const candidates = new Set        ();
      for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
        for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
          for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++)
            for (const index of grid.get(`${x},${y},${z}`) ?? []) candidates.add(index);
      for (const index of candidates) if (box.intersectsBox(boxes[index]) && (edgeCrosses(shifted, obstacles[index]) || edgeCrosses(obstacles[index], shifted))) return true;
    }
    return false;
  };
}
