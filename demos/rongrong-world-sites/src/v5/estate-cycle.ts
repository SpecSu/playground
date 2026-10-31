/** Integration of persisted production, upgrades and natural events. No browser clocks. */
import {shelterEntries} from './layout.ts';
import type {Profile,EstateCommand} from './estate.ts';
import {ensureV7,settleV7} from './v7-economy.ts';
import {beginV7Raid} from './v7-risk.ts';
import {createHerdEconomy,createHusbandry,syncHusbandry,exchangeWool,cultivateHusbandry,tierNumber,migrateWoolLots,emptyStacks,TIERS,type MaterialTier} from './herd-economy.ts';
import {createProduction,claimProduction} from './v6-production.ts';
import {createRaidCycle,advanceRaidCycle,markRaidStarted,finishRaidCycle,naturalRaidSpawns} from './raid-cycle.ts';
import {createThreat,type GuardianKind} from './threat.ts';
import {workshopTactic} from './workshop.ts';
export type FarmUpgrades={guardians:Record<GuardianKind,number>;shelters:Record<string,number>};
export const UPGRADE_COSTS={guardian:[0,24,48],shelter:[0,16,32],adoption:20,maxResidents:12} as const;
const living=(p:Profile)=>p.animals.filter(a=>!a.memorial);
const herd=(p:Profile)=>living(p).map(a=>({id:a.id,rarity:a.husbandry?tierNumber(a.husbandry.rarity):1}));
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export function ensureFarmCycle(p:Profile,now:number){
 p.economy??=createHerdEconomy();p.upgrades??={guardians:{dog:1,cat:1,frog:1},shelters:{}};
 p.raidCycle??=createRaidCycle(hash(`${p.id}:${p.runId??p.createdAt}:${p.session}`),now,p.onlineMs,p.id==='lab');
 const migrating=!p.production;
 for(const a of p.animals){if(!a.husbandry)a.husbandry=createHusbandry(now,p.id,a.life,a.appearance);a.life.products.stored=0;a.life.products.settledAt=now;}
 if(migrating){
  p.economy=migrateWoolLots(p.economy);
  p.production=createProduction(now,p.id,living(p).slice(0,3).map(a=>a.id));
  for(const a of p.animals){const h=a.husbandry!;for(const tier of TIERS){const amount=h.pending[tier];if(amount)p.production.pending.push({id:`legacy-pending-${a.id}-${tier}`,tier,amount,animalId:a.id,version:'legacy',source:'legacy-pending',cycle:0});}h.pending=emptyStacks();h.progressMs=0;h.settledAt=Math.max(h.settledAt,now);}
 }
 ensureV7(p,now);
}
export function settleFarmProducts(p:Profile,now:number){
 ensureFarmCycle(p,now);
 for(const a of living(p)){const h=a.husbandry!;h.settledAt=Math.max(h.settledAt,now);a.husbandry=syncHusbandry(h,a.life,now);a.husbandry.pending=emptyStacks();a.husbandry.progressMs=0;}
 settleV7(p,now);
 // The former flat-material clock is retired after its one-time import.
 for(const a of p.animals){a.life.products.stored=0;a.life.products.settledAt=Math.max(a.life.products.settledAt,now);}
}
export function threatUpgrades(p:Profile){return {guardianLevel:p.guardian?p.upgrades?.guardians[p.guardian]??1:1,shelterLevels:{...p.upgrades?.shelters}};}
export function advanceFarmRaids(p:Profile,now:number,presentation?:{ready?:boolean;covered:boolean}){
 ensureFarmCycle(p,now);
 const r=advanceRaidCycle(p.raidCycle!,{now,onlineMs:p.onlineMs,herd:herd(p),eligible:p.tutorial==='done'&&p.milestones.includes('first-meal')&&!!p.guardian&&p.guardianReadyMs===0&&!p.layout.construction&&!p.job,paused:presentation?.ready!==true||presentation.covered,eventActive:!!p.threat,lab:p.id==='lab'});p.raidCycle=r.cycle;
 if(!r.launch)return;
 const protectedAtOpening=living(p).flatMap(a=>{const r=a.restAssignment,e=r&&r.phase==='admitted'&&shelterEntries(p.layout).find(e=>e.buildingId===r.buildingId&&e.doorId===r.doorId&&r.slot>=0&&r.slot<e.capacity&&Math.hypot(a.position.x-e.x,a.position.z-e.z)<.02);return e?[{animalId:a.id,buildingId:e.buildingId,doorId:e.doorId,slot:r!.slot}]:[];});
 const actors=living(p).map(a=>({id:a.id,position:{...a.position}}));
 const spawns=naturalRaidSpawns(p.layout,actors,r.launch.wolves,r.launch.seed,[p.position,p.guardianAt]);
 if(!spawns.length){p.raidCycle=finishRaidCycle(p.raidCycle,herd(p),p.id==='lab');p.notice='边缘没有安全的预警路线，本次来袭已推迟';return;}
 if(p.job?.type==='delivery'&&p.job.carried)p.factory.stock+=p.job.carried;
 p.job=null;p.path=[];delete p.steering;
 for(const a of living(p)){a.path=[];a.following=false;delete a.restAssignment;a.life.rest={bedId:null,sessionId:null,elapsedMs:0,completed:false};}
 p.threat=createThreat({id:r.launch.id,seed:r.launch.seed,mode:'reassure',actors,guardian:p.guardian!,guardianPosition:{...p.guardianAt},guardianLookout:p.guardianLookout,wolfSpawns:spawns,upgrades:threatUpgrades(p),tactic:workshopTactic(p),pressureBand:r.launch.risk.band},p.layout);
 for(const safe of protectedAtOpening){const a=p.threat.actors.find(a=>a.id===safe.animalId)!;a.status='safe';a.reservation={buildingId:safe.buildingId,doorId:safe.doorId,slot:safe.slot};a.enteredAt=0;a.timely=true;}
 beginV7Raid(p,p.threat);
 p.raidCycle=markRaidStarted(p.raidCycle,r.launch.id,now,p.onlineMs);p.notice=`${spawns.length}只狼从边缘靠近，带大家回保护区`;
 p.events=[...p.events,{id:r.launch.id,text:`山谷来袭 · ${actors.length}只住民 · ${spawns.length}只狼`,at:now,layoutVersion:p.layout.version}].slice(-60);
}
export function finishFarmRaid(p:Profile){if(p.raidCycle?.phase==='active')p.raidCycle=finishRaidCycle(p.raidCycle,herd(p),p.id==='lab');}
export type CycleCommandResult={accepted:boolean;message:string};
const recognized=new Set(['claimWool','claimProducts','exchangeWool','cultivate','upgradeGuardian','upgradeShelter','adopt','setProductionSlots','setRareTarget','processGreen']);
export function farmCycleCommand(p:Profile,c:EstateCommand,now:number):CycleCommandResult|null{
 if(!recognized.has(c.type))return null;
 ensureFarmCycle(p,now);settleFarmProducts(p,now);
 const reject=(message:string)=>({accepted:false,message});
 if(c.type==='claimWool'||c.type==='claimProducts'){
  if(p.threat?.mode==='reassure'&&p.threat.pressureBand&&p.threat.phase!=='complete')return reject('自然来袭中不能瞬间领取产物；先守护并收好事件记录');
  if(c.target!==undefined&&!living(p).some(a=>a.id===c.target))return reject('选一只还在家的小羊');
  const r=claimProduction(p.production!,p.economy!,c.id,typeof c.target==='string'?c.target:undefined);if(!r.total)return reject('羊毛还在慢慢积累，再等等');p.production=r.production;p.economy=r.economy;return {accepted:true,message:`收好${r.total}份羊毛，可用于工作坊制作`};
 }
 if(c.type==='exchangeWool'){
  if(c.woolVersion!=='legacy')return reject('新版羊毛请在市场出售；旧库存可明确选择旧版兑换');
  const r=exchangeWool(p.economy!,c.tier as MaterialTier,Number(c.amount),(c.woolVersion??'v6') as 'legacy'|'v6');if(!r.accepted)return reject(r.message);p.economy=r.economy;p.materials+=r.materials;return {accepted:true,message:`兑换了${r.materials}金币`};
 }
 if(['processGreen','setProductionSlots','setRareTarget'].includes(c.type))return reject('V7已改为每只动物按品质生产；请使用市场合成与生产粮');
 if(p.threat)return reject('先完成这次守护，回家后再升级');
 if(c.type==='cultivate'){
  const a=living(p).find(a=>a.id===c.target);if(!a)return reject('选一只还在家的小羊');const r=cultivateHusbandry(a.husbandry!,p.economy!,now,c.expectedRarity as MaterialTier);if(!r.accepted)return reject(r.message);a.husbandry=r.husbandry;p.economy=r.economy;return {accepted:true,message:r.message};
 }
 if(c.type==='upgradeGuardian'){
  if(!['dog','cat','frog'].includes(String(c.guardian)))return reject('请选择守护伙伴');const kind=c.guardian as GuardianKind,level=p.upgrades!.guardians[kind];
  if(c.expectedLevel!==level)return reject('伙伴等级已变化，请看最新升级条件');if(level>=3)return reject('伙伴已到本版最高等级');const cost=UPGRADE_COSTS.guardian[level as 1|2];if(p.materials<cost)return reject(`还差${cost-p.materials}金币`);
  p.materials-=cost;p.upgrades!.guardians[kind]++;return {accepted:true,message:'伙伴训练完成，下次守护会使用新能力'};
 }
 if(c.type==='upgradeShelter'){
  const b=p.layout.buildings.find(b=>b.kind==='shelter'&&b.id===c.buildingId);if(!b)return reject('先建一处保护围栏');const level=p.upgrades!.shelters[b.id]??1;
  if(c.expectedLevel!==level)return reject('围栏等级已变化，请看最新升级条件');if(level>=3)return reject('围栏已到本版最高等级');const cost=UPGRADE_COSTS.shelter[level as 1|2];if(p.materials<cost)return reject(`还差${cost-p.materials}金币`);
  p.materials-=cost;p.upgrades!.shelters[b.id]=level+1;return {accepted:true,message:'保护入口已改善，撤离排队会更快'};
 }
 return reject('V7请先购买明示品质领养箱，再预览承载并确认孵化；旧领养入口不再扣款');
}
