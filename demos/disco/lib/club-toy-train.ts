import * as THREE from 'three';
import { createDisposalScope } from './club-scene-math.ts';
import { TRAIN_DECK_HEIGHT, TRAIN_SLOT_ORDER, trainRingPlacement, trainLocomotivePlacement } from './club-train-motion.ts';

export interface ToyTrainFrame {
  readonly distance: number;
  readonly formation?: number;
  readonly emergence: number;
  readonly seconds: number;
}
export interface ToyTrainPassenger { readonly slot: number; readonly preset: string; readonly desiredVisible?: boolean }

const WHEEL_RADIUS = .25;
const HIDDEN_Y = -2.4;

/** Scene-owned toy vehicles. +Z is forward; placement and wheel roll both use
 * absolute shared distance, so joining late or replaying never accumulates drift.
 */
export function createToyTrain(scene: THREE.Scene) {
  const scope = createDisposalScope();
  const root = new THREE.Group();
  root.name = 'shared-toy-train';
  root.visible = false;
  root.position.y = HIDDEN_Y;
  root.userData.floorPickThrough = true;
  scene.add(root);
  let disposed = false;

  const box = scope.track(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = scope.track(new THREE.CylinderGeometry(1, 1, 1, 16));
  const sphere = scope.track(new THREE.IcosahedronGeometry(1, 1));
  const candy = [0xff5eaa, 0x43e8d5, 0x8b7bff, 0xffbb46, 0x55b8ff].map(color => scope.track(new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: .17, roughness: .32, metalness: .15,
  })));
  const gold = scope.track(new THREE.MeshStandardMaterial({ color: 0xffd777, emissive: 0xffb737, emissiveIntensity: .2, roughness: .3, metalness: .65 }));
  const dark = scope.track(new THREE.MeshStandardMaterial({ color: 0x29223f, emissive: 0x1b1430, emissiveIntensity: .15, roughness: .7, metalness: .15 }));
  const lamp = scope.track(new THREE.MeshBasicMaterial({ color: 0xfff2bc, toneMapped: false }));
  const steamMaterial = scope.track(new THREE.MeshBasicMaterial({ color: 0xc3fcff, transparent: true, opacity: .48, depthWrite: false, toneMapped: false }));

  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string,
    x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.set(x, y, z);
    part.scale.set(sx, sy, sz);
    part.userData.floorPickThrough = true;
    parent.add(part);
    return part;
  };

  const wheels: THREE.Group[] = [];
  function chassis(vehicle: THREE.Group, width: number, length: number, paint: THREE.Material) {
    mesh(vehicle, box, dark, 'train-undercarriage', 0, TRAIN_DECK_HEIGHT - .2, 0, width * .86, .2, length * .88);
    const deck = mesh(vehicle, box, paint, 'train-deck', 0, TRAIN_DECK_HEIGHT - .07, 0, width, .14, length);
    for (let index = 0; index < 4; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const wheel = new THREE.Group();
      wheel.name = `train-wheel:${index}`;
      wheel.position.set(side * (width / 2 + .035), WHEEL_RADIUS + .035, (index < 2 ? -1 : 1) * length * .31);
      const tire = mesh(wheel, cylinder, dark, 'train-wheel-tire', 0, 0, 0, WHEEL_RADIUS, .14, WHEEL_RADIUS);
      tire.rotation.z = Math.PI / 2;
      // One bright spoke crosses the outer face, making wheel roll readable
      // without textures, extra lights or a geometry allocation per wheel.
      mesh(wheel, box, gold, 'train-wheel-spoke', side * .079, 0, 0, .018, WHEEL_RADIUS * 1.55, .055);
      vehicle.add(wheel);
      wheels.push(wheel);
    }
    return deck;
  }

  const carriages: THREE.Group[] = [];
  const passengerDecks: { deck: THREE.Mesh; panels: THREE.Mesh[]; rims: THREE.Mesh[]; length: number }[] = [];
  const expandedDecks = new Uint8Array(10);
  for (let index = 0; index < 10; index++) {
    const carriage = new THREE.Group();
    carriage.name = `train-carriage:${index}`;
    carriage.userData.carriageIndex = index;
    const paint = candy[index % candy.length];
    // Keep the established compact end-car bodies; spacing is now owned by
    // the open-chain placement rather than squeezing the locomotive between them.
    const length = index === 0 || index === 9 ? 1 : 1.12;
    const deck = chassis(carriage, 1.3, length, paint), panels: THREE.Mesh[] = [], rims: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      panels.push(mesh(carriage, box, paint, 'train-side-panel', side * .61, TRAIN_DECK_HEIGHT + .12, 0, .08, .24, length - .04));
      rims.push(mesh(carriage, box, gold, 'train-gold-rim', side * .61, TRAIN_DECK_HEIGHT + .25, 0, .1, .045, length));
    }
    passengerDecks.push({ deck, panels, rims, length });
    root.add(carriage);
    carriages.push(carriage);
  }

  const locomotive = new THREE.Group();
  locomotive.name = 'train-locomotive';
  chassis(locomotive, .88, 1.14, candy[1]);
  const boiler = mesh(locomotive, cylinder, candy[1], 'train-boiler', 0, TRAIN_DECK_HEIGHT + .26, .12, .29, .72, .29);
  boiler.rotation.x = Math.PI / 2;
  const boilerNose = mesh(locomotive, cylinder, gold, 'train-boiler-nose', 0, TRAIN_DECK_HEIGHT + .26, .49, .295, .035, .295);
  boilerNose.rotation.x = Math.PI / 2;
  const headlamp = mesh(locomotive, cylinder, lamp, 'train-headlamp', 0, TRAIN_DECK_HEIGHT + .27, .515, .105, .04, .105);
  headlamp.rotation.x = Math.PI / 2;
  mesh(locomotive, cylinder, gold, 'train-chimney', 0, TRAIN_DECK_HEIGHT + .7, .28, .105, .48, .105);
  mesh(locomotive, cylinder, candy[0], 'train-chimney-cap', 0, TRAIN_DECK_HEIGHT + .96, .28, .16, .1, .16);
  mesh(locomotive, box, candy[2], 'train-cab-back', 0, TRAIN_DECK_HEIGHT + .32, -.49, .78, .64, .08);
  for (const side of [-1, 1]) {
    mesh(locomotive, box, gold, 'train-cab-pillar', side * .34, TRAIN_DECK_HEIGHT + .43, -.21, .065, .86, .065);
    mesh(locomotive, box, candy[0], 'train-cab-side', side * .36, TRAIN_DECK_HEIGHT + .18, -.36, .07, .36, .36);
  }
  mesh(locomotive, box, candy[2], 'train-cab-roof', 0, TRAIN_DECK_HEIGHT + .89, -.36, .93, .12, .47);
  root.add(locomotive);

  // Fixed pools are created once. No actors, geometries, materials, or placement
  // objects are created while updating a frame.
  const vehicles = [...carriages, locomotive];
  const placements = vehicles.map(() => ({ x: 0, z: 0, heading: 0 }));
  const couplers = carriages.map((_, index) => {
    const link = mesh(root, box, gold, `train-coupler:${index}`, 0, TRAIN_DECK_HEIGHT - .28, 0, .055, .055, 1);
    return link;
  });
  const steam = Array.from({ length: 4 }, (_, index) => mesh(locomotive, sphere, steamMaterial, `train-steam:${index}`, 0, 0, 0, .1, .1, .1));

  // Keep the small vehicle hierarchy as hidden transform controls, then batch
  // every matching primitive/material pair across all eleven vehicles. Wheels,
  // steam and couplers stay independently animated with thirteen draw calls.
  const partsByBatch = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const part = node as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const key = `${part.geometry.uuid}:${part.material.uuid}`;
    const parts = partsByBatch.get(key);
    if (parts) parts.push(part);
    else partsByBatch.set(key, [part]);
    part.visible = false;
  });
  const batches = [...partsByBatch.values()].map(parts => {
    const first = parts[0];
    const instances = scope.track(new THREE.InstancedMesh(first.geometry, first.material, parts.length));
    instances.name = `train-batch:${first.geometry.type}:${first.material.uuid}`;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.frustumCulled = false;
    instances.boundingSphere = new THREE.Sphere();
    if (first.geometry.boundingSphere === null) first.geometry.computeBoundingSphere();
    instances.userData.floorPickThrough = true;
    root.add(instances);
    return { instances, parts };
  });
  partsByBatch.clear();
  const inverseRoot = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();

  return {
    update(frame: ToyTrainFrame | null, passengers?: Iterable<ToyTrainPassenger>) {
      if (disposed) return;
      if (!frame || !Number.isFinite(frame.distance) || !Number.isFinite(frame.emergence) || !Number.isFinite(frame.seconds)) {
        root.visible = false;
        root.position.y = HIDDEN_Y;
        return;
      }
      const emergence = Math.max(0, Math.min(1, frame.emergence));
      root.position.y = HIDDEN_Y + emergence * -HIDDEN_Y;
      root.visible = emergence > 0;
      if (!root.visible) return;
      expandedDecks.fill(0);
      if (passengers) for (const passenger of passengers) {
        if (passenger.desiredVisible === false || (passenger.preset !== 'sword-shield-dog' && passenger.preset !== 'dog')) continue;
        const index = TRAIN_SLOT_ORDER.indexOf(passenger.slot);
        if (index >= 0) expandedDecks[index] = 1;
      }
      for (let index = 0; index < passengerDecks.length; index++) {
        const parts = passengerDecks[index], expanded = expandedDecks[index] === 1;
        // Only the wide rider needs an overhanging platform. Keep the shared
        // track, wheelbase and other passengers' compact carriages unchanged.
        const width = expanded ? 2.24 : 1.3, length = expanded ? 1.4 : parts.length;
        parts.deck.scale.x = width; parts.deck.scale.z = length;
        for (let side = 0; side < 2; side++) {
          parts.panels[side].position.x = parts.rims[side].position.x = (side === 0 ? -1 : 1) * (width / 2 - .04);
          parts.panels[side].scale.z = length - .04; parts.rims[side].scale.z = length;
        }
      }
      for (let index = 0; index < vehicles.length; index++) {
        const formation = frame.formation ?? 1;
        const placement = index === 10 ? trainLocomotivePlacement(frame.distance, formation, placements[index]) : trainRingPlacement(index, frame.distance, placements[index], formation);
        const vehicle = vehicles[index];
        vehicle.position.set(placement.x, 0, placement.z);
        vehicle.rotation.y = placement.heading;
      }
      for (let index = 0; index < wheels.length; index++) wheels[index].rotation.x = frame.distance / WHEEL_RADIUS;
      for (let index = 0; index < couplers.length; index++) {
        // Engine→0→1→…→9 is an open chain. The large tail-to-engine arc
        // stays empty rather than closing the train back through its nose.
        const start = placements[index === 9 ? 10 : index], end = placements[index === 9 ? 0 : index + 1];
        const dx = end.x - start.x, dz = end.z - start.z;
        const link = couplers[index];
        link.position.x = (start.x + end.x) / 2;
        link.position.z = (start.z + end.z) / 2;
        link.rotation.y = Math.atan2(dx, dz);
        link.scale.z = Math.max(.05, Math.hypot(dx, dz) - 1.04);
      }
      for (let index = 0; index < steam.length; index++) {
        const life = ((frame.seconds * .8 + index / steam.length) % 1 + 1) % 1;
        const puff = steam[index];
        const size = .035 + Math.sin(life * Math.PI) * .085;
        puff.position.set(Math.sin(life * 5 + index) * .055, TRAIN_DECK_HEIGHT + 1.04 + life * .48, .28 - life * .32);
        puff.scale.set(size, size * 1.2, size);
      }
      root.updateWorldMatrix(true, true);
      inverseRoot.copy(root.matrixWorld).invert();
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const { instances, parts } = batches[batchIndex];
        for (let index = 0; index < parts.length; index++) {
          instanceMatrix.multiplyMatrices(inverseRoot, parts[index].matrixWorld);
          instances.setMatrixAt(index, instanceMatrix);
        }
        instances.instanceMatrix.needsUpdate = true;
        // Sorting uses the sphere even when culling is disabled. Recompute into
        // its existing object so WebGLRenderer never allocates one per frame.
        instances.computeBoundingSphere();
        // Box bounds are only needed for optional external inspection.
        instances.boundingBox = null;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.visible = false;
      root.removeFromParent();
      root.clear();
      wheels.length = carriages.length = passengerDecks.length = vehicles.length = placements.length = couplers.length = steam.length = 0;
      for (const batch of batches) batch.parts.length = 0;
      batches.length = 0;
      scope.dispose();
    },
  };
}
