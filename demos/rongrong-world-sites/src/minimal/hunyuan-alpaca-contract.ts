import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {HUNYUAN_DESCRIPTORS} from './hunyuan-promotion.ts';

export {assertAlpacaMeasuredProfile,assertHunyuanMainMeasuredProfile} from './hunyuan-profile.ts';
export type {SampledBowlStanding,SampledPondStanding,AnimalMotionProfile,AlpacaMeasuredProfile,HunyuanMainSpecies} from './hunyuan-profile.ts';
import type {HunyuanMainSpecies} from './hunyuan-profile.ts';
const MAX_BYTES=4*1024*1024;
function mainDescriptor(species:HunyuanMainSpecies){requireThat(species==='alpaca'||species==='penguin','unsupported main-farm species');return HUNYUAN_DESCRIPTORS[species];}
function requireThat(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(`Alpaca: ${message}`);}
function record(value:unknown,label:string):Record<string,unknown>{requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),`${label} must be an object`);return value as Record<string,unknown>;}
const finiteArray=(values:ArrayLike<number>)=>Array.from(values).every(Number.isFinite);

function validateTexture(texture:THREE.Texture){
 const image=texture.image as {width?:unknown;height?:unknown}|undefined;
 requireThat(image&&Number.isInteger(image.width)&&Number.isInteger(image.height)&&Number(image.width)>0&&Number(image.height)>0&&Number(image.width)<=1024&&Number(image.height)<=1024,'texture must have valid <=1K dimensions');
}
function validateSole(name:string,points:THREE.Vector3[]){
 requireThat(points.length>=3,`${name} sole has fewer than three rigid vertices`);
 const low=Math.min(...points.map(p=>p.y));requireThat(Math.abs(low)<=.006,`${name} sole is not within 6 mm of ground`);
 // The contact solver uses the lowest band, not arbitrarily high vertices of a
 // rigid foot. Do not count repeated seam vertices or a collinear bottom edge.
 const contact=points.filter(p=>p.y<=low+.006&&p.y<=.02);
 requireThat(contact.length>=3,`${name} sole has fewer than three low-band vertices`);
 for(const axis of ['x','z'] as const)requireThat(Math.max(...contact.map(p=>p[axis]))-Math.min(...contact.map(p=>p[axis]))>=.002,`${name} sole lacks two-dimensional extent`);
 const a=contact[0],b=contact.reduce((best,p)=>Math.hypot(p.x-a.x,p.z-a.z)>Math.hypot(best.x-a.x,best.z-a.z)?p:best,a);
 requireThat(contact.some(p=>Math.abs((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x))>1e-6),`${name} sole is collinear or has insufficient support area`);
}

/** Strict loaded-scene structure only. Call parseAlpacaGlb first to verify byte,
 * embedded-image and pre-normalization skin budgets. This is NOT source identity,
 * rendered appearance, terrain/contact animation, carry, picking or mobile QA.
 * Never relax the legacy validator to accommodate this new-art contract. */
