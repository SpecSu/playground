import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDesertEnvironment } from '../src/desert/environment.ts';
test('offline environment keeps merged camps and radial paths, monument, ground and bounded scene',()=>{
 const world=createDesertEnvironment();world.root.updateMatrixWorld(true);
 const group=world.root.getObjectByName('desert-static')!;
 let meshes=0,vertices=0;group.traverse(n=>{if(n instanceof THREE.Mesh){meshes++;vertices+=n.geometry.getAttribute('position').count;}});
 assert.ok(meshes>=6&&meshes<15,`static draws ${meshes}`);assert.ok(vertices>16000,`static vertices ${vertices}`);
 const bounds=new THREE.Box3().setFromObject(world.monument,true);assert.ok(bounds.max.y>25);assert.ok(bounds.min.y>=-0.00001);
 assert.equal(world.ground.name,'walkable-desert');world.update(1);world.dispose();world.dispose();
});
