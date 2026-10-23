import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const project=new URL('../../',import.meta.url),report=JSON.parse(await readFile(new URL('scene-lab/assets/optimization-report.json',project),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const material=m=>[m.getBaseColorFactor(),m.getMetallicFactor(),m.getRoughnessFactor(),m.getNormalScale(),m.getOcclusionStrength(),m.getEmissiveFactor(),m.getAlphaMode(),m.getAlphaCutoff(),m.getDoubleSided()];
function tuples(p){const attrs=p.listSemantics().sort().map(s=>p.getAttribute(s));return Array.from({length:attrs[0].getCount()},(_,i)=>attrs.map(a=>Array.from(a.getArray().subarray(i*a.getElementSize(),(i+1)*a.getElementSize())).join(',')).join('|'));}
for(const r of report.assets){
  const raw=await readFile(new URL(r.source,project)),optimized=await readFile(new URL(r.output,project));
  assert.equal(hash(raw),r.source_sha256);assert.equal(hash(optimized),r.output_sha256);
  const a=(await io.readBinary(raw)).getRoot(),b=(await io.readBinary(optimized)).getRoot();
  assert.deepEqual(a.listTextures().map(t=>hash(t.getImage())).sort(),b.listTextures().map(t=>hash(t.getImage())).sort());
  assert.deepEqual(a.listMaterials().map(material),b.listMaterials().map(material));
  const nodeSignature=root=>root.listNodes().filter(n=>n.getMesh()).map(n=>n.getWorldMatrix());
  assert.deepEqual(nodeSignature(a),nodeSignature(b));
  assert.equal(a.listMeshes().length,b.listMeshes().length);
  for(let m=0;m<a.listMeshes().length;m++){
    const src=a.listMeshes()[m].listPrimitives(),dst=b.listMeshes()[m].listPrimitives();assert.equal(src.length,dst.length);
    for(let i=0;i<src.length;i++){
      const original=new Set(tuples(src[i]));
      for(const vertex of tuples(dst[i]))assert.ok(original.has(vertex),`${r.id}: vertex attributes drifted`);
      const count=dst[i].getAttribute('POSITION').getCount(),indices=dst[i].getIndices().getArray();
      assert.equal(indices.length%3,0);for(const ix of indices)assert.ok(ix<count);
      for(const attr of dst[i].listAttributes())for(const v of attr.getArray())assert.ok(Number.isFinite(v));
    }
  }
  console.log(`PASS ${r.id}: original source hash, identical images/PBR/node transforms, retained vertex attributes, valid indices.`);
}