export function validateAlpacaLoadedAsset(gltf:GLTF):void{validateHunyuanMainLoadedAsset(gltf,'alpaca');}
/** Explicit species descriptor prevents admitting quadruped anchors as penguin feet. */
export function validateHunyuanMainLoadedAsset(gltf:GLTF,species:HunyuanMainSpecies):void{
 const descriptor=mainDescriptor(species);
 requireThat(gltf.scene instanceof THREE.Object3D,'missing scene');
 const bones=new Map<string,THREE.Bone>(),nodes=new Map<string,THREE.Object3D[]>(),meshes:THREE.SkinnedMesh[]=[],usedBones=new Set<THREE.Bone>(),weightedBones=new Set<THREE.Bone>();
 const soles=new Map(descriptor.footChains.map(chain=>[chain.foot,[] as THREE.Vector3[]]));
 let triangles=0,draws=0;
 gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(node=>{
  requireThat(finiteArray(node.position.toArray())&&finiteArray(node.quaternion.toArray())&&finiteArray(node.scale.toArray())&&finiteArray(node.matrix.elements)&&finiteArray(node.matrixWorld.elements),`nonfinite transform on ${node.name}`);
  requireThat(Math.abs(node.quaternion.lengthSq()-1)<.001,`invalid transform quaternion on ${node.name}`);
  if(node.name){const matches=nodes.get(node.name)??[];matches.push(node);nodes.set(node.name,matches);}
  if(node instanceof THREE.Bone){requireThat(!bones.has(node.name),`duplicate bone ${node.name}`);bones.set(node.name,node);}
  if(node instanceof THREE.Mesh){requireThat(node instanceof THREE.SkinnedMesh,`detached unskinned mesh ${node.name}`);meshes.push(node);}
 });
 requireThat(meshes.length>0,'no skinned meshes');
 const required=new Set([...descriptor.anchors,...descriptor.neckChain,...descriptor.footChains.flatMap(c=>[c.upper,c.lower,c.foot])]);
 for(const name of required)requireThat(bones.has(name)&&nodes.get(name)?.length===1,`missing or ambiguous required bone ${name}`);
 for(let i=1;i<descriptor.neckChain.length;i++)requireThat(bones.get(descriptor.neckChain[i])!.parent===bones.get(descriptor.neckChain[i-1]),'invalid neck parentage');
 for(const chain of descriptor.footChains)requireThat(bones.get(chain.foot)!.parent===bones.get(chain.lower)&&bones.get(chain.lower)!.parent===bones.get(chain.upper),`invalid foot parentage ${chain.foot}`);
 // Runtime two-bone IK divides by segment lengths. Preserve these fixed local
 // vectors across clips/blends; endpoint-only checks miss +v -> -v collapse.
 const segmentChildren=new Set([...descriptor.neckChain.slice(1),...descriptor.footChains.flatMap(c=>[c.lower,c.foot])]);
 const ikAncestors=new Set<THREE.Object3D>(),segmentStart=new THREE.Vector3(),segmentEnd=new THREE.Vector3();
 for(const name of segmentChildren){
  const child=bones.get(name)!;child.getWorldPosition(segmentEnd);child.parent!.getWorldPosition(segmentStart);
  requireThat(child.position.length()>1e-6&&Number.isFinite(segmentStart.distanceTo(segmentEnd))&&segmentStart.distanceTo(segmentEnd)>1e-6,`zero or degenerate IK segment ${name}`);
  for(let node:THREE.Object3D|null=child;node;node=node.parent)ikAncestors.add(node);
 }
 for(const node of ikAncestors)requireThat(node.scale.toArray().every(v=>v>1e-8),`collapsed or reflected IK ancestor scale ${node.name}`);
 for(const mesh of meshes){
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),weights=geometry.getAttribute('skinWeight'),indices=geometry.getAttribute('skinIndex'),skeleton=mesh.skeleton;
  requireThat(position?.itemSize===3&&position.count>0&&weights?.itemSize===4&&indices?.itemSize===4&&weights.count===position.count&&indices.count===position.count&&skeleton?.bones.length>0,'incomplete skin attributes or >4 influences');
  requireThat(!geometry.hasAttribute('skinWeight1')&&!geometry.hasAttribute('skinIndex1'),'more than four skin influences');
  requireThat(skeleton.boneInverses.length===skeleton.bones.length&&finiteArray(mesh.bindMatrix.elements)&&finiteArray(mesh.bindMatrixInverse.elements)&&skeleton.boneInverses.every(m=>finiteArray(m.elements)),'invalid inverse bind matrices');
  for(const bone of skeleton.bones){requireThat(bone instanceof THREE.Bone&&bones.get(bone.name)===bone,'skin references absent or ambiguous bone');usedBones.add(bone);}
  const count=geometry.index?.count??position.count;requireThat(count>0&&count%3===0,'invalid triangle count');triangles+=count/3;draws+=geometry.groups.length||1;
  if(geometry.index)for(let i=0;i<count;i++)requireThat(Number.isInteger(geometry.index.getX(i))&&geometry.index.getX(i)>=0&&geometry.index.getX(i)<position.count,'triangle index outside vertex buffer');
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const material of materials){requireThat(material instanceof THREE.Material,'missing material');for(const value of Object.values(material))if(value instanceof THREE.Texture)validateTexture(value);}
  skeleton.update();
  for(let v=0;v<position.count;v++){
   requireThat([position.getX(v),position.getY(v),position.getZ(v)].every(Number.isFinite),'nonfinite position');
   let total=0;const byBone=new Map<THREE.Bone,number>();
   for(let k=0;k<4;k++){
    const w=weights.getComponent(v,k),j=indices.getComponent(v,k);
    requireThat(Number.isFinite(w)&&w>=0&&w<=1&&Number.isInteger(j)&&j>=0&&j<skeleton.bones.length,'invalid skin weight or bone index');
    total+=w;const bone=skeleton.bones[j];byBone.set(bone,(byBone.get(bone)??0)+w);if(w>0)weightedBones.add(bone);
   }
   requireThat(Math.abs(total-1)<.0001,'unnormalized skin weights');
   const point=mesh.getVertexPosition(v,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);requireThat(finiteArray(point.toArray()),'nonfinite skinned position');
   for(const [bone,weight]of byBone)if(weight>.999)soles.get(bone.name)?.push(point);
  }
 }
 requireThat(triangles<=18000&&draws<=12&&usedBones.size<=64&&bones.size<=64,'skin budget exceeds 18K triangles, 64 bones or 12 draws');
 for(const [name,points]of soles)validateSole(name,points);
 requireThat(Array.isArray(gltf.animations)&&gltf.animations.length>=descriptor.clips.length&&new Set(gltf.animations.map(c=>c.name)).size===gltf.animations.length&&descriptor.clips.every(name=>gltf.animations.some(c=>c.name===name)),'all nine main clips and unique clip names required');
 const deformBones=new Set<THREE.Object3D>();for(const bone of weightedBones)for(let node:THREE.Object3D|null=bone;node;node=node.parent)deformBones.add(node);
 for(const clip of gltf.animations){
  const name=clip.name;requireThat(typeof name==='string'&&name.trim().length>0&&Number.isFinite(clip.duration)&&clip.duration>0&&clip.tracks.length>0,`missing positive-duration nonempty clip ${name}`);
  let deforms=false;
  for(const track of clip.tracks){
   const binding=THREE.PropertyBinding.parseTrackName(track.name),target=bones.get(binding.nodeName),size=track.getValueSize(),components=binding.propertyName==='quaternion'?4:3;
   requireThat(target&&nodes.get(binding.nodeName)?.length===1&&!binding.objectName&&binding.propertyIndex===undefined&&['position','quaternion','scale'].includes(binding.propertyName),`unbound transform track ${track.name}`);
   requireThat(track.times.length>0&&track.values.length>0&&(size===components||size===components*3)&&finiteArray(track.times)&&finiteArray(track.values),`invalid finite transform values in ${name}`);
   for(let i=0;i<track.times.length;i++)requireThat(track.times[i]>=0&&track.times[i]<=clip.duration+1e-5&&(i===0||track.times[i]>track.times[i-1]),`invalid animation times in ${name}`);
   // A named anchor or a constant root track is not evidence of deformation.
   const cubic=(track as unknown as {createInterpolant?:{isInterpolantFactoryMethodGLTFCubicSpline?:boolean}}).createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline===true;
   requireThat(size===components*(cubic?3:1),`invalid transform arity in ${name}`);
   const offset=cubic?components:0,first=Array.from(track.values.slice(offset,offset+components));let changed=false;
   const fixedSegment=binding.propertyName==='position'&&segmentChildren.has(target.name),fixedScale=binding.propertyName==='scale'&&ikAncestors.has(target);
   const fixed=fixedSegment?target.position.toArray():fixedScale?target.scale.toArray():null;
   const fixedTolerance=fixedSegment?Math.min(1e-6,target.position.length()*1e-5):fixedScale?Math.min(1e-6,...target.scale.toArray().map(v=>v*1e-5)):0;
   for(let key=0;key<track.times.length;key++){
    const current=Array.from(track.values.slice(key*size+offset,key*size+offset+components));
    if(fixed)requireThat(current.every((v,i)=>Math.abs(v-fixed[i])<=fixedTolerance),`animated IK ${fixedSegment?'segment translation':'ancestor scale'} changes in ${name}: ${track.name}`);
    if(components===4){
     requireThat(Math.abs(current.reduce((sum,v)=>sum+v*v,0)-1)<.001,`invalid animation quaternion in ${name}`);
     const dot=current.reduce((sum,v,i)=>sum+v*first[i],0),norm=Math.hypot(...current)*Math.hypot(...first);
     if(1-Math.abs(dot/norm)>1e-10)changed=true;
    }else if(current.some((value,i)=>Math.abs(value-first[i])>1e-8))changed=true;
    if(cubic)for(const tangentOffset of [0,components*2]){
     const tangent=Array.from(track.values.slice(key*size+tangentOffset,key*size+tangentOffset+components));
     if(fixed)requireThat(tangent.every(v=>v===0),`cubic IK ${fixedSegment?'segment':'scale'} tangent can collapse between keys in ${name}`);
     const length=tangent.reduce((sum,v)=>sum+v*v,0),dot=tangent.reduce((sum,v,i)=>sum+v*current[i],0);
     if((components===4?length-dot*dot/current.reduce((sum,v)=>sum+v*v,0):length)>1e-16)changed=true;
    }
   }
   changed=changed&&track.times.length>1;
   if(target.name.startsWith(`${species}_`)&&!target.name.endsWith('_root')&&deformBones.has(target)&&changed)deforms=true;
  }
  requireThat(deforms,`${name} has no nonconstant bound deform tracks`);
 }
}

