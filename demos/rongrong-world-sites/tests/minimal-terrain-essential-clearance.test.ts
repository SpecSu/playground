import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeTerrain,makeEssentials} from '../src/minimal/scenery-art.ts';
import {createMinimalState,WATER_BOWL,REST_MAT,type Terrain} from '../src/minimal/model.ts';
import {vertices,deformedMeshes} from './v16-qa-geometry.ts';
import {firstPenetration} from './v16-qa-clearance.ts';
for(const [index,at] of [WATER_BOWL,REST_MAT].entries())for(const terrain of ['grove','hill','meadow','creek'] as Terrain[])test(`${index?'rest mat':'water bowl'} stays clear after ${terrain} conversion and cultivation`,()=>{
 for(const level of [1,2,3] as const){
 const tiles=createMinimalState(0).tiles,land=makeTerrain({...at,terrain,owned:true,level},tiles),essentials=makeEssentials();land.root.updateMatrixWorld(true);essentials.updateMatrixWorld(true);
 const obstacles=new THREE.Group();for(const o of land.root.children)if(o instanceof THREE.Group)obstacles.add(o.clone(true));obstacles.position.copy(land.root.position);obstacles.updateMatrixWorld(true);
 const points:THREE.Vector3[]=[];vertices(essentials.children[index],p=>points.push(p.clone()));const shaped=deformedMeshes(obstacles);try{assert.equal(firstPenetration(points,shaped.meshes).count,0,`prop triangle vertices penetrate decoration Lv${level}`);}finally{shaped.dispose();}
 }
});
