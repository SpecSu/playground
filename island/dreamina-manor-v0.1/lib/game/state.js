import{fishTankFit}from'./fish-space.js';
import{constructionView,reservedCells,startConstruction}from'./construction.js';
import {recordDiscovery,collectionVariants} from './collection.js';
import {INITIAL_LAND,docksHaveWater,validCell,cellKey,landCandidates,dockCandidates,canExtendTank,planWalk,pathDistance,allLandReachable,nearestDryPosition} from './grid.js';
import {ECONOMY,validTier} from './economy.js';
import {SPECIES_BY_ID} from './catalogue.js';
import {fishingWaitSeconds} from './fishing-time.js';
import {rollProduct} from './random.js';
export class GameError extends Error{constructor(code,message,status=409){super(message);this.name='GameError';this.code=code;this.status=status;}}
const fail=(code,msg,status)=>{throw new GameError(code,msg,status);};
export function normalizeUid(value){const uid=typeof value==='string'?value.trim().toLowerCase():'';if(!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(uid))fail('BAD_UID','庄园号用3到32位字母、数字或短横线就好',400);return uid;}
const has=(cells,p)=>cells.some(c=>c.x===p.x&&c.z===p.z);
const sameCell=(a,b)=>!!a&&!!b&&a.x===b.x&&a.z===b.z;
const targetKey=t=>`${t.kind}:${cellKey(t.cell)}`;
const jobAt=(s,t)=>s.jobs.find(j=>targetKey(j.target)===targetKey(t));
const itemById=(s,id)=>s.items.find(i=>i.id===id)??fail('ITEM_GONE','找不到这件东西了');
const isEmptyLand=(s,cell)=>has(s.land,cell)&&!has(s.tank,cell)&&!reservedCells(s,'tank').some(c=>sameCell(c,cell))&&!s.jobs.some(j=>j.target.kind==='land'&&sameCell(j.target.cell,cell))&&!s.items.some(i=>i.location.kind==='land'&&sameCell(i.location.cell,cell));
export function createGame(uid,now,config=ECONOMY){return {gameId:'manor-next',schemaVersion:1,fishHousingVersion:2,ownerUid:normalizeUid(uid),revision:0,createdAt:now,updatedAt:now,profile:{name:'',avatar:'milk-frog'},coins:config.startingCoins,seeds:[config.startingSeeds,0,0,0,0],baits:[0,0,0,0,0],land:structuredClone(INITIAL_LAND),docks:[],tank:[],jobs:[],items:[],discovered:{},discoveredVariants:{},position:{x:.5,z:.65},pending:null,firstPlantStarted:false,theftAvailableAt:0,activity:[],constructions:[]};}
export function canClaimEmergency(s,config=ECONOMY){return s.coins<config.inputCosts[0]&&s.seeds.every(n=>n===0)&&s.jobs.length===0;}
export function projectedPosition(s,now){
 const p=s.pending;if(!p?.path?.length)return {...s.position};
 const distance=pathDistance(p.path),ratio=Math.min(1,Math.max(0,(now-p.startedAt)/Math.max(1,p.arriveAt-p.startedAt)));let left=distance*ratio;
 for(let i=1;i<p.path.length;i++){const a=p.path[i-1],b=p.path[i],d=Math.hypot(b.x-a.x,b.z-a.z);if(left<=d&&d>0)return {x:a.x+(b.x-a.x)*left/d,z:a.z+(b.z-a.z)*left/d};left-=d;}
 return {...p.path.at(-1)};
}
function validateTarget(t){if(!t||!['land','dock','tank'].includes(t.kind)||!validCell(t.cell))fail('BAD_TARGET','换一个位置试试',400);}
function validateWork(s,action,target,tier,itemId,now,context,expectedJobId){
 validateTarget(target);const cfg=context.config??ECONOMY;
 if(action==='plant'){
  if(target.kind!=='land'||!isEmptyLand(s,target.cell))fail('OCCUPIED','这里已经有东西了');
  if(!validTier(tier))fail('BAD_TIER','请先选一颗种子',400);
  if(s.seeds[tier-1]<1)fail('NO_SEED','种子用完了，去商店看看');
 }else if(action==='fish'){
  if(target.kind!=='dock'||!has(s.docks,target.cell)||jobAt(s,target))fail('OCCUPIED','这里现在不能下饵');
  if(!validTier(tier))fail('BAD_TIER','请先选一份鱼饵',400);
  if(s.baits[tier-1]<1)fail('NO_BAIT','鱼饵用完了，去商店看看');
 }else if(action==='harvest'){
  const job=jobAt(s,target);if(!job)fail('NOTHING_READY','这里没有可收的东西');
  if(expectedJobId&&job.id!==expectedJobId)fail('TARGET_CHANGED','这里已经变了，重新点一下吧');
  if(now<job.readyAt)fail('NOT_READY','还要等一会儿');
 }else if(action==='display'){
  const item=itemById(s,itemId);if(!['bag','hand'].includes(item.location.kind))fail('ITEM_MOVED','东西已经挪走了');
  if(item.kind==='plant'){
   if(target.kind!=='land'||!isEmptyLand(s,target.cell))fail('OCCUPIED','这里已经有东西了');
  }else{
   if(target.kind!=='tank'||!has(s.tank,target.cell))fail('NO_TANK','先放一个鱼缸吧');
   if(s.items.filter(i=>i.location.kind==='tank').length>=s.tank.length*cfg.tankCapacityPerCell)fail('TANK_FULL','鱼缸满了，接一格就能继续放');
   const fit=fishTankFit(s,item);
   if(!context.approvedLegacyHousing&&(!fit.fitsFootprint||!fit.fitsHeight))throw Object.assign(new GameError('TANK_TOO_SMALL',`鱼缸至少需要 ${fit.requiredN}×${fit.requiredM} 格才能放下这条鱼`),{requiredNxN:fit.requiredNxN,requiredNxM:fit.requiredNxM});
  }
 }else if(action==='retrieve'){
  const item=itemById(s,itemId);if(!['land','tank'].includes(item.location.kind))fail('ITEM_MOVED','东西已经挪走了');
  if(item.location.kind==='land'&&(!sameCell(item.location.cell,target.cell)||target.kind!=='land'))fail('TARGET_CHANGED','重新点一下它吧');
  if(item.location.kind==='tank'&&(target.kind!=='tank'||!has(s.tank,target.cell)))fail('TARGET_CHANGED','重新点一下鱼缸吧');
 }else fail('BAD_ACTION','这次操作还不能用',400);
}
function hold(s,item){const hand=s.items.find(i=>i.location.kind==='hand');if(hand&&hand.id!==item.id)hand.location={kind:'bag'};item.location={kind:'hand'};}
export function applyCommand(original,command,context={}){
 if(original?.gameId!=='manor-next'||original.schemaVersion!==1)fail('CLIENT_UPGRADE_REQUIRED','更新一下页面，再继续玩吧',426);
 assertGame(original);const cfg=context.config??ECONOMY,now=context.now;if(!Number.isSafeInteger(now)||now<0)throw new Error('Server clock required');
 const s=structuredClone(constructionView(original,now)),c=!context._validateConstruction&&['expand-land','build-dock','build-tank'].includes(command.type)?{type:'construct',kind:command.type==='expand-land'?'land':command.type==='build-dock'?'dock':'tank',cells:command.cells??[command.cell]}:command;s.discoveredVariants=collectionVariants(s);let receipt={type:c.type};const newId=()=>context.newId?.()??crypto.randomUUID();
 const spend=amount=>{if(s.coins<amount)fail('NOT_ENOUGH_COINS',`还差${amount-s.coins}币`);s.coins-=amount;};
 switch(c.type){
 case 'buy-input':{
  if(!['seed','bait'].includes(c.kind)||!validTier(c.tier))fail('BAD_INPUT','请选择种子或鱼饵',400);
  spend(cfg.inputCosts[c.tier-1]);s[c.kind==='seed'?'seeds':'baits'][c.tier-1]++;receipt={...receipt,kind:c.kind,tier:c.tier};break;
 }
 case 'emergency-seed':{
  if(!canClaimEmergency(s,cfg))fail('RESCUE_UNAVAILABLE','你还有种子或等待收获的东西');s.seeds[0]++;break;
 }
 case 'begin-work':{
  if(c.catalogueVersion!==undefined&&![1,2].includes(c.catalogueVersion))fail('BAD_CATALOGUE','更新一下页面再种吧',400);
  validateWork(s,c.action,c.target,c.tier,c.itemId,now,context);
  const same=s.pending&&s.pending.action===c.action&&targetKey(s.pending.target)===targetKey(c.target)&&s.pending.tier===c.tier&&s.pending.itemId===c.itemId&&s.pending.destination===c.destination;
  if(same)return {state:original,receipt:{type:c.type,intentId:s.pending.id},changed:false};
  const from=projectedPosition(s,now),target={type:c.target.kind==='dock'?'dock':'land',cell:c.target.cell,workSide:c.target.kind==='land'};
  const paths=(c.target.kind==='tank'?s.tank.map(cell=>planWalk(s.land,s.docks,s.tank,from,{type:'land',cell},s)):[planWalk(s.land,s.docks,s.tank,from,target,s)]).filter(Boolean);const path=paths.sort((a,b)=>pathDistance(a)-pathDistance(b))[0];if(!path)fail('NO_PATH','现在走不到这里，换个位置吧');
  const arrival=now+Math.ceil(pathDistance(path)*cfg.walkSecondsPerCell*1000);
  const actionMs=c.action==='plant'?cfg.plantActionMs:['fish','display'].includes(c.action)?450:cfg.harvestActionMs;
  s.position=from;s.pending={id:newId(),...(context.operationId?{operationId:context.operationId}:{}),...(context.sessionId?{sessionId:context.sessionId}:{}),action:c.action,target:structuredClone(c.target),path,startedAt:now,arriveAt:arrival,finishAt:arrival+actionMs,...(c.tier?{tier:c.tier}:{}),...(c.action==='plant'&&c.catalogueVersion!==undefined?{catalogueVersion:c.catalogueVersion}:{}),...(c.itemId?{itemId:c.itemId}:{}),...(c.action==='harvest'?{jobId:jobAt(s,c.target).id}:{}),...(c.destination?{destination:c.destination}:{})};receipt={...receipt,intentId:s.pending.id};break;
 }
 case 'cancel-work':if(c.intentId&&s.pending?.id!==c.intentId)return {state:original,receipt:{type:c.type,cancelled:false},changed:false};s.position=projectedPosition(s,now);s.pending=null;receipt.cancelled=true;break;
 case 'finish-work':{
  const p=s.pending;if(!p||p.id!==c.intentId)fail('STALE_ACTION','这次操作已经结束了');
  if(now<p.finishAt)fail('STILL_APPROACHING','还没到，再等一下');
  validateWork(s,p.action,p.target,p.tier,p.itemId,now,context,p.jobId);
  if(p.action==='plant'||p.action==='fish'){
   const kind=p.action==='plant'?'plant':'fish';s[kind==='plant'?'seeds':'baits'][p.tier-1]--;
   const duration=kind==='fish'?fishingWaitSeconds(p.tier,context.seed,cfg):!s.firstPlantStarted?cfg.firstPlantSeconds:cfg.growSeconds[p.tier-1];
   if(kind==='plant')s.firstPlantStarted=true;
   const id=newId(),seed=context.seed;if(!Number.isSafeInteger(seed))throw new Error('Server random seed required');
   const product={...rollProduct(kind,p.tier,seed,`${id}-product`,now,cfg,p.catalogueVersion??1),sourceIntentId:p.id};
   s.jobs.push({id:`${id}-job`,target:p.target,inputTier:p.tier,seed,startedAt:now,readyAt:now+duration*1000,product});receipt={...receipt,action:p.action,jobId:`${id}-job`};
  }else if(p.action==='harvest'){
   const job=jobAt(s,p.target),item={...job.product,harvestedAt:now,location:{kind:'bag'}};s.jobs=s.jobs.filter(j=>j.id!==job.id);s.items.push(item);if(item.kind==='fish')hold(s,item);recordDiscovery(s,item);receipt={...receipt,action:'harvest',itemId:item.id};
  }else if(p.action==='display'){
   const item=itemById(s,p.itemId);item.location=item.kind==='fish'?{kind:'tank',placedAt:now}:{kind:'land',cell:structuredClone(p.target.cell)};receipt={...receipt,action:'display',itemId:item.id};
  }else if(p.action==='retrieve'){
   const item=itemById(s,p.itemId);if(p.destination==='hand')hold(s,item);else item.location={kind:'bag'};receipt={...receipt,action:'retrieve',itemId:item.id};
  }
  s.position={...p.path.at(-1)};s.pending=null;break;
 }
 case 'hold':{
  const item=itemById(s,c.itemId);if(!['bag','hand'].includes(item.location.kind))fail('WALK_TO_ITEM','先走过去拿起它吧');hold(s,item);receipt={...receipt,itemId:item.id};break;
 }
 case 'store-hand':{const item=s.items.find(i=>i.location.kind==='hand');if(item)item.location={kind:'bag'};break;}
 case 'sell':{
  const item=itemById(s,c.itemId);s.coins+=item.value;s.items=s.items.filter(i=>i.id!==item.id);receipt={...receipt,itemId:item.id,value:item.value};break;
 }
 case 'expand-land':{
  if(validCell(c.cell)&&!docksHaveWater([...s.land,c.cell],s.docks))fail('NO_WATER','给钓位留一片水面吧');
  if(!validCell(c.cell)||!has(landCandidates(s.land,s.docks),c.cell))fail('NOT_ADJACENT','选一块相邻的空位吧');spend(cfg.landPrice);s.land.push({...c.cell});break;
 }
 case 'build-dock':{
  if(validCell(c.cell)&&!docksHaveWater(s.land,[...s.docks,c.cell]))fail('NO_WATER','给钓位留一片水面吧');
  if(!validCell(c.cell)||!has(dockCandidates(s.land,s.docks),c.cell))fail('BAD_DOCK','选一处岸边或码头旁的空位吧');spend(cfg.dockPrice);s.docks.push({...c.cell});break;
 }
 case 'build-tank':{
  // Preserve old unacknowledged two-cell starter commands; new UI builds one cell.
  if(!Array.isArray(c.cells)||!(s.tank.length?[1]:[1,2]).includes(c.cells.length))fail('BAD_TANK_SIZE','选一块空地建鱼缸吧');
  const next=[...s.tank];for(const cell of c.cells){if(!validCell(cell)||!isEmptyLand(s,cell)||!canExtendTank(s.land,next,cell))fail('BAD_TANK_SITE','选两块相邻、空着的地吧');next.push({...cell});}
  const safePosition=nearestDryPosition(s.land,s.docks,next,projectedPosition(s,now));if(next.length>=s.land.length||!safePosition||!allLandReachable(s.land,s.docks,next,safePosition))fail('BLOCKED_PATH','留一块能走动的空地吧');
  spend(cfg.tankModulePrice*c.cells.length);s.tank=next;s.position=safePosition;s.pending=null;receipt={...receipt,capacity:next.length*cfg.tankCapacityPerCell};break;
 }
 case 'construct':{const build=startConstruction(s,c,{...context,now,_validateConstruction:true},applyCommand,fail);receipt={...receipt,constructionId:build.id,readyAt:build.readyAt};break;}
 case 'profile':{
  if(typeof c.name!=='string'||c.name.trim().length>20||typeof c.avatar!=='string'||c.avatar.length>32)fail('BAD_PROFILE','换个简短昵称试试',400);
  const ids=['milk-frog','niulai','feidudu','miaocuijiao','banana-cat','sword-shield-dog','human-lx','human-kelly','human-bear','human-subeike','human-jiji','human-jiaxin'];
  if(!ids.includes(c.avatar))fail('BAD_AVATAR','再选一次分身吧',400);s.profile={name:c.name.trim(),avatar:c.avatar};break;
 }
 default:fail('BAD_COMMAND','这次操作还不能用',400);
 }
 s.revision++;s.updatedAt=now;assertGame(s);return {state:s,receipt,changed:true};
}
export function assertGame(s){
 if(s?.gameId!=='manor-next'||s.schemaVersion!==1)throw new Error('Unknown game schema');
 if(!Number.isSafeInteger(s.coins)||s.coins<0)throw new Error('Invalid coins');
 for(const a of [s.seeds,s.baits])if(!Array.isArray(a)||a.length!==5||a.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Invalid consumables');
 for(const cells of [s.land,s.docks,s.tank])if(!Array.isArray(cells)||cells.some(c=>!validCell(c))||new Set(cells.map(cellKey)).size!==cells.length)throw new Error('Invalid cells');
 if(s.docks.some(c=>has(s.land,c))||s.tank.some(c=>!has(s.land,c)))throw new Error('Facility/land overlap');
 const ids=new Set(),occupancy=new Set();
 const verify=p=>{if(!p?.id||ids.has(p.id))throw new Error('Duplicated product');ids.add(p.id);const species=SPECIES_BY_ID[p.speciesId];if(!species||species.kind!==p.kind||!Number.isSafeInteger(p.value)||p.value<1||!Number.isFinite(p.finalSize)||p.finalSize<=0)throw new Error('Invalid product');};
 for(const job of s.jobs){verify(job.product);const key=targetKey(job.target);if(occupancy.has(key)||job.readyAt<job.startedAt||!Number.isSafeInteger(job.readyAt))throw new Error('Invalid job');occupancy.add(key);if(job.target.kind==='land'&&(!has(s.land,job.target.cell)||has(s.tank,job.target.cell)))throw new Error('Job off productive land');if(job.target.kind==='dock'&&!has(s.docks,job.target.cell))throw new Error('Job off dock');}
 let hands=0;for(const item of s.items){verify(item);const loc=item.location;if(!loc||!['bag','hand','land','tank'].includes(loc.kind))throw new Error('Orphaned item');if(loc.kind==='hand')hands++;if(loc.kind==='tank'&&(item.kind!=='fish'||!s.tank.length))throw new Error('Invalid aquarium item');if(loc.kind==='land'){if(item.kind!=='plant'||!has(s.land,loc.cell)||has(s.tank,loc.cell))throw new Error('Invalid display');const key=`land:${cellKey(loc.cell)}`;if(occupancy.has(key))throw new Error('Double cell occupancy');occupancy.add(key);}}
 for(const b of s.constructions??[]){if(!['land','dock','tank'].includes(b.kind)||!b.id||b.readyAt-b.startedAt!==12000||!Number.isSafeInteger(b.startedAt)||!b.cells?.length||b.cells.some(c=>!validCell(c)))throw new Error('Invalid construction');}
 if(hands>1)throw new Error('Multiple held objects');return true;
}
export function publicGame(s,now,{viewerUid=s.ownerUid}={}){
 s=constructionView(s,now);const self=viewerUid===s.ownerUid;
 return {demo:!!s.demo,...(s.demo?{demoLayoutVersion:s.demoLayoutVersion??1}:{}),gameId:s.gameId,schemaVersion:s.schemaVersion,ownerUid:s.ownerUid,revision:s.revision,serverNow:now,profile:structuredClone(s.profile),constructions:structuredClone(s.constructions??[]),land:structuredClone(s.land),docks:structuredClone(s.docks),tank:structuredClone(s.tank),jobs:s.jobs.map(({seed,...j})=>structuredClone(j)),items:structuredClone(self?s.items:s.items.filter(i=>i.location.kind!=='bag')),position:projectedPosition(s,now),...(self?{localSync:structuredClone(s.localSync??null),firstPlantStarted:s.firstPlantStarted,coins:s.coins,seeds:[...s.seeds],baits:[...s.baits],pending:structuredClone(s.pending),activity:structuredClone(s.activity),discovered:{...s.discovered},discoveredVariants:collectionVariants(s),theftAvailableAt:s.theftAvailableAt,canClaimEmergency:canClaimEmergency(s)}:{})};
}