// This scoped parser intentionally rejects external resources, compression and
// sparse accessors rather than letting a loader fetch/normalize away bad inputs.
type Json=Record<string,unknown>;
function list(value:unknown,label:string):unknown[]{if(value===undefined)return [];requireThat(Array.isArray(value),`${label} must be an array`);return value;}
function uint(value:unknown,label:string):number{requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0,`${label} must be an unsigned integer`);return value;}
function imageDimensions(bytes:Uint8Array,mime:unknown):{width:number;height:number}{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(mime==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&view.getUint32(12)===0x49484452)return {width:view.getUint32(16),height:view.getUint32(20)};
 if(mime==='image/jpeg'&&bytes.length>4&&bytes[0]===255&&bytes[1]===216){
  for(let offset=2;offset+4<=bytes.length;){
   requireThat(bytes[offset++]===255,'malformed JPEG marker');while(bytes[offset]===255)offset++;const marker=bytes[offset++];
   if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
   requireThat(offset+2<=bytes.length,'truncated JPEG segment');const size=view.getUint16(offset);requireThat(size>=2&&offset+size<=bytes.length,'truncated JPEG segment');
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
   offset+=size;
  }
 }
 throw new Error('Alpaca: expected supported embedded PNG or JPEG image header');
}
function inspectGlb(bytes:Uint8Array):{json:Json;dimensions:{width:number;height:number}[]}{
 requireThat(bytes.byteLength<=MAX_BYTES,'GLB byte budget exceeds 4 MiB');requireThat(bytes.byteLength>=20,'invalid or truncated GLB');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 requireThat(view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(8,true)===bytes.byteLength,'invalid GLB 2.0 header');
 let json:Json|undefined,bin:Uint8Array|undefined,chunks=0;
 for(let offset=12;offset<bytes.byteLength;){
  requireThat(offset+8<=bytes.byteLength,'truncated GLB chunk');const size=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);offset+=8;
  requireThat(size%4===0&&offset+size<=bytes.byteLength,'invalid GLB chunk length');
  if(chunks===0){requireThat(kind===0x4e4f534a,'first GLB chunk must be JSON');json=record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+size)).trim()),'GLB document');}
  else{requireThat(chunks===1&&kind===0x004e4942,'unexpected or duplicate GLB chunk');bin=bytes.subarray(offset,offset+size);}
  offset+=size;chunks++;
 }
 requireThat(json&&record(json.asset,'asset').version==='2.0','missing glTF 2.0 document');
 const buffers=list(json.buffers,'buffers').map(v=>record(v,'buffer')),views=list(json.bufferViews,'bufferViews').map(v=>record(v,'bufferView'));
 requireThat(buffers.length<=1,'only one embedded GLB buffer is supported');
 for(const buffer of buffers){requireThat(buffer.uri===undefined,'self-contained GLB cannot reference external buffers');const length=uint(buffer.byteLength,'buffer length');requireThat(bin&&length<=bin.length&&bin.length-length<=3,'invalid embedded GLB buffer length');}
 requireThat(!bin||buffers.length===1,'unreferenced GLB binary chunk');
 for(const entry of views){const offset=uint(entry.byteOffset??0,'bufferView offset'),length=uint(entry.byteLength,'bufferView length');requireThat(entry.buffer===0&&buffers.length===1&&length>0&&offset+length<=Number(buffers[0].byteLength),'invalid embedded bufferView');}
 const accessors=list(json.accessors,'accessors').map(v=>record(v,'accessor'));
 const sizes:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
 const types:Record<number,{bytes:number;read:(offset:number)=>number;max:number}>={5120:{bytes:1,read:o=>view.getInt8(o),max:127},5121:{bytes:1,read:o=>view.getUint8(o),max:255},5122:{bytes:2,read:o=>view.getInt16(o,true),max:32767},5123:{bytes:2,read:o=>view.getUint16(o,true),max:65535},5125:{bytes:4,read:o=>view.getUint32(o,true),max:4294967295},5126:{bytes:4,read:o=>view.getFloat32(o,true),max:1}};
 const readAccessor=(index:unknown)=>{
  const accessor=accessors[uint(index,'accessor index')];requireThat(accessor,'missing accessor');requireThat(accessor.sparse===undefined,'sparse accessors require separate validation');
  const entry=views[uint(accessor.bufferView,'accessor bufferView')],size=sizes[String(accessor.type)],type=types[Number(accessor.componentType)],count=uint(accessor.count,'accessor count');
  requireThat(entry&&type&&size&&count>0,'invalid accessor type or count');
  // Byte-packed MAT2/MAT3 need per-column padding, unsupported in this pilot.
  requireThat(!['MAT2','MAT3'].includes(String(accessor.type))||type.bytes===4,'packed matrix accessors require separate validation');
  const stride=uint(entry.byteStride??size*type.bytes,'accessor stride'),offset=uint(accessor.byteOffset??0,'accessor offset');
  requireThat(stride>=size*type.bytes&&stride%type.bytes===0&&offset%type.bytes===0&&offset+(count-1)*stride+size*type.bytes<=Number(entry.byteLength),'accessor outside bufferView');
  requireThat(bin,'missing accessor binary data');const base=bin.byteOffset-bytes.byteOffset+Number(entry.byteOffset??0)+offset,values:number[]=[];
  for(let i=0;i<count;i++)for(let c=0;c<size;c++){let value=type.read(base+i*stride+c*type.bytes);if(accessor.normalized===true)value=Math.max(-1,value/type.max);requireThat(Number.isFinite(value),'nonfinite accessor value');values.push(value);}
  return {accessor,size,count,values};
 };
 const cache=accessors.map((_,i)=>readAccessor(i));
 for(const mesh of list(json.meshes,'meshes').map(v=>record(v,'mesh')))for(const item of list(mesh.primitives,'primitives')){
  const primitive=record(item,'primitive'),attrs=record(primitive.attributes,'attributes');requireThat(primitive.mode===undefined||primitive.mode===4,'only triangle primitives are supported');
  requireThat(!Object.keys(attrs).some(k=>/^(JOINTS|WEIGHTS)_[1-9]/.test(k)),'more than four raw skin influences');
  if(attrs.WEIGHTS_0!==undefined||attrs.JOINTS_0!==undefined){
   const weights=cache[uint(attrs.WEIGHTS_0,'weights accessor')],joints=cache[uint(attrs.JOINTS_0,'joints accessor')],positions=cache[uint(attrs.POSITION,'position accessor')];
   requireThat(weights&&joints&&positions&&weights.size===4&&joints.size===4&&weights.count===positions.count&&joints.count===positions.count,'incomplete raw skin attributes');
   requireThat(joints.accessor.normalized!==true&&[5121,5123].includes(Number(joints.accessor.componentType)),'invalid raw joint accessor');
   for(let i=0;i<weights.count;i++){const values=weights.values.slice(i*4,i*4+4);requireThat(values.every(v=>v>=0&&v<=1)&&Math.abs(values.reduce((a,b)=>a+b,0)-1)<.0001,'unnormalized raw skin weights');}
  }
 }
 const dimensions=list(json.images,'images').map(value=>{
  const image=record(value,'image');requireThat(image.uri===undefined,'self-contained GLB cannot reference external images');const entry=views[uint(image.bufferView,'image bufferView')];requireThat(entry&&bin,'invalid embedded image bufferView');
  const offset=Number(entry.byteOffset??0),d=imageDimensions(bin.subarray(offset,offset+Number(entry.byteLength)),image.mimeType);requireThat(d.width>0&&d.height>0&&d.width<=1024&&d.height<=1024,'embedded texture exceeds 1K');return d;
 });
 for(const value of list(json.textures,'textures')){const texture=record(value,'texture');requireThat(texture.extensions===undefined&&dimensions[uint(texture.source,'texture source')],'unsupported or missing embedded texture');}
 requireThat(list(json.extensionsRequired,'required extensions').every(v=>['KHR_materials_unlit','KHR_materials_emissive_strength','KHR_texture_transform'].includes(String(v))),'unsupported required GLB extension');
 return {json,dimensions};
}

