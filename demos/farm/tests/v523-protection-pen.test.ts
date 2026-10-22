import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EstateWorld} from '../src/v5/EstateWorld.ts';
import {createLayout,type Building} from '../src/v5/layout.ts';
test('the protection enclosure is roofless and its perimeter fence leaves actual door cells open',()=>{
 const world=Object.create(EstateWorld.prototype) as {layoutGroup:THREE.Group;obstacles:unknown[];building:(b:Building,accent:string)=>void};
 world.layoutGroup=new THREE.Group();world.obstacles=[];const b=createLayout().buildings[0];world.building(b,'#aacccc');
 const roots:THREE.Mesh[]=[];world.layoutGroup.traverse(o=>{if(o instanceof THREE.Mesh)roots.push(o);});
 assert.equal(roots.some(m=>m.geometry.type==='ConeGeometry'),false,'no roof hides sheltered animals');
 const fences:THREE.Object3D[]=[];world.layoutGroup.traverse(o=>{if(o.name==='protection-fence')fences.push(o);});
 assert.equal(fences.length,11,'3x3 boundary has twelve edges minus the real open doorway');
 assert.equal(world.obstacles.length,0,'no overhead camera occluder');
});
test('additional protection entrances change the visual fence gap without adding capacity',()=>{
 const world=Object.create(EstateWorld.prototype) as {layoutGroup:THREE.Group;obstacles:unknown[];building:(b:Building,accent:string)=>void};world.layoutGroup=new THREE.Group();world.obstacles=[];
 const b=createLayout().buildings[0];b.doors.push({id:'north',x:2,z:0,open:true,paidCost:8});world.building(b,'#aacccc');
 const fences:THREE.Object3D[]=[];world.layoutGroup.traverse(o=>{if(o.name==='protection-fence')fences.push(o);});assert.equal(fences.length,10);assert.equal(b.capacity,6);
});
