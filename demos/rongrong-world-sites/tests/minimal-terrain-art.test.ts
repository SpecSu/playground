import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {batchScenery,creekDistance,creekPaths,creekSurface,makeTerrain,terrainSurfaceHeight} from '../src/minimal/scenery-art.ts';
import {createMinimalState,type Tile} from '../src/minimal/model.ts';
const creek=(x:number,z:number):Tile=>({x,z,terrain:'creek',owned:true});
test('horizontal and vertical creek crossings share exact widths and heights',()=>{
 for(const [dx,dz] of [[1,0],[0,1]]){const a=creek(0,0),b=creek(dx,dz),tiles=[a,b],pa=creekPaths(a,tiles),pb=creekPaths(b,tiles);
  for(let i=-10;i<=10;i++){const along=i/10,ax=dx?1:along,az=dz?1:along,bx=dx?-1:along,bz=dz?-1:along;assert.ok(Math.abs(creekDistance(ax,az,pa)-creekDistance(bx,bz,pb))<1e-10);assert.equal(terrainSurfaceHeight(a,ax,az,tiles),terrainSurfaceHeight(b,bx,bz,tiles));}
 }
});
test('creek junction surface stays in its tile with upward normals and a gentle floor',()=>{
 const center=creek(0,0),tiles=[center,creek(1,0),creek(-1,0),creek(0,-1)],paths=creekPaths(center,tiles);assert.equal(paths.length,3);
 const geometry=creekSurface(paths,.275,.009),pos=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');assert.ok(pos.count>0);
 for(let i=0;i<pos.count;i++){assert.ok(Math.abs(pos.getX(i))<=1);assert.ok(Math.abs(pos.getZ(i))<=1);assert.ok(Math.abs(pos.getY(i)-.009)<1e-8);assert.ok(normals.getY(i)>.99);}
 geometry.dispose();
});
test('owned pasture has a truly flat y=0 top and no rounded tile trench',()=>{
 const tile:Tile={x:0,z:0,terrain:'meadow',owned:true},{hit,root}=makeTerrain(tile);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(hit);assert.ok(Math.abs(box.min.y)<1e-10);assert.ok(Math.abs(box.max.y)<1e-10);assert.equal(box.max.x-box.min.x,2);assert.equal(terrainSurfaceHeight(tile,0,0),0);
 const hill:Tile={...tile,terrain:'hill'};assert.equal(terrainSurfaceHeight(hill,0,0),0);assert.ok(Math.abs(terrainSurfaceHeight(hill,.65,-.69)-.075)<1e-10);
});
test('batching retains environment roles and the entire 100-cell landscape uses under 90 draw meshes',()=>{
 const state=createMinimalState(0),root=new THREE.Group();for(const tile of state.tiles)root.add(makeTerrain(tile,state.tiles).root);batchScenery(root);let count=0;const roles=new Set<string>();root.traverse(o=>{if(o instanceof THREE.Mesh){count++;const material=o.material as THREE.Material;roles.add(material.userData.environmentRole);}});assert.ok(count<90,`terrain draw count ${count}`);assert.ok(roles.has('water'));assert.ok(roles.has('grass'));assert.ok(roles.has('bank'));
});
test('wide connected creek reaches fill their shared interior instead of leaving ladder-shaped islands',()=>{
 const tiles=[creek(0,0),creek(1,0),creek(0,1),creek(1,1)];
 for(const t of tiles){const paths=creekPaths(t,tiles);const x=t.x?-.8:.8,z=t.z?-.8:.8;assert.ok(creekDistance(x,z,paths)<.17);}
 const state=createMinimalState(0);for(const t of state.tiles.filter(t=>t.terrain==='creek'))for(const [dx,dz] of [[1,0],[0,1]]){const adjacent=state.tiles.find(n=>n.x===t.x+dx&&n.z===t.z+dz&&n.terrain==='creek');if(!adjacent)continue;for(let i=-20;i<=20;i++){const v=i/20;assert.equal(terrainSurfaceHeight(t,dx?1:v,dz?1:v,state.tiles),terrainSurfaceHeight(adjacent,dx?-1:v,dz?-1:v,state.tiles));}}
});
