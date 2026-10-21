import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFishingCatchSurface} from '../lib/fishing-surface-contact.ts';
import {createMarineModel} from '../components/fishing/MarineModels.ts';

test('bilateral contact acceleration retains exact main-body/wing distances',()=>{
 for(const species of ['clownfish','pufferfish','tuna','manta-ray']){
  const fish=createMarineModel(species,90);fish.rotation.set(.4,-.3,.2);fish.scale.setScalar(.72);
  const surface=createFishingCatchSurface(fish),triangles=[],point=new THREE.Vector3(),nearest=new THREE.Vector3();
  fish.traverse(mesh=>{if(!mesh.isMesh||!/body|mantle|wing-(?:top|belly)/.test(mesh.name))return;const p=mesh.geometry.attributes.position,i=mesh.geometry.index;for(let n=0;n<(i?.count??p.count);n+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i?i.getX(n+k):n+k).applyMatrix4(mesh.matrixWorld))));});
  for(let n=0;n<48;n++){
   point.set(Math.sin(n*1.73)*2,Math.cos(n*.91)*2,Math.sin(n*.37)*2);let expected=Infinity;
   for(const t of triangles){t.closestPointToPoint(point,nearest);expected=Math.min(expected,point.distanceTo(nearest));}
   assert.ok(Math.abs(surface.supportDistance(point)-expected)<1e-9,`${species}/${n}: exact distance survives pruning`);
  }
 }
});