/** Default mode decodes real embedded textures using GLTFLoader. `headers-only`
 * is offline structural preflight ONLY: fake dimension carriers are explicitly
 * labeled, never evidence of rendered pixels, visual anatomy or material QA. */
export async function parseAlpacaGlb(bytes:Uint8Array,options?:{textureMode?:'rendered'|'headers-only'}):Promise<GLTF>{
 const mode=options?.textureMode??'rendered';requireThat(mode==='rendered'||mode==='headers-only','invalid texture mode');
 // Copy once: caller mutations cannot race the checked bytes or loader.
 requireThat(bytes.byteLength<=MAX_BYTES,'GLB byte budget exceeds 4 MiB');
 const copy=new Uint8Array(bytes),{json,dimensions}=inspectGlb(copy),loader=new GLTFLoader();
 if(mode==='headers-only')loader.register(parser=>({name:'ALPACA_OFFLINE_HEADERS_ONLY',loadTexture(index:number){const source=parser.json.textures[index].source,texture=new THREE.Texture({...dimensions[source]});texture.flipY=false;texture.userData.alpacaTextureValidation='headers-only';return Promise.resolve(texture);}}));
 const gltf=await loader.parseAsync(copy.buffer,'');
 for(let i=0;i<list(json.textures,'textures').length;i++){const texture=await gltf.parser.getDependency('texture',i);requireThat(texture instanceof THREE.Texture,'embedded texture failed to decode');validateTexture(texture);}
 gltf.userData={...gltf.userData,alpacaTextureValidation:mode==='headers-only'?'headers-only':'decoded-not-render-qa',alpacaGlbBytes:copy.byteLength};
 return gltf;
}
