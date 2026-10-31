import {isTerrainAppearance} from './terrain-appearance.ts';
import {withoutStaticObstacles} from './creative-obstacles.ts';
import {projectCanonicalState} from './canonical-timeline.ts';
import {CREATIVE_CATALOG,creativeTemplate} from './creative-assets.ts';
import {applyBoarding,settleBoardingForFarm,type BoardingHelpers} from './boarding-authority.ts';
import {publicBoarding,type BoardingPage} from './boarding-contract.ts';
import {migrateCreativeAnimals,putCanonicalFarm,ownedCreativeAnimal,projectCanonicalObstacles} from './creative-lifecycle.ts';
import {assertApprovedFarmResourceContext,type ApprovedFarmResourceContext} from './animal-resource-context.ts';
import {KNOWN_SPECIES,isAnimalRuntimeActive} from './species.ts';
import {applyCreative,settleCreativeJobs,validCreativeRequest} from './creative-authority.ts';
import {isAnimalRarity} from './animal-rarity.ts';
import {applyAssetWishing,isAssetWishingRequest,lockedAnimalId,offerRef,ownedAsset,publicExchangeAsset} from './exchange-authority.ts';
import type {ExchangePage} from './exchange-contract.ts';
import {isEggTheme} from './egg-catalog.ts';
import {migrateLegacyFarm} from './save-migration.ts';
import {createMinimalState,dayKey,isWalkableTile,minimalCommand,tileAt,MINIMAL_RULES,validateMinimalSave,validateLegacyMinimalSave,MINIMAL_TERRAINS,WATER_BOWL,REST_MAT,type MinimalAnimal,type MinimalCommand,type MinimalState,type Point} from './model.ts';
import {isSafeAnimalArrival} from './interaction-motion.ts';
import {minimalDailyKey,minimalReceiptKey,type CanonicalFarm,type MinimalAuthorityOptions,type MinimalBootstrapRequest,type MinimalCommandRequest,type MinimalErrorCode,type MinimalRepository,type MinimalResult,type MinimalTransaction,type MinimalView,type PublicWishingOffer,type WishingOffer,type WishingPage,type WishingRequest} from './cloud-contract.ts';

