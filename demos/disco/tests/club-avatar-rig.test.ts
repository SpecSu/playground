import { LEGACY_AVATAR_KINDS } from './helpers/legacy-avatar.ts';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function adapter() {
  assert.ok(existsSync(new URL('../lib/club-avatar-rig.ts', import.meta.url)), 'bone animation adapter exists');
  return import('../lib/club-avatar-rig.ts');
}
async function template(kind = 'human-subeike') {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function boneState(root: THREE.Object3D) {
  const state: Record<string, number[]> = {};
  root.traverse((node) => { if (node instanceof THREE.Bone) state[node.name] = [...node.position.toArray(), ...node.quaternion.toArray()]; });
  return state;
}

test('same absolute beat produces the same joint pose despite prior frames', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const a = createClubAvatar('human-subeike', 'same-id', { template: source });
  const b = createClubAvatar('human-subeike', 'same-id', { template: source });
  a.update(123.45, 'dance', false, 0.8);
  b.update(9.1, 'spin', false, 0.2);
  b.update(123.45, 'dance', false, 0.8);
  assert.deepEqual(boneState(a.root), boneState(b.root));
  a.dispose(); b.dispose();
});

test('dance bends hips, spine, shoulders, elbows and knees independently', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'motion-test', { template: await template() });
  avatar.update(0.1, 'dance', false, 1);
  const first = boneState(avatar.root);
  avatar.update(0.68, 'dance', false, 1);
  const second = boneState(avatar.root);
  for (const joint of ['hips', 'spine', 'upperArm_L', 'forearm_L', 'thigh_L', 'shin_L']) {
    assert.notDeepEqual(first[joint], second[joint], `${joint} articulates between beats`);
  }
  assert.notDeepEqual(second.forearm_L, second.shin_L, 'limbs do not receive a uniform bob');
  avatar.dispose();
});

test('animation preserves placement and facing, and reduced motion is stable', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'motion-test', { template: await template() });
  avatar.root.position.set(4, 0.03, 7);
  avatar.root.rotation.y = 0.8;
  avatar.update(2.1, 'spin', true, 1);
  const first = boneState(avatar.root);
  avatar.update(4.7, 'wave', true, 1);
  assert.deepEqual(boneState(avatar.root), first);
  assert.deepEqual(avatar.root.position.toArray(), [4, 0.03, 7]);
  assert.equal(avatar.root.rotation.y, 0.8);
  avatar.dispose();
});

test('instances have independent skeletons and independent disposable meshes', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const a = createClubAvatar('human-subeike', 'a', { template: source });
  const b = createClubAvatar('human-subeike', 'b', { template: source });
  const old = boneState(b.root);
  a.update(8.2, 'bounce', false, 1);
  assert.deepEqual(boneState(b.root), old);
  assert.equal(a.loaded, true);
  let geometryDisposals = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  a.root.traverse((node) => { if (node instanceof THREE.Mesh) geometries.add(node.geometry); });
  geometries.forEach((geometry) => geometry.addEventListener('dispose', () => geometryDisposals++));
  a.dispose(); a.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.ok(b.root.children.length > 0);
  b.dispose();
});

test('actions are distinct, energy affects joint amplitude and all values remain finite', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'actions', { template: await template() });
  const states = new Set<string>();
  for (const action of ['dance', 'bounce', 'wave', 'spin'] as const) {
    avatar.update(1.23, action, false, 1);
    states.add(JSON.stringify(boneState(avatar.root)));
  }
  assert.equal(states.size, 4);
  avatar.update(1.23, 'dance', false, 0.15);
  const quiet = boneState(avatar.root);
  avatar.update(1.23, 'dance', false, 1);
  assert.notDeepEqual(boneState(avatar.root), quiet);
  for (const beat of [0, 1, 3.14159, 1e9, NaN, Infinity]) {
    avatar.update(beat, 'dance', false, 1);
    assert.ok(Object.values(boneState(avatar.root)).flat().every(Number.isFinite));
  }
  avatar.dispose();
});


test('joint animation deforms weighted skin vertices, not only scene transforms', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'skin-motion', { template: await template() });
  const meshes: THREE.SkinnedMesh[] = [];
  avatar.root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const sample = (joint: string) => {
    for (const mesh of meshes) {
      const index = mesh.skeleton.bones.findIndex((bone) => bone.name === joint);
      const indices = mesh.geometry.getAttribute('skinIndex');
      const weights = mesh.geometry.getAttribute('skinWeight');
      for (let vertex = 0; vertex < indices.count; vertex++) {
        for (let channel = 0; channel < 4; channel++) {
          if (indices.getComponent(vertex, channel) === index && weights.getComponent(vertex, channel) > 0.5) {
            return mesh.getVertexPosition(vertex, new THREE.Vector3());
          }
        }
      }
    }
    assert.fail(`${joint} has real weighted skin vertices`);
  };
  avatar.update(0.05, 'dance', false, 1);
  const joints = ['spine', 'upperArm_L', 'forearm_L', 'thigh_L', 'shin_L'];
  const first = joints.map(sample);
  avatar.update(0.6, 'dance', false, 1);
  joints.forEach((joint, index) => assert.ok(sample(joint).distanceTo(first[index]) > 0.005, `${joint} visibly deforms its skin`));
  avatar.dispose();
});

