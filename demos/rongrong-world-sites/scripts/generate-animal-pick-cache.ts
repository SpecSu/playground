import type {LegacySpecies as FarmSpecies} from '../src/minimal/species.ts';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ANIMAL_ASSET_REVISIONS} from '../src/minimal/animal-asset-revisions.ts';
import {cacheGeometry,sampleGeometry} from '../src/minimal/animal-picking-geometry.ts';
import type {AnimalPickCacheArtifact} from '../src/minimal/animal-pick-cache.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const defaultOutput=resolve(root,'src/minimal/animal-pick-cache-data.ts');
const speciesOrder=['cow','sheep','pig','bunny','duck'] as const;
const threeVersion='0.186.1';
const attributeLayout:AnimalPickCacheArtifact['attributeLayout']=[
 ['position',3,'Float32Array',false,false],
 ['skinIndex',4,'Uint8Array',false,false],
 ['skinWeight',4,'Float32Array',false,false],
];
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Model=AnimalPickCacheArtifact['models'][FarmSpecies];

function assertPinnedLoader(){
 const require=createRequire(import.meta.url);
 const installed=JSON.parse(readFileSync(resolve(dirname(require.resolve('three')),'../package.json'),'utf8')) as {version:string};
 const project=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')) as {dependencies:{three:string}};
 if(installed.version!==threeVersion||project.dependencies.three!==threeVersion||THREE.REVISION!=='186')throw new Error(`Expected pinned Three ${threeVersion}; installed ${installed.version}, declared ${project.dependencies.three}, revision ${THREE.REVISION}`);
}

/** Read-only serialization of GLTFLoader's normalized attributes. Association
 * indexes identify primitives, including the two-primitive sheep/pig meshes. */
export function buildAnimalPickModel(species:FarmSpecies,gltf:GLTF,sourceBytes:Uint8Array):Model{
 const meshes:THREE.SkinnedMesh[]=[];
 gltf.scene.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  if(!(node instanceof THREE.SkinnedMesh))throw new Error(`${species} has an unsupported unskinned mesh ${node.name}`);
  meshes.push(node);
 });
 if(!meshes.length)throw new Error(`${species} has no skinned meshes`);
 const bones=meshes[0].skeleton.bones.map(bone=>bone.name);
 if(!bones.length||bones.some(name=>!name)||new Set(bones).size!==bones.length)throw new Error(`${species} has invalid ordered bones`);
 const seenIds=new Set<string>(),seenGeometry=new Set<THREE.BufferGeometry>();
 // Validate every primitive before running the shared, more expensive sampler.
 const validated=meshes.map(mesh=>{
  const geometry=mesh.geometry,label=`${species}/${mesh.name}`,association=gltf.parser.associations.get(mesh);
  const meshIndex=association?.meshes,primitiveIndex=association?.primitives;
  if(!Number.isInteger(meshIndex)||meshIndex!<0||!Number.isInteger(primitiveIndex)||primitiveIndex!<0||!gltf.parser.json.meshes?.[meshIndex!]?.primitives?.[primitiveIndex!])throw new Error(`${label} has a missing or invalid GLTF mesh/primitive association`);
  const id:[number,number]=[meshIndex!,primitiveIndex!],key=id.join(':');
  if(seenIds.has(key))throw new Error(`${label} has a duplicate GLTF mesh/primitive association ${key}`);
  seenIds.add(key);
  if(seenGeometry.has(geometry))throw new Error(`${label} has unsupported shared primitive geometry`);
  seenGeometry.add(geometry);
  if(mesh.skeleton.bones.length!==bones.length||mesh.skeleton.bones.some((bone,index)=>bone.name!==bones[index]))throw new Error(`${label} has different ordered bones`);
  if(Object.values(geometry.morphAttributes).some(attributes=>attributes.length))throw new Error(`${label} has unsupported morph attributes`);
  const vertices=geometry.getAttribute('position')?.count;
  if(!Number.isInteger(vertices)||vertices<=0)throw new Error(`${label} has an invalid vertex count`);
  const attributes=attributeLayout.map(([name,itemSize,type,normalized])=>{
   const attribute=geometry.getAttribute(name);
   if(!(attribute instanceof THREE.BufferAttribute)||attribute.itemSize!==itemSize||attribute.array.constructor.name!==type||attribute.normalized!==normalized)throw new Error(`${label} has an unsupported ${name} layout`);
   if(attribute.count!==vertices||attribute.array.length!==vertices*itemSize)throw new Error(`${label} has an invalid ${name} count`);
   return attribute;
  });
  const indices=attributes[1];
  for(let vertex=0;vertex<vertices;vertex++)for(let influence=0;influence<4;influence++){
   const bone=indices.getComponent(vertex,influence);
   if(!Number.isInteger(bone)||bone<0||bone>=bones.length)throw new Error(`${label} has an invalid bone index`);
  }
  const data=cacheGeometry(geometry);
  if(!data.valid||!data.regions.length||!Number.isFinite(data.minimumWeight)||!Number.isFinite(data.maximumWeight)||data.minimumWeight<=0||data.maximumWeight<data.minimumWeight)throw new Error(`${label} has invalid positions or skin weights`);
  const geometryHash=createHash('sha256');
  for(const attribute of attributes)geometryHash.update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  return {mesh,id,vertices,data,geometrySha256:geometryHash.digest('hex')};
 });
 return {
  sha256:sha256(sourceBytes),bones,
  meshes:validated.map(({mesh,id,vertices,data,geometrySha256})=>{
   const samples=sampleGeometry(mesh.geometry);
   if(!samples.length||samples.some(index=>!Number.isInteger(index)||index<0||index>=vertices)||new Set(samples).size!==samples.length)throw new Error(`${species}/${mesh.name} has invalid sample indices`);
   return {id,name:mesh.name,vertices,weights:[data.minimumWeight,data.maximumWeight],regions:data.regions.map(({bone,bounds})=>[bone,bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z]),samples,geometrySha256};
  }),
 };
}

