/** Offline QA: bake actual Three.js world-space skin and visible construction props.
 * Run from project root:
 * node --experimental-strip-types --import ./tests/room-loader.mjs scripts/avatars/festival-v033/export-runtime-poses.mjs
 * Original embedded images, UVs, triangles and body materials are copied byte-for-byte.
 * This never changes production assets. Outputs are flattened static QA snapshots.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createClubAvatar } from '../../../lib/club-avatar-rig.ts';
import { createFestivalBuilderAvatar } from '../../../lib/festival-builder-avatar.ts';
import { createFestivalCelebrationAvatar } from '../../../src/desert/celebration-avatar.ts';
import { UPLOADED_CAST, uploadedTemplate } from '../../../tests/helpers/uploaded-avatar.ts';

const output = resolve(process.argv[2] ?? '.local-qa/v033');
mkdirSync(output, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['lib/club-avatar-rig.ts', 'lib/festival-builder-avatar.ts', 'src/desert/celebration-avatar.ts', 'tests/helpers/uploaded-avatar.ts'];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, sha(readFileSync(path))]));
const poses = process.env.QA_REST_ONLY === '1' ? [{ name: 'rest', time: 0, heading: 0 }] : [
  { name: 'walking', time: .37, heading: .3, speed: 5.4, distance: .37 },
  { name: 'build-high', time: 1, heading: 0 },
  { name: 'build-strike', time: 1.6, heading: 0 },
  { name: 'celebration', time: 2.4, heading: 0 },
];
const allMetrics = [];
const selectedCast = process.env.QA_KIND ? UPLOADED_CAST.filter(kind => kind === process.env.QA_KIND) : UPLOADED_CAST;
assert.ok(selectedCast.length > 0, 'Selected QA cast exists');

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const length = bytes.readUInt32LE(12), binHeader = 20 + length;
  return { json: JSON.parse(bytes.subarray(20, binHeader)), binary: bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader)) };
}
function imageHashes(json, binary) {
  return json.images.map(image => {
    const view = json.bufferViews[image.bufferView];
    return { name: image.name, mimeType: image.mimeType, bytes: view.byteLength, sha256: sha(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)) };
  });
}
function saveGlb(path, json, parts, length) {
  json.buffers = [{ byteLength: length }];
  let jc = Buffer.from(JSON.stringify(json));
  jc = Buffer.concat([jc, Buffer.alloc((4 - jc.length % 4) % 4, 32)]);
  let bin = Buffer.concat(parts); bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jc.length + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jc.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jh, jc, bh, bin]));
}
function bakedGeometry(mesh) {
  const geometry = mesh.geometry.clone(), position = geometry.getAttribute('position'), point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
    assert.ok(point.toArray().every(Number.isFinite), `${mesh.name}: finite vertex ${i}`);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

for (const kind of selectedCast) {
  const bytes = readFileSync(new URL(`../../../public/avatars/cast-v1/${kind}.glb`, import.meta.url));
  const original = parseGlb(bytes), expectedImages = imageHashes(original.json, original.binary);
  assert.equal(original.json.meshes.length, 1, `${kind}: explicit single source body`);
  assert.equal(original.json.meshes[0].primitives.length, 1, `${kind}: explicit single source primitive`);
  for (const pose of poses) {
    const avatar = createClubAvatar(kind, `festival:${kind}`, { mode: 'desert', template: await uploadedTemplate(kind) });
    avatar.root.scale.setScalar(2); avatar.root.rotation.y = pose.heading;
    avatar.update(0, 'dance', false, 0);
    const builder = createFestivalBuilderAvatar(avatar), celebration = createFestivalCelebrationAvatar(avatar, kind);
    const baselineBoneScales = new Map(); avatar.root.traverse(node => { if (node instanceof THREE.Bone) baselineBoneScales.set(node.name, node.scale.toArray()); });
    if (pose.name === 'walking') {
      const { distance, heading, speed } = pose;
      avatar.update(pose.time, 'dance', false, 0, { slot: 0, x: 0, z: 0, heading, speed, distance, walkBlend: 1, action: 'dance', sampleAtDistance: sample => ({ x: Math.sin(heading) * (sample - distance), z: Math.cos(heading) * (sample - distance), heading }) });
    } else {
      avatar.update(pose.time, 'dance', false, 0);
      if (pose.name.startsWith('build')) builder.update(pose.time);
      else if (pose.name === 'celebration') celebration.update(pose.time, false, 1);
    }
    avatar.root.updateMatrixWorld(true); avatar.root.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.update(); });
    const visible = []; avatar.root.traverseVisible(node => { if (node instanceof THREE.Mesh) visible.push(node); });
    const bodies = visible.filter(node => node instanceof THREE.SkinnedMesh);
    assert.equal(bodies.length, 1, `${kind}: one actual skinned body`);
    const props = visible.filter(node => !(node instanceof THREE.SkinnedMesh));
    const hammer = avatar.root.getObjectByName('festival-builder-hammer');
    if (pose.name.startsWith('build')) {
      assert.equal(hammer?.parent?.name, 'hand_R');
      for (const suffix of ['handle', 'grip', 'head']) assert.ok(props.some(mesh => mesh.name === `festival-builder-hammer-${suffix}`), `${kind}: exported ${suffix}`);
    } else assert.equal(hammer, undefined);
    let maxBoneScaleDelta = 0;
    avatar.root.traverse(node => { if (node instanceof THREE.Bone) node.scale.toArray().forEach((v, i) => { maxBoneScaleDelta = Math.max(maxBoneScaleDelta, Math.abs(v - baselineBoneScales.get(node.name)[i])); }); });
    assert.ok(maxBoneScaleDelta < 1e-12, `${kind}: no bone stretching`);
    assert.deepEqual(avatar.root.scale.toArray(), [2, 2, 2]);

    const json = structuredClone(original.json), parts = [original.binary]; let length = original.binary.length;
    const append = (attribute, target = 34962) => {
      const data = Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength), pad = (4 - length % 4) % 4;
      if (pad) { parts.push(Buffer.alloc(pad)); length += pad; }
      const view = json.bufferViews.length; json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target }); parts.push(data); length += data.length;
      const componentType = attribute.array instanceof Float32Array ? 5126 : attribute.array instanceof Uint32Array ? 5125 : attribute.array instanceof Uint16Array ? 5123 : attribute.array instanceof Uint8Array ? 5121 : null;
      assert.ok(componentType, `unsupported attribute ${attribute.array.constructor.name}`);
      const min = Array(attribute.itemSize).fill(Infinity), max = Array(attribute.itemSize).fill(-Infinity);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) { const v = attribute.getComponent(i, c); min[c] = Math.min(min[c], v); max[c] = Math.max(max[c], v); }
      const accessor = json.accessors.length;
      json.accessors.push({ bufferView: view, componentType, count: attribute.count, type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][attribute.itemSize - 1], min, max }); return accessor;
    };
    json.nodes = []; json.meshes = []; json.scenes = [{ nodes: [] }]; json.scene = 0; delete json.skins; delete json.animations;
    const allBounds = new THREE.Box3(), bodyBounds = new THREE.Box3(), meshMetrics = [];
    for (const mesh of visible) {
      const geometry = bakedGeometry(mesh); allBounds.union(geometry.boundingBox);
      let primitive;
      if (mesh instanceof THREE.SkinnedMesh) {
        bodyBounds.union(geometry.boundingBox); primitive = structuredClone(original.json.meshes[0].primitives[0]);
        assert.equal(geometry.attributes.position.count, original.json.accessors[primitive.attributes.POSITION].count);
        primitive.attributes.POSITION = append(geometry.attributes.position); primitive.attributes.NORMAL = append(geometry.attributes.normal);
        delete primitive.attributes.JOINTS_0; delete primitive.attributes.WEIGHTS_0; delete primitive.attributes.TANGENT;
      } else {
        assert.ok(!Array.isArray(mesh.material), `${mesh.name}: single procedural material`);
        const material = mesh.material, materialIndex = json.materials.length;
        const gltfMaterial = { name: mesh.name + '-material', pbrMetallicRoughness: { baseColorFactor: [...material.color.toArray(), material.opacity], metallicFactor: material.metalness ?? 0, roughnessFactor: material.roughness ?? 1 }, doubleSided: material.side === THREE.DoubleSide };
        if (material.transparent) gltfMaterial.alphaMode = 'BLEND';
        if (material instanceof THREE.MeshBasicMaterial) { gltfMaterial.extensions = { KHR_materials_unlit: {} }; json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_materials_unlit'])]; }
        json.materials.push(gltfMaterial);
        primitive = { attributes: { POSITION: append(geometry.attributes.position), NORMAL: append(geometry.attributes.normal) }, material: materialIndex, mode: 4 };
        if (geometry.index) primitive.indices = append(geometry.index, 34963);
      }
      const index = json.meshes.length; json.meshes.push({ name: mesh.name, primitives: [primitive] }); json.nodes.push({ name: mesh.name, mesh: index }); json.scenes[0].nodes.push(index);
      meshMetrics.push({ name: mesh.name, skinned: mesh instanceof THREE.SkinnedMesh, vertices: geometry.attributes.position.count, triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3, min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() });
      geometry.dispose();
    }
    const file = `${kind}-${pose.name}.glb`;
    json.asset.extras = { ...json.asset.extras, offlineQa: 'Three.js getVertexPosition actual runtime world-space skin plus all visible procedural props', rootScale: 2, kind, pose, sourceSha256: sha(bytes), textureBytesPreserved: true, sourceHashes };
    saveGlb(resolve(output, file), json, parts, length);
    const exportedBytes = readFileSync(resolve(output, file)), exported = parseGlb(exportedBytes);
    assert.deepEqual(imageHashes(exported.json, exported.binary), expectedImages, `${file}: exact embedded image bytes`);
    assert.ok(exported.binary.subarray(0, original.binary.length).equals(original.binary), `${file}: original binary intact`);
    const point = name => avatar.root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray();
    allMetrics.push({ kind, pose: pose.name, time: pose.time, heading: pose.heading, speed: pose.speed, distance: pose.distance, file, rootScale: 2, authoredHeight: avatar.height, sceneRestHeight: avatar.height * 2, sourceSha256: sha(bytes), exportedSha256: sha(exportedBytes), imageHashes: expectedImages, imageBytesIdentical: true, boneScaleMaxDelta: maxBoneScaleDelta, bodyBounds: { min: bodyBounds.min.toArray(), max: bodyBounds.max.toArray() }, allBounds: { min: allBounds.min.toArray(), max: allBounds.max.toArray() }, handR: point('hand_R'), handL: point('hand_L'), hammerHead: point('festival-builder-hammer-head'), celebrationLift: celebration.lift, meshes: meshMetrics });
    celebration.dispose(); builder.dispose(); avatar.dispose();
    console.log(`BAKED ${file}: ${visible.length} meshes, 3 preserved texture images`);
  }
}
assert.equal(allMetrics.length, selectedCast.length * poses.length);
writeFileSync(resolve(output, 'runtime-pose-metrics.json'), JSON.stringify({ rootScale: 2, sourceHashes, poses, cast: selectedCast, snapshots: allMetrics }, null, 2));
console.log(`Verified and baked ${allMetrics.length} snapshots to ${output}`);