test('disposal leaves cached template and other instances resource-safe', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const a = createClubAvatar('human-subeike', 'a', { template: source });
  const b = createClubAvatar('human-subeike', 'b', { template: source });
  const resources = (root: THREE.Object3D) => {
    const result = new Set<THREE.BufferGeometry | THREE.Material>();
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        result.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) result.add(material);
      }
    });
    return result;
  };
  const sourceResources = resources(source), aResources = resources(a.root), bResources = resources(b.root);
  for (const resource of aResources) {
    assert.equal(sourceResources.has(resource), false, 'template resources remain cache-owned');
    assert.equal(bResources.has(resource), false, 'avatar resources are instance-owned');
  }
  let foreignDisposals = 0;
  [...sourceResources, ...bResources].forEach((resource) => resource.addEventListener('dispose', () => foreignDisposals++));
  a.dispose();
  assert.equal(foreignDisposals, 0);
  assert.equal(a.loaded, false);
  assert.equal(a.root.children.length, 0);
  b.dispose();
});

test('Node without an injected model leaves an empty shell and never fetches', async (t) => {
  const { createClubAvatar, prewarmClubAvatars } = await adapter();
  const loader = t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => { throw new Error('unexpected network'); });
  const avatar = createClubAvatar('cat', 'server');
  await avatar.ready;
  await prewarmClubAvatars();
  assert.equal(avatar.loaded, false);
  assert.equal(avatar.root.children.length, 0);
  assert.equal(loader.mock.calls.length, 0);
  avatar.dispose();
});

test('retired blob prewarming and live avatars load the shared feidudu model', async (t) => {
  const { createClubAvatar, prewarmClubAvatars } = await adapter();
  const source = await template('monster-blob');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  t.after(() => { if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window'); });
  const loader = t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    assert.equal(url, '/avatars/cast-v1/feidudu.glb');
    return { scene: source };
  });
  await prewarmClubAvatars(['monster-blob', 'feidudu']);
  const retired = createClubAvatar('monster-blob', 'legacy-player');
  const current = createClubAvatar('feidudu', 'current-player');
  await Promise.all([retired.ready, current.ready]);
  assert.equal(loader.mock.calls.length, 1);
  assert.equal(loader.mock.calls[0].arguments[0], '/avatars/cast-v1/feidudu.glb');
  assert.equal(retired.kind, 'feidudu');
  assert.equal(retired.loaded, true);
  assert.equal(retired.height, current.height);
  retired.dispose(); current.dispose();
});

test('late model loading cannot install into an already disposed avatar', async (t) => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  t.after(() => { if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window'); });
  let finish!: (gltf: { scene: THREE.Group }) => void;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise((resolve) => { finish = resolve; }));
  const avatar = createClubAvatar('cat', 'disposed-loading');
  assert.equal(avatar.root.children.length, 0);
  avatar.dispose();
  finish({ scene: source });
  await avatar.ready;
  assert.equal(avatar.loaded, false);
  assert.equal(avatar.root.children.length, 0);
});

test('ready rejects actual loader failures and failed loads can be retried', async (t) => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  t.after(() => { if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window'); });
  let attempts = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => {
    attempts++;
    if (attempts === 1) throw new Error('asset unavailable');
    return { scene: source };
  });
  const failed = createClubAvatar('dog', 'missing-asset');
  await assert.rejects(failed.ready, /asset unavailable/);
  assert.equal(failed.root.children.length, 0);
  assert.equal(failed.loaded, false);
  const retried = createClubAvatar('dog', 'retry-asset');
  await retried.ready;
  assert.equal(retried.loaded, true);
  assert.equal(attempts, 2);
  failed.dispose(); retried.dispose();
});

test('concurrent loads share a template and hydrate the last requested pose', async (t) => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  t.after(() => { if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window'); });
  let finish!: (gltf: { scene: THREE.Group }) => void;
  const loader = t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise((resolve) => { finish = resolve; }));
  const a = createClubAvatar('panda', 'late-pose');
  const b = createClubAvatar('panda', 'second-instance');
  const expected = createClubAvatar('niulai', 'late-pose', { template: source });
  a.root.position.set(4, 0.03, 7);
  a.root.rotation.set(0.1, 0.8, -0.2);
  a.root.scale.set(1.2, 1.2, 1.2);
  a.update(2.9, 'wave', false, 0.8);
  expected.update(2.9, 'wave', false, 0.8);
  finish({ scene: source });
  await Promise.all([a.ready, b.ready]);
  assert.equal(loader.mock.calls.length, 1);
  assert.deepEqual(boneState(a.root), boneState(expected.root));
  assert.deepEqual(a.root.position.toArray(), [4, 0.03, 7]);
  assert.deepEqual(a.root.scale.toArray(), [1.2, 1.2, 1.2]);
  assert.equal(a.root.rotation.y, 0.8);
  a.dispose(); b.dispose(); expected.dispose();
});

test('resident cockatoo DJ keeps both hands over the mixer while shoulders and elbows articulate', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('dj-cockatoo', 'resident-dj', { mode: 'dj', template: await template('dj-cockatoo') });
  avatar.root.position.set(3, 0.2, -4);
  avatar.root.rotation.y = 0.6;
  const hand = (side: 'L' | 'R') => avatar.root.worldToLocal(avatar.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3()));
  avatar.update(0.2, 'dance', false, 1);
  const first = boneState(avatar.root);
  for (const beat of [0.8, 1.3, 2.1, 5.7]) {
    avatar.update(beat, 'dance', false, 1);
    for (const side of ['L', 'R'] as const) {
      const position = hand(side);
      assert.ok(position.y >= 1.14 && position.y <= 1.19, `hand ${side} stays above the 1.05 m deck`);
      assert.ok(position.z >= 0.40 && position.z <= 0.56, `hand ${side} reaches the equipment`);
      assert.ok(Math.abs(Math.abs(position.x) - 0.72) < 0.08);
    }
  }
  const second = boneState(avatar.root);
  assert.notDeepEqual(first.upperArm_L, second.upperArm_L);
  assert.notDeepEqual(first.forearm_L, second.forearm_L);
  avatar.update(0.1, 'wave', true, 1);
  const quiet = boneState(avatar.root);
  avatar.update(5.9, 'spin', true, 0.1);
  assert.deepEqual(boneState(avatar.root), quiet);
  avatar.dispose();
});

