import {assessHunyuanDemoAdmission} from './hunyuan-promotion.ts';
import {assertHunyuanMainMeasuredProfile,type AlpacaMeasuredProfile,type HunyuanMainSpecies} from './hunyuan-profile.ts';
import {ALPACA_RUNTIME_REVISION} from './alpaca-provider.ts';
import {PENGUIN_RUNTIME_REVISION} from './penguin-provider.ts';
import {LOCAL_ANIMAL_MANIFEST} from './local-animal-manifest.ts';
import {createLocalAnimalDeployment,type LocalAnimalManifest,type LocalAnimalSelection} from './local-animal-deployment.ts';
export const NAMED_DEMO_HOST='https://fluffy-farm-companions.tangguozhou.chatgpt.site';
export type NamedDemoTarget={kind:'local'|'hosted';id:string};
export type NamedDemoDeployment={target:NamedDemoTarget;scope:'named-demo';targetRebinding?:{kind:'reuse-verified-demo-evidence';sourceTarget:NamedDemoTarget;approvalRef:string};codeCommit:string;materialization:{kind:'verified-static-package';manifestSha256:string;reportRef:string};localAnimals:LocalAnimalManifest;hunyuan:{alpaca:unknown;penguin:unknown}};
export type NamedDemoResourceConfiguration={schema:'farm-named-demo-resources/v1';targets:NamedDemoDeployment[]};
function requireThat(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(`Named demo: ${message}`);}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function record(value:unknown,label:string):Record<string,unknown>{requireThat(object(value),`${label} must be an object`);return value;}
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function stable(value:unknown):string{if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(object(value))return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;return JSON.stringify(value);}
export function namedDemoActualTarget(origin:unknown):NamedDemoTarget{
 requireThat(typeof origin==='string','actual origin is required');
 if(origin==='http://127.0.0.1:5190'||origin==='http://localhost:5190')return {kind:'local',id:'http://127.0.0.1:5190'};
 requireThat(origin===NAMED_DEMO_HOST,'origin is not approved for named demo');return {kind:'hosted',id:NAMED_DEMO_HOST};
}
/** TRUSTED compiled configuration only. This validates reviewed package metadata;
 * browser admission still hashes/parses actual bytes. No HTTP availability claim
 * is generated here and no local receipt is rewritten into a hosted receipt. */
