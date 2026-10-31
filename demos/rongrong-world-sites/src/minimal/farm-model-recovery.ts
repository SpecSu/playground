import {alpacaProvider,prepareConfiguredAlpacaProvider,ALPACA_RUNTIME_REVISION,type AlpacaRuntimeProvider} from './alpaca-provider.ts';
import {penguinProvider,prepareConfiguredPenguinProvider,PENGUIN_RUNTIME_REVISION} from './penguin-provider.ts';
import {isApprovedSignedInFarmResourceContext,approvedSignedInFarmPreparation,approvedSignedInFarmMainResource,type ApprovedSignedInFarmResourceContext} from './signed-in-farm-resources.ts';
import {assertApprovedDemoResourceContext,approvedDemoPreparation,approvedDemoMainResource,namedDemoActualTarget,type ApprovedDemoResourceContext} from './named-demo-resources.ts';
type Species='alpaca'|'penguin';
type Context=ApprovedSignedInFarmResourceContext|ApprovedDemoResourceContext;
type Dependencies={origin:()=>unknown;provider:(species:Species)=>Pick<AlpacaRuntimeProvider<Species>,'sha256'|'admission'>|null;configured:(species:Species,options:{retry?:boolean})=>Promise<boolean>};
/** Resource recovery is selected by the already verified bootstrap, never by a
 * URL name, save, or missing provider. Preserve its scope after runtime failure;
 * a different origin/scope needs a full document reload. */
export function createFarmModelRecovery(dependencies:Dependencies){
 let active:{origin:string;scope:'signed-in-farm'|'named-demo';sha:Record<Species,string>;recover:()=>Promise<void>;pending:Promise<void>|null}|null=null;
 const matches=(species:Species)=>{const p=dependencies.provider(species);return !!active&&!!p&&p.sha256===active.sha[species]&&p.admission.mode==='demo'&&p.admission.approval==='demo-only'&&p.admission.scope===(active.scope==='signed-in-farm'?'signed-in-farm':undefined);};
 return {
  bind(context:Context,origin:string,recover:()=>Promise<void>){
   if(dependencies.origin()!==origin)throw new Error('Model recovery actual origin mismatch');
   const formal=isApprovedSignedInFarmResourceContext(context),scope=formal?'signed-in-farm':'named-demo';
   if(!formal)assertApprovedDemoResourceContext(context);
   const target=namedDemoActualTarget(origin),sha={} as Record<Species,string>;
   for(const species of ['alpaca','penguin'] as const){const actual={...target,runtimeRevision:species==='alpaca'?ALPACA_RUNTIME_REVISION:PENGUIN_RUNTIME_REVISION};if(formal){approvedSignedInFarmPreparation(context,species,actual);sha[species]=approvedSignedInFarmMainResource(species,context).sha256;}else{approvedDemoPreparation(context as ApprovedDemoResourceContext,species,actual);sha[species]=approvedDemoMainResource(species,context as ApprovedDemoResourceContext).sha256;}}
   if(active&&(active.origin!==origin||active.scope!==scope))throw new Error('Model recovery scope change requires a full document reload');
   if(active){if((['alpaca','penguin'] as const).some(s=>active!.sha[s]!==sha[s]))throw new Error('Model recovery candidate change requires a full document reload');active.recover=recover;}else active={origin,scope,sha,recover,pending:null};
  },
  async prepare(species:Species,options:{retry?:boolean}={}):Promise<boolean>{
   if(!active){if(dependencies.provider(species))return true;return dependencies.configured(species,options);}
   if(dependencies.origin()!==active.origin)throw new Error('Model recovery actual origin mismatch');
   for(const candidate of ['alpaca','penguin'] as const)if(dependencies.provider(candidate)&&!matches(candidate))throw new Error('Model recovery provider scope or candidate mismatch');
   const selected=active;
   if(!selected.pending)selected.pending=selected.recover().finally(()=>{selected.pending=null;});
   await selected.pending;
   if(dependencies.origin()!==active.origin)throw new Error('Model recovery actual origin mismatch');
   return matches(species);
  },
 };
}
const recovery=createFarmModelRecovery({origin:()=>globalThis.location?.origin,provider:species=>(species==='alpaca'?alpacaProvider:penguinProvider).get(),configured:(species,options)=>(species==='alpaca'?prepareConfiguredAlpacaProvider:prepareConfiguredPenguinProvider)(options)});
export const bindFarmModelRecovery=recovery.bind;
export const prepareActiveMainAnimalModel=recovery.prepare;
