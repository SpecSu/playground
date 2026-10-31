import {tileAppearance} from './terrain-appearance.ts';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Tile} from './model.ts';
import {WATER_BOWL,REST_MAT} from './farm-landmarks.ts';
import {batchScenery,makeTerrainAccents} from './scenery-art.ts';

function disposeGroup(root:THREE.Group){
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.clear();
}
/** Matches scenery batching; cultivation uses ordinary untextured standard materials. */
function materialKey(m:THREE.MeshStandardMaterial){return [m.type,m.color?.getHex(),m.roughness,m.metalness,m.side,m.transparent,m.opacity,m.map?.uuid??'',m.vertexColors,m.userData.environmentRole??''].join('|');}
type Entry={stamp:string;root:THREE.Group};
/** Per-World CPU cache. Only the globally merged output enters the scene. */
export class TerrainAccentCache{
 readonly root:THREE.Group;
 private entries=new Map<string,Entry>();
 private disposed=false;
 private preview:boolean;
 constructor(root=new THREE.Group(),preview=false){this.root=root;this.preview=preview;}
 get size(){return this.entries.size;}
 /** Returns regenerated tile count, not batch count; unchanged tiles retain their buffers. */
 update(tiles:readonly Tile[]):number{
  if(this.disposed)return 0;
  const active=new Set<string>();let changed=false,regenerated=0;
  for(const tile of tiles){
   if(!tile.owned||(tile.level??1)<2)continue;
   const id=`${tile.x},${tile.z}`;active.add(id);
   // Creek corner exclusions depend on the same orthogonal/diagonal neighbors as creekPaths.
   const neighbors=tile.terrain==='creek'?tiles.filter(t=>Math.abs(t.x-tile.x)<=1&&Math.abs(t.z-tile.z)<=1).map(t=>`${t.x},${t.z},${t.terrain}`).join(';'):'';
   const stamp=[tile.terrain,tile.owned,tile.level,tileAppearance(tile),neighbors,WATER_BOWL.x,WATER_BOWL.z,REST_MAT.x,REST_MAT.z].join('|');
   const old=this.entries.get(id);if(old?.stamp===stamp)continue;
   const root=batchScenery(makeTerrainAccents(tile,tiles,this.preview));root.updateMatrixWorld(true);
   // Cache absolute-space geometry once. mergeGeometries only reads these arrays.
   root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.applyMatrix4(o.matrixWorld);o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);}});root.position.set(0,0,0);root.updateMatrixWorld(true);
   if(old)disposeGroup(old.root);this.entries.set(id,{stamp,root});regenerated++;changed=true;
  }
  // The cache is bounded by this World's active tiles, not historical map configurations.
  for(const [id,entry]of this.entries)if(!active.has(id)){disposeGroup(entry.root);this.entries.delete(id);changed=true;}
  if(!changed)return 0;
  const batches=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];shadow:boolean}>();
  for(const tile of tiles){const entry=this.entries.get(`${tile.x},${tile.z}`);if(!entry)continue;for(const object of entry.root.children){
   const mesh=object as THREE.Mesh,material=mesh.material as THREE.MeshStandardMaterial,key=materialKey(material);let batch=batches.get(key);
   if(!batch){batch={material:material.clone(),geometries:[],shadow:false};batches.set(key,batch);}batch.geometries.push(mesh.geometry);batch.shadow ||= mesh.castShadow;
  }}
  const next=new THREE.Group();
  for(const batch of batches.values()){
   const geometry=mergeGeometries(batch.geometries,false);if(!geometry){batch.material.dispose();continue;}
   const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=batch.shadow;mesh.receiveShadow=true;next.add(mesh);
  }
  // Output geometry and materials are independently owned; replacing it cannot free a cache entry.
  disposeGroup(this.root);for(const child of [...next.children])this.root.add(child);return regenerated;
 }
 dispose(){if(this.disposed)return;this.disposed=true;disposeGroup(this.root);for(const entry of this.entries.values())disposeGroup(entry.root);this.entries.clear();}
}
