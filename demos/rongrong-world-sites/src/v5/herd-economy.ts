/** Graded wool is independent of life stage, affection and appearance.
 * All operations are pure. The estate owner commits returned state, material
 * deltas and its command receipt in one transaction; these rules grant no access.
 */
import type {LifeState} from './life.ts';
export const TIERS=['white','green','blue','red','gold'] as const;
export type MaterialTier=typeof TIERS[number];
export type MaterialStacks=Record<MaterialTier,number>;
export type AnimalLevel=1|2|3|4|5;
export const TIER_LABEL:Record<MaterialTier,string>={white:'普通',green:'优良',blue:'稀有',red:'史诗',gold:'传说'};
export const TIER_COLOR:Record<MaterialTier,string>={white:'#e7e8df',green:'#8fca89',blue:'#79b9e3',red:'#e48181',gold:'#e6c467'};
export const TIER_VALUE:Record<MaterialTier,number>={white:1,green:2,blue:4,red:7,gold:12};
export const HERD_RULES={naturalIntervalMs:10*60_000,demoIntervalMs:15_000,offlineCreditCapMs:2*60*60_000,storedCap:6,cultivationWool:4,feedThresholds:[0,1,3,6,9]} as const;
export type AnimalHusbandry={version:1;profile:'home'|'lab';level:AnimalLevel;rarity:MaterialTier;settledAt:number;progressMs:number;pending:MaterialStacks;effectiveFeeds:number;lastEffectiveFeedAt:number|null};
export type WoolLot={id:string;tier:MaterialTier;amount:number;animalId:string|null;version:'legacy'|'v6'|'v7';source:string;batchId?:string;claimedBy?:string};
export type HerdEconomy={version:1;warehouse:MaterialStacks;lots?:WoolLot[]};
type CareLife=Pick<LifeState,'stage'|'care'|'lastEffectiveFeedAt'|'products'>;
export type CultivationPreview={ok:boolean;nextRarity:MaterialTier|null;requiredLevel:number;requiredFeeds:number;requiredWool:number;availableWool:number;cost:Partial<MaterialStacks>;message:string};
export type ProductSummary={level:AnimalLevel;rarity:MaterialTier;tier:MaterialTier;total:number;pending:MaterialStacks;cap:number;intervalMs:number;nextReadyInMs:number|null;full:boolean};
const validCount=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function finite(now:number){if(!Number.isFinite(now))throw new RangeError('now must be finite');return now;}
function isTier(value:unknown):value is MaterialTier{return TIERS.includes(value as MaterialTier);}
export function tierNumber(tier:MaterialTier):AnimalLevel{if(!isTier(tier))throw new RangeError('Unknown material tier');return (TIERS.indexOf(tier)+1) as AnimalLevel;}
export function emptyStacks():MaterialStacks{return {white:0,green:0,blue:0,red:0,gold:0};}
export function stackTotal(stacks:MaterialStacks):number{let total=0;for(const tier of TIERS){if(!validCount(stacks[tier]))throw new RangeError('Material balances must be non-negative integers');total+=stacks[tier];}if(!Number.isSafeInteger(total))throw new RangeError('Material total exceeds safe integer range');return total;}
export function createHerdEconomy():HerdEconomy{return {version:1,warehouse:emptyStacks()};}
function recordedFeeds(life:CareLife){const count=life.care.baby.feeds+life.care.juvenile.feeds;if(!validCount(count))throw new RangeError('Effective care must be a non-negative integer');return count;}
function careLevel(feeds:number,stage:CareLife['stage']):AnimalLevel{const stageFloor=stage==='adult'?3:stage==='juvenile'?2:1;return Math.max(stageFloor,HERD_RULES.feedThresholds.filter(threshold=>feeds>=threshold).length) as AnimalLevel;}
function interval(h:AnimalHusbandry){return h.profile==='lab'?HERD_RULES.demoIntervalMs:HERD_RULES.naturalIntervalMs;}
function assertHusbandry(h:AnimalHusbandry){finite(h.settledAt);if(!['home','lab'].includes(h.profile)||!Number.isInteger(h.level)||h.level<1||h.level>5||!isTier(h.rarity)||!validCount(h.effectiveFeeds)||!Number.isFinite(h.progressMs)||h.progressMs<0||h.progressMs>=interval(h)||stackTotal(h.pending)>HERD_RULES.storedCap)throw new RangeError('Invalid husbandry state');if(h.lastEffectiveFeedAt!==null)finite(h.lastEffectiveFeedAt);}
/** Call only on absent state. Existing earned products move to white wool once;
 * the owner must retire life.products.stored atomically and never import again.
 */
