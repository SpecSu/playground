import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const directory=new URL('../public/assets/characters/',import.meta.url);
function read(name){const b=fs.readFileSync(new URL(name,directory));assert.equal(b.toString('ascii',0,4),'glTF');const n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));return {j,binary:b.subarray(28+n)}}
function view(asset,i){const v=asset.j.bufferViews[i],s=v.byteOffset||0;return asset.binary.subarray(s,s+v.byteLength)}
for(const person of ['jiji','lx'])for(let outfit=0;outfit<3;outfit++)test(`${person} ${outfit}: complete native or canonical head, 23-bone/3-clip rig, safe low texture variant`,()=>{
 const high=read(`${person}-${outfit}.glb`),low=read(`${person}-${outfit}_low.glb`);
 for(const a of [high,low]){if(person==='jiji'){assert.equal(a.j.meshes.length,1,'native Jiji body/head stays one intact mesh');const ps=a.j.meshes[0].primitives;assert(ps.length>1,'independent fitted hat primitives missing');assert.equal(a.j.accessors[ps[0].indices].count,[146244,143388,142764][outfit],'complete native face/hair/garment indices must not be deleted');assert(a.j.extras?.nativeHatFit||a.j.extras?.nativeRedBonnet,'native fitted-hat provenance missing');}else{assert(a.j.meshes.length>=2,'costume and derived head must both exist');}assert.equal(a.j.skins.length,1);assert.equal(a.j.skins[0].joints.length,23);assert.equal(a.j.animations.length,3);assert(a.j.animations.every(c=>c.channels.length===69));assert(a.j.images.every(i=>i.bufferView!==undefined&&!i.uri),'no external/private image references');if(person!=='jiji')assert(a.j.nodes.some(n=>/DONOR_HEAD|CANONICAL/.test(n.name||'')),'real derived head mesh missing');else assert(a.j.skins[0].joints.some(j=>/Head$/i.test(a.j.nodes[j].name||'')),'native Head joint missing');}
 const imageViews=new Set(high.j.images.map(i=>i.bufferView));assert.equal(high.j.bufferViews.length,low.j.bufferViews.length);
 for(let i=0;i<high.j.bufferViews.length;i++)if(!imageViews.has(i))assert.deepEqual(view(high,i),view(low,i),'low variant must preserve every geometry/animation byte');
});
