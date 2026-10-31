import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimalModelLoadBudget} from './animal-model-load-budget.ts';
import {visitorLandmarkFor,visitorLandmarkTransform,type VisitorLandmarkRecord} from './visitor-landmark-catalog.ts';
export type VisitorLandmarkOptions={loadBytes?:(url:string,signal:AbortSignal)=>Promise<Uint8Array>;textureMode?:'decode'|'headers-only';changed?:(status:VisitorLandmarkStatus)=>void};
export type VisitorLandmarkStatus='loading'|'ready'|'failed'|'absent';
type Model={scene:THREE.Group;scenes?:THREE.Group[];animations:THREE.AnimationClip[]};
const budget=new AnimalModelLoadBudget();
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),n=>n.toString(16).padStart(2,'0')).join('');
function own(model:Model){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 for(const root of new Set([model.scene,...model.scenes??[]]))root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}}});
 let done=false;return()=>{if(done)return;done=true;for(const r of geometries)r.dispose();for(const r of materials)r.dispose();for(const r of textures)r.dispose();for(const image of new Set([...textures].map(t=>t.source.data as unknown)))if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();};
}
function assertEmbedded(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length||view.getUint32(16,true)!==0x4e4f534a)throw new Error('Invalid landmark GLB');
 const n=view.getUint32(12,true);if(n<2||20+n>bytes.length)throw new Error('Invalid landmark JSON');
 const data=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+n))) as {buffers?:{uri?:string}[];images?:{uri?:string;bufferView?:number}[];skins?:unknown[];animations?:unknown[]};
 if(data.buffers?.some(b=>b.uri)||data.images?.some(i=>i.uri||!Number.isInteger(i.bufferView))||data.skins?.length||data.animations?.length)throw new Error('Landmarks must be embedded static GLBs');
}
function assertModel(model:Model,record:VisitorLandmarkRecord){
 let triangles=0,meshes=0;model.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)throw new Error('Landmark skin not allowed');meshes++;const p=o.geometry.getAttribute('position');if(!p?.count)throw new Error('Landmark geometry empty');for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))throw new Error('Landmark non-finite vertex');triangles+=(o.geometry.index?.count??p.count)/3;});
 if(meshes!==1||triangles!==record.triangles||model.animations.length)throw new Error('Landmark geometry identity failed');
 model.scene.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(model.scene,true);for(const [i,axis]of ['x','y','z'].entries()){const key=axis as 'x'|'y'|'z';if(Math.abs(b.min[key]-record.nativeBounds.min[i])>1e-5||Math.abs(b.max[key]-record.nativeBounds.max[i])>1e-5)throw new Error('Landmark native bounds mismatch');}
}
/** One static landmark per visitor. Exact verified bytes, a global two-job decode budget,
 * no actor or navigation footprint (only the desert pyramid is an entry pick target), and no resources shared with home. */
export class VisitorLandmarkScene{
 readonly root=new THREE.Group();status:VisitorLandmarkStatus='absent';ready:Promise<void>=Promise.resolve();
 private disposed=false;private generation=0;private release:(()=>void)|undefined;private abort:AbortController|undefined;
 private readonly sampleId:string;private readonly options:VisitorLandmarkOptions;
 constructor(parent:THREE.Object3D,sampleId:string,options:VisitorLandmarkOptions={}){
  this.sampleId=sampleId;this.options=options;
  this.root.name='visitor-user-landmark';this.root.userData={decorationOnly:true,source:'user-supplied-model'};parent.add(this.root);this.start();
 }
 private start(){
  const record=visitorLandmarkFor(this.sampleId);if(this.disposed||!record)return;const generation=++this.generation;this.status='loading';this.options.changed?.(this.status);const abort=new AbortController();this.abort=abort;
  const load=this.options.loadBytes??(async(url:string,signal:AbortSignal)=>{const response=await fetch(url,{signal});if(!response.ok)throw new Error('Landmark unavailable');const length=response.headers.get('content-length');if(length&&!response.headers.get('content-encoding')&&Number(length)!==record.bytes)throw new Error('Landmark length mismatch');
    const reader=response.body?.getReader();if(!reader)return new Uint8Array(await response.arrayBuffer());
    const result=new Uint8Array(record.bytes);let offset=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;if(offset+value.length>result.length)throw new Error('Landmark response exceeds exact byte budget');result.set(value,offset);offset+=value.length;}if(offset!==result.length)throw new Error('Landmark response truncated');return result;}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}});
  this.ready=budget.run(async()=>{
   if(this.disposed||generation!==this.generation)return;
   const bytes=await load(`${record.url}?rev=${record.sha256}`,abort.signal);if(this.disposed||generation!==this.generation)return;
   if(bytes.length!==record.bytes||await hash(bytes)!==record.sha256)throw new Error('Landmark byte identity mismatch');assertEmbedded(bytes);
   if(this.disposed||generation!==this.generation)return;
   const loader=new GLTFLoader();if(this.options.textureMode==='headers-only')loader.register(()=>({name:'LANDMARK_CPU_IMAGE_PLACEHOLDER',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
   const model=await loader.parseAsync(Uint8Array.from(bytes).buffer,'');const release=own(model);
   if(this.disposed||generation!==this.generation){release();return;}
   try{assertModel(model,record);}catch(error){release();throw error;}
   const t=visitorLandmarkTransform(this.sampleId)!,normalizer=new THREE.Group();normalizer.scale.setScalar(t.scale);normalizer.position.set(t.offset.x,t.offset.y,t.offset.z);normalizer.add(model.scene);this.root.position.set(t.x,0,t.z);this.root.add(normalizer);
   model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});this.root.userData.landmarkId=record.id;if(this.sampleId==='oasis')this.root.userData.target={kind:'landmark',id:record.id};this.release=release;this.status='ready';this.options.changed?.(this.status);
  }).catch(()=>{if(!this.disposed&&generation===this.generation){this.status='failed';this.options.changed?.(this.status);}});
 }
 retry(){if(!this.disposed&&this.status==='failed')this.start();}
 dispose(){if(this.disposed)return;this.disposed=true;this.generation++;this.abort?.abort();this.root.removeFromParent();this.root.clear();this.release?.();this.release=undefined;}
}
