import {validBoardingPage,type BoardingCommand,type BoardingPage} from './boarding-contract.ts';
import {parseDemoName} from './demo-name.ts';
import {dayKey} from './farm-calendar.ts';
import type {FarmAccount} from './account-contract.ts';
import type {CanonicalFarm,MinimalBootstrapRequest,MinimalCommandRequest,MinimalResult,MinimalView} from './cloud-contract.ts';
import type {CreativeCommand} from './creative-authority.ts';
import type {AssetWishingCommand,ExchangePage} from './exchange-contract.ts';
import type {WishingCommand} from './cloud-contract.ts';
import {validateMinimalSave,type MinimalState} from './model.ts';
export type AccountStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;
export type NamedDemoVisit={readOnly:true;target:{name:string;handle:string};farm:null|{state:MinimalState}};
export type FarmFetch=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
type Route='bootstrap'|'command'|'wishing'|'creative'|'boarding-command';
export type PendingAccountRequest={version:1;uid:string;route:Route;payload:Record<string,unknown>};
export const pendingAccountKey=(uid:string,requestId?:string)=>`dreamina-farm-pending-v1:${uid}${requestId?`:${requestId}`:''}`;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validAccount=(value:unknown):value is FarmAccount=>record(value)&&typeof value.uid==='string'&&/^uid_[a-f0-9]{64}$/.test(value.uid)&&typeof value.handle==='string'&&typeof value.createdAt==='number';
const validFarm=(value:unknown,uid:string):value is CanonicalFarm=>record(value)&&value.accountId===uid&&typeof value.farmId==='string'&&Number.isSafeInteger(value.revision)&&(value.revision as number)>=1&&validateMinimalSave(value.state);
const validView=(value:unknown,uid:string):value is MinimalView=>record(value)&&typeof value.serverTime==='number'&&(value.farm===null||validFarm(value.farm,uid));
const requestOptions=(uid?:string):RequestInit=>({credentials:'same-origin',cache:'no-store',headers:uid?{'X-Farm-Account':uid}:{}});
export class FarmConnectionError extends Error{readonly code:string;constructor(code:string,message:string){super(message);this.code=code;}}
function responseError(response:Response,value:unknown):FarmConnectionError{
 const code=record(value)&&typeof value.code==='string'?value.code:'network';
 return new FarmConnectionError(code,code==='account-changed'||response.status===401?'登录账号已变化，请回到原账号再重试':record(value)&&typeof value.message==='string'?value.message:'连接暂时中断，请重试同一条指令');
}
/** Durable outbox is scoped by verified UID; never reads/writes legacy farm keys.
 * Unknown POST outcome remains pending. A new operation cannot replace it. After
 * replay we refresh current authority because immutable receipts may be older.
 * A validated terminal receipt settles the write; a later read is not its ACK.
 */
