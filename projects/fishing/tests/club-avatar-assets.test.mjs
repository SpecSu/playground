import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

const kinds = ['human-jiji', 'human-subeike', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'monster-blob', 'monster-tower', 'monster-star'];
const joints = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArm_L', 'forearm_L', 'hand_L', 'upperArm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'];
export async function decodeAvatar(kind) {
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
for (const kind of kinds) {
  test(`${kind} ships a finite, normalized bone-skinned GLB with real joint influences`, async () => {
    const path = new URL(`../public/avatars/${kind}.glb`, import.meta.url);
    assert.ok(existsSync(path), `${kind} original rigged asset must exist`);
    const data = readFileSync(path);
    assert.ok(data.byteLength < 2_000_000, 'each avatar stays under 2 MB');
    const gltf = await decodeAvatar(kind);
    const boneNames = new Set();
    let skinned = 0;
    let weightedBlendVertices = 0;
    let triangles = 0;
    const influencedJoints = new Set();
    gltf.scene.traverse((node) => {
      if (node.isBone) boneNames.add(node.name);
      if (!node.isSkinnedMesh) return;
      skinned++;
      const weights = node.geometry.getAttribute('skinWeight');
      const indices = node.geometry.getAttribute('skinIndex');
      assert.ok(weights && indices, 'skin must have both indices and weights');
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      for (let vertex = 0; vertex < weights.count; vertex++) {
        const values = [weights.getX(vertex), weights.getY(vertex), weights.getZ(vertex), weights.getW(vertex)];
        assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.0001, 'skin weights sum to 1');
        if (values.filter((weight) => weight > 0.01).length > 1) weightedBlendVertices++;
        const ids = [indices.getX(vertex), indices.getY(vertex), indices.getZ(vertex), indices.getW(vertex)];
        ids.forEach((id, influence) => { if (values[influence] > 0.01) influencedJoints.add(node.skeleton.bones[id]?.name); });
      }
    });
    assert.ok(skinned > 0, 'asset must have a SkinnedMesh, not only rigid parented parts');
    assert.ok(weightedBlendVertices > 30, 'body must deform smoothly across joint blends');
    joints.forEach((joint) => assert.ok(boneNames.has(joint), `missing joint ${joint}`));
    ['hips', 'spine', 'head', 'upperArm_L', 'forearm_L', 'thigh_L', 'shin_L'].forEach((joint) => assert.ok(influencedJoints.has(joint), `${joint} must influence actual skin`));
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    assert.ok([size.x, size.y, size.z, box.min.y].every(Number.isFinite));
    assert.ok(size.y >= .95 && size.y <= 2.7, `avatar height ${size.y} is human-scaled`);
    assert.ok(Math.abs(box.min.y) < 0.045, `feet begin at floor, found ${box.min.y}`);
    // The rounded human family shares four authored surface groups; animals stay lighter.
    const triangleBudget = kind.startsWith('human-') ? 28_000 : 14_000;
    assert.ok(triangles < triangleBudget, `triangle budget is bounded, found ${triangles}`);
  });
}

test('closed avatar surfaces face outward, including small head and shoe poles', async () => {
  const gltf = await decodeAvatar('human-subeike');
  let checked = 0;
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const positions = node.geometry.attributes.position;
    const index = node.geometry.index;
    const parent = new Map();
    const position = new Map();
    const keyFor = (i) => [positions.getX(i), positions.getY(i), positions.getZ(i)].map((v) => v.toFixed(5)).join(',');
    const find = (key) => { if (!parent.has(key)) parent.set(key, key); if (parent.get(key) !== key) parent.set(key, find(parent.get(key))); return parent.get(key); };
    const triangles = [];
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const ids = [0, 1, 2].map((n) => index ? index.getX(i + n) : i + n);
      const keys = ids.map((id) => { const key = keyFor(id); position.set(key, new Vector3().fromBufferAttribute(positions, id)); return key; });
      parent.set(find(keys[1]), find(keys[0])); parent.set(find(keys[2]), find(keys[0])); triangles.push(keys);
    }
    const components = new Map();
    triangles.forEach((keys) => { const root = find(keys[0]); if (!components.has(root)) components.set(root, []); components.get(root).push(keys); });
    components.forEach((faces) => {
      const edges = new Map();
      for (const face of faces) for (let i = 0; i < 3; i++) { const key = [face[i], face[(i + 1) % 3]].sort().join('|'); edges.set(key, (edges.get(key) ?? 0) + 1); }
      if (![...edges.values()].every((count) => count === 2)) return;
      const volume = faces.reduce((sum, [a, b, c]) => sum + position.get(a).dot(position.get(b).clone().cross(position.get(c))) / 6, 0);
      if (Math.abs(volume) < 1e-10) return;
      checked++;
      assert.ok(volume > 0, `closed surface must face outward; signed volume ${volume}`);
    });
  });
  assert.ok(checked > 10, 'many closed body, head and accessory surfaces were inspected');
});

