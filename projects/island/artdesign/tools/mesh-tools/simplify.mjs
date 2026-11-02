// Offline runtime derivatives only. Keep Tripo sources and embedded image bytes intact.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,compactPrimitive,prune} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../../',import.meta.url));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha=b=>createHash('sha256').update(b).digest('hex');
// Error is a meshoptimizer appearance metric, not a guaranteed pixel/Hausdorff bound.
const plan={dog:{ratio:.45,error:.002},tree:{ratio:.35,error:.003},ground:{ratio:.30,error:.002},
  shrub:{ratio:.50,error:.002},dock:{ratio:.35,error:.002},boat:{ratio:.40,error:.002},
  rock:{ratio:.25,error:.003},fish:{ratio:.35,error:.003}};
function stats(doc){
  const root=doc.getRoot(),accessors=new Set();let triangles=0,vertices=0;
  for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){
    triangles+=p.getIndices().getCount()/3;vertices+=p.getAttribute('POSITION').getCount();
    accessors.add(p.getIndices());for(const a of p.listAttributes())accessors.add(a);
  }
  return {triangles,vertices,geometryBytes:[...accessors].reduce((s,a)=>s+a.getArray().byteLength,0),
    textures:root.listTextures().map(t=>sha(t.getImage())).sort()};
}
await MeshoptSimplifier.ready;
const results=[];
for(const [id,settings] of Object.entries(plan)){
  const source=path.join(project,'scene-lab/assets/models',id,'display.glb');
  const bytes=await readFile(source),doc=await io.readBinary(bytes),before=stats(doc),errors=[];
  assert.equal(doc.getRoot().listSkins().length,0,'Skinned assets require a separate simplification policy.');
  assert.equal(doc.getRoot().listAnimations().length,0);
  await doc.transform(weld());
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    assert.equal(p.getMode(),4);assert.equal(p.listTargets().length,0);
    const position=p.getAttribute('POSITION'),positions=position.getArray(),n=position.getCount();
    assert.ok(positions instanceof Float32Array);
    const normal=p.getAttribute('NORMAL')?.getArray(),uv=p.getAttribute('TEXCOORD_0')?.getArray();
    assert.ok(normal&&uv,'PBR assets must retain normals and UVs.');
    const attrs=new Float32Array(n*5),locks=new Uint8Array(n);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<n;i++)for(let a=0;a<3;a++){min[a]=Math.min(min[a],positions[i*3+a]);max[a]=Math.max(max[a],positions[i*3+a]);}
    for(let i=0;i<n;i++){
      attrs.set([normal[i*3],normal[i*3+1],normal[i*3+2],uv[i*2],uv[i*2+1]],i*5);
      // Keep original extrema so runtime normalization and existing assembly contacts stay stable.
      for(let a=0;a<3;a++)if(Math.abs(positions[i*3+a]-min[a])<1e-6||Math.abs(positions[i*3+a]-max[a])<1e-6)locks[i]=1;
    }
    const originalIndices=p.getIndices(),indices=new Uint32Array(originalIndices.getArray());
    const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attrs,5,
      [.5,.5,.5,1,1],locks,Math.floor(indices.length*settings.ratio/3)*3,settings.error,['LockBorder']);
    errors.push(error);
    p.setIndices(originalIndices.clone().setArray(reduced));
    if(originalIndices.listParents().length===1)originalIndices.dispose();
    compactPrimitive(p);
    if(p.getAttribute('POSITION').getCount()<65535)p.getIndices().setArray(new Uint16Array(p.getIndices().getArray()));
    // No texture rebake, vertex relocation, normal regeneration, or permissive seam collapse.
    assert.deepEqual(p.getAttribute('POSITION').getMin([]),min);
    assert.deepEqual(p.getAttribute('POSITION').getMax([]),max);
  }
  await doc.transform(prune());
  const output=await io.writeBinary(doc),after=stats(await io.readBinary(output));
  assert.deepEqual(after.textures,before.textures,'Embedded texture bytes changed.');
  assert.ok(after.triangles<before.triangles);
  const target=source.replace('display.glb','runtime.glb');await writeFile(target,output);
  const report={id,source:path.relative(project,source),source_sha256:sha(bytes),output:path.relative(project,target),output_sha256:sha(output),
    settings,appearanceError:Math.max(...errors),before:{...before,fileBytes:bytes.length},after:{...after,fileBytes:output.length},
    preserved:'Exact embedded images, retained vertex attributes, UV seams, topological borders, extrema, materials and node transforms.'};
  await writeFile(target.replace('.glb','.json'),JSON.stringify(report,null,2)+'\n');results.push(report);
  console.log(`${id}: ${before.triangles} -> ${after.triangles} triangles (${(100*(1-after.triangles/before.triangles)).toFixed(1)}% fewer); error ${report.appearanceError.toFixed(6)}`);
}
await writeFile(path.join(project,'scene-lab/assets/optimization-report.json'),JSON.stringify({version:'0.4',algorithm:'meshoptimizer 1.0.1 simplifyWithAttributes; glTF Transform 4.3.0',assets:results},null,2)+'\n');
