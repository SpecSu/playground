import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';

test('authored demo props are independently loadable bounded GLBs with honest provenance',async()=>{
 const report=JSON.parse(await readFile(new URL('../public/ugc/authored-demo-manifest.json',import.meta.url),'utf8'));
 for(const id of ['wish-tree','moon-rock']){
  const entry=report.assets[id];assert.equal(entry.source,'authored-demo');
  const bytes=await readFile(new URL(`../public${entry.url}`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.length,entry.bytes);assert.ok(entry.triangles>20&&entry.triangles<3000);
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);const model=await new GLTFLoader().parseAsync(buffer,'');
  const bounds=new Box3().setFromObject(model.scene),size=bounds.getSize(new Vector3());for(const [key,values] of [['min',bounds.min.toArray()],['max',bounds.max.toArray()]] as const)values.forEach((value,i)=>assert.ok(Math.abs(value-entry.bounds[key][i])<1e-6,`${id} ${key}[${i}] bounds mismatch`));assert.ok(size.toArray().every(n=>Number.isFinite(n)&&n>0));assert.equal(model.animations.length,0);assert.equal(model.parser.json.asset.extras.source,'authored-demo');
  const portrait=await readFile(new URL(`../public/ugc/${id}.svg`,import.meta.url),'utf8');assert.ok(portrait.startsWith('<svg'));assert.ok(!/(?:href|src)=|<script|<image/i.test(portrait));
 }
});

test('released HY3D sample matches its verified digest and stays within game budgets',async()=>{
 const report=JSON.parse(await readFile(new URL('../public/ugc/poop-model-manifest.json',import.meta.url),'utf8'));
 const bytes=await readFile(new URL('../public/ugc/poop-pal.glb',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),report.compressed.sha256);assert.equal(bytes.length,report.compressed.bytes);assert.ok(bytes.length<=4*1024*1024);
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 let triangles=0;for(const mesh of json.meshes)for(const primitive of mesh.primitives){triangles+=json.accessors[primitive.indices].count/3;assert.ok('TEXCOORD_0' in primitive.attributes);}
 assert.ok(triangles<=18000);assert.equal(triangles,17500);assert.equal(json.skins?.length??0,0);assert.equal(json.animations?.length??0,0);assert.equal(json.images.length,1);assert.equal(report.compressed.images[0].size[0],1024);assert.equal(report.compressed.images[0].size[1],1024);
 assert.ok(json.buffers.every((buffer:{uri?:string})=>!buffer.uri));assert.ok(json.images.every((image:{uri?:string})=>!image.uri));
});