test('authored DJ-only accessories are hidden on ordinary dancers', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template('capybara');
  const headphones = new THREE.Group();
  headphones.name = 'visibility-test-headphones';
  headphones.userData.role = 'dj';
  source.getObjectByName('head')!.add(headphones);
  const dancer = createClubAvatar('capybara', 'ordinary', { template: source });
  const dj = createClubAvatar('capybara', 'dj', { template: source, mode: 'dj' });
  assert.equal(dancer.root.getObjectByName(headphones.name)!.visible, false);
  assert.equal(dj.root.getObjectByName(headphones.name)!.visible, true);
  assert.equal(headphones.visible, true, 'cache template is never mutated');
  dancer.dispose(); dj.dispose();
});

test('every legacy fixture stays above the floor tolerance with bounded elastic skin', async () => {
  const { createClubAvatar } = await adapter();
  const bounds = new THREE.Box3();
  for (const kind of LEGACY_AVATAR_KINDS) {
    const avatar = createClubAvatar(kind, 'bounds-test', { template: await template(kind) });
    try {
      for (const action of ['dance', 'bounce', 'wave', 'spin'] as const) {
        for (const beat of [0, 0.25, 0.5, 0.75, 1.3, 2.5, 3.75]) {
          avatar.update(beat, action, false, 1);
          bounds.setFromObject(avatar.root, true);
          const size = bounds.getSize(new THREE.Vector3());
          assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), `${kind}/${action} finite deformation`);
          assert.ok(bounds.min.y >= -0.025, `${kind}/${action}/${beat} does not sink below the floor: ${bounds.min.y}`);
          // A center-of-mass somersault turns height into depth. The dedicated
          // actual-skin test covers its one-metre radius and 3.5m peak height.
          const ceiling = action === 'wave' ? Math.max(avatar.height, 2.1) + .01 : avatar.height * 1.3;
          assert.ok(Math.max(size.x, size.z) < 2.1 && size.y < ceiling, `${kind}/${action} stays within its bounded elastic scale`);
        }
      }
    } finally { avatar.dispose(); }
  }
});

test('material primitives share one skeleton and bone texture only within their avatar', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template('human-jiji');
  const a = createClubAvatar('human-jiji', 'skeleton-a', { template: source });
  const b = createClubAvatar('human-jiji', 'skeleton-b', { template: source });
  const skeletons = (root: THREE.Object3D) => {
    const result = new Set<THREE.Skeleton>();
    root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) result.add(node.skeleton); });
    return [...result];
  };
  const aSkeletons = skeletons(a.root), bSkeletons = skeletons(b.root);
  assert.equal(aSkeletons.length, 1, 'identical material-primitive skeletons are consolidated');
  assert.equal(bSkeletons.length, 1);
  const [aSkeleton] = aSkeletons, [bSkeleton] = bSkeletons;
  assert.notEqual(aSkeleton, bSkeleton);
  assert.notEqual(aSkeleton.bones[0], bSkeleton.bones[0]);
  aSkeleton.computeBoneTexture(); bSkeleton.computeBoneTexture();
  assert.notEqual(aSkeleton.boneTexture, bSkeleton.boneTexture);
  let aDisposals = 0, bDisposals = 0;
  aSkeleton.boneTexture!.addEventListener('dispose', () => aDisposals++);
  bSkeleton.boneTexture!.addEventListener('dispose', () => bDisposals++);
  a.dispose(); a.dispose();
  assert.equal(aDisposals, 1);
  assert.equal(bDisposals, 0);
  b.update(1.5, 'wave', false, 0.8);
  b.dispose();
  assert.equal(bDisposals, 1);
});

test('loaded dimensions measure the visible model and exclude hidden optional accessories', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template('capybara');
  // The quadruped's real headphone band sits below its ear tips. Use a known
  // taller optional accessory to exercise visibility-dependent measurement,
  // rather than requiring a particular decorative silhouette from the artist.
  const accessory = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  accessory.userData.role = 'dj';
  accessory.position.y = new THREE.Box3().setFromObject(source).max.y + 0.15;
  source.add(accessory);
  const dancer = createClubAvatar('capybara', 'dancer-height', { template: source });
  const dj = createClubAvatar('capybara', 'dj-height', { template: source, mode: 'dj' });
  assert.ok(dancer.height < dj.height - 0.05, 'hidden optional accessories do not inflate ordinary avatar height');
  assert.equal(dancer.labelHeight, dancer.height + 0.22);
  assert.ok(dancer.footprintRadius > 0.2 && dancer.footprintRadius < 1);
  dancer.dispose(); dj.dispose();
});

test('rig asset choices use the canonical room preset enum', async () => {
  const { CLUB_AVATAR_KINDS } = await adapter();
  const { CANONICAL_AVATAR_PRESETS } = await import('../lib/room-types.ts');
  assert.equal(CLUB_AVATAR_KINDS, CANONICAL_AVATAR_PRESETS, 'asset prewarming uses only current selectable model IDs');
});

