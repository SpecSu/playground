import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';

const moduleUrl=new URL('../lib/art/exotic-plants.js',import.meta.url);
test('ten authored exotic plant factories exist',async()=>{
 assert.ok(fs.existsSync(moduleUrl),'exotic model module must exist');
 const {EXOTIC_PLANT_IDS,createExoticPlant}=await import(moduleUrl.href);
 assert.equal(new Set(EXOTIC_PLANT_IDS).size,10);
 for(const id of ['fantasy-chomper','rafflesia','pitcher-plant'])assert.ok(EXOTIC_PLANT_IDS.includes(id));
 for(const id of EXOTIC_PLANT_IDS){const p=createExoticPlant(id);p.setGrowth(1);p.update(2);p.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(p.root);assert.ok(box.getSize(new THREE.Vector3()).length()>.15,id);assert.ok(box.min.y>-.015,`${id} root below ground`);let meshes=0,vertices=0;p.root.traverse(n=>{if(n.isMesh){meshes++;vertices+=n.geometry.attributes.position.count;}});assert.ok(meshes>=3&&meshes<100,`${id} authored organ/draw-call budget: ${meshes}`);assert.ok(vertices<65000,`${id} vertex budget ${vertices}`);p.dispose();}
});
test('growth is deterministic, grounded, and materially changes organs',async()=>{
 if(!fs.existsSync(moduleUrl))return;
 const {EXOTIC_PLANT_IDS,createExoticPlant,exoticPlantMarkerHeight}=await import(moduleUrl.href);
 for(const id of EXOTIC_PLANT_IDS){const p=createExoticPlant(id);p.setGrowth(0);p.root.updateMatrixWorld(true);const small=new THREE.Box3().setFromObject(p.root).getSize(new THREE.Vector3());p.setGrowth(1);p.root.updateMatrixWorld(true);const mature=new THREE.Box3().setFromObject(p.root).getSize(new THREE.Vector3());assert.ok(mature.length()>small.length()*1.3,`${id} must visibly grow`);for(const g of [0,.2,.5,.8,1]){p.setGrowth(g);p.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(p.root);assert.ok(Number.isFinite(box.max.y));assert.ok(exoticPlantMarkerHeight(id,g)>=box.max.y-.025,`${id} marker must clear canopy at ${g}`);}p.dispose();}
});
test('random and giant scale once; gold is isolated and silhouette geometry unchanged',async()=>{
 if(!fs.existsSync(moduleUrl))return;
 const {EXOTIC_PLANT_IDS,createExoticPlant}=await import(moduleUrl.href);
 const colors=p=>{const result=[];p.root.traverse(n=>{if(n.isMesh)result.push(n.material.color.getHex());});return result;};
 for(const id of EXOTIC_PLANT_IDS){const a=createExoticPlant(id),b=createExoticPlant(id,{instanceScale:1.56,variant:'gold'});a.setGrowth(1);b.setGrowth(1);a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);const aa=new THREE.Box3().setFromObject(a.root).getSize(new THREE.Vector3()),bb=new THREE.Box3().setFromObject(b.root).getSize(new THREE.Vector3());assert.ok(Math.abs(bb.y/aa.y-1.56)<.001,id);assert.notEqual(a.root.children[0],b.root.children[0]);const original=colors(a);assert.notDeepEqual(original,colors(b),`${id} gold palette must differ`);b.root.traverse(n=>{if(n.isMesh)n.material.color.set('#ff0000');});assert.deepEqual(colors(a),original,`${id} gold material cannot contaminate normal`);a.dispose();b.dispose();}
});
test('growing flower heads and hanging pitchers stay attached to their growing stem',async()=>{
 const {createExoticPlant}=await import(moduleUrl.href);
 for(const [id,organ,stem] of [['pitcher-plant','Pitcher_pendant_0','Pitcher_climbing_stem'],['fantasy-chomper','Chomper_head','Chomper_curved_stem'],['mimosa','Mimosa_pink_bloom','Mimosa_stem'],['titan-arum','Titan_inflorescence','Titan_peduncle']]){
  const p=createExoticPlant(id),n=p.root.getObjectByName(organ);assert.equal(n.parent.name,stem);const expected=n.position.clone();for(const g of [.05,.45,.75,1,.45]){p.setGrowth(g);assert.ok(n.position.distanceTo(expected)<1e-8,`${id} attachment point must not drift while organ unfolds`);}p.dispose();
 }
});
test('mature wide sculptures sit on the common ground rather than hovering',async()=>{
 const {EXOTIC_PLANT_IDS,createExoticPlant}=await import(moduleUrl.href);
 for(const id of EXOTIC_PLANT_IDS){const p=createExoticPlant(id);p.setGrowth(1);const b=new THREE.Box3().setFromObject(p.root);assert.ok(b.min.y>=0&&b.min.y<.012,`${id} should sit at ground + tiny contact bias`);p.dispose();}
});
test('legacy lithops identity now renders a strawberry plant with seeded fruit and trifoliate foliage',async()=>{
 const {createExoticPlant}=await import(moduleUrl.href);const p=createExoticPlant('lithops');p.setGrowth(1);
 const names=[];p.root.traverse(n=>{if(n.isMesh)names.push(n.name);});
 assert.equal(names.filter(n=>n==='Strawberry_fruit_body').length,3,'three sculpted strawberries, not recolored stone lobes');
 assert.equal(names.filter(n=>n==='Strawberry_serrated_leaf').length,9,'three clearly trifoliate leaf sprays');
 assert.equal(names.filter(n=>n==='Strawberry_pale_seeds').length,3);
 assert.ok(!names.some(n=>n.startsWith('Lithops_lobe')));
 const size=new THREE.Box3().setFromObject(p.root).getSize(new THREE.Vector3());assert.ok(Math.abs(Math.max(size.x,size.z)-1.9)<.001,'existing width contract is unchanged');
 p.dispose();
});
test('legacy rafflesia identity is a tall sculpted dragon tree with stable trunk and layered sword-leaf crowns',async()=>{
 const {createExoticPlant,EXOTIC_PLANT_SIZES}=await import(moduleUrl.href);const p=createExoticPlant('rafflesia');p.setGrowth(1);
 assert.deepEqual(EXOTIC_PLANT_SIZES.rafflesia,{axis:'height',metres:5.5});
 const size=new THREE.Box3().setFromObject(p.root).getSize(new THREE.Vector3());assert.ok(Math.abs(size.y-5.5)<.01);assert.ok(Math.max(size.x,size.z)>2.5&&Math.max(size.x,size.z)<4.1,'upright landmark, not a screen-wide crown');
 const trunk=p.root.getObjectByName('Dragon_tree_trunk');assert.ok(trunk);const crowns=[];let meshes=0,vertices=0;p.root.traverse(n=>{if(n.name.startsWith('Dragon_leaf_crown_'))crowns.push(n);if(n.isMesh){meshes++;vertices+=n.geometry.attributes.position.count;}});assert.equal(crowns.length,7);assert.ok(meshes<=45,'merged leaf crowns retain a light draw-call budget');assert.ok(vertices<25000,'fine sword leaves use a mobile-scale geometry budget');
 p.update(1);const stable=trunk.matrixWorld.clone(),leaf=crowns[0].matrixWorld.clone();p.update(4);assert.deepEqual(trunk.matrixWorld.elements,stable.elements,'wind must not rock the trunk or roots');assert.notDeepEqual(crowns[0].matrixWorld.elements,leaf.elements);p.dispose();
});
