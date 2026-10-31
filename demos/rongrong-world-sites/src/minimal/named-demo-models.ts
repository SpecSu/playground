import {bindLunarShowcaseScope} from './lunar-showcase-resources.ts';
import {bindFarmModelRecovery} from './farm-model-recovery.ts';
import configured from './named-demo-resource-deployment.json' with {type:'json'};
import {selectNamedDemoDeployment,createApprovedDemoResourceContext,approvedDemoMainResource,approvedDemoSelectedAnimal,type ApprovedDemoResourceContext,type NamedDemoDeployment} from './named-demo-resources.ts';
import {alpacaProvider,ALPACA_RUNTIME_REVISION} from './alpaca-provider.ts';
import {penguinProvider,PENGUIN_RUNTIME_REVISION} from './penguin-provider.ts';
import {prepareLocalAnimalModels,localAnimalDeploymentStatus,selectedLocalAnimal} from './local-animal-models.ts';
type Preparation={ready?:(context:ApprovedDemoResourceContext)=>boolean;selected:()=>Promise<void>;main:(species:'alpaca'|'penguin',deployment:unknown,target:{kind:'local'|'hosted';id:string;runtimeRevision:string},context:ApprovedDemoResourceContext)=>Promise<boolean>;revoke:()=>Promise<void>};
/** Explicit coordinator for already server-verified named sessions. Dependencies
 * exist for focused lifecycle tests; production uses the exact SHA/GLB validators. */
export function createNamedDemoModelPreparation(configuration:unknown,prepare:Preparation){
 let loaded:Readonly<{origin:string;scope:'named-demo'}>|null=null,pending:Promise<void>|null=null,pendingOrigin:string|null=null,loadedContext:ApprovedDemoResourceContext|null=null;
 const isReady=(context:ApprovedDemoResourceContext)=>prepare.ready?.(context)??true;
 async function load(d:NamedDemoDeployment,context:ApprovedDemoResourceContext){try{await prepare.selected();for(const species of ['alpaca','penguin'] as const)if(!await prepare.main(species,d.hunyuan[species],{...d.target,runtimeRevision:species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION},context))throw new Error(`Named demo ${species} actual asset validation failed`);if(!isReady(context))throw new Error('Named demo resources unavailable after preparation');loadedContext=context;loaded=Object.freeze({origin:d.target.id,scope:'named-demo'});}catch(error){loaded=null;await prepare.revoke();throw error;}}
 return {loaded:()=>loaded&&loadedContext&&isReady(loadedContext)?loaded:null,prepare(options:{origin:string;sessionMode:'named-demo'}):Promise<void>{
  // Server capability is checked by account bootstrap before this call. A query
  // string alone never invokes it, and ordinary mode is rejected again here.
  if(options?.sessionMode!=='named-demo')return Promise.reject(new Error('Named demo requires a server-verified named session'));
  let d:NamedDemoDeployment;try{d=selectNamedDemoDeployment(configuration,options.origin);}catch(error){return Promise.reject(error);}
  if(loaded){if(loaded.origin!==d.target.id)return Promise.reject(new Error('Model target change requires a full document reload'));if(loadedContext&&isReady(loadedContext))return Promise.resolve();loaded=null;}
  if(pending){if(pendingOrigin!==d.target.id)return Promise.reject(new Error('Pending model target change requires a full document reload'));return pending;}pendingOrigin=d.target.id;pending=load(d,createApprovedDemoResourceContext(configuration,options.origin)).finally(()=>{pending=null;pendingOrigin=null;});return pending;
 }};
}
const runtime=createNamedDemoModelPreparation(configured,{ready:context=>localAnimalDeploymentStatus()==='ready'&&(['cow','bunny'] as const).every(s=>selectedLocalAnimal(s)?.sha256===approvedDemoSelectedAnimal(s,context)?.sha256)&&(['alpaca','penguin'] as const).every(s=>{const p=(s==='alpaca'?alpacaProvider:penguinProvider).get();return p?.sha256===approvedDemoMainResource(s,context).sha256&&p.admission.scope===undefined&&p.admission.mode==='demo'&&p.admission.approval==='demo-only';}),selected:()=>prepareLocalAnimalModels(),main:(species,_deployment,target,context)=>(species==='alpaca'?alpacaProvider:penguinProvider).prepareNamedDemo(context,target,{retry:true}),revoke:async()=>{await Promise.all([alpacaProvider.prepare(null,null),penguinProvider.prepare(null,null)]);}});
/** Called only after GET farm proves the account's named-demo capability. */
export async function prepareNamedDemoAnimalModels(options:{origin:string;sessionMode:'named-demo'}):Promise<void>{
 const saved={...options};if(saved.sessionMode!=='named-demo')return runtime.prepare(saved);
 const context=createApprovedDemoResourceContext(configured,saved.origin);bindFarmModelRecovery(context,saved.origin,()=>runtime.prepare(saved));await runtime.prepare(saved);bindLunarShowcaseScope(context,saved.origin);
}
export const loadedNamedDemo=runtime.loaded;
