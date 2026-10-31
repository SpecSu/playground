/** Ordinary mature lots only. A server transaction owns both profiles and this ledger. */
import type {Profile} from '../v5/estate.ts';
import type {ProductionBatch} from '../v5/v6-production.ts';
import {createHerdEconomy,restoreWool,type WoolLot} from '../v5/herd-economy.ts';
export const HARVEST_RULES={batchFraction:.1,visitorPerUtcDay:1,ownerPerUtcDay:3} as const;
export type HarvestLedger=Record<string,{original:number;taken:number;creditSpent?:number}>;
export type HarvestCommand={id:string;type:'open'|'close'|'take';token?:string;profile?:'home'|'lab'};
export type HarvestShare={token:string;profile:'home'|'lab';runId:string;open:boolean;available:number;locked:boolean;own:boolean};
export type HarvestReply={accepted:boolean;message:string;duplicate?:boolean;share?:HarvestShare;received?:number;visitorUsed?:number;ownerUsed?:number};
export const harvestRun=(p:Profile)=>`${p.createdAt}:${p.runId??'initial'}`;
export function harvestLocked(p:Profile){return !!p.threat&&p.threat.phase!=='complete';}
function ordinary(l:ProductionBatch){return (l.tier==='white'||l.tier==='green')&&!l.claimedBy&&Number.isSafeInteger(l.amount)&&l.amount>0;}
export function harvestPlan(p:Profile,original:HarvestLedger):{available:number;ledger:HarvestLedger;lots:WoolLot[]}{
 const ledger=structuredClone(original),eligible=(p.production?.pending??[]).filter(ordinary),lots:WoolLot[]=[];
 if(harvestLocked(p))return {available:0,ledger,lots};
 // Each exposed source contributes integer tenths. Credits are spent across the
 // pool, but disappear if their still-unharvested physical source is claimed.
 const entries=eligible.map(l=>{const key=`${l.version}:${l.id}`;ledger[key]??={original:l.amount,taken:0,creditSpent:0};const r=ledger[key];const credit=Math.max(0,Math.min(r.original,l.amount+r.taken)-(r.creditSpent??0));return {l,r,credit};});
 const available=Math.min(eligible.reduce((n,l)=>n+l.amount,0),Math.floor(entries.reduce((n,e)=>n+e.credit,0)/10));let charge=available*10;
 for(const e of entries){const spent=Math.min(charge,e.credit);e.r.creditSpent=(e.r.creditSpent??0)+spent;charge-=spent;}
 let remaining=available;for(const {l,r} of entries){if(!remaining)break;const amount=Math.min(remaining,l.amount);lots.push({...structuredClone(l),amount});r.taken+=amount;remaining-=amount;}
 return {available,ledger,lots};
}
export function transferHarvest(owner:Profile,visitor:Profile,ledger:HarvestLedger,transactionId:string){
 const plan=harvestPlan(owner,ledger);if(!plan.available)return {accepted:false,message:harvestLocked(owner)?'主人正在事件中，成熟产物暂时锁定':'成熟普通采收池不足10份来源额度，向下取整后不可采收',received:0,ledger};
 const deductions=new Map(plan.lots.map(l=>[l.id,l.amount]));owner.production!.pending=owner.production!.pending.map(l=>({...l,amount:l.amount-(deductions.get(l.id)??0)})).filter(l=>l.amount>0);
 visitor.economy=restoreWool(visitor.economy??createHerdEconomy(),plan.lots.map(l=>({...l,id:`harvest:${transactionId}:${l.id}`,source:`${l.source}:shared-harvest`})));return {accepted:true,message:`已采收${plan.available}份普通成熟产物，主人库存同步扣减`,received:plan.available,ledger:plan.ledger};
}