export function createHusbandry(now:number,profile:'home'|'lab',life:CareLife,appearance:'plain'|'starlit'='plain'):AnimalHusbandry{
 finite(now);if(!['home','lab'].includes(profile))throw new RangeError('Unknown production profile');
 const effectiveFeeds=recordedFeeds(life),pending=emptyStacks();
 if(!validCount(life.products.stored)||life.products.stored>HERD_RULES.storedCap)throw new RangeError('Legacy stored wool must fit its original six-item capacity');
 pending.white=life.products.stored;
 return {version:1,profile,level:careLevel(effectiveFeeds,life.stage),rarity:appearance==='starlit'?'green':'white',settledAt:now,progressMs:0,pending,effectiveFeeds,lastEffectiveFeedAt:life.lastEffectiveFeedAt};
}
/** A full coat pauses production. Missed time cannot become a claimable backlog. */
export function settleHusbandry(original:AnimalHusbandry,now:number):AnimalHusbandry{
 finite(now);assertHusbandry(original);const h=structuredClone(original);if(now<=h.settledAt)return h;
 const elapsed=Math.min(now-h.settledAt,HERD_RULES.offlineCreditCapMs);h.settledAt=now;
 const stored=stackTotal(h.pending),room=HERD_RULES.storedCap-stored;if(!room){h.progressMs=0;return h;}
 const progress=h.progressMs+elapsed,batches=Math.min(room,Math.floor(progress/interval(h))),tier=TIERS[h.level-1];
 h.pending[tier]+=batches;h.progressMs=batches===room?0:progress-batches*interval(h);return h;
}
/** Settle prior quality before observing a newly earned care record. Timestamp
 * detection keeps capped baby/juvenile records from double counting and lets
 * effective adult feeding continue advancing husbandry after life growth ends.
 */
export function syncHusbandry(original:AnimalHusbandry,life:CareLife,now:number):AnimalHusbandry{
 const h=settleHusbandry(original,now);if(now<original.settledAt)return h;
 const at=life.lastEffectiveFeedAt;if(at!==null&&(!Number.isFinite(at)||at>now))return h;
 const fresh=at!==null&&(h.lastEffectiveFeedAt===null||at>h.lastEffectiveFeedAt);
 h.effectiveFeeds=Math.max(recordedFeeds(life),h.effectiveFeeds+Number(fresh));if(fresh)h.lastEffectiveFeedAt=at;
 h.level=Math.max(h.level,careLevel(h.effectiveFeeds,life.stage)) as AnimalLevel;return h;
}
export function claimWool(original:AnimalHusbandry,economy:HerdEconomy,now:number):{husbandry:AnimalHusbandry;economy:HerdEconomy;claimed:MaterialStacks;total:number}{
 const husbandry=settleHusbandry(original,now),next=structuredClone(economy),claimed={...husbandry.pending},total=stackTotal(claimed);stackTotal(next.warehouse);
 for(const tier of TIERS){next.warehouse[tier]+=claimed[tier];husbandry.pending[tier]=0;}stackTotal(next.warehouse);
 return {husbandry,economy:next,claimed,total};
}
/** Call with a receipt-protected estate command. Different commands may
 * intentionally exchange/spend more than once, so this module cannot infer IDs.
 */
