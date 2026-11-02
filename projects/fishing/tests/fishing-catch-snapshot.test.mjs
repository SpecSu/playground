import './room-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {FISHING_AVATAR_CATALOG}from'../lib/fishing-avatar-catalog.ts';
import {uploadedAvatar}from'./helpers/uploaded-avatar.mjs';import{createFishingAvatar}from'../lib/fishing-avatar.ts';import{createFishingMeshTriangleReader}from'./helpers/fishing-triangle-clearance.mjs';import{createMarineModel}from'../components/fishing/MarineModels.ts';import{createFishingCatchSurface}from'../lib/fishing-surface-contact.ts';
const snapshots=await import('../lib/fishing-catch-snapshot.ts').catch(()=>({}));
function drain(g){let r;do{r=g.next();}while(!r.done);return r.value;}
test('a frozen typed geometry snapshot exactly reproduces real posed GLB triangles after avatar mutation',async()=>{
 assert.equal(typeof snapshots.captureFishingMeshSnapshot,'function');
 for(const {id} of FISHING_AVATAR_CATALOG){
  const avatar=createFishingAvatar(id,'snapshot',{template:await uploadedAvatar(id)});avatar.updateFishing(3,'holding',true,1);
  const expected=createFishingMeshTriangleReader(avatar.root,{relativeTo:avatar.root})().map(t=>[...t.a.toArray(),...t.b.toArray(),...t.c.toArray()]);
  const data=structuredClone(snapshots.captureFishingMeshSnapshot(avatar.root,'avatar'));
  avatar.updateFishing(7,'waiting',false,1);
  const actual=drain(snapshots.expandFishingMeshSnapshot(data));assert.equal(actual.triangles.length,expected.length);
  for(let i=0;i<expected.length;i++)assert.deepEqual([...actual.triangles[i].a.toArray(),...actual.triangles[i].b.toArray(),...actual.triangles[i].c.toArray()],expected[i],`${id}/${i}`);
  avatar.dispose();
 }
});
test('catch snapshots preserve authored scale, yaw, support triangles and exact bounds',()=>{
 assert.equal(typeof snapshots.captureFishingMeshSnapshot,'function');
 for(const species of ['clownfish','pufferfish','tuna','manta-ray']){
  const fish=createMarineModel(species,160);fish.scale.setScalar(1.37);fish.rotation.y=1.1;fish.position.set(9,8,7);
  const expected=createFishingCatchSurface(fish),bounds=snapshots.measureFishingCatchBounds(fish),actual=drain(snapshots.expandFishingMeshSnapshot(snapshots.captureFishingMeshSnapshot(fish,'catch')));
  assert.deepEqual(bounds,expected.bounds);assert.deepEqual(actual.bounds,expected.bounds);assert.equal(actual.triangles.length,expected.triangles.length);
  for(let i=0;i<expected.points.length;i++)assert.deepEqual(actual.points[i],expected.points[i]);
 }
});