test('locomotion has a distinct walking pose and does not spin the walker away from its route', async () => {
  const { createClubAvatar } = await adapter();
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const avatar = createClubAvatar('human-subeike', 'walker', { template: await template() });
  const motion = Array.from({ length: 80 }, (_, index) => clubMotionAt(1_791_806_400_000 + index * 500, 0)).find((state) => state.walkBlend === 1)!;
  assert.equal(motion.walkBlend, 1);
  avatar.root.position.set(motion.x, 0, motion.z);
  avatar.root.rotation.y = motion.heading;
  avatar.update(2.5, 'spin', false, 1);
  const dance = boneState(avatar.root);
  avatar.update(2.5, 'spin', false, 1, motion);
  assert.notDeepEqual(boneState(avatar.root), dance, 'walking has its own leg and arm motion');
  assert.ok(Math.abs(avatar.root.getObjectByName('avatar-animation-pivot')!.rotation.y) < 1e-6, 'root yaw controls walking facing');
  assert.equal(avatar.root.rotation.y, motion.heading);
  avatar.dispose();
});

test('walk stance feet stay planted in world space while the root travels along curved routes', async () => {
  const { createClubAvatar } = await adapter();
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const avatar = createClubAvatar('human-subeike', 'planted-feet', { template: await template() });
  const feetAt = (now: number) => {
    const motion = clubMotionAt(now, 0);
    avatar.root.position.set(motion.x, 0, motion.z); avatar.root.rotation.y = motion.heading;
    avatar.update(11.3, 'dance', false, 0.9, motion);
    return { motion, feet: ['L', 'R'].map((side) => avatar.root.getObjectByName(`foot_${side}`)!.getWorldPosition(new THREE.Vector3())) };
  };
  let contacts = 0;
  for (let offset = 0; offset < 40_000; offset += 67) {
    const a = feetAt(1_791_806_400_000 + offset), b = feetAt(1_791_806_400_080 + offset);
    if (a.motion.walkBlend !== 1 || b.motion.walkBlend !== 1 || a.motion.speed < 0.12 || b.motion.speed < 0.12) continue;
    const drift = Math.min(...a.feet.map((foot, side) => foot.distanceTo(b.feet[side])));
    assert.ok(drift < 0.006, `at least one contact stays planted during each step: ${drift}`);
    contacts++;
  }
  assert.ok(contacts > 40, 'test covers many moving stance phases');
  avatar.dispose();
});

test('walking contacts stay grounded through a route reversal without stretching either scaled rig', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template();
  source.updateMatrixWorld(true);
  const groundY = source.getObjectByName('foot_L')!.getWorldPosition(new THREE.Vector3()).y;
  const thighY = source.getObjectByName('thigh_L')!.getWorldPosition(new THREE.Vector3()).y;
  const stride = THREE.MathUtils.clamp((thighY - groundY) * 0.72, 0.24, 0.5);
  // A C1 hairpin: walk toward -Z, turn through a short semicircle, then +Z.
  // Extrapolating the incoming tangent would leave the left contact behind the
  // body and across the opposite leg. Arc sampling follows the upcoming turn.
  const sample = (distance: number) => {
    const lead = 0.02, radius = 0.03, arc = Math.PI * radius;
    if (distance < lead) return { x: 0, z: -distance, heading: Math.PI };
    if (distance > lead + arc) return { x: radius * 2, z: -lead + (distance - lead - arc), heading: 0 };
    const angle = (distance - lead) / radius;
    return { x: radius * (1 - Math.cos(angle)), z: -lead - radius * Math.sin(angle), heading: Math.PI - angle };
  };
  for (const scale of [1, 2]) {
    const avatar = createClubAvatar('human-subeike', 'turning-contacts', { template: source });
    const parent = new THREE.Group(); parent.scale.setScalar(scale); parent.add(avatar.root);
    const initialLengths = ['L', 'R'].map(side => ['shin', 'foot'].map(name => avatar.root.getObjectByName(`${name}_${side}`)!.position.length()));
    const feet = [];
    try {
      for (const distance of [stride * 0.38, stride * 0.42]) {
        const point = sample(distance);
        avatar.root.position.set(point.x, 0, point.z); avatar.root.rotation.y = point.heading;
        avatar.update(11.3, 'dance', false, 0.9, {
          slot: 0, x: point.x * scale, z: point.z * scale, heading: point.heading,
          speed: scale * 0.2, distance: distance * scale, walkBlend: 1, action: 'dance',
          sampleAtDistance: distance => {
            const point = sample(distance / scale);
            return { ...point, x: point.x * scale, z: point.z * scale };
          },
        });
        const foot = avatar.root.getObjectByName('foot_L')!.getWorldPosition(new THREE.Vector3());
        assert.ok(Math.abs(foot.y - groundY * scale) < 0.001 * scale, `the stance foot reaches the floor at scale ${scale}: ${foot.y}`);
        feet.push(foot);
        assert.deepEqual(['L', 'R'].map(side => ['shin', 'foot'].map(name => avatar.root.getObjectByName(`${name}_${side}`)!.position.length())), initialLengths, 'planting cannot stretch leg bones');
      }
      assert.ok(feet[0].distanceTo(feet[1]) < 0.001 * scale, 'the contact remains fixed through the reversal');
    } finally { avatar.dispose(); }
  }
});

