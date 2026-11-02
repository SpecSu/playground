/** Bake actual runtime backflip skin for offline review; never opens a browser/audio.
 * node --experimental-strip-types scripts/avatars/export_backflip.mjs [output-dir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createClubAvatar } from '../../lib/club-avatar-rig.ts';
import { AVATAR_PRESETS } from '../../lib/room-types.ts';

globalThis.FileReader = class {
  result = null; onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const output = resolve(process.argv[2] ?? '../avatar-offline-previews/backflip');
mkdirSync(output, { recursive: true });
const sheet = new THREE.Scene(), point = new THREE.Vector3();
const metrics = [], core = new Set(['hips', 'spine', 'chest', 'neck', 'head']);
const kinds = AVATAR_PRESETS.filter(kind => kind !== 'monster-blob');
const samplesMs = [0, 200, 400, 600, 740, 880, 1100, 1300, 1480, 1600, 1800];
for (const [row, kind] of kinds.entries()) {
  const bytes = readFileSync(resolve('public/avatars', `${kind}.glb`));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const avatar = createClubAvatar(kind, `backflip-review:${kind}`, { template: scene });
  const masks = new Map();
  avatar.root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const indices = node.geometry.attributes.skinIndex, weights = node.geometry.attributes.skinWeight;
    masks.set(node, Array.from({ length: indices.count }, (_, vertex) => {
      let weight = 0;
      for (let channel = 0; channel < 4; channel++) if (core.has(node.skeleton.bones[indices.getComponent(vertex, channel)]?.name)) weight += weights.getComponent(vertex, channel);
      return weight >= .5;
    }));
  });
  let minY = Infinity, maxY = -Infinity, maxRadius = 0, coreRadius = 0;
  let maxGroundLift = 0, maxLandingImpact = 0;
  // Sample the entire six-second command, including both completed flips and
  // the quiet tail, using the same 500ms elapsed-action beat as the scene.
  for (let frame = 0; frame <= 192; frame++) {
    avatar.update(frame * 6000 / 192 / 500, 'wave', false, 1);
    maxGroundLift = Math.max(maxGroundLift, avatar.groundLift);
    maxLandingImpact = Math.max(maxLandingImpact, avatar.landingImpact);
    avatar.root.traverseVisible(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
        const radius = Math.hypot(point.x, point.z);
        maxRadius = Math.max(maxRadius, radius);
        if (masks.get(node)?.[vertex]) coreRadius = Math.max(coreRadius, radius);
      }
    });
  }
  metrics.push({ kind, height: avatar.height, minY, maxY, maxRadius, coreRadius, maxGroundLift, maxLandingImpact });
  for (const [frame, elapsedMs] of samplesMs.entries()) {
    avatar.update(elapsedMs / 500, 'wave', false, 1);
    const wrapper = new THREE.Group(); wrapper.name = `${kind}-backflip-${frame}`;
    wrapper.position.set((frame - (samplesMs.length - 1) / 2) * 2.25, 0, -row * 3.5); sheet.add(wrapper);
    wrapper.userData.elapsedMs = elapsedMs;
    avatar.root.traverseVisible(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.clone(), positions = geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        positions.setXYZ(vertex, point.x, point.y, point.z);
      }
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight'); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone());
      mesh.name = `${wrapper.name}-${node.name}`; wrapper.add(mesh);
    });
  }
  avatar.dispose();
}
sheet.updateMatrixWorld(true);
const bytes = await new GLTFExporter().parseAsync(sheet, { binary: true, onlyVisible: true });
writeFileSync(resolve(output, 'backflip-poses.glb'), Buffer.from(bytes));
writeFileSync(resolve(output, 'backflip-metrics.json'), JSON.stringify({ samplesMs, metrics }, null, 2));
console.log(JSON.stringify({ output, bytes: bytes.byteLength, samplesMs, metrics }, null, 2));
