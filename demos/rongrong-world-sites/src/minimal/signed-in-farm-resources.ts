import namedConfiguration from './named-demo-resource-deployment.json' with {type:'json'};
import {NAMED_DEMO_HOST,selectNamedDemoDeployment,createApprovedDemoResourceContext,approvedDemoMainResource,approvedDemoSelectedAnimal,approvedDemoPreparation,type ApprovedDemoResourceContext} from './named-demo-resources.ts';
import type {HunyuanMainSpecies} from './hunyuan-profile.ts';
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function requireThat(value:unknown,message:string):asserts value{if(!value)throw new Error(`Signed-in farm: ${message}`);}
declare const signedInFarmBrand:unique symbol;
/** Static-resource capability only, not a login/ownership credential. Issuance is
 * confined to trusted compiled configuration after the account boundary. Never
 * accept request/save JSON as configuration or expose the source token. */
export type ApprovedSignedInFarmResourceContext={readonly [signedInFarmBrand]:true};
const issued=new WeakMap<object,{source:ApprovedDemoResourceContext;origin:string}>();
export function isApprovedSignedInFarmResourceContext(value:unknown):value is ApprovedSignedInFarmResourceContext{return value!==null&&typeof value==='object'&&issued.has(value);}
export function assertApprovedSignedInFarmResourceContext(value:unknown):asserts value is ApprovedSignedInFarmResourceContext{requireThat(isApprovedSignedInFarmResourceContext(value),'unissued resource context');}
function entry(context:ApprovedSignedInFarmResourceContext){assertApprovedSignedInFarmResourceContext(context);return issued.get(context)!;}
/** Explicit scope mapping reuses evidence, never rewrites a demo/local receipt or
 * equates operational availability with measured mobile production quality. */
export function createApprovedSignedInFarmResourceContext(configuration:unknown,actualOrigin:unknown,sourceConfiguration:unknown=namedConfiguration):ApprovedSignedInFarmResourceContext{
 requireThat(actualOrigin===NAMED_DEMO_HOST,'origin must match the exact approved public deployment');
 const config=record(configuration),target=record(config.target),reuse=record(config.evidenceReuse);
 requireThat(config.schema==='farm-signed-in-resources/v1'&&config.scope==='signed-in-farm','invalid explicit scope');
 requireThat(target.kind==='hosted'&&target.id===actualOrigin,'target origin mismatch');
 requireThat(reuse.kind==='reuse-verified-artifacts'&&reuse.sourceScope==='named-demo'&&typeof reuse.purpose==='string'&&reuse.purpose.trim(),'missing evidence reuse declaration');
 const source=selectNamedDemoDeployment(sourceConfiguration,actualOrigin),candidates=record(reuse.candidates);
 requireThat(reuse.sourceCodeCommit===source.codeCommit&&reuse.materializationSha256===source.materialization.manifestSha256,'source evidence identity mismatch');
 requireThat(Object.keys(candidates).length===4,'candidate set mismatch');
 for(const species of ['cow','bunny'] as const)requireThat(candidates[species]===source.localAnimals.selected[species]?.sha256,'selected candidate identity mismatch');
 for(const species of ['alpaca','penguin'] as const)requireThat(candidates[species]===record(record(source.hunyuan[species]).profile).candidateSha256,'main candidate identity mismatch');
 const token=Object.freeze({}) as ApprovedSignedInFarmResourceContext;
 issued.set(token,{source:createApprovedDemoResourceContext(sourceConfiguration,actualOrigin),origin:actualOrigin});return token;
}
export function approvedSignedInFarmMainResource(species:HunyuanMainSpecies,context:ApprovedSignedInFarmResourceContext){return approvedDemoMainResource(species,entry(context).source);}
export function approvedSignedInFarmSelectedAnimal(species:string,context:ApprovedSignedInFarmResourceContext){return approvedDemoSelectedAnimal(species,entry(context).source);}
/** Byte/GLB parsing still happens in the provider after this target-bound mapping. */
export function approvedSignedInFarmPreparation(context:ApprovedSignedInFarmResourceContext,species:HunyuanMainSpecies,actual:unknown){const saved=entry(context),target=record(actual);requireThat(target.kind==='hosted'&&target.id===saved.origin,'actual target does not match signed-in farm');return approvedDemoPreparation(saved.source,species,actual);}
