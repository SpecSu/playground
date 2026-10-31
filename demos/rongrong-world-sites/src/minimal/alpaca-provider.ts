import type {ApprovedSignedInFarmResourceContext} from './signed-in-farm-resources.ts';
import type {ApprovedDemoResourceContext} from './named-demo-resources.ts';
import deploymentSource from './hunyuan-alpaca-deployment.json' with {type:'json'};
import {assessHunyuanPromotion,assessHunyuanDemoAdmission,type HunyuanPromotionTarget,type HunyuanDemoMobileEvidence} from './hunyuan-promotion.ts';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {AlpacaMeasuredProfile,HunyuanMainSpecies} from './hunyuan-alpaca-contract.ts';

/** Independently compiled consumer revision. Change this tag when its rig/physics integration changes. */
export const ALPACA_RUNTIME_REVISION='farm-alpaca-main-v28-contract-8';
type DeepReadonly<T>={readonly [K in keyof T]:T[K] extends object?DeepReadonly<T[K]>:T[K]};
export type AlpacaAdmission={scope?:'signed-in-farm';mode:'production'|'demo';approval:'production'|'demo-only';mobilePerformance?:HunyuanDemoMobileEvidence;limitations:readonly string[]};
export type AlpacaRuntimeProvider<S extends HunyuanMainSpecies='alpaca'>={readonly variant:`hunyuan:${S}`;readonly url:string;readonly sha256:string;readonly profile:DeepReadonly<AlpacaMeasuredProfile>;readonly template:GLTF;readonly admission:DeepReadonly<AlpacaAdmission>};
export type AlpacaProviderStatus={state:'unavailable'|'loading'|'ready'|'demo-ready'|'failed';error:string|null;admission?:DeepReadonly<AlpacaAdmission>};
export type AlpacaPreparationOptions={retry?:boolean;loadBytes?:(url:string,signal?:AbortSignal)=>Promise<Uint8Array>;timeoutMs?:number;/** Offline CPU tests/preflight only; configured browser startup always renders textures. */textureMode?:'rendered'|'headers-only'};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const record=(v:unknown)=>object(v)?v:{};
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const defaultLoad=async(url:string,signal?:AbortSignal,label='Alpaca')=>{const response=await fetch(url,{cache:'no-store',credentials:'same-origin',signal});if(!response.ok)throw new Error(`${label} asset HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());};
const digest=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
function freezeProfile(input:AlpacaMeasuredProfile):DeepReadonly<AlpacaMeasuredProfile>{
 const p=structuredClone(input);if(p.motion.pondStanding){for(const sample of p.motion.pondStanding.samples)Object.freeze(sample);Object.freeze(p.motion.pondStanding.samples);Object.freeze(p.motion.pondStanding);}if(p.motion.bowlStanding){for(const sample of p.motion.bowlStanding.samples)Object.freeze(sample);Object.freeze(p.motion.bowlStanding.samples);Object.freeze(p.motion.bowlStanding);}for(const part of [p.drinkDatum,p.motion.feet,p.motion.walkFeet,p.motion.walkContactFeet,p.motion.reachAdjustment,p.motion,p])Object.freeze(part);return p;
}

/** Pure default path: model/Worker consumers do not import Three or fetch bytes.
 * Only explicitly trusted deployment preparation dynamically loads the validator.
 * This is not an upload/save API. Metadata alone can never publish a provider. */
export class AlpacaProviderRegistry<S extends HunyuanMainSpecies='alpaca'>{
 private readonly species:S;
 constructor(species:S='alpaca' as S){if(species!=='alpaca'&&species!=='penguin')throw new Error('Unsupported main-farm species');this.species=species;}
 private provider:AlpacaRuntimeProvider<S>|null=null;
 private current:AlpacaProviderStatus={state:'unavailable',error:null};
 private generation=0;
 /** Orders public preparation intents before scoped wrappers first await. */
 private preparationIntent=0;
 private key:string|null=null;
 private pending:Promise<boolean>|null=null;
 get():AlpacaRuntimeProvider<S>|null{return this.current.state==='ready'||this.current.state==='demo-ready'?this.provider:null;}
 status():AlpacaProviderStatus{return {...this.current};}
 /** A stale actor cannot revoke a newer candidate. Recovery requires explicit preparation retry. */
 reportRuntimeFailure(candidateSha256:string,error:string):void{if(this.provider?.sha256!==candidateSha256)return;this.preparationIntent++;this.generation++;this.provider=null;this.pending=null;this.current={state:'failed',error};}
 prepare(input:unknown,target:unknown,options:AlpacaPreparationOptions={}):Promise<boolean>{return this.prepareVerified(input,target,options);}
 /** Explicit named-only mapping preserves source receipts and independently binds
  * actual target. Production prepare never accepts this authorization path. */
 async prepareNamedDemo(context:ApprovedDemoResourceContext,target:unknown,options:AlpacaPreparationOptions={}):Promise<boolean>{const intent=++this.preparationIntent;try{const {approvedDemoPreparation}=await import('./named-demo-resources.ts');if(intent!==this.preparationIntent)return false;const approved=approvedDemoPreparation(context,this.species,target);return this.prepareVerified(approved.deployment,target,options,approved.sourceTarget);}catch(error){if(intent!==this.preparationIntent)return false;await this.prepare(null,null);throw error;}}
 /** Explicit formal-account scope; this is not a production-quality upgrade. */
 async prepareSignedInFarm(context:ApprovedSignedInFarmResourceContext,target:unknown,options:AlpacaPreparationOptions={}):Promise<boolean>{const intent=++this.preparationIntent;try{const {approvedSignedInFarmPreparation}=await import('./signed-in-farm-resources.ts');if(intent!==this.preparationIntent)return false;const approved=approvedSignedInFarmPreparation(context,this.species,target);return this.prepareVerified(approved.deployment,target,options,approved.sourceTarget,'signed-in-farm');}catch(error){if(intent!==this.preparationIntent)return false;await this.prepare(null,null);throw error;}}
 private prepareVerified(input:unknown,target:unknown,options:AlpacaPreparationOptions={},sourceTarget?:unknown,scope?:'signed-in-farm'):Promise<boolean>{
  this.preparationIntent++;
  const label=this.species==='alpaca'?'Alpaca':'Penguin';
  const fail=(error:string|null,state:'failed'|'unavailable'='failed')=>{this.generation++;this.provider=null;this.pending=null;this.key=null;this.current={state,error};return Promise.resolve(false);};
  if(input===null||input===undefined)return fail(null,'unavailable');
  let deployment:Record<string,unknown>;
  try{deployment=record(structuredClone(input));}catch{return fail(`Invalid ${this.species} deployment`);}
  const mode=deployment.mode===undefined?'production':deployment.mode;
  if(mode!=='production'&&mode!=='demo')return fail(`Unknown ${this.species} deployment admission mode`);
  const declared=record(deployment.target),actual=record(target),evidenceTarget=sourceTarget??target;
  if(!['kind','id','runtimeRevision'].every(key=>declared[key]===record(evidenceTarget)[key]))return fail(`${label} deployment target does not match this runtime`);
  const assessment=mode==='demo'?assessHunyuanDemoAdmission(this.species,deployment.manifest,evidenceTarget):assessHunyuanPromotion(this.species,deployment.manifest,evidenceTarget);
  if(assessment.status==='blocked'||!assessment.asset)return fail(`${label} unavailable: ${assessment.reasons.join(', ')}`);
  const mobile='mobilePerformance' in assessment?assessment.mobilePerformance:undefined;
  const admission:DeepReadonly<AlpacaAdmission>=Object.freeze({...(scope?{scope}:{}),mode,approval:mode==='demo'?'demo-only':'production',...(mobile?{mobilePerformance:Object.freeze({...mobile})}:{}),limitations:Object.freeze(mobile?.status==='unmeasured'?[`mobile-performance: unmeasured — ${mobile.reason}`]:[])});
  const asset=assessment.asset,key=JSON.stringify([actual,asset.sha256,deployment.profile,mode,admission,options.textureMode??'rendered']);
  if(this.key===key){if(this.current.state==='ready'||this.current.state==='demo-ready')return Promise.resolve(true);if(this.pending)return this.pending;if(this.current.state==='failed'&&!options.retry)return Promise.resolve(false);}
  const generation=++this.generation;this.provider=null;this.key=key;this.current={state:'loading',error:null};
  const controller=new AbortController(),timeoutMs=options.timeoutMs??15_000;let timer:ReturnType<typeof setTimeout>|undefined;
  const work=(async()=>{
   const contract:typeof import('./hunyuan-alpaca-contract.ts')=await import('./hunyuan-alpaca-contract.ts'),profile=deployment.profile;
   contract.assertHunyuanMainMeasuredProfile(profile,asset.sha256,this.species);
   if(generation!==this.generation)return false;
   const bytes=Uint8Array.from(await (options.loadBytes??((url,signal)=>defaultLoad(url,signal,label)))(asset.url,controller.signal));
   const evidence=record(record(deployment.manifest)[`hunyuan:${this.species}`]),expectedBytes=record(evidence.artifact).bytes;
   if(bytes.byteLength!==expectedBytes||await digest(bytes)!==asset.sha256)throw new Error(`${label} actual bytes/hash do not match the verified candidate`);
   if(generation!==this.generation)return false;
   const template=await contract.parseAlpacaGlb(bytes,{textureMode:options.textureMode??'rendered'});
   contract.validateHunyuanMainLoadedAsset(template,this.species);
   if(generation!==this.generation)return false;
   this.provider=Object.freeze({variant:`hunyuan:${this.species}` as const,url:asset.url,sha256:asset.sha256,profile:freezeProfile(profile),template,admission});
   this.current={state:mode==='demo'?'demo-ready':'ready',error:null,admission};return true;
  })();
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(`${label} verification timed out; retry when resources are available`));},Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:15_000);});
  const task=Promise.race([work,timeout]).catch(error=>{if(generation===this.generation){this.generation++;this.provider=null;this.pending=null;this.current={state:'failed',error:error instanceof Error?error.message:String(error)};}return false;}).finally(()=>{if(timer!==undefined)clearTimeout(timer);if(generation===this.generation)this.pending=null;});
  this.pending=task;return task;
 }
}
export const alpacaProvider=new AlpacaProviderRegistry();
/** Presentation only; operational demo availability is not full-production QA. */
export function alpacaProviderStatusLabel(status:AlpacaProviderStatus):string{
 if(status.state==='demo-ready'&&status.admission?.scope==='signed-in-farm')return status.admission.mobilePerformance?.status==='unmeasured'?'农场可用 · 手机性能未测':'农场可用 · 非完整发布';
 if(status.state==='demo-ready')return status.admission?.mobilePerformance?.status==='unmeasured'?'演示可用 · 手机性能未测':'演示可用 · 非完整发布';
 return {unavailable:'资源未配置',loading:'正在验证资源',ready:'生产资源已验证',failed:'资源验证失败'}[status.state];
}

/** Origin is independently observed, never taken from the deployment receipt. */
export function actualAlpacaTarget(origin:unknown,runtimeRevision:unknown):HunyuanPromotionTarget|null{
 if(!nonempty(origin)||!nonempty(runtimeRevision))return null;
 try{const url=new URL(origin);if(!['http:','https:'].includes(url.protocol))return null;const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(!local&&url.protocol!=='https:')return null;return {kind:local?'local':'hosted',id:url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='5190'?'http://127.0.0.1:5190':url.origin,runtimeRevision};}catch{return null;}
}
export function configuredAlpacaTarget(origin:unknown):HunyuanPromotionTarget|null{return actualAlpacaTarget(origin,ALPACA_RUNTIME_REVISION);}
/** Call before opening a farm; null configuration is a synchronous no-fetch no-op.
 * Existing saved alpaca remain known even if this preparation fails. */
export function prepareConfiguredAlpacaProvider(options:{retry?:boolean}={}):Promise<boolean>{
 const deployment:unknown=deploymentSource;
 if(deployment===null)return alpacaProvider.prepare(null,null);
 const actual=configuredAlpacaTarget(globalThis.location?.origin);
 return alpacaProvider.prepare(deployment,actual,options);
}
