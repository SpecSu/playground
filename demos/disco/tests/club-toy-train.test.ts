import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
import { TRAIN_SLOT_ORDER, TRAIN_DECK_HEIGHT, trainSlotPlacement } from '../lib/club-train-motion.ts';

async function renderer() {
  assert.ok(existsSync(new URL('../lib/club-toy-train.ts', import.meta.url)), 'the shared train needs a real scene-owned toy train renderer');
  return import('../lib/club-toy-train.ts');
}

function rootOf(scene: THREE.Scene) {
  const root = scene.getObjectByName('shared-toy-train');
  assert.ok(root instanceof THREE.Group);
  return root;
}

test('only a sword dog passenger expands its pooled carriage deck to support both enlarged feet', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const avatar = createClubAvatar('sword-shield-dog', 'wide-train-rider', { template: await uploadedTemplate('sword-shield-dog') });
  avatar.root.scale.setScalar(2); scene.add(avatar.root);
  const point = new THREE.Vector3();
  for (let slot = 0; slot < 10; slot++) {
    train.update({ distance: 3.7, emergence: 1, seconds: 4 }, [{ slot, preset: 'sword-shield-dog' }]);
    const index = TRAIN_SLOT_ORDER.indexOf(slot), carriage = root.getObjectByName(`train-carriage:${index}`)!;
    const deck = carriage.getObjectByName('train-deck') as THREE.Mesh;
    assert.ok(deck.scale.x / 2 >= 1.06 && deck.scale.z / 2 >= .69, 'real doubled support has a deck margin');
    const placement = trainSlotPlacement(slot, 3.7, 1);
    avatar.root.position.set(placement.x, 0, placement.z); avatar.root.rotation.y = placement.heading;
    avatar.update(0, 'dance', false, 1, undefined, { kind: 'train', version: 3, phase: 'perform', beat: 4.3, weight: 1, wave: 0, trainPhase: 'ride', trainHop: 0, trainLift: TRAIN_DECK_HEIGHT });
    actualBounds(avatar.root); scene.updateMatrixWorld(true);
    let footMinY = Infinity;
    avatar.root.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const ids = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let support = 0;
        for (let component = 0; component < 4; component++) if (/^foot_[LR]$/.test(node.skeleton.bones[ids.getComponent(vertex, component)].name)) support += weights.getComponent(vertex, component);
        if (support <= .5) continue;
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld); carriage.worldToLocal(point);
        assert.ok(Math.abs(point.x) <= deck.scale.x / 2 - .02 && Math.abs(point.z) <= deck.scale.z / 2 - .02, 'every foot-weighted vertex stands over its own deck');
        footMinY = Math.min(footMinY, point.y);
      }
    });
    assert.ok(Math.abs(footMinY - TRAIN_DECK_HEIGHT) < .06);
    for (let other = 0; other < 10; other++) if (other !== index) {
      const untouched = root.getObjectByName(`train-carriage:${other}`)!.getObjectByName('train-deck') as THREE.Mesh;
      assert.equal(untouched.scale.x, 1.3); assert.equal(untouched.scale.z, other === 0 || other === 9 ? 1 : 1.12);
    }
  }
  train.update({ distance: 3.7, emergence: 1, seconds: 4 }, [{ slot: 1, preset: 'sword-shield-dog', desiredVisible: false }]);
  for (let index = 0; index < 10; index++) assert.equal(root.getObjectByName(`train-carriage:${index}`)!.getObjectByName('train-deck')!.scale.x, 1.3, 'leaving or hidden riders restore the pooled deck');
  avatar.dispose(); train.dispose();
});

test('legacy saved dog identity receives the same wide deck as its canonical uploaded model', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const deck = root.getObjectByName(`train-carriage:${TRAIN_SLOT_ORDER.indexOf(0)}`)!.getObjectByName('train-deck')!;
  try {
    train.update({ distance: 3.7, emergence: 1, seconds: 4 }, [{ slot: 0, preset: 'sword-shield-dog' }]);
    const canonical = deck.scale.clone();
    train.update({ distance: 3.7, emergence: 1, seconds: 4 }, [{ slot: 0, preset: 'dog' }]);
    assert.deepEqual(deck.scale.toArray(), canonical.toArray());
  } finally { train.dispose(); }
});

