import * as THREE from 'three';
import { fishingPalmRegionIndices } from '../../lib/fishing-avatar-contact-regions.ts';
/** True fish vertices vs skinned triangles; hand gaps use fish triangles, not boxes. */
export function measureCatchContact(avatar, fish, anchor, {handRadius} = {}) {
const handPoints = { L: [], R: [] }, grid = new Map();
const density = 100, gridKey = (x, y) => `${Math.floor(x * density)},${Math.floor(y * density)}`;
avatar.root.traverse(mesh => {
  if (!mesh.isSkinnedMesh) return;
  mesh.skeleton.update();
  const geom = mesh.geometry, indices = geom.index;
  const skinIndices = geom.getAttribute('skinIndex'), weights = geom.getAttribute('skinWeight');
  const points = Array.from({ length: skinIndices.count }, (_, index) => avatar.root.worldToLocal(mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
  const handWeights = [];
  const verifiedPalms = { L: fishingPalmRegionIndices(mesh, 'L'), R: fishingPalmRegionIndices(mesh, 'R') };
  const verifiedSets = { L: verifiedPalms.L && new Set(verifiedPalms.L), R: verifiedPalms.R && new Set(verifiedPalms.R) };
  for (let vertex = 0; vertex < skinIndices.count; vertex++) {
    let total = 0;
    for (const side of ['L', 'R']) {
      let weight = 0;
      for (let channel = 0; channel < 4; channel++) if (mesh.skeleton.bones[skinIndices.getComponent(vertex, channel)]?.name === `hand_${side}`) weight += weights.getComponent(vertex, channel);
      total += weight;
      const wrist = avatar.root.worldToLocal(avatar.root.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3()));
      if (verifiedSets[side] ? verifiedSets[side].has(vertex) : weight >= .5 && (handRadius === undefined || points[vertex].distanceTo(wrist) < handRadius)) handPoints[side].push(points[vertex]);
    }
    handWeights.push(total);
  }
  for (let offset = 0; offset < indices.count; offset += 3) {
    const vertexIds = [0, 1, 2].map(n => indices.getX(offset + n));
    const [p, q, r] = vertexIds.map(index => points[index]);
    const den = (q.y - r.y) * (p.x - r.x) + (r.x - q.x) * (p.y - r.y);
    if (Math.abs(den) < 1e-12) continue;
    const triangle = { p, q, r, den, handOrTool: vertexIds.reduce((sum, index) => sum + handWeights[index], 0) / 3 > .5 };
    for (let x = Math.floor(Math.min(p.x, q.x, r.x) * density); x <= Math.floor(Math.max(p.x, q.x, r.x) * density); x++) {
      for (let y = Math.floor(Math.min(p.y, q.y, r.y) * density); y <= Math.floor(Math.max(p.y, q.y, r.y) * density); y++) {
        const key = `${x},${y}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(triangle);
      }
    }
  }
});

fish.updateMatrixWorld(true);
const fishPoints = [], fishTriangles = [], supportTriangles = [];
fish.traverse(mesh => {
  if (!mesh.isMesh) return;
  const geom = mesh.geometry, position = geom.getAttribute('position'), indices = geom.index;
  const points = Array.from({ length: position.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
  fishPoints.push(...points);
  for (let offset = 0; offset < (indices?.count ?? position.count); offset += 3) { const triangle=new THREE.Triangle(...[0, 1, 2].map(n => points[indices ? indices.getX(offset + n) : offset + n]));fishTriangles.push(triangle);if(/body|mantle|wing-(?:top|belly)/.test(mesh.name))supportTriangles.push(triangle); }
});
  let insideVertices = 0, insideBodyVertices = 0, maxPenetration = 0;
  for (const localPoint of fishPoints) {
    const point = localPoint.clone().add(anchor), intersections = [];
    for (const tri of grid.get(gridKey(point.x, point.y)) ?? []) {
      const { p, q, r, den } = tri;
      const a = ((q.y - r.y) * (point.x - r.x) + (r.x - q.x) * (point.y - r.y)) / den;
      const b = ((r.y - p.y) * (point.x - r.x) + (p.x - r.x) * (point.y - r.y)) / den;
      const c = 1 - a - b;
      if (a >= 0 && b >= 0 && c >= 0) intersections.push({ z: a * p.z + b * q.z + c * r.z, handOrTool: tri.handOrTool });
    }
    intersections.sort((a, b) => a.z - b.z);
    const unique = intersections.filter((hit, index) => !index || hit.z - intersections[index - 1].z > 1e-6);
    const ahead = unique.filter(hit => hit.z > point.z);
    if (ahead.length % 2) {
      insideVertices++;
      if (!ahead[0].handOrTool) insideBodyVertices++;
      maxPenetration = Math.max(maxPenetration, ahead[0].z - point.z);
    }
  }
  const handSurfaceGaps = {}, handSupportGaps = {}, localPoint = new THREE.Vector3(), closest = new THREE.Vector3();
  for (const [side, points] of Object.entries(handPoints)) {
    let minSquared = Infinity, supportSquared=Infinity;
    for (const point of points) {
      localPoint.copy(point).sub(anchor);
      for (const triangle of fishTriangles) {
        triangle.closestPointToPoint(localPoint, closest);
        minSquared = Math.min(minSquared, closest.distanceToSquared(localPoint));
      }
    }
    for (const point of points) {
      localPoint.copy(point).sub(anchor);
      for (const triangle of supportTriangles.length?supportTriangles:fishTriangles) {
        triangle.closestPointToPoint(localPoint,closest);supportSquared=Math.min(supportSquared,closest.distanceToSquared(localPoint));
      }
    }
    handSurfaceGaps[side] = Math.sqrt(minSquared);handSupportGaps[side]=Math.sqrt(supportSquared);
  }
return { insideVertices, insideBodyVertices, maxPenetration, handSurfaceGaps, handSupportGaps };
}
