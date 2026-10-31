/** V7 natural-event loss and recovery ledgers. Mutates only the caller's transaction copy. */
import type {ThreatState} from './threat.ts';
export type RecoveryKind='injury'|'lost';
export type V7Recovery={kind:RecoveryKind;remainingOnlineMs:number;lastOnlineMs:number;eventId:string};
export type RiskLot={id:string;amount:number;animalId:string|null;tier:string;version:string;source:string};
export type V7RaidLoss={opening:RiskLot[];cap:number;capByTier?:Partial<Record<string,number>>;taken:number;deductions:Record<string,number>;closed:boolean};
export type V7RiskProfile={id:string;materials:number;onlineMs:number;animals:{id:string;memorial?:unknown}[];production?:{pending:RiskLot[]};v7?:{productionFeed:number;recovery:Record<string,V7Recovery>;raidLosses:Record<string,V7RaidLoss>;recoveryReceipts?:Record<string,RecoveryKind>}};
export const RECOVERY_COSTS={injury:{coins:8,productionFeed:2},lost:{coins:16,productionFeed:4}} as const;
const natural=(p:V7RiskProfile,e:ThreatState)=>p.id==='home'&&e.mode==='reassure'&&!!e.pressureBand&&e.id.startsWith('natural-');
const ledgerKey=(eventId:string,id:string)=>`${eventId}:${id}`;
/** Capture only opening pending lots of exposed, living producers; inventory never enters this module. */
export function beginV7Raid(p:V7RiskProfile,event:ThreatState){
 if(!p.v7||!natural(p,event)||p.v7.raidLosses[event.id])return;
 const living=new Set(p.animals.filter(a=>!a.memorial).map(a=>a.id));
 const exposed=new Set(event.actors.filter(a=>a.role==='animal'&&a.status!=='safe'&&living.has(a.id)).map(a=>a.id));
 const opening=structuredClone((p.production?.pending??[]).filter(l=>l.animalId&&exposed.has(l.animalId)&&Number.isSafeInteger(l.amount)&&l.amount>0));
 const capByTier=Object.fromEntries([...new Set(opening.map(l=>l.tier))].map(tier=>[tier,Math.floor(opening.filter(l=>l.tier===tier).reduce((n,l)=>n+l.amount,0)*.2)]));
 p.v7.raidLosses[event.id]={opening,cap:Math.floor(opening.reduce((n,l)=>n+l.amount,0)*.2),capByTier,taken:0,deductions:{},closed:false};
}
/** Observe after each authoritative online simulation step; no wall-clock progression or random deduction. */
export function observeV7Raid(p:V7RiskProfile,event:ThreatState){
 if(!p.v7||!natural(p,event))return;
 const ledger=p.v7.raidLosses[event.id];
 if(ledger&&!ledger.closed){
   const eligible=new Set(event.actors.filter(a=>a.role==='animal'&&(
     a.injuredAt!==null||['carried','boundary','lost'].includes(a.status)||(a.status!=='safe'&&event.wolves.some(w=>!['retreated','boundary'].includes(w.status)&&Math.hypot(w.position.x-a.position.x,w.position.z-a.position.z)<=1.5))
   )).map(a=>a.id));
   // Stable opening order makes repeated observations and client retries identical.
   for(const lot of [...ledger.opening].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
     if(ledger.taken>=ledger.cap)break;if(!lot.animalId||!eligible.has(lot.animalId))continue;
     // Old ledgers lacked rarity limits. Freeze their exact paid receipts instead
     // of redistributing or adding loss during a mid-event version migration.
     const tierTaken=ledger.opening.filter(l=>l.tier===lot.tier).reduce((n,l)=>n+(ledger.deductions[l.id]??0),0);
     const tierRoom=Math.max(0,(ledger.capByTier?.[lot.tier]??0)-tierTaken);if(!tierRoom)continue;
     const current=p.production?.pending.find(l=>l.id===lot.id&&l.animalId===lot.animalId);
     if(!current)continue;const prior=ledger.deductions[lot.id]??0;
     const take=Math.max(0,Math.min(ledger.cap-ledger.taken,tierRoom,lot.amount-prior,current.amount));
     current.amount-=take;ledger.taken+=take;ledger.deductions[lot.id]=prior+take;
   }
   if(p.production)p.production.pending=p.production.pending.filter(l=>l.amount>0);
   if(event.phase==='complete')ledger.closed=true;
 }
 for(const actor of event.actors){
   if(actor.role!=='animal'||!p.animals.some(a=>a.id===actor.id&&!a.memorial))continue;
   const kind:RecoveryKind|null=['carried','boundary','lost'].includes(actor.status)?'lost':actor.injuredAt!==null?'injury':null;
   if(!kind)continue;
   const completed=p.v7.recoveryReceipts?.[ledgerKey(event.id,actor.id)];
   if(completed==='lost'||completed===kind)continue;
   const old=p.v7.recovery[actor.id];
   if(old&&(old.kind==='lost'||old.kind===kind))continue;
   p.v7.recovery[actor.id]={kind,remainingOnlineMs:3000,lastOnlineMs:p.onlineMs,eventId:event.id};
 }
}
export function recoverySummary(p:V7RiskProfile){return Object.entries(p.v7?.recovery??{}).sort(([a],[b])=>a.localeCompare(b,'en')).map(([id,r])=>({id,...r,cost:{...RECOVERY_COSTS[r.kind]}}));}
export function canRecoverV7(p:V7RiskProfile,target:string):{ok:boolean;reason?:string;kind?:RecoveryKind;cost?:{coins:number;productionFeed:number}}{
 const r=p.v7?.recovery[target];if(!r)return {ok:false,reason:'这只动物目前不需要治疗或营救'};
 const cost={...RECOVERY_COSTS[r.kind]};if(p.materials<cost.coins||p.v7!.productionFeed<cost.productionFeed)return {ok:false,kind:r.kind,cost,reason:`完成时需要${cost.coins}金币和${cost.productionFeed}生产粮，可先照料安全动物赚取`};
 return {ok:true,kind:r.kind,cost};
}
