import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {parseAlpacaGlb} from './hunyuan-alpaca-contract.ts';
import {AnimalModelLoadBudget} from './animal-model-load-budget.ts';
import {LUNAR_SHOWCASE_CATALOG} from './lunar-showcase-catalog.ts';
import {isLunarShowcaseId,type LunarShowcaseId,type LunarShowcaseRecord} from './lunar-showcase-contract.ts';
import {lunarShowcaseScopeInfo,type LunarShowcaseScope} from './lunar-showcase-resources.ts';
export type LunarAssetStatus='unavailable'|'loading'|'ready'|'failed';
export type LunarAssetInstance={scene:THREE.Group;animations:THREE.AnimationClip[];definition:LunarShowcaseRecord;release:()=>void};
type Options={loadBytes?:(url:string,signal?:AbortSignal)=>Promise<Uint8Array>;textureMode?:'rendered'|'headers-only';timeoutMs?:number};
type Load={status:LunarAssetStatus;promise?:Promise<GLTF>;template?:GLTF;error?:Error;controller:AbortController;alive:boolean};
const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const positive=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max;
function requireThat(v:unknown,message:string):asserts v{if(!v)throw new Error(`Lunar asset: ${message}`);}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const digest=async(b:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const defaultLoad=async(url:string,signal?:AbortSignal)=>{const r=await fetch(url,{signal,credentials:'same-origin',redirect:'error',cache:'no-cache'});if(!r.ok)throw new Error(`Lunar model HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());};
function privateMetadata(value:unknown):boolean{if(typeof value==='string')return /(?:\/Users\/|\/workspace\/|\/home\/|\/private\/|[A-Za-z]:\\Users\\)/i.test(value);return !!value&&typeof value==='object'&&Object.values(value).some(privateMetadata);}
function definition(input:LunarShowcaseRecord):LunarShowcaseRecord{
 const d=structuredClone(input),p=d.profile;
 requireThat(isLunarShowcaseId(d.id)&&typeof d.label==='string'&&d.label.length>0&&d.label.length<=80,'invalid identity');
 requireThat(/^\/models\/showcase\/[a-z0-9_/-]+\.glb$/.test(d.model.url)&&!d.model.url.includes('..')&&hash(d.model.sha256)&&Number.isSafeInteger(d.model.bytes)&&positive(d.model.bytes,4*1024*1024),'invalid pinned model');
 requireThat(hash(d.source.originalSha256)&&hash(d.source.compactSha256)&&d.source.geometry==='user-supplied-generated'&&['hand-authored','mixed-hand-authored-and-retargeted'].includes(d.source.motion),'missing original/derivative provenance');
 requireThat(!privateMetadata(d)&&!d.verification.reportRef.includes('..')&&!d.verification.reportRef.includes('://'),'private or invalid metadata');
 requireThat(positive(p.normalizationScale,10)&&Number.isFinite(p.facingYaw)&&positive(p.bodyRadius,2)&&Number.isFinite(p.transferUnderside)&&p.transferUnderside>=0&&p.transferUnderside<=3,'invalid measured dimensions');
 requireThat([p.motionRoot,p.supportAnchor,p.headAnchor].every(s=>typeof s==='string'&&s.length>0),'missing rig anchors');
 if(p.walk)requireThat(positive(p.walk.strideMeters,2)&&(!p.walk.feet||p.walk.feet.length>=2&&p.walk.feet.length<=4&&p.walk.feet.every(f=>[f.upper,f.lower,f.foot].every(n=>typeof n==='string'&&n.length>0)&&f.phase>=0&&f.phase<1&&f.stance>.5&&f.stance<.9)),'invalid measured walk stride/contact');
 for(const a of p.actions)if(a.finishBeforeInterrupt!==undefined)requireThat(a.finishBeforeInterrupt===true&&a.kind==='gesture'&&a.cycles===1&&a.duration<=6,'invalid bounded action completion');
 requireThat((d.source.motion==='mixed-hand-authored-and-retargeted')===p.actions.some(a=>!!a.motionSource),'inconsistent motion provenance');
 for(const a of p.actions){if(a.motionSource)requireThat(a.motionSource.kind==='user-provided-hy-motion-retargeted'&&hash(a.motionSource.sourceSha256)&&a.idleBoundary===true&&a.finishBeforeInterrupt===true&&a.kind==='gesture'&&a.cycles===1&&a.duration<=6&&!a.ballTrack&&a.id!==p.automaticActionId&&a.id!==p.greetingActionId,'invalid retargeted manual action');if(a.idleBoundary!==undefined)requireThat(a.idleBoundary===true&&!!a.motionSource,'invalid idle boundary');if(a.reservedRadius!==undefined)requireThat(!!a.motionSource&&positive(a.reservedRadius,2)&&a.reservedRadius>=p.bodyRadius,'invalid action reservation');if(a.groundContact)requireThat(!!a.motionSource&&a.groundContact.modelSha256===d.model.sha256&&typeof a.groundContact.mesh==='string'&&a.groundContact.mesh.length>0&&Array.isArray(a.groundContact.vertices)&&a.groundContact.vertices.length>0&&a.groundContact.vertices.length<=8&&a.groundContact.vertices.every(v=>Number.isSafeInteger(v)&&v>=0),'invalid bound action contact');}
 for(const a of p.actions)if(a.rootMotion)requireThat(a.rootMotion.kind==='in-place-yaw'&&a.rootMotion.turns===1&&a.kind==='gesture'&&a.cycles===1&&a.duration<=6,'invalid per-action root motion');
 for(const a of p.actions)if(a.speech){requireThat(Array.isArray(a.speech)&&a.speech.length<=4,'invalid speech cues');let end=0;for(const c of a.speech){requireThat(Number.isFinite(c.at)&&c.at>=end&&positive(c.duration,10)&&c.at+c.duration<=a.duration*a.cycles&&typeof c.text==='string'&&c.text.trim().length>0&&c.text.length<=60,'invalid speech cue timing/text');end=c.at+c.duration;}}
 const clips=[p.idle,...p.walk?[p.walk]:[],...p.carried?[p.carried]:[],...p.actions];
 requireThat(clips.every(c=>typeof c.clip==='string'&&c.clip.length>0&&positive(c.duration,60))&&p.actions.length>0&&p.actions.length<=12,'invalid clip contract');
 requireThat(new Set(p.actions.map(a=>a.id)).size===p.actions.length&&p.actions.every(a=>/^[a-z][a-z0-9-]*$/.test(a.id)&&Number.isInteger(a.cycles)&&a.cycles>=1&&a.cycles<=4&&['gesture','dribble','shoot'].includes(a.kind)),'invalid action contract');
 requireThat(p.actions.some(a=>a.id===p.greetingActionId)&&p.actions.some(a=>a.id===p.automaticActionId),'missing selected actions');
 requireThat(p.actions.filter(a=>a.kind==='shoot').every(a=>p.handAnchor&&Number.isFinite(a.releaseAt)&&a.releaseAt!>0&&a.releaseAt!<a.duration),'missing shot hand/release');
 requireThat(d.verification.actualSkinAndClips===true&&d.verification.groundTransitions===true&&d.verification.rayPicking===true&&d.verification.mobilePerformance==='unmeasured'&&(!d.verification.carry||p.carried),'unreviewed actor capability');
 return freeze(d);
}
export function disposeLunarTemplate(gltf:GLTF){
 const resources=new Set<{dispose:()=>void}>(),images=new Set<unknown>();
 for(const scene of new Set([gltf.scene,...gltf.scenes])){scene.removeFromParent();scene.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);if(o instanceof THREE.SkinnedMesh)resources.add(o.skeleton);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture){resources.add(v);images.add(v.source.data);}}}});}
 resources.forEach(r=>r.dispose());for(const image of images)if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();
}
export function validateLunarTemplate(gltf:GLTF,d:LunarShowcaseRecord){
 const bones=new Map<string,THREE.Bone>(),weighted=new Set<THREE.Bone>();let meshes=0,vertices=0,triangles=0;
 gltf.scene.traverse(o=>{if(o instanceof THREE.Bone){requireThat(!bones.has(o.name),'duplicate bone');bones.set(o.name,o);}if(o instanceof THREE.Mesh){requireThat(o instanceof THREE.SkinnedMesh,'detached unskinned mesh');const pos=o.geometry.getAttribute('position'),w=o.geometry.getAttribute('skinWeight'),j=o.geometry.getAttribute('skinIndex');requireThat(pos?.count&&w?.count===pos.count&&j?.count===pos.count&&w.itemSize===4&&j.itemSize===4,'incomplete skin');vertices+=pos.count;triangles+=(o.geometry.index?.count??pos.count)/3;meshes++;
  for(let i=0;i<pos.count;i++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k),index=j.getComponent(i,k);requireThat(weight>=0&&weight<=1&&Number.isInteger(index)&&index>=0&&index<o.skeleton.bones.length,'invalid skin joint/weight');sum+=weight;if(weight>1e-5)weighted.add(o.skeleton.bones[index]);}requireThat(Math.abs(sum-1)<.0001,'unnormalized skin weights');}
 }});
 requireThat(meshes>0&&meshes<=8&&vertices<=60000&&triangles<=25000&&bones.size>2&&bones.size<=128,'skin budget');
 for(const action of d.profile.actions)if(action.groundContact){const mesh=gltf.scene.getObjectByName(action.groundContact.mesh);requireThat(mesh instanceof THREE.SkinnedMesh&&action.groundContact.vertices.every(index=>index<mesh.geometry.getAttribute('position').count),'invalid action contact vertices');}
 const p=d.profile;for(const anchor of [p.motionRoot,p.supportAnchor,p.headAnchor,...p.handAnchor?[p.handAnchor]:[]])requireThat(gltf.scene.getObjectByName(anchor),`missing anchor ${anchor}`);
 for(const f of p.walk?.feet??[]){const upper=bones.get(f.upper),lower=bones.get(f.lower),foot=bones.get(f.foot);requireThat(upper&&lower?.parent===upper&&foot?.parent===lower,'invalid walk contact chain');}
 const required=[p.idle,...p.walk?[p.walk]:[],...p.carried?[p.carried]:[],...p.actions];
 requireThat(gltf.animations.length<=16&&new Set(gltf.animations.map(c=>c.name)).size===gltf.animations.length,'clip count/name');
 for(const spec of required){const clip=gltf.animations.find(c=>c.name===spec.clip);requireThat(clip&&clip.tracks.length&&Math.abs(clip.duration-spec.duration)<.005,`missing/mismatched clip ${spec.clip}`);let deforms=false,rootTurn=false;
  for(const track of clip.tracks){const parsed=THREE.PropertyBinding.parseTrackName(track.name),node=gltf.scene.getObjectByName(parsed.nodeName);requireThat(node instanceof THREE.Bone,'unbound or nonbone animation');const size=track.getValueSize();requireThat(track.times.length>0&&track.values.length===track.times.length*size,'invalid track');
   if(parsed.propertyName==='position'&&node.name!==p.motionRoot||parsed.propertyName==='scale'){const rest=parsed.propertyName==='scale'?node.scale:node.position;requireThat(size===3,'unsupported vector track');for(let i=0;i<track.values.length;i++)requireThat(Math.abs(track.values[i]-rest.getComponent(i%3))<1e-5,'animated bone translation/scale changes fixed rig');}
   if(node.name===p.motionRoot&&parsed.propertyName==='position'){requireThat(size===3,'invalid root position');for(let i=0;i<track.values.length;i+=3)requireThat(Math.abs(track.values[i]-node.position.x)<1e-5&&Math.abs(track.values[i+2]-node.position.z)<1e-5,'root horizontal motion is forbidden');}
   if(node.name===p.motionRoot&&parsed.propertyName==='quaternion'){
    requireThat(size===4&&Array.from(track.values).every(Number.isFinite),'invalid root rotation');const first=new THREE.Quaternion().fromArray(track.values,0).normalize(),previous=first.clone(),current=new THREE.Quaternion(),relative=new THREE.Quaternion();let turn=0;
    const allowance='rootMotion' in spec?spec.rootMotion:undefined;
    for(let i=0;i<track.values.length;i+=4){current.fromArray(track.values,i).normalize();if(!allowance)requireThat(first.angleTo(current)<1e-4,'root rotation requires a per-action contract');else{relative.copy(first).invert().multiply(current);requireThat(Math.abs(relative.x)<1e-5&&Math.abs(relative.z)<1e-5,'root rotation must be yaw only');relative.copy(previous).invert().multiply(current);if(relative.w<0)relative.set(-relative.x,-relative.y,-relative.z,-relative.w);turn+=2*Math.atan2(relative.y,relative.w);previous.copy(current);}}
    if(allowance){requireThat(Math.abs(turn-Math.PI*2)<1e-4&&first.angleTo(current)<1e-4,'root turn must finish one complete neutral turn');rootTurn=true;}
   }
   requireThat(['position','quaternion','scale'].includes(parsed.propertyName),'unsupported animated property');
   if(weighted.has(node)&&node.name!==p.motionRoot&&track.values.some((v,i)=>i>=size&&Math.abs(v-track.values[i%size])>1e-5))deforms=true;
  }requireThat(!('rootMotion' in spec&&spec.rootMotion)||rootTurn,'root turn track is missing');requireThat(deforms,`clip ${spec.clip} has no articulated motion`);
 }
 // The first exposed pose is actual idle(0), never an unreviewed bind flash.
 const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations.find(c=>c.name===p.idle.clip)!).play();mixer.update(0);gltf.scene.updateMatrixWorld(true);
 const pose: {node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}[]=[];gltf.scene.traverse(node=>pose.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);for(const v of pose){v.node.position.copy(v.position);v.node.quaternion.copy(v.quaternion);v.node.scale.copy(v.scale);}gltf.scene.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(gltf.scene,true),size=box.getSize(new THREE.Vector3());requireThat(!box.isEmpty()&&[...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)&&size.y*p.normalizationScale>.15&&size.y*p.normalizationScale<=3,'invalid posed bounds');
}
/** Per-visit templates: nothing starts until instantiate, maximum two active
 * jobs, exact-byte validation before parsing, and no ownership/economy API. */
export class LunarShowcaseAssetLibrary{
 private records=new Map<LunarShowcaseId,LunarShowcaseRecord>();private loads=new Map<LunarShowcaseId,Load>();private budget=new AnimalModelLoadBudget();private disposed=false;private options:Options;
 constructor(scope:LunarShowcaseScope,records:readonly LunarShowcaseRecord[]=LUNAR_SHOWCASE_CATALOG,options:Options={}){lunarShowcaseScopeInfo(scope);this.options=options;for(const input of records){const d=definition(input);requireThat(!this.records.has(d.id),'duplicate actor identity');this.records.set(d.id,d);}}
 catalog():readonly LunarShowcaseRecord[]{return Object.freeze([...this.records.values()]);}
 status(id:LunarShowcaseId):LunarAssetStatus{return this.disposed?'unavailable':this.loads.get(id)?.status??'unavailable';}
 private template(id:LunarShowcaseId,retry:boolean):Promise<GLTF>{
  const record=this.records.get(id);if(this.disposed)return Promise.reject(new Error('Lunar library disposed'));if(!record)return Promise.reject(new Error('Lunar actor not admitted'));
  const old=this.loads.get(id);if(old?.template)return Promise.resolve(old.template);if(old?.promise)return old.promise;if(old?.status==='failed'&&!retry)return Promise.reject(old.error);
  const load:Load={status:'loading',controller:new AbortController(),alive:true};this.loads.set(id,load);
  const valid=()=>!this.disposed&&load.alive&&this.loads.get(id)===load;
  const promise=this.budget.run(async()=>{
   requireThat(valid(),'load cancelled');let timer:ReturnType<typeof setTimeout>|undefined;
   const work=(async()=>{const bytes=Uint8Array.from(await (this.options.loadBytes??defaultLoad)(record.model.url+'?rev='+record.model.sha256,load.controller.signal));requireThat(valid(),'load cancelled');requireThat(bytes.length===record.model.bytes&&await digest(bytes)===record.model.sha256,'bytes/hash mismatch');
    requireThat(bytes.length>=20,'truncated GLB');const jsonBytes=new DataView(bytes.buffer).getUint32(12,true);requireThat(jsonBytes<=bytes.length-20,'truncated GLB JSON');const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonBytes)));requireThat(!privateMetadata(metadata),'private author metadata');
    const template=await parseAlpacaGlb(bytes,{textureMode:this.options.textureMode??'rendered'});try{requireThat(valid(),'load cancelled');validateLunarTemplate(template,record);return template;}catch(error){disposeLunarTemplate(template);throw error;}
   })();
   const cancelled=new Promise<never>((_resolve,reject)=>load.controller.signal.addEventListener('abort',()=>reject(new Error('Lunar load cancelled')),{once:true}));
   const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{load.alive=false;reject(new Error('Lunar model timed out; retry when ready'));load.controller.abort();},positive(this.options.timeoutMs,120000)?this.options.timeoutMs:15000);});
   try{const template=await Promise.race([work,timeout,cancelled]);if(!valid()){disposeLunarTemplate(template);throw new Error('Lunar load cancelled');}load.template=template;load.status='ready';return template;}
   finally{if(timer)clearTimeout(timer);}
  }).catch(error=>{load.alive=false;load.error=error instanceof Error?error:new Error(String(error));load.status='failed';throw load.error;}).finally(()=>{load.promise=undefined;});load.promise=promise;return promise;
 }
 async instantiate(id:LunarShowcaseId,options:{retry?:boolean}={}):Promise<LunarAssetInstance>{
  const template=await this.template(id,!!options.retry);requireThat(!this.disposed,'library disposed');const scene=cloneSkeleton(template.scene) as THREE.Group,materials=new Map<THREE.Material,THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
  const own=(m:THREE.Material)=>{let clone=materials.get(m);if(!clone){clone=m.clone();materials.set(m,clone);}return clone;};scene.traverse(o=>{if(o instanceof THREE.Mesh){o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);o.castShadow=true;o.receiveShadow=true;if(o instanceof THREE.SkinnedMesh){o.frustumCulled=false;skeletons.add(o.skeleton);}}});
  let released=false;return {scene,animations:template.animations,definition:this.records.get(id)!,release(){if(released)return;released=true;scene.removeFromParent();materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());}};
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const load of this.loads.values()){load.alive=false;load.controller.abort();if(load.template)disposeLunarTemplate(load.template);}this.loads.clear();}
}