test('walk pose is deterministic after arbitrary prior frames and remains safe for every legacy fixture', async () => {
  const { createClubAvatar } = await adapter();
  const { clubMotionAt, CLUB_BODY_RADIUS } = await import('../lib/club-scene-motion.ts');
  const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
  for (const kind of LEGACY_AVATAR_KINDS) {
    const avatar = createClubAvatar(kind, 'walk-bounds', { template: await template(kind) });
    for (let offset = 0; offset < 25_000; offset += 577) {
      const movement = clubMotionAt(1_791_806_400_000 + offset, 0);
      avatar.root.position.set(movement.x, 0, movement.z); avatar.root.rotation.y = movement.heading;
      avatar.update(offset / 500, 'wave', false, 1, movement);
      bounds.setFromObject(avatar.root, true);
      assert.ok(bounds.min.y >= -0.04, `${kind} walk does not push its skin below the floor: ${bounds.min.y}`);
      avatar.root.traverseVisible((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        for (let i = 0; i < node.geometry.attributes.position.count; i++) {
          node.getVertexPosition(i, vertex).applyMatrix4(node.matrixWorld);
          assert.ok(Math.hypot(vertex.x - movement.x, vertex.z - movement.z) <= CLUB_BODY_RADIUS, `${kind} animated envelope stays inside reserved territory`);
        }
      });
    }
    const movement = Array.from({ length: 80 }, (_, index) => clubMotionAt(1_791_806_400_000 + index * 500, 0)).find((state) => state.walkBlend === 1)!;
    avatar.root.position.set(movement.x, 0, movement.z); avatar.root.rotation.y = movement.heading;
    avatar.update(3.1, 'wave', false, 1, movement);
    const expected = boneState(avatar.root);
    avatar.update(10.8, 'spin', false, 0.1, clubMotionAt(1_791_806_420_000, 0));
    avatar.update(3.1, 'wave', false, 1, movement);
    assert.deepEqual(boneState(avatar.root), expected, `${kind} does not integrate foot contacts from prior frames`);
    avatar.dispose();
  }
});

test('bounce-to-walk blending keeps monster soles above the existing floor tolerance', async () => {
  const { createClubAvatar } = await adapter();
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const avatar = createClubAvatar('monster-blob', 'all-motion-bounds', { template: await template('monster-blob') });
  const motion = Array.from({ length: 3000 }, (_, index) => clubMotionAt(1_791_806_400_000 + index * 17, 6)).find(state => state.walkBlend > 0 && state.walkBlend < 1)!;
  assert.ok(motion.walkBlend > 0 && motion.walkBlend < 1, 'exercise the partial gait transition');
  avatar.root.position.set(motion.x, 0, motion.z); avatar.root.rotation.y = motion.heading;
  avatar.update(66 * 0.173, 'bounce', false, 1, motion);
  const bounds = new THREE.Box3().setFromObject(avatar.root, true);
  assert.ok(bounds.min.y >= -0.025, `blended knees cannot drive soles through the floor: ${bounds.min.y}`);
  avatar.dispose();
});

test('in-place dancing has unmistakable headbanging and alternating overhead arm pumps', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'wild-dancer', { template: await template() });
  const head: THREE.Quaternion[] = [], left: THREE.Quaternion[] = [], right: THREE.Quaternion[] = [];
  for (let beat = 0; beat < 4; beat += 0.05) {
    avatar.update(beat, 'dance', false, 1);
    head.push(avatar.root.getObjectByName('head')!.quaternion.clone());
    left.push(avatar.root.getObjectByName('upperArm_L')!.quaternion.clone());
    right.push(avatar.root.getObjectByName('upperArm_R')!.quaternion.clone());
  }
  const span = (poses: THREE.Quaternion[]) => Math.max(...poses.flatMap((a) => poses.map((b) => a.angleTo(b))));
  assert.ok(span(head) > 0.85, 'head moves through a clearly visible headbanging arc');
  assert.ok(span(left) > 0.9 && span(right) > 0.9, 'both arms perform large, different pumps');
  avatar.dispose();
});

test('bounce visibly leaves the floor, lands again, and keeps navigation and reduced motion stable', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('frog', 'jumping-frog', { template: await template('frog') });
  const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!;
  let maxLift = 0, grounded = 0, flying = 0;
  const bounds = new THREE.Box3();
  for (let beat = 0; beat < 4; beat += 0.04) {
    avatar.update(beat, 'bounce', false, 1);
    maxLift = Math.max(maxLift, pivot.position.y);
    bounds.setFromObject(avatar.root, true);
    assert.ok(bounds.min.y >= -0.025, `the landing does not enter the floor: ${bounds.min.y}`);
    if (bounds.min.y < 0.025) grounded++;
    if (bounds.min.y > 0.25) flying++;
  }
  assert.ok(maxLift > 0.4 && flying > 15, 'jump height is substantial rather than a gentle bob');
  assert.ok(grounded > 15, 'the dancer repeatedly returns to a real floor contact');
  assert.deepEqual(avatar.root.position.toArray(), [0, 0, 0]);
  avatar.update(1.1, 'bounce', true, 1);
  assert.equal(pivot.position.y, 0);
  assert.deepEqual(pivot.scale.toArray(), [1, 1, 1]);
  avatar.dispose();
});