test('train owns ten open carriages, a recognizable locomotive and visible rotating wheels', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  assert.equal(root.visible, false);
  assert.equal(root.children.filter(child => child.name.startsWith('train-carriage:')).length, 10);
  const locomotive = root.getObjectByName('train-locomotive');
  assert.ok(locomotive instanceof THREE.Group);
  for (const name of ['train-boiler', 'train-chimney', 'train-cab-roof', 'train-headlamp']) assert.ok(locomotive.getObjectByName(name) instanceof THREE.Mesh, name);
  for (let index = 0; index < 10; index++) {
    const carriage = root.getObjectByName(`train-carriage:${index}`)!;
    assert.ok(carriage.getObjectByName('train-deck') instanceof THREE.Mesh);
    assert.equal(carriage.children.filter(child => child.name.startsWith('train-wheel:')).length, 4);
    assert.equal(carriage.getObjectByName('train-cab-roof'), undefined, 'passenger carriages stay open');
  }
  let lights = 0;
  root.traverse(child => { if (child instanceof THREE.Light) lights++; });
  assert.equal(lights, 0);
  train.dispose();
});

test('carriage decks and locomotive follow the same absolute circular placement as their riders', async () => {
  const { createToyTrain } = await renderer();
  const { trainRingPlacement, trainLocomotivePlacement, TRAIN_DECK_HEIGHT } = await import('../lib/club-train-motion.ts');
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const point = new THREE.Vector3();
  for (const distance of [0, 1.125, 12.5, 28.3]) {
    train.update({ distance, emergence: 1, seconds: 4 });
    assert.equal(root.visible, true);
    scene.updateMatrixWorld(true);
    for (let index = 0; index < 10; index++) {
      const carriage = root.getObjectByName(`train-carriage:${index}`)!;
      const placement = trainRingPlacement(index, distance, undefined, 1);
      assert.ok(Math.abs(carriage.position.x - placement.x) < 1e-9);
      assert.ok(Math.abs(carriage.position.z - placement.z) < 1e-9);
      assert.ok(Math.abs(carriage.rotation.y - placement.heading) < 1e-9);
      const deck = carriage.getObjectByName('train-deck') as THREE.Mesh;
      deck.localToWorld(point.set(0, .5, 0));
      assert.ok(Math.abs(point.y - TRAIN_DECK_HEIGHT) < 1e-9, 'unit-box deck top matches rider standing surface');
      assert.ok(Math.abs(point.x - placement.x) < 1e-9);
      assert.ok(Math.abs(point.z - placement.z) < 1e-9);
    }
    const locomotive = root.getObjectByName('train-locomotive')!, placement = trainLocomotivePlacement(distance);
    assert.ok(Math.abs(locomotive.position.x - placement.x) < 1e-9);
    assert.ok(Math.abs(locomotive.position.z - placement.z) < 1e-9);
  }
  train.dispose();
});

test('whole train rises from below the floor and hides cleanly on interruption or invalid frames', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  train.update({ distance: 0, emergence: 0, seconds: 0 });
  assert.equal(root.visible, false);
  assert.equal(root.position.y, -2.4);
  train.update({ distance: 0, emergence: .5, seconds: 0 });
  assert.equal(root.visible, true);
  assert.equal(root.position.y, -1.2);
  train.update({ distance: 0, emergence: 2, seconds: 0 });
  assert.equal(root.position.y, 0);
  train.update(null);
  assert.equal(root.visible, false);
  for (const frame of [{ distance: NaN, emergence: 1, seconds: 0 }, { distance: 1, emergence: NaN, seconds: 0 }, { distance: 1, emergence: 1, seconds: Infinity }]) {
    train.update(frame);
    assert.equal(root.visible, false);
  }
  train.update({ distance: 0, emergence: 1, seconds: 0 });
  assert.equal(root.visible, true, 'a later valid event can replay without stale transforms');
  train.dispose();
});

test('the locomotive fits between the end carriages without overlapping their body silhouettes', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  train.update({ distance: 0, emergence: 1, seconds: 2 });
  scene.updateMatrixWorld(true);
  function outline(vehicle: THREE.Object3D) {
    const bound = new THREE.Box3();
    vehicle.traverse(node => {
      if (!(node instanceof THREE.Mesh) || node.name.includes('wheel') || node.name.includes('steam')) return;
      // Body silhouettes share a vehicle-local bounding rectangle. Omit puffs
      // and wheels, whose harmless projections occupy a different vertical band.
      node.geometry.computeBoundingBox();
      const part = node.geometry.boundingBox!.clone().applyMatrix4(node.matrix);
      bound.union(part);
    });
    return [
      new THREE.Vector3(bound.min.x, 0, bound.min.z), new THREE.Vector3(bound.min.x, 0, bound.max.z),
      new THREE.Vector3(bound.max.x, 0, bound.max.z), new THREE.Vector3(bound.max.x, 0, bound.min.z),
    ].map(point => vehicle.localToWorld(point));
  }
  function separation(a: THREE.Vector3[], b: THREE.Vector3[]) {
    let largestGap = -Infinity;
    for (const polygon of [a, b]) for (let index = 0; index < 4; index++) {
      const point = polygon[index], next = polygon[(index + 1) % 4];
      const axis = new THREE.Vector2(-(next.z - point.z), next.x - point.x).normalize();
      const aa = a.map(point => point.x * axis.x + point.z * axis.y), bb = b.map(point => point.x * axis.x + point.z * axis.y);
      largestGap = Math.max(largestGap, Math.min(...aa) - Math.max(...bb), Math.min(...bb) - Math.max(...aa));
    }
    return largestGap;
  }
  const engine = outline(root.getObjectByName('train-locomotive')!);
  for (const index of [0, 9]) assert.ok(separation(engine, outline(root.getObjectByName(`train-carriage:${index}`)!)) > .01, `engine clears carriage ${index}`);
  train.update({ distance: 0, emergence: 0, seconds: 2 });
  assert.ok(new THREE.Box3().setFromObject(root).max.y < 0, 'even pooled steam is below the floor at zero emergence');
  train.dispose();
});

