// Unit checks only. This test geometry is not an island art asset.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return {url:new URL('../scene-lab/vendor/three.module.js',import.meta.url).href,shortCircuit:true};
  if (specifier.startsWith('three/addons/')) return {url:new URL('../scene-lab/vendor/addons/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const T = await import('../scene-lab/vendor/three.module.js');
const {AssetLibrary,inspectContainer,modelStatistics,mainSurfaceHeight,supportsWebP} = await import('../scene-lab/src/asset.js');
const library = new AssetLibrary({capabilities:{getMaxAnisotropy:()=>8}});
const source = new T.Group(), material=new T.MeshStandardMaterial({color:'#d88849',roughness:.65});
const part = new T.Mesh(new T.BoxGeometry(2,3,1),material); part.position.set(7,5,-4); source.add(part);
const originalBox = new T.Box3().setFromObject(source).clone();
const instance = library.instance({root:source},{axis:'y',size:1.2,rotation:[0,90,0],anchor:'bottom'});
const resultBox = new T.Box3().setFromObject(instance), size=resultBox.getSize(new T.Vector3());
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
near(resultBox.min.y,0); near(size.y,1.2); near(size.x,.4); near(size.z,.8);
near(resultBox.getCenter(new T.Vector3()).x,0); near(resultBox.getCenter(new T.Vector3()).z,0);
assert.deepEqual(new T.Box3().setFromObject(source), originalBox);
const instanceMesh=instance.children[0].children[0].children[0];
library.setMaterial(instance,'clay'); assert.equal(instanceMesh.material,library.clay);
library.setMaterial(instance,'pbr'); assert.equal(instanceMesh.material,material);
assert.equal(modelStatistics(instance).triangles,12);
const top=library.instance({root:source},{axis:'y',size:1.2,anchor:'top'}); near(new T.Box3().setFromObject(top).max.y,0);
const bytes = new Uint8Array(12); assert.throws(()=>inspectContainer(bytes.buffer),/完整/);

// A tiny self-contained asymmetric tetrahedron validates the actual GLB parser and provides a UI fixture.
const positions=new Float32Array([-1,0,-.5, 1,0,-.5, 0,0,.5, 0,3,0]);
const indices=new Uint16Array([0,2,1, 0,1,3, 1,2,3, 2,0,3]);
const bin=new Uint8Array(positions.byteLength+indices.byteLength); bin.set(new Uint8Array(positions.buffer)); bin.set(new Uint8Array(indices.buffer),positions.byteLength);
const doc={asset:{version:'2.0',generator:'ISLAND technical fixture; not art'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],buffers:[{byteLength:bin.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-1,0,-.5],max:[1,3,.5]},{bufferView:1,componentType:5123,count:12,type:'SCALAR'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.6,.3,.1,1],metallicFactor:0,roughnessFactor:.65},doubleSided:true}]};
const jsonText=JSON.stringify(doc), padding=(4-new TextEncoder().encode(jsonText).length%4)%4, json=new TextEncoder().encode(jsonText+' '.repeat(padding));
const buffer=new ArrayBuffer(12+8+json.length+8+bin.length), view=new DataView(buffer);
view.setUint32(0,0x46546c67,true); view.setUint32(4,2,true); view.setUint32(8,buffer.byteLength,true); view.setUint32(12,json.length,true); view.setUint32(16,0x4e4f534a,true); new Uint8Array(buffer,20,json.length).set(json);
view.setUint32(20+json.length,bin.length,true); view.setUint32(24+json.length,0x004e4942,true); new Uint8Array(buffer,28+json.length).set(bin);
const loaded=await library.parse(buffer); assert.equal(modelStatistics(loaded.root).triangles,4);
await mkdir(new URL('../work/fixtures/',import.meta.url),{recursive:true});
await writeFile(new URL('../work/fixtures/technical-tetrahedron.glb',import.meta.url),new Uint8Array(buffer));
console.log('PASS: GLB parsing, dimensions, coherent rotation/scaling, bottom/top anchoring, source preservation, material round trip, triangle counts, invalid file rejection.');

// A post higher than a broad deck must not determine the attachment height.
const dock=new T.Group();const deck=new T.Mesh(new T.BoxGeometry(3,.15,2),material);deck.position.y=.8;dock.add(deck);const post=new T.Mesh(new T.BoxGeometry(.2,1.5,.2),material);post.position.y=.75;dock.add(post);near(mainSurfaceHeight(dock),.875);
const batch=library.batch({root:source},{axis:'y',size:1.2,anchor:'bottom'},[{position:[2,0,4]},{position:[-2,0,0],rotation:Math.PI/2}]);
assert.equal(batch.children[0].count,2);assert.equal(batch.children[0].geometry,part.geometry);const mat=new T.Matrix4();batch.children[0].getMatrixAt(0,mat);near(new T.Vector3().setFromMatrixPosition(mat).x,2);assert.deepEqual(new T.Box3().setFromObject(source),originalBox);
console.log('PASS: deck attachment excludes post tops; instances share geometry and preserve source transforms.');

// Cache release must free shared GPU resources exactly once when changing model quality.
let geometryDisposals=0,materialDisposals=0,textureDisposals=0;
const cachedGeometry=new T.BufferGeometry(),cachedTexture=new T.Texture();
const cachedMaterial=new T.MeshStandardMaterial({map:cachedTexture,normalMap:cachedTexture});
cachedGeometry.addEventListener('dispose',()=>geometryDisposals++);
cachedMaterial.addEventListener('dispose',()=>materialDisposals++);
cachedTexture.addEventListener('dispose',()=>textureDisposals++);
const cachedRoot=new T.Group();cachedRoot.add(new T.Mesh(cachedGeometry,cachedMaterial),new T.Mesh(cachedGeometry,cachedMaterial));
library.cache.set('cache-disposal-fixture',Promise.resolve({root:cachedRoot}));
await library.clearCache();
assert.equal(library.cache.size,0);assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);assert.equal(textureDisposals,1);
console.log('PASS: quality switch releases cached geometry/material/texture resources once.');

// A failed format probe must retain the JPEG/PNG compatibility path.
const previousImage=globalThis.Image;
try {
  globalThis.Image=class {set src(value){this.width=1;this.height=1;queueMicrotask(()=>this.onload());}};
  assert.equal(await supportsWebP(),true);
  globalThis.Image=class {set src(value){queueMicrotask(()=>this.onerror());}};
  assert.equal(await supportsWebP(),false);
} finally {if(previousImage)globalThis.Image=previousImage;else delete globalThis.Image;}
console.log('PASS: WebP support detection accepts decoding and rejects decode failure.');
