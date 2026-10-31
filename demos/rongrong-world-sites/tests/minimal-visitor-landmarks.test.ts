import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VISITOR_LANDMARKS,visitorLandmarkBounds,visitorLandmarkFor} from '../src/minimal/visitor-landmark-catalog.ts';
import {VisitorLandmarkScene} from '../src/minimal/visitor-landmark-scene.ts';
const bytesFor=(url:string)=>Uint8Array.from(readFileSync(new URL('../public'+url.split('?')[0],import.meta.url)));
const loadBytes=async(url:string)=>bytesFor(url);
test('four fixed mappings use exact supplied bytes and complete footprint outside owned land on existing floor',async()=>{
 assert.deepEqual(Object.keys(VISITOR_LANDMARKS),['oasis','glacier','forest','lunar']);assert.equal(visitorLandmarkFor('school-playground'),undefined);
 for(const [id,record] of Object.entries(VISITOR_LANDMARKS)){
  const bytes=bytesFor(record.url);assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  const parent=new THREE.Group(),scene=new VisitorLandmarkScene(parent,id,{loadBytes,textureMode:'headers-only'});await scene.ready;
  assert.equal(scene.status,'ready');parent.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(scene.root,true),expected=visitorLandmarkBounds(id)!;
  for(const axis of ['x','y','z'] as const){assert.ok(Math.abs(b.min[axis]-expected.min[axis])<1e-5);assert.ok(Math.abs(b.max[axis]-expected.max[axis])<1e-5);}
  assert.ok(b.min.x>=-10&&b.max.x<=10&&b.min.z>=-10&&b.max.z<=10);assert.ok(Math.abs(b.min.y)<1e-6);assert.ok(b.max.x<=-4.3&&b.max.z<=-4.3,'never occupies player/animal ground or the court');
  let triangles=0;scene.root.traverse(o=>{if(o instanceof THREE.Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.equal(o.userData.pickTarget,undefined);}});assert.equal(triangles,record.triangles);
  scene.dispose();assert.equal(parent.children.length,0);
 }
});
test('bad byte identity fails closed before parsing; explicit retry succeeds without fallback',async()=>{
 let attempts=0;const parent=new THREE.Group(),scene=new VisitorLandmarkScene(parent,'oasis',{loadBytes:async url=>{attempts++;const b=bytesFor(url);if(attempts===1)b[b.length-1]^=1;return b;},textureMode:'headers-only'});
 await scene.ready;assert.equal(scene.status,'failed');assert.equal(scene.root.children.length,0);scene.retry();await scene.ready;assert.equal(scene.status,'ready');assert.equal(attempts,2);scene.retry();assert.equal(attempts,2);scene.dispose();
});
test('late bytes cannot resurrect a disposed visit; resources are disposed exactly once',async()=>{
 let release!:(b:Uint8Array)=>void;const parent=new THREE.Group(),scene=new VisitorLandmarkScene(parent,'lunar',{loadBytes:()=>new Promise(r=>release=r),textureMode:'headers-only'});scene.dispose();release(bytesFor(VISITOR_LANDMARKS.lunar.url));await scene.ready;assert.equal(parent.children.length,0);assert.equal(scene.root.children.length,0);
 const second=new VisitorLandmarkScene(parent,'glacier',{loadBytes,textureMode:'headers-only'});await second.ready;const resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();second.root.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)resources.add(v);}}});let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);second.dispose();second.dispose();assert.equal(disposed,resources.size);assert.ok(resources.size>=3);
});
test('bounded loading queue starts at most two visits, skips a disposed queued visit',async()=>{
 const waiters:(()=>void)[]=[];let active=0,peak=0,calls=0;const load=async(url:string)=>{active++;calls++;peak=Math.max(peak,active);await new Promise<void>(resolve=>waiters.push(resolve));active--;return bytesFor(url);};
 const scenes=['oasis','lunar','forest','glacier'].map(id=>new VisitorLandmarkScene(new THREE.Group(),id,{loadBytes:load,textureMode:'headers-only'}));assert.equal(calls,2);scenes[2].dispose();waiters.splice(0).forEach(resolve=>resolve());await Promise.all([scenes[0].ready,scenes[1].ready]);assert.equal(calls,3);waiters.splice(0).forEach(resolve=>resolve());await Promise.all(scenes.map(s=>s.ready));assert.equal(peak,2);for(const s of scenes)s.dispose();
});
test('actual supplied landmark has no overlap with existing primitives, court or gameplay state',async()=>{
 const {SampleScenery}=await import('../src/minimal/sample-scenery.ts'),{sampleFarm}=await import('../src/minimal/sample-farms.ts');
 for(const id of Object.keys(VISITOR_LANDMARKS)){
  const farm=sampleFarm(id,1_800_000_000_000),snapshot=JSON.stringify(farm),parent=new THREE.Group();const pending:Promise<unknown>[]=[];const scenery=new SampleScenery(parent,farm,{loadModel:url=>{const loader=new GLTFLoader();loader.register(()=>({name:'CPU_ACCENT_TEXTURE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const p=loader.parseAsync(bytesFor(url).buffer,'');pending.push(p);return p;},landmark:{loadBytes,textureMode:'headers-only'}});await scenery.suppliedLandmark.ready;await Promise.all(pending);await Promise.resolve();parent.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(scenery.suppliedLandmark.root,true);let compared=0;
  scenery.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(let a:THREE.Object3D|null=o;a;a=a.parent)if(a===scenery.suppliedLandmark.root)return;const other=new THREE.Box3().setFromObject(o,true);assert.equal(b.intersectsBox(other),false,`${id}: overlaps ${o.name}`);compared++;});assert.ok(compared>10);assert.equal(JSON.stringify(farm),snapshot);assert.deepEqual(scenery.landmarkBounds,visitorLandmarkBounds(id));
  if(id==='lunar'){let craters=0;scenery.root.traverse(o=>{if(o.name==='sample-lunar-crater')craters++;});assert.equal(craters,3);assert.equal(scenery.court?.rimWorld.x,3);}
  let releases=0;const geometry=(scenery.suppliedLandmark.root.children[0].children[0].children[0] as THREE.Mesh).geometry;geometry.addEventListener('dispose',()=>releases++);scenery.dispose();scenery.dispose();assert.equal(releases,1);assert.equal(parent.children.length,0);
 }
});
test('transport compression length is not confused with verified decoded GLB identity',async()=>{
 const old=globalThis.fetch;let scene:VisitorLandmarkScene|undefined;try{const record=VISITOR_LANDMARKS.oasis;globalThis.fetch=async()=>new Response(bytesFor(record.url),{headers:{'content-encoding':'gzip','content-length':'42'}});scene=new VisitorLandmarkScene(new THREE.Group(),'oasis',{textureMode:'headers-only'});await scene.ready;assert.equal(scene.status,'ready');}finally{scene?.dispose();globalThis.fetch=old;}
});
test('a decoded model arriving after visit disposal frees its shared geometry and three texture resources once',async()=>{
 const original=GLTFLoader.prototype.parseAsync;let finish!:()=>void,parsed!:(m:Awaited<ReturnType<typeof original>>)=>void;const modelReady=new Promise<Awaited<ReturnType<typeof original>>>(r=>parsed=r),held=new Promise<void>(r=>finish=r);let scene:VisitorLandmarkScene|undefined;
 try{GLTFLoader.prototype.parseAsync=async function(...args:Parameters<typeof original>){const model=await original.apply(this,args);parsed(model);await held;return model;};scene=new VisitorLandmarkScene(new THREE.Group(),'forest',{loadBytes,textureMode:'headers-only'});const model=await modelReady,resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();model.scene.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)resources.add(v);}}});let disposals=0;for(const r of resources)r.addEventListener('dispose',()=>disposals++);scene.dispose();finish();await scene.ready;assert.equal(disposals,resources.size);assert.equal(scene.root.parent,null);assert.equal(scene.root.children.length,0);scene.dispose();assert.equal(disposals,resources.size);}finally{finish?.();scene?.dispose();GLTFLoader.prototype.parseAsync=original;}
});
test('status callback exposes a small retry UI without hiding or blocking the existing ground',async()=>{
 const statuses:string[]=[];let fail=true;const scene=new VisitorLandmarkScene(new THREE.Group(),'lunar',{loadBytes:async url=>{if(fail)throw new Error('offline');return bytesFor(url);},textureMode:'headers-only',changed:s=>statuses.push(s)});await scene.ready;assert.deepEqual(statuses,['loading','failed']);fail=false;scene.retry();await scene.ready;assert.deepEqual(statuses,['loading','failed','loading','ready']);scene.dispose();
});
