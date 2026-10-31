import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CreativeScene} from '../src/minimal/creative-scene.ts';
import {CREATIVE_CATALOG,type CreativeAsset} from '../src/minimal/creative-assets.ts';
const asset:CreativeAsset={id:'custom-a',kind:'custom-creature',templateId:'poop-pal',name:'布丁',prompt:'圆圆的',createdAt:1,hatchedAt:1,jobId:'job-a',origin:'mock',location:'ground',position:{x:1,z:2}};
test('custom view keeps one real-template instance while canonical pose grows, moves and rides on the head',async()=>{
 const scene=new THREE.Scene();let loads=0;const adapter=new CreativeScene(scene,CREATIVE_CATALOG,{loadModel:async url=>{loads++;assert.match(url,/\/ugc\/poop-pal\.glb\?rev=/);const model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial()));return {scene:model};}});
 const poses=new Map([[asset.id,{animalId:asset.id,position:{x:3,y:.2,z:4},scale:.6,heading:1,carried:false}]]);
 adapter.update([asset],poses);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scene.children.length,1);const root=scene.children[0];assert.deepEqual(root.userData.target,{kind:'animal',id:asset.id});assert.equal(root.userData.creativeTemplateId,'poop-pal');assert.equal(root.scale.x,.6);assert.deepEqual(root.position.toArray(),[3,.2,4]);
 poses.set(asset.id,{animalId:asset.id,position:{x:5,y:1.6,z:6},scale:1.2,heading:2,carried:true});adapter.update([asset],poses);adapter.tick(1);assert.equal(scene.children.length,1);assert.equal(loads,1);assert.equal(root.scale.x,1.2);assert.deepEqual(root.position.toArray(),[5,1.6,6]);assert.equal(root.rotation.y,2);adapter.update([],new Map());assert.equal(scene.children.length,0);adapter.dispose();
});

test('both new egg categories render one visible shell and progress before exposing their models',async()=>{
 const {creativeEggProgress}=await import('../src/minimal/creative-assets.ts');let now=1000,loads=0;
 const parent=new THREE.Group(),scene=new CreativeScene(parent,CREATIVE_CATALOG,{now:()=>now,loadModel:async()=>{loads++;const model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));return {scene:model};}});
 for(const templateId of ['poop-pal','wish-tree']){
  const egg={id:'new-egg',kind:'custom-egg' as const,templateId,name:'我的蛋',prompt:'样例',createdAt:0,jobId:'job',origin:'mock' as const,location:'ground' as const,position:{x:2,z:2},egg:{stage:'ready' as const,incubation:{requiredMs:15000,elapsedMs:0,checkedAt:1000}}};
  scene.update([egg]);assert.equal(scene.status(egg.id),'ready');const root=scene.rootForAsset(egg.id)!;assert.equal(root.getObjectByName('authored-demo-creative-egg')!==undefined,true);assert.equal(loads,0,'a prop egg must not load or display the finished prop');assert.ok(root.getObjectByName('creative-egg-progress'));now=8500;scene.update([egg]);assert.equal(root.userData.incubationProgress,.5);assert.equal(creativeEggProgress(egg,now).ready,false);assert.equal(parent.children.length,1);scene.update([]);now=1000;
 }
 scene.dispose();
});

test('hatching replaces the shell with the exact shipped animal or prop GLB once',async()=>{
 const {readFile}=await import('node:fs/promises'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 for(const [templateId,kind] of [['poop-pal','custom-creature'],['wish-tree','prop']] as const){
  const parent=new THREE.Group();let loads=0,loaded:Promise<void>|undefined;
  const scene=new CreativeScene(parent,CREATIVE_CATALOG,{now:()=>16000,loadModel:url=>{loads++;assert.ok(url.startsWith(`/ugc/${templateId==='poop-pal'?'poop-pal':'wish-tree-hy'}.glb?rev=`));const promise=(async()=>{const bytes=await readFile(new URL(`../public${url.split('?')[0]}`,import.meta.url));const loader=new GLTFLoader();loader.register(()=>({name:'cpu-image-only',loadTexture:async()=>new THREE.Texture()}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');})();loaded=promise.then(()=>{});return promise;}});
  const egg:CreativeAsset={id:'real-hatch',kind:'custom-egg',templateId,name:'已买蛋',prompt:'固定样例',createdAt:0,jobId:'job',origin:'mock',location:'ground',position:{x:1,z:2},egg:{stage:'ready',incubation:{requiredMs:15000,elapsedMs:0,checkedAt:1000}}};scene.update([egg]);assert.equal(loads,0);assert.ok(scene.rootForAsset(egg.id)?.getObjectByName('authored-demo-creative-egg'));
  const hatched={...egg,kind,egg:undefined,hatchedAt:16000};scene.update([hatched]);await loaded;await new Promise(r=>setTimeout(r,0));scene.update([hatched]);assert.equal(loads,1);assert.equal(parent.children.length,1);const root=scene.rootForAsset(egg.id)!;assert.equal(root.userData.creativeTemplateId,templateId);assert.equal(root.userData.creativeSource,'hunyuan-generated');assert.equal(root.getObjectByName('authored-demo-creative-egg'),undefined);let triangles=0;root.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});assert.ok(triangles>1000,'actual shipped mesh, not a proxy cube');scene.dispose();
 }
});