test('wheel roll is absolute, reversible and proportional to distance over wheel radius', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const wheel = root.getObjectByName('train-carriage:0')!.getObjectByName('train-wheel:0')!;
  train.update({ distance: 0, emergence: 1, seconds: 0 });
  const start = wheel.rotation.x;
  train.update({ distance: .25, emergence: 1, seconds: 99 });
  assert.ok(Math.abs(wheel.rotation.x - start - 1) < 1e-9);
  const expected = wheel.rotation.x;
  train.update({ distance: 8, emergence: 1, seconds: 101 });
  train.update({ distance: .25, emergence: 1, seconds: 99 });
  assert.equal(wheel.rotation.x, expected);
  train.update({ distance: 0, emergence: 1, seconds: 0 });
  assert.equal(wheel.rotation.x, start);
  train.dispose();
});

test('frame updates preserve pooled scene objects and share geometries and palette materials', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const nodes = new Set<THREE.Object3D>(), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    nodes.add(node);
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  assert.ok(geometries.size <= 8, `shared primitive geometries: ${geometries.size}`);
  assert.ok(materials.size <= 20, `shared candy palette: ${materials.size}`);
  for (let step = 0; step < 500; step++) train.update({ distance: step / 10, emergence: 1, seconds: step / 60 });
  let count = 0;
  root.traverse(node => { count++; assert.ok(nodes.has(node), 'updates cannot add or replace scene nodes'); });
  assert.equal(count, nodes.size);
  train.dispose();
});

test('phone rendering batches the train under sixty draw calls while retaining exact wheel transforms', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), train = createToyTrain(scene), root = rootOf(scene);
  const matrix = new THREE.Matrix4();
  for (const distance of [0, 1.3, 25]) {
    train.update({ distance, emergence: .8, seconds: 2 });
    scene.updateMatrixWorld(true);
    let draws = 0;
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let parent: THREE.Object3D | null = node; parent; parent = parent.parent) if (!parent.visible) return;
      draws += Array.isArray(node.material) ? node.material.length : 1;
    });
    assert.ok(draws > 0 && draws <= 60, `train uses ${draws} draws; phone budget is 60`);
    const tire = root.getObjectByName('train-carriage:0')!.getObjectByName('train-wheel:0')!.getObjectByName('train-wheel-tire') as THREE.Mesh;
    const batch = root.children.find(node => node instanceof THREE.InstancedMesh && node.geometry === tire.geometry && node.material === tire.material) as THREE.InstancedMesh | undefined;
    assert.ok(batch, 'repeated wheels share an instanced batch');
    assert.ok(batch.boundingSphere instanceof THREE.Sphere, 'render sorting must not allocate a new bound each frame');
    const sphere = batch.boundingSphere;
    train.update({ distance, emergence: .8, seconds: 2 });
    assert.equal(batch.boundingSphere, sphere, 'instance bounds are pooled across updates');
    let foundWheel = false;
    for (let index = 0; index < batch.count; index++) {
      batch.getMatrixAt(index, matrix); matrix.premultiply(batch.matrixWorld);
      if (matrix.elements.every((value, element) => Math.abs(value - tire.matrixWorld.elements[element]) < 1e-6)) foundWheel = true;
    }
    assert.ok(foundWheel, 'the visible wheel instance matches its animated absolute-distance transform');
  }
  train.dispose();
});

