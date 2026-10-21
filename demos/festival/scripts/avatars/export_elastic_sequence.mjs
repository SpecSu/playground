/** Sample real runtime animation into an offline GLB clip + baked contact sheet.
 * node --experimental-strip-types scripts/avatars/export_elastic_sequence.mjs
 * Never starts a browser, plays audio, or edits shipping assets.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createClubAvatar } from '../../lib/club-avatar-rig.ts';

globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((buffer) => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
};
const repo = resolve(import.meta.dirname, '../..');
const output = resolve(repo, '../avatar-offline-previews/elastic-motion');
mkdirSync(output, { recursive: true });
const kinds = ['human-jiji', 'human-subeike', 'human-lx', 'frog', 'capybara', 'panda', 'monster-blob', 'dj-cockatoo'];
const timeline = new THREE.Scene(), sheet = new THREE.Scene();
const tracks = [], metrics = [];
const point = new THREE.Vector3();
for (let index = 0; index < kinds.length; index++) {
  const kind = kinds[index];
  const bytes = readFileSync(resolve(repo, `public/avatars/${kind}.glb`));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const figure = createClubAvatar(kind, `elastic-sequence:${kind}`, { template: scene, mode: kind === 'dj-cockatoo' ? 'dj' : 'dance' });
  figure.root.position.x = (index - (kinds.length - 1) / 2) * 2.2;
  timeline.add(figure.root);
  const nodes = [];
  figure.root.traverse((node) => { if (node instanceof THREE.Bone || node.name === 'avatar-animation-pivot') nodes.push(node); });
  const samples = new Map(nodes.map((node) => [node, { p: [], q: [], s: [] }]));
  const times = [];
  let radius = 0, floor = Infinity, peak = 0;
  for (let frame = 0; frame <= 120; frame++) {
    const beat = frame / 30;
    times.push(frame / 60);
    figure.update(beat, 'dance', false, 1);
    for (const [node, sample] of samples) {
      sample.p.push(...node.position.toArray()); sample.q.push(...node.quaternion.toArray()); sample.s.push(...node.scale.toArray());
    }
    figure.root.traverseVisible((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let vertex = 0; vertex < node.geometry.attributes.position.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        radius = Math.max(radius, Math.hypot(point.x - figure.root.position.x, point.z));
        floor = Math.min(floor, point.y); peak = Math.max(peak, point.y);
      }
    });
  }
  for (const [node, sample] of samples) {
    tracks.push(new THREE.VectorKeyframeTrack(`${node.uuid}.position`, times, sample.p));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, sample.q));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.uuid}.scale`, times, sample.s));
  }
  metrics.push({ kind, sampledFrames: times.length, minY: floor, maxY: peak, maxRadius: radius });
  // Bake the exact deformed surface, so still review does not depend on another
  // application's armature import conventions or animation interpolation.
  for (let frame = 0; frame < 8; frame++) {
    figure.update(frame / 8, 'dance', false, 1);
    const wrapper = new THREE.Group();
    wrapper.name = `${kind}-beat-${frame / 8}`;
    wrapper.position.set((frame - 3.5) * 2.1, 0, (index - 1.5) * -3.2);
    sheet.add(wrapper);
    figure.root.traverseVisible((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.clone();
      const positions = geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        node.getVertexPosition(vertex, point).applyMatrix4(node.matrixWorld);
        positions.setXYZ(vertex, point.x - figure.root.position.x, point.y, point.z);
      }
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, node.material);
      mesh.name = `${wrapper.name}-${node.name}`;
      wrapper.add(mesh);
    });
  }
  figure.update(0, 'dance', true, 1);
}
const clip = new THREE.AnimationClip('Elastic dance — four beats at 120 BPM', 2, tracks);
for (const [name, scene, animations] of [['elastic-dance-clip', timeline, [clip]], ['elastic-dance-contact-sheet', sheet, []]]) {
  scene.updateMatrixWorld(true);
  const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true, onlyVisible: true, animations });
  writeFileSync(resolve(output, `${name}.glb`), Buffer.from(bytes));
  console.log(`${name}: ${bytes.byteLength} bytes`);
}
writeFileSync(resolve(output, 'elastic-dance-metrics.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
