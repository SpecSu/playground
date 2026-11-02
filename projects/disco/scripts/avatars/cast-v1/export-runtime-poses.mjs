/** Bake actual Three.js skin into original textured GLBs for offline QA only.
 * node --experimental-strip-types --import ./tests/room-loader.mjs scripts/avatars/cast-v1/export-runtime-poses.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { CLUB_AVATAR_SCALE } from '../../../lib/club-avatar-scale.ts';
import { createClubAvatar } from '../../../lib/club-avatar-rig.ts';
import { UPLOADED_CAST, uploadedTemplate, actualBounds } from '../../../tests/helpers/uploaded-avatar.ts';
const output=process.argv[2]??'/tmp/disco-cast-review';mkdirSync(output,{recursive:true});
const isSceneScale=process.argv.includes('--scene-scale');
const sceneScale=isSceneScale?CLUB_AVATAR_SCALE:1;
const metrics=[];
for(const kind of [...UPLOADED_CAST,'dj-kunkun']){
 const bytes=readFileSync(new URL(`../../../public/avatars/cast-v1/${kind}.glb`,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12);const original=JSON.parse(bytes.subarray(20,20+jsonLength));
 const binStart=20+jsonLength+8;const originalBinary=bytes.subarray(binStart,binStart+bytes.readUInt32LE(20+jsonLength));
 const figure=createClubAvatar(kind,`render:${kind}`,{template:await uploadedTemplate(kind),mode:kind==='dj-kunkun'?'dj':'dance'});
 figure.root.scale.setScalar(sceneScale);
 if(isSceneScale&&kind==='dj-kunkun')figure.root.position.z=-1.3;
 for(const [pose,beat,action] of [['dance',.37,'dance'],['bounce',1.325,'bounce']]){
  figure.update(beat,action,false,1);figure.root.updateMatrixWorld(true);
  let mesh;figure.root.traverse(n=>{if(n instanceof THREE.SkinnedMesh)mesh=n});
  if(!mesh)throw Error(`missing actual mesh ${kind}`);
  const geometry=mesh.geometry.clone();const position=geometry.attributes.position;const point=new THREE.Vector3();
  for(let i=0;i<position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);position.setXYZ(i,point.x,point.y,point.z)}
  geometry.computeVertexNormals();
  const json=structuredClone(original),binaryParts=[originalBinary];let binaryLength=originalBinary.length;
  const append=(attribute)=>{
   const data=Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);const pad=(4-binaryLength%4)%4;if(pad){binaryParts.push(Buffer.alloc(pad));binaryLength+=pad}
   const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:binaryLength,byteLength:data.length,target:34962});binaryParts.push(data);binaryLength+=data.length;
   const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<attribute.count;i++)for(let c=0;c<3;c++){const v=attribute.getComponent(i,c);min[c]=Math.min(min[c],v);max[c]=Math.max(max[c],v)}
   const accessor=json.accessors.length;json.accessors.push({bufferView:view,componentType:5126,count:attribute.count,type:'VEC3',min,max});return accessor;
  };
  const primitive=json.meshes[0].primitives[0];primitive.attributes.POSITION=append(position);primitive.attributes.NORMAL=append(geometry.attributes.normal);
  delete primitive.attributes.JOINTS_0;delete primitive.attributes.WEIGHTS_0;delete primitive.attributes.TANGENT;
  json.nodes=[{mesh:0,name:`${kind}-${pose}`}];json.scenes=[{nodes:[0]}];json.scene=0;delete json.skins;delete json.animations;
  json.buffers=[{byteLength:binaryLength}];json.asset.extras={...json.asset.extras,offlineQa:'actual runtime deformed vertices',pose,beat};
  let jsonChunk=Buffer.from(JSON.stringify(json));const jp=(4-jsonChunk.length%4)%4;jsonChunk=Buffer.concat([jsonChunk,Buffer.alloc(jp,32)]);
  let bin=Buffer.concat(binaryParts);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonChunk.length+8+bin.length,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonChunk.length,0);jh.writeUInt32LE(0x4e4f534a,4);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
  writeFileSync(resolve(output,`${kind}-${pose}.glb`),Buffer.concat([header,jh,jsonChunk,bh,bin]));
  const bounds=actualBounds(figure.root);metrics.push({kind,pose,beat,height:figure.height,min:bounds.min.toArray(),max:bounds.max.toArray()});geometry.dispose();
 }
 figure.dispose();
}
writeFileSync(resolve(output,'runtime-pose-metrics.json'),JSON.stringify(metrics,null,2));console.log(`Baked ${metrics.length} exact poses to ${output}`);
