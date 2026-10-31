/** V7 trial economy. All balances are server-owned; materials remains the sole coin balance. */
import type {EstateAnimal,EstateCommand,Profile} from './estate.ts';
import {TIERS,createHerdEconomy,createHusbandry,migrateWoolLots,consumeWool,restoreWool,type MaterialTier} from './herd-economy.ts';
import {createProduction,type ProductionBatch} from './v6-production.ts';
import {createLife} from './life.ts';
import {BUILDING_RULES,buildingApproaches,buildingFootprint,isOwned,isWalkable,shelterEntries,terrainAt,type GridPoint} from './layout.ts';
import {findActorPath} from './actor-navigation.ts';
import {canRecoverV7} from './v7-risk.ts';
import {raidRisk} from './raid-cycle.ts';
export const V7_RULES={sale:{white:2,green:6,blue:18,red:54,gold:162},feedPerCycle:{white:1,green:2,blue:3,red:5,gold:8},boxPrice:{white:60,green:180,blue:500,red:1400,gold:4000},landPerAnimal:{white:2,green:3,blue:4,red:6,gold:9},animalValue:{white:10,green:30,blue:80,red:180,gold:400},feedPack:10,feedPackPrice:10,initialFeed:24,synthesisRatio:3,synthesisCoins:2,maxAnimals:12,maxBatches:6,maxOfflineCycles:6,homeIntervalMs:43_200_000,labIntervalMs:30_000} as const;
export type V7Egg={id:string;species:'sheep';tier:MaterialTier;price:number;boughtAt:number;status:'boxed'|'hatched';animalId?:string};
export type V7ProductionClock={settledAt:number;cycle:number};
export type V7Recovery={kind:'injury'|'lost';remainingOnlineMs:number;lastOnlineMs:number;eventId:string};
export type V7RaidLoss={opening:ProductionBatch[];cap:number;capByTier?:Partial<Record<MaterialTier,number>>;taken:number;deductions:Record<string,number>;closed:boolean};
export type HatchPreview={ok:boolean;reasons:string[];tier:MaterialTier;price:number;coins:number;dailyFeedDemand:number;feed:number;feedGap:number;landDemand:number;landAvailable:number;landGap:number;reachableBeds:number;animalCount:number;missingBeds:number;futureRaidBand:'low'|'medium'|'high';version:number;layoutVersion:number;expectedCount:number};
export type V7State={version:7;revision:number;migratedAt:number;productionFeed:number;eggs:V7Egg[];clocks:Record<string,V7ProductionClock>;recovery:Record<string,V7Recovery>;raidLosses:Record<string,V7RaidLoss>;recoveryReceipts:Record<string,'injury'|'lost'>;receipts:Record<string,{accepted:boolean;message:string}>;preview?:HatchPreview&{boxId?:string}};
export type ProductionStatus={animalId:string;tier:MaterialTier;quantity:number;feedPerCycle:number;pendingBatches:number;pendingUnits:number;maxBatches:6;intervalMs:number;nextReadyInMs:number|null;reason:'ready'|'feed'|'injury'|'lost'|'shelter'|'full'|'memorial'|'event'};
const isTier=(value:unknown):value is MaterialTier=>TIERS.includes(value as MaterialTier);
const count=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const alive=(p:Profile)=>p.animals.filter(a=>!a.memorial);
const tierOf=(a:EstateAnimal):MaterialTier=>a.husbandry?.rarity??'white';
const interval=(p:Profile)=>p.id==='lab'?V7_RULES.labIntervalMs:V7_RULES.homeIntervalMs;
const quantity=(a:EstateAnimal)=>Math.min(4,2+Number(a.life.stage!=='baby')+Number((a.husbandry?.effectiveFeeds??0)>=9));
/** No V6 catch-up occurs on migration. Earned legacy/V6 lots are left intact. */
export function ensureV7(p:Profile,now:number):V7State{
 if(!Number.isFinite(now))throw new RangeError('Invalid V7 time');
 p.economy=migrateWoolLots(p.economy??createHerdEconomy());p.production??=createProduction(now,p.id,alive(p).map(a=>a.id));
 if(!p.v7)p.v7={version:7,revision:0,migratedAt:now,productionFeed:V7_RULES.initialFeed,eggs:[],clocks:{},recovery:{},raidLosses:{},recoveryReceipts:{},receipts:{}};
 const s=p.v7;s.recoveryReceipts??={};for(const a of p.animals){if(!a.husbandry)a.husbandry=createHusbandry(now,p.id,a.life,a.appearance);s.clocks[a.id]??={settledAt:now,cycle:0};}return s;
}
function shelterPosition(p:Profile,a:EstateAnimal):GridPoint{
 const assignment=a.restAssignment;
 if(assignment?.phase==='admitted')return assignment.door;
 const actor=p.threat?.actors.find(t=>t.id===a.id);
 if(actor?.status==='safe'&&actor.reservation){const entry=shelterEntries(p.layout).find(e=>e.buildingId===actor.reservation!.buildingId&&e.doorId===actor.reservation!.doorId);if(entry)return entry;}
 return a.position;
}
/** Bipartite matching certifies one reachable, distinct real bed for every animal. */
function bedAssignments(p:Profile,animals:{id:string;position:GridPoint}[]):Set<string>{
 const entries=shelterEntries(p.layout),beds=[...new Map(entries.map(e=>[e.buildingId,e.capacity])).entries()].flatMap(([buildingId,capacity])=>Array.from({length:capacity},(_,index)=>`${buildingId}:${index}`));
 const reachable=new Map(animals.map(a=>[a.id,new Set(entries.filter(e=>findActorPath(p.layout,a.position,e)).map(e=>e.buildingId))]));
 const owner=new Map<string,string>();
 function assign(id:string,seen:Set<string>):boolean{for(const bed of beds){if(seen.has(bed)||![...reachable.get(id)!].some(building=>bed.startsWith(`${building}:`)))continue;seen.add(bed);const previous=owner.get(bed);if(!previous||assign(previous,seen)){owner.set(bed,id);return true;}}return false;}
 for(const a of animals)assign(a.id,new Set());return new Set(owner.values());
}
function currentBeds(p:Profile){return bedAssignments(p,alive(p).map(a=>({id:a.id,position:shelterPosition(p,a)})));}
function blocker(p:Profile,a:EstateAnimal,beds:Set<string>):ProductionStatus['reason']{
 if(a.memorial)return 'memorial';if(p.threat&&p.threat.phase!=='complete')return 'event';const recovery=p.v7?.recovery[a.id];if(recovery)return recovery.kind;
 const actor=p.threat?.actors.find(t=>t.id===a.id);if(actor&&['carried','boundary','lost','memorial'].includes(actor.status))return 'lost';
 const paidKind=actor&&p.v7?.recoveryReceipts[`${p.threat!.id}:${a.id}`];if(actor&&actor.injuredAt!==null&&!paidKind)return 'injury';
 if(!beds.has(a.id))return 'shelter';return 'ready';
}
export function productionStatus(p:Profile,animalId:string):ProductionStatus{
 const a=p.animals.find(a=>a.id===animalId),tier=a?tierOf(a):'white',lots=(p.production?.pending??[]).filter(l=>l.animalId===animalId&&l.version!=='legacy'),pendingBatches=lots.length;
 let reason=a?blocker(p,a,currentBeds(p)):'memorial';if(reason==='ready'&&pendingBatches>=6)reason='full';if(reason==='ready'&&(p.v7?.productionFeed??0)<V7_RULES.feedPerCycle[tier])reason='feed';
 const clock=p.v7?.clocks[animalId],at=Math.max(p.lastSeenAt,p.lastPulseAt,clock?.settledAt??0),nextReadyInMs=reason==='full'||reason==='memorial'?null:Math.max(0,interval(p)-Math.max(0,at-(clock?.settledAt??at)));
 return {animalId,tier,quantity:a?quantity(a):2,feedPerCycle:V7_RULES.feedPerCycle[tier],pendingBatches,pendingUnits:lots.reduce((n,l)=>n+l.amount,0),maxBatches:6,intervalMs:interval(p),nextReadyInMs,reason};
}
export function settleV7(p:Profile,now:number):void{
 const s=ensureV7(p,now),events:{animal:EstateAnimal;at:number;cycle:number;index:number}[]=[],duration=interval(p),beds=currentBeds(p);let changed=false;
 for(const [index,a] of p.animals.entries()){
  const clock=s.clocks[a.id];if(now<=clock.settledAt)continue;const elapsed=Math.floor((now-clock.settledAt)/duration);if(!elapsed)continue;
  for(let i=Math.max(1,elapsed-5);i<=elapsed;i++)events.push({animal:a,at:clock.settledAt+i*duration,cycle:clock.cycle+i,index});clock.settledAt+=elapsed*duration;clock.cycle+=elapsed;
 }
 events.sort((a,b)=>a.at-b.at||a.index-b.index);
 for(const e of events){const a=e.animal;if(blocker(p,a,beds)!=='ready')continue;const lots=p.production!.pending.filter(l=>l.animalId===a.id&&l.version!=='legacy');if(lots.length>=6)continue;const tier=tierOf(a),feed=V7_RULES.feedPerCycle[tier];if(s.productionFeed<feed)continue;
  s.productionFeed-=feed;p.production!.pending.push({id:`v7-${p.runId??p.createdAt}-${a.id}-${e.cycle}`,animalId:a.id,tier,amount:quantity(a),version:'v7',source:'paid-production',batchId:`v7:${p.id}:${p.runId??p.createdAt}:period:${e.at}`,cycle:e.cycle});changed=true;
 }
 // Old timers remain a retired snapshot; only V7 per-animal clocks grant new wool.
 if(changed)s.revision++;
}
/** One reachable interaction target, shared by command routing and paid care distance checks. */
export function recoveryPoint(p:Profile,id:string):GridPoint|undefined{
 const animal=p.animals.find(a=>a.id===id&&!a.memorial),actor=p.threat?.actors.find(a=>a.id===id);
 if(actor?.status==='safe'&&actor.reservation){const door=shelterEntries(p.layout).find(e=>e.buildingId===actor.reservation!.buildingId&&e.doorId===actor.reservation!.doorId);if(door)return {x:door.x,z:door.z};}
 if(actor&&['boundary','lost'].includes(actor.status)&&actor.rescuePoint)return actor.rescuePoint;
 return actor?.position??animal?.position;
}
/** Called only by the authoritative online tick; no wall-clock/offline progress. */
export function advanceV7Recovery(p:Profile,dtMs:number,enabled:boolean,fromPosition:GridPoint=p.position):string|undefined{
 const s=p.v7;if(!s||!Number.isFinite(dtMs)||dtMs<=0)return;let authorized:string|undefined;
 for(const [id,r] of Object.entries(s.recovery)){
  r.lastOnlineMs=p.onlineMs;const animal=p.animals.find(a=>a.id===id&&!a.memorial),point=recoveryPoint(p,id);
  const active=enabled&&Math.hypot(p.position.x-fromPosition.x,p.position.z-fromPosition.z)<.001&&p.rescueIntent?.target===id&&animal&&point&&Math.hypot(p.position.x-point.x,p.position.z-point.z)<=1.5;
  if(!active){r.remainingOnlineMs=3000;continue;}r.remainingOnlineMs=Math.max(0,r.remainingOnlineMs-Math.min(dtMs,1500));if(r.remainingOnlineMs>0)continue;
  const can=canRecoverV7(p,id);if(!can.ok||!can.cost){r.remainingOnlineMs=3000;p.notice=can.reason??'恢复资源不足';continue;}
  p.materials-=can.cost.coins;s.productionFeed-=can.cost.productionFeed;s.recoveryReceipts[`${r.eventId}:${id}`]=r.kind;delete s.recovery[id];s.revision++;authorized=id;p.notice=r.kind==='injury'?'治疗完成，生产可以恢复':'营救照料完成，继续护送回家';
 }
 return authorized;
}
function landAvailable(p:Profile){return new Set(p.layout.owned.filter(q=>isWalkable(p.layout,q)).map(q=>`${q.x},${q.z}`)).size;}
function hatchPosition(p:Profile):GridPoint|undefined{return p.layout.owned.filter(q=>isWalkable(p.layout,q)&&alive(p).every(a=>Math.hypot(a.position.x-q.x,a.position.z-q.z)>1)).find(q=>shelterEntries(p.layout).some(e=>findActorPath(p.layout,q,e)));}
export function previewHatch(p:Profile,tier:MaterialTier):HatchPreview{
 if(!isTier(tier))throw new RangeError('Unknown animal quality');const animals=alive(p),next={id:'preview-new-animal',rarity:TIERS.indexOf(tier)+1},dailyFeedDemand=2*(animals.reduce((n,a)=>n+V7_RULES.feedPerCycle[tierOf(a)],0)+V7_RULES.feedPerCycle[tier]),feed=p.v7?.productionFeed??0,feedGap=Math.max(0,dailyFeedDemand-feed),landDemand=animals.reduce((n,a)=>n+V7_RULES.landPerAnimal[tierOf(a)],0)+V7_RULES.landPerAnimal[tier],land=landAvailable(p),landGap=Math.max(0,landDemand-land),position=hatchPosition(p),positions=animals.map(a=>({id:a.id,position:shelterPosition(p,a)}));if(position)positions.push({id:next.id,position});
 const assigned=bedAssignments(p,positions),reachableBeds=assigned.size,animalCount=animals.length+1,missingBeds=Math.max(0,animalCount-reachableBeds),reasons:string[]=[];
 if(animalCount>12)reasons.push('这一版最多照顾12只动物');if(feedGap)reasons.push(`未来24小时生产粮还差${feedGap}份`);if(landGap)reasons.push(`可走土地还差${landGap}格`);if(missingBeds||!position)reasons.push('缺少每只动物可达的独立庇护位');if(p.layout.construction)reasons.push('请等当前建设完成');if(p.threat)reasons.push('请先完成当前守护事件');
 const risk=raidRisk([...animals.map(a=>({id:a.id,rarity:TIERS.indexOf(tierOf(a))+1})),next]);return {ok:!reasons.length,reasons,tier,price:V7_RULES.boxPrice[tier],coins:p.materials,dailyFeedDemand,feed,feedGap,landDemand,landAvailable:land,landGap,reachableBeds,animalCount,missingBeds,futureRaidBand:risk.band,version:p.v7?.revision??0,layoutVersion:p.layout.version,expectedCount:animals.length};
}
export type EstateValuation={label:'当前庄园估值';total:number;animals:number;buildings:number;equipment:number};
export function estateValuation(p:Profile):EstateValuation{
 let animals=0,buildings=0,equipment=0;const counts=new Map<string,number>(),seenAnimals=new Set<string>(),countedAssets=new Set<string>();
 for(const a of alive(p)){if(!a.id||seenAnimals.has(a.id)||countedAssets.has(a.id))continue;seenAnimals.add(a.id);countedAssets.add(a.id);const tier=tierOf(a),key=`sheep:${tier}`,n=counts.get(key)??0;animals+=V7_RULES.animalValue[tier]*(n<3?1:.2);counts.set(key,n+1);}
 const builtCounts=new Map<string,number>(),seenBuildings=new Set<string>(),allFootprints=p.layout.buildings.flatMap(b=>buildingFootprint(b).map(q=>`${q.x},${q.z}`));
 for(const b of p.layout.buildings){if(!b.id||seenBuildings.has(b.id)||countedAssets.has(b.id)||!Object.hasOwn(BUILDING_RULES,b.kind))continue;seenBuildings.add(b.id);const rule=BUILDING_RULES[b.kind],footprint=buildingFootprint(b);if(b.capacity!==rule.capacity||footprint.some(q=>!isOwned(p.layout,q)||terrainAt(q)==='deep'||(b.kind!=='ramp'&&terrainAt(q)!=='grass')||allFootprints.filter(key=>key===`${q.x},${q.z}`).length>1))continue;
  const approaches=buildingApproaches(p.layout,b);if(!approaches.some(q=>findActorPath(p.layout,p.position,q)))continue;if(b.kind==='shelter'&&!shelterEntries(p.layout).some(e=>e.buildingId===b.id))continue;countedAssets.add(b.id);const n=builtCounts.get(b.kind)??0;if(n<3)buildings+=rule.cost;builtCounts.set(b.kind,n+1);
 }
 const workshop=p.workshop;for(const [slot,amount] of [['cape',4],['shield',16]] as const){const id=workshop?.equipment[slot],item=workshop?.items.find(i=>i.id===id&&!i.destroyed&&i.recipe===slot);if(item&&!countedAssets.has(item.id)&&workshop?.assets.some(a=>a.id===item.assetId&&a.version===item.assetVersion)){countedAssets.add(item.id);equipment+=amount;}}
 return {label:'当前庄园估值',total:animals+buildings+equipment,animals,buildings,equipment};
}
export function v7Summary(p:Profile,_now:number){const animals=alive(p),dailyFeedDemand=2*animals.reduce((n,a)=>n+V7_RULES.feedPerCycle[tierOf(a)],0),productionFeed=p.v7?.productionFeed??0;return {version:p.v7?.revision??0,coins:p.materials,productionFeed,dailyFeedDemand,feedGap:Math.max(0,dailyFeedDemand-productionFeed),eggs:structuredClone(p.v7?.eggs??[]),valuation:estateValuation(p),landDemand:animals.reduce((n,a)=>n+V7_RULES.landPerAnimal[tierOf(a)],0),landAvailable:landAvailable(p),reachableBeds:currentBeds(p).size,animalCount:animals.length};}
export function v7Command(p:Profile,c:EstateCommand,now:number):{accepted:boolean;message:string}|null{
 if(!c.type.startsWith('v7-')||c.type==='v7-recover')return null;const s=ensureV7(p,now);if(typeof c.id!=='string'||!c.id||c.id.length>160)return {accepted:false,message:'事务编号无效'};if(Object.hasOwn(s.receipts,c.id))return {...s.receipts[c.id]};settleV7(p,now);
 const done=(accepted:boolean,message:string,change=false)=>{const receipt={accepted,message};Object.defineProperty(s.receipts,c.id,{value:receipt,enumerable:true,writable:true,configurable:true});if(change)s.revision++;return receipt;};
 if(c.type==='v7-buy-feed'){const packs=c.packs??1;if(!count(packs)||!Number.isSafeInteger(packs*10)||!Number.isSafeInteger(s.productionFeed+packs*10))return done(false,'请选择有效粮食数量');const cost=packs*10;if(p.materials<cost)return done(false,'游戏币不足');p.materials-=cost;s.productionFeed+=packs*10;return done(true,`购买${packs*10}份生产粮；健康食物仍免费`,true);}
 if(c.type==='v7-sell-wool'){
  if(!isTier(c.tier)||!count(c.amount)||!Number.isSafeInteger(c.amount*V7_RULES.sale[c.tier])||!Number.isSafeInteger(p.materials+c.amount*V7_RULES.sale[c.tier]))return done(false,'请选择有效出售数量');
  if(c.version!==undefined&&c.version!=='v6'&&c.version!=='v7')return done(false,'旧库存保留原兑换权；出售请选择V6或V7产物');
  let economy=migrateWoolLots(p.economy!);const tier=c.tier,amount=c.amount;
  if(c.version){const result=consumeWool(economy,{[tier]:amount},c.version);if(!result.accepted)return done(false,result.message);economy=result.economy;}
  else{const available=economy.lots!.filter(l=>l.tier===tier&&l.version!=='legacy').reduce((n,l)=>n+l.amount,0);if(available<amount)return done(false,'新版羊毛还不够；旧库存可单独兑换');let left=amount;for(const version of ['v7','v6'] as const){const take=Math.min(left,economy.lots!.filter(l=>l.tier===tier&&l.version===version).reduce((n,l)=>n+l.amount,0));if(take){economy=consumeWool(economy,{[tier]:take},version).economy;left-=take;}}}
  p.economy=economy;p.materials+=amount*V7_RULES.sale[tier];return done(true,`出售${amount}份羊毛，获得${amount*V7_RULES.sale[tier]}游戏币`,true);
 }
 if(c.type==='v7-synthesize'){
  const amount=c.amount??1;if(!isTier(c.tier)||c.tier==='gold'||!count(amount)||!Number.isSafeInteger(amount*3)||!Number.isSafeInteger(amount*2))return done(false,'请选择相邻品质与有效合成数量');if(p.materials<amount*2)return done(false,'合成需要每份2游戏币');const result=consumeWool(p.economy!,{[c.tier]:amount*3});if(!result.accepted)return done(false,result.message);const next=TIERS[TIERS.indexOf(c.tier)+1];p.economy=restoreWool(result.economy,[{id:`v7-synthesis-${c.id}`,tier:next,amount,animalId:null,version:'v7',source:`synthesis:${result.consumed.map(l=>l.id).join(',')}`}]);p.materials-=amount*2;return done(true,`3份相邻低阶毛与2游戏币合成1份，共${amount}份`,true);
 }
 if(c.type==='v7-buy-box'){
  if(c.species!=='sheep'||!isTier(c.tier))return done(false,'请选择明示品质的小羊领养箱');const price=V7_RULES.boxPrice[c.tier];if(p.materials<price)return done(false,'游戏币不足');p.materials-=price;s.eggs.push({id:`box-${c.id}`,species:'sheep',tier:c.tier,price,boughtAt:now,status:'boxed'});return done(true,'领养箱已保存；确认承载后才能孵化',true);
 }
 if(c.type==='v7-preview-hatch'){
  const egg=s.eggs.find(e=>e.id===c.boxId&&e.status==='boxed');if(!egg)return done(false,'待孵化领养箱不存在');s.preview={...previewHatch(p,egg.tier),boxId:egg.id};return done(true,'已预览承载，尚未孵化');
 }
 if(c.type==='v7-cancel-hatch'){delete s.preview;return done(true,'已取消预览，领养箱保留');}
 if(c.type==='v7-hatch'){
  const egg=s.eggs.find(e=>e.id===c.boxId&&e.status==='boxed');if(!egg)return done(false,'待孵化领养箱不存在');if(!s.preview||s.preview.boxId!==egg.id||s.preview.version!==c.expectedVersion)return done(false,'请先打开这只领养箱的最新承载预览');if(c.expectedVersion!==s.revision||c.expectedLayoutVersion!==p.layout.version||c.expectedCount!==alive(p).length)return done(false,'承载或版本已变化，请重新预览');const preview=previewHatch(p,egg.tier);if(!preview.ok)return done(false,preview.reasons.join('；'));const position=hatchPosition(p)!;const id=`animal-${p.id}-${p.runId??p.createdAt}-${egg.id}`;if(p.animals.some(a=>a.id===id))return done(false,'这只动物已经在家');const life=createLife(now,{ageMultiplier:p.id==='lab'?240:1}),husbandry=createHusbandry(now,p.id,life);husbandry.rarity=egg.tier;const index=alive(p).length;p.animals.push({id,name:`小羊${index+1}`,personality:(['eager','shy','independent'] as const)[index%3],preference:(['dance','love','bounce'] as const)[index%3],color:['#f4d99e','#d6d1e9','#e9bcad'][index%3],appearance:'plain',life,husbandry,position:{...position},path:[],following:false});s.clocks[id]={settledAt:now,cycle:0};egg.status='hatched';egg.animalId=id;delete s.preview;return done(true,`${egg.tier}品质小羊已孵化，生产从完整周期开始`,true);
 }
 return done(false,'未知V7经济操作');
}