test('resident DJ headbangs while the existing mixer-hand constraints remain available', async () => {
  const { createClubAvatar } = await adapter();
  const dj = createClubAvatar('capybara', 'house-dj', { template: await template('capybara'), mode: 'dj' });
  const poses: THREE.Quaternion[] = [];
  for (let beat = 0; beat < 2; beat += 0.1) {
    dj.update(beat, 'dance', false, 1);
    poses.push(dj.root.getObjectByName('head')!.quaternion.clone());
  }
  assert.ok(Math.max(...poses.flatMap((a) => poses.map((b) => a.angleTo(b)))) > 0.4);
  dj.dispose();
});

test('vigorous actions retain the one-metre collision envelope and floor clearance for every legacy fixture', async () => {
  const { createClubAvatar } = await adapter();
  const { CLUB_BODY_RADIUS } = await import('../lib/club-scene-motion.ts');
  const point = new THREE.Vector3();
  for (const kind of LEGACY_AVATAR_KINDS) {
    const avatar = createClubAvatar(kind, `energetic-bounds:${kind}`, { template: await template(kind) });
    for (const action of ['dance', 'bounce', 'spin', 'wave'] as const) {
      for (let beat = 0; beat < 4; beat += 0.125) {
        avatar.update(beat, action, false, 1);
        avatar.root.traverseVisible((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          for (let i = 0; i < node.geometry.attributes.position.count; i++) {
            node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
            assert.ok(point.y >= -0.025, `${kind}/${action}/${beat} floor clearance ${point.y}`);
            assert.ok(Math.hypot(point.x, point.z) <= CLUB_BODY_RADIUS, `${kind}/${action}/${beat} stays inside the separated territory`);
          }
        });
      }
    }
    avatar.dispose();
  }
});

test('gummy motion stretches on takeoff, squashes on landing and gives the head a delayed elastic shape', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('monster-blob', 'gummy-bounce', { template: await template('monster-blob') });
  const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!, head = avatar.root.getObjectByName('head')!;
  let minBody = 1, maxBody = 1, minHead = 1, maxHead = 1;
  for (let beat = 0; beat < 4; beat += 0.025) {
    avatar.update(beat, 'bounce', false, 1);
    minBody = Math.min(minBody, pivot.scale.y); maxBody = Math.max(maxBody, pivot.scale.y);
    minHead = Math.min(minHead, head.scale.y); maxHead = Math.max(maxHead, head.scale.y);
  }
  assert.ok(minBody < 0.88 && maxBody > 1.1, 'gummy takeoff and landing deform the silhouette substantially');
  assert.ok(maxHead - minHead > 0.17, 'the head rebounds independently rather than moving as a rigid statue');
  avatar.update(1.1, 'bounce', true, 1);
  assert.deepEqual(pivot.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(head.scale.toArray(), [1, 1, 1]);
  avatar.dispose();
});

test('nickname anchors stay above stretched heads and raised hands at peak hops', async () => {
  const { createClubAvatar } = await adapter();
  const bounds = new THREE.Box3();
  for (const kind of ['human-jiji', 'capybara', 'monster-tower'] as const) {
    const avatar = createClubAvatar(kind, `energetic-bounds:${kind}`, { template: await template(kind) });
    for (let beat = 0; beat < 4; beat += 0.0625) {
      avatar.update(beat, 'bounce', false, 1);
      bounds.setFromObject(avatar.root, true);
      assert.ok(avatar.labelHeight - bounds.max.y >= 0.04, `${kind}/${beat} nickname has a readable clearance`);
    }
    avatar.dispose();
  }
});

test('group locomotion plants feet on the supplied route rather than the private roaming loop', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'group-walker', { template: await template() });
  let samples = 0;
  const sampleAtDistance = (distance: number) => { samples++; return { x: -4 + distance, z: 6, heading: Math.PI / 2 }; };
  for (const distance of [0.2, 0.23, 0.26]) {
    const position = sampleAtDistance(distance);
    avatar.root.position.set(position.x, 0, position.z);
    avatar.root.rotation.y = position.heading;
    samples = 0;
    avatar.update(1, 'dance', false, 1, { slot: 0, ...position, speed: 0.4, distance, walkBlend: 1, action: 'dance', sampleAtDistance });
    assert.equal(samples, 4, 'both planted-foot contacts come from the group route');
    const bounds = new THREE.Box3().setFromObject(avatar.root, true);
    assert.ok(bounds.min.y >= -0.025, 'group walking soles remain above the floor');
    assert.ok(bounds.min.x > position.x - 1 && bounds.max.x < position.x + 1);
  }
  avatar.dispose();
});

test('group unison shares its pose phase across identities while preserving the navigation root', async () => {
  const { createClubAvatar } = await adapter();
  const source = await template('frog');
  const a = createClubAvatar('frog', 'group-alpha', { template: source });
  const b = createClubAvatar('frog', 'group-omega', { template: source });
  const pose = { kind: 'unison' as const, phase: 'perform' as const, beat: 2.4, weight: 1, wave: 0 };
  a.update(97.2, 'bounce', false, 1, undefined, pose);
  b.update(5.3, 'bounce', false, 1, undefined, pose);
  assert.deepEqual(boneState(a.root), boneState(b.root), 'group timeline overrides individual phase and song clock');
  assert.equal(a.groundLift, b.groundLift);
  assert.deepEqual(a.root.position.toArray(), [0, 0, 0]);
  a.dispose(); b.dispose();
});

