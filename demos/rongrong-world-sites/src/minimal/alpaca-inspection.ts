import {alpacaProvider,type AlpacaRuntimeProvider} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
import type {HunyuanMainSpecies} from './hunyuan-alpaca-contract.ts';
/** Explicit local CPU inspection capability, not publication or commerce readiness.
 * No save/config/query data can recreate the WeakMap-issued identity. The default
 * model/Worker path does not import Three or request any asset. */
declare const inspectionBrand:unique symbol;
export type HunyuanMainInspectionContext={readonly [inspectionBrand]:true};
/** Historical API alias retained for existing explicit World callers. */
export type AlpacaInspectionContext=HunyuanMainInspectionContext;
export type HunyuanMainResource<S extends HunyuanMainSpecies=HunyuanMainSpecies>=Pick<AlpacaRuntimeProvider<S>,'variant'|'sha256'|'profile'|'template'>&{readonly url?:string};
export type AlpacaInspectionResource=HunyuanMainResource<'alpaca'>;
export type AlpacaResource=AlpacaInspectionResource;
export type AlpacaTrialPlacement={muzzleReach:number;reachAdjustment:{back:number;forward:number;pondForward?:number}};
export type AlpacaInspectionInput={bytes:Uint8Array;expectedSha256:string;expectedBytes:number;profile:unknown;trialPlacement?:AlpacaTrialPlacement};
export type AlpacaInspectionStatus={purpose:'inspection-only';state:'active'|'invalidated';sha256:string;bytes:number;textureMode:'headers-only';approval:'none';authority:'measured'|'measured-with-explicit-placement-trial';trialFields:('motion.muzzleReach'|'motion.reachAdjustment')[];error:string|null};
type Entry={resource:HunyuanMainResource;status:AlpacaInspectionStatus};
const issued=new WeakMap<object,Entry>();
function entry(input:unknown):Entry{const value=input!==null&&typeof input==='object'?issued.get(input):undefined;if(!value)throw new Error('Unissued alpaca inspection context');return value;}
function deepFreeze<T>(value:T,seen=new WeakSet<object>()):T{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const part of Object.values(value))deepFreeze(part,seen);Object.freeze(value);}return value;}
export function prepareAlpacaInspection(input:AlpacaInspectionInput):Promise<AlpacaInspectionContext>{return prepareMainInspection(input,'alpaca');}
export function preparePenguinInspection(input:AlpacaInspectionInput):Promise<HunyuanMainInspectionContext>{return prepareMainInspection(input,'penguin');}
async function prepareMainInspection(input:AlpacaInspectionInput,species:HunyuanMainSpecies):Promise<HunyuanMainInspectionContext>{
 if(!(input?.bytes instanceof Uint8Array)||!Number.isSafeInteger(input.expectedBytes)||input.expectedBytes<=0||input.expectedBytes!==input.bytes.byteLength||!/^[a-f0-9]{64}$/.test(input.expectedSha256))throw new Error('Invalid alpaca inspection actual bytes/hash declaration');
 // Snapshot every caller-controlled value before the first await.
 const bytes=Uint8Array.from(input.bytes),sha256=input.expectedSha256,profile=structuredClone(input.profile),trial=structuredClone(input.trialPlacement);
 if(trial!==undefined){
  const motion=profile&&typeof profile==='object'&&!Array.isArray(profile)?(profile as {motion?:unknown}).motion:null;
  if(!motion||typeof motion!=='object'||Array.isArray(motion))throw new Error('Placement trial requires an explicit measured motion profile');
  const values=motion as Record<string,unknown>;
  if(values.muzzleReach!=null||values.reachAdjustment!=null)throw new Error('Placement trial cannot overwrite supplied measured placement fields');
  if(!trial||typeof trial!=='object'||Array.isArray(trial)||!trial.reachAdjustment||typeof trial.reachAdjustment!=='object'||Array.isArray(trial.reachAdjustment))throw new Error('Invalid explicit placement trial');
  values.muzzleReach=trial.muzzleReach;values.reachAdjustment=trial.reachAdjustment;
 }
 const actualSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(actualSha!==sha256)throw new Error('Alpaca inspection actual bytes/hash mismatch');
 const contract:typeof import('./hunyuan-alpaca-contract.ts')=await import('./hunyuan-alpaca-contract.ts');contract.assertHunyuanMainMeasuredProfile(profile,sha256,species);
 const template=await contract.parseAlpacaGlb(bytes,{textureMode:'headers-only'});contract.validateHunyuanMainLoadedAsset(template,species);
 const resource:HunyuanMainResource=Object.freeze({variant:`hunyuan:${species}` as const,sha256,profile:deepFreeze(profile),template});
 const token=Object.freeze({}) as AlpacaInspectionContext;
 issued.set(token,{resource,status:{purpose:'inspection-only',state:'active',sha256,bytes:bytes.byteLength,textureMode:'headers-only',approval:'none',authority:trial===undefined?'measured':'measured-with-explicit-placement-trial',trialFields:trial===undefined?[]:['motion.muzzleReach','motion.reachAdjustment'],error:null}});return token;
}
/** Revoked or wrong-species capabilities fail closed without production fallback. */
export function getHunyuanMainResource<S extends HunyuanMainSpecies>(species:S,inspection?:HunyuanMainInspectionContext|null):HunyuanMainResource<S>|null{
 if(species!=='alpaca'&&species!=='penguin')throw new Error('Unsupported main-farm inspection species');
 if(inspection==null)return (species==='alpaca'?alpacaProvider.get():penguinProvider.get()) as HunyuanMainResource<S>|null;
 const value=entry(inspection);return value.status.state==='active'&&value.resource.variant===`hunyuan:${species}`?value.resource as HunyuanMainResource<S>:null;
}
export function getAlpacaResource(inspection?:AlpacaInspectionContext|null):AlpacaResource|null{return getHunyuanMainResource('alpaca',inspection);}
export function assertHunyuanMainInspectionContext(input:unknown):asserts input is HunyuanMainInspectionContext{const value=entry(input);if(value.status.state!=='active')throw new Error(`Invalidated inspection context: ${value.status.error}`);}
export function assertAlpacaInspectionContext(input:unknown):asserts input is AlpacaInspectionContext{assertHunyuanMainInspectionContext(input);if(entry(input).resource.variant!=='hunyuan:alpaca')throw new Error('Wrong-species alpaca inspection context');}
export function invalidateHunyuanMainInspection(inspection:HunyuanMainInspectionContext,error:unknown):void{const value=entry(inspection);if(value.status.state==='active')value.status={...value.status,state:'invalidated',error:error instanceof Error?error.message:String(error)};}
export function invalidateAlpacaInspection(inspection:AlpacaInspectionContext,error:unknown):void{if(entry(inspection).resource.variant!=='hunyuan:alpaca')throw new Error('Wrong-species alpaca inspection context');invalidateHunyuanMainInspection(inspection,error);}
export function getHunyuanMainInspectionStatus(inspection:HunyuanMainInspectionContext):AlpacaInspectionStatus{const status=entry(inspection).status;return {...status,trialFields:[...status.trialFields]};}
export function getAlpacaInspectionStatus(inspection:AlpacaInspectionContext):AlpacaInspectionStatus{if(entry(inspection).resource.variant!=='hunyuan:alpaca')throw new Error('Wrong-species alpaca inspection context');return getHunyuanMainInspectionStatus(inspection);}
