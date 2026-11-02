import * as THREE from 'three';

const armName = /^(upperArm|forearm|hand)_[LR]$/;
const bodyName = /^(hips|spine|chest|head)$/;
const subjectName = /^(forearm|hand)_[LR]$/;
/**
 * An offline conservative self-penetration probe, based on actual skinned vertices.
 * It does not use wrist points, bounding boxes, or exclude distal limb geometry.
 * Body triangles require >= 65% torso/head weight and <= 20% arm weight at each
 * corner. Every vertex with >= 50% combined forearm/hand influence is sampled.
 * A subject is internal only when two retained body surfaces bracket it in Z.
 * Palm front gaps additionally use outward +Z-facing triangles, even at open
 * seams; an unbracketed negative gap alone is NOT a proven penetration.
 * Reported depth is Z-axis depth, not Euclidean signed distance. Missing triangles
 * at skin seams can create false negatives; this is not a collision proof.
 */
export function createFishingMeshClearanceProbe(root, { cellSize = .025, threshold = .01 } = {}) {
  const meshes = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry, skin = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    if (!skin || !weights) return;
    const body = new Float32Array(skin.count), arms = new Float32Array(skin.count), subjects = [];
    for (let i = 0; i < skin.count; i++) {
      let distal = 0, largest = -1, label = '';
      for (let c = 0; c < 4; c++) {
        const weight = weights.getComponent(i, c), name = mesh.skeleton.bones[skin.getComponent(i, c)]?.name ?? '';
        if (bodyName.test(name)) body[i] += weight;
        if (armName.test(name)) arms[i] += weight;
        if (subjectName.test(name)) { distal += weight; if (weight > largest) { largest = weight; label = name; } }
      }
      if (distal >= .5) subjects.push({ index: i, label });
    }
    const indices = geometry.index, triangles = [];
    for (let i = 0; i < (indices?.count ?? skin.count); i += 3) {
      const ids = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
      if (ids.every(id => body[id] >= .65 && arms[id] <= .2)) triangles.push(ids);
    }
    meshes.push({ mesh, triangles, subjects, positions: Array.from({ length: skin.count }, () => new THREE.Vector3()) });
  });
  const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4();
  return function measure() {
    root.updateWorldMatrix(true, true); inverse.copy(root.matrixWorld).invert();
    const grid = new Map(), subjectPoints = [];
    const key = (x, y) => `${x},${y}`;
    for (const item of meshes) {
      const { mesh, positions, subjects, triangles } = item;
      mesh.skeleton.update(); transform.multiplyMatrices(inverse, mesh.matrixWorld);
      for (let i = 0; i < positions.length; i++) mesh.getVertexPosition(i, positions[i]).applyMatrix4(transform);
      for (const subject of subjects) subjectPoints.push({ point: positions[subject.index], label: subject.label, vertex: subject.index, mesh: mesh.name });
      for (const ids of triangles) {
        const [a, b, c] = ids.map(i => positions[i]);
        const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(den) < 1e-12) continue;
        const triangle = { a, b, c, den };
        const minX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize), maxX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
        const minY = Math.floor(Math.min(a.y, b.y, c.y) / cellSize), maxY = Math.floor(Math.max(a.y, b.y, c.y) / cellSize);
        for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
          const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(triangle);
        }
      }
    }
    const result = { testedVertices: subjectPoints.length, retainedBodyTriangles: meshes.reduce((sum, item) => sum + item.triangles.length, 0), penetratingVertices: 0, maxDepth: 0, worst: null, limbs: {}, palms: {}, projectedVertices: 0, closedBodyRays: 0, openBodyRays: 0 };
    for (const { point, label, vertex, mesh } of subjectPoints) {
      const intersections = [], frontIntersections = [];
      for (const { a, b, c, den } of grid.get(key(Math.floor(point.x / cellSize), Math.floor(point.y / cellSize))) ?? []) {
        const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / den;
        const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / den;
        const w = 1 - u - v;
        if (u >= -1e-8 && v >= -1e-8 && w >= -1e-8) { const z = u * a.z + v * b.z + w * c.z; intersections.push(z); if (den > 0) frontIntersections.push(z); }
      }
      intersections.sort((a, b) => a - b);
      const distinct = intersections.filter((z, i) => !i || z - intersections[i - 1] > 1e-5);
      if (distinct.length) result.projectedVertices++;
      const bracketed = distinct.length >= 2 && distinct.length % 2 === 0;
      if (label.startsWith('hand_') && frontIntersections.length) {
        const palm = result.palms[label] ??= { sampledOverFrontSurface: 0, bodyBracketedSamples: 0, minFrontGap: Infinity, worstRearPoint: null };
        const front = Math.max(...frontIntersections), gap = point.z - front;
        palm.sampledOverFrontSurface++; if (bracketed) palm.bodyBracketedSamples++;
        if (gap < palm.minFrontGap) { palm.minFrontGap = gap; palm.worstRearPoint = { vertex, point: point.toArray(), bodyFrontZ: front, bracketed }; }
      }
      // Odd counts can be openings at shoulder skin seams. Do not guess closure.
      if (!bracketed) { if (distinct.length) result.openBodyRays++; continue; }
      result.closedBodyRays++;
      let depth = 0;
      for (let i = 0; i < distinct.length; i += 2) if (point.z > distinct[i] && point.z < distinct[i + 1]) depth = Math.max(depth, Math.min(point.z - distinct[i], distinct[i + 1] - point.z));
      const limb = result.limbs[label] ??= { penetratingVertices: 0, maxDepth: 0 };
      if (depth > threshold) { result.penetratingVertices++; limb.penetratingVertices++; }
      limb.maxDepth = Math.max(limb.maxDepth, depth);
      if (depth > result.maxDepth) { result.maxDepth = depth; result.worst = { label, vertex, mesh, point: point.toArray(), intersections: distinct }; }
    }
    return result;
  };
}
