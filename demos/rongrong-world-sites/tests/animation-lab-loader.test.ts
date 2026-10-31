import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Mesh, Texture } from 'three';
import { createLabAssetLoader, validateLabAssetIndex } from '../src/animation-lab/asset-loader.ts';
import { getLabAsset, LAB_ASSETS } from '../src/animation-lab/manifest.ts';
import { labFixture } from './animation-lab-fixtures.ts';

const index = JSON.parse(readFileSync('public/models/animation-lab/asset-index.json', 'utf8'));

test('index rejects missing species, malformed digest, nonfinite or degenerate bounds and byte sizes', () => {
 validateLabAssetIndex(index);
 for (const mutate of [
  (value: typeof index) => { delete value.assets.cow; },
  (value: typeof index) => { value.assets.cow.sha256 = 'bad'; },
  (value: typeof index) => { value.assets.cow.bytes = -1; },
  (value: typeof index) => { value.assets.cow.bounds.min[0] = NaN; },
  (value: typeof index) => { value.assets.cow.bounds.max = [...value.assets.cow.bounds.min]; },
 ]) { const value = structuredClone(index); mutate(value); assert.throws(() => validateLabAssetIndex(value), /index/i); }
});

test('loader uses only fixed catalog URLs with SHA rev and returns the full clip envelope', async () => {
 const asset = getLabAsset('cow'); const fixture = labFixture(asset); const urls: string[] = [];
 const load = createLabAssetLoader({ fetchIndex: async () => index, loadGLTF: async url => { urls.push(url); return { scene: fixture.scene, animations: fixture.clips }; } });
 const loaded = await load(asset);
 assert.deepEqual(urls, [asset.url + '?rev=' + index.assets.cow.sha256]);
 assert.deepEqual(loaded.bounds.min.toArray(), index.assets.cow.bounds.min);
 assert.deepEqual(loaded.bounds.max.toArray(), index.assets.cow.bounds.max);
 await assert.rejects(load({ ...asset, url: 'https://example.com/evil.glb' }), /catalog/);
 loaded.dispose();
});

test('loader releases shared geometry, material, texture and skeleton exactly once', async () => {
 const asset = getLabAsset('cow'); const fixture = labFixture(asset); const texture = new Texture();
 fixture.mesh.material.map = texture;
 const twin = fixture.mesh.clone(false); fixture.scene.add(twin);
 const counts = { geometry: 0, material: 0, texture: 0, skeleton: 0 };
 fixture.mesh.geometry.addEventListener('dispose', () => counts.geometry++);
 fixture.mesh.material.addEventListener('dispose', () => counts.material++);
 texture.addEventListener('dispose', () => counts.texture++);
 const original = fixture.mesh.skeleton.dispose.bind(fixture.mesh.skeleton);
 fixture.mesh.skeleton.dispose = () => { counts.skeleton++; original(); };
 const load = createLabAssetLoader({ fetchIndex: async () => index, loadGLTF: async () => ({ scene: fixture.scene, animations: fixture.clips }) });
 const loaded = await load(asset); loaded.dispose(); loaded.dispose();
 assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
});

for (const fault of ['skin', 'weights', 'indices', 'clip', 'duration', 'track', 'binding', 'bounds'] as const) {
 test(`loader rejects invalid ${fault} instead of returning ready and disposes failed resources`, async () => {
  const asset = getLabAsset('cow'); const fixture = labFixture(asset); let disposed = 0;
  fixture.mesh.geometry.addEventListener('dispose', () => disposed++);
  if (fault === 'skin') { fixture.scene.remove(fixture.mesh); fixture.scene.add(new Mesh(fixture.mesh.geometry, fixture.mesh.material)); }
  if (fault === 'weights') fixture.mesh.geometry.getAttribute('skinWeight').setX(0, .2);
  if (fault === 'indices') fixture.mesh.geometry.getAttribute('skinIndex').setX(0, 999);
  if (fault === 'clip') fixture.clips.pop();
  if (fault === 'duration') fixture.clips[0].duration += 1;
  if (fault === 'track') fixture.clips[0].tracks[0].name = 'missing_bone.position';
  if (fault === 'binding') fixture.clips[0].tracks[0].name += '[999]';
  const metadata = structuredClone(index); if (fault === 'bounds') metadata.assets.cow.bounds.max = [0, 0, 0];
  const load = createLabAssetLoader({ fetchIndex: async () => metadata, loadGLTF: async () => ({ scene: fixture.scene, animations: fixture.clips }) });
  await assert.rejects(load(asset));
  if (fault !== 'bounds') assert.equal(disposed, 1);
 });
}

test('failed index fetch is retryable and successful index cache is lab-only', async () => {
 let calls = 0;
 const load = createLabAssetLoader({ fetchIndex: async () => { if (++calls === 1) throw new Error('offline'); return index; }, loadGLTF: async () => { const f = labFixture(getLabAsset('cow')); return { scene: f.scene, animations: f.clips }; } });
 await assert.rejects(load(getLabAsset('cow')), /offline/);
 (await load(getLabAsset('cow'))).dispose(); (await load(getLabAsset('cow'))).dispose();
 assert.equal(calls, 2);
});

test('runtime loader validates all 25 actual exported GLBs and full envelopes', async () => {
 const { loadLabGlb } = await import('../scripts/validate-animation-lab.ts');
 const load = createLabAssetLoader({ fetchIndex: async () => index, loadGLTF: url => loadLabGlb('public' + url.split('?')[0]) });
 for (const asset of LAB_ASSETS) { const loaded = await load(asset); assert.equal(loaded.clips.length, asset.clips.length); assert.ok(!loaded.bounds.isEmpty()); loaded.dispose(); }
});
