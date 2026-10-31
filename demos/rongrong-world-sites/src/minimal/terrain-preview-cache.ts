import {tileAppearance} from './terrain-appearance.ts';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Tile} from './model.ts';
import {makeTerrainBase,batchScenery} from './scenery-art.ts';
import {createWaterField,createTerrainWater,type WaterField} from './terrain-water.ts';
import {WATER_BOWL,REST_MAT} from './farm-landmarks.ts';
function disposeGroup(root:THREE.Group){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.clear();}
function materialKey(m:THREE.MeshStandardMaterial){return [m.type,m.color.getHex(),m.roughness,m.metalness,m.side,m.transparent,m.opacity,m.vertexColors,m.userData.environmentRole??''].join('|');}
/** Preview-only, bounded by current tiles. Cached buffers and merged output never share ownership. */
export class TerrainPreviewCache{
 readonly root:THREE.Group;private entries=new Map<string,{stamp:string;root:THREE.Group}>();private disposed=false;private generation=0;
 constructor(root=new THREE.Group()){this.root=root;}
 get size(){return this.entries.size;}
 get revision(){return this.generation;}
 update(tiles:readonly Tile[],waterField?:WaterField){
  if(this.disposed)return 0;const active=new Set<string>();let regenerated=0,changed=false;const field=waterField??createWaterField(tiles);
  for(const tile of tiles){const id=`${tile.x},${tile.z}`;active.add(id);
   // Field support <1.4 world units, pond depth saturates at .73, and creek junctions use 8 neighbors.
   const neighbors=tiles.filter(t=>Math.abs(t.x-tile.x)<=1&&Math.abs(t.z-tile.z)<=1).sort((a,b)=>a.z-b.z||a.x-b.x).map(t=>`${t.x},${t.z},${t.terrain},${Number(t.owned)},${tileAppearance(t)}`).join(';');
   const stamp=[neighbors,WATER_BOWL.x,WATER_BOWL.z,REST_MAT.x,REST_MAT.z].join('|'),old=this.entries.get(id);if(old?.stamp===stamp)continue;
   const base=makeTerrainBase(tile,tiles,true).root;base.add(createTerrainWater(tile,field));const root=batchScenery(base);root.updateMatrixWorld(true);
   root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.applyMatrix4(o.matrixWorld);o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1);}});root.position.set(0,0,0);root.updateMatrixWorld(true);
   if(old)disposeGroup(old.root);this.entries.set(id,{stamp,root});regenerated++;changed=true;
  }
  for(const [id,entry]of this.entries)if(!active.has(id)){disposeGroup(entry.root);this.entries.delete(id);changed=true;}
  if(!changed)return 0;
  const batches=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];shadow:boolean}>();
  for(const tile of tiles){const entry=this.entries.get(`${tile.x},${tile.z}`);if(!entry)continue;for(const child of entry.root.children){const mesh=child as THREE.Mesh,m=mesh.material as THREE.MeshStandardMaterial,key=materialKey(m);let group=batches.get(key);if(!group){group={material:m.clone(),geometries:[],shadow:false};batches.set(key,group);}group.geometries.push(mesh.geometry);group.shadow ||= mesh.castShadow;}}
  const next=new THREE.Group();for(const group of batches.values()){const geometry=mergeGeometries(group.geometries,false);if(!geometry){group.material.dispose();continue;}const mesh=new THREE.Mesh(geometry,group.material);mesh.castShadow=group.shadow;mesh.receiveShadow=true;next.add(mesh);}
  disposeGroup(this.root);for(const child of [...next.children])this.root.add(child);this.generation++;return regenerated;
 }
 dispose(){if(this.disposed)return;this.disposed=true;disposeGroup(this.root);for(const entry of this.entries.values())disposeGroup(entry.root);this.entries.clear();}
}
