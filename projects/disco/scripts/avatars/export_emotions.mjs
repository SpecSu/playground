/** Bake actual accepted emotion poses for offline visual inspection. No browser/audio.
 * node --experimental-strip-types scripts/avatars/export_emotions.mjs [output-dir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createClubAvatar } from '../../lib/club-avatar-rig.ts';
import { EMOTION_ACTIONS } from '../../lib/club-emotion-motion.ts';

globalThis.FileReader = class {
  result = null; onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const output = resolve(process.argv[2] ?? '../avatar-offline-previews/emotions');
mkdirSync(output, { recursive: true });
const sheet = new THREE.Scene(), point = new THREE.Vector3();
const kinds = ['human-subeike', 'capybara', 'sword-shield-dog', 'banana-cat', 'monster-tower'];
const samplesMs = [0, 600, 870, 920, 1120, 1620, 1820, 5750];
for (const kind of kinds) {
  const bytes = readFileSync(resolve('public/avatars', `${kind}.glb`));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const avatar = createClubAvatar(kind, `emotion-review:${kind}`, { template: scene });
  for (const action of EMOTION_ACTIONS) for (const [frame, elapsedMs] of samplesMs.entries()) {
    avatar.update(elapsedMs / 500, action, false, 1);
    const wrapper = new THREE.Group(); wrapper.name = `${kind}-emotion-${action}-${frame}`;
    wrapper.position.set((frame - (samplesMs.length - 1) / 2) * 2.1, 0, 0); sheet.add(wrapper);
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
writeFileSync(resolve(output, 'emotion-poses.glb'), Buffer.from(bytes));
writeFileSync(resolve(output, 'emotion-preview.json'), JSON.stringify({ kinds, actions: EMOTION_ACTIONS, samplesMs, description: 'Actual Three.js runtime skinned poses. No browser or audio QA.' }, null, 2));
console.log(JSON.stringify({ output, bytes: bytes.byteLength, samplesMs }, null, 2));