test('group human wave visibly raises both arms according to the travelling wave envelope', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'human-wave', { template: await template() });
  const pose = { kind: 'wave' as const, phase: 'perform' as const, beat: 1, weight: 1, wave: 0 };
  avatar.update(0, 'dance', false, 1, undefined, pose);
  const left = avatar.root.getObjectByName('upperArm_L')!.quaternion.clone(), right = avatar.root.getObjectByName('upperArm_R')!.quaternion.clone();
  avatar.update(0, 'dance', false, 1, undefined, { ...pose, wave: 1 });
  assert.ok(left.angleTo(avatar.root.getObjectByName('upperArm_L')!.quaternion) > 1.3);
  assert.ok(right.angleTo(avatar.root.getObjectByName('upperArm_R')!.quaternion) > 1.3);
  avatar.update(0, 'dance', true, 1, undefined, pose);
  const quiet = boneState(avatar.root);
  avatar.update(0, 'dance', true, 1, undefined, { ...pose, beat: 9, wave: 1 });
  assert.deepEqual(boneState(avatar.root), quiet);
  avatar.dispose();
});

test('shared train, human-wave and unison poses keep every legacy fixture within its safe skin envelope', async () => {
  const { createClubAvatar } = await adapter();
  const { CLUB_BODY_RADIUS } = await import('../lib/club-scene-motion.ts');
  const point = new THREE.Vector3();
  for (const kind of LEGACY_AVATAR_KINDS) {
    const avatar = createClubAvatar(kind, `group-envelope:${kind}`, { template: await template(kind) });
    for (const groupKind of ['train', 'wave', 'unison'] as const) {
      for (let step = 0; step < 24; step++) {
        const beat = step / 6;
        const distance = step * 0.025;
        const motion = groupKind === 'train' ? { slot: 0, x: distance, z: 0, heading: Math.PI / 2, distance, speed: 0.5, walkBlend: 1, action: 'dance' as const, sampleAtDistance: (d: number) => ({ x: d, z: 0, heading: Math.PI / 2 }) } : undefined;
        avatar.root.position.set(motion?.x ?? 0, 0, 0);
        avatar.root.rotation.y = motion?.heading ?? 0;
        avatar.update(beat, 'dance', false, 1, motion, { kind: groupKind, phase: 'perform', beat, weight: 1, wave: (1 - Math.cos(beat * Math.PI * 2)) / 2 });
        avatar.root.traverseVisible((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          for (let i = 0; i < node.geometry.attributes.position.count; i++) {
            node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
            assert.ok(point.y >= -0.025, `${kind}/${groupKind}/${beat} floor clearance ${point.y}`);
            assert.ok(Math.hypot(point.x - avatar.root.position.x, point.z) <= CLUB_BODY_RADIUS, `${kind}/${groupKind}/${beat} body radius`);
          }
        });
      }
    }
    avatar.dispose();
  }
});

test('train stance contacts stay planted while the shared circle turns under the follower camera', async () => {
  const { createClubAvatar } = await adapter();
  const { clubMotionAt } = await import('../lib/club-scene-motion.ts');
  const { clubGroupMotionAt } = await import('../lib/club-group-motion.ts');
  const avatar = createClubAvatar('human-subeike', 'train-contacts', { template: await template() });
  const start = 1_791_806_400_000;
  const event = { kind: 'train' as const, startsAt: start, endsAt: start + 28000, beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
  const feetAt = (now: number) => {
    const group = clubGroupMotionAt(now, 0, event, clubMotionAt(now, 0))!;
    avatar.root.position.set(group.motion.x, 0, group.motion.z); avatar.root.rotation.y = group.motion.heading;
    avatar.update(0, 'dance', false, 1, group.motion, group.pose);
    return ['L', 'R'].map((side) => avatar.root.getObjectByName(`foot_${side}`)!.getWorldPosition(new THREE.Vector3()));
  };
  for (let offset = 7000; offset < 21000; offset += 181) {
    const a = feetAt(start + offset), b = feetAt(start + offset + 25);
    const drift = Math.min(...a.map((foot, side) => foot.distanceTo(b[side])));
    assert.ok(drift < 0.006, `train has a real stance foot, not a skating loop: ${drift}`);
  }
  avatar.dispose();
});

test('zero-weight group count-in does not replace an avatar’s normal music pose', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('frog', 'countdown-pose', { template: await template('frog') });
  avatar.update(3.25, 'wave', false, 1);
  const normal = boneState(avatar.root);
  avatar.update(3.25, 'wave', false, 1, undefined, { kind: 'unison', phase: 'prepare', beat: 0, weight: 0, wave: 0 });
  assert.deepEqual(boneState(avatar.root), normal);
  avatar.dispose();
});

test('v2 unison performs two airborne turns then a visible clap without rotating the tracking root', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('human-subeike', 'double-hop-clap', { template: await template() });
  const pivot = avatar.root.getObjectByName('avatar-animation-pivot')!;
  const pose = { kind: 'unison' as const, version: 2 as const, phase: 'perform' as const, beat: 0, weight: 1, wave: 0 };
  avatar.root.rotation.y = 0.7;
  let flights = 0, priorFlying = false, maxTurn = 0, maxLift = 0;
  for (let beat = 0; beat < 4; beat += 0.025) {
    avatar.update(0, 'dance', false, 1, undefined, { ...pose, beat });
    const flying = avatar.groundLift > 0.08;
    if (flying && !priorFlying) flights++;
    priorFlying = flying;
    maxLift = Math.max(maxLift, avatar.groundLift);
    maxTurn = Math.max(maxTurn, Math.abs(pivot.rotation.y));
    assert.equal(avatar.root.rotation.y, 0.7);
    if (avatar.groundLift < 1e-6) assert.ok(Math.abs(pivot.rotation.y) < 1e-6, 'quarter twists land facing front without dragging planted feet');
  }
  assert.equal(flights, 2, 'the phrase has a clear double-jump rhythm rather than four identical bounces');
  assert.ok(maxLift > 0.3 && maxTurn > 1.3);
  avatar.update(0, 'dance', false, 1, undefined, { ...pose, beat: 3.3 });
  const left = avatar.root.getObjectByName('hand_L')!.getWorldPosition(new THREE.Vector3());
  const right = avatar.root.getObjectByName('hand_R')!.getWorldPosition(new THREE.Vector3());
  assert.ok(left.distanceTo(right) < 0.16, 'clapping hands visibly meet in front of the chest');
  avatar.dispose();
});

