import type {FarmEgg,MinimalAnimal} from './model.ts';
import type {MinimalOrigin} from './cloud-contract.ts';
export const BOARDING_TERMS={inviteMs:600_000,stayMs:300_000,helperCoins:5,inboxLimit:20,consent:'egg-to-initiator-helper-5-coins'} as const;
export type BoardingStatus='pending'|'active'|'completed'|'failed'|'canceled'|'expired';
export type BoardingParent=Pick<MinimalAnimal,'id'|'name'|'species'|'sex'|'rarity'>;
export type PublicBoardingInvitation={id:string;revision:number;status:BoardingStatus;initiatorUid:string;recipientUid:string;eggOwnerUid:string;helperCoins:number;createdAt:number;expiresAt:number;acceptedAt?:number;readyAt?:number;completedAt?:number;parents:BoardingParent[]};
/** Never return this storage row directly. pendingEgg is a private reserved result. */
export type BoardingInvitation=PublicBoardingInvitation&{initiatorAnimalId:string;recipientAnimalId?:string;pendingEgg?:FarmEgg;eggOrigin?:MinimalOrigin};
export type BoardingCommand=
 | {type:'invite';targetUid:string;animalId:string;consent:typeof BOARDING_TERMS.consent}
 | {type:'accept';invitationId:string;invitationRevision:number;animalId:string;consent:typeof BOARDING_TERMS.consent}
 | {type:'cancel';invitationId:string;invitationRevision:number};
export type BoardingRequest={requestId:string;expectedRevision:number;command:BoardingCommand};
export type BoardingPage={serverTime:number;invitations:PublicBoardingInvitation[]};
export const isBoardingTerminal=(status:BoardingStatus)=>status!=='pending'&&status!=='active';
export function publicBoarding(invitation:BoardingInvitation):PublicBoardingInvitation{
 const {id,revision,status,initiatorUid,recipientUid,eggOwnerUid,helperCoins,createdAt,expiresAt,acceptedAt,readyAt,completedAt,parents}=invitation;
 return structuredClone({id,revision,status,initiatorUid,recipientUid,eggOwnerUid,helperCoins,createdAt,expiresAt,...(acceptedAt!==undefined?{acceptedAt}:{}),...(readyAt!==undefined?{readyAt}:{}),...(completedAt!==undefined?{completedAt}:{}),parents});
}

/** Defense in depth: the client accepts only a participant-specific projection. */
export function validBoardingPage(value:unknown,uid:string):value is BoardingPage{
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const only=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
 const time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 const account=(v:unknown)=>typeof v==='string'&&/^uid_[a-f0-9]{64}$/.test(v);
 if(!record(value)||!only(value,['serverTime','invitations'])||!time(value.serverTime)||!Array.isArray(value.invitations)||value.invitations.length>BOARDING_TERMS.inboxLimit)return false;
 return value.invitations.every(row=>record(row)&&only(row,['id','revision','status','initiatorUid','recipientUid','eggOwnerUid','helperCoins','createdAt','expiresAt','acceptedAt','readyAt','completedAt','parents'])&&typeof row.id==='string'&&/^[a-zA-Z0-9_:.-]{1,256}$/.test(row.id)&&time(row.revision)&&(row.revision as number)>0&&['pending','active','completed','failed','canceled','expired'].includes(row.status as string)&&account(row.initiatorUid)&&account(row.recipientUid)&&row.initiatorUid!==row.recipientUid&&[row.initiatorUid,row.recipientUid].includes(uid)&&row.eggOwnerUid===row.initiatorUid&&row.helperCoins===BOARDING_TERMS.helperCoins&&time(row.createdAt)&&time(row.expiresAt)&&['acceptedAt','readyAt','completedAt'].every(k=>row[k]===undefined||time(row[k]))&&Array.isArray(row.parents)&&row.parents.length>=1&&row.parents.length<=2&&row.parents.every(a=>record(a)&&only(a,['id','name','species','sex','rarity'])&&typeof a.id==='string'&&typeof a.name==='string'&&a.name.length<=80&&typeof a.species==='string'&&['male','female'].includes(a.sex as string)&&['white','green','blue','purple','gold'].includes(a.rarity as string)));
}