export function selectNamedDemoDeployment(config:unknown,origin:unknown):NamedDemoDeployment{
 const actual=namedDemoActualTarget(origin),root=record(structuredClone(config),'configuration');
 requireThat(root.schema==='farm-named-demo-resources/v1'&&Array.isArray(root.targets)&&root.targets.length>0,'missing explicit target deployments');
 const seen=new Set<string>();let selected:NamedDemoDeployment|undefined;
 for(const item of root.targets){
  const d=record(item,'deployment'),target=record(d.target,'target'),canonical=namedDemoActualTarget(target.id);
  requireThat(target.id===canonical.id&&target.kind===canonical.kind&&!seen.has(canonical.id),'noncanonical or duplicate target');seen.add(canonical.id);
  requireThat(d.scope==='named-demo'&&typeof d.codeCommit==='string'&&/^[a-f0-9]{40}$/.test(d.codeCommit),'scope/code identity missing');
  const proof=record(d.materialization,'materialization');requireThat(proof.kind==='verified-static-package'&&hash(proof.manifestSha256)&&typeof proof.reportRef==='string'&&proof.reportRef.trim(),'verified package evidence missing');
  // Cow/bunny are deliberate reviewed replacements, never arbitrary profiles.
  requireThat(stable(d.localAnimals)===stable(LOCAL_ANIMAL_MANIFEST),'selected cow/bunny deployment differs from approved compiled identities');createLocalAnimalDeployment(d.localAnimals as LocalAnimalManifest);
  let evidenceTarget=canonical;
  if(d.targetRebinding!==undefined){const mapping=record(d.targetRebinding,'targetRebinding'),source=record(mapping.sourceTarget,'sourceTarget');requireThat(canonical.kind==='hosted'&&mapping.kind==='reuse-verified-demo-evidence'&&source.kind==='local'&&source.id==='http://127.0.0.1:5190'&&typeof mapping.approvalRef==='string'&&mapping.approvalRef.trim(),'invalid explicit demo evidence mapping');evidenceTarget={kind:'local',id:'http://127.0.0.1:5190'};}
  const models=record(d.hunyuan,'hunyuan');
  for(const species of ['alpaca','penguin'] as const){
   const model=record(models[species],species),declared=record(model.target,`${species} target`),runtimeRevision=species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION,expected={...evidenceTarget,runtimeRevision};
   requireThat(model.mode==='demo'&&['kind','id','runtimeRevision'].every(k=>declared[k]===expected[k as keyof typeof expected]),`${species} target/admission mismatch`);
   const assessed=assessHunyuanDemoAdmission(species,model.manifest,expected);requireThat(assessed.status==='demo-ready'&&assessed.asset,`${species} evidence blocked: ${assessed.reasons.join(', ')}`);assertHunyuanMainMeasuredProfile(model.profile,assessed.asset.sha256,species);
  }
  if(canonical.id===actual.id)selected=item as NamedDemoDeployment;
 }
 requireThat(selected,'this origin has no explicit approved named deployment');return freeze(selected);
}
declare const approvedDemoBrand:unique symbol;
export type ApprovedDemoResourceContext={readonly [approvedDemoBrand]:true};
type ApprovedResource={readonly variant:`hunyuan:${HunyuanMainSpecies}`;readonly sha256:string;readonly profile:AlpacaMeasuredProfile};
const issued=new WeakMap<object,NamedDemoDeployment>();
/** Server bootstrap only: call with the trusted compiled package, not request JSON.
 * Its opaque result is passed to one named-demo authority, never a global registry. */
export function createApprovedDemoResourceContext(config:unknown,actualOrigin:unknown):ApprovedDemoResourceContext{const d=selectNamedDemoDeployment(config,actualOrigin),token=Object.freeze({}) as ApprovedDemoResourceContext;issued.set(token,d);return token;}
export function isApprovedDemoResourceContext(value:unknown):value is ApprovedDemoResourceContext{return !!value&&typeof value==='object'&&issued.has(value);}
export function assertApprovedDemoResourceContext(value:unknown):asserts value is ApprovedDemoResourceContext{requireThat(isApprovedDemoResourceContext(value),'unissued server resource context');}
function deployment(context:ApprovedDemoResourceContext):NamedDemoDeployment{assertApprovedDemoResourceContext(context);return issued.get(context)!;}
export function approvedDemoMainResource(species:HunyuanMainSpecies,context:ApprovedDemoResourceContext):ApprovedResource{const d=record(deployment(context).hunyuan[species],species),profile=d.profile as AlpacaMeasuredProfile;return {variant:`hunyuan:${species}`,sha256:profile.candidateSha256,profile};}
export function approvedDemoSelectedAnimal(species:string,context:ApprovedDemoResourceContext):Readonly<LocalAnimalSelection>|null{const selected=deployment(context).localAnimals.selected;return species==='cow'||species==='bunny'?selected[species]??null:null;}

/** Browser registry entry uses this opaque authorization and still verifies fetched
 * bytes/GLB. Source receipts remain local evidence; actual target is independent. */
export function approvedDemoPreparation(context:ApprovedDemoResourceContext,species:HunyuanMainSpecies,actual:unknown){const d=deployment(context),target=record(actual,'actual target'),revision=species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION;requireThat(target.kind===d.target.kind&&target.id===d.target.id&&target.runtimeRevision===revision,'actual target does not match approved named demo');return {deployment:d.hunyuan[species],sourceTarget:{...(d.targetRebinding?.sourceTarget??d.target),runtimeRevision:revision}};}