test('each complete avatar stays within its approved opaque material draw budget', async () => {
  for (const kind of kinds) {
    const { scene } = await decodeAvatar(kind);
    let materialDraws = 0;
    scene.traverse((node) => { if (node.isMesh) materialDraws += Array.isArray(node.material) ? node.material.length : 1; });
    const drawBudget = kind.startsWith('human-') ? 4 : 3;
    assert.ok(materialDraws <= drawBudget, `${kind} needs ${materialDraws} draws; vertex colors should consolidate the surfaces`);
  }
});

test('resident DJ accessory is included as a separately controllable skinned node', async () => {
  const { scene } = await decodeAvatar('capybara');
  const accessories = [];
  scene.traverse((node) => { if (node.userData.role === 'dj') accessories.push(node); });
  assert.ok(accessories.length > 0, 'capybara carries optional DJ headphones');
  assert.ok(accessories.some((node) => node.isSkinnedMesh || node.children.some((child) => child.isSkinnedMesh)));
});

test('cast silhouettes span a deliberate two-to-one height range', async () => {
  const heights = [];
  for (const kind of kinds) heights.push(new Box3().setFromObject((await decodeAvatar(kind)).scene).getSize(new Vector3()).y);
  assert.ok(Math.max(...heights) / Math.min(...heights) >= 1.95, 'small frog and towering monster should read at visibly different sizes');
});

test('Jiji skirt hem has leg-following weights so a raised thigh does not leave it rigid', async () => {
  const { scene } = await decodeAvatar('human-jiji');
  let hemVertices = 0;
  let followingVertices = 0;
  scene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const pos = node.geometry.attributes.position, weights = node.geometry.attributes.skinWeight, ids = node.geometry.attributes.skinIndex;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < .46 || pos.getY(i) > .54 || Math.abs(pos.getX(i)) < .29) continue;
      hemVertices++;
      const joints = [ids.getX(i), ids.getY(i), ids.getZ(i), ids.getW(i)];
      const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      const thighWeight = joints.reduce((sum, joint, index) => sum + (node.skeleton.bones[joint].name.startsWith('thigh_') ? values[index] : 0), 0);
      if (thighWeight > .3) followingVertices++;
    }
  });
  assert.ok(hemVertices > 10);
  assert.ok(followingVertices / hemVertices > .9, 'lower dress follows hips and legs rather than clipping during bounce');
});

test('tower shoulders remain attached to the narrow chest silhouette', async () => {
  const { scene } = await decodeAvatar('monster-tower');
  scene.updateMatrixWorld(true);
  const anchor = scene.getObjectByName('upperArm_L').getWorldPosition(new Vector3());
  let closest = Infinity;
  scene.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const pos = node.geometry.attributes.position, weights = node.geometry.attributes.skinWeight, ids = node.geometry.attributes.skinIndex;
    for (let i = 0; i < pos.count; i++) {
      const boneIds = [ids.getX(i), ids.getY(i), ids.getZ(i), ids.getW(i)];
      const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      if (!boneIds.some((id, index) => node.skeleton.bones[id].name === 'chest' && values[index] > .85)) continue;
      const point = node.localToWorld(new Vector3().fromBufferAttribute(pos, i));
      closest = Math.min(closest, anchor.distanceTo(point));
    }
  });
  assert.ok(closest < .085, `shoulder needs chest contact, nearest chest vertex is ${closest}`);
});
