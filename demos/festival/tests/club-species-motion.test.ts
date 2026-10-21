import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';

async function source(kind = 'cat') {
  const bytes = readFileSync(process.env.ANIMAL_ASSET_DIR ? resolve(process.env.ANIMAL_ASSET_DIR, `${kind}.glb`) : new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  const scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  return scene;
}
const state = (root: THREE.Object3D) => {
  const result: Record<string, number[]> = {};
  root.traverse(node => { if (node instanceof THREE.Bone) result[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]; });
  return result;
};

test('species choreography differs in joint mechanics even with identical bodies and shared group timing', async () => {
  const template = await source();
  const signatures = [];
  for (const kind of ['cat', 'frog', 'dog', 'panda'] as const) {
    const avatar = createClubAvatar(kind, 'same-dancer', { template });
    const samples = [];
    for (const beat of [0.12, 0.37, 0.73, 1.2]) {
      avatar.update(beat, 'dance', false, 1, undefined, { kind: 'wave', phase: 'perform', beat, weight: 1, wave: 0.4 });
      const pose = state(avatar.root);
      samples.push(['hips', 'spine', 'chest', 'neck', 'head'].map(name => pose[name]));
    }
    signatures.push(JSON.stringify(samples));
    avatar.dispose();
  }
  assert.equal(new Set(signatures).size, 4, 'each species has its own torso mechanics, not just ID phase or arm styling');
});

test('authored species appendages articulate, reset under reduced motion, and seek deterministically', async () => {
  const template = await source('dog');
  for (const name of ['tail', 'tailTip', 'ear_L', 'ear_R']) assert.ok(template.getObjectByName(name), `${name} exists in the authored asset`);
  const avatar = createClubAvatar('dog', 'appendages', { template });
  avatar.update(0.11, 'dance', false, 1);
  const first = state(avatar.root);
  avatar.update(0.71, 'dance', false, 1);
  const second = state(avatar.root);
  for (const name of ['tail', 'tailTip', 'ear_L', 'ear_R']) assert.notDeepEqual(first[name], second[name], `${name} follows the species groove`);
  avatar.update(0.11, 'dance', false, 1);
  assert.deepEqual(state(avatar.root), first);
  avatar.update(2.3, 'wave', true, 1);
  const quiet = state(avatar.root);
  avatar.update(8.3, 'spin', true, 0.1);
  assert.deepEqual(state(avatar.root), quiet);
  avatar.dispose();
});

function quadrupedFixture() {
  const template = new THREE.Group(); template.userData.speciesRig = 'quadruped';
  const bones = new Map<string, THREE.Bone>();
  const positions = new Map<string, THREE.Vector3>();
  const add = (name: string, parent: string | undefined, x: number, y: number, z: number) => {
    const bone = new THREE.Bone(); bone.name = name;
    const position = new THREE.Vector3(x, y, z); positions.set(name, position);
    bone.position.copy(position);
    if (parent) { bone.position.sub(positions.get(parent)!); bones.get(parent)!.add(bone); } else template.add(bone);
    bones.set(name, bone);
  };
  add('root', undefined, 0, 0, 0); add('hips', 'root', 0, .59, -.32);
  add('spine', 'hips', 0, .63, 0); add('chest', 'spine', 0, .64, .3);
  add('neck', 'chest', 0, .76, .39); add('head', 'neck', 0, .91, .46);
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    add(`upperArm_${side}`, 'chest', sign * .235, .57, .31);
    add(`forearm_${side}`, `upperArm_${side}`, sign * .25, .325, .33);
    add(`hand_${side}`, `forearm_${side}`, sign * .26, .085, .37);
    add(`thigh_${side}`, 'hips', sign * .245, .56, -.32);
    add(`shin_${side}`, `thigh_${side}`, sign * .27, .31, -.37);
    add(`foot_${side}`, `shin_${side}`, sign * .27, .085, -.32);
  }
  const geometry = new THREE.BoxGeometry(.4, 1, .8); geometry.translate(0, .5, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  template.add(mesh); template.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([...bones.values()]));
  return template;
}

test('quadruped uses four real planted contacts during manual distance-driven gait', async () => {
  const avatar = createClubAvatar('capybara', 'four-contact-gait', { template: await source('capybara') });
  const pawNames = ['foot_L', 'foot_R', 'hand_L', 'hand_R'];
  const poses: THREE.Vector3[][] = [];
  for (let frame = 0; frame < 160; frame++) {
    const d = frame * .006;
    const motion = { slot: 0, x: 0, z: d, heading: 0, distance: d, speed: .6, walkBlend: 1, action: 'dance' as const, sampleAtDistance: (distance: number) => ({ x: 0, z: distance, heading: 0 }) };
    avatar.root.position.set(0, 0, d);
    avatar.update(frame / 30, 'wave', false, 1, motion);
    const paws = pawNames.map(name => avatar.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()));
    for (const paw of paws) assert.ok(paw.y >= .083 && paw.y < .18, `paw stays near the floor, not a waving arm: ${paw.y}`);
    poses.push(paws);
  }
  for (let paw = 0; paw < 4; paw++) {
    const planted = poses.slice(1).filter((pose, frame) => pose[paw].distanceTo(poses[frame][paw]) < .001).length;
    assert.ok(planted > 65, `${pawNames[paw]} has long stable world-space stance periods: ${planted}`);
  }
  avatar.dispose();
});

