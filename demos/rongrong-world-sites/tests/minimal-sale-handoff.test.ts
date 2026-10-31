import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SaleHandoff} from '../src/minimal/sale-feedback.ts';
import type {FarmAnimalArt} from '../src/minimal/animal-art.ts';
function setup(reduced=false){const root=new THREE.Group(),scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial({opacity:.8}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(mesh);scene.add(root);let disposed=0;const art={root,dispose(){disposed++;}} as unknown as FarmAnimalArt;const effect=new SaleHandoff(art,0,reduced);return {root,material,mesh,effect,get disposed(){return disposed;}};}
test('handoff fades only private material copies and handles a late GLB attachment exactly once',()=>{
 const f=setup();const late=new THREE.Mesh(new THREE.BoxGeometry(),f.material);f.root.add(late);f.effect.update(600);
 assert.equal(f.material.opacity,.8);assert.notEqual(f.mesh.material,f.material);assert.notEqual(late.material,f.material);assert.ok((late.material as THREE.Material).opacity<.8);
 f.effect.update(850);assert.equal(f.mesh.material,f.material);assert.equal(late.material,f.material);assert.equal(f.disposed,1);f.effect.dispose();f.effect.update(900);assert.equal(f.disposed,1);assert.equal(f.root.parent,null);
});
test('reduced motion has no lift or scale and completes with a short fade',()=>{
 const f=setup(true),start=f.root.position.clone(),scale=f.root.scale.clone();f.effect.update(100);assert.deepEqual(f.root.position,start);assert.deepEqual(f.root.scale,scale);assert.equal(f.effect.update(180),true);assert.equal(f.disposed,1);
});

test('an asynchronously replaced loading fallback retains its original material disposal ownership',()=>{const f=setup();f.effect.dispose();const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(mesh);root.userData.animationStatus='loading';const effect=new SaleHandoff({root,dispose(){}} as unknown as FarmAnimalArt,0,false);effect.update(300);assert.equal(mesh.material,material);effect.dispose();});