test('battle and grid activation select clear jumping replies versus quiet held poses', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('frog', 'activation-reply', { template: await template('frog') });
  const states: string[] = [];
  for (const kind of ['battle', 'grid'] as const) {
    const pose = { kind, version: 2 as const, phase: 'perform' as const, beat: 0.42, weight: 1, wave: 0, activation: 0 };
    avatar.update(0, 'dance', false, 1, undefined, pose);
    const held = boneState(avatar.root);
    assert.equal(avatar.groundLift, 0, `${kind} inactive cells stay on the ground`);
    avatar.update(0, 'dance', false, 1, undefined, { ...pose, beat: 2.7 });
    assert.deepEqual(boneState(avatar.root), held, `${kind} inactive cells hold their listening pose`);
    avatar.update(0, 'dance', false, 1, undefined, { ...pose, activation: 1, ...(kind === 'battle' ? { backflipElapsedMs: 880 } : {}) });
    assert.ok(avatar.groundLift > 0.4, `${kind} active replies jump clearly above their waiting neighbours`);
    states.push(JSON.stringify(boneState(avatar.root)));
    avatar.update(0, 'dance', true, 1, undefined, { ...pose, activation: 1 });
    const quiet = boneState(avatar.root);
    avatar.update(0, 'dance', true, 1, undefined, { ...pose, beat: 1.8 });
    assert.deepEqual(boneState(avatar.root), quiet);
  }
  assert.notEqual(states[0], states[1], 'battle somersaults and grid overhead pops are visibly different');
  avatar.dispose();
});

test('v2 double-hop, battle and grid retain actual skin clearance and readable labels for all legacy fixtures', async () => {
  const { createClubAvatar } = await adapter();
  const point = new THREE.Vector3();
  for (const kind of LEGACY_AVATAR_KINDS) {
    const avatar = createClubAvatar(kind, `v2-envelope:${kind}`, { template: await template(kind) });
    for (const groupKind of ['unison', 'battle', 'grid'] as const) {
      for (const activation of groupKind === 'unison' ? [1] : [0, 0.5, 1]) {
        for (const beat of [...Array.from({ length: 32 }, (_, index) => index / 8), 1.325, 2.375, 3.3]) {
          avatar.update(0, 'dance', false, 1, undefined, { kind: groupKind, version: 2, phase: 'perform', beat, weight: 1, wave: 0, activation });
          let peak = 0;
          avatar.root.traverseVisible((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
              node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
              assert.ok(point.y >= -0.025, `${kind}/${groupKind}/${activation}/${beat} floor ${point.y}`);
              assert.ok(Math.hypot(point.x, point.z) <= 1, `${kind}/${groupKind}/${activation}/${beat} radius ${Math.hypot(point.x, point.z)}`);
              peak = Math.max(peak, point.y);
            }
          });
          assert.ok(avatar.labelHeight - peak >= 0.02, `${kind}/${groupKind}/${beat} nickname clearance`);
        }
      }
    }
    avatar.dispose();
  }
});

test('battle activation fades continuously out of the held pose instead of popping at its first nonzero value', async () => {
  const { createClubAvatar } = await adapter();
  const avatar = createClubAvatar('frog', 'activation-continuity', { template: await template('frog') });
  const pose = { kind: 'battle' as const, version: 2 as const, phase: 'perform' as const, beat: 0.37, weight: 1, wave: 0, activation: 0 };
  avatar.update(0, 'dance', false, 1, undefined, pose);
  const before = boneState(avatar.root);
  avatar.update(0, 'dance', false, 1, undefined, { ...pose, activation: 0.00001 });
  const after = boneState(avatar.root);
  for (const name of Object.keys(before)) {
    assert.ok(Math.max(...before[name].map((value, index) => Math.abs(value - after[name][index]))) < 0.001, `${name} blends continuously from the waiting pose`);
  }
  avatar.dispose();
});

test('version-three train uses exact shared lift on all bodies, with grounded carriage feet and no extra dance bob', async()=>{
 const {createClubAvatar}=await adapter();
 for(const kind of ['human-subeike','capybara','frog','monster-tower'] as const){
  const avatar=createClubAvatar(kind,'train-test',{template:await template(kind)});
  for(const [trainPhase,trainLift,trainHop] of [['hop',.62,1],['ride',.64,0],['sink',0,0]] as const){
   const pose={kind:'train' as const,version:3 as const,phase:'perform' as const,beat:4.3,weight:1,wave:0,trainPhase,trainLift,trainHop};
   avatar.update(0,'dance',false,1,undefined,pose);assert.equal(avatar.groundLift,trainLift,kind);
   avatar.update(91,'dance',false,.2,undefined,pose);assert.equal(avatar.groundLift,trainLift,'music or personal energy cannot detach feet from train deck');
   assert.ok(Object.values(boneState(avatar.root)).flat().every(Number.isFinite));
  }
  avatar.dispose();
 }
});
