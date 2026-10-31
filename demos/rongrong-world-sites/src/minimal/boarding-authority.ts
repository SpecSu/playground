import {lockedAnimalId} from './exchange-authority.ts';
import {BOARDING_TERMS,isBoardingTerminal,publicBoarding,type BoardingInvitation,type BoardingParent,type BoardingRequest} from './boarding-contract.ts';
import {putCanonicalFarm} from './creative-lifecycle.ts';
import {isAdult,MINIMAL_RULES,minimalCommand,dayKey,type MinimalAnimal,type MinimalState} from './model.ts';
import {isAnimalRuntimeActive,isAnimalProviderReady} from './species.ts';
import type {ApprovedFarmResourceContext} from './animal-resource-context.ts';
import type {CanonicalFarm,MinimalErrorCode,MinimalResult,MinimalTransaction} from './cloud-contract.ts';
export type BoardingHelpers={advance:(farm:CanonicalFarm,now:number,locked:string|null)=>MinimalState;readFarm:(tx:MinimalTransaction,uid:string)=>Promise<CanonicalFarm|null>;result:(farm:CanonicalFarm|null,now:number,code:MinimalErrorCode|'ok',extra?:Partial<MinimalResult>)=>MinimalResult;freshId:(prefix:string)=>string;resources?:ApprovedFarmResourceContext};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
const asset=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_:.-]{1,256}$/.test(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
export const isProductionUid=(v:unknown):v is string=>typeof v==='string'&&/^uid_[a-f0-9]{64}$/.test(v);
export function validBoardingRequest(v:unknown):v is BoardingRequest{
 if(!record(v)||!fields(v,['requestId','expectedRevision','command'])||!integer(v.expectedRevision)||!record(v.command))return false;const c=v.command;
 if(c.type==='invite')return fields(c,['type','targetUid','animalId','consent'])&&isProductionUid(c.targetUid)&&asset(c.animalId)&&c.consent===BOARDING_TERMS.consent;
 if(!asset(c.invitationId)||!integer(c.invitationRevision))return false;
 if(c.type==='cancel')return fields(c,['type','invitationId','invitationRevision']);
 return c.type==='accept'&&fields(c,['type','invitationId','invitationRevision','animalId','consent'])&&asset(c.animalId)&&c.consent===BOARDING_TERMS.consent;
}
const parent=(a:MinimalAnimal):BoardingParent=>({id:a.id,name:a.name,species:a.species,sex:a.sex,rarity:a.rarity??'white'});
function eligible(farm:CanonicalFarm,animal:MinimalAnimal,now:number,h:BoardingHelpers):boolean{return !animal.creative&&!farm.creative?.assets.some(a=>a.id===animal.id)&&!animal.resourceSuspended&&animal.id!==farm.state.carriedAnimalId&&animal.activity!=='carried'&&isAnimalProviderReady(animal.species,h.resources)&&isAnimalRuntimeActive(animal,h.resources)&&isAdult(animal,now)&&animal.lastBreedAttemptDay!==dayKey(now);}
function reserve(farm:CanonicalFarm,row:BoardingInvitation,animalId:string,egg=false){farm.activeBoardingId=row.id;farm.boardingAnimalId=animalId;farm.boardingReservedEgg=egg;farm.revision++;}
function unlock(farm:CanonicalFarm,row:BoardingInvitation,now:number,wishingLock:string|null){
 if(farm.activeBoardingId===row.id){
  const animal=farm.state.animals.find(a=>a.id===farm.boardingAnimalId);
  // The reserved pose stays put. Drop stale pre-boarding destinations so release
  // starts a new idle period, except when a defensive legacy wish still owns it.
  if(animal&&animal.id!==wishingLock){delete animal.path;delete animal.target;delete animal.targetActivity;delete animal.drinkAnchor;animal.activity='idle';animal.activityUntil=now+5000;}
  farm.activeBoardingId=null;farm.boardingAnimalId=null;farm.boardingReservedEgg=false;
 }
 // Even a pending invitation's unlocked recipient has advanced canonical time.
 farm.revision++;
}
async function terminal(tx:MinimalTransaction,row:BoardingInvitation,farm:CanonicalFarm,now:number,status:'canceled'|'expired'|'completed'|'failed',h:BoardingHelpers){
 const initiator=row.initiatorUid===farm.accountId?farm:await h.readFarm(tx,row.initiatorUid),recipient=row.recipientUid===farm.accountId?farm:await h.readFarm(tx,row.recipientUid);
 if(!initiator||!recipient)throw new Error('Missing canonical boarding participant');
 if(now<initiator.state.updatedAt||now<recipient.state.updatedAt)return false;
 // Seal the elapsed interval while OLD boarding locks are still present. The
 // authority projection also combines this independently retained wishing lock.
 // Otherwise a GET returns an unlocked animal at the acceptance timestamp and
 // the client replays the entire reserved interval as newly free movement.
 const wishingLocks=new Map<string,string|null>();
 for(const owner of [initiator,recipient]){
  const offer=owner.activeOfferId?await tx.get('offers',owner.activeOfferId):null;
  const wishingLock=offer?.ownerAccountId===owner.accountId&&offer.status==='open'?lockedAnimalId(offer):null;
  wishingLocks.set(owner.accountId,wishingLock);owner.state=h.advance(owner,now,wishingLock);
 }
 if(status==='completed'){
  if(!row.pendingEgg||!row.eggOrigin||initiator.activeBoardingId!==row.id||recipient.activeBoardingId!==row.id)throw new Error('Invalid boarding reservation');
  if(initiator.state.animals.length+initiator.state.eggs.length>=MINIMAL_RULES.maxAnimals)status='failed';
  else {if([...initiator.state.animals,...initiator.state.eggs].some(a=>a.id===row.pendingEgg!.id))throw new Error('Boarding egg identity collision');initiator.state.eggs.push(structuredClone(row.pendingEgg));initiator.assetProvenance[row.pendingEgg.id]=row.eggOrigin;recipient.state.coins+=row.helperCoins;}
 }
 row.status=status;row.completedAt=now;row.revision++;delete row.pendingEgg;delete row.eggOrigin;
 unlock(initiator,row,now,wishingLocks.get(initiator.accountId)??null);unlock(recipient,row,now,wishingLocks.get(recipient.accountId)??null);await putCanonicalFarm(tx,initiator);await putCanonicalFarm(tx,recipient);await tx.put('boardings',row.id,row);return true;
}
/** Called in existing authority transactions. No browser-controlled clock or reward. */
export async function settleBoardingForFarm(tx:MinimalTransaction,farm:CanonicalFarm,now:number,h:BoardingHelpers):Promise<void>{
 if(!farm.activeBoardingId)return;const row=await tx.get('boardings',farm.activeBoardingId);
 if(!row||![row.initiatorUid,row.recipientUid].includes(farm.accountId)||isBoardingTerminal(row.status))throw new Error('Invalid canonical boarding lock');
 if(row.status==='pending'&&now>=row.expiresAt)await terminal(tx,row,farm,now,'expired',h);
 else if(row.status==='active'&&row.readyAt!==undefined&&now>=row.readyAt)await terminal(tx,row,farm,now,row.pendingEgg?'completed':'failed',h);
}
async function inbox(tx:MinimalTransaction,farm:CanonicalFarm,now:number):Promise<string[]>{
 const result:string[]=[];for(const id of farm.boardingInbox??[]){const row=await tx.get('boardings',id);if(row&&!isBoardingTerminal(row.status)&&!(row.status==='pending'&&now>=row.expiresAt))result.push(id);}return result;
}
export async function applyBoarding(tx:MinimalTransaction,farm:CanonicalFarm|null,now:number,input:unknown,h:BoardingHelpers):Promise<MinimalResult>{
 const reply=(code:MinimalErrorCode|'ok',extra?:Partial<MinimalResult>)=>h.result(farm,now,code,extra);
 if(!validBoardingRequest(input)||!farm||!isProductionUid(farm.accountId))return reply(!farm?'not-initialized':'invalid-request');
 if(farm.revision!==input.expectedRevision)return reply('stale-farm');if(now<farm.state.updatedAt)return reply('clock-regressed');
 const c=input.command;
 if(c.type==='invite'){
  if(farm.activeBoardingId||farm.activeOfferId)return reply('boarding-busy');
  if(c.targetUid===farm.accountId)return reply('friend-unavailable');
  const target=await h.readFarm(tx,c.targetUid),profile=await tx.get('profiles',c.targetUid);if(!target||!profile)return reply('friend-unavailable');
  if(now<target.state.updatedAt)return reply('clock-regressed');
  const animal=farm.state.animals.find(a=>a.id===c.animalId);if(!animal)return reply('foreign-animal');if(!eligible(farm,animal,now,h))return reply('animal-unavailable');
  if(farm.state.breedingDay===dayKey(now))return reply('quota-used');if(farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals)return reply('capacity-full');
  const targetInbox=await inbox(tx,target,now);if(targetInbox.length>=BOARDING_TERMS.inboxLimit)return reply('boarding-busy');
  const row:BoardingInvitation={id:h.freshId('boarding'),revision:1,status:'pending',initiatorUid:farm.accountId,recipientUid:target.accountId,eggOwnerUid:farm.accountId,helperCoins:BOARDING_TERMS.helperCoins,createdAt:now,expiresAt:now+BOARDING_TERMS.inviteMs,initiatorAnimalId:animal.id,parents:[parent(animal)]};
  farm.state=h.advance(farm,now,null);reserve(farm,row,animal.id);farm.boardingInbox=[...(farm.boardingInbox??[]).slice(-(BOARDING_TERMS.inboxLimit-1)),row.id];target.boardingInbox=[...targetInbox,row.id];target.revision++;
  await tx.put('boardings',row.id,row);await putCanonicalFarm(tx,farm);await putCanonicalFarm(tx,target);return reply('ok',{boarding:publicBoarding(row),message:'邀请已发出，好友确认后开始寄养；动物所有权不变'});
 }
 const row=await tx.get('boardings',c.invitationId);if(!row||![row.initiatorUid,row.recipientUid].includes(farm.accountId)||isBoardingTerminal(row.status))return reply('boarding-unavailable');
 if(row.revision!==c.invitationRevision)return reply('boarding-unavailable');
 if(row.status==='pending'&&now>=row.expiresAt){await terminal(tx,row,farm,now,'expired',h);return reply('boarding-unavailable',{boarding:publicBoarding(row)});}
 if(c.type==='cancel'){if(!await terminal(tx,row,farm,now,'canceled',h))return reply('clock-regressed');return reply('ok',{boarding:publicBoarding(row),message:'寄养已取消，伙伴仍在各自主人的牧场；已受理的当天尝试不退回'});}
 if(row.status!=='pending'||farm.accountId!==row.recipientUid)return reply('boarding-unavailable');if(farm.activeBoardingId||farm.activeOfferId)return reply('boarding-busy');
 const initiator=await h.readFarm(tx,row.initiatorUid);if(!initiator||initiator.activeBoardingId!==row.id)return reply('boarding-unavailable');if(now<initiator.state.updatedAt)return reply('clock-regressed');
 const a=initiator.state.animals.find(a=>a.id===row.initiatorAnimalId),b=farm.state.animals.find(a=>a.id===c.animalId);if(!b)return reply('foreign-animal');if(!a||!eligible(initiator,a,now,h)||!eligible(farm,b,now,h))return reply('animal-unavailable');if(a.species!==b.species||a.sex===b.sex)return reply('boarding-partner');
 if(initiator.state.breedingDay===dayKey(now))return reply('quota-used');if(initiator.state.animals.length+initiator.state.eggs.length>=MINIMAL_RULES.maxAnimals)return reply('capacity-full');
 // Temporary model input is not an ownership transfer. Reuse the exact model's
 // RNG, rarity, adulthood, daily attempt and successful-egg rules. The guest has
 // no physical navigation in the host world; the resulting egg goes to the bag.
 initiator.state=h.advance(initiator,now,a.id);farm.state=h.advance(farm,now,null);
 const source=structuredClone(initiator.state),own=source.animals.find(x=>x.id===a.id)!,guest=structuredClone(b);guest.position={...own.position};guest.activity='idle';delete guest.path;delete guest.target;delete guest.targetActivity;delete guest.drinkAnchor;
 source.animals=[own,guest];const outcome=minimalCommand(source,{type:'breed',animalIds:[a.id,b.id]},now,[a.id,b.id],undefined,h.resources);
 if(!outcome.accepted)return reply('model-rejected',{message:outcome.message});
 row.status='active';row.revision++;row.recipientAnimalId=b.id;row.acceptedAt=now;row.readyAt=now+BOARDING_TERMS.stayMs;row.parents=[parent(a),parent(b)];
 const newEgg=outcome.state.eggs.find(e=>!source.eggs.some(before=>before.id===e.id));
 if(newEgg){row.pendingEgg={...newEgg,id:`${initiator.farmId}:${newEgg.id}`,location:'bag'};delete row.pendingEgg.position;delete row.pendingEgg.placedAt;delete row.pendingEgg.readyAt;row.eggOrigin=[a.id,b.id].some((id,i)=>(i?farm:initiator).assetProvenance[id]==='grandfathered-unverified')?'grandfathered-unverified':'server-created';initiator.state.breedingDay=dayKey(now);}
 initiator.state.sequence=outcome.state.sequence;
 for(const [owner,id] of [[initiator,a.id],[farm,b.id]] as const){owner.state.animals.find(x=>x.id===id)!.lastBreedAttemptDay=dayKey(now);}
 reserve(initiator,row,a.id,true);reserve(farm,row,b.id);await putCanonicalFarm(tx,initiator);await putCanonicalFarm(tx,farm);await tx.put('boardings',row.id,row);return reply('ok',{boarding:publicBoarding(row),message:'双方已确认，5分钟后由服务器结算；蛋归发起人，成功时协助者获5金币'});
}
