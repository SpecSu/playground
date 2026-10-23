/** Persisted wall-clock production; no browser clock or random rewards. */
import {emptyStacks,restoreWool,type MaterialTier,type WoolLot,type HerdEconomy} from './herd-economy.ts';
export type RareTier='blue'|'red'|'gold';
export type RareTarget={animalId:string;tier:RareTier};
export type ProductionSlot={animalId:string;startsAt:number;slotId?:string};
export type ProductionBatch=WoolLot&{cycle:number;slotId?:string};
export type ProductionState={version:6;profile:'home'|'lab';settledAt:number;cycle:number;slots:ProductionSlot[];pending:ProductionBatch[];target:RareTarget|null;nextTarget?:RareTarget|null;rareProgress:number;progressByTarget:Record<string,number>};
export const PRODUCTION_RULES={homeIntervalMs:43_200_000,labIntervalMs:30_000,maxSlots:6,maxBatches:6,whitePerBatch:2,rareCycles:{blue:2,red:6,gold:14}} as const;
export const productionInterval=(p:ProductionState)=>p.profile==='lab'?PRODUCTION_RULES.labIntervalMs:PRODUCTION_RULES.homeIntervalMs;
export function createProduction(now:number,profile:'home'|'lab',animalIds:string[]):ProductionState{
 if(!Number.isFinite(now))throw new RangeError('Invalid production time');return {version:6,profile,settledAt:now,cycle:0,slots:[...new Set(animalIds)].slice(0,3).map((animalId,index)=>({animalId,startsAt:now,slotId:`slot-${index}`})),pending:[],target:null,rareProgress:0,progressByTarget:{}};
}
const fixedSlotIds=Array.from({length:6},(_,index)=>`slot-${index}`);
/** Older V6 fixtures lack slot IDs. Assign once without dropping or rewriting provenance. */
function normalizeSlots(p:ProductionState){
 const used=new Set<string>();for(const slot of p.slots){if(!slot.slotId||!fixedSlotIds.includes(slot.slotId)||used.has(slot.slotId))slot.slotId=fixedSlotIds.find(id=>!used.has(id))!;used.add(slot.slotId);}
 const animalSlots=new Map(p.slots.map(s=>[s.animalId,s.slotId!]));
 const loads=new Map(fixedSlotIds.map(id=>[id,p.pending.filter(l=>l.slotId===id&&l.version==='v6'&&l.tier==='white').length]));
 for(const lot of p.pending){if(lot.version!=='v6'||lot.tier!=='white'||lot.slotId)continue;let slotId=animalSlots.get(lot.animalId??'');if(!slotId){slotId=[...fixedSlotIds].sort((a,b)=>loads.get(a)!-loads.get(b)!)[0];animalSlots.set(lot.animalId??'',slotId);}lot.slotId=slotId;loads.set(slotId,loads.get(slotId)!+1);}
 return p;
}
const targetKey=(t:RareTarget)=>`${t.animalId}:${t.tier}`;
export function settleProduction(original:ProductionState,now:number,availableIds?:string[]):ProductionState{
 const p=normalizeSlots(structuredClone(original));if(!Number.isFinite(now)||now<=p.settledAt)return p;
 const interval=productionInterval(p),elapsedCycles=Math.floor((now-p.settledAt)/interval);if(!elapsedCycles)return p;
 const oldAt=p.settledAt,oldCycle=p.cycle;p.cycle+=elapsedCycles;p.settledAt+=elapsedCycles*interval;
 // If the locked old period has fallen outside the offline cap, the queued
 // direction already applies to every retained period; discarded time earns nothing.
 if(elapsedCycles>6&&'nextTarget' in p){p.target=p.nextTarget??null;delete p.nextTarget;}
 // Only the latest six natural periods survive offline. Full stores do not build backlog.
 for(let i=Math.max(1,elapsedCycles-5);i<=elapsedCycles;i++){
  const at=oldAt+i*interval,cycle=oldCycle+i;
  for(const slot of p.slots){if(availableIds&&!availableIds.includes(slot.animalId)||at-slot.startsAt<interval)continue;if(p.pending.filter(l=>l.slotId===slot.slotId&&l.tier==='white'&&l.version==='v6').length>=6)continue;p.pending.push({id:`v6-${slot.animalId}-${cycle}-white`,tier:'white',amount:2,animalId:slot.animalId,version:'v6',source:'production',cycle,slotId:slot.slotId});}
  if(p.target&&(!availableIds||availableIds.includes(p.target.animalId))){const key=targetKey(p.target),progress=(p.progressByTarget[key]??0)+1,required=PRODUCTION_RULES.rareCycles[p.target.tier];p.progressByTarget[key]=progress%required;if(progress>=required)p.pending.push({id:`v6-${p.target.animalId}-${cycle}-${p.target.tier}`,tier:p.target.tier,amount:1,animalId:p.target.animalId,version:'v6',source:'rare-target',cycle});}
  // The first completed cycle belongs to the previously locked target.
  if(i===Math.max(1,elapsedCycles-5)&&'nextTarget' in p){p.target=p.nextTarget??null;delete p.nextTarget;}
 }
 p.rareProgress=p.target?p.progressByTarget[targetKey(p.target)]??0:0;return p;
}
export function setProductionSlots(original:ProductionState,ids:string[],now:number):ProductionState{
 const p=settleProduction(original,now);if(ids.length>6||new Set(ids).size!==ids.length)throw new RangeError('最多六个不同生产位');
 const retained=p.slots.filter(s=>ids.includes(s.animalId)),used=new Set(retained.map(s=>s.slotId));
 p.slots=ids.map(animalId=>{const existing=retained.find(s=>s.animalId===animalId);if(existing)return existing;const slotId=fixedSlotIds.find(id=>!used.has(id))!;used.add(slotId);return {animalId,slotId,startsAt:now===p.settledAt?p.settledAt:p.settledAt+productionInterval(p)};});return p;
}
export function setRareTarget(original:ProductionState,target:RareTarget|null,now:number):ProductionState{const p=settleProduction(original,now);p.nextTarget=target;return p;}
export function claimProduction(original:ProductionState,economy:HerdEconomy,receipt:string,animalId?:string){const p=normalizeSlots(structuredClone(original)),lots=p.pending.filter(l=>!animalId||l.animalId===animalId).map(l=>({...l,claimedBy:receipt}));p.pending=p.pending.filter(l=>animalId&&l.animalId!==animalId);const claimed=emptyStacks();for(const l of lots)claimed[l.tier as MaterialTier]+=l.amount;return {production:p,economy:restoreWool(economy,lots),claimed,total:lots.reduce((n,l)=>n+l.amount,0)};}