/** Backfill only unrepresented inventory; existing lot identities survive every operation. */
export function migrateWoolLots(economy:HerdEconomy):HerdEconomy{
 const e=structuredClone(economy);stackTotal(e.warehouse);e.lots??=[];
 for(const tier of TIERS){const represented=e.lots.filter(l=>l.tier===tier).reduce((n,l)=>n+l.amount,0);const missing=e.warehouse[tier]-represented;if(missing<0)throw new RangeError('Wool lots exceed warehouse');if(missing)e.lots.push({id:`legacy-warehouse-${tier}-${e.lots.length}`,tier,amount:missing,animalId:null,version:'legacy',source:'legacy-warehouse'});}
 return e;
}
export function consumeWool(economy:HerdEconomy,cost:Partial<MaterialStacks>,version?:WoolLot['version']):{economy:HerdEconomy;accepted:boolean;message:string;consumed:WoolLot[]}{
 const e=migrateWoolLots(economy),entries=Object.entries(cost);
 const reject=(message:string)=>({economy:structuredClone(economy),accepted:false,message,consumed:[]});
 if(!entries.length||entries.some(([t,n])=>!isTier(t)||!validCount(n))||entries.every(([,n])=>n===0))return reject('请选择有效的羊毛数量');
 for(const [t,n] of entries)if(e.lots!.filter(l=>l.tier===t&&(!version||l.version===version)).reduce((s,l)=>s+l.amount,0)<n!)return reject('仓库里的羊毛还不够');
 const consumed:WoolLot[]=[];
 for(const [t,n] of entries){let left=n!;for(const lot of e.lots!){if(lot.tier!==t||(version&&lot.version!==version))continue;const take=Math.min(left,lot.amount);if(take){consumed.push({...lot,amount:take});lot.amount-=take;left-=take;}if(!left)break;}e.warehouse[t as MaterialTier]-=n!;}
 e.lots=e.lots!.filter(l=>l.amount>0);return {economy:e,accepted:true,message:'羊毛已经使用',consumed};
}
export function restoreWool(economy:HerdEconomy,lots:WoolLot[]):HerdEconomy{
 const e=migrateWoolLots(economy);for(const lot of lots){if(!isTier(lot.tier)||!validCount(lot.amount))throw new RangeError('Invalid wool refund');const existing=e.lots!.find(l=>l.id===lot.id&&l.tier===lot.tier&&l.version===lot.version&&l.animalId===lot.animalId&&l.source===lot.source);if(existing)existing.amount+=lot.amount;else e.lots!.push(structuredClone(lot));e.warehouse[lot.tier]+=lot.amount;}stackTotal(e.warehouse);return e;
}
export function spendWool(economy:HerdEconomy,cost:Partial<MaterialStacks>){return consumeWool(economy,cost);}
export function exchangeWool(economy:HerdEconomy,tier:MaterialTier,amount:number,version:WoolLot['version']='v6'):{economy:HerdEconomy;accepted:boolean;materials:number;message:string}{
 if(!isTier(tier)||!validCount(amount)||amount===0||!Number.isSafeInteger(amount*TIER_VALUE[tier])||(version!=='legacy'&&version!=='v6'))return {economy:structuredClone(economy),accepted:false,materials:0,message:'请选择有效的羊毛数量'};
 if(version==='v6'&&!['white','green'].includes(tier))return {economy:structuredClone(economy),accepted:false,materials:0,message:'新版稀有羊毛用于制作；旧库存可选择旧版兑换'};
 const result=consumeWool(economy,{[tier]:amount},version),materials=result.accepted?amount*TIER_VALUE[tier]:0;
 return {...result,materials,message:result.accepted?`${amount}份${TIER_LABEL[tier]}羊毛换到${materials}材料`:result.message};
}
export function cultivationPreview(h:AnimalHusbandry,economy:HerdEconomy):CultivationPreview{
 assertHusbandry(h);stackTotal(economy.warehouse);const index=TIERS.indexOf(h.rarity),nextRarity=TIERS[index+1]??null,requiredLevel=Math.min(5,index+2),requiredFeeds=index+1;
 const qualified=TIERS.slice(index),availableWool=qualified.reduce((sum,tier)=>sum+economy.warehouse[tier],0),cost:Partial<MaterialStacks>={};let left:number=HERD_RULES.cultivationWool;
 for(const tier of qualified){const take=Math.min(left,economy.warehouse[tier]);if(take)cost[tier]=take;left-=take;}
 let message=nextRarity?`用4份${TIER_LABEL[h.rarity]}及以上羊毛培育为${TIER_LABEL[nextRarity]}`:'已经是传说品质';
 if(nextRarity&&h.level<requiredLevel)message=`先照顾到Lv.${requiredLevel}`;
 else if(nextRarity&&h.effectiveFeeds<requiredFeeds)message=`再完成${requiredFeeds-h.effectiveFeeds}次有效喂养`;
 else if(nextRarity&&left)message=`还差${left}份${TIER_LABEL[h.rarity]}及以上羊毛`;
 return {ok:!!nextRarity&&h.level>=requiredLevel&&h.effectiveFeeds>=requiredFeeds&&left===0,nextRarity,requiredLevel,requiredFeeds,requiredWool:HERD_RULES.cultivationWool,availableWool,cost,message};
}
export function cultivateHusbandry(original:AnimalHusbandry,economy:HerdEconomy,now:number,_expectedRarity:MaterialTier):{husbandry:AnimalHusbandry;economy:HerdEconomy;accepted:boolean;message:string}{
 finite(now);return {husbandry:structuredClone(original),economy:structuredClone(economy),accepted:false,message:'纯标签培育已暂停；原有品质标签保留，请选择跨日稀有目标'};
}
export function productSummary(original:AnimalHusbandry,now:number):ProductSummary{
 const h=settleHusbandry(original,now),total=stackTotal(h.pending),full=total===HERD_RULES.storedCap;
 return {level:h.level,rarity:h.rarity,tier:TIERS[h.level-1],total,pending:{...h.pending},cap:HERD_RULES.storedCap,intervalMs:interval(h),nextReadyInMs:full?null:interval(h)-h.progressMs,full};
}
