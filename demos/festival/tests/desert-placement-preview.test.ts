import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

const loadPreview = async () => {
 const previewModule = await import('../src/desert/placement-preview.ts').catch(() => null);
 assert.ok(previewModule, 'a dedicated high-contrast placement preview exists');
 return previewModule;
};

test('placement perimeter is thick, opaque, saturated and outlined against sand', async () => {
 const { createPlacementPreview } = await loadPreview();
 const preview = createPlacementPreview();
 const ring = preview.root.getObjectByName('placement-ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
 const outline = preview.root.getObjectByName('placement-outline') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
 const fill = preview.root.getObjectByName('placement-fill') as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
 assert.ok(ring.geometry.parameters.outerRadius - ring.geometry.parameters.innerRadius >= .12);
 assert.equal(ring.material.opacity, 1);
 assert.equal(outline.material.opacity, 1);
 assert.ok(outline.geometry.parameters.innerRadius < ring.geometry.parameters.innerRadius);
 assert.ok(outline.geometry.parameters.outerRadius > ring.geometry.parameters.outerRadius);
 assert.ok(outline.material.color.getHSL({h:0,s:0,l:0}).l < .1);
 assert.ok(fill.material.opacity > 0 && fill.material.opacity <= .16);
 for (const valid of [false, true, false]) {
  preview.setValid(valid);
  assert.equal(ring.material.color.getHex(), valid ? 0x00ee55 : 0xff202b);
  assert.equal(fill.material.color.getHex(), ring.material.color.getHex());
 }
 preview.dispose();
});

test('placement overlay stays visible over obstacles without lighting, fog or depth fading', async () => {
 const { createPlacementPreview } = await loadPreview();
 const preview = createPlacementPreview();
 const meshes = preview.root.children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
 assert.equal(meshes.length, 3);
 for (const mesh of meshes) {
  assert.equal(mesh.material.depthTest, false);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.toneMapped, false);
  assert.equal(mesh.material.fog, false);
  assert.equal(mesh.material.transparent, true, 'overlay draws after opaque scene objects');
  assert.ok(mesh.renderOrder > 10, 'overlay draws after existing transparent scene content');
 }
 assert.ok(meshes.find(m=>m.name==='placement-fill')!.renderOrder < meshes.find(m=>m.name==='placement-outline')!.renderOrder);
 assert.ok(meshes.find(m=>m.name==='placement-outline')!.renderOrder < meshes.find(m=>m.name==='placement-ring')!.renderOrder);
 const scene = new THREE.Scene(); scene.add(preview.root);
 let released=0;
 for (const mesh of meshes) {
  mesh.geometry.addEventListener('dispose',()=>released++);
  mesh.material.addEventListener('dispose',()=>released++);
 }
 preview.dispose();
 assert.equal(released, 6);
 assert.equal(preview.root.parent, null);
});
