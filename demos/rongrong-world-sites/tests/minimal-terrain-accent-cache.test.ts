import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TerrainAccentCache} from '../src/minimal/terrain-accent-cache.ts';
import {makeTerrainAccents,batchScenery} from '../src/minimal/scenery-art.ts';
import {createMinimalState,type Tile} from '../src/minimal/model.ts';
import {WATER_BOWL} from '../src/minimal/farm-landmarks.ts';
const tiles=()=>createMinimalState(0).tiles.map(t=>({...t,owned:true,level:3 as const}));
function dispose(root:THREE.Group){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
function full(tiles:readonly Tile[]){const root=new THREE.Group();for(const t of tiles)if(t.owned&&(t.level??1)>1)root.add(makeTerrainAccents(t,tiles));return batchScenery(root);}
function vertices(root:THREE.Group){const result=new Map<string,number[]>();root.traverse(o=>{if(o instanceof THREE.Mesh){const material=o.material as THREE.MeshStandardMaterial,key=[material.color.getHex(),material.roughness,material.metalness,material.side,material.opacity,material.userData.environmentRole??''].join('|'),a=o.geometry.attributes.position;const points=result.get(key)??[];for(let i=0;i<a.count;i++)points.push(a.getX(i),a.getY(i),a.getZ(i));result.set(key,points);}});return result;}
function equalOutput(actual:THREE.Group,expected:THREE.Group){const a=vertices(actual),b=vertices(expected);assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());for(const [key,points]of a){assert.equal(points.length,b.get(key)!.length);points.forEach((v,i)=>assert.ok(Math.abs(v-b.get(key)![i])<1e-5));}}
test('late upgrade regenerates only one tile, preserves exact output and keeps six global batches',()=>{
 const source=tiles(),at=source.findIndex(t=>t.x===2&&t.z===2),prior=source.map((t,i)=>i===at?{...t,level:2 as const}:t),cache=new TerrainAccentCache();
 try{assert.equal(cache.update(prior),100);assert.equal(cache.update(source),1);assert.equal(cache.size,100);assert.equal(cache.root.children.length,6);const baseline=full(source);try{equalOutput(cache.root,baseline);}finally{dispose(baseline);}const ids=cache.root.children.map(o=>o.uuid);for(let i=0;i<100;i++)assert.equal(cache.update(source),0);assert.deepEqual(cache.root.children.map(o=>o.uuid),ids);}finally{cache.dispose();}
});
test('cache invalidates terrain, neighboring creeks, ownership, removal, levels and special footprints',()=>{
 const source=tiles(),cache=new TerrainAccentCache();try{
 cache.update(source);const at=source.findIndex(t=>t.x===2&&t.z===2),changed=source.map((t,i)=>i===at?{...t,terrain:'grove' as const}:t);const adjacentCreeks=source.filter(t=>t.terrain==='creek'&&Math.abs(t.x-source[at].x)<=1&&Math.abs(t.z-source[at].z)<=1).length;assert.equal(cache.update(changed),1+adjacentCreeks);
 const unowned=changed.map((t,i)=>i===at?{...t,owned:false}:t);assert.equal(cache.update(unowned),0);assert.equal(cache.size,99);assert.equal(cache.update(changed),1);const restored=full(changed);try{equalOutput(cache.root,restored);}finally{dispose(restored);}cache.update(unowned);
 const low=unowned.map((t,i)=>i===at+1?{...t,level:1 as const}:t);cache.update(low);assert.equal(cache.size,98);
 cache.update(low.slice(0,50));assert.ok(cache.size<=50,'removed map entries never remain as history');
 const x=WATER_BOWL.x;try{WATER_BOWL.x=x+1;assert.equal(cache.update(low.slice(0,50)),cache.size);}finally{WATER_BOWL.x=x;}cache.update(low.slice(0,50));const expected=full(low.slice(0,50));try{equalOutput(cache.root,expected);}finally{dispose(expected);}
 cache.update([]);assert.equal(cache.size,0);assert.equal(cache.root.children.length,0);
 }finally{cache.dispose();}
});
test('output owns separate resources, replacement does not dispose unchanged caches, close releases once',()=>{
 const source=tiles().slice(0,4),cache=new TerrainAccentCache();cache.update(source);const internal=cache as unknown as {entries:Map<string,{root:THREE.Group}>};const counters=new Map<object,number>();const watch=(root:THREE.Group)=>root.traverse(o=>{if(o instanceof THREE.Mesh)for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!counters.has(resource)){counters.set(resource,0);resource.addEventListener('dispose',()=>counters.set(resource,counters.get(resource)!+1));}});
 const cached=new Set<object>();for(const e of internal.entries.values()){watch(e.root);e.root.traverse(o=>{if(o instanceof THREE.Mesh){cached.add(o.geometry);cached.add(o.material);}});}watch(cache.root);cache.root.traverse(o=>{if(o instanceof THREE.Mesh){assert.equal(cached.has(o.geometry),false);assert.equal(cached.has(o.material),false);}});
 const previousOutput=cache.root.children.flatMap(o=>{const m=o as THREE.Mesh;return [m.geometry,m.material as THREE.Material];});cache.update(source.map((t,i)=>i===0?{...t,level:2 as const}:t));assert.ok(previousOutput.every(r=>counters.get(r)===1));const unchanged=[...internal.entries.values()].slice(1);for(const e of unchanged)e.root.traverse(o=>{if(o instanceof THREE.Mesh){assert.equal(counters.get(o.geometry),0);assert.equal(counters.get(o.material as THREE.Material),0);}});
 for(const e of internal.entries.values())watch(e.root);watch(cache.root);cache.dispose();assert.equal(cache.size,0);assert.equal(cache.root.children.length,0);for(const count of counters.values())assert.equal(count,1);cache.dispose();assert.equal(cache.update(source),0);for(const count of counters.values())assert.equal(count,1);
});
test('preview creek accents invalidate when neighboring pond opens or closes a mouth',()=>{
 const source:Tile[]=[{x:-2,z:-2,terrain:'creek',owned:true,level:3},{x:-1,z:-2,terrain:'meadow',owned:true,level:3}],cache=new TerrainAccentCache(new THREE.Group(),true);
 try{assert.equal(cache.update(source),2);assert.equal(cache.update(source),0);assert.equal(cache.update(source.map((t,i)=>i?{...t,terrain:'pond'}:t)),2);assert.equal(cache.update(source),2);}finally{cache.dispose();}
});
