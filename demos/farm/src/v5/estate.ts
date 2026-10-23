import {foodSiteRating,FOOD_NUTRITION} from './food-resources.ts';
import {addFood,transferFood,takeFood,reconcileFood,foodQuality,normalizeFoodBatches,type FoodLedger} from './food-ledger.ts';
import {advanceLookout,startLookout,towerAccess,lookoutReservationSafe,type LookoutState} from './lookout.ts';
import {feedingApproach} from './action-sequence.ts';
import {encounterCommand,type EncounterState} from '../v7/encounter.ts';
import {v7Command,advanceV7Recovery,recoveryPoint,type V7State} from './v7-economy.ts';
import {observeV7Raid} from './v7-risk.ts';
import {initialOpening,advanceOpening,skipOpening,selectOpeningGuardian,completeOpening,type OpeningState} from './opening.ts';
import {advancePlayer,findPlayerPath} from './player-navigation.ts';
import {findActorPath} from './actor-navigation.ts';
import {createFarm,type Farm,type Avatar,type Action,type Personality} from '../model.ts';
import {createLayout,findPath,isWalkable,isPlayerWalkable,isOwned,regionAt,buildingApproaches,shelterEntries,INITIAL_ACTOR_POINTS,INITIAL_PLAYER_POINT,previewEdit,commitEdit,tickConstruction,cancelConstruction,type GridPoint,type Layout,type LayoutEdit} from './layout.ts';
import {createLife,settleOffline,advanceLife,maintenanceMeal,feedingResult,growthSummary,playWith,type LifeState} from './life.ts';
import {createThreat,stepThreat,guardianCommand,ensureOpeningThreat,type ThreatState,type GuardianKind} from './threat.ts';
import {createCreation,type CreationState,type CreationCommand,type WorkCapture} from './creation.ts';
import {applyEstateCreation,type CreationLayoutReceipt} from './creation-estate.ts';
import {newlyReachedLandmarks,hasUsefulDevelopment,type JourneyState} from './journey.ts';
import {ensureFarmCycle,settleFarmProducts,advanceFarmRaids,farmCycleCommand,finishFarmRaid,threatUpgrades,type FarmUpgrades} from './estate-cycle.ts';
import type {AnimalHusbandry,HerdEconomy} from './herd-economy.ts';
import type {RaidCycle} from './raid-cycle.ts';
import type {ProductionState} from './v6-production.ts';
import {ensureWorkshop,workshopCommand,workshopTactic,type WorkshopState} from './workshop.ts';
export type EstateAnimal={dining?:{troughId:string;to:GridPoint;phase:'walk'|'eat';elapsedMs:number};husbandry?:AnimalHusbandry;id:string;name:string;personality:Personality;preference:Action;color:string;appearance:'plain'|'starlit';life:LifeState;position:GridPoint;path:GridPoint[];following:boolean;memorial?:{at:number;eventId:string};restAssignment?:{buildingId:string;doorId:string;slot:number;door:GridPoint;phase:'walk'|'admitted';ordered:boolean;admitMs:number};offlineNeeds?:{pulseAt:number;hunger:number;energy:number}};
export type EstateJob={id:string;type:'feed'|'refill'|'delivery'|'survey';target?:string;food?:'milk'|'feed';progress:number;phase:'walk'|'act'|'out'|'unload'|'back';to:GridPoint;source?:GridPoint;rounds?:number;carried?:number};
export type Profile={foodLedger?:FoodLedger;encounter?:EncounterState;v7?:V7State;production?:ProductionState;workshop?:WorkshopState;economy?:HerdEconomy;upgrades?:FarmUpgrades;raidCycle?:RaidCycle;id:'home'|'lab';journey?:JourneyState;runId?:string;createdAt:number;lastSeenAt:number;lastPulseAt:number;onlineMs:number;session:string;opening?:OpeningState;openingActed?:boolean;openingRetreatMs?:number;tutorial:'choose'|'defend'|'done';materials:number;troughFood?:Record<string,number>;inventory:{hand:number;pantry:number;workbenchMs:number};layout:Layout;animals:EstateAnimal[];position:GridPoint;path:GridPoint[];steering?:{direction:GridPoint;at:number};job:EstateJob|null;guardian:GuardianKind|null;guardianAt:GridPoint;guardianBehavior?:'follow'|'station'|'patrol';guardianPath?:GridPoint[];guardianTarget?:GridPoint;guardianPatrolIndex?:number;guardianLookout?:LookoutState;guardianSwitchAt:number;guardianReadyMs:number;threat:ThreatState|null;lastThreat?:ThreatState;rescueIntent?:{target:string;findBack?:boolean;wolfId?:string};creation:CreationState;creationLayouts?:CreationLayoutReceipt[];milestones:string[];regions:string[];surveyed:boolean;assistance:boolean;nextEventCheckMs:number;lastPlayAt:number;sharedRhythm:boolean;notice:string;events:{id:string;text:string;at:number;layoutVersion?:number}[];factory:{stock:number;ms:number;at:number};lastVisual:{id:string;action:Action|'eat'|'rest';target:string;at:number}|null};
export type Estate={version:5;playerId:string;avatar:Avatar;activeProfile:'home'|'lab';profiles:{home:Profile;lab?:Profile};revision:number;legacy?:Farm};
export type EstateCommand={id:string;type:string;[key:string]:unknown};
export type EstateReply={state:Estate;accepted:boolean;message:string};
export type EstateSnapshot=Estate&{now:number;storage:'local-sqlite';profile:Profile};
export const GUARDIAN_LABEL:Record<GuardianKind,string>={dog:'刀盾狗',cat:'喵脆角',frog:'奶蛙'};
export function currentProfile(s:Estate):Profile{return s.profiles[s.activeProfile]!;}
function freshProfile(owner:string,id:'home'|'lab',now:number,legacy?:Farm):Profile{
 const old=legacy??createFarm(owner,now),layout=createLayout();
 const spawn=[...INITIAL_ACTOR_POINTS,...layout.owned.filter(q=>regionAt(q)==='pen'&&isWalkable(layout,q)&&!INITIAL_ACTOR_POINTS.some(a=>a.x===q.x&&a.z===q.z))];
 const animals:EstateAnimal[]=old.animals.map((a,i)=>{
  const life=createLife(now,{legacyBond:a.bond,legacyHabits:a.habits,ageMultiplier:id==='lab'?240:1});
  life.memory=(a.experiences??[]).map(e=>({kind:'legacy',text:e.text,at:e.at}));
  return {id:id==='lab'?`lab-${a.id}`:a.id,name:a.name,personality:a.personality,preference:a.preference,color:a.color,appearance:a.appearance,life,position:{...(spawn[i]??INITIAL_ACTOR_POINTS[0])},path:[],following:false};
 });
 const p:Profile={id,createdAt:now,lastSeenAt:now,lastPulseAt:now,onlineMs:0,session:'',opening:initialOpening('choose'),tutorial:'choose',materials:60,troughFood:{},inventory:{hand:3,pantry:3,workbenchMs:0},layout,animals,position:{...INITIAL_PLAYER_POINT},path:[],job:null,guardian:null,guardianAt:{x:5,z:5},guardianBehavior:'patrol',guardianPath:[],guardianPatrolIndex:0,guardianSwitchAt:0,guardianReadyMs:0,threat:createThreat({id:`${id}-opening`,seed:17,mode:'tutorial',actors:animals.map(a=>({id:a.id,position:a.position})),guardianPosition:{x:5,z:5}},layout),creation:createCreation(owner,id),milestones:[],regions:[],surveyed:false,assistance:false,nextEventCheckMs:1_200_000,lastPlayAt:0,sharedRhythm:false,notice:'选一位伙伴，陪幼崽守住小家',events:[],factory:{stock:0,ms:0,at:now},lastVisual:null};ensureFarmCycle(p,now);ensureWorkshop(p,now);return p;
}
export function createEstate(owner:string,now:number,legacy?:Farm):Estate{return {version:5,playerId:owner,avatar:legacy?.avatar??'human-lx',activeProfile:'home',profiles:{home:freshProfile(owner,'home',now,legacy)},revision:0,...(legacy?{legacy:structuredClone(legacy)}:{})};}
export function estateSnapshot(s:Estate,now:number):EstateSnapshot{return {...structuredClone(s),now,storage:'local-sqlite',profile:structuredClone(currentProfile(s))};}
function remember(p:Profile,id:string,text:string,now:number){p.events=[...p.events,{id,text,at:now,layoutVersion:p.layout.version}].slice(-60);p.notice=text;}
function milestone(p:Profile,id:string,amount:number,text:string,now:number){if(p.milestones.includes(id))return;p.milestones.push(id);p.materials+=amount;remember(p,id,text,now);}
const dist=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const cell=(a:GridPoint)=>({x:Math.round(a.x),z:Math.round(a.z)});
function pathTo(p:Profile,to:GridPoint){return findPlayerPath(p.layout,p.position,cell(to));}
function nearestApproach(p:Profile,target:GridPoint){return [{x:Math.round(target.x),z:Math.round(target.z)},...[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>({x:Math.round(target.x)+x,z:Math.round(target.z)+z}))].filter(q=>isWalkable(p.layout,q)).map(q=>({q,path:pathTo(p,q)})).filter(v=>v.path).sort((a,b)=>a.path!.length-b.path!.length)[0];}
function walk(position:GridPoint,path:GridPoint[],distance:number):boolean{let moved=false;while(path.length&&distance>0){const next=path[0],length=dist(position,next);if(length<.001){path.shift();continue;}const amount=Math.min(length,distance);position.x+=(next.x-position.x)/length*amount;position.z+=(next.z-position.z)/length*amount;distance-=amount;moved=true;if(amount===length)path.shift();}return moved;}
export function ensureFoodLedger(p:Profile):FoodLedger{
 const old=p.foodLedger;
 const l:FoodLedger={factory:normalizeFoodBatches(old?.factory),hand:normalizeFoodBatches(old?.hand),pantry:normalizeFoodBatches(old?.pantry),carried:normalizeFoodBatches(old?.carried),troughs:{}};
 if(old?.troughs&&typeof old.troughs==='object'&&!Array.isArray(old.troughs))for(const [id,batches] of Object.entries(old.troughs))l.troughs[id]=normalizeFoodBatches(batches);
 p.foodLedger=l;
 reconcileFood(l.factory,p.factory.stock);reconcileFood(l.hand,p.inventory.hand);reconcileFood(l.pantry,p.inventory.pantry);reconcileFood(l.carried,p.job?.type==='delivery'?(p.job.carried??0):0);
 for(const [id,n] of Object.entries(p.troughFood??{}))reconcileFood(l.troughs[id]??=[],n);
 return l;
}
function produceFood(p:Profile,elapsed:number){
 const f=p.layout.buildings.find(b=>b.kind==='factory');if(!f)return;
 const l=ensureFoodLedger(p),rules=foodSiteRating(f,p.layout).production,capacity=12-(p.job?.type==='delivery'?(p.job.carried??0):0);
 if(p.factory.stock>=capacity){p.factory.ms=0;return;}
 const total=p.factory.ms+elapsed,batches=Math.floor(total/rules.intervalMs),n=Math.max(0,Math.min(capacity-p.factory.stock,batches*rules.batchSize));
 addFood(l.factory,n,rules.quality);p.factory.stock+=n;p.factory.ms=p.factory.stock>=capacity?0:total-batches*rules.intervalMs;
}
function cancelDining(a:EstateAnimal){if(a.dining){delete a.dining;a.path=[];}}
/** Reserve inventory and a distinct reachable approach, without debiting until eaten. */
function advanceDining(p:Profile,a:EstateAnimal,now:number,dtMs:number):boolean{
 const reserved=(id:string)=>p.animals.filter(other=>other!==a&&other.dining?.troughId===id);
 if(a.dining){
  const d=a.dining,t=p.layout.buildings.find(b=>b.id===d.troughId&&b.kind==='trough');
  const prior=p.animals.slice(0,p.animals.indexOf(a)).filter(other=>other.dining?.troughId===d.troughId).length;
  if(!t||!buildingApproaches(p.layout,t).some(q=>dist(q,d.to)<.001)||(p.troughFood?.[d.troughId]??0)<=prior||a.life.hunger>=70)cancelDining(a);
 }
 if(!a.dining&&a.life.hunger<=40){
  const choices=p.layout.buildings.filter(b=>b.kind==='trough'&&(p.troughFood?.[b.id]??0)>reserved(b.id).length).flatMap(t=>buildingApproaches(p.layout,t).flatMap(to=>{
   if(p.animals.some(other=>other!==a&&!other.memorial&&(other.dining&&dist(other.dining.to,to)<.1||dist(other.position,to)<.35)))return [];
   const route=findActorPath(p.layout,a.position,to);return route?[{t,to,route}]:[];
  })).sort((x,y)=>x.route.length-y.route.length||x.t.id.localeCompare(y.t.id));
  const best=choices[0];if(best){a.dining={troughId:best.t.id,to:{...best.to},phase:'walk',elapsedMs:0};a.path=best.route.slice(1);}
 }
 const d=a.dining;if(!d)return false;
 const route=findActorPath(p.layout,a.position,d.to);
 if(!route){cancelDining(a);return false;}
 a.path=route.slice(1);
 const speed=a.personality==='shy'?.6:a.personality==='eager'?1.15:.9;
 let length=0,from=a.position;for(const q of a.path){length+=dist(from,q);from=q;}
 const moved=walk(a.position,a.path,dtMs/1000*speed);
 a.life=advanceLife(a.life,{now,dtMs,sessionId:p.session,moving:moved});
 if(!a.path.length&&dist(a.position,d.to)<.02){
  d.phase='eat';d.elapsedMs+=Math.max(0,dtMs-length/speed*1000);
  if(d.elapsedMs>=3000){
   const l=ensureFoodLedger(p),stock=p.troughFood?.[d.troughId]??0;
   if(stock>0){const quality=foodQuality(l.troughs[d.troughId]);takeFood(l.troughs[d.troughId],1);p.troughFood![d.troughId]=stock-1;a.life=maintenanceMeal(a.life,FOOD_NUTRITION[quality]);p.lastVisual={id:`dining-${a.id}-${now}`,action:'eat',target:a.id,at:now};}
   cancelDining(a);
  }
 }else{d.phase='walk';d.elapsedMs=0;}
 return true;
}
function cancelJob(p:Profile){const ledger=ensureFoodLedger(p);delete p.steering;if(p.job?.type==='delivery'&&p.job.carried){transferFood(ledger.carried,ledger.factory,p.job.carried);p.factory.stock+=p.job.carried;p.job.carried=0;}p.job=null;p.path=[];}
/** Release a certified slot and reset unfinished rest; completed records remain. */
export function releaseRest(p:Profile,animalId?:string):void{
 for(const a of p.animals){
  if(animalId!==undefined&&a.id!==animalId)continue;
  const assignment=a.restAssignment;
  if(assignment){
   if(assignment.phase==='admitted'&&isWalkable(p.layout,assignment.door))a.position={...assignment.door};
   a.path=[];delete a.restAssignment;
  }
  a.life.rest={bedId:null,sessionId:null,elapsedMs:0,completed:false};
 }
}
/** Reserve shared building capacity first, then route to one actual open door. */
export function requestRest(p:Profile,animalId:string,ordered=true):{ok:boolean;message:string}{
 const a=p.animals.find(a=>a.id===animalId);
 if(!a||a.memorial)return {ok:false,message:'先选一只在家的羊'};
 if(p.threat)return {ok:false,message:'先结束当前守护事件，再安排日常休息'};
 if(p.job?.type==='feed'&&p.job.target===animalId)return {ok:false,message:'先完成或取消这次喂食'};
 if(a.restAssignment){a.restAssignment.ordered ||= ordered;return {ok:true,message:'已经安排了安全休息位'};}
 const choices=shelterEntries(p.layout).flatMap(entry=>{
  const used=new Set(p.animals.filter(other=>other.restAssignment?.buildingId===entry.buildingId).map(other=>other.restAssignment!.slot));
  const slot=Array.from({length:entry.capacity},(_,i)=>i).find(i=>!used.has(i));
  if(slot===undefined)return [];
  const path=findActorPath(p.layout,a.position,{x:entry.x,z:entry.z})?.slice(1);
  return path?[{entry,slot,path}]:[];
 }).sort((a,b)=>a.path.length-b.path.length||a.entry.doorId.localeCompare(b.entry.doorId));
 const best=choices[0];if(!best)return {ok:false,message:'没有空闲且可达的安全休息位'};
 cancelDining(a);a.following=false;a.path=best.path;
 a.restAssignment={buildingId:best.entry.buildingId,doorId:best.entry.doorId,slot:best.slot,door:{x:best.entry.x,z:best.entry.z},phase:'walk',ordered,admitMs:0};
 return {ok:true,message:'已预约床位，沿入口回棚后安稳休息60秒'};
}
/** One offline absence retains its needs baseline across GETs and stale pulses. */
export function settleProfileOffline(p:Profile,now:number):void{
 for(const r of Object.values(p.v7?.recovery??{})){r.remainingOnlineMs=3000;r.lastOnlineMs=p.onlineMs;}
 if(!Number.isFinite(now)||now<=p.lastPulseAt)return;
 ensureFoodLedger(p);for(const a of p.animals)cancelDining(a);
 if(p.job?.type==='feed'){cancelJob(p);p.notice='喂食已暂停，食物还在背包里，回来后可重新喂';}
 ensureFarmCycle(p,now);
 for(const a of p.animals){
  if(a.memorial||now<=a.life.lastSettledAt)continue;
  a.offlineNeeds??={pulseAt:a.life.lastSettledAt,hunger:a.life.hunger,energy:a.life.energy};
  const baseline=a.offlineNeeds;
  a.life=settleOffline({...a.life,lastSettledAt:baseline.pulseAt,hunger:baseline.hunger,energy:baseline.energy},now);
 }
 if(now>p.factory.at){produceFood(p,now-p.factory.at);p.factory.at=now;}
}
export function settleEstate(original:Estate,now:number):Estate{
 const s=structuredClone(original);if(!Number.isFinite(now))return s;
 for(const p of Object.values(s.profiles)){
  if(!p)continue;
  ensureFarmCycle(p,now);ensureWorkshop(p,now);
  if(now-p.lastPulseAt>5000)settleProfileOffline(p,now);
  settleFarmProducts(p,now);
  if(p.id===s.activeProfile)p.lastSeenAt=Math.max(p.lastSeenAt,now);
 }
 return s;
}
function tick(p:Profile,now:number,dtMs:number,presentation?:{ready?:boolean;covered:boolean}){
 if(!Number.isFinite(now)||!Number.isFinite(dtMs)||now<p.lastPulseAt)return;
 const elapsed=now-p.lastPulseAt;
 if(elapsed>5000){settleProfileOffline(p,now);p.lastSeenAt=now;p.lastPulseAt=now;return;}
 dtMs=Math.min(1500,Math.max(0,dtMs),elapsed);if(!dtMs)return;
 ensureFarmCycle(p,now);ensureFoodLedger(p);
 if(p.tutorial==='done'&&p.threat&&(presentation?.ready===false||presentation?.covered)){p.lastSeenAt=now;p.lastPulseAt=now;delete p.steering;return;}
 if(p.tutorial!=='done'&&p.opening){
  const previousStage=p.opening.stage;p.opening=advanceOpening(p.opening,dtMs/1000,{ready:presentation?.ready===true,visible:true,covered:presentation?.covered===true});
  if(presentation?.ready!==true||presentation?.covered===true||p.opening.stage!=='defend'||previousStage==='arrival'||!p.openingActed){if(presentation?.ready===true&&!presentation.covered){if(p.steering&&now-p.steering.at<=700)p.position=advancePlayer(p.layout,p.position,p.steering.direction,dtMs/1000*2.4);else walk(p.position,p.path,dtMs/1000*2.4);}p.lastSeenAt=now;p.lastPulseAt=now;return;}
 }
 const seconds=dtMs/1000,previousOnline=p.onlineMs,event=p.threat,guardianReadyBefore=p.guardianReadyMs;
 if(event?.phase==='complete'&&p.tutorial==='defend'&&p.opening){p.openingRetreatMs=Math.min(3000,(p.openingRetreatMs??0)+dtMs);if(p.openingRetreatMs>=3000)p.opening=completeOpening(p.opening);}
 p.onlineMs+=dtMs;p.lastSeenAt=now;p.lastPulseAt=now;p.factory.at=now;
 for(const a of p.animals)delete a.offlineNeeds;
 const productionBeforeBuild=!event&&p.layout.construction?Math.min(dtMs,Math.max(0,p.layout.construction.durationMs-p.layout.construction.elapsedMs)):0;
 if(productionBeforeBuild>0)produceFood(p,productionBeforeBuild);
 if(!event){const built=tickConstruction(p.layout,dtMs);p.layout=built.layout;p.materials+=built.materialDelta;if(built.completed){remember(p,`built-${p.layout.version}`,'布置完成，新的路线已经生效',now);if(hasUsefulDevelopment(p)&&!p.milestones.includes('journey-developed'))p.milestones.push('journey-developed');}}
 if(p.guardianReadyMs>0)p.guardianReadyMs=Math.max(0,p.guardianReadyMs-dtMs);
 for(const [id,stock] of Object.entries(p.troughFood??{})){if(!p.layout.buildings.some(b=>b.kind==='trough'&&b.id===id)){transferFood(p.foodLedger!.troughs[id]??[],p.foodLedger!.pantry,stock);p.inventory.pantry+=stock;delete p.troughFood![id];delete p.foodLedger!.troughs[id];}}
 p.inventory.workbenchMs+=dtMs;while(p.inventory.workbenchMs>=30_000){p.inventory.workbenchMs-=30_000;const n=Math.max(0,Math.min(3,12-p.inventory.pantry));addFood(p.foodLedger!.pantry,n);p.inventory.pantry+=n;}
 if(dtMs>productionBeforeBuild)produceFood(p,dtMs-productionBeforeBuild);
 if(event)for(const a of p.animals)cancelDining(a);
 const feedTarget=p.job?.type==='feed'?p.job.target:undefined;
 if(p.job?.type==='feed'){
  const target=p.animals.find(a=>a.id===p.job!.target);
  const check=target&&feedingResult(target.life,{now,food:p.job.food!,manual:true});
  if(!target||!check?.accepted||p.inventory.hand<1){p.notice=check?.message??'目标或食物已变化，食物没有扣除';cancelJob(p);}
 }
 if(!event&&p.job?.type==='delivery'){
  const job=p.job;
  const trough=p.layout.buildings.find(b=>b.kind==='trough'&&(job.target?b.id===job.target:buildingApproaches(p.layout,b).some(q=>dist(q,job.to)<.001)));
  if(!trough){cancelJob(p);p.notice='配送食槽已不存在，手持食物已退回工厂';}
  else if(!buildingApproaches(p.layout,trough).some(q=>dist(q,job.to)<.001)){cancelJob(p);p.notice='食槽入口已变化，手持食物已退回工厂';}
  else if(job.phase!=='back'&&(p.troughFood?.[trough.id]??0)>=trough.capacity){cancelJob(p);p.notice='食槽已满，手持食物已退回工厂';}
  else job.target=trough.id;
 }
 if(p.path.some(q=>!isPlayerWalkable(p.layout,cell(q)))){cancelJob(p);p.notice='行走路线已变化，请重新选择';}
 const speed=p.job?.type==='delivery'?1:2.4;
 let routeDistance=0,previous=p.position;for(const point of p.path){routeDistance+=dist(previous,point);previous=point;}
 const recoveryStartPosition={...p.position};
 const mayWalk=!event||!p.job;
 if(p.steering&&now-p.steering.at>700)delete p.steering;
 if(mayWalk){if(p.steering)p.position=advancePlayer(p.layout,p.position,p.steering.direction,seconds*speed);else walk(p.position,p.path,seconds*speed);}
 const actionMs=mayWalk?Math.max(0,dtMs-routeDistance/speed*1000):0;
 if(event){
  observeV7Raid(p,event);
  const recoveryAuthorizedActorId=advanceV7Recovery(p,dtMs,presentation?.ready===true&&!presentation.covered,recoveryStartPosition);
  for(const a of p.animals)if(a.restAssignment)releaseRest(p,a.id);
  const before=new Map(p.animals.map(a=>[a.id,{...a.position}]));
  const rescue=p.rescueIntent;
  p.threat=stepThreat(event,p.layout,{dt:seconds,playerPosition:p.position,rescueActorId:rescue?.target,findBackActorId:rescue?.findBack?rescue.target:undefined,driveOff:rescue?.wolfId,recoveryAuthorizedActorId});
  observeV7Raid(p,p.threat);
  for(const a of p.animals){
   if(a.memorial){a.path=[];a.following=false;continue;}
   const actor=p.threat.actors.find(actor=>actor.id===a.id);a.path=[];
   if(actor)a.position={...actor.position};
   const moved=!!actor&&dist(before.get(a.id)!,actor.position)>.001;
   const safe=actor?.status==='safe'&&actor.reservation?`event:${actor.reservation.buildingId}:${actor.reservation.slot}`:null;
   a.life=advanceLife(a.life,{now,dtMs,sessionId:p.session,moving:moved,safeBedId:safe});
  }
  if(p.threat.guardian){p.guardianAt={...p.threat.guardian.position};p.guardianLookout=p.threat.guardian.lookout?structuredClone(p.threat.guardian.lookout):undefined;}
 }else{
  advanceV7Recovery(p,dtMs,presentation?.ready===true&&!presentation.covered,recoveryStartPosition);
  const entries=shelterEntries(p.layout),slots=new Set<string>(),servedDoors=new Set<string>();
  for(const a of p.animals){
   const r=a.restAssignment;if(!r)continue;
   const entry=entries.find(e=>e.buildingId===r.buildingId&&e.doorId===r.doorId);
   const key=`${r.buildingId}:${r.slot}`;
   if(!entry||!Number.isSafeInteger(r.slot)||r.slot<0||r.slot>=entry.capacity||slots.has(key)
    ||entry.x!==r.door.x||entry.z!==r.door.z||(r.phase==='admitted'&&dist(a.position,r.door)>.02))releaseRest(p,a.id);
   else slots.add(key);
  }
  for(const a of p.animals){
   if(a.memorial){cancelDining(a);releaseRest(p,a.id);a.path=[];a.following=false;continue;}
   if(a.id===feedTarget){cancelDining(a);a.path=[];a.life=advanceLife(a.life,{now,dtMs,sessionId:p.session});continue;}
   if(p.v7?.recovery[a.id]){cancelDining(a);a.path=[];a.following=false;a.life=advanceLife(a.life,{now,dtMs,sessionId:p.session});continue;}
   if(a.following||a.restAssignment)cancelDining(a);
   if(!a.restAssignment&&a.life.energy<30)requestRest(p,a.id,false);
   if(!a.following&&!a.restAssignment&&advanceDining(p,a,now,dtMs))continue;
   let r=a.restAssignment,target:GridPoint|undefined;
   if(r&&r.phase==='walk'){
    if(!a.path.length&&dist(a.position,r.door)>.02){const route=findActorPath(p.layout,a.position,r.door);if(route)a.path=route.slice(1);else releaseRest(p,a.id);}
   }else if(!r){
    if(a.following){if(dist(a.position,p.position)>1.6)target=cell(p.position);else a.path=[];}
    else if(a.life.energy>=30&&!a.path.length&&Math.floor(p.onlineMs/5000)!==Math.floor(previousOnline/5000)){
     const region=a.life.stage==='baby'?'pen':'meadow';const options=p.layout.owned.filter(q=>regionAt(q)===region&&isWalkable(p.layout,q));
     target=options[(Math.floor(p.onlineMs/5000)+p.animals.indexOf(a)*7)%options.length];
    }
    if(target){const route=findActorPath(p.layout,a.position,target);if(route)a.path=route.slice(1);}
   }
   r=a.restAssignment;
   let length=0,from=a.position;for(const point of a.path){length+=dist(from,point);from=point;}
   const animalSpeed=a.personality==='shy'?.6:a.personality==='eager'?1.15:.9;
   if(a.path.some(q=>!isWalkable(p.layout,q))){const target=a.path.at(-1);a.path=target?findActorPath(p.layout,a.position,target)?.slice(1)??[]:[];if(!a.path.length)p.notice='有一段动物路线被施工挡住，已停下等待新路线';}
   const moved=walk(a.position,a.path,seconds*animalSpeed),movingMs=moved?Math.min(dtMs,length/animalSpeed*1000):0;
   let safeMs=r?.phase==='admitted'?dtMs:0;
   if(r?.phase==='walk'&&!a.path.length&&dist(a.position,r.door)<.02&&!servedDoors.has(r.doorId)){
    servedDoors.add(r.doorId);
    const available=dtMs-movingMs,needed=Math.max(0,1000-r.admitMs);
    r.admitMs=Math.min(1000,r.admitMs+available);
    if(r.admitMs>=1000){r.phase='admitted';a.position={...r.door};safeMs=Math.max(0,available-needed);}
   }
   const exploring=!r&&regionAt(cell(a.position))==='meadow',withPlayer=dist(a.position,p.position)<3;
   if(movingMs>0)a.life=advanceLife(a.life,{now,dtMs:movingMs,sessionId:p.session,moving:true,exploring,withPlayer});
   const waitingMs=Math.max(0,dtMs-movingMs-safeMs);
   if(waitingMs>0)a.life=advanceLife(a.life,{now,dtMs:waitingMs,sessionId:p.session,exploring,withPlayer});
   if(safeMs>0&&r)a.life=advanceLife(a.life,{now,dtMs:safeMs,sessionId:p.session,safeBedId:`${r.buildingId}:${r.slot}`});
   if(r?.phase==='admitted'&&!r.ordered&&a.life.energy>=95&&a.life.rest.completed)releaseRest(p,a.id);
  }
 }
 if(!event&&p.job&&!p.path.length){const job=p.job;
  if(job.type==='feed'){
   const a=p.animals.find(a=>a.id===job.target);
   if(!a||dist(p.position,a.position)>1.1||p.inventory.hand<1){cancelJob(p);p.notice='目标走远了，食物还在背包里';}
   else {job.phase='act';job.progress+=actionMs;if(job.progress>=3000){
    const result=feedingResult(a.life,{now,food:job.food!,manual:true,nutrition:FOOD_NUTRITION[foodQuality(p.foodLedger!.hand)]});
    if(result.accepted){a.life=result.life;takeFood(p.foodLedger!.hand,1);p.inventory.hand--;p.lastVisual={id:job.id,action:'eat',target:a.id,at:now};remember(p,job.id,`${a.name}吃到了${job.food==='milk'?'奶':'饲料'} · ${result.message}`,now);
     if(!p.milestones.includes(`fed-${a.id}`))p.milestones.push(`fed-${a.id}`);
     if(p.animals.every(animal=>p.milestones.includes(`fed-${animal.id}`)))milestone(p,'first-meal',8,'第一顿完成 · +8金币',now);
    }else p.notice=result.message;
    cancelJob(p);
   }}
  }else if(job.type==='refill'){
   const trough=job.target?p.layout.buildings.find(b=>b.id===job.target&&b.kind==='trough'):undefined;
   if(job.target&&(!trough||!buildingApproaches(p.layout,trough).some(q=>dist(q,p.position)<.02))){cancelJob(p);p.notice='食槽或取食位置已变化，食物没有扣除';}
   else {job.progress+=actionMs;if(job.progress>=2000){
    const available=job.target?(p.troughFood?.[job.target]??0):p.inventory.pantry,n=Math.max(0,Math.min(3-p.inventory.hand,available));
    transferFood(job.target?(p.foodLedger!.troughs[job.target]??=[]):p.foodLedger!.pantry,p.foodLedger!.hand,n);
    if(job.target){p.troughFood??={};p.troughFood[job.target]=available-n;}else p.inventory.pantry-=n;
    p.inventory.hand+=n;p.notice=n?`从${job.target?'食槽':'工作台'}补充了${n}份食物`:job.target?'食槽暂时没有食物，可以从工作台免费补充':'工作台正在准备，基础食物免费';cancelJob(p);
   }}
  }
  else if(job.type==='survey'){job.progress+=actionMs;if(job.progress>=5000){p.surveyed=true;p.notice='边界勘察完成，可预览相邻36格';cancelJob(p);}}
  else if(job.type==='delivery'){
   if(job.phase==='walk'){
    const source=job.source;
    if(!source||dist(p.position,source)>.02||!p.layout.buildings.some(b=>b.kind==='factory'&&buildingApproaches(p.layout,b).some(q=>dist(q,source)<.001))){cancelJob(p);p.notice='工厂装货位置已变化，食物仍在工厂';}
    else {job.progress+=actionMs;if(job.progress>=2000){
     job.carried=Math.min(3,p.factory.stock);transferFood(p.foodLedger!.factory,p.foodLedger!.carried,job.carried);p.factory.stock-=job.carried;job.progress=0;job.phase='out';
     const route=job.carried>0?pathTo(p,job.to):null;
     if(route)p.path=route;else {const held=job.carried;cancelJob(p);p.notice=held?'配送断路，食物退回工厂':'工厂暂时没有可配送的食物';}
    }}
   }else if(job.phase==='out'||job.phase==='unload'){
    const trough=p.layout.buildings.find(b=>b.id===job.target&&b.kind==='trough');
    if(!trough||dist(p.position,job.to)>.02){cancelJob(p);p.notice='配送目标已变化，食物退回工厂';}
    else {job.phase='unload';job.progress+=actionMs;if(job.progress>=2000){
     p.troughFood??={};const stored=p.troughFood[trough.id]??0,carried=job.carried??0;
     const unloaded=Math.max(0,Math.min(trough.capacity-stored,carried));
     transferFood(p.foodLedger!.carried,p.foodLedger!.troughs[trough.id]??=[],unloaded);p.troughFood[trough.id]=stored+unloaded;job.carried=carried-unloaded;
     if(p.troughFood[trough.id]>=trough.capacity)job.rounds=1;
     p.notice=job.carried?`食槽已满，卸下${unloaded}份，剩余${job.carried}份带回工厂`:`向食槽卸下${unloaded}份食物`;
     job.phase='back';job.progress=0;
     const route=job.source?pathTo(p,job.source):null;
     if(route)p.path=route;else {cancelJob(p);p.notice='返回路线已断，剩余食物退回工厂一次';}
    }}
   }else if(job.phase==='back'){
    const returned=job.carried??0;if(returned){transferFood(p.foodLedger!.carried,p.foodLedger!.factory,returned);p.factory.stock+=returned;job.carried=0;}
    job.rounds=(job.rounds??1)-1;
    if(job.rounds>0&&p.factory.stock>0){job.phase='walk';job.progress=0;}
    else {cancelJob(p);p.notice=returned?`配送结束，剩余${returned}份食物已退回工厂`:'配送完成，LX回到工厂';}
   }
  }
 }
 const lookoutWasActive=!event&&!!p.guardianLookout&&p.guardianLookout.phase!=='done';
 if(lookoutWasActive){const next=advanceLookout(p.layout,p.guardianLookout,Math.max(0,dtMs-guardianReadyBefore));if(next){p.guardianLookout=next;p.guardianAt={...next.position};p.guardianPath=[];}}
 if(!event&&!lookoutWasActive&&p.guardian&&p.guardianReadyMs===0&&(!p.guardianLookout||p.guardianLookout.phase==='done')&&isWalkable(p.layout,cell(p.guardianAt))){
  const movementMs=Math.max(0,dtMs-guardianReadyBefore),behavior=p.guardianBehavior??'patrol';
  p.guardianBehavior=behavior;p.guardianPath??=[];
  if(p.guardianPath.some(q=>!isWalkable(p.layout,q)))p.guardianPath=[];
  if(behavior==='follow'){
   const target=cell(p.position),last=p.guardianPath.at(-1);
   if(dist(p.guardianAt,p.position)<=1.8+1e-9)p.guardianPath=[];
   else if(!last||dist(last,target)>.001)p.guardianPath=findActorPath(p.layout,p.guardianAt,target)?.slice(1)??[];
   p.guardianTarget=target;
  }else if(behavior==='station'){
   const target=p.guardianTarget;
   if(target&&dist(p.guardianAt,target)>.001&&!p.guardianPath.length)p.guardianPath=findActorPath(p.layout,p.guardianAt,target)?.slice(1)??[];
  }else if(!p.guardianPath.length){
   const anchors:Record<GuardianKind,GridPoint[]>={
    frog:[{x:8,z:8},{x:4,z:8},{x:7,z:4},{x:4,z:4}],
    dog:[{x:4,z:4},{x:4,z:7},{x:7,z:4},{x:8,z:7}],
    cat:[{x:0,z:4},{x:0,z:9},{x:9,z:0},{x:9,z:9}],
   };
   const towerPoints=p.guardian==='cat'?p.layout.buildings.filter(b=>b.kind==='tower').flatMap(b=>{const access=towerAccess(p.layout,b);return access?[access.entry]:[];}):[];
   const goals=anchors[p.guardian].map(anchor=>{
    const preferred=towerPoints.find(q=>regionAt(q)===regionAt(anchor))??anchor;
    return p.layout.owned.filter(q=>regionAt(q)===regionAt(anchor)&&isWalkable(p.layout,q))
     .sort((a,b)=>dist(a,preferred)-dist(b,preferred)).find(q=>findActorPath(p.layout,p.guardianAt,q));
   }).filter((q):q is GridPoint=>!!q);
   let index=(p.guardianPatrolIndex??0)%Math.max(1,goals.length);
   for(let attempt=0;attempt<goals.length;attempt++){
    const target=goals[index];if(dist(p.guardianAt,target)>.001){p.guardianTarget={...target};p.guardianPath=findActorPath(p.layout,p.guardianAt,target)?.slice(1)??[];break;}
    index=(index+1)%goals.length;
   }
   p.guardianPatrolIndex=index;
  }
  const speed=p.guardian==='dog'?1.8:p.guardian==='cat'?2.2:1.2;
  let allowance=speed*movementMs/1000;
  if(behavior==='follow'){
   let length=0,from=p.guardianAt;for(const point of p.guardianPath){length+=dist(from,point);from=point;}
   allowance=Math.min(allowance,Math.max(0,length-1.8));
  }
  walk(p.guardianAt,p.guardianPath,allowance);
  if(behavior==='patrol'&&!p.guardianPath.length&&p.guardianTarget&&dist(p.guardianAt,p.guardianTarget)<.001){p.guardianPatrolIndex=((p.guardianPatrolIndex??0)+1)%4;if(p.guardian==='cat'){const tower=p.layout.buildings.find(b=>b.kind==='tower'&&dist(towerAccess(p.layout,b)?.entry??{x:Infinity,z:Infinity},p.guardianAt)<.02);if(tower)p.guardianLookout=startLookout(p.layout,p.guardianAt,tower.id)??undefined;}}
 }
 const region=regionAt(cell(p.position));if(isOwned(p.layout,cell(p.position))&&!p.regions.includes(region)){p.regions.push(region);if(['meadow','shore','home'].every(r=>p.regions.includes(r)))milestone(p,'walk-home',8,'生活路线走通 · +8金币',now);}
 for(const landmark of newlyReachedLandmarks(p)){p.journey??={discovered:[]};p.journey.discovered.push(landmark.id);milestone(p,`discovery-${landmark.id}`,landmark.reward,`发现${landmark.name} · +${landmark.reward}金币`,now);}
 settleFarmProducts(p,now);advanceFarmRaids(p,now,presentation);if(p.threat?.guardian&&p.guardianLookout&&p.guardianLookout.phase!=='done'&&!p.threat.guardian.lookout){p.threat.guardian.lookout=structuredClone(p.guardianLookout);p.threat.guardian.position={...p.guardianAt};}
}
export function commandEstate(original:Estate,c:EstateCommand,now:number):EstateReply{
 const s=structuredClone(original),p=currentProfile(s);if(p.tutorial!=='done'&&p.threat)p.threat=ensureOpeningThreat(p.threat,p.layout);const reject=(message:string):EstateReply=>({state:original,accepted:false,message});let message='已保存';
 if(p.tutorial==='done'&&p.opening?.stage!=='done')p.opening=initialOpening('done');
 if(c.actor&&c.actor!==s.playerId&&c.type!=='creation')return reject('本地访客投影不能操作主人的动物或库存');
 if(!['enter','profile','avatar'].includes(c.type)&&p.session&&c.session!==p.session)return reject('这段会话已更新，请重新进入');
 if(p.opening&&p.tutorial!=='done'&&p.opening.stage!=='defend'&&!['enter','pulse','skipOpening','guardian','profile','finishTutorial','resetProfile','move','steer'].includes(c.type))return reject('先看完或跳过开场，再一起照顾幼崽');
 ensureFoodLedger(p);ensureFarmCycle(p,now);ensureWorkshop(p,now);settleFarmProducts(p,now);
 const encounter=encounterCommand(p,c,now,s.avatar);
 if(encounter){s.revision++;p.notice=encounter.message;return {state:s,accepted:encounter.accepted,message:encounter.message};}
 const economyCommand=v7Command(p,c,now);
 if(economyCommand){s.revision++;p.notice=economyCommand.message;return {state:s,accepted:economyCommand.accepted,message:economyCommand.message};}
 const workshop=workshopCommand(p,c,now);
 if(workshop){s.revision++;p.notice=workshop.message;return {state:s,accepted:workshop.accepted,message:workshop.message};}
 const cycle=farmCycleCommand(p,c,now);
 if(cycle){if(!cycle.accepted)return reject(cycle.message);message=cycle.message;}
 else if(c.type==='enter'){if(p.job?.type==='feed'){p.job.progress=0;p.job.phase='walk';}if(!p.opening&&p.tutorial==='defend')p.openingActed=true;p.opening??=initialOpening(p.tutorial);p.opening.guardian??=p.guardian;if(now-p.lastPulseAt>5000)settleProfileOffline(p,now);delete p.steering;p.session=c.id;p.lastPulseAt=now;p.lastSeenAt=now;message=p.events.length?'欢迎回家，它们记着与你的经历':'选一位伙伴，开始照顾幼崽';}
 else if(c.type==='skipOpening'){p.opening=skipOpening(p.opening??initialOpening(p.tutorial));message=p.opening.stage==='choose'?'选一位伙伴，保护幼崽':'伙伴已就位，点一次守护';}
 else if(c.type==='pulse'){
  if(c.session!==p.session)return reject('这段会话已更新，请重新进入');const elapsed=Math.max(0,now-p.lastPulseAt);if(elapsed>5000){settleProfileOffline(p,now);p.lastPulseAt=now;p.lastSeenAt=now;}else if(c.presentationPaused===true){for(const a of p.animals)cancelDining(a);if(p.job?.type==='feed')cancelJob(p);p.lastPulseAt=now;p.lastSeenAt=now;delete p.steering;}else tick(p,now,Math.min(1500,elapsed),{ready:typeof c.presentationReady==='boolean'?c.presentationReady:undefined,covered:c.presentationCovered===true});if(p.assistance&&!p.threat&&!p.job){const last=p.events.findLast(e=>e.id.startsWith('reminder-'));const animal=p.animals.filter(a=>!a.memorial&&a.life.hunger<30).sort((a,b)=>a.life.hunger-b.life.hunger)[0];if(animal&&(!last||now-last.at>=60000))remember(p,`reminder-${c.id}`,`${animal.name}饿了 · 点卡片喂食，工作台可免费补充`,now);}message=p.notice;
 }else if(c.type==='profile'){
  if(c.profile!=='home'&&c.profile!=='lab')return reject('请选择自然档或独立演示档');if(c.profile==='lab'&&!s.profiles.lab)s.profiles.lab=freshProfile(s.playerId,'lab',now);s.activeProfile=c.profile;if(now-currentProfile(s).lastPulseAt>5000)settleProfileOffline(currentProfile(s),now);currentProfile(s).lastPulseAt=now;currentProfile(s).session=c.id;message=c.profile==='lab'?'独立演示档 · 年龄240倍，照料与风险仍按规则':'回到自然档 · 关系和物品原样保留';
 }else if(c.type==='resetProfile'){
  if(c.confirmed!==true||c.profile!==p.id)return reject('请确认要清空的当前存档');
  if(!p.session||typeof c.session!=='string'||c.session!==p.session)return reject('请重新进入当前存档后再重置');
  if(typeof c.id!=='string'||!c.id.trim())return reject('重置请求无效，请重新确认');
  // Retain the device identity and the other profile. A new run/session makes
  // delayed pre-reset commands stale; the store retains reset receipts for retry.
  const fresh=freshProfile(s.playerId,p.id,now);fresh.runId=c.id;fresh.session=c.id;s.profiles[p.id]=fresh;
  message=`已重置${p.id==='home'?'自然档':'独立演示档'}，从第一次回家重新开始`;
 }else if(c.type==='avatar'){
  if(!['human-lx','miaocuijiao','banana-cat'].includes(String(c.avatar)))return reject('这个分身尚未开放');s.avatar=c.avatar as Avatar;message='换好分身，关系身份没有变化';
 }else if(c.type==='steer'){
  const direction=c.direction as GridPoint;if(!direction||!Number.isFinite(direction.x)||!Number.isFinite(direction.z))return reject('请选择有效移动方向');
  const held=p.steering;cancelJob(p);if(held)p.steering=held;tick(p,now,Math.max(0,now-p.lastPulseAt),{ready:typeof c.presentationReady==='boolean'?c.presentationReady:undefined,covered:c.presentationCovered===true});const magnitude=Math.hypot(direction.x,direction.z);
  if(magnitude)p.steering={direction:{x:direction.x/magnitude,z:direction.z/magnitude},at:now};else delete p.steering;message='';
 }else if(c.type==='move'){
  if(c.session!==p.session)return reject('会话已更新');const q=c.to as GridPoint;if(!q||!Number.isFinite(q.x)||!Number.isFinite(q.z))return reject('请选择可走的地面');const path=findPlayerPath(p.layout,p.position,cell(q));if(!path)return reject('这里被设施或水域挡住，换一条路吧');cancelJob(p);delete p.steering;p.path=path;message='正在走过去';
 }else if(c.type==='cancel'){if(c.jobId!==undefined&&c.jobId!==p.job?.id)return reject('这项行动已经变化，旧取消请求不会影响新行动');cancelJob(p);p.rescueIntent=undefined;for(const r of Object.values(p.v7?.recovery??{}))r.remainingOnlineMs=3000;message='取消了这次行动，食物不会扣除';}
 else if(c.type==='feed'){
  if(p.job?.type==='feed'&&p.job.target!==c.target)cancelJob(p);if(p.job)return reject('先完成或取消手上的行动');const a=p.animals.find(a=>a.id===c.target&&!a.memorial&&!p.threat?.actors.some(t=>t.id===a.id&&t.status==='memorial'));if(!a)return reject('先选一只在家的羊');if(p.inventory.hand<1)return reject('背包空了，去工作台免费补充');const food=c.food??(a.life.stage==='baby'?'milk':'feed');if(food!=='milk'&&food!=='feed')return reject('请选择适配食物');const check=feedingResult(a.life,{now,food});if(!check.accepted)return reject(check.message);releaseRest(p,a.id);cancelDining(a);const to=feedingApproach(p.layout,p.position,a.position,p.animals.filter(other=>other.id!==a.id&&!other.memorial).map(other=>other.position));if(!to)return reject('它的侧前方没有可达空位，请先让出一点空间');p.path=to.path;p.job={id:c.id,type:'feed',target:a.id,food,progress:0,phase:'walk',to:to.to};message=`LX走近${a.name}再${food==='milk'?'喂奶':'喂食'}`;
 }else if(c.type==='refill'){
  if(p.inventory.hand>=3)return reject('背包已装满3份');const b=c.source==='trough'?p.layout.buildings.find(b=>b.kind==='trough'&&b.id===c.target):p.layout.buildings.find(b=>b.kind==='workbench');
  if(c.source==='trough'&&(!b||!(p.troughFood?.[b.id]??0)))return reject('这个食槽还没有可装的食物');const approach=b&&buildingApproaches(p.layout,b).map(q=>({q,path:pathTo(p,q)})).filter(v=>v.path).sort((a,b)=>a.path!.length-b.path!.length)[0];if(!approach)return reject('补给点暂时不可达');cancelJob(p);p.path=approach.path!;p.job={id:c.id,type:'refill',...(c.source==='trough'?{target:b!.id}:{}),to:approach.q,progress:0,phase:'walk'};message=c.source==='trough'?'走到食槽装食物':'去工作台免费补充';
 }else if(c.type==='play'){
  if(p.threat)return reject('先收好守护记录，再一起玩');  if(now-p.lastPlayAt<6000)return reject('它们还在回应，稍等一会儿');const a=p.animals.find(a=>a.id===c.target&&!a.memorial&&!p.threat?.actors.some(t=>t.id===a.id&&t.status==='memorial'));if(!a||!['dance','bounce','love'].includes(String(c.action)))return reject('选一只羊和一个动作');if(dist(a.position,p.position)>4)return reject('先走近它，再一起玩');releaseRest(p,a.id);const result=playWith(a.life,{now,sessionId:p.session,action:c.action as Action,manual:true});a.life=result.life;p.lastPlayAt=now;p.lastVisual={id:c.id,action:c.action as Action,target:a.id,at:now};message=result.message;remember(p,c.id,`${a.name}：${message}`,now);
 }else if(c.type==='follow'){
  if(p.threat)return reject('先收好守护记录，再一起散步');  const a=p.animals.find(a=>a.id===c.target);if(!a||a.memorial)return reject('先选一只在家的羊');releaseRest(p,a.id);cancelDining(a);a.following=!a.following;message=a.following?`${a.name}愿意在附近陪你走`:`${a.name}回到自己的活动`;
 }else if(c.type==='rest'){
  const r=requestRest(p,String(c.target));if(!r.ok)return reject(r.message);message=r.message;
 }else if(c.type==='rename'){
  const a=p.animals.find(a=>a.id===c.target);const name=typeof c.name==='string'?c.name.trim().slice(0,12):'';if(!a||!name)return reject('名字需要1至12个字');a.name=name;message=`以后叫你${name}`;
 }else if(c.type==='appearance'){
  const a=p.animals.find(a=>a.id===c.target);if(!a||!['plain','starlit'].includes(String(c.appearance)))return reject('请选择外观');if(c.appearance==='starlit'&&!p.sharedRhythm&&a.appearance!=='starlit')return reject('先与奶蛙一起玩一段节奏');a.appearance=c.appearance as 'plain'|'starlit';message='外观已更换，名字与关系保留';
 }else if(c.type==='rhythm'){
  if(p.threat)return reject('先收好守护记录，再一起合拍');  if(p.guardian!=='frog')return reject('请在小屋选择奶蛙伙伴');p.sharedRhythm=true;p.lastVisual={id:c.id,action:'dance',target:'all',at:now};message='奶蛙带大家一起跳舞 · 规则驱动的星点外观已可体验';
 }else if(c.type==='guardian'){
  if(p.opening&&p.tutorial!=='done'&&p.opening.stage!=='choose')return reject('先看完或跳过开场，再选择伙伴');if(!['dog','cat','frog'].includes(String(c.guardian)))return reject('请选择一位伙伴');if(p.threat&&p.threat.phase!=='choosing')return reject('先收好当前守护记录，再换伙伴');if(p.tutorial==='done'&&p.guardian!==null&&p.onlineMs-p.guardianSwitchAt<300000)return reject('伙伴换岗需要间隔5分钟');p.guardian=c.guardian as GuardianKind;p.guardianSwitchAt=p.onlineMs;p.guardianReadyMs=p.tutorial==='choose'?0:20000;if(p.tutorial==='choose'){p.openingActed=false;if(p.opening)p.opening=selectOpeningGuardian(p.opening,p.guardian);p.tutorial='defend';if(p.threat?.phase==='choosing'){const choice=guardianCommand(p.threat,p.layout,{kind:'select',guardian:p.guardian});if(!choice.ok)return reject(choice.reason??'请选择伙伴');p.threat=choice.state;}else p.threat=createThreat({id:c.id,seed:17,mode:'tutorial',actors:p.animals.map(a=>({id:a.id,position:cell(a.position)})),guardian:p.guardian,guardianPosition:cell(p.guardianAt)},p.layout);}message=`${GUARDIAN_LABEL[p.guardian]}来守护小家`;
 }else if(c.type==='guardianCommand'){
  if(!p.guardian)return reject('先选择一位伙伴');const command=c.command as Parameters<typeof guardianCommand>[2];if(!command)return reject('请选择伙伴指令');
  if(!p.threat){
   if(!['follow','station','patrol','lookout'].includes(command.kind))return reject('当前没有威胁，可以跟随、驻守、巡游或上高台守望');
   if(p.guardianReadyMs>0)return reject('伙伴还在准备换岗');
   if(command.kind==='lookout'){
    const job=startLookout(p.layout,p.guardianAt,command.buildingId,p.guardianLookout);if(!job)return reject('没有入口畅通、可以沿台阶登上的高台');
    if(p.animals.some(a=>!a.memorial&&dist(a.position,job.access.entry)<.55))return reject('高台入口有伙伴占位，等它让开再上台');
    p.guardianLookout=job;p.guardianPath=[];p.guardianBehavior='station';p.guardianTarget={...job.access.entry};message='伙伴走向台脚，沿台阶登高观察后原路下来';
   }else{
    const active=p.guardianLookout&&p.guardianLookout.phase!=='done',from=active?p.guardianLookout!.access.entry:p.guardianAt;
    if(command.kind==='station'){const q=command.target?cell(command.target):cell(p.position),route=findActorPath(p.layout,from,q)?.slice(1);if(!route)return reject('伙伴走不到驻守点，请换个位置');p.guardianTarget=q;p.guardianPath=route;}else p.guardianPath=[];
    if(active)p.guardianLookout=advanceLookout(p.layout,p.guardianLookout,0,{cancel:true})??undefined;
    p.guardianBehavior=command.kind as 'follow'|'station'|'patrol';message=active?'伙伴先沿台阶安全下台，再执行新指令':command.kind==='follow'?'伙伴会沿路陪着LX':command.kind==='station'?'伙伴走到指定位置驻守':'伙伴开始沿路巡游';
   }
  }else{const r=guardianCommand(p.threat,p.layout,command);if(!r.ok)return reject(r.reason??'伙伴暂时做不到');p.threat=r.state;if(p.tutorial==='defend')p.openingActed=true;message='伙伴正在执行命令';}
 }else if(c.type==='rehearse'||c.type==='challenge'){
  if(!p.guardian)return reject('先选一位守护伙伴');if(p.guardianReadyMs>0)return reject('伙伴还在准备换岗');if(p.threat)return reject('先在守护面板收好当前事件记录');const challenge=c.type==='challenge';if(challenge&&(p.id!=='lab'||c.confirmed!==true||!Array.isArray(c.participants)||!c.participants.length))return reject('真实风险仅在独立演示档明确选择名单后开启');p.threat=createThreat({id:c.id,seed:typeof c.seed==='number'?c.seed:17,mode:challenge?'challenge':'rehearsal',actors:p.animals.filter(a=>!a.memorial).map(a=>({id:a.id,position:cell(a.position),participant:challenge&&(c.participants as string[]).includes(a.id)})),guardian:p.guardian,guardianPosition:{...p.guardianAt},guardianLookout:p.guardianLookout,challengeAuthorized:challenge,confirmedParticipants:challenge?c.participants as string[]:undefined,upgrades:threatUpgrades(p),tactic:workshopTactic(p)},p.layout);if(p.job?.type!=='delivery')cancelJob(p);message=challenge?'独立演示挑战开始 · 仅确认名单承担风险':'无损演练开始，看它们沿实际路线回家';
 }else if(c.type==='endEvent'){
  if(!p.threat||p.threat.phase!=='complete')return reject('先完成当前事件或救援');if(p.threat.actors.some(a=>a.status==='lost'))return reject(p.threat.pressureBand?'还有走失动物；先完成3秒营救并支付16金币和4生产粮':'还有走失的伙伴，先选择免费找回');for(const a of p.animals){const outcome=p.threat.actors.find(t=>t.id===a.id);if(outcome?.status==='memorial'){a.memorial={at:now,eventId:p.threat.id};a.path=[];continue;}if(!isWalkable(p.layout,cell(a.position))){const actor=p.threat.actors.find(t=>t.id===a.id);const b=p.layout.buildings.find(b=>b.id===actor?.reservation?.buildingId);const q=b&&buildingApproaches(p.layout,b)[0];a.position=q?{...q}:{x:4,z:4};}a.path=[];}if(p.threat.mode==='rehearsal'&&!p.milestones.includes('journey-rehearsed'))p.milestones.push('journey-rehearsed');p.lastThreat=p.threat;p.threat=null;finishFarmRaid(p);p.rescueIntent=undefined;if(p.job?.type!=='delivery')cancelJob(p);message=p.lastThreat.mode==='rehearsal'?'演练记录已保存，回到安心生活':'守护记录已保存，继续收获和建设小家';
 }else if(c.type==='finishTutorial'){
  if(p.tutorial!=='defend')return reject('先选择伙伴');if(p.threat?.phase!=='complete')return reject('伙伴正在护送，请等大家回到棚里');if(p.opening&&p.opening.stage!=='done')return reject('狼正在退走，再等一小会儿');p.tutorial='done';p.opening=completeOpening(p.opening??initialOpening('defend'));if(p.threat){for(const a of p.animals){if(!isWalkable(p.layout,cell(a.position))){const actor=p.threat.actors.find(t=>t.id===a.id);const b=p.layout.buildings.find(b=>b.id===actor?.reservation?.buildingId);const q=b&&buildingApproaches(p.layout,b)[0];a.position=q?{...q}:{x:4,z:4};}a.path=[];}p.lastThreat=p.threat;}p.threat=null;if(p.job?.type!=='delivery')cancelJob(p);message='伙伴守住了小家，现在给幼崽第一口奶';
 }else if(c.type==='rescue'||c.type==='v7-recover'){
  const recovery=p.v7?.recovery[String(c.target)];
  if(!p.threat&&!recovery)return reject('现在没有需要救援或治疗的动物');
  if(c.type==='v7-recover'&&!recovery)return reject('这只动物当前不需要付费恢复');
  p.rescueIntent={target:String(c.target),findBack:recovery?.kind==='lost'||c.findBack===true,wolfId:typeof c.wolfId==='string'?c.wolfId:undefined};
  if(recovery){const target=recoveryPoint(p,String(c.target));const approach=target&&nearestApproach(p,target);if(approach)p.path=approach.path??[];message=recovery.kind==='injury'?'走近后连续照料3秒；完成时支付8金币和2生产粮':'走近后连续营救3秒；完成时支付16金币和4生产粮';}
  else message='靠近后持续救援，安全模式可以免费找回';
 }else if(c.type==='layout'){
  const edit=c.edit as LayoutEdit;if(p.guardianLookout&&p.guardianLookout.phase!=='done'&&edit&&'id' in edit&&edit.id===p.guardianLookout.buildingId)return reject('伙伴还在使用高台，先让它下台再改动');if(!edit||typeof edit!=='object')return reject('请选择合法设施操作');const r=commitEdit(p.layout,edit,{eventId:c.id,materials:p.materials,baseVersion:Number(c.baseVersion),actors:layoutActors(p),surveyed:p.surveyed,locked:!!p.threat});if(!r.ok)return reject(r.reasons.join('；'));if(!lookoutReservationSafe(r.layout,p.guardianLookout))return reject('请保留守望伙伴的高台和下台入口');p.layout=r.layout;p.materials+=r.materialDelta;milestone(p,'arrange',12,'第一次布置小家 · +12金币',now);message='方案已确认，施工只在在线时推进';
 }else if(c.type==='cancelBuild'){
  const r=cancelConstruction(p.layout,c.id);if(!r.ok)return reject(r.reasons.join('；'));if(!lookoutReservationSafe(r.layout,p.guardianLookout))return reject('请保留守望伙伴的高台和下台入口');p.layout=r.layout;p.materials+=r.materialDelta;message='施工取消，预留金币退回一次';
 }else if(c.type==='survey'){
  if(p.position.x<10)return reject('走到东侧边界再勘察');cancelJob(p);p.job={id:c.id,type:'survey',to:p.position,progress:0,phase:'act'};message='在边界观察5秒';
 }else if(c.type==='delivery'){
  const f=p.layout.buildings.find(b=>b.kind==='factory'),t=p.layout.buildings.find(b=>b.kind==='trough'&&(c.target===undefined||b.id===c.target));const source=f&&buildingApproaches(p.layout,f)[0],to=t&&buildingApproaches(p.layout,t)[0];if(!source||!to||!findPath(p.layout,source,to)||p.factory.stock<1)return reject('需要已连通的工厂、食槽与食物库存');cancelJob(p);p.path=pathTo(p,source)??[];p.job={id:c.id,type:'delivery',target:t!.id,source,to,progress:0,phase:'walk',rounds:2,carried:0};message='LX每次搬3份，按实际路线装卸配送';
 }else if(c.type==='creation'){
  const r=applyEstateCreation(p,s.playerId,{command:c.command as CreationCommand,actor:typeof c.actor==='string'?c.actor:undefined,capture:c.capture&&typeof c.capture==='object'?c.capture as WorkCapture:undefined},now);s.profiles[s.activeProfile]=r.profile;if(r.ok&&r.profile.layout.construction&&!p.layout.construction)milestone(r.profile,'arrange',12,'第一次布置小家 · +12金币',now);if(r.ok&&(c.command as CreationCommand)?.type==='themeApply')remember(r.profile,c.id,'应用了喜欢的小家主题',now);if(!r.ok){s.revision++;return {state:s,accepted:false,message:r.message};}message=r.message;
 }else if(c.type==='assistance'){p.assistance=c.enabled===true;message=p.assistance?'开启基础提醒；建设与风险仍需你确认':'关闭基础提醒';}
 else return reject('此版本不接受这个指令');
 if(p.threat?.guardian&&p.guardianLookout&&p.guardianLookout.phase!=='done'&&!p.threat.guardian.lookout){p.threat.guardian.lookout=structuredClone(p.guardianLookout);p.threat.guardian.position={...p.guardianAt};}
 settleFarmProducts(currentProfile(s),now);
 s.revision++;if(message)currentProfile(s).notice=message;return {state:s,accepted:true,message};
}
/** Both preview and commit protect every present entity; wild LX is not an evacuation animal. */
export function layoutActors(p:Profile):GridPoint[]{const look=p.threat?.guardian?.lookout??p.guardianLookout,ground=look&&look.phase!=='done'&&lookoutReservationSafe(p.layout,look)?look.access.entry:p.guardianAt;return [...(isOwned(p.layout,cell(p.position))?[p.position]:[]),...(p.guardian?[ground]:[]),...p.animals.filter(a=>!a.memorial).map(a=>a.position)].map(cell);}
export function layoutPreview(p:Profile,edit:LayoutEdit){const preview=previewEdit(p.layout,edit,{materials:p.materials,baseVersion:p.layout.version,actors:layoutActors(p),surveyed:p.surveyed,locked:!!p.threat});if(!lookoutReservationSafe(preview.after,p.guardianLookout)){preview.ok=false;preview.reasons.push('请保留守望伙伴的高台和下台入口');}return preview;}
export {growthSummary};