const DAY=86_400_000,OFFSET=8*3_600_000;
const REQUEST_ID=/^[a-zA-Z0-9_-]{1,100}$/;
const ASSET_ID=/^[a-zA-Z0-9_:.-]{1,256}$/;
const LOCAL_ID=/^[a-zA-Z0-9_-]{1,80}$/;
const clone=<T>(v:T):T=>structuredClone(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const point=(v:unknown):v is Point=>record(v)&&fields(v,['x','z'])&&Number.isInteger(v.x)&&Number.isInteger(v.z)&&(v.x as number)>=-3&&(v.x as number)<=6&&(v.z as number)>=-3&&(v.z as number)<=6;
const movementPoint=(v:unknown):v is Point=>record(v)&&fields(v,['x','z'])&&typeof v.x==='number'&&typeof v.z==='number'&&Number.isFinite(v.x)&&Number.isFinite(v.z)&&v.x>-3.5&&v.x<6.5&&v.z>-3.5&&v.z<6.5;
const id=(v:unknown):v is string=>typeof v==='string'&&ASSET_ID.test(v);
export const minimalResetAt=(now:number)=>Math.floor((now+OFFSET)/DAY)*DAY+DAY-OFFSET;

/** Bounded, recursively canonical JSON. Object property order never changes receipt identity. */
export function normalizeMinimalJson(input:unknown):string {
 let nodes=0;
 const visit=(value:unknown,depth:number):unknown=>{
  if(++nodes>20000||depth>12)throw new Error('Request is too complex');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Non-finite number');return Object.is(value,-0)?0:value;}
  if(typeof value==='string'){if(value.length>131072)throw new Error('String is too long');return value;}
  if(Array.isArray(value)){if(Object.keys(value).length!==value.length)throw new Error('Non-JSON array');return Array.from({length:value.length},(_,i)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(i));if(!descriptor||!('value' in descriptor))throw new Error('Non-JSON array');return visit(descriptor.value,depth+1);});}
  if(record(value)){if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Non-JSON object');const out:Record<string,unknown>={};for(const k of Object.keys(value).sort()){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Unsafe property');const descriptor=Object.getOwnPropertyDescriptor(value,k)!;if(!('value' in descriptor))throw new Error('Non-JSON property');out[k]=visit(descriptor.value,depth+1);}return out;}
  throw new Error('Not JSON');
 };
 const text=JSON.stringify(visit(input,0));if(text.length>131072)throw new Error('Request is too large');return text;
}
function validCommand(value:unknown):value is MinimalCommand|{type:'stopMove'} {
 if(!record(value)||typeof value.type!=='string')return false;
 const c=value;
 if(['welcome','buyEgg','emergencyEgg','hatch','collectEgg','pickup','putdown','suspendUnavailableCarry','resumeSuspendedAnimal','sellAnimal','breed','move','expand','convert','upgradeTerrain','paintTerrain','care','guardian','wolf','help','stopMove'].indexOf(c.type as string)<0)return false;
 switch(c.type){
  case 'placeEgg':return false;
  case 'buyEgg':return fields(c,['type','theme'])&&(c.theme===undefined||isEggTheme(c.theme));
  case 'hatch':case 'collectEgg':return fields(c,['type','eggId'])&&id(c.eggId);
  case 'pickup':case 'care':return fields(c,['type','animalId'])&&id(c.animalId);
  case 'resumeSuspendedAnimal':return fields(c,['type','animalId','at'])&&id(c.animalId)&&(c.at===undefined||point(c.at));
  case 'putdown':return fields(c,['type','at'])&&(c.at===undefined||point(c.at));
  case 'breed':return fields(c,['type','animalIds'])&&Array.isArray(c.animalIds)&&c.animalIds.length===2&&c.animalIds.every(id)&&c.animalIds[0]!==c.animalIds[1];
  case 'move':return fields(c,['type','to'])&&movementPoint(c.to);
  case 'paintTerrain':return fields(c,['type','at','appearance'])&&point(c.at)&&isTerrainAppearance(c.appearance);
  case 'upgradeTerrain':return fields(c,['type','at','toLevel'])&&point(c.at)&&(c.toLevel===2||c.toLevel===3);
  case 'expand':return fields(c,['type','at'])&&point(c.at);
  case 'convert':return fields(c,['type','at','terrain'])&&point(c.at)&&MINIMAL_TERRAINS.some(t=>t===c.terrain);
  case 'guardian':return fields(c,['type','guardian'])&&['dog','cat','frog'].includes(c.guardian as string);
  default:return fields(c,['type']);
 }
}
function parseCommand(value:unknown):value is MinimalCommandRequest['command'] {
 if(record(value)&&value.type==='demoCoins')return fields(value,['type','amount'])&&(value.amount===10000||value.amount===50000);
 if(record(value)&&value.type==='placeEgg')return fields(value,['type','eggId','at'])&&id(value.eggId)&&point(value.at);
 return validCommand(value);
}
function validWish(value:unknown):value is WishingRequest {
 if(!record(value)||!fields(value,['requestId','expectedRevision','command'])||!integer(value.expectedRevision)||!record(value.command))return false;const c=value.command;
 if(c.type==='deposit')return fields(c,['type','animalId','consent'])&&id(c.animalId)&&c.consent==='any-different-species';
 if(c.type==='withdraw')return fields(c,['type','offerId','offerRevision'])&&id(c.offerId)&&integer(c.offerRevision);
 return c.type==='accept'&&fields(c,['type','offerId','offerRevision','ownAnimalId'])&&id(c.offerId)&&integer(c.offerRevision)&&id(c.ownAnimalId);
}
const STATE_FIELDS=['biomeCompatibilityReason','biomeLayoutVersion','exploredBiomes','biomeCompatibilityGrants','lastCompanionGiftDay','terrainGrowthAt','version','coins','welcomeClaimed','tiles','animals','eggs','carriedAnimalId','guardian','player','playerPath','playerSpeed','gifts','collection','createdAt','updatedAt','nextWolfAt','expansions','wolfEvent','notice','sequence','placedEggCount','hatchedCount','breedingDay','lastHatch','lastBreeding'];
const ANIMAL_FIELDS=['resourceSuspended','rarity','growthBonusMs','id','name','species','sex','size','growth','growthAgeMs','position','target','path','targetActivity','drinkAnchor','activity','energy','bond','bornAt','activityUntil','lastBreedAttemptDay'];
const EGG_FIELDS=['rarity','incubation','theme','id','source','species','sex','size','growth','location','position','boughtAt','placedAt','readyAt','parents'];
function strictNestedImport(s:MinimalState,now:number):boolean {
 const only=(value:unknown,keys:string[])=>record(value)&&fields(value,keys);
 const coordinate=(value:unknown)=>only(value,['x','z']);
 const growth=(value:unknown)=>value===undefined||only(value,['version','scales']);
 const timestamp=(value:unknown,future=0)=>integer(value)&&value<=now+future;
 if(![s.createdAt,s.updatedAt].every(v=>timestamp(v))||!timestamp(s.nextWolfAt,DAY))return false;
 if(!coordinate(s.player)||!s.playerPath.every(coordinate)||!s.tiles.every(t=>only(t,['x','z','terrain','naturalTerrain','owned','level','appearance'])))return false;
 if(s.animals.some(a=>!coordinate(a.position)||a.target!==undefined&&!coordinate(a.target)||a.path!==undefined&&!a.path.every(coordinate)||!growth(a.growth)||!timestamp(a.activityUntil,DAY)||a.drinkAnchor!==undefined&&(!only(a.drinkAnchor,['site','stance','waterSite'])||!coordinate(a.drinkAnchor.site)||!coordinate(a.drinkAnchor.stance)||a.drinkAnchor.waterSite!==undefined&&!coordinate(a.drinkAnchor.waterSite))))return false;
 if(s.eggs.some(e=>!growth(e.growth)||e.position!==undefined&&!coordinate(e.position)||e.location==='bag'&&(e.position!==undefined||e.placedAt!==undefined||e.readyAt!==undefined)))return false;
 if(s.lastHatch&&(!only(s.lastHatch,['animalId','at','position'])||!timestamp(s.lastHatch.at)||!coordinate(s.lastHatch.position)))return false;
 if(s.lastBreeding&&(!only(s.lastBreeding,['animalIds','at','success'])||!timestamp(s.lastBreeding.at)))return false;
 if(s.wolfEvent&&(!only(s.wolfEvent,['startedAt','endsAt','helped'])||!timestamp(s.wolfEvent.startedAt)||!timestamp(s.wolfEvent.endsAt,DAY)||s.wolfEvent.endsAt<s.wolfEvent.startedAt))return false;
 return true;
}
/** Validation protects integrity, not historical provenance. All accepted imports remain unverified. */
function validImport(value:unknown,now:number,resources?:ApprovedFarmResourceContext):value is MinimalState {
 try{
  if(!record(value)||!fields(value,STATE_FIELDS)||!validateMinimalSave(value,resources))return false;const s=value;if(!strictNestedImport(s,now))return false;
  if(![s.coins,s.sequence,s.expansions,s.placedEggCount,s.hatchedCount].every(n=>integer(n)&&n<=1_000_000_000)||s.createdAt<0||s.updatedAt<s.createdAt||s.updatedAt>now||s.notice.length>1000)return false;
  const assets=[...s.animals,...s.eggs];if(new Set(assets.map(a=>a.id)).size!==assets.length||assets.some(a=>!LOCAL_ID.test(a.id)))return false;
  if(assets.some(a=>{const m=/^(animal|egg)-(\d+)$/.exec(a.id);return m&&Number(m[2])>s.sequence;}))return false;
  if(s.animals.some(a=>!fields(a,ANIMAL_FIELDS)||a.name.length>80||a.bornAt<0||a.bornAt>now||!Number.isSafeInteger(a.bornAt)||!Number.isSafeInteger(a.activityUntil)||a.activityUntil>now+DAY||a.path&&a.path.length>100))return false;
  if(s.eggs.some(e=>!fields(e,EGG_FIELDS)||!integer(e.boughtAt)||e.boughtAt>now||e.parents?.some(p=>!LOCAL_ID.test(p))||e.placedAt!==undefined&&(!integer(e.placedAt)||e.placedAt>now)||e.readyAt!==undefined&&(!integer(e.readyAt)||e.readyAt>now+DAY)))return false;
  if(s.playerPath.length>100||s.collection.length>KNOWN_SPECIES.length||new Set(s.collection).size!==s.collection.length)return false;
  if(s.lastHatch&&!LOCAL_ID.test(s.lastHatch.animalId)||s.lastBreeding&&s.lastBreeding.animalIds.some(a=>!LOCAL_ID.test(a)))return false;
  return true;
 }catch{return false;}
}
function remapReferences(state:MinimalState,map:(id:string)=>string):void {
 for(const a of state.animals)a.id=map(a.id);
 for(const e of state.eggs){e.id=map(e.id);if(e.parents)e.parents=e.parents.map(map) as [string,string];}
 if(state.carriedAnimalId)state.carriedAnimalId=map(state.carriedAnimalId);
 if(state.lastHatch)state.lastHatch.animalId=map(state.lastHatch.animalId);
 if(state.lastBreeding)state.lastBreeding.animalIds=state.lastBreeding.animalIds.map(map) as [string,string];
}
function resetNavigation(a:MinimalAnimal,now:number):MinimalAnimal {
 const next=clone(a);delete next.path;delete next.target;delete next.targetActivity;delete next.drinkAnchor;next.activity='idle';next.activityUntil=now+8000;return next;
}
/** Authority and client presentation share a bounded, snapshot-anchored timeline. */
export function advanceCanonicalFarm(farm:CanonicalFarm,now:number,lockedAnimalId:string|null,resources?:ApprovedFarmResourceContext):MinimalState {
 return projectCanonicalState(projectCanonicalObstacles(farm),now,[lockedAnimalId,farm.boardingAnimalId].filter((id):id is string=>!!id),resources);
}

