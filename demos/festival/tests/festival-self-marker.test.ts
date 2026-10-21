import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UPLOADED_CAST, uploadedTemplate, actualBounds } from './helpers/uploaded-avatar.ts';
import { createClubAvatar } from '../lib/club-avatar-rig.ts';
async function module(){const value=await import('../src/desert/self-marker.ts').catch(()=>null);assert.ok(value,'own participant ground marker exists');return value;}
const own={id:'self',role:'participant' as const};
const body={id:'self',joinedAt:1000,lastSeenAt:1000,ambient:false};
function update(marker:ReturnType<Awaited<ReturnType<typeof module>>['createFestivalSelfMarker']>,extra:Record<string,unknown>={}){marker.update({self:own,participant:body,connected:true,now:1500,x:4,z:42,groundY:0,footprintRadius:1.2,viewportHeight:758,camera:new THREE.PerspectiveCamera(55,390/758,.25,1600),...extra});}
test('one bright yellow ring has an unlit rim, subtle yellow halo, depth testing and no arrow',async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker();
 assert.equal(marker.root.visible,false);const meshes=marker.root.children as THREE.Mesh[];assert.equal(meshes.length,4);
 for(const mesh of meshes){const material=mesh.material as THREE.MeshBasicMaterial;assert.ok(material.isMeshBasicMaterial);assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);assert.equal(material.toneMapped,false);assert.equal(material.fog,false);}
 assert.equal((meshes.find(mesh=>mesh.name==='self-marker-fill')!.material as THREE.MeshBasicMaterial).opacity,.10);
 assert.equal((meshes.find(mesh=>mesh.name==='self-marker-ring')!.material as THREE.MeshBasicMaterial).color.getHex(),0xffe600);
 const halo=meshes.find(mesh=>mesh.name==='self-marker-halo')!;assert.ok(halo);assert.equal((halo.material as THREE.MeshBasicMaterial).color.getHex(),0xffe600);assert.ok((halo.material as THREE.MeshBasicMaterial).opacity<=.15);
 assert.ok(meshes.every(mesh=>!mesh.name.includes('arrow')&&!mesh.name.includes('triangle')));assert.equal(marker.root.userData.festivalSelfMarker,true);marker.dispose();
});
test('marker follows only connected actual membership and expires without waiting for another poll',async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker(),scene=new THREE.Scene();scene.add(marker.root);
 update(marker);assert.equal(marker.root.visible,true);assert.deepEqual(marker.root.position.toArray(),[4,.12,42]);assert.equal(marker.root.parent,scene);
 for(const extra of[{self:{id:'self',role:'visitor'}},{self:{id:'self',role:'spectator'}},{participant:{...body,id:'other'}},{participant:{...body,ambient:true}},{participant:null},{connected:false},{self:null},{now:61000}]){update(marker,extra);assert.equal(marker.root.visible,false,JSON.stringify(extra));}
 update(marker,{participant:{...body,id:'replacement',joinedAt:2000,lastSeenAt:2000},self:{id:'replacement',role:'participant'},now:2500,x:-8,z:35});
 assert.equal(marker.root.visible,true);assert.equal(scene.children.length,1);assert.deepEqual(marker.root.position.toArray(),[-8,.12,35]);
 marker.dispose();assert.equal(scene.children.length,0);assert.equal(marker.root.visible,false);update(marker);assert.equal(marker.root.visible,false);
});
test('ring keeps at least 32 screen pixels in distant views and stays above road overlays',async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker(),camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);
 camera.position.set(0,40,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 update(marker,{camera,footprintRadius:.6});const small=marker.root.scale.x;
 update(marker,{camera,footprintRadius:1.6});assert.ok(marker.root.scale.x>=small);assert.equal(marker.root.position.y,.12);
 camera.position.multiplyScalar(10);camera.updateMatrixWorld();update(marker,{camera,footprintRadius:1.6});const depth=-new THREE.Vector3(4,0,42).applyMatrix4(camera.matrixWorldInverse).z;const pixels=marker.root.scale.x*2*.985*758*camera.projectionMatrix.elements[5]/(2*depth);assert.ok(pixels>=32&&pixels<33,'extreme view retains a thin 32px marker');
 update(marker,{camera,footprintRadius:1.6,groundY:.4});assert.ok(Math.abs(marker.root.position.y-.52)<1e-10);marker.dispose();
});
test('actual species use rest-pose feet footprints, independent of upper bodies, animation and ceremony hops',async()=>{
 const radii:number[]=[];
 for(const kind of ['cat','frog','dog','capybara','panda','banana-cat','sword-shield-dog','human-jiji','human-subeike','human-lx','monster-tower','monster-star'] as const){
  const bytes=readFileSync(new URL(`../public/avatars/${kind}.glb`,import.meta.url));const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const avatar=createClubAvatar(kind,'self',{mode:'desert',template:scene});
  assert.ok(Number.isFinite(avatar.groundFootprintRadius),'rest ground radius is exposed');assert.ok(avatar.groundFootprintRadius>0);assert.ok(avatar.groundFootprintRadius<=avatar.footprintRadius*1.42);
  const radius=avatar.groundFootprintRadius;radii.push(radius);avatar.update(5,'spin',false,1);assert.equal(avatar.groundFootprintRadius,radius);avatar.dispose();
 }
 assert.ok(Math.max(...radii)-Math.min(...radii)>.1,'species footprints are not a fixed human size');
});
test('scene marker lifecycle is independent from animated roots and photo capture suppresses it',()=>{
 const scene=readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');const capture=readFileSync(new URL('../src/desert/ceremony-capture.ts',import.meta.url),'utf8');
 assert.match(scene,/scene\.add\(selfMarker\.root\)/);assert.match(scene,/selfMarker\.update\(/);assert.match(scene,/selfMarker\.dispose\(\)/);
 assert.doesNotMatch(scene,/avatar\.root\.add\(selfMarker/);assert.match(capture,/festivalSelfMarker/);
});

test('yellow line keeps a readable 2.75px band at near and maximum zoom distances',async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker(),camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);
 for(const distance of [12,30,70,120,420,1000]){
  camera.position.set(4,distance*.4,42+distance);camera.lookAt(4,0,42);camera.updateMatrixWorld();update(marker,{camera});
  const mesh=marker.root.getObjectByName('self-marker-ring') as THREE.Mesh;const attr=mesh.geometry.getAttribute('position');const radii=[];
  for(let index=0;index<attr.count;index++)radii.push(Math.hypot(attr.getX(index),attr.getY(index)));
  const depth=-new THREE.Vector3(4,0,42).applyMatrix4(camera.matrixWorldInverse).z;
  const width=(Math.max(...radii)-Math.min(...radii))*marker.root.scale.x*758*camera.projectionMatrix.elements[5]/(2*depth);
  assert.ok(Math.abs(width-2.75)<.1,`${distance}: ${width}px`);
 }
 marker.dispose();
});

