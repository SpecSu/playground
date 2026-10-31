import {bindLunarShowcaseScope} from './lunar-showcase-resources.ts';
import {bindFarmModelRecovery} from './farm-model-recovery.ts';
import configured from './signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext,approvedSignedInFarmPreparation,approvedSignedInFarmMainResource,approvedSignedInFarmSelectedAnimal,type ApprovedSignedInFarmResourceContext} from './signed-in-farm-resources.ts';
import {alpacaProvider,ALPACA_RUNTIME_REVISION} from './alpaca-provider.ts';
import {penguinProvider,PENGUIN_RUNTIME_REVISION} from './penguin-provider.ts';
import {prepareLocalAnimalModels,localAnimalDeploymentStatus,selectedLocalAnimal} from './local-animal-models.ts';

type MainSpecies='alpaca'|'penguin';
type Target={kind:'hosted';id:string;runtimeRevision:string};
type Preparation={ready?:(context:ApprovedSignedInFarmResourceContext)=>boolean;selected:()=>Promise<void>;main:(species:MainSpecies,target:Target,context:ApprovedSignedInFarmResourceContext)=>Promise<boolean>;revoke:()=>Promise<void>};
export type SignedInFarmModelOptions={origin:string;sessionMode:'signed-in-farm'};
export type LoadedSignedInFarmModels=Readonly<{origin:string;scope:'signed-in-farm';approval:'demo-only';mobilePerformance:'unmeasured'}>;

/** Coordinator for an already server-verified account resource capability, never
 * a login/ownership validator. Configuration must be trusted compiled metadata,
 * not request/save JSON. Tests can inject loaders; runtime retains all byte,
 * skin, profile and behavior validators through the existing preparation paths. */
export function createSignedInFarmModelPreparation(configuration:unknown,prepare:Preparation){
 let loaded:LoadedSignedInFarmModels|null=null,pending:Promise<void>|null=null,loadedContext:ApprovedSignedInFarmResourceContext|null=null;
 const isReady=(context:ApprovedSignedInFarmResourceContext)=>prepare.ready?.(context)??true;
 const target=(origin:string,species:MainSpecies):Target=>({kind:'hosted',id:origin,runtimeRevision:species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION});
 async function load(origin:string,context:ApprovedSignedInFarmResourceContext){
  try{
   await prepare.selected();
   for(const species of ['alpaca','penguin'] as const)if(!await prepare.main(species,target(origin,species),context))throw new Error(`Signed-in farm ${species} actual asset validation failed`);
   if(!isReady(context))throw new Error('Signed-in farm resources unavailable after preparation');
   loadedContext=context;loaded=Object.freeze({origin,scope:'signed-in-farm',approval:'demo-only',mobilePerformance:'unmeasured'});
  }catch(error){loaded=null;await prepare.revoke();throw error;}
 }
 return {loaded:()=>loaded&&loadedContext&&isReady(loadedContext)?loaded:null,prepare(options:SignedInFarmModelOptions):Promise<void>{
  // A URL/query or this string alone is not server authorization. Account
  // bootstrap must validate its server-issued capability before calling here.
  if(options?.sessionMode!=='signed-in-farm')return Promise.reject(new Error('Signed-in farm requires a server-verified signed-in session'));
  let context:ApprovedSignedInFarmResourceContext;
  try{
   context=createApprovedSignedInFarmResourceContext(configuration,options.origin);
   for(const species of ['alpaca','penguin'] as const)approvedSignedInFarmPreparation(context,species,target(options.origin,species));
  }catch(error){return Promise.reject(error);}
  // Context issuance admits one exact public origin; a different origin cannot
  // reuse pending/loaded resources, including when preparation is in progress.
  if(loaded&&isReady(context))return Promise.resolve();
  loaded=null;
  if(pending)return pending;
  pending=load(options.origin,context).finally(()=>{pending=null;});return pending;
 }};
}
const runtime=createSignedInFarmModelPreparation(configured,{
 ready:context=>localAnimalDeploymentStatus()==='ready'&&(['cow','bunny'] as const).every(s=>selectedLocalAnimal(s)?.sha256===approvedSignedInFarmSelectedAnimal(s,context)?.sha256)&&(['alpaca','penguin'] as const).every(s=>{const p=(s==='alpaca'?alpacaProvider:penguinProvider).get();return p?.sha256===approvedSignedInFarmMainResource(s,context).sha256&&p.admission.scope==='signed-in-farm'&&p.admission.mode==='demo'&&p.admission.approval==='demo-only';}),
 selected:()=>prepareLocalAnimalModels(),
 main:(species,target,context)=>(species==='alpaca'?alpacaProvider:penguinProvider).prepareSignedInFarm(context,target,{retry:true}),
 revoke:async()=>{await Promise.all([alpacaProvider.prepare(null,null),penguinProvider.prepare(null,null)]);},
});
/** Invoke only after the account GET verifies its signed-in-farm capability. */
export async function prepareSignedInFarmAnimalModels(options:SignedInFarmModelOptions):Promise<void>{
 const saved={...options};if(saved.sessionMode!=='signed-in-farm')return runtime.prepare(saved);
 const context=createApprovedSignedInFarmResourceContext(configured,saved.origin);bindFarmModelRecovery(context,saved.origin,()=>runtime.prepare(saved));await runtime.prepare(saved);bindLunarShowcaseScope(context,saved.origin);
}
export const loadedSignedInFarm=runtime.loaded;
