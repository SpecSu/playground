/** Read-only asset audit. Only writes its own docs/evidence JSON report.
 * Run: node --experimental-strip-types scripts/audit-twenty-candidates.mjs
 * This is CPU evidence, not visual/gameplay/FPS approval.
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {AnimationMixer, Bone, Box3, LoopOnce, Matrix4, Mesh, SkinnedMesh, Vector3} from 'three';
import {loadLabGlb} from './validate-animation-lab.ts';
import {validateLoadedLabAsset} from '../src/animation-lab/asset-loader.ts';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, 'src/animation-lab/manifest.json'), 'utf8'));
const index = JSON.parse(readFileSync(path.join(root, 'public/models/animation-lab/asset-index.json'), 'utf8'));
const required = ['idle', 'walk', 'drink_enter', 'drink_loop', 'drink_exit', 'eat', 'rest', 'carried', 'react'];
const seven = new Set(['fox', 'raccoon', 'hedgehog', 'wolf', 'tiger', 'lion', 'dog']);
const thirteen = new Set([...seven, 'bear', 'capybara', 'cat', 'chicken', 'crocodile', 'deer']);
const selected = new Set(['dog', 'fox', 'hedgehog', 'lion', 'tiger', 'raccoon']);
const hash = data => createHash('sha256').update(data).digest('hex');
const arr = vector => vector.toArray().map(n => +n.toFixed(8));
const boxJSON = box => ({min: arr(box.min), max: arr(box.max), size: arr(box.getSize(new Vector3()))});
function parseGLB(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header');
  let json, bin;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString());
    if (type === 0x004e4942) bin = data;
    offset += length + 8;
  }
  if (!json || !bin) throw new Error('Missing JSON/BIN chunk');
  return {json, bin};
}
const types = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16};
const bytesPerComponent = {5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4};
function accessorBytes(json, bin, id) {
  const accessor = json.accessors[id], view = json.bufferViews[accessor.bufferView];
  if (accessor.sparse || view.byteStride) throw new Error('Audit expects dense noninterleaved exporter accessors');
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return bin.subarray(start, start + accessor.count * types[accessor.type] * bytesPerComponent[accessor.componentType]);
}
function footprint(box, x, y, z) { box.expandByPoint(new Vector3(x, y, z)); }
function sampleSkin(meshes, footBones, previous, bounds, footBounds, contactBounds, regions) {
  let motion = 0, invalid = 0;
  const buffers = [];
  for (const [mi, mesh] of meshes.entries()) {
    mesh.skeleton.update();
    const positions = mesh.geometry.getAttribute('position'), joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const matrices = mesh.skeleton.bones.map((bone, i) => new Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix).elements);
    const output = new Float64Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      let ox=0, oy=0, oz=0, dominant=-1, largest=-1;
      for (let k=0; k<4; k++) {
        const weight=weights.getComponent(i,k), joint=joints.getComponent(i,k);
        if (weight>largest) { largest=weight; dominant=joint; }
        if (!weight) continue;
        const m=matrices[joint];
        ox+=weight*(m[0]*x+m[4]*y+m[8]*z+m[12]);
        oy+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]);
        oz+=weight*(m[2]*x+m[6]*y+m[10]*z+m[14]);
      }
      if (![ox,oy,oz].every(Number.isFinite)) invalid++;
      footprint(bounds,ox,oy,oz);
      if (regions) {
        const name=mesh.skeleton.bones[dominant]?.name;
        let region=regions.get(name);
        if (!region) {region={vertices:0,bounds:new Box3()};regions.set(name,region);}
        region.vertices++;footprint(region.bounds,ox,oy,oz);
      }
      if (footBones.has(mesh.skeleton.bones[dominant]?.name)) footprint(footBounds,ox,oy,oz);
      if (oy<=.02) footprint(contactBounds,ox,oy,oz);
      output[i*3]=ox; output[i*3+1]=oy; output[i*3+2]=oz;
      if (previous) motion=Math.max(motion,Math.hypot(ox-previous[mi][i*3],oy-previous[mi][i*3+1],oz-previous[mi][i*3+2]));
      if (i===0) {
        const actual=mesh.applyBoneTransform(i,new Vector3(x,y,z)).applyMatrix4(mesh.matrixWorld);
        if (actual.distanceTo(new Vector3(ox,oy,oz))>1e-7) throw new Error('Independent skin equation disagrees with Three.js');
      }
    }
    buffers.push(output);
  }
  return {buffers,motion,invalid};
}

const reports=[];
for (const asset of manifest.assets) {
  const relativeFile=path.join('public',asset.url), file=path.join(root,relativeFile), bytes=readFileSync(file), {json,bin}=parseGLB(bytes);
  const primitives=json.meshes.flatMap(mesh=>mesh.primitives);
  const geometryHash=createHash('sha256');
  for (const primitive of primitives) for (const key of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']) geometryHash.update(key).update(accessorBytes(json,bin,primitive.attributes[key]));
  for (const primitive of primitives) geometryHash.update(accessorBytes(json,bin,primitive.indices));
  const gltf=await loadLabGlb(file), nodes=new Map(), meshes=[], bones=[];
  gltf.scene.traverse(node=>{nodes.set(node.name,node);if(node instanceof Mesh)meshes.push(node);if(node instanceof Bone)bones.push(node);});
  gltf.scene.updateMatrixWorld(true);
  const failures=[], sha256=hash(bytes), fullEnvelope=new Box3(new Vector3(...index.assets[asset.id].bounds.min),new Vector3(...index.assets[asset.id].bounds.max));
  if (sha256!==index.assets[asset.id].sha256 || bytes.length!==index.assets[asset.id].bytes) failures.push('Actual bytes do not match lab asset index');
  try {validateLoadedLabAsset(asset,{scene:gltf.scene,clips:gltf.animations,bounds:fullEnvelope,dispose(){}});} catch(error) {failures.push(String(error.message));}
  if (meshes.some(mesh=>!(mesh instanceof SkinnedMesh))) failures.push('Visible unskinned mesh');
  const neck=[...asset.anchors.neck,asset.anchors.head].map(name=>nodes.get(name));
  if (neck.some(node=>!(node instanceof Bone)) || neck[1]?.parent!==neck[0] || neck[2]?.parent!==neck[1]) failures.push('Farm neck-chain parentage invalid');
  const feet=asset.anchors.feet.map(name=>({anchor:name,bone:nodes.get(name)?.parent?.name}));
  const footBones=new Set(feet.map(foot=>foot.bone));
  const regions=new Map(), restBounds=new Box3();
  sampleSkin(meshes,footBones,undefined,restBounds,new Box3(),new Box3(),regions);
  const morphology={restBounds:boxJSON(restBounds),dominantBoneRegions:Object.fromEntries([...regions].map(([name,region])=>[name.replace(`${asset.id}_`,''),{vertices:region.vertices,bounds:boxJSON(region.bounds)}])),restBonePositions:Object.fromEntries(bones.map(bone=>[bone.name.replace(`${asset.id}_`,''),{parent:bone.parent?.name.replace(`${asset.id}_`,''),local:arr(bone.position),world:arr(bone.getWorldPosition(new Vector3())),parentDistance:bone.position.length()}]))};
  const clips=[], mixer=new AnimationMixer(gltf.scene), sampledBounds=new Box3();
  const rootNode=nodes.get(asset.anchors.root), rootPosition=rootNode.getWorldPosition(new Vector3());
  for(const name of required) {
    const clip=gltf.animations.find(clip=>clip.name===name);
    if (!clip) {failures.push(`Missing farm clip ${name}`);continue;}
    mixer.stopAllAction();
    const action=mixer.clipAction(clip).reset().setLoop(LoopOnce,1); action.clampWhenFinished=true;action.play();
    const bounds=new Box3(), footBounds=new Box3(), contactBounds=new Box3(), mouthBounds=new Box3();
    let initial, maximumVertexMotion=0, maximumRootMotion=0, invalidVertices=0, firstMouth, lastMouth;
    const sampleTimes=Array.from({length:Math.ceil(clip.duration*24)+1},(_,i)=>Math.min(i/24,clip.duration));
    for(const time of sampleTimes) {
      mixer.setTime(time);gltf.scene.updateMatrixWorld(true);
      const frame=sampleSkin(meshes,footBones,initial,bounds,footBounds,contactBounds);
      initial??=frame.buffers; maximumVertexMotion=Math.max(maximumVertexMotion,frame.motion);invalidVertices+=frame.invalid;
      maximumRootMotion=Math.max(maximumRootMotion,rootNode.getWorldPosition(new Vector3()).distanceTo(rootPosition));
      const mouth=nodes.get(asset.anchors.mouth).getWorldPosition(new Vector3());
      mouthBounds.expandByPoint(mouth);firstMouth??=arr(mouth);lastMouth=arr(mouth);
    }
    if (invalidVertices) failures.push(`${name}: nonfinite deformed vertices`);
    if (maximumVertexMotion<=.001) failures.push(`${name}: no >1mm sampled weighted deformation`);
    if (maximumRootMotion>1e-5) failures.push(`${name}: root moves >1e-5m`);
    sampledBounds.union(bounds);
    clips.push({name,durationSeconds:clip.duration,trackCount:clip.tracks.length,samples:sampleTimes.length,sampledVertices:sampleTimes.length*meshes.reduce((sum,mesh)=>sum+mesh.geometry.getAttribute('position').count,0),bounds:boxJSON(bounds),footSkinBounds:boxJSON(footBounds),nearGroundSkinBounds:contactBounds.isEmpty()?null:boxJSON(contactBounds),mouthBounds:boxJSON(mouthBounds),mouthStart:firstMouth,mouthEnd:lastMouth,maximumVertexMotion,maximumRootMotion,invalidVertices});
  }
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
  const animationAccessors=new Set(json.animations.flatMap(animation=>animation.samplers.flatMap(sampler=>[sampler.input,sampler.output])));
  const constantOutputs=json.animations.flatMap(animation=>animation.samplers).filter(sampler=>{
    const accessor=json.accessors[sampler.output], data=accessorBytes(json,bin,sampler.output), stride=types[accessor.type]*bytesPerComponent[accessor.componentType], first=data.subarray(0,stride);
    for(let offset=stride;offset<data.length;offset+=stride) if(!first.equals(data.subarray(offset,offset+stride))) return false;
    return accessor.count>1;
  }).length;
  const report={species:asset.id,selectedCandidate:selected.has(asset.id),historicalInspectionSeven:seven.has(asset.id),historicalInspectionThirteen:thirteen.has(asset.id),donor:{path:relativeFile,sha256,geometrySha256:geometryHash.digest('hex'),bytes:bytes.length,generator:json.asset.generator,manifestSource:asset.source,manifestSourcePresent:existsSync(path.join(root,asset.source)),manifestStatus:asset.status},vertices:primitives.reduce((n,p)=>n+json.accessors[p.attributes.POSITION].count,0),triangles:primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),skinCount:json.skins.length,boneCount:bones.length,skinnedMeshCount:meshes.length,materials:json.materials.length,draws:primitives.length,imageCount:(json.images??[]).length,textureCount:(json.textures??[]).length,embeddedImageBytes:(json.images??[]).reduce((n,image)=>n+(json.bufferViews[image.bufferView]?.byteLength??0),0),extensionsUsed:json.extensionsUsed??[],clipNames:json.animations.map(animation=>animation.name),requiredFarmClipsPresent:required.every(name=>json.animations.some(animation=>animation.name===name)),anchors:asset.anchors,feet,neckChain:neck.map(node=>node.name),strideMeters:asset.strideMeters,claimedFullClipBounds:boxJSON(fullEnvelope),sampledRequiredClipBounds:boxJSON(sampledBounds),actualIndexIdentityMatches:sha256===index.assets[asset.id].sha256&&bytes.length===index.assets[asset.id].bytes,labLoaderAndCPUFailures:failures,compression:{gzipLevel9Bytes:gzipSync(bytes,{level:9}).length,brotliQuality6Bytes:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:6}}).length,uniqueAnimationAccessorBytes:[...animationAccessors].reduce((n,id)=>n+accessorBytes(json,bin,id).length,0),constantOutputSamplers:constantOutputs,textureReductionAvailable:false},clips};
  const byName=Object.fromEntries(clips.map(clip=>[clip.name,clip]));
  const horizontal=box=>({side:Math.max(Math.abs(box.min[0]),Math.abs(box.max[0])),front:box.max[2],back:-box.min[2]});
  report.morphology=morphology;
  report.profileMeasurements={source:'Fresh 24fps actual-skin samples; raw local meters, no safety slack or reach/IK guarantee. drinkDatumStart is actual drink_loop t=0 mouth, not an envelope midpoint.',idleHeight:byName.idle.bounds.size[1],stride:asset.strideMeters,strideSource:'Preexisting lab manifest; not newly fitted from planted-foot travel.',walkDuration:byName.walk.durationSeconds,cyclesPerSecond:1/byName.walk.durationSeconds,feet:horizontal(byName.idle.footSkinBounds),walkFeet:horizontal(byName.walk.footSkinBounds),walkContactFeet:horizontal(byName.walk.nearGroundSkinBounds),drinkMouthEnvelope:byName.drink_loop.mouthBounds,drinkDatumStart:[...byName.drink_loop.mouthStart],carriedMinimumY:byName.carried.bounds.min[1],rootAnchor:asset.anchors.root,headAnchor:asset.anchors.head,supportAnchor:asset.anchors.support};
  reports.push(report);
  console.log(`${asset.id}: ${failures.length?'FAIL':'CPU PASS'} ${report.vertices}v/${report.triangles}t; ${bytes.length}B; gzip ${report.compression.gzipLevel9Bytes}B; ${report.clipNames.length} clips; ${failures.join('; ')}`);
}
const sum=(items,field)=>items.reduce((n,r)=>n+field(r),0);
const morphologyComparisons=[['fox','wolf'],['dog','bear'],['chicken','parrot'],['tiger','lion']].map(([left,right])=>{
  const a=reports.find(r=>r.species===left),b=reports.find(r=>r.species===right);
  const metrics=r=>{
    const bone=r.morphology.restBonePositions,region=r.morphology.dominantBoneRegions;
    return {bodyWidth:region.body.bounds.size[0],bodyDepth:region.body.bounds.size[2],headWidth:region.head.bounds.size[0],headDepth:region.head.bounds.size[2],leftEarHeight:region.ear_L?.bounds.size[1]??null,tailDistalSegmentLength:bone.tail_3?.parentDistance??null,neckDistalSegmentLength:bone.neck_02.parentDistance,headWidthOverBodyWidth:region.head.bounds.size[0]/region.body.bounds.size[0],tailOverNeck:(bone.tail_3?.parentDistance??0)/bone.neck_02.parentDistance};
  };
  return {left,right,equalVertexAndTriangleTotals:a.vertices===b.vertices&&a.triangles===b.triangles,actualGeometryIdentityEqual:a.donor.geometrySha256===b.donor.geometrySha256,leftMeasurements:metrics(a),rightMeasurements:metrics(b),interpretation:'Independent actual geometric and skeleton dimensions, not file/name/color hashes. Unequal normalized head/body or tail/neck ratios rule out a rename/recolor or uniform-scale-only copy. This does not certify visual species recognition.'};
});
const output={schema:'twenty-species-candidate-audit/v1',generatedAt:new Date().toISOString(),method:'Actual local GLB JSON/BIN+SHA256; existing GLTFLoader and lab loaded-asset validation; all vertices of required9 farm clips at 24fps plus endpoints, independently evaluated CPU skinning cross-checked against Three.js on first vertex of every mesh/frame. No source file mutations.',requiredFarmClips:required,candidateCount:reports.length,historicalInspectionSubset:{status:'Historical inspection only; not the selected production expansion or permission to replace corresponding existing appearances.',seven:[...seven],thirteen:[...thirteen]},totals:{rawBytes:sum(reports,r=>r.donor.bytes),gzipLevel9Bytes:sum(reports,r=>r.compression.gzipLevel9Bytes),brotliQuality6Bytes:sum(reports,r=>r.compression.brotliQuality6Bytes),historicalSevenRawBytes:sum(reports.filter(r=>r.historicalInspectionSeven),r=>r.donor.bytes),historicalSevenGzipBytes:sum(reports.filter(r=>r.historicalInspectionSeven),r=>r.compression.gzipLevel9Bytes)},uniqueFileIdentities:new Set(reports.map(r=>r.donor.sha256)).size,uniqueGeometryIdentities:new Set(reports.map(r=>r.donor.geometrySha256)).size,allPassed:reports.every(r=>!r.labLoaderAndCPUFailures.length),limitations:['No browser, CUA, GPU, hardware FPS, screenshot, gameplay or visual-art evidence.','Lab donor manifest status remains prototype. This report is not production admission.','Generated author contacts/metrics/blend sources are absent in this checkout; full validate-animation-lab main cannot be rerun and would mutate preexisting metadata.','Required9 clips were CPU sampled; extra clips were structurally validated but not animated in this audit.','Ground support phases, gait sliding, semantic anatomy/art quality, gameplay pond contact, carry positioning, persistence, resource-provider gates and interaction behavior remain runtime/visual work.','Compression byte counts are actual in-memory lossless transport encodings, not deployed asset changes or verified server Content-Encoding.','Full-clip bounds shown as claimed are preexisting index metadata, separately checked against loaded rest pose by the existing loader. Required9 sampled bounds are fresh measurements.'],assets:reports};
output.morphologyComparisons=morphologyComparisons;
const selectedReports=reports.filter(report=>report.selectedCandidate);
output.selectedCandidateSubset={species:[...selected],count:selectedReports.length,selectionBasis:'Final parent inventory decision: eleven Hunyuan models including parrot plus formal sheep/pig/duck form fourteen; only these six lab donors supplement the inventory to twenty. This is selection metadata, not gameplay approval.',excludedWolfReason:'Avoid confusion with the enemy wolf.',macModelsAwaitingActualRig:['bear','capybara','cat','deer','crocodile','chicken','parrot'],appearanceConstraint:'Do not substitute corresponding lab donors for these seven existing Mac model appearances.',compression:{rawBytes:sum(selectedReports,r=>r.donor.bytes),gzipLevel9Bytes:sum(selectedReports,r=>r.compression.gzipLevel9Bytes),brotliQuality6Bytes:sum(selectedReports,r=>r.compression.brotliQuality6Bytes),scope:'Actual lossless in-memory encoding of the selected six unmodified GLBs; not deployed assets.'}};
mkdirSync(path.join(root,'docs/evidence'),{recursive:true});
writeFileSync(path.join(root,'docs/evidence/twenty-species-candidates.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,assets:undefined,limitations:undefined},null,2));
process.exitCode=output.allPassed?0:1;