function arrival(state:MinimalState,outgoing:MinimalAnimal,incoming:MinimalAnimal,now:number,resources?:ApprovedFarmResourceContext):Point|null {
 const space={...state,animals:state.animals.filter(a=>a.id!==outgoing.id)},same=(a:Point,b:Point)=>Math.round(a.x)===b.x&&Math.round(a.z)===b.z;
 const checks={free:(p:Point)=>isWalkableTile(space,p)&&![WATER_BOWL,REST_MAT].some(x=>same(x,p))&&!space.eggs.some(e=>e.location==='ground'&&e.position&&same(e.position,p)),ground:(p:Point)=>isWalkableTile(space,p)&&tileAt(space,p)?.terrain!=='creek'};
 const candidates=[...state.tiles].sort((a,b)=>Math.hypot(a.x-outgoing.position.x,a.z-outgoing.position.z)-Math.hypot(b.x-outgoing.position.x,b.z-outgoing.position.z)||a.z-b.z||a.x-b.x);
 const chosen=candidates.find(p=>isSafeAnimalArrival(space,incoming,now,p,checks,resources));return chosen?{x:chosen.x,z:chosen.z}:null;
}
const messages:Record<MinimalErrorCode,string>={
 'boarding-unavailable':'这份寄养邀请已变化、到期或不属于你','boarding-busy':'当前已有寄养或许愿，请先处理完成','boarding-partner':'需要同种、异性的成年伙伴','friend-unavailable':'好友码不可用，请让好友先进入正式账号牧场',
 'foreign-asset':'这件物品不属于你的牧场','asset-unavailable':'先收回背包或放下动物，再来许愿','asset-locked':'这件物品正在许愿，请先撤回','kind-not-accepted':'这份许愿不接受这类物品','capacity-full':'任一方背包或牧场已满，物品都没有变化','model-not-ready':'模型还没有准备好','job-unavailable':'这份创作暂不可领取',
 'invalid-request':'请求格式无效','request-id-reused':'此请求编号已用于不同内容，请勿重试为另一操作','not-initialized':'先选择创建牧场或导入旧存档','already-initialized':'云端牧场已初始化，不能再次覆盖','invalid-import':'旧存档验证未通过，原存档没有改动','duplicate-import':'这份旧存档已导入另一个牧场','stale-farm':'牧场状态已变化，请刷新后重新选择','stale-offer':'这份许愿已变化，请刷新后再试','offer-unavailable':'这份许愿已经结束','foreign-animal':'这只动物不属于你的牧场','animal-unavailable':'先把动物放下，再来交换','animal-locked':'这只动物正在许愿，请先撤回','active-offer':'先撤回自己的许愿，再选择另一份','self-trade':'不能与自己的许愿交换','same-species':'请选择不同物种的动物','quota-used':'任一方今天已经成功交换过了','no-safe-landing':'任一方没有安全落脚处，动物和次数都没有变化','model-rejected':'这个动作暂时不能完成','clock-regressed':'服务端时间尚未同步，请稍后再试',
};

