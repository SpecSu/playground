/** Integration of persisted production, upgrades and natural events. No browser clocks. */
import type {Profile,EstateCommand} from './estate.ts';
import {createLife} from './life.ts';
import {createHerdEconomy,createHusbandry,syncHusbandry,claimWool,exchangeWool,cultivateHusbandry,tierNumber,type MaterialTier} from './herd-economy.ts';
import {createRaidCycle,advanceRaidCycle,markRaidStarted,finishRaidCycle,naturalRaidSpawns} from './raid-cycle.ts';
import {createThreat,type GuardianKind} from './threat.ts';
import {isWalkable,shelterEntries,type GridPoint} from './layout.ts';
import {findActorPath} from './actor-navigation.ts';
export type FarmUpgrades={guardians:Record<GuardianKind,number>;shelters:Record<string,number>};
export const UPGRADE_COSTS={guardian:[0,24,48],shelter:[0,16,32],adoption:20,maxResidents:12} as const;
const living=(p:Profile)=>p.animals.filter(a=>!a.memorial);
const herd=(p:Profile)=>living(p).map(a=>({id:a.id,rarity:a.husbandry?tierNumber(a.husbandry.rarity):1}));
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export function ensureFarmCycle(p:Profile,now:number){
 p.economy??=createHerdEconomy();p.upgrades??={guardians:{dog:1,cat:1,frog:1},shelters:{}};
 p.raidCycle??=createRaidCycle(hash(`${p.id}:${p.runId??p.createdAt}:${p.session}`),now,p.onlineMs,p.id==='lab');
 for(const a of p.animals){if(!a.husbandry)a.husbandry=createHusbandry(now,p.id,a.life,a.appearance);a.life.products.stored=0;a.life.products.settledAt=now;}
}
export function settleFarmProducts(p:Profile,now:number){
 ensureFarmCycle(p,now);
 for(const a of living(p))a.husbandry=syncHusbandry(a.husbandry!,a.life,now);
 // The former flat-material clock is retired after its one-time import.
 for(const a of p.animals){a.life.products.stored=0;a.life.products.settledAt=Math.max(a.life.products.settledAt,now);}
}
export function threatUpgrades(p:Profile){return {guardianLevel:p.guardian?p.upgrades?.guardians[p.guardian]??1:1,shelterLevels:{...p.upgrades?.shelters}};}
export function advanceFarmRaids(p:Profile,now:number,presentation?:{ready?:boolean;covered:boolean}){
 ensureFarmCycle(p,now);
 const r=advanceRaidCycle(p.raidCycle!,{now,onlineMs:p.onlineMs,herd:herd(p),eligible:p.tutorial==='done'&&p.milestones.includes('first-meal')&&!!p.guardian&&p.guardianReadyMs===0&&!p.layout.construction&&!p.job,paused:presentation?.ready!==true||presentation.covered,eventActive:!!p.threat,lab:p.id==='lab'});p.raidCycle=r.cycle;
 if(!r.launch)return;
 const actors=living(p).map(a=>({id:a.id,position:{...a.position}}));
 const spawns=naturalRaidSpawns(p.layout,actors,r.launch.wolves,r.launch.seed,[p.position,p.guardianAt]);
 if(!spawns.length){p.raidCycle=finishRaidCycle(p.raidCycle,herd(p),p.id==='lab');p.notice='边缘没有安全的预警路线，本次来袭已推迟';return;}
 if(p.job?.type==='delivery'&&p.job.carried)p.factory.stock+=p.job.carried;
 p.job=null;p.path=[];delete p.steering;
 for(const a of living(p)){a.path=[];a.following=false;delete a.restAssignment;a.life.rest={bedId:null,sessionId:null,elapsedMs:0,completed:false};}
 p.threat=createThreat({id:r.launch.id,seed:r.launch.seed,mode:'reassure',actors,guardian:p.guardian!,guardianPosition:{...p.guardianAt},wolfSpawns:spawns,upgrades:threatUpgrades(p)},p.layout);
 p.raidCycle=markRaidStarted(p.raidCycle,r.launch.id,now,p.onlineMs);p.notice=`${spawns.length}只狼从边缘靠近，带大家回保护区`;
 p.events=[...p.events,{id:r.launch.id,text:`山谷来袭 · ${actors.length}只住民 · ${spawns.length}只狼`,at:now,layoutVersion:p.layout.version}].slice(-60);
}
export function finishFarmRaid(p:Profile){if(p.raidCycle?.phase==='active')p.raidCycle=finishRaidCycle(p.raidCycle,herd(p),p.id==='lab');}
export type CycleCommandResult={accepted:boolean;message:string};
const recognized=new Set(['claimWool','claimProducts','exchangeWool','cultivate','upgradeGuardian','upgradeShelter','adopt']);
export function farmCycleCommand(p:Profile,c:EstateCommand,now:number):CycleCommandResult|null{
 if(!recognized.has(c.type))return null;
 ensureFarmCycle(p,now);settleFarmProducts(p,now);
 const reject=(message:string)=>({accepted:false,message});
 if(c.type==='claimWool'||c.type==='claimProducts'){
  const animals=living(p).filter(a=>c.target===undefined||a.id===c.target);if(!animals.length)return reject('选一只还在家的小羊');let total=0;
  for(const a of animals){const r=claimWool(a.husbandry!,p.economy!,now);a.husbandry=r.husbandry;p.economy=r.economy;total+=r.total;}
  if(!total)return reject('羊毛还在慢慢积累，再等等');return {accepted:true,message:`收好${total}份羊毛，可在产物背包兑换材料`};
 }
 if(c.type==='exchangeWool'){
  const r=exchangeWool(p.economy!,c.tier as MaterialTier,Number(c.amount));if(!r.accepted)return reject(r.message);p.economy=r.economy;p.materials+=r.materials;return {accepted:true,message:`兑换了${r.materials}份建设材料`};
 }
 if(p.threat)return reject('先完成这次守护，回家后再升级');
 if(c.type==='cultivate'){
  const a=living(p).find(a=>a.id===c.target);if(!a)return reject('选一只还在家的小羊');const r=cultivateHusbandry(a.husbandry!,p.economy!,now,c.expectedRarity as MaterialTier);if(!r.accepted)return reject(r.message);a.husbandry=r.husbandry;p.economy=r.economy;return {accepted:true,message:r.message};
 }
 if(c.type==='upgradeGuardian'){
  if(!['dog','cat','frog'].includes(String(c.guardian)))return reject('请选择守护伙伴');const kind=c.guardian as GuardianKind,level=p.upgrades!.guardians[kind];
  if(c.expectedLevel!==level)return reject('伙伴等级已变化，请看最新升级条件');if(level>=3)return reject('伙伴已到本版最高等级');const cost=UPGRADE_COSTS.guardian[level as 1|2];if(p.materials<cost)return reject(`还差${cost-p.materials}份建设材料`);
  p.materials-=cost;p.upgrades!.guardians[kind]++;return {accepted:true,message:'伙伴训练完成，下次守护会使用新能力'};
 }
 if(c.type==='upgradeShelter'){
  const b=p.layout.buildings.find(b=>b.kind==='shelter'&&b.id===c.buildingId);if(!b)return reject('先建一处保护围栏');const level=p.upgrades!.shelters[b.id]??1;
  if(c.expectedLevel!==level)return reject('围栏等级已变化，请看最新升级条件');if(level>=3)return reject('围栏已到本版最高等级');const cost=UPGRADE_COSTS.shelter[level as 1|2];if(p.materials<cost)return reject(`还差${cost-p.materials}份建设材料`);
  p.materials-=cost;p.upgrades!.shelters[b.id]=level+1;return {accepted:true,message:'保护入口已改善，撤离排队会更快'};
 }
 const animals=living(p);if(c.expectedCount!==animals.length)return reject('住民数量已变化，请重新查看');if(!p.milestones.includes('first-meal'))return reject('先照顾好大家的第一顿，再迎接新朋友');if(animals.length>=UPGRADE_COSTS.maxResidents)return reject('这一版最多照顾12只住民');if(p.layout.construction)return reject('先等这次建设完成');if(p.materials<UPGRADE_COSTS.adoption)return reject('迎接新住民需要20份建设材料');
 const entries=shelterEntries(p.layout),capacity=[...new Map(entries.map(e=>[e.buildingId,e.capacity])).values()].reduce((a,b)=>a+b,0);
 if(capacity<=animals.length)return reject('安全位置不够，先建一处保护围栏');
 const position=p.layout.owned.filter(q=>isWalkable(p.layout,q)&&animals.every(a=>Math.hypot(a.position.x-q.x,a.position.z-q.z)>1)).find(q=>entries.some(e=>findActorPath(p.layout,q,{x:e.x,z:e.z})));
 if(!position)return reject('没有连通保护区的空地，先整理道路');
 const index=animals.length,names=['团团','云朵','棉棉','糖球','绵绵','花卷','雪球','糯米','小满'],id=`resident-${c.id}`;
 if(p.animals.some(a=>a.id===id))return reject('这位住民已经回家啦');
 const life=createLife(now,{ageMultiplier:p.id==='lab'?240:1});p.animals.push({id,name:names[((index-3)%names.length+names.length)%names.length],personality:(['eager','shy','independent'] as const)[index%3],preference:(['dance','love','bounce'] as const)[index%3],color:['#f4d99e','#d6d1e9','#e9bcad'][index%3],appearance:'plain',life,husbandry:createHusbandry(now,p.id,life),position:{...position} as GridPoint,path:[],following:false});p.materials-=UPGRADE_COSTS.adoption;return {accepted:true,message:'新小羊来到家里，点它认识一下吧'};
}