export async function buildAnimalPickCache(revisions:Readonly<Record<FarmSpecies,string>>=ANIMAL_ASSET_REVISIONS):Promise<AnimalPickCacheArtifact>{
 assertPinnedLoader();
 const models={} as AnimalPickCacheArtifact['models'];
 for(const species of speciesOrder){
  const bytes=readFileSync(resolve(root,`public/models/farm/${species}-animated.glb`)),hash=sha256(bytes);
  if(!/^[a-f0-9]{16}$/.test(revisions[species])||hash.slice(0,16)!==revisions[species])throw new Error(`${species} asset revision does not match GLB SHA-256 prefix; update animal-asset-revisions.ts first`);
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{throw new Error(`${species} requires an unsupported external resource: ${url}`);});
  const loader=new GLTFLoader(manager);
  // Pixels are irrelevant to the cache. All geometry/skin parsing, including
  // GLTFLoader.normalizeSkinWeights(), remains the pinned production loader.
  loader.register(()=>({name:'PICK_CACHE_SKIP_TEXTURE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  models[species]=buildAnimalPickModel(species,gltf,bytes);
 }
 return {schema:1,algorithm:1,three:threeVersion,attributeLayout,models};
}

async function main(){
 let check=false,output=defaultOutput;
 const args=process.argv.slice(2);
 for(let index=0;index<args.length;index++){
  if(args[index]==='--check'){check=true;continue;}
  if(args[index]==='--output'&&args[index+1]&&!args[index+1].startsWith('--')){output=resolve(args[++index]);continue;}
  throw new Error('Usage: node --experimental-strip-types scripts/generate-animal-pick-cache.ts [--check] [--output path]');
 }
 const data=await buildAnimalPickCache();
 const source="// Generated by scripts/generate-animal-pick-cache.ts from exact GLB bytes and loaded attributes; do not edit.\nimport type {AnimalPickCacheArtifact} from './animal-pick-cache.ts';\nexport const ANIMAL_PICK_CACHE_DATA:AnimalPickCacheArtifact="+JSON.stringify(data)+';\n';
 if(check){
  let existing:string;
  try{existing=readFileSync(output,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Error(`Animal pick cache output is missing: ${output}`);throw error;}
  if(existing!==source)throw new Error(`Animal pick cache output is stale: ${output}; run scripts/generate-animal-pick-cache.ts`);
  console.log(`Animal pick cache is current (${Buffer.byteLength(source)} bytes; 5 species).`);
 }else{
  writeFileSync(output,source);
  console.log(`Generated animal pick cache (${Buffer.byteLength(source)} bytes; 5 species): ${output}`);
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