export class MinimalAuthority {
 private repository:MinimalRepository;
 private options:MinimalAuthorityOptions;
 constructor(repository:MinimalRepository,options:MinimalAuthorityOptions ){if(options.animalResources!==undefined)assertApprovedFarmResourceContext(options.animalResources);this.repository=repository;this.options=options;}
 private async readFarm(tx:MinimalTransaction,actor:string):Promise<CanonicalFarm|null>{
  const farm=await tx.get('farms',actor);if(!farm)return null;
  if(farm.state.version===3){farm.state=projectCanonicalObstacles(farm);if(migrateCreativeAnimals(farm,this.options.creativeCatalog)){farm.revision++;await putCanonicalFarm(tx,farm);}return farm;}
  if(!validateLegacyMinimalSave(farm.state))throw new Error('Unsupported canonical farm schema; original state preserved');
  farm.legacyStateV2=clone(farm.state);farm.state=migrateLegacyFarm(farm.state);farm.revision++;
  await putCanonicalFarm(tx,farm);return farm;
 }
 private now():number{const now=this.options.clock();if(!integer(now)||now>8.64e15-OFFSET-DAY)throw new Error('Invalid trusted server clock');return now;}
 private actor(actor:string):void{if(!actor||actor.length>512)throw new Error('Missing trusted actor');}
 private freshId(prefix:string):string{const value=this.options.newId();if(!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new Error('Invalid server ID generator');return `${prefix}_${value}`;}
 private result(farm:CanonicalFarm|null,now:number,code:MinimalErrorCode|'ok',extra:Partial<MinimalResult>={}):MinimalResult{return {accepted:code==='ok',code,message:code==='ok'?'操作已完成':messages[code],serverTime:now,farm:clone(farm),...clone(extra)};}
 private async expire(tx:MinimalTransaction,farm:CanonicalFarm,now:number):Promise<WishingOffer|null>{
  if(!farm.activeOfferId)return null;const offer=await tx.get('offers',farm.activeOfferId);
  if(!offer||offer.status!=='open'||offer.ownerAccountId!==farm.accountId)throw new Error('Invalid canonical escrow');
  if(now<offer.expiresAt)return offer;
  const locked=lockedAnimalId(offer);farm.state=advanceCanonicalFarm(farm,offer.expiresAt,locked,this.options.animalResources);if(locked){const index=farm.state.animals.findIndex(a=>a.id===locked);if(index<0)throw new Error('Expired escrow lost animal');farm.state.animals[index]=resetNavigation(farm.state.animals[index],offer.expiresAt);}else if(!ownedAsset(farm,offerRef(offer)))throw new Error('Expired escrow lost asset');
  offer.status='expired';offer.revision++;farm.activeOfferId=null;farm.revision++;await tx.put('offers',offer.offerId,offer);await putCanonicalFarm(tx,farm);return null;
 }
 private async execute(actor:string,kind:'bootstrap'|'command'|'wishing'|'creative'|'boarding',input:unknown,apply:(tx:MinimalTransaction,farm:CanonicalFarm|null,now:number,request:unknown)=>Promise<MinimalResult>):Promise<MinimalResult>{
  this.actor(actor);let normalized:string;try{normalized=normalizeMinimalJson(input);}catch{return this.result(null,this.now(),'invalid-request');}
  if(!record(input)||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId))return this.result(null,this.now(),'invalid-request');
  const requestId=input.requestId,fingerprint=await this.options.fingerprint(`${kind}:${normalized}`);
  return this.repository.transaction(async tx=>{
   const now=this.now(),key=minimalReceiptKey(actor,requestId),prior=await tx.get('receipts',key);
   if(prior)return prior.fingerprint===fingerprint?clone(prior.result):this.result(await this.readFarm(tx,actor),now,'request-id-reused');
   const farm=await this.readFarm(tx,actor);if(farm){await settleBoardingForFarm(tx,farm,now,this.boardingHelpers());await this.expire(tx,farm,now);if(settleCreativeJobs(farm,now,this.options.creativeCatalog))await putCanonicalFarm(tx,farm);}
   const result=await apply(tx,farm,now,JSON.parse(normalized));await tx.put('receipts',key,{accountId:actor,requestId,fingerprint,result});return clone(result);
  });
 }
 async get(actor:string):Promise<MinimalView>{this.actor(actor);return this.repository.transaction(async tx=>{const now=this.now(),farm=await this.readFarm(tx,actor),ownOffer=farm?await this.expire(tx,farm,now):null;if(farm)await settleBoardingForFarm(tx,farm,now,this.boardingHelpers());if(farm&&settleCreativeJobs(farm,now,this.options.creativeCatalog))await putCanonicalFarm(tx,farm);return {serverTime:now,dayKey:dayKey(now),resetAt:minimalResetAt(now),farm,ownOffer,usedToday:!!await tx.get('daily',minimalDailyKey(actor,dayKey(now))),serviceGate:'client-migration-required'};});}
 async receipt(actor:string,requestId:string){this.actor(actor);if(!REQUEST_ID.test(requestId))return null;return this.repository.transaction(tx=>tx.get('receipts',minimalReceiptKey(actor,requestId)));}
 async bootstrap(actor:string,input:unknown):Promise<MinimalResult>{return this.execute(actor,'bootstrap',input,async(tx,farm,now,input)=>{
  if(!record(input)||!fields(input,input.mode==='import'?['requestId','mode','legacySnapshot']:['requestId','mode'])||!['new','import'].includes(input.mode as string))return this.result(farm,now,'invalid-request');
  if(farm)return this.result(farm,now,'already-initialized');const request=input as MinimalBootstrapRequest;
  let state:MinimalState,sourceFingerprint:string|null=null;const sourceAliases:string[]=[];const idMap:Record<string,string>=Object.create(null);
  if(request.mode==='import'){
   const snapshot=request.legacySnapshot,source=record(snapshot)?withoutStaticObstacles(snapshot):snapshot,decoded=validateLegacyMinimalSave(source)?migrateLegacyFarm(source):source;
   if(!validImport(decoded,now,this.options.animalResources))return this.result(null,now,'invalid-import');
   sourceFingerprint=await this.options.fingerprint(normalizeMinimalJson(snapshot));
   sourceAliases.push(...new Set([sourceFingerprint,await this.options.fingerprint(normalizeMinimalJson(decoded))]));
   for(const fingerprint of sourceAliases)if(await tx.get('importSources',fingerprint))return this.result(null,now,'duplicate-import');state=clone(decoded);
  }else state=createMinimalState(now);
  const farmId=this.freshId('farm');remapReferences(state,local=>idMap[local]??(idMap[local]=`${farmId}:${local}`));
  for(const animal of state.animals)if(!state.collection.includes(animal.species))state.collection.push(animal.species);
  const origin=request.mode==='import'?'grandfathered-unverified':'server-created';
  const created:CanonicalFarm={accountId:actor,farmId,revision:1,state,activeOfferId:null,initializedAt:now,origin,assetProvenance:Object.fromEntries([...state.animals,...state.eggs].map(a=>[a.id,origin]))};
  await putCanonicalFarm(tx,created);if(sourceFingerprint){await tx.put('imports',actor,{accountId:actor,requestId:request.requestId,sourceFingerprint,importedAt:now,provenance:'grandfathered-unverified',idMap});for(const fingerprint of sourceAliases)await tx.put('importSources',fingerprint,{accountId:actor,sourceFingerprint:fingerprint});}return this.result(created,now,'ok');
 });}
 async command(actor:string,input:unknown):Promise<MinimalResult>{return this.execute(actor,'command',input,async(tx,farm,now,input)=>{
  if(!record(input)||!fields(input,['requestId','expectedRevision','command'])||!integer(input.expectedRevision)||!parseCommand(input.command))return this.result(farm,now,'invalid-request');
  if(!farm)return this.result(null,now,'not-initialized');if(farm.revision!==input.expectedRevision)return this.result(farm,now,'stale-farm');if(now<farm.state.updatedAt)return this.result(farm,now,'clock-regressed');
  const command=(input as MinimalCommandRequest).command,offer=farm.activeOfferId?await tx.get('offers',farm.activeOfferId):null,locked=lockedAnimalId(offer);
  if(command.type==='demoCoins'){
   if(this.options.demoDebugAccountId!==actor)return this.result(farm,now,'invalid-request',{message:'调试金币仅供演示账号使用'});
   if(!Number.isSafeInteger(farm.state.coins)||farm.state.coins<0||farm.state.coins>1_000_000_000-command.amount)return this.result(farm,now,'model-rejected',{message:'演示金币已达调试上限，未增加金币'});
   const state=advanceCanonicalFarm(farm,now,locked,this.options.animalResources),coins=state.coins+command.amount;
   if(!Number.isSafeInteger(coins)||coins>1_000_000_000)return this.result(farm,now,'model-rejected',{message:'演示金币已达调试上限，未增加金币'});
   state.coins=coins;state.notice=`演示金币 +${command.amount.toLocaleString('zh-CN')} · 仅演示账号`;
   farm.state=state;farm.revision++;await putCanonicalFarm(tx,farm);return this.result(farm,now,'ok',{message:state.notice});
  }
  if(offer?.exchange&&offerRef(offer).kind==='egg'&&(command.type==='placeEgg'||command.type==='hatch'||command.type==='collectEgg')&&command.eggId===offerRef(offer).id)return this.result(farm,now,'asset-locked');
  const affected=command.type==='pickup'||command.type==='care'||command.type==='resumeSuspendedAnimal'?[command.animalId]:command.type==='breed'?command.animalIds:command.type==='sellAnimal'||command.type==='putdown'||command.type==='suspendUnavailableCarry'?[farm.state.carriedAnimalId]:[];
  if(farm.boardingAnimalId&&(affected.includes(farm.boardingAnimalId)||command.type==='convert'))return this.result(farm,now,'animal-locked',{message:'伙伴正在寄养，取消或结算后即可继续'});
  if(farm.boardingReservedEgg&&['buyEgg','emergencyEgg','breed'].includes(command.type)&&farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals-1)return this.result(farm,now,'capacity-full',{message:'寄养已为可能到来的蛋保留一个名额'});
  if(locked&&(affected.includes(locked)||command.type==='convert'))return this.result(farm,now,'animal-locked');
  for(const animalId of affected){const animal=farm.state.animals.find(a=>a.id===animalId),asset=farm.creative?.assets.find(a=>a.id===animalId);if(animal&&(animal.creative||asset)&&!ownedCreativeAnimal(farm,animal,this.options.creativeCatalog))return this.result(farm,now,'model-not-ready');}
  if((command.type==='convert'||command.type==='placeEgg')&&farm.creative?.assets.some(a=>a.location==='ground'&&a.position&&a.position.x===command.at.x&&a.position.z===command.at.z))return this.result(farm,now,'model-rejected',{message:'先收回这块土地上的自定义物件'});
  const state=advanceCanonicalFarm(farm,now,locked,this.options.animalResources);let result;
  if(command.type==='stopMove'){state.playerPath=[];state.playerSpeed=0;result={accepted:true,state,message:'已经停下'};}else result=minimalCommand(state,command,now,[locked,farm.boardingAnimalId].filter((id):id is string=>!!id),undefined,this.options.animalResources);
  if(!result.accepted)return this.result(farm,now,'model-rejected',{message:result.message});
  if(locked){const original=state.animals.find(a=>a.id===locked)!;result.state.animals[result.state.animals.findIndex(a=>a.id===locked)]=clone(original);}
  remapReferences(result.state,asset=>asset.includes(':')||farm.creative?.assets.some(a=>a.id===asset)?asset:`${farm.farmId}:${asset}`);
  if(new Set([...result.state.animals,...result.state.eggs].map(a=>a.id)).size!==result.state.animals.length+result.state.eggs.length)throw new Error('Canonical asset collision');
  const previousProvenance=farm.assetProvenance;
  const mintedOrigin=command.type==='hatch'?(previousProvenance[command.eggId]??'grandfathered-unverified'):command.type==='breed'&&command.animalIds.some(id=>previousProvenance[id]==='grandfathered-unverified')?'grandfathered-unverified':'server-created';
  farm.assetProvenance=Object.fromEntries([...result.state.animals,...result.state.eggs].map(asset=>[asset.id,previousProvenance[asset.id]??mintedOrigin]));
  if(command.type==='sellAnimal'&&farm.state.carriedAnimalId&&farm.creative)farm.creative.assets=farm.creative.assets.filter(a=>a.id!==farm.state.carriedAnimalId);farm.state=result.state;farm.revision++;await putCanonicalFarm(tx,farm);return this.result(farm,now,'ok',{message:result.message});
 });}
 async wishing(actor:string,input:unknown):Promise<MinimalResult>{return this.execute(actor,'wishing',input,async(tx,farm,now,input)=>{
  if(farm?.activeBoardingId)return this.result(farm,now,'animal-locked',{message:'寄养期间先不交换，取消或结算后即可继续'});
  if(isAssetWishingRequest(input)){if(!farm)return this.result(null,now,'not-initialized');return applyAssetWishing(tx,farm,now,input,{advance:(f,n,l)=>advanceCanonicalFarm(f,n,l,this.options.animalResources),result:(f,n,c,e)=>this.result(f,n,c,e),freshId:p=>this.freshId(p),resetAt:minimalResetAt,catalog:this.options.creativeCatalog,resources:this.options.animalResources});}
  if(!validWish(input))return this.result(farm,now,'invalid-request');if(!farm)return this.result(null,now,'not-initialized');if(farm.revision!==input.expectedRevision)return this.result(farm,now,'stale-farm');if(now<farm.state.updatedAt)return this.result(farm,now,'clock-regressed');
  const command=input.command;
  if(command.type==='deposit'){
   if(farm.activeOfferId)return this.result(farm,now,'active-offer');if(await tx.get('daily',minimalDailyKey(actor,dayKey(now))))return this.result(farm,now,'quota-used');
   const animal=farm.state.animals.find(a=>a.id===command.animalId);if(!animal)return this.result(farm,now,'foreign-animal');if(animal.creative||farm.creative?.assets.some(a=>a.id===animal.id))return this.result(farm,now,'animal-unavailable',{message:'自定义小伙伴请使用物品许愿入口'});if(!isAnimalRuntimeActive(animal,this.options.animalResources)||animal.id===farm.state.carriedAnimalId||animal.activity==='carried')return this.result(farm,now,'animal-unavailable');
   const offer:WishingOffer={offerId:this.freshId('offer'),ownerAccountId:actor,animalId:animal.id,revision:1,status:'open',createdAt:now,expiresAt:minimalResetAt(now),tradeId:null};
   farm.state=advanceCanonicalFarm(farm,now,null,this.options.animalResources);const index=farm.state.animals.findIndex(a=>a.id===animal.id);farm.state.animals[index]=resetNavigation(farm.state.animals[index],now);farm.activeOfferId=offer.offerId;farm.revision++;await tx.put('offers',offer.offerId,offer);await putCanonicalFarm(tx,farm);return this.result(farm,now,'ok',{offer,message:'已放入许愿池，等待不同物种的小伙伴'});
  }
  const offer=await tx.get('offers',command.offerId);if(!offer||offer.status!=='open'||now>=offer.expiresAt)return this.result(farm,now,'offer-unavailable');
  if(offer.revision!==command.offerRevision)return this.result(farm,now,'stale-offer');
  if(command.type==='withdraw'){
   if(offer.ownerAccountId!==actor||farm.activeOfferId!==offer.offerId)return this.result(farm,now,'offer-unavailable');const locked=lockedAnimalId(offer);farm.state=advanceCanonicalFarm(farm,now,locked,this.options.animalResources);if(locked){const index=farm.state.animals.findIndex(a=>a.id===locked);farm.state.animals[index]=resetNavigation(farm.state.animals[index],now);}offer.status='withdrawn';offer.revision++;farm.activeOfferId=null;farm.revision++;await tx.put('offers',offer.offerId,offer);await putCanonicalFarm(tx,farm);return this.result(farm,now,'ok',{offer,message:'已撤回，今天的机会还在'});
  }
  if(offer.exchange)return applyAssetWishing(tx,farm,now,{requestId:input.requestId,expectedRevision:input.expectedRevision,command:{type:'acceptAsset',offerId:command.offerId,offerRevision:command.offerRevision,asset:{kind:'animal',id:command.ownAnimalId}}},{advance:(f,n,l)=>advanceCanonicalFarm(f,n,l,this.options.animalResources),result:(f,n,c,e)=>this.result(f,n,c,e),freshId:p=>this.freshId(p),resetAt:minimalResetAt,catalog:this.options.creativeCatalog,resources:this.options.animalResources});
  if(offer.ownerAccountId===actor)return this.result(farm,now,'self-trade');if(farm.activeOfferId)return this.result(farm,now,'active-offer');
  const owner=await this.readFarm(tx,offer.ownerAccountId);if(!owner||owner.activeOfferId!==offer.offerId)return this.result(farm,now,'offer-unavailable');if(now<owner.state.updatedAt)return this.result(farm,now,'clock-regressed');
  let outgoing=farm.state.animals.find(a=>a.id===command.ownAnimalId),offered=owner.state.animals.find(a=>a.id===offer.animalId);if(!outgoing)return this.result(farm,now,'foreign-animal');if(!offered)throw new Error('Escrow lost canonical animal');if(outgoing.creative||offered.creative||farm.creative?.assets.some(a=>a.id===outgoing!.id)||owner.creative?.assets.some(a=>a.id===offered!.id))return this.result(farm,now,'animal-unavailable',{message:'自定义小伙伴请使用物品许愿入口'});
  if(!isAnimalRuntimeActive(outgoing,this.options.animalResources)||!isAnimalRuntimeActive(offered,this.options.animalResources)||outgoing.id===farm.state.carriedAnimalId||outgoing.activity==='carried'||offered.id===owner.state.carriedAnimalId||offered.activity==='carried')return this.result(farm,now,'animal-unavailable');if(outgoing.species===offered.species)return this.result(farm,now,'same-species');
  const day=dayKey(now);if(await tx.get('daily',minimalDailyKey(actor,day))||await tx.get('daily',minimalDailyKey(owner.accountId,day)))return this.result(farm,now,'quota-used');
  const ownerState=advanceCanonicalFarm(owner,now,offered.id,this.options.animalResources),takerState=advanceCanonicalFarm(farm,now,null,this.options.animalResources);offered=ownerState.animals.find(a=>a.id===offered!.id)!;outgoing=takerState.animals.find(a=>a.id===outgoing!.id)!;
  const ownerLanding=arrival(ownerState,offered,outgoing,now,this.options.animalResources),takerLanding=arrival(takerState,outgoing,offered,now,this.options.animalResources);if(!ownerLanding||!takerLanding)return this.result(farm,now,'no-safe-landing');
  if(owner.state.animals.some(a=>a.id===outgoing.id)||owner.state.eggs.some(e=>e.id===outgoing.id)||farm.state.animals.some(a=>a.id===offered.id)||farm.state.eggs.some(e=>e.id===offered.id))throw new Error('Global animal identity collision');
  const ownerOrigin=owner.assetProvenance[offered.id],takerOrigin=farm.assetProvenance[outgoing.id];if(!ownerOrigin||!takerOrigin)throw new Error('Missing canonical asset provenance');
  const incomingOwner={...resetNavigation(outgoing,now),position:ownerLanding},incomingTaker={...resetNavigation(offered,now),position:takerLanding};
  delete owner.assetProvenance[offered.id];delete farm.assetProvenance[outgoing.id];owner.assetProvenance[outgoing.id]=takerOrigin;farm.assetProvenance[offered.id]=ownerOrigin;
  owner.state=ownerState;farm.state=takerState;owner.state.animals[owner.state.animals.indexOf(offered)]=incomingOwner;farm.state.animals[farm.state.animals.indexOf(outgoing)]=incomingTaker;
  for(const [f,a] of [[owner,incomingOwner],[farm,incomingTaker]] as const){if(!f.state.collection.includes(a.species))f.state.collection.push(a.species);f.revision++;}
  const tradeId=this.freshId('trade');owner.activeOfferId=null;offer.status='completed';offer.revision++;offer.tradeId=tradeId;
  await putCanonicalFarm(tx,owner);await putCanonicalFarm(tx,farm);await tx.put('offers',offer.offerId,offer);await tx.put('daily',minimalDailyKey(owner.accountId,day),{accountId:owner.accountId,dayKey:day,tradeId});await tx.put('daily',minimalDailyKey(actor,day),{accountId:actor,dayKey:day,tradeId});await tx.put('trades',tradeId,{tradeId,offerId:offer.offerId,ownerAccountId:owner.accountId,takerAccountId:actor,ownerAnimal:offered,takerAnimal:outgoing,completedAt:now,dayKey:day});
  return this.result(farm,now,'ok',{offer,tradeId,message:'交换成功，新伙伴到家啦'});
 });}
 async list(actor:string,after:string|null=null,limit=20):Promise<WishingPage>{this.actor(actor);if(after!==null&&!id(after)||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Invalid listing cursor or limit');return this.repository.transaction(async tx=>{
  const now=this.now(),rows=await tx.listOpenOffers(now,after,limit+1),offers:PublicWishingOffer[]=[];
  for(const offer of rows.slice(0,limit)){if(offer.exchange)continue;const farm=await this.readFarm(tx,offer.ownerAccountId),a=farm?.activeOfferId===offer.offerId?farm.state.animals.find(a=>a.id===offer.animalId):null;if(!a)continue;
   const animal:PublicWishingOffer['animal']={id:a.id,name:a.name,rarity:isAnimalRarity(a.rarity)?a.rarity:'white',species:a.species,sex:a.sex,size:a.size,bornAt:a.bornAt,...(a.growth?{growth:{version:a.growth.version,scales:[...a.growth.scales] as [number,number,number]}}:{}),...(a.growthAgeMs!==undefined?{growthAgeMs:a.growthAgeMs}:{}),...(typeof a.growthBonusMs==='number'&&Number.isFinite(a.growthBonusMs)&&a.growthBonusMs>=0&&a.growthBonusMs<=24000?{growthBonusMs:a.growthBonusMs}:{})};offers.push({offerId:offer.offerId,revision:offer.revision,expiresAt:offer.expiresAt,own:offer.ownerAccountId===actor,animal});}
  return {serverTime:now,offers,nextCursor:rows.length>limit?rows[limit-1].offerId:null};
 });}
 private boardingHelpers():BoardingHelpers{return {advance:(f,n,l)=>advanceCanonicalFarm(f,n,l,this.options.animalResources),readFarm:(tx,uid)=>this.readFarm(tx,uid),result:(f,n,c,e)=>this.result(f,n,c,e),freshId:p=>this.freshId(p),resources:this.options.animalResources};}
 async boarding(actor:string,input:unknown):Promise<MinimalResult>{return this.execute(actor,'boarding',input,(tx,farm,now,request)=>applyBoarding(tx,farm,now,request,this.boardingHelpers()));}
 async boardingList(actor:string):Promise<BoardingPage>{this.actor(actor);return this.repository.transaction(async tx=>{const now=this.now(),farm=await this.readFarm(tx,actor),invitations:BoardingPage['invitations']=[];if(!farm)return {serverTime:now,invitations};await settleBoardingForFarm(tx,farm,now,this.boardingHelpers());for(const id of farm.boardingInbox??[]){let row=await tx.get('boardings',id);if(!row||![row.initiatorUid,row.recipientUid].includes(actor))continue;if(row.status==='pending'&&now>=row.expiresAt){const owner=row.initiatorUid===actor?farm:await this.readFarm(tx,row.initiatorUid);if(owner)await settleBoardingForFarm(tx,owner,now,this.boardingHelpers());row=await tx.get('boardings',id);}if(row)invitations.push(publicBoarding(row));}return {serverTime:now,invitations};});}

 async creative(actor:string,input:unknown):Promise<MinimalResult>{return this.execute(actor,'creative',input,async(tx,farm,now,request)=>{if(!validCreativeRequest(request))return this.result(farm,now,'invalid-request');if(!farm)return this.result(null,now,'not-initialized');const c=request.command,asset='assetId' in c?farm.creative?.assets.find(a=>a.id===c.assetId):undefined;const addsWorldAnimal=c.type==='place'&&asset?.kind==='custom-creature'||c.type==='hatch'&&asset?.kind==='custom-egg'&&asset.location==='ground'&&creativeTemplate(this.options.creativeCatalog??CREATIVE_CATALOG,asset.templateId)?.kind==='creature';if(farm.boardingReservedEgg&&addsWorldAnimal&&farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals-1)return this.result(farm,now,'capacity-full');return applyCreative(tx,farm,now,request,{advance:(f,n,l)=>advanceCanonicalFarm(f,n,l,this.options.animalResources),result:(f,n,c,e)=>this.result(f,n,c,e),freshId:p=>this.freshId(p),resetAt:minimalResetAt,catalog:this.options.creativeCatalog,resources:this.options.animalResources});});}
 async listAssets(actor:string,after:string|null=null,limit=20):Promise<ExchangePage>{this.actor(actor);if(after!==null&&!id(after)||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Invalid listing cursor or limit');return this.repository.transaction(async tx=>{const now=this.now(),rows=await tx.listOpenOffers(now,after,limit+1),offers:ExchangePage['offers']=[];for(const offer of rows.slice(0,limit)){const farm=await this.readFarm(tx,offer.ownerAccountId);if(!farm||farm.activeOfferId!==offer.offerId)continue;const asset=ownedAsset(farm,offerRef(offer));if(!asset)continue;offers.push({offerId:offer.offerId,revision:offer.revision,expiresAt:offer.expiresAt,own:offer.ownerAccountId===actor,asset:publicExchangeAsset(asset,this.options.creativeCatalog,this.options.animalResources),accepts:offer.exchange?.accepts??['animal'],differentSpeciesOnly:!offer.exchange});}return {serverTime:now,offers,nextCursor:rows.length>limit?rows[limit-1].offerId:null};});}

}