test('dispose removes the train and releases every shared geometry and material exactly once', async () => {
  const { createToyTrain } = await renderer();
  const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
  const train = createToyTrain(scene), root = rootOf(scene);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material);
  });
  const releases = new Map<THREE.BufferGeometry | THREE.Material, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => releases.set(resource, (releases.get(resource) ?? 0) + 1));
  train.dispose(); train.dispose();
  assert.equal(root.parent, null);
  assert.deepEqual(scene.children, [unrelated]);
  assert.equal(releases.size, resources.size);
  for (const count of releases.values()) assert.equal(count, 1);
  train.update({ distance: 3, emergence: 1, seconds: 2 });
  assert.equal(root.visible, false);
  assert.equal(root.children.length, 0);
});

test('an open train keeps full wheel-inclusive clearance to both first carriage and tail throughout visible phases',async()=>{
 const {createToyTrain}=await renderer();const {sampleTrainFrame}=await import('../lib/club-train-motion.ts');
 const scene=new THREE.Scene(),train=createToyTrain(scene),root=rootOf(scene),engine=root.getObjectByName('train-locomotive')!;
 const event={kind:'train',version:3,startsAt:0,endsAt:16000,beatMs:500};
 function outline(vehicle:THREE.Object3D){const inverse=new THREE.Matrix4().copy(vehicle.matrixWorld).invert(),bound=new THREE.Box3();vehicle.traverse(node=>{if(!(node instanceof THREE.Mesh)||node.name.includes('steam'))return;node.geometry.computeBoundingBox();bound.union(node.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld)));});return [[bound.min.x,bound.min.z],[bound.min.x,bound.max.z],[bound.max.x,bound.max.z],[bound.max.x,bound.min.z]].map(([x,z])=>vehicle.localToWorld(new THREE.Vector3(x,0,z)));}
 function separation(a:THREE.Vector3[],b:THREE.Vector3[]){let gap=-Infinity;for(const p of[a,b])for(let i=0;i<4;i++){const n=p[(i+1)%4],c=p[i],axis=new THREE.Vector2(-(n.z-c.z),n.x-c.x).normalize();const aa=a.map(p=>p.x*axis.x+p.z*axis.y),bb=b.map(p=>p.x*axis.x+p.z*axis.y);gap=Math.max(gap,Math.min(...aa)-Math.max(...bb),Math.min(...bb)-Math.max(...aa));}return gap;}
 let checked=0;
 for(let t=5500;t<16000;t+=37){const frame=sampleTrainFrame(t,event)!;train.update(frame);scene.updateMatrixWorld(true);
  // A top above ground means some solid engine geometry is visible.
  const engineBox=new THREE.Box3();engine.traverse(node=>{if(node instanceof THREE.Mesh&&!node.name.includes('steam'))engineBox.union(new THREE.Box3().setFromObject(node));});
  if(engineBox.max.y<=0)continue;checked++;
  const first=separation(outline(engine),outline(root.getObjectByName('train-carriage:0')!));
  const tail=separation(outline(engine),outline(root.getObjectByName('train-carriage:9')!));
  assert.ok(first>=.25,`full engine/first-car visible clearance ${first} at ${t}`);
  assert.ok(tail>=1,`tail has an unused track gap, clearance ${tail} at ${t}`);
 }
 assert.ok(checked>100);
 assert.equal(root.children.filter(child=>child.name.startsWith('train-coupler:')).length,10,'one engine plus ten cars is an open chain with ten links');
 train.dispose();
});

test('riders share every compression transform and return continuously to unchanged landing positions',async()=>{
 const {createToyTrain}=await renderer();
 const {sampleTrainFrame,TRAIN_SLOT_ORDER,trainSlotPlacement,TRAIN_TOTAL_DISTANCE}=await import('../lib/club-train-motion.ts');
 const {clubGroupMotionAt}=await import('../lib/club-group-motion.ts');const {clubMotionAt}=await import('../lib/club-scene-motion.ts');
 const scene=new THREE.Scene(),train=createToyTrain(scene),root=rootOf(scene);
 const event={kind:'train' as const,version:3 as const,startsAt:0,endsAt:16000,beatMs:500,sourceClockBySlot:Array(10).fill(0)};
 for(const t of [5600,5750,6000,8000,14800,15500,15550,15999.999]){
  train.update(sampleTrainFrame(t,event)!);
  for(let index=0;index<10;index++){
   const slot=TRAIN_SLOT_ORDER[index],actor=clubGroupMotionAt(t,slot,event,clubMotionAt(t,slot))!,car=root.getObjectByName(`train-carriage:${index}`)!;
   assert.ok(Math.hypot(actor.motion.x-car.position.x,actor.motion.z-car.position.z)<1e-9,`rider stays centered at ${t}`);
   if(t>15999){const final=trainSlotPlacement(slot,TRAIN_TOTAL_DISTANCE);assert.ok(Math.hypot(actor.motion.x-final.x,actor.motion.z-final.z)<1e-8,'same release position without teleport');}
  }
 }
 train.dispose();
});
