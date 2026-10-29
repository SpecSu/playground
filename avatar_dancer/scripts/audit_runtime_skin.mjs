// Offline cross-engine skin audit. No browser/GPU rendering claim.
// node scripts/audit_runtime_skin.mjs INPUT.glb OUTPUT.json
import fs from 'node:fs';
import pathModule from 'node:path';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node audit_runtime_skin.mjs INPUT.glb OUTPUT.json');
let path=pathModule.resolve(process.argv[2]),source=fs.readFileSync(path),n=source.readUInt32LE(12),j=JSON.parse(source.subarray(20,20+n)),bin=source.subarray(28+n);
// Geometry/rig data unchanged: omit materials only, to remove Node's lack of image decode.
delete j.images;delete j.textures;delete j.materials;for(const m of j.meshes)for(const p of m.primitives)delete p.material;
let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);let bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);let b=Buffer.concat([h,json,bh,bin]);let g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');g.scene.updateMatrixWorld(true);
let meshes=[];g.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
let points=[];for(let mi=0;mi<meshes.length;mi++){
  const m=meshes[mi],p=m.geometry.attributes.position;
  // Clipped GLBs may keep unused original accessor entries; Blender drops those.
  // Only referenced vertices are rendered and can be compared meaningfully.
  const pool=m.geometry.index?[...new Set(m.geometry.index.array)].sort((a,b)=>a-b):Array.from({length:p.count},(_,i)=>i);
  const count=Math.min(20,pool.length),sourceMesh=g.parser.associations.get(m)?.meshes;
  const sourceNodes=j.nodes.filter(n=>n.mesh===sourceMesh).map(n=>n.name||'(unnamed)');
  for(let i=0;i<count;i++){
    const vi=pool[Math.floor(i*(pool.length-1)/Math.max(1,count-1))];
    const v=new T.Vector3().fromBufferAttribute(p,vi).applyMatrix4(m.matrixWorld);
    const influences={};for(let k=0;k<4;k++){const joint=m.geometry.attributes.skinIndex.getComponent(vi,k),weight=m.geometry.attributes.skinWeight.getComponent(vi,k);if(weight>0){const name=m.skeleton.bones[joint].name.replace(/[^a-z0-9]/gi,'');influences[name]=(influences[name]||0)+weight;}}
    points.push({mesh:mi,name:m.name,sourceMesh,sourceNodes,influences,role:sourceNodes.some(n=>/DONOR_HEAD|CANONICAL/i.test(n))?'head':'body',vertex:vi,rest:v.toArray()});
  }
}
let mixer=new T.AnimationMixer(g.scene),out={source:path,sourceSha256:createHash('sha256').update(source).digest('hex'),note:'Original rig/geometry; materials omitted only to avoid Node image decoding. Not a browser render.',points,clips:[]};
for(let c of g.animations){mixer.stopAllAction();let a=mixer.clipAction(c);a.reset().play();let samples=[];for(let f of [.13,.47,.81]){mixer.setTime(c.duration*f);g.scene.updateMatrixWorld(true);meshes.forEach(m=>m.skeleton.update());samples.push({seconds:c.duration*f,points:points.map(p=>{let m=meshes[p.mesh],v=new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,p.vertex);m.applyBoneTransform(p.vertex,v);return v.applyMatrix4(m.matrixWorld).toArray();})});}out.clips.push({name:c.name,duration:c.duration,samples});}
fs.writeFileSync(process.argv[3],JSON.stringify(out));console.log({meshes:meshes.map(m=>[m.name,m.geometry.attributes.position.count]),points:points.length,clips:out.clips.map(c=>c.name)});
