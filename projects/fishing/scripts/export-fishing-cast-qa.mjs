/** Export production poses while retaining the original GLB binary/texture bytes. */
import '../tests/room-loader.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {uploadedAvatar,glbDocument} from '../tests/helpers/uploaded-avatar.mjs';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {createFishingRod} from '../lib/fishing-rod.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
import {positionFishingCatchArrival} from '../lib/fishing-catch-motion.ts';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {createMarineModel,animateMarineModel} from '../components/fishing/MarineModels.ts';
import {catchDisplayScale,FISHING_DECK_Y} from '../lib/fishing-world.ts';

const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const output=resolve(option('--out','.local-qa/v031/final-visual'));
const ids=option('--ids','').split(',').filter(Boolean),requestedStages=option('--stages','').split(',').filter(Boolean);
const cases=[
 {stage:'idle',title:'Idle',phase:'idle',elapsed:0},
 {stage:'cast320',title:'Cast +320 ms',phase:'waiting',elapsed:320},
 {stage:'haul700',title:'Haul +700 ms',phase:'holding',elapsed:700,species:'clownfish',cm:14},
 {stage:'support1180',title:'Support +1180 ms',phase:'holding',elapsed:1180,species:'tuna',cm:160},
 {stage:'smallsettled',title:'Clownfish 14 cm',phase:'holding',elapsed:2000,species:'clownfish',cm:14},
 {stage:'puffer55',title:'Pufferfish 55 cm',phase:'holding',elapsed:2000,species:'pufferfish',cm:55},
 {stage:'tuna160',title:'Tuna 160 cm',phase:'holding',elapsed:2000,species:'tuna',cm:160},
 {stage:'manta400',title:'Manta ray 400 cm',phase:'holding',elapsed:2000,species:'manta-ray',cm:400},
].filter(c=>!requestedStages.length||requestedStages.includes(c.stage));
const catalog=FISHING_AVATAR_CATALOG.filter(c=>!ids.length||ids.includes(c.id));
if(args.includes('--help')||args.includes('--dry-run')){console.log(JSON.stringify({output,characters:catalog.map(c=>c.id),cases,usage:'node --experimental-strip-types scripts/export-fishing-cast-qa.mjs [--out PATH] [--ids id,id] [--stages stage,stage] [--no-verify]'},null,2));process.exit(0);}
mkdirSync(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=['lib/fishing-avatar.ts','lib/fishing-surface-contact.ts','lib/fishing-action-motion.ts','lib/fishing-catch-motion.ts','lib/fishing-rod.ts','components/fishing/MarineModels.ts','components/fishing/YachtScene.tsx'];
const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(readFileSync(p))]));
function binaryChunk(bytes){const offset=20+bytes.readUInt32LE(12);assert.equal(bytes.toString('ascii',offset+4,offset+8),'BIN\0');return bytes.subarray(offset+8,offset+8+bytes.readUInt32LE(offset));}
function imageHashes(doc,binary){return (doc.images??[]).map(image=>{const view=doc.bufferViews[image.bufferView];return {name:image.name,mimeType:image.mimeType,sha256:hash(binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))};});}
function poseSourceGlb(bytes,avatar){
 const doc=glbDocument(bytes),binary=binaryChunk(bytes),roots=new Set((doc.scenes??[]).flatMap(s=>s.nodes??[]));
 avatar.root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(avatar.root.matrixWorld).invert();
 for(let i=0;i<doc.nodes.length;i++){
  const node=doc.nodes[i],actual=avatar.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(node.name??''));if(!actual)continue;
  if(roots.has(i)){node.matrix=new THREE.Matrix4().multiplyMatrices(inverse,actual.matrixWorld).toArray();delete node.translation;delete node.rotation;delete node.scale;}
  else{node.translation=actual.position.toArray();node.rotation=actual.quaternion.toArray();node.scale=actual.scale.toArray();delete node.matrix;}
 }
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+8+binary.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.write('BIN\0',4);const result=Buffer.concat([header,json,bh,binary]);assert.equal(hash(binaryChunk(result)),hash(binary));return {bytes:result,images:imageHashes(doc,binary),binaryHash:hash(binary)};
}
async function verifyPose(bytes,avatar){
 const loader=new GLTFLoader().register(()=>({name:'offline-texture-placeholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const scene=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);avatar.root.updateMatrixWorld(true);
 const inverse=new THREE.Matrix4().copy(avatar.root.matrixWorld).invert();let sampled=0,maxError=0;
 avatar.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const copy=scene.getObjectByName(mesh.name);assert.ok(copy?.isSkinnedMesh,`Missing posed mesh ${mesh.name}`);assert.equal(copy.geometry.attributes.position.count,mesh.geometry.attributes.position.count,'Source geometry was changed: binary-only export is insufficient');mesh.skeleton.update();copy.skeleton.update();const count=mesh.geometry.attributes.position.count;for(let i=0;i<count;i+=Math.max(1,Math.floor(count/97))){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse),q=copy.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(copy.matrixWorld);maxError=Math.max(maxError,p.distanceTo(q));sampled++;}});
 assert.ok(maxError<.00002,`Posed GLB differs from production skin by ${maxError}m`);return {sampledVertices:sampled,maxError};
}
function staticMeshes(root){root.updateMatrixWorld(true);const rows=[];root.traverseVisible(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,pos=g.attributes.position,mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;const vertices=Array.from({length:pos.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).toArray());rows.push({name:mesh.name||'mesh',vertices,indices:g.index?Array.from(g.index.array):vertices.map((_,i)=>i),vertexColors:g.attributes.color?Array.from({length:pos.count},(_,i)=>[g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i)]):null,color:mat.color?.toArray()??[1,1,1],roughness:mat.roughness??.4,metalness:mat.metalness??0,opacity:mat.opacity??1});});return rows;}
const report={generatedAt:new Date().toISOString(),sourceHashes,coordinateSystem:'Production avatar-local, metres, +Y up, +Z forward. Nominal main-deck water source; no yacht sway.',catalog:catalog.map(({id,label})=>({id,label})),stages:cases,poses:[]};
for(const {id,label} of catalog){
 const template=await uploadedAvatar(id),sourceBytes=readFileSync(`public/avatars/cast-v1/${id}.glb`);
 for(const c of cases){
  const avatar=createFishingAvatar(id,'qa-render',{template});let fish,fishSize=new THREE.Vector3(),scale=1;
  if(c.species){fish=createMarineModel(c.species,c.cm);scale=catchDisplayScale(c.cm);fish.scale.setScalar(scale);fishSize=avatar.prepareCatch(fish);}
  const state=c.phase==='waiting'?{phase:c.phase,castAt:1000}:c.phase==='holding'?{phase:c.phase,catch:{id:`qa-${c.stage}`,caughtAt:1000,speciesId:c.species,lengthCm:c.cm}}:{phase:c.phase};
  const time=c.phase==='idle'?0:1000+c.elapsed,pose=sampleFishingAction(state,time);
  avatar.updateFishing(time/1000,c.phase,false,scale*1.6,pose,undefined,fishSize);
  const rod=createFishingRod(new THREE.MeshStandardMaterial({color:'#25445a',roughness:.25,metalness:.55}),new THREE.MeshStandardMaterial({color:'#f5ce72',roughness:.4,metalness:.55}));
  rod.position.copy(avatar.rodPosition);rod.quaternion.copy(avatar.rodQuaternion);rod.updateRestPose(pose.restProgress);rod.visible=pose.rodVisible;
  const destination=new THREE.Vector3(),water=new THREE.Vector3(-.7,.085-FISHING_DECK_Y,4.2);let actualCatch;
  if(fish){avatar.positionCatch(destination,fishSize);actualCatch=new THREE.Vector3();positionFishingCatchArrival(actualCatch,water,destination,fishSize,pose.haulProgress,avatar.catchApproachDirection);fish.position.copy(actualCatch);fish.visible=pose.catchVisible;animateMarineModel(fish,time/1000,pose.haulProgress);}
  const prefix=`${id}-${c.stage}`,posed=poseSourceGlb(sourceBytes,avatar),fidelity=args.includes('--no-verify')?null:await verifyPose(posed.bytes,avatar);
  writeFileSync(resolve(output,`${prefix}.glb`),posed.bytes);
  const geometry={rod:pose.rodVisible?staticMeshes(rod):[],fish:fish&&pose.catchVisible?staticMeshes(fish):[]};writeFileSync(resolve(output,`${prefix}-meshes.json`),JSON.stringify(geometry));
  const row={id,label,stage:c.stage,title:c.title,file:`${prefix}.glb`,meshesFile:`${prefix}-meshes.json`,height:avatar.height,elapsed:c.elapsed,time,pose,fishSpecies:c.species??null,fishCm:c.cm??null,fishSize:fishSize.toArray(),fishRotation:fish?.rotation.toArray()??null,catchDestination:destination.toArray(),catchPosition:actualCatch?.toArray()??null,rodPosition:avatar.rodPosition.toArray(),rodQuaternion:avatar.rodQuaternion.toArray(),wrists:Object.fromEntries(['L','R'].map(side=>[side,avatar.root.worldToLocal(avatar.root.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3())).toArray()])),sourceGlbHash:hash(sourceBytes),binaryHash:posed.binaryHash,images:posed.images,fidelity};
  report.poses.push(row);writeFileSync(resolve(output,'poses.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id,stage:c.stage,textureBytesUnchanged:true,fidelity}));avatar.dispose();
 }
}
report.endSourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(readFileSync(p))]));report.changedDuringExport=sourceFiles.filter(p=>sourceHashes[p]!==report.endSourceHashes[p]);writeFileSync(resolve(output,'poses.json'),JSON.stringify(report,null,2));if(!args.includes('--allow-source-change'))assert.deepEqual(report.changedDuringExport,[],'Production source changed during export');
console.log(`Exported ${report.poses.length} production poses to ${output}; original GLB binary and texture hashes retained.`);
