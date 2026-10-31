import {ownedCreativeAnimal,putCanonicalFarm} from './creative-lifecycle.ts';
import type {ApprovedFarmResourceContext} from './animal-resource-context.ts';
import {animalPortrait,isAnimalProviderReady,isAnimalCommerceReady} from './species.ts';
import {rarityOf} from './animal-rarity.ts';
import {EGG_THEME_LABELS} from './egg-catalog.ts';
import {isWalkableTile,tileAt,WATER_BOWL,REST_MAT,MINIMAL_RULES,type MinimalState,type MinimalAnimal,type Point} from './model.ts';
import {isSafeAnimalArrival} from './interaction-motion.ts';
import {dayKey} from './farm-calendar.ts';
import {minimalDailyKey,type CanonicalFarm,type MinimalErrorCode,type MinimalResult,type MinimalTransaction,type WishingOffer,type MinimalOrigin} from './cloud-contract.ts';
import {EXCHANGE_KINDS,type ExchangeAsset,type ExchangeAssetRef,type ExchangeKind,type AssetWishingRequest,type PublicExchangeAsset} from './exchange-contract.ts';
import {CREATIVE_CATALOG,creativeTemplate,approvedCreativeTemplate,approvedCreativeAnimal,approvedCreativeAnimalTemplate,creativeModelReady,type CreativeTemplate,EMPTY_CREATIVE} from './creative-assets.ts';
const clone=<T>(value:T):T=>structuredClone(value);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(key=>allowed.includes(key));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_:.-]{1,256}$/.test(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export const isExchangeKind=(v:unknown):v is ExchangeKind=>typeof v==='string'&&EXCHANGE_KINDS.includes(v as ExchangeKind);
export const isAssetRef=(v:unknown):v is ExchangeAssetRef=>record(v)&&fields(v,['kind','id'])&&isExchangeKind(v.kind)&&id(v.id);
export function isAssetWishingRequest(value:unknown):value is AssetWishingRequest{
 if(!record(value)||!fields(value,['requestId','expectedRevision','command'])||!integer(value.expectedRevision)||!record(value.command))return false;
 const c=value.command;
 if(c.type==='depositAsset')return fields(c,['type','asset','accepts','consent'])&&isAssetRef(c.asset)&&c.consent==='listed-kinds'&&Array.isArray(c.accepts)&&c.accepts.length>0&&c.accepts.length<=5&&c.accepts.every(isExchangeKind)&&new Set(c.accepts).size===c.accepts.length;
 return c.type==='acceptAsset'&&fields(c,['type','offerId','offerRevision','asset'])&&id(c.offerId)&&integer(c.offerRevision)&&isAssetRef(c.asset);
}
export function ownedAsset(farm:CanonicalFarm,ref:ExchangeAssetRef):ExchangeAsset|null{
 if(ref.kind==='animal'){const data=farm.state.animals.find(asset=>asset.id===ref.id);const creativeAsset=data?.creative?farm.creative?.assets.find(a=>a.id===data.id):undefined;return data?{kind:'animal',data:clone(data),origin:farm.assetProvenance[ref.id]??'grandfathered-unverified',...(creativeAsset?{creativeAsset:clone(creativeAsset)}:{})}:null;}
 if(ref.kind==='egg'){const data=farm.state.eggs.find(asset=>asset.id===ref.id);return data?{kind:'egg',data:clone(data),origin:farm.assetProvenance[ref.id]??'grandfathered-unverified'}:null;}
 const data=farm.creative?.assets.find(asset=>asset.id===ref.id&&asset.kind===ref.kind&&!(asset.kind==='custom-creature'&&farm.state.animals.some(a=>a.id===asset.id)));return data?{kind:ref.kind,data:clone(data),origin:'mock'}:null;
}
export function assetAvailable(farm:CanonicalFarm,asset:ExchangeAsset,resources?:ApprovedFarmResourceContext,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):boolean{
 if(asset.kind==='animal')return (!asset.data.creative&&!farm.creative?.assets.some(a=>a.id===asset.data.id)||ownedCreativeAnimal(farm,asset.data,catalog))&&isAnimalCommerceReady(asset.data,resources)&&asset.data.id!==farm.state.carriedAnimalId&&asset.data.activity!=='carried';
 if(asset.kind==='egg')return isAnimalProviderReady(asset.data.species,resources)&&asset.data.location==='bag';const template=creativeTemplate(catalog,asset.data.templateId);if(asset.kind==='custom-egg'&&asset.data.egg)return asset.data.location==='bag'&&asset.data.egg.stage==='ready'&&!!asset.data.egg.incubation&&approvedCreativeTemplate(template);return asset.data.location==='bag'&&(asset.kind==='prop'?creativeModelReady(template):approvedCreativeAnimalTemplate(template))&&(asset.kind!=='custom-creature'||!!asset.data.animal&&approvedCreativeAnimal(asset.data.animal,catalog)&&asset.data.animal.id===asset.data.id);
}
export function publicExchangeAsset(asset:ExchangeAsset,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG,resources?:ApprovedFarmResourceContext):PublicExchangeAsset{
 if(asset.kind==='animal'&&asset.data.creative){const template=creativeTemplate(catalog,asset.data.creative.templateId);return {kind:asset.kind,id:asset.data.id,name:asset.data.name,rarity:rarityOf(asset.data.rarity),portraitUrl:template?.portraitUrl??'',detail:'自定义小伙伴',origin:'mock',templateId:asset.data.creative.templateId};}
 if(asset.kind==='animal')return {kind:asset.kind,id:asset.data.id,name:asset.data.name,rarity:rarityOf(asset.data.rarity),portraitUrl:animalPortrait(asset.data.species,resources),detail:`${asset.data.sex==='female'?'♀':'♂'} · ${asset.data.size==='normal'?'普通':asset.data.size==='large'?'大体型':'巨型'}`,origin:asset.origin};
 if(asset.kind==='egg')return {kind:asset.kind,id:asset.data.id,name:'动物蛋',rarity:rarityOf(asset.data.rarity),portraitUrl:'',detail:`${EGG_THEME_LABELS[asset.data.theme??'grassland']} · ${asset.data.incubation?'孵化进度保留':'待孵化'}`,origin:asset.origin};
 const template=creativeTemplate(catalog,asset.data.templateId);return {kind:asset.kind,id:asset.data.id,name:asset.data.name,portraitUrl:template?.portraitUrl??'',detail:asset.kind==='custom-egg'?'自定义蛋':asset.kind==='prop'?'地皮摆件':'自定义小伙伴',origin:'mock',templateId:asset.data.templateId,...(asset.kind!=='prop'?{rarity:'white' as const}:{})};
}
export const offerRef=(offer:WishingOffer):ExchangeAssetRef=>offer.exchange?.asset??{kind:'animal',id:offer.animalId};
export const lockedAnimalId=(offer:WishingOffer|null):string|null=>offer&&offerRef(offer).kind==='animal'?offerRef(offer).id:null;
export function resetExchangeAnimal(animal:MinimalAnimal,now:number):MinimalAnimal{const next=clone(animal);delete next.path;delete next.target;delete next.targetActivity;delete next.drinkAnchor;next.activity='idle';next.activityUntil=now+8000;return next;}
function remove(farm:CanonicalFarm,asset:ExchangeAsset){
 if(asset.kind==='animal'){farm.state.animals=farm.state.animals.filter(item=>item.id!==asset.data.id);if(asset.data.creative&&farm.creative)farm.creative.assets=farm.creative.assets.filter(item=>item.id!==asset.data.id);}
 else if(asset.kind==='egg')farm.state.eggs=farm.state.eggs.filter(item=>item.id!==asset.data.id);
 else if(farm.creative)farm.creative.assets=farm.creative.assets.filter(item=>item.id!==asset.data.id);
 if(asset.kind==='animal'||asset.kind==='egg')delete farm.assetProvenance[asset.data.id];
}
const same=(a:Point,b:Point)=>Math.round(a.x)===b.x&&Math.round(a.z)===b.z;
function receive(farm:CanonicalFarm,asset:ExchangeAsset,now:number,resources?:ApprovedFarmResourceContext):MinimalErrorCode|null{
 const s=farm.state;
 if([...s.animals,...s.eggs,...(farm.creative?.assets??[])].some(a=>a.id===asset.data.id))throw new Error('Global asset identity collision');
 if(asset.kind==='animal'||asset.kind==='egg'){
  if(s.animals.length+s.eggs.length>=MINIMAL_RULES.maxAnimals)return 'capacity-full';
  if(asset.kind==='animal'){
   const checks={free:(p:Point)=>isWalkableTile(s,p)&&![WATER_BOWL,REST_MAT].some(x=>same(x,p))&&!farm.creative?.assets.some(x=>x.location==='ground'&&x.position&&same(x.position,p)),ground:(p:Point)=>isWalkableTile(s,p)&&tileAt(s,p)?.terrain!=='creek'};
   const landing=s.tiles.find(p=>isSafeAnimalArrival(s,asset.data,now,p,checks,resources));if(!landing)return 'no-safe-landing';
   s.animals.push({...resetExchangeAnimal(asset.data,now),position:{x:landing.x,z:landing.z}});if(!asset.data.creative&&!s.collection.includes(asset.data.species))s.collection.push(asset.data.species);if(asset.data.creative){if(!asset.creativeAsset)return 'asset-unavailable';farm.creative??=EMPTY_CREATIVE();if(farm.creative.assets.length>=32)return 'capacity-full';farm.creative.assets.push({...clone(asset.creativeAsset),location:'ground',position:{x:landing.x,z:landing.z}});}
  }else{s.eggs.push({...clone(asset.data),location:'bag'});}
  farm.assetProvenance[asset.data.id]=asset.origin as MinimalOrigin;
 }else{
  farm.creative??=EMPTY_CREATIVE();if(farm.creative.assets.length>=32)return 'capacity-full';
  const incoming=clone(asset.data);incoming.location='bag';delete incoming.position;farm.creative.assets.push(incoming);
 }
 return null;
}
export type ExchangeRuntime={resources?:ApprovedFarmResourceContext;advance:(farm:CanonicalFarm,now:number,locked:string|null)=>MinimalState;result:(farm:CanonicalFarm|null,now:number,code:MinimalErrorCode|'ok',extra?:Partial<MinimalResult>)=>MinimalResult;freshId:(prefix:string)=>string;resetAt:(now:number)=>number;catalog?:readonly CreativeTemplate[]};
/** Called INSIDE the same receipt transaction as all normal farm mutations. */
export async function applyAssetWishing(tx:MinimalTransaction,farm:CanonicalFarm,now:number,request:AssetWishingRequest,runtime:ExchangeRuntime):Promise<MinimalResult>{
 const actor=farm.accountId,c=request.command,result=(code:MinimalErrorCode|'ok',extra?:Partial<MinimalResult>)=>runtime.result(farm,now,code,extra);
 if(farm.revision!==request.expectedRevision)return result('stale-farm');if(now<farm.state.updatedAt)return result('clock-regressed');
 if(c.type==='depositAsset'){
  if(farm.activeOfferId)return result('active-offer');if(await tx.get('daily',minimalDailyKey(actor,dayKey(now))))return result('quota-used');
  const asset=ownedAsset(farm,c.asset);if(!asset)return result('foreign-asset');if(!assetAvailable(farm,asset,runtime.resources,runtime.catalog))return result('asset-unavailable');
  farm.state=runtime.advance(farm,now,null);
  const settled=ownedAsset(farm,c.asset)!;
  if(settled.kind==='animal'){const index=farm.state.animals.findIndex(a=>a.id===settled.data.id);farm.state.animals[index]=resetExchangeAnimal(settled.data,now);}
  const offer:WishingOffer={offerId:runtime.freshId('offer'),ownerAccountId:actor,animalId:asset.data.id,revision:1,status:'open',createdAt:now,expiresAt:runtime.resetAt(now),tradeId:null,exchange:{asset:clone(c.asset),preview:publicExchangeAsset(settled,runtime.catalog,runtime.resources),accepts:[...c.accepts]}};
  farm.activeOfferId=offer.offerId;farm.revision++;await tx.put('offers',offer.offerId,offer);await putCanonicalFarm(tx,farm);return result('ok',{offer,message:'已放入许愿池'});
 }
 const offer=await tx.get('offers',c.offerId);if(!offer||offer.status!=='open'||now>=offer.expiresAt)return result('offer-unavailable');if(offer.revision!==c.offerRevision)return result('stale-offer');if(offer.ownerAccountId===actor)return result('self-trade');if(farm.activeOfferId)return result('active-offer');
 const owner=await tx.get('farms',offer.ownerAccountId);if(!owner||owner.activeOfferId!==offer.offerId)return result('offer-unavailable');if(now<owner.state.updatedAt)return result('clock-regressed');
 const outgoing=ownedAsset(farm,c.asset),offered=ownedAsset(owner,offerRef(offer));if(!outgoing)return result('foreign-asset');if(!offered)throw new Error('Escrow lost canonical asset');
 if(!assetAvailable(farm,outgoing,runtime.resources,runtime.catalog)||!assetAvailable(owner,offered,runtime.resources,runtime.catalog))return result('asset-unavailable');
 if(!offer.exchange&&(outgoing.kind==='animal'&&outgoing.data.creative||offered.kind==='animal'&&offered.data.creative))return result('kind-not-accepted');
 if(offer.exchange?!offer.exchange.accepts.includes(outgoing.kind):outgoing.kind!=='animal')return result('kind-not-accepted');
 if(!offer.exchange&&outgoing.kind==='animal'&&offered.kind==='animal'&&outgoing.data.species===offered.data.species)return result('same-species');
 const day=dayKey(now);if(await tx.get('daily',minimalDailyKey(actor,day))||await tx.get('daily',minimalDailyKey(owner.accountId,day)))return result('quota-used');
 const nextOwner=clone(owner),nextTaker=clone(farm);nextOwner.state=runtime.advance(owner,now,lockedAnimalId(offer));nextTaker.state=runtime.advance(farm,now,null);
 const ownerAsset=ownedAsset(nextOwner,offerRef(offer))!,takerAsset=ownedAsset(nextTaker,c.asset)!;remove(nextOwner,ownerAsset);remove(nextTaker,takerAsset);
 const issue=receive(nextOwner,takerAsset,now,runtime.resources)??receive(nextTaker,ownerAsset,now,runtime.resources);if(issue)return result(issue);
 const tradeId=runtime.freshId('trade');nextOwner.activeOfferId=null;nextOwner.revision++;nextTaker.revision++;offer.status='completed';offer.revision++;offer.tradeId=tradeId;
 await putCanonicalFarm(tx,nextOwner);await putCanonicalFarm(tx,nextTaker);await tx.put('offers',offer.offerId,offer);
 await tx.put('daily',minimalDailyKey(owner.accountId,day),{accountId:owner.accountId,dayKey:day,tradeId});await tx.put('daily',minimalDailyKey(actor,day),{accountId:actor,dayKey:day,tradeId});
 await tx.put('trades',tradeId,{tradeId,offerId:offer.offerId,ownerAccountId:owner.accountId,takerAccountId:actor,ownerAsset,takerAsset,completedAt:now,dayKey:day});
 return runtime.result(nextTaker,now,'ok',{offer,tradeId,message:'交换成功，礼物已到家'});
}
