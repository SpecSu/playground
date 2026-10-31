import {parseDemoName} from './demo-name.ts';
import type {AccountClient} from './account-client.ts';
import {localAnimalModelsRequested,prepareLocalAnimalModels} from './local-animal-models.ts';
import {useEffect,useState} from 'react';
import {Cloud,RefreshCw} from 'lucide-react';
import PhoneViewport from '../feed/PhoneViewport.tsx';
import MinimalApp from './MinimalApp.tsx';
import {MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY} from './model.ts';
import AccountGate from './AccountGate.tsx';
import {connectFarmAccount,type FarmAccountConnection} from './account-client.ts';
import {prepareConfiguredAlpacaProvider} from './alpaca-provider.ts';
import {prepareConfiguredPenguinProvider} from './penguin-provider.ts';
import './online-farm.css';
/** Account discovery happens before any save is opened. An unknown network/auth
 * state never silently falls back to someone else's browser-local farm. */
export default function FarmEntry(){
 const [search,setSearch]=useState(()=>typeof window==='undefined'?'':window.location.search);
 useEffect(()=>{const changed=()=>{const next=window.location.search;if((parseDemoName(search).kind==='none')!==(parseDemoName(next).kind==='none')){window.location.reload();return;}setSearch(next);};window.addEventListener('popstate',changed);window.addEventListener('pageshow',changed);return()=>{window.removeEventListener('popstate',changed);window.removeEventListener('pageshow',changed);};},[search]);
 return <FarmEntrySession key={search} search={search}/>;
}
function FarmEntrySession({search}:{search:string}){
 const selection=parseDemoName(search),demoName=selection.kind==='demo'?selection.name:undefined;
 const [connection,setConnection]=useState<FarmAccountConnection|null>(null),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0),[localExisting,setLocalExisting]=useState(false),[showAccount,setShowAccount]=useState(true);
 useEffect(()=>{
  let mounted=true,activeClient:AccountClient|undefined;const controller=new AbortController();setConnection(null);
  if(selection.kind==='invalid'){setConnection({status:'unavailable',message:selection.message});return()=>{mounted=false;controller.abort();};}
  void (async()=>{
   if(!mounted)return;
   const result=await connectFarmAccount((input,init)=>fetch(input,{...init,signal:controller.signal}),undefined,demoName,demoName?async()=>{const {prepareNamedDemoAnimalModels}=await import('./named-demo-models.ts');await prepareNamedDemoAnimalModels({origin:window.location.origin,sessionMode:'named-demo'});}:undefined,!demoName?async()=>{const {prepareSignedInFarmAnimalModels}=await import('./signed-in-farm-models.ts');await prepareSignedInFarmAnimalModels({origin:window.location.origin,sessionMode:'signed-in-farm'});}:undefined);
   if(result.status==='online')activeClient=result.client;
   if(!mounted){activeClient?.dispose();return;}
   // Only the anonymous/local fallback uses configured local providers. Doing
   // this before account discovery would revoke a prepared formal scope on retry.
   if(!demoName&&result.status==='disabled')await Promise.allSettled([prepareConfiguredAlpacaProvider(),prepareConfiguredPenguinProvider()]);
   if(!demoName&&result.status==='disabled'&&localAnimalModelsRequested()){try{await prepareLocalAnimalModels();}catch{if(mounted)setConnection({status:'unavailable',message:'本机动物资源尚未校验完成，已暂停开档；请检查模型文件后重试，原存档未改动。'});return;}}
   if(mounted){setConnection(result);setReady(result.status==='online'&&!!result.client.farm);try{setLocalExisting(!demoName&&!!(localStorage.getItem(MINIMAL_STORAGE_KEY)||localStorage.getItem(LEGACY_MINIMAL_STORAGE_KEY)));}catch{setLocalExisting(false);}}
  })().catch(()=>{if(mounted)setConnection({status:'unavailable',message:'连接暂时无法完成，原存档没有改动，请重试'});});
  return()=>{mounted=false;controller.abort();activeClient?.dispose();};
 },[attempt,demoName]);
 if(!demoName&&connection?.status==='disabled')return <MinimalApp deferScene/>;
 if(connection?.status==='online'&&!ready&&!demoName&&localExisting&&!showAccount)return <MinimalApp accountClient={connection.client} onOpenAccount={()=>setShowAccount(true)} deferScene/>;
 if(connection?.status==='online'&&ready)return <MinimalApp key={connection.client.account.uid} session={connection.client} deferScene/>;
 return <main className="app-shell"><PhoneViewport><div className="egg-farm">{connection?.status==='online'?<><AccountGate client={connection.client} onReady={()=>setReady(true)}/>{!demoName&&localExisting&&<button type="button" className="account-back-local" onClick={()=>setShowAccount(false)}>继续本机牧场 · 不关联账号</button>}</>:<div className="account-gate"><section className="account-gate-card"><span className="account-gate-badge"><Cloud size={17}/>{connection?'连接暂未完成':'正在连接小家'}</span><h2>{connection?.status==='sign-in-required'?'先登录，再回家':'绒绒世界'}</h2><p role="status">{connection?.message??'正在确认你的账号和存档…'}</p>{connection?.status==='sign-in-required'?<a className="online-primary" href={"/signin-with-chatgpt?return_to="+encodeURIComponent("/"+search)}>登录 ChatGPT</a>:connection&&<button type="button" className="online-primary" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={17}/>重新连接</button>}</section></div>}</div></PhoneViewport></main>;
}
