import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import { UPLOADED_CAST, EXPECTED_HEIGHTS, uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';

const REQUIRED = ['root','hips','spine','chest','neck','head','upperArm_L','forearm_L','hand_L','upperArm_R','forearm_R','hand_R','thigh_L','shin_L','foot_L','thigh_R','shin_R','foot_R'];

test('new cast files are exact uploaded assets with original embedded materials and revised cow scale', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/avatars/cast-v1/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.models.map((row: { id: string }) => row.id), [...UPLOADED_CAST,'dj-kunkun']);
  for (const row of manifest.models) {
    const bytes = readFileSync(new URL(`../public/avatars/cast-v1/${row.id}.glb`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,`${row.id}: exact source bytes`);
    const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok(json.materials[0].pbrMetallicRoughness.baseColorTexture);
    assert.ok(json.images.length >= 3 && json.images.every((image: { bufferView: number }) => Number.isInteger(image.bufferView)));
    assert.ok(bytes.byteLength < 4_100_000, 'uploaded textured model stays below 4.1 MB');
    if (row.id === 'niulai') {
      assert.equal(json.asset.extras.heightMetres,1.5);
      assert.deepEqual(json.nodes[json.scenes[0].nodes[0]].scale,[15/11,15/11,15/11]);
    }
  }
});

for (const [index,kind] of UPLOADED_CAST.entries()) test(`${kind}: original stature, complete joints and actual blended skin`, async () => {
  const source = await uploadedTemplate(kind);
  const names = new Set<string>(); let vertices = 0, blended = 0;
  source.traverse(node => {
    if (node instanceof THREE.Bone) names.add(node.name);
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const weights = node.geometry.attributes.skinWeight;
    for (let i=0;i<weights.count;i++) {
      const w=[0,1,2,3].map(c=>weights.getComponent(i,c));
      assert.ok(w.every(Number.isFinite) && Math.abs(w.reduce((a,b)=>a+b,0)-1)<.0002);
      if(w.filter(v=>v>.01).length>1)blended++; vertices++;
    }
  });
  REQUIRED.forEach(name=>assert.ok(names.has(name),name));
  assert.ok(vertices>15_000 && blended>1000,'uploaded detailed geometry with real blending');
  const bounds=actualBounds(source);
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-EXPECTED_HEIGHTS[index])<.0001);
  assert.ok(Math.abs(bounds.min.y)<.0001);
});