test('nickname ownership is refreshed even when another identity keeps the same name and avatar',()=>{
 const scene=readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8');
 assert.match(scene,/isSelf!==visual\.labelSelf/);assert.match(scene,/visual\.labelSelf=isSelf/);
});

test('marker layers clear ground roads and glows while retaining avatar occlusion',async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker();
 const camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);
 for(const distance of [12,420,1000]){
  camera.position.set(4,distance*.4,42+distance);camera.lookAt(4,0,42);camera.updateMatrixWorld();update(marker,{camera});marker.root.updateMatrixWorld(true);
  for(const mesh of marker.root.children as THREE.Mesh[]){
   const material=mesh.material as THREE.MeshBasicMaterial;
   assert.equal(material.depthTest,true,'opaque avatar depth must still hide the marker');
   assert.equal(material.depthWrite,false,'marker must not hide other world objects');
   assert.equal(material.polygonOffset,true);assert.ok(material.polygonOffsetFactor < -1);assert.ok(material.polygonOffsetUnits < -1);
   assert.ok(mesh.getWorldPosition(new THREE.Vector3()).y>.072,'above roads at .027 plus night overlay offset .045');
   assert.ok(mesh.renderOrder>2,'transparent layers render after road glow');
  }
 }
 marker.dispose();
});

test("enlarged real-foot footprints are never truncated by the old world-radius cap",async()=>{
 const {createFestivalSelfMarker}=await module();const marker=createFestivalSelfMarker(),camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);
 camera.position.set(4,12,54);camera.lookAt(4,0,42);camera.updateMatrixWorld();
 update(marker,{camera,footprintRadius:3.2});assert.ok(marker.root.scale.x>=3.38);assert.equal(marker.root.position.y,.12);marker.dispose();
});

test('all twelve doubled uploaded characters fit inside their true ground ring',async()=>{
 const {createFestivalSelfMarker}=await module(),camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);camera.position.set(0,8,15);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 for(const kind of UPLOADED_CAST){
  const avatar=createClubAvatar(kind,'footprint4',{mode:'desert',template:await uploadedTemplate(kind)}),marker=createFestivalSelfMarker();avatar.root.scale.setScalar(4);avatar.update(0,'dance',false,0);
  const bounds=actualBounds(avatar.root),cutoff=bounds.min.y+(bounds.max.y-bounds.min.y)*.2,point=new THREE.Vector3();let radius=0;
  avatar.root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);if(point.y<=cutoff)radius=Math.max(radius,Math.hypot(point.x,point.z));}});
  update(marker,{camera,x:0,z:0,footprintRadius:avatar.groundFootprintRadius*4});assert.ok(marker.root.scale.x*.985>radius,`${kind}: ring ${marker.root.scale.x} encloses real feet ${radius}`);assert.equal(marker.root.position.y,.12);marker.dispose();avatar.dispose();
 }
});
