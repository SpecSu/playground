import * as THREE from 'three';
import { expandFishingMeshSnapshot, type FishingMeshSnapshot } from './fishing-catch-snapshot.ts';
import { createFishingCatchSurfaceSteps, createFishingProjectedSurfaceSteps, createFishingTriangleIntersectionProbeSteps, type FishingIntersectionQuery } from './fishing-surface-contact.ts';

export type FishingCatchSolveInput = {
  avatar: FishingMeshSnapshot; fish: FishingMeshSnapshot;
  palms: { L: number[][]; R: number[][] }; bodyPoints: number[][];
  size: number[]; lowForelimbs: boolean; texturedSwordDog: boolean; approachDirection: number[];
};
export type FishingCatchSolveResult = { position: number[]; approachDirection: number[]; tested: number; total: number };
async function nextTask(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Catch preparation cancelled.', 'AbortError');
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  if (signal?.aborted) throw new DOMException('Catch preparation cancelled.', 'AbortError');
}
/** Each resume is bounded by small geometry/query chunks; check cancellation between chunks. */
export async function runFishingCatchSolve(input: FishingCatchSolveInput, signal?: AbortSignal): Promise<FishingCatchSolveResult> {
  await nextTask(signal);
  const steps = solveFishingCatchSteps(input);
  try {
    for (;;) {
      const until = performance.now() + 4;
      do {
        if (signal?.aborted) throw new DOMException('Catch preparation cancelled.', 'AbortError');
        const result = steps.next(); if (result.done) return result.value;
      } while (performance.now() < until);
      await nextTask(signal);
    }
  } finally { steps.return(undefined as never); }
}
function* buildFront(triangles: THREE.Triangle[]) {
  const front = yield* createFishingProjectedSurfaceSteps(triangles, 'y', false);
  const intersects = yield* createFishingTriangleIntersectionProbeSteps(triangles);
  return Object.assign(front, { intersects });
}
function* intersectsInChunks(query: FishingIntersectionQuery, triangles: THREE.Triangle[], offset: THREE.Vector3): Generator<void, boolean> {
  return yield* query.steps(triangles, offset);
}
/** Same ordered exact geometry search as v0.3.4, resumable without changing the result. */
export function* solveFishingCatchSteps(input: FishingCatchSolveInput): Generator<void, FishingCatchSolveResult> {
  const avatarGeometry = yield* expandFishingMeshSnapshot(input.avatar);
  const catchSurface = yield* createFishingCatchSurfaceSteps(yield* expandFishingMeshSnapshot(input.fish));
  const palms = { L: input.palms.L.map(p => new THREE.Vector3().fromArray(p)), R: input.palms.R.map(p => new THREE.Vector3().fromArray(p)) };
  const surfaces = { bodyPoints: input.bodyPoints.map(p => new THREE.Vector3().fromArray(p)) };
  const size = new THREE.Vector3().fromArray(input.size), destination = new THREE.Vector3();
  const { lowForelimbs, texturedSwordDog } = input;
  const catchApproachDirection = new THREE.Vector3().fromArray(input.approachDirection);
  const points = [...palms.L, ...palms.R];
      const box = new THREE.Box3().setFromPoints(points), center = box.getCenter(new THREE.Vector3());
      const supportCenter = catchSurface?.supportBounds.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
      const palmCenters = [palms.L, palms.R].map(ps => new THREE.Box3().setFromPoints(ps).getCenter(new THREE.Vector3()));
      const middleX = (palmCenters[0].x + palmCenters[1].x) * .5 - supportCenter.x;
      const back = catchSurface?.backAt ?? ((x: number, y: number) => {
        const norm = (x / Math.max(.001, size.x * .5)) ** 2 + (y / Math.max(.001, size.y * .5)) ** 2;
        return norm < 1 ? -size.z * .5 * Math.sqrt(1 - norm) : Infinity;
      });
      const supportBack = catchSurface?.supportBackAt ?? back;
      const floor = lowForelimbs && catchSurface ? .003 - catchSurface.bounds.min.y : size.y * .5 + .025;
      let best = Infinity, bestContactGap = Infinity, testedCandidates = 0;
      const candidates: { x: number; y: number; z: number; contact: number; penalty: number; score: number }[] = [];
      for (const lateral of [0, -.05, .05, -.1, .1, -.15, .15, -.2, .2, -.25, .25, -.3, .3, -.4, .4, -.5, .5, -.6, .6, -.7, .7]) for (let step = 0; step <= 24; step++) {
        yield;
        const x = middleX + lateral * Math.min(size.x, size.y > 2 ? .6 : .2);
        const y = Math.max(floor, center.y + size.y * (step / 24 - .5));
        let contact = -Infinity;
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          if ((pointIndex & 63) === 63) yield;
          const p = points[pointIndex];
          const surface = supportBack(p.x - x, p.y - y);
          if (Number.isFinite(surface)) contact = Math.max(contact, p.z - surface + .004);
        }
        if (!Number.isFinite(contact)) continue;
        let z = contact;
        for (let bodyIndex = 0; bodyIndex < surfaces.bodyPoints.length; bodyIndex++) {
          if ((bodyIndex & 63) === 63) yield;
          const p = surfaces.bodyPoints[bodyIndex];
          const backZ = back(p.x - x, p.y - y), frontZ = catchSurface?.frontAt(p.x - x, p.y - y) ?? -backZ;
          if (p.z > z + backZ - .008 && p.z < z + frontZ + .008) z = Math.max(z, p.z - backZ + .006);
        }
        const gap = z - contact;
        const penalty = Math.abs(y - (center.y + size.y * .2)) * .1 + Math.abs(lateral) * .1;
        const contacts: number[] = [];
        for (const ps of [palms.L, palms.R]) {
          let value = -Infinity;
          for (let i = 0; i < ps.length; i++) { if ((i & 63) === 63) yield; const p = ps[i], surface = supportBack(p.x-x,p.y-y); if (Number.isFinite(surface)) value = Math.max(value,p.z-surface+.004); }
          contacts.push(value);
        }
        const balance = Number.isFinite(contacts[0]) && Number.isFinite(contacts[1]) ? Math.abs(contacts[0]-contacts[1]) : 1;
        const score = gap * 10 + balance * 10 + penalty;
        candidates.push({ x, y, z, contact, penalty, score });
        if (score < best) { best = score; destination.set(x, y, z); }
      }
      if (catchSurface) {
        // A flat palm can also support the actual underside. This matters for
        // tiny catches and armed hands, whose frontmost vertex is not a shelf.
        for (const lateral of [0, -.05, .05, -.1, .1, -.15, .15, -.2, .2, -.25, .25, -.3, .3]) for (const forward of [0, .025, .05, .08, .12, .18, .25, .4, .65]) {
          yield;
        const x = middleX + lateral * Math.min(size.x, size.y > 2 ? .6 : .2), originalZ = center.z + forward;
          let y = -Infinity;
          for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          if ((pointIndex & 63) === 63) yield;
          const p = points[pointIndex];
            const bottom = catchSurface.supportBottomAt(p.x - x, p.z - originalZ);
            if (Number.isFinite(bottom)) y = Math.max(y, p.y - bottom + .006);
          }
          if (!Number.isFinite(y)) continue;
          y = Math.max(floor, y);
          let z = originalZ;
          for (let bodyIndex = 0; bodyIndex < surfaces.bodyPoints.length; bodyIndex++) {
          if ((bodyIndex & 63) === 63) yield;
          const p = surfaces.bodyPoints[bodyIndex];
            const surface = back(p.x - x, p.y - y), frontZ = catchSurface.frontAt(p.x - x, p.y - y);
            if (p.z > z + surface - .008 && p.z < z + frontZ + .008) z = Math.max(z, p.z - surface + .006);
          }
          const penalty = Math.abs(y - (center.y + size.y * .2)) * .1 + Math.abs(lateral) * .1;
          candidates.push({ x, y, z, contact: originalZ, penalty, score: (z - originalZ) * 10 + penalty });
        }
        const front = yield* buildFront(avatarGeometry.triangles);
        best = Infinity;
        for (const candidate of candidates.sort((a, b) => a.score - b.score)) {
          yield;
          // Upright tall fish can invalidate the early coarse candidates. Only
          // extend the bounded list if the first 100 have no bilateral support.
          if (testedCandidates >= 100 && bestContactGap <= .04) break;
          testedCandidates++;
          const offset = new THREE.Vector3(candidate.x, candidate.y, candidate.z);
          for (let pass = 0; pass < 3; pass++) {
            yield;
            let push = 0;
            for (let i = 0; i < catchSurface.points.length; i += texturedSwordDog && size.z > 2 ? 1 : 4) {
              if (i % 128 === 0) yield;
              const p = catchSurface.points[i]; push = Math.max(push, front(p.x + offset.x, p.y + offset.y, p.z + offset.z));
            }
            if (push <= 0) break; offset.z += push + .003;
          }
          if ((yield* intersectsInChunks(front.intersects, catchSurface.triangles, offset))) continue;
          // Once no surfaces cross, a point per connected procedural mesh also
          // rejects containment; the triangle test remains full-resolution.
          if (catchSurface.componentPoints.some(p => front(p.x + offset.x, p.y + offset.y, p.z + offset.z) > 0)) continue;
          const relative = new THREE.Vector3();
          const gaps: number[] = [];
          for (const side of ['L','R'] as const) {
            let gap = Infinity;
            for (let i=0;i<palms[side].length;i+=8) { if (i % 128 === 0) yield; gap = Math.min(gap, catchSurface!.supportDistance(relative.copy(palms[side][i]).sub(offset))); }
            gaps.push(gap);
          }
          const gap = Math.max(...gaps);
          const score = gap * 10 + candidate.penalty;
          if (score >= best) continue;
          best = score; bestContactGap = gap; destination.copy(offset);
          // The ordered search stops at an actual supported, non-intersecting
          // main-body contact. It need not minimize a sub-millimetre gap.
          if (gap < .025) break;
        }
        // Refine only a near miss in the coarse grid. Both palms drive this
        // bounded translation search; a fin or a single hand cannot satisfy it.
        if (Number.isFinite(best) && bestContactGap > .025) {
          const surface = catchSurface, relative = new THREE.Vector3();
          for (const step of [.025, .0125]) {
            const origin = destination.clone(), refinements: { offset: THREE.Vector3; gap: number }[] = [];
            for (const x of [-step, 0, step]) for (const y of [-step, 0, step]) for (const z of [-step, 0, step]) {
              yield;
              const offset = origin.clone().add(new THREE.Vector3(x, y, z));
              if (offset.y < floor) continue;
              const gaps: number[] = [];
              for (const side of ['L', 'R'] as const) {
                let gap = Infinity;
                for (let i = 0; i < palms[side].length; i += 8) { if (i % 128 === 0) yield; gap = Math.min(gap, surface.supportDistance(relative.copy(palms[side][i]).sub(offset))); }
                gaps.push(gap);
              }
              const gap = Math.max(...gaps);
              if (gap < bestContactGap) refinements.push({ offset, gap });
            }
            for (const candidate of refinements.sort((a, b) => a.gap - b.gap)) {
              if ((yield* intersectsInChunks(front.intersects, surface.triangles, candidate.offset))) continue;
              if (surface.componentPoints.some(p => front(p.x + candidate.offset.x, p.y + candidate.offset.y, p.z + candidate.offset.z) > 0)) continue;
              destination.copy(candidate.offset); bestContactGap = candidate.gap; break;
            }
            if (bestContactGap < .025) break;
          }
        }
        if (Number.isFinite(best)) {
          // Fins, tails and wings can miss the body at rest yet sweep a palm on
          // their way in. Choose the final approach against this actual posed
          // mesh, rather than assigning exceptions to individual characters.
          const directions = [catchApproachDirection.clone(), new THREE.Vector3(0, 1, 1).normalize(),
            new THREE.Vector3(-1, 1, 1).normalize(), new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0)];
          const offset = new THREE.Vector3();
          for (const candidate of directions) {
            const distance = Math.max(.8, (Math.abs(candidate.x) * size.x + Math.abs(candidate.z) * size.z) * .75);
            let clear = true;
            for (let step = 1; step <= 40; step++) {
              offset.copy(destination).addScaledVector(candidate, distance * (step / 40) ** 2);
              if ((yield* intersectsInChunks(front.intersects, catchSurface.triangles, offset))) { clear = false; break; }
            }
            if (clear) { catchApproachDirection.copy(candidate); break; }
          }
        }
      }

  if (!Number.isFinite(best)) destination.set(center.x, box.max.y + size.y * .5 + .004, box.max.z + size.z * .5 + .004);
  return { position: destination.toArray(), approachDirection: catchApproachDirection.toArray(), tested: testedCandidates, total: candidates.length };
}
