/** Export the real Three.js adapter pose for offline inspection, without a browser. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createClubAvatar } from '../../lib/club-avatar-rig.ts';

// GLTFExporter uses FileReader to package binary buffers; no network/image API is used.
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((buffer) => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
};
const repo = resolve(import.meta.dirname, '../..');
const output = resolve(repo, '../avatar-offline-previews');
mkdirSync(output, { recursive: true });
async function avatar(kind, id, beat, action = 'dance', mode = 'dance') {
  const bytes = readFileSync(resolve(repo, `public/avatars/${kind}.glb`));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const result = createClubAvatar(kind, id, { template: scene, mode });
  result.update(beat, action, false, .92);
  return result;
}
async function save(scene, name) {
  scene.updateMatrixWorld(true);
  const data = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, trs: true });
  writeFileSync(resolve(output, `${name}.glb`), Buffer.from(data));
  console.log(`EXPORTED ${name}: ${data.byteLength} bytes`);
}
const cast = new Scene();
const list = ['human-jiji','human-subeike','human-lx','cat','frog','dog','capybara','panda','monster-blob','monster-tower','monster-star'];
for (let i = 0; i < list.length; i++) {
  const kind = list[i];
  const figure = await avatar(kind, `preview:${kind}`, 1.28 + (i % 2) * .24, i % 4 === 2 ? 'wave' : 'dance');
  figure.root.position.set((i % 6 - 2.5) * 1.4, 0, i >= 6 ? -2.0 : .15);
  figure.root.rotation.y = -.06;
  cast.add(figure.root);
}
await save(cast, 'cast-posed');
const strip = new Scene();
for (let i = 0; i < 4; i++) {
  const figure = await avatar('human-jiji', 'jiji-qa', [0,.4,1.2,2.35][i], ['dance','bounce','wave','spin'][i]);
  figure.root.position.set((i - 1.5) * 1.55, 0, 0);
  if (i === 3) figure.root.rotation.y = -2.35 * Math.PI * 2 / 8 + .22;
  strip.add(figure.root);
}
await save(strip, 'jiji-four-actions');
const dj = new Scene();
for (let i = 0; i < 3; i++) {
  const figure = await avatar('capybara', 'house-dj', i * .45, 'dance', 'dj');
  figure.root.position.set((i - 1) * 1.6, 0, 0);
  dj.add(figure.root);
}
await save(dj, 'dj-mixing-poses');
