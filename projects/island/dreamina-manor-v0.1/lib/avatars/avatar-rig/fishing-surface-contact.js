// Adapted from the owner-approved boat source, commit 55de7c92b90d54665d4f4772b793aa5be46e856b.
import * as THREE from 'three';
/** Small, geometry-derived contact sets. The source buffers and skin weights stay untouched. */
export function createFishingSurfaceContact(root, height, palmRadius = Math.min(.18, height * .15)) {
    const meshes = [];
    const body = [], palms = { L: [], R: [] };
    const matrices = new Map();
    const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4(), point = new THREE.Vector3();
    const left = root.getObjectByName('hand_L'), right = root.getObjectByName('hand_R');
    const wrists = { L: root.worldToLocal(left.getWorldPosition(new THREE.Vector3())), R: root.worldToLocal(right.getWorldPosition(new THREE.Vector3())) };
    root.traverse(node => {
        if (!(node instanceof THREE.SkinnedMesh))
            return;
        meshes.push(node);
        matrices.set(node, new THREE.Matrix4());
        const skin = node.geometry.getAttribute('skinIndex'), weight = node.geometry.getAttribute('skinWeight');
        const cells = new Map();
        for (let index = 0; index < skin.count; index++) {
            let bodyWeight = 0, armWeight = 0, l = 0, r = 0;
            for (let c = 0; c < 4; c++) {
                const name = node.skeleton.bones[skin.getComponent(index, c)]?.name ?? '', w = weight.getComponent(index, c);
                if (/^(hips|spine|chest|neck|head)$/.test(name))
                    bodyWeight += w;
                if (/^(upperArm|forearm|hand)_[LR]$/.test(name))
                    armWeight += w;
                if (name === 'hand_L')
                    l += w;
                if (name === 'hand_R')
                    r += w;
            }
            node.getVertexPosition(index, point).applyMatrix4(node.matrixWorld);
            root.worldToLocal(point);
            for (const side of ['L', 'R']) {
                if ((side === 'L' ? l : r) >= .5 && point.distanceTo(wrists[side]) < palmRadius)
                    palms[side].push({ mesh: node, index });
            }
            const tool = (l > .5 && point.distanceTo(wrists.L) >= palmRadius) || (r > .5 && point.distanceTo(wrists.R) >= palmRadius);
            if ((bodyWeight > .65 && armWeight < .2) || tool) {
                const key = `${Math.floor(point.x / .035)},${Math.floor(point.y / .035)}`;
                if (point.z > (cells.get(key)?.z ?? -Infinity))
                    cells.set(key, { vertex: { mesh: node, index }, z: point.z });
            }
        }
        body.push(...[...cells.values()].map(cell => cell.vertex));
    });
    // Retain the skin-space point, rather than treating a wrist joint as a palm.
    const read = (vertex, destination) => {
        return vertex.mesh.getVertexPosition(vertex.index, destination).applyMatrix4(matrices.get(vertex.mesh));
    };
    const rawPalmPoints = { L: palms.L.map(() => new THREE.Vector3()), R: palms.R.map(() => new THREE.Vector3()) };
    const palmPoints = { L: rawPalmPoints.L, R: rawPalmPoints.R };
    const bodyPoints = body.map(() => new THREE.Vector3());
    function update(includePalms = true) {
        inverse.copy(root.matrixWorld).invert();
        for (const mesh of meshes)
            matrices.get(mesh).multiplyMatrices(inverse, mesh.matrixWorld);
        for (let i = 0; i < body.length; i++)
            read(body[i], bodyPoints[i]);
        if (includePalms)
            for (const side of ['L', 'R']) {
                const wrist = root.worldToLocal((side === 'L' ? left : right).getWorldPosition(new THREE.Vector3()));
                for (let i = 0; i < palms[side].length; i++)
                    read(palms[side][i], rawPalmPoints[side][i]);
                palmPoints[side] = rawPalmPoints[side].filter(p => p.distanceToSquared(wrist) < palmRadius * palmRadius);
            }
    }
    function bodyFront(minX, maxX, minY, maxY) {
        let front = -Infinity;
        for (const p of bodyPoints)
            if (p.x >= minX - .04 && p.x <= maxX + .04 && p.y >= minY - .04 && p.y <= maxY + .04)
                front = Math.max(front, p.z);
        return front;
    }
    function exactFront() {
        const triangles = [];
        inverse.copy(root.matrixWorld).invert();
        for (const mesh of meshes) {
            transform.multiplyMatrices(inverse, mesh.matrixWorld);
            const attribute = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
            const points = Array.from({ length: attribute.count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(transform));
            for (let i = 0; i < (index?.count ?? attribute.count); i += 3)
                triangles.push(new THREE.Triangle(...[0, 1, 2].map(j => points[index ? index.getX(i + j) : i + j])));
        }
        return Object.assign(createFishingProjectedSurface(triangles, 'y', false), { intersects: createFishingTriangleIntersectionProbe(triangles) });
    }
    return { update, bodyFront, palmPoints, bodyPoints, exactFront };
}
/** A true triangle projection, indexed by numeric X/Y cells for contact queries. */
export function createFishingProjectedSurface(triangles, vertical, minimum) {
    return drainFishingSteps(createFishingProjectedSurfaceSteps(triangles, vertical, minimum));
}
export function* createFishingProjectedSurfaceSteps(triangles, vertical, minimum) {
    const grid = new Map(), cell = .045, depth = vertical === 'y' ? 'z' : 'y';
    let processed = 0;
    for (const { a, b, c } of triangles) {
        if ((processed++ & 127) === 127)
            yield;
        const den = (b[vertical] - c[vertical]) * (a.x - c.x) + (c.x - b.x) * (a[vertical] - c[vertical]);
        if (Math.abs(den) < 1e-12)
            continue;
        const tri = { ux: (b[vertical] - c[vertical]) / den, uy: (c.x - b.x) / den, u0: 0,
            vx: (c[vertical] - a[vertical]) / den, vy: (a.x - c.x) / den, v0: 0, a: a[depth], b: b[depth], c: c[depth] };
        tri.u0 = -tri.ux * c.x - tri.uy * c[vertical];
        tri.v0 = -tri.vx * c.x - tri.vy * c[vertical];
        const minX = Math.floor(Math.min(a.x, b.x, c.x) / cell), maxX = Math.floor(Math.max(a.x, b.x, c.x) / cell);
        const minY = Math.floor(Math.min(a[vertical], b[vertical], c[vertical]) / cell), maxY = Math.floor(Math.max(a[vertical], b[vertical], c[vertical]) / cell);
        for (let x = minX; x <= maxX; x++)
            for (let y = minY; y <= maxY; y++) {
                const key = x * 4096 + y;
                if (!grid.has(key))
                    grid.set(key, []);
                grid.get(key).push(tri);
            }
    }
    // Calls are synchronous and non-recursive. Reuse one depth buffer instead
    // of creating/sorting/filtering fresh arrays for every fish sample point.
    const layers = [];
    return (x, y, depthAt) => {
        const rows = grid.get(Math.floor(x / cell) * 4096 + Math.floor(y / cell));
        if (!rows)
            return depthAt === undefined ? (minimum ? Infinity : -Infinity) : 0;
        let layerCount = 0;
        let result = minimum ? Infinity : -Infinity;
        for (const tri of rows) {
            const u = tri.ux * x + tri.uy * y + tri.u0, v = tri.vx * x + tri.vy * y + tri.v0;
            if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) {
                const z = u * tri.a + v * tri.b + (1 - u - v) * tri.c;
                result = minimum ? Math.min(result, z) : Math.max(result, z);
                if (depthAt !== undefined)
                    layers[layerCount++] = z;
            }
        }
        if (depthAt !== undefined) {
            layers.length = layerCount;
            layers.sort((a, b) => a - b);
            let previous = 0, start = 0, uniqueCount = 0;
            for (let i = 0; i < layers.length; i++) {
                const value = layers[i], unique = !i || Math.abs(value - previous) > 1e-5;
                previous = value; // Compare adjacent raw depths, exactly like filter.
                if (!unique)
                    continue;
                if (uniqueCount++ % 2 === 0)
                    start = value;
                else if (depthAt > start + .001 && depthAt < value - .001)
                    return value - depthAt;
            }
            return 0;
        }
        return result;
    };
}
/** Actual contact surfaces, retaining the displayed orientation and physical scale. */
export function createFishingCatchSurface(model) {
    model.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const orientation = new THREE.Matrix4().compose(new THREE.Vector3(), model.quaternion, model.scale);
    const matrix = new THREE.Matrix4(), triangles = [], supportTriangles = [], bounds = new THREE.Box3(), samples = [], componentPoints = [];
    model.traverse(node => {
        if (!(node instanceof THREE.Mesh))
            return;
        matrix.multiplyMatrices(orientation, inverse).multiply(node.matrixWorld);
        const attribute = node.geometry.getAttribute('position'), index = node.geometry.index;
        const points = Array.from({ length: attribute.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(matrix));
        if (points.length)
            componentPoints.push(points[0]);
        for (const p of points) {
            bounds.expandByPoint(p);
            samples.push(p);
        }
        for (let i = 0; i < (index?.count ?? attribute.count); i += 3) {
            const triangle = new THREE.Triangle(...[0, 1, 2].map(j => points[index ? index.getX(i + j) : i + j]));
            triangles.push(triangle);
            if (/body|mantle|wing-(?:top|belly)/.test(node.name))
                supportTriangles.push(triangle);
        }
    });
    return drainFishingSteps(createFishingCatchSurfaceSteps({ triangles, supportTriangles, bounds, points: samples, componentPoints }));
}
export function* createFishingCatchSurfaceSteps(data) {
    const { triangles, supportTriangles, bounds, points: samples, componentPoints } = data;
    const support = supportTriangles.length ? supportTriangles : triangles;
    function* build(items) {
        const bounds = new THREE.Box3();
        for (let i = 0; i < items.length; i++) {
            const t = items[i];
            bounds.expandByPoint(t.a);
            bounds.expandByPoint(t.b);
            bounds.expandByPoint(t.c);
            if ((i & 127) === 127)
                yield;
        }
        if (items.length <= 12)
            return { bounds, triangles: items };
        const size = bounds.getSize(new THREE.Vector3()), axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
        items.sort((a, b) => a.a[axis] + a.b[axis] + a.c[axis] - b.a[axis] - b.b[axis] - b.c[axis]);
        const middle = Math.floor(items.length / 2);
        return { bounds, left: yield* build(items.slice(0, middle)), right: yield* build(items.slice(middle)) };
    }
    ;
    const tree = yield* build([...support]), nearest = new THREE.Vector3();
    function supportDistance(point) {
        let squared = Infinity;
        const boxDistance = (box) => {
            const x = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
            const y = Math.max(box.min.y - point.y, 0, point.y - box.max.y);
            const z = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
            return x * x + y * y + z * z;
        };
        const visit = (node) => {
            if (boxDistance(node.bounds) >= squared)
                return;
            if (node.triangles) {
                for (const triangle of node.triangles) {
                    triangle.closestPointToPoint(point, nearest);
                    squared = Math.min(squared, point.distanceToSquared(nearest));
                }
            }
            else {
                const first = boxDistance(node.left.bounds) < boxDistance(node.right.bounds) ? node.left : node.right;
                visit(first);
                visit(first === node.left ? node.right : node.left);
            }
        };
        visit(tree);
        return Math.sqrt(squared);
    }
    const supportBounds = new THREE.Box3();
    for (let i = 0; i < support.length; i++) {
        const t = support[i];
        supportBounds.expandByPoint(t.a);
        supportBounds.expandByPoint(t.b);
        supportBounds.expandByPoint(t.c);
        if ((i & 127) === 127)
            yield;
    }
    return { bounds, supportBounds, triangles, points: samples, componentPoints, supportDistance, bottomAt: yield* createFishingProjectedSurfaceSteps(triangles, 'z', true), backAt: yield* createFishingProjectedSurfaceSteps(triangles, 'y', true), frontAt: yield* createFishingProjectedSurfaceSteps(triangles, 'y', false),
        supportBackAt: yield* createFishingProjectedSurfaceSteps(support, 'y', true), supportBottomAt: yield* createFishingProjectedSurfaceSteps(support, 'z', true) };
}
/** Bidirectional edge/triangle checks catch large wings spanning a body even
 * when all three fish vertices lie outside it. Used only for cached catch layout. */
export function createFishingTriangleIntersectionProbe(obstacles) {
    return drainFishingSteps(createFishingTriangleIntersectionProbeSteps(obstacles));
}
export function* createFishingTriangleIntersectionProbeSteps(obstacles) {
    const cell = .08, grid = new Map();
    const boxes = [], whole = new THREE.Box3();
    for (let i = 0; i < obstacles.length; i++) {
        const t = obstacles[i], bounds = new THREE.Box3().setFromPoints([t.a, t.b, t.c]);
        boxes.push(bounds);
        whole.union(bounds);
        if ((i & 127) === 127)
            yield;
    }
    if (!obstacles.length)
        return Object.assign(() => false, { steps: function* () { return false; } });
    // Every query is clipped to `whole`, so the integer coordinates lie inside
    // these exact finite dimensions. Unlike a fixed stride this cannot alias
    // negative coordinates or catches extending beyond the character grid.
    const originX = Math.floor(whole.min.x / cell), originY = Math.floor(whole.min.y / cell), originZ = Math.floor(whole.min.z / cell);
    const countY = Math.floor(whole.max.y / cell) - originY + 1, countZ = Math.floor(whole.max.z / cell) - originZ + 1;
    const countX = Math.floor(whole.max.x / cell) - originX + 1;
    const numericKeys = Number.isSafeInteger(countX * countY * countZ);
    // Normal avatar bounds use compact numbers. Pathological distant geometry
    // keeps exact string keys rather than losing integer precision.
    const keyAt = (x, y, z) => numericKeys
        ? ((x - originX) * countY + y - originY) * countZ + z - originZ : `${x},${y},${z}`;
    const seen = new Uint32Array(obstacles.length);
    let stamp = 0;
    for (let i = 0; i < obstacles.length; i++) {
        if ((i & 127) === 127)
            yield;
        const { min, max } = boxes[i];
        for (let x = Math.floor(min.x / cell); x <= Math.floor(max.x / cell); x++)
            for (let y = Math.floor(min.y / cell); y <= Math.floor(max.y / cell); y++)
                for (let z = Math.floor(min.z / cell); z <= Math.floor(max.z / cell); z++) {
                    const key = keyAt(x, y, z);
                    if (!grid.has(key))
                        grid.set(key, []);
                    grid.get(key).push(i);
                }
    }
    function* querySteps(subjects, offset) {
        let work = 0;
        const shifted = new THREE.Triangle(), box = new THREE.Box3(), ray = new THREE.Ray(), hit = new THREE.Vector3(), direction = new THREE.Vector3();
        const edgeCrosses = (a, b) => {
            for (let edge = 0; edge < 3; edge++) {
                const start = edge === 0 ? a.a : edge === 1 ? a.b : a.c, end = edge === 0 ? a.b : edge === 1 ? a.c : a.a;
                ray.origin.copy(start);
                direction.subVectors(end, start);
                const length = direction.length();
                if (length < 1e-6)
                    continue;
                ray.direction.copy(direction).multiplyScalar(1 / length);
                if (ray.intersectTriangle(b.a, b.b, b.c, false, hit)) {
                    const distance = hit.distanceTo(ray.origin);
                    if (distance > 1e-5 && distance < length - 1e-5)
                        return true;
                }
            }
            return false;
        };
        for (const triangle of subjects) {
            if ((work++ & 63) === 63)
                yield;
            shifted.a.copy(triangle.a).add(offset);
            shifted.b.copy(triangle.b).add(offset);
            shifted.c.copy(triangle.c).add(offset);
            box.min.copy(shifted.a).min(shifted.b).min(shifted.c);
            box.max.copy(shifted.a).max(shifted.b).max(shifted.c);
            if (!box.intersectsBox(whole))
                continue;
            box.intersect(whole);
            stamp = (stamp + 1) >>> 0;
            if (!stamp) {
                seen.fill(0);
                stamp = 1;
            }
            const triangleStamp = stamp;
            for (let x = Math.floor(box.min.x / cell); x <= Math.floor(box.max.x / cell); x++)
                for (let y = Math.floor(box.min.y / cell); y <= Math.floor(box.max.y / cell); y++)
                    for (let z = Math.floor(box.min.z / cell); z <= Math.floor(box.max.z / cell); z++) {
                        if ((work++ & 63) === 63)
                            yield;
                        for (const index of grid.get(keyAt(x, y, z)) ?? []) {
                            if ((work++ & 63) === 63)
                                yield;
                            if (seen[index] === triangleStamp)
                                continue;
                            seen[index] = triangleStamp;
                            // Same first-seen candidate order as Set insertion; evaluating
                            // immediately avoids allocating and filling the entire Set.
                            if (box.intersectsBox(boxes[index]) && (edgeCrosses(shifted, obstacles[index]) || edgeCrosses(obstacles[index], shifted)))
                                return true;
                        }
                    }
        }
        return false;
    }
    return Object.assign((subjects, offset) => drainFishingSteps(querySteps(subjects, offset)), { steps: querySteps });
}
export function drainFishingSteps(steps) {
    let result = steps.next();
    while (!result.done)
        result = steps.next();
    return result.value;
}