export class AccountClient{
 readonly account:FarmAccount;
 readonly demoName:string|null;
 private disposed=false;
 private controller=new AbortController();
 importLegacyAllowed=false;
 view:MinimalView;
 pending:PendingAccountRequest|null=null;
 private fetcher:FarmFetch;
 private storage:AccountStorage;
 private running=false;
 // Response timestamps are server wall time; elapsed presentation time must not
 // inherit device clock corrections (NTP, manual changes, or timezone settings).
 private receivedAt=performance.now();
 private listeners=new Set<()=>void>();
 constructor(account:FarmAccount,view:MinimalView,fetcher:FarmFetch,storage:AccountStorage,demoName?:string){
  if(demoName!==undefined){const selected=parseDemoName(new URLSearchParams({name:demoName}));if(selected.kind!=='demo'||selected.name!==demoName)throw new FarmConnectionError('invalid-demo-name','测试名称无效');}
  this.demoName=demoName??null;this.account=account;this.view=view;this.fetcher=fetcher;this.storage=storage;
  this.readPending();
 }
 private pendingStorageKey:string|null=null;
 /** One immutable storage record per request. localStorage has no compare-and-swap;
  * distinct keys preserve both requests even if separate tabs race their checks.
  * The old singleton key remains readable for safe client upgrades. */
 private readPending():void{
  const prefix=pendingAccountKey(this.account.uid),keys=new Set<string>();
  if(this.storage.getItem(prefix)!==null)keys.add(prefix);
  for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(`${prefix}:`))keys.add(key);}
  this.pending=null;this.pendingStorageKey=null;
  for(const key of [...keys].sort()){
   const raw=this.storage.getItem(key);if(raw===null)continue;let value:unknown;
   try{value=JSON.parse(raw);}catch{throw new FarmConnectionError('pending-corrupt','上次指令记录无法读取，请先保留本页与存档');}
   if(!record(value)||value.version!==1||value.uid!==this.account.uid||!['bootstrap','command','wishing','creative','boarding-command'].includes(value.route as string)||!record(value.payload)||typeof value.payload.requestId!=='string'||(key!==prefix&&key!==pendingAccountKey(this.account.uid,value.payload.requestId)))throw new FarmConnectionError('pending-corrupt','上次指令记录无法读取，请先保留本页与存档');
   this.pending=value as PendingAccountRequest;this.pendingStorageKey=key;return;
  }
 }

 get farm():CanonicalFarm|null{return this.view.farm;}
 get busy(){return this.running;}
 now(){return this.view.serverTime+Math.max(0,performance.now()-this.receivedAt);}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private notify(){if(!this.disposed)for(const listener of this.listeners)listener();}
 dispose(){this.disposed=true;this.controller.abort();this.listeners.clear();}
 private active(){if(this.disposed)throw new FarmConnectionError('account-disposed','测试账号已切换或页面已关闭，请重新连接');}
 private url(route:string,extra?:Record<string,string>){const query=new URLSearchParams(extra);if(this.demoName)query.set('name',this.demoName);return `/api/minimal/${route}${query.size?'?'+query.toString():''}`;}
 private async request(route:string,init:RequestInit,extra?:Record<string,string>){
  this.active();const attempt=new AbortController(),signal=attempt.signal,disposeAttempt=()=>attempt.abort();
  this.controller.signal.addEventListener('abort',disposeAttempt,{once:true});
  let onAbort:()=>void=()=>{};
  const canceled=new Promise<never>((_,reject)=>{onAbort=()=>reject(this.disposed?new FarmConnectionError('account-disposed','测试账号已切换或页面已关闭，请重新连接'):new FarmConnectionError('request-timeout','连接等待超时，请重试同一条指令'));signal.addEventListener('abort',onAbort,{once:true});});
  const timeout=setTimeout(()=>attempt.abort(),12_000);
  try{
   // Bound headers AND body parsing. Racing the signal also protects against a
   // transport that resolves after abort; its late response has no state effects.
   const read=async()=>{const response=await this.fetcher(this.url(route,extra),{...init,signal});const value:unknown=await response.json();return {response,value};};
   const result=await Promise.race([read(),canceled]);this.active();return result;
  }finally{clearTimeout(timeout);signal.removeEventListener('abort',onAbort);this.controller.signal.removeEventListener('abort',disposeAttempt);}
 }
 async refresh():Promise<void>{
  const {response,value}=await this.request('farm',requestOptions(this.account.uid));this.active();if(!response.ok)throw responseError(response,value);
  if(!record(value)||!validAccount(value.account)||value.account.uid!==this.account.uid||!validView(value.view,this.account.uid))throw new FarmConnectionError('account-changed','账号信息已变化，请重新连接');
  // Polling and post-command refreshes can arrive out of order. Never replace a
  // confirmed canonical revision with an older snapshot (including pre-create null).
  if(this.farm&&(!value.view.farm||value.view.farm.revision<this.farm.revision))return;
  const olderClock=value.view.serverTime<this.view.serverTime;
  if(olderClock&&(!value.view.farm||this.farm&&value.view.farm.revision<=this.farm.revision))return;
  if(this.farm&&value.view.farm&&this.farm.farmId!==value.view.farm.farmId)throw new FarmConnectionError('invalid-response','牧场身份暂时无法确认，请重新连接');
  const projectedNow=this.now();
  // Revisions order D1 state. Workers can have slightly different clocks; accept
  // the newer revision while keeping the already observed calendar/time floor.
  this.view=olderClock?{...value.view,serverTime:this.view.serverTime,dayKey:this.view.dayKey,resetAt:this.view.resetAt,usedToday:this.view.usedToday||value.view.dayKey===this.view.dayKey&&value.view.usedToday}:value.view;
  this.receivedAt=performance.now()-Math.max(0,projectedNow-this.view.serverTime);this.notify();
 }
 async offers():Promise<ExchangePage>{const {response,value}=await this.request('offers',requestOptions(this.account.uid));this.active();if(!response.ok)throw responseError(response,value);if(!record(value)||!Array.isArray(value.offers)||typeof value.serverTime!=='number')throw new FarmConnectionError('invalid-response','许愿列表暂时无法读取');return value as ExchangePage;}
 async visit(name:string):Promise<NamedDemoVisit>{
  const target=parseDemoName(new URLSearchParams({name}));if(!this.demoName||target.kind!=='demo')throw new FarmConnectionError('invalid-visit','请填写有效的测试名称');
  const {response,value}=await this.request('visit',requestOptions(this.account.uid),{target:target.name});this.active();if(!response.ok)throw responseError(response,value);
  if(!record(value)||value.readOnly!==true||!record(value.target)||value.target.name!==target.name||typeof value.target.handle!=='string'||!(value.farm===null||record(value.farm)&&validateMinimalSave(value.farm.state)))throw new FarmConnectionError('invalid-response','只读牧场暂时无法确认');
  return value as NamedDemoVisit;
 }
 bootstrap(input:Omit<Extract<MinimalBootstrapRequest,{mode:'new'}>,'requestId'>|Omit<Extract<MinimalBootstrapRequest,{mode:'import'}>,'requestId'>){return this.begin('bootstrap',{...input});}
 command(command:MinimalCommandRequest['command']){return this.action('command',command);}
 wishing(command:WishingCommand|AssetWishingCommand){return this.action('wishing',command);}
 async boardings():Promise<BoardingPage>{if(this.demoName)throw new FarmConnectionError('production-account-required','好友寄养需要正式账号；测试名称不代表真实好友');const {response,value}=await this.request('boarding',requestOptions(this.account.uid));this.active();if(!response.ok)throw responseError(response,value);if(!validBoardingPage(value,this.account.uid))throw new FarmConnectionError('invalid-response','寄养列表暂时无法确认，请刷新后重试');return value;}
 boarding(command:BoardingCommand){if(this.demoName)return Promise.reject(new FarmConnectionError('production-account-required','好友寄养需要正式账号；测试名称不代表真实好友'));return this.action('boarding-command',command);}
 creative(command:CreativeCommand){return this.action('creative',command);}
 private action(route:Exclude<Route,'bootstrap'>,command:unknown){if(!this.farm)return Promise.reject(new FarmConnectionError('not-initialized','先创建或导入牧场'));return this.begin(route,{expectedRevision:this.farm.revision,command});}
 private async begin(route:Route,payload:Record<string,unknown>):Promise<MinimalResult>{
  this.active();
  if(this.pending||this.running)throw new FarmConnectionError('request-pending','上一条指令处理中，请等待或重试');
  this.readPending();if(this.pending){this.notify();throw new FarmConnectionError('request-pending','另一页的指令尚待确认，请重试同一条指令');}
  const pending:PendingAccountRequest={version:1,uid:this.account.uid,route,payload:{requestId:crypto.randomUUID(),...payload}};
  try{const key=pendingAccountKey(this.account.uid,pending.payload.requestId as string),serialized=JSON.stringify(pending);this.storage.setItem(key,serialized);if(this.storage.getItem(key)!==serialized)throw new Error('Outbox write not retained');this.pendingStorageKey=key;}
  catch{throw new FarmConnectionError('outbox-unavailable','浏览器暂时无法保存指令，请稍后重试');}
  this.pending=pending;this.notify();return this.retry();
 }
 private applyResult(result:MinimalResult):void{
  const incoming=result.farm,current=this.farm;
  if(current&&incoming&&current.farmId!==incoming.farmId)throw new FarmConnectionError('invalid-response','牧场身份暂时无法确认，请重新连接');
  if(current&&(!incoming||incoming.revision<current.revision))return;
  // A replay is still a terminal outcome for its outbox, but an older receipt at
  // this revision must not republish the simulation snapshot after a newer GET.
  if(current&&incoming&&incoming.revision===current.revision&&result.serverTime<this.view.serverTime)return;
  if(!incoming)return;
  const projectedNow=this.now(),serverTime=Math.max(this.view.serverTime,result.serverTime),day=dayKey(serverTime),sameDay=day===this.view.dayKey;
  const ownOffer=incoming.activeOfferId===null?null:result.offer?.offerId===incoming.activeOfferId&&result.offer.ownerAccountId===this.account.uid?result.offer:this.view.ownOffer?.offerId===incoming.activeOfferId?this.view.ownOffer:null;
  this.view={...this.view,farm:incoming,serverTime,dayKey:day,resetAt:Math.floor((serverTime+8*3_600_000)/86_400_000)*86_400_000+86_400_000-8*3_600_000,ownOffer,usedToday:(sameDay&&this.view.usedToday)||!!result.tradeId&&dayKey(result.serverTime)===day};
  this.receivedAt=performance.now()-Math.max(0,projectedNow-serverTime);this.notify();
 }
 async retry():Promise<MinimalResult>{
  this.active();
  if(!this.pending)throw new FarmConnectionError('no-pending-request','没有需要重试的指令');if(this.running)throw new FarmConnectionError('request-pending','上一条指令处理中，请等待');
  const pending=this.pending,pendingKey=this.pendingStorageKey;this.running=true;this.notify();
  try{
   const {response,value}=await this.request(pending.route,{...requestOptions(this.account.uid),method:'POST',headers:{'Content-Type':'application/json','X-Farm-Account':this.account.uid},body:JSON.stringify(pending.payload)});
   this.active();if(!response.ok)throw responseError(response,value);
   if(!record(value)||typeof value.accepted!=='boolean'||typeof value.code!=='string'||value.accepted!==(value.code==='ok')||typeof value.message!=='string'||typeof value.serverTime!=='number'||!Number.isFinite(value.serverTime)||!(value.farm===null||validFarm(value.farm,this.account.uid))||value.accepted&&value.farm===null)throw new FarmConnectionError('invalid-response','返回内容未确认，请重试同一条指令');
   const result=value as MinimalResult;
   // The response is the immutable, authenticated outcome of THIS request.
   // Apply it before releasing the outbox, but never roll back a newer GET/receipt.
   this.applyResult(result);this.active();
   if(pendingKey&&this.storage.getItem(pendingKey)===JSON.stringify(pending))this.storage.removeItem(pendingKey);this.readPending();
   // Current authority may be ahead of a replayed receipt. Refresh opportunistically;
   // slow/offline reads must not reclassify a confirmed write as unknown or lock walking.
   void this.refresh().catch(()=>{/* The confirmed outcome stays confirmed. */});
   return result;
  }catch(error){if(error instanceof FarmConnectionError)throw error;throw new FarmConnectionError('network','连接暂时中断，请重试同一条指令');}
  finally{this.running=false;this.notify();}
 }
}
export type FarmAccountConnection={status:'online';client:AccountClient}|{status:'disabled'|'sign-in-required'|'unavailable';message:string};
export async function connectFarmAccount(fetcher:FarmFetch=fetch,storage?:AccountStorage,demoName?:string,prepareVerifiedDemo?:()=>Promise<void>,prepareVerifiedSignedIn?:()=>Promise<void>):Promise<FarmAccountConnection>{
 try{
  if(demoName!==undefined){const selected=parseDemoName(new URLSearchParams({name:demoName}));if(selected.kind!=='demo'||selected.name!==demoName)return {status:'unavailable',message:'测试名称无效'};}
  const response=await fetcher('/api/minimal/farm'+(demoName?'?name='+encodeURIComponent(demoName):''),requestOptions());
  if(response.status===404)return {status:demoName?'unavailable':'disabled',message:demoName?'测试账号服务尚未开放，未读取本机原存档':'此版本使用本机存档'};
  const value:unknown=await response.json();
  if(!response.ok){const code=record(value)?value.code:undefined;return {status:response.status===401?'sign-in-required':code==='service-disabled'&&!demoName?'disabled':'unavailable',message:record(value)&&typeof value.message==='string'?value.message:'账号同步暂时不可用'};}
  if(demoName){const capability=record(value)&&record(value.capabilities)?value.capabilities.demo:undefined;if(!record(capability)||capability.kind!=='named-demo'||capability.name!==demoName||!record(value)||!validAccount(value.account))return {status:'unavailable',message:'测试账号身份暂时无法确认'};await prepareVerifiedDemo?.();}
  if(!demoName&&record(value)&&record(value.capabilities)){
   const capability=value.capabilities.animalResources;
   // A server capability, not a query/client preference, opts formal accounts in.
   // Reject mixed/unknown scopes before touching global model preparation.
   if(value.capabilities.demo!==undefined||capability!==undefined&&(!record(capability)||capability.scope!=='signed-in-farm'||Object.keys(capability).some(k=>k!=='scope')))return {status:'unavailable',message:'账号资源范围暂时无法确认'};
   if(capability!==undefined){if(!validAccount(value.account))return {status:'unavailable',message:'账号信息暂时无法确认'};if(!prepareVerifiedSignedIn)return {status:'unavailable',message:'动物资源校验尚未连接，原进度没有改动'};await prepareVerifiedSignedIn();}
  }
  if(!record(value)||!validAccount(value.account)||!validView(value.view,value.account.uid))return {status:'unavailable',message:'账号信息暂时无法确认'};
  let client:AccountClient;
  try{client=new AccountClient(value.account,value.view,fetcher,storage??globalThis.localStorage,demoName);}catch(error){if(error instanceof FarmConnectionError)throw error;throw new FarmConnectionError('storage-unavailable','浏览器存储暂时不可用，无法安全保存指令；原存档没有改动，请恢复存储权限后重试');}client.importLegacyAllowed=!demoName&&record(value.capabilities)&&value.capabilities.importLegacy===true;return {status:'online',client};
 }catch(error){return {status:'unavailable',message:error instanceof FarmConnectionError?error.message:'连接暂时中断，本机存档没有改动'};}
}