test('quadruped reduced motion leaves all four feet at authored rest and group idle is static', () => {
  const avatar = createClubAvatar('capybara', 'four-contact-rest', { template: quadrupedFixture() });
  for (const name of ['foot_L', 'foot_R', 'hand_L', 'hand_R']) {
    assert.ok(Math.abs(avatar.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).y - .085) < 1e-6);
  }
  const pose = { kind: 'battle' as const, version: 2 as const, phase: 'perform' as const, beat: 0.4, weight: 1, wave: 0, activation: 0 };
  avatar.update(0, 'dance', false, 1, undefined, pose);
  const held = state(avatar.root);
  avatar.update(0, 'dance', false, 1, undefined, { ...pose, beat: 8.7 });
  assert.deepEqual(state(avatar.root), held);
  avatar.update(0, 'dance', false, 1, undefined, { ...pose, activation: 1, backflipElapsedMs: 880 });
  assert.ok(avatar.groundLift > .15);
  avatar.dispose();
});


test('authored secondary anatomy has substantial real skin influence and changes those vertices', async () => {
  for (const [kind, names] of [['cat', ['tail', 'tailTip']], ['dog', ['tail', 'tailTip', 'ear_L', 'ear_R']]] as const) {
    const template = await source(kind);
    const avatar = createClubAvatar(kind, 'weighted-secondary-anatomy', { template });
    const samples: { mesh: THREE.SkinnedMesh; vertex: number; name: string }[] = [];
    for (const name of names) {
      let count = 0;
      avatar.root.traverse(node => {
        if (!(node instanceof THREE.SkinnedMesh)) return;
        const joint = node.skeleton.bones.findIndex(bone => bone.name === name);
        const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
        for (let vertex = 0; vertex < indices.count; vertex++) {
          if ([0, 1, 2, 3].some(channel => indices.getComponent(vertex, channel) === joint && weights.getComponent(vertex, channel) > .25)) {
            count++; if (count === 10) samples.push({ mesh: node, vertex, name });
          }
        }
      });
      assert.ok(count > 30, `${kind}/${name} deforms authored skin, rather than an empty named bone: ${count}`);
    }
    avatar.update(.17, 'dance', false, 1);
    const before = samples.map(({ mesh, vertex }) => mesh.getVertexPosition(vertex, new THREE.Vector3()));
    avatar.update(.68, 'dance', false, 1);
    samples.forEach(({ mesh, vertex, name }, index) => assert.ok(mesh.getVertexPosition(vertex, new THREE.Vector3()).distanceTo(before[index]) > .005, `${kind}/${name} skin visibly moves`));
    avatar.dispose();
  }
});

test('new animal body plans preserve actual skin floor and one-metre dance envelope', async () => {
  const point = new THREE.Vector3();
  for (const kind of ['cat', 'frog', 'dog', 'capybara', 'panda'] as const) {
    const avatar = createClubAvatar(kind, `species-probe:${kind}`, { template: await source(kind) });
    for (const mode of ['dance', 'bounce', 'unison', 'wave'] as const) {
      for (const beat of [0, .25, .5, .75, 1, 1.325, 1.75, 1.833333333, 2, 2.375, 2.75, 3.3]) {
        const groupPose = mode === 'unison' || mode === 'wave' ? { kind: mode, version: 2 as const, phase: 'perform' as const, beat, weight: 1, wave: (1 - Math.cos(beat * Math.PI * 2)) / 2 } : undefined;
        avatar.update(beat, mode === 'bounce' ? 'bounce' : 'dance', false, 1, undefined, groupPose);
        avatar.root.traverseVisible(node => {
          if (!(node instanceof THREE.Mesh)) return;
          for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
            node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
            assert.ok(point.y >= -.025, `${kind}/${mode}/${beat} actual skin clears floor: ${point.y}`);
            assert.ok(Math.hypot(point.x, point.z) <= 1, `${kind}/${mode}/${beat} actual skin remains in dance lane`);
          }
        });
      }
    }
    avatar.dispose();
  }
});

test('quadruped expresses group wave, battle and grid through different paw gestures', () => {
  const avatar = createClubAvatar('capybara', 'quadruped-groups', { template: quadrupedFixture() });
  const signatures = [];
  for (const kind of ['wave', 'battle', 'grid'] as const) {
    avatar.update(0, 'dance', false, 1, undefined, { kind, version: 2, phase: 'perform', beat: .4, weight: 1, wave: 1, activation: 1 });
    const pose = state(avatar.root);
    signatures.push(JSON.stringify(['upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R'].map(name => pose[name])));
  }
  assert.equal(new Set(signatures).size, 3, 'quadruped translates arm choreography to distinct paw responses');
  avatar.dispose();
});

test('panda partial grid activation keeps a safety margin at the maximum arm spread', async () => {
  const avatar = createClubAvatar('panda', 'panda-envelope-margin', { template: await source('panda') });
  const point = new THREE.Vector3();
  let radius = 0;
  for (const activation of [.25, .5, .75, 1]) {
    avatar.update(0, 'dance', false, 1, undefined, { kind: 'grid', version: 2, phase: 'perform', beat: 2.768, weight: 1, wave: 0, activation });
    avatar.root.traverseVisible(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        radius = Math.max(radius, Math.hypot(point.x, point.z));
      }
    });
  }
  assert.ok(radius < .98, `raised paws retain room for continuous phase interpolation: ${radius}`);
  avatar.dispose();
});
