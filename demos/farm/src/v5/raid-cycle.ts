/** Persisted natural raids use active online time only. No clock reads or world writes. */
import {findActorPath} from './actor-navigation.ts';
import {isWalkable,shelterEntries,type GridPoint,type Layout} from './layout.ts';
export const RAID_RULES={warningMs:12_000,dayCap:12,onlineHourCap:6,onlineHourMs:3_600_000,labMinMs:30_000,labMaxMs:60_000,minSpawnDistance:3} as const;
export type RaidHerdAnimal={id:string;rarity:number};
export type RaidRisk={count:number;rarityLoad:number;pressure:number;band:'low'|'medium'|'high';wolves:1|2|3;minIntervalMs:number;maxIntervalMs:number};
export type RaidPlan={id:string;seed:number;risk:RaidRisk;wolves:1|2|3};
export type RaidCycle={version:1;seed:number;rollIndex:number;sequence:number;phase:'peace'|'warning'|'ready'|'active';lastOnlineMs:number;remainingMs:number;intervalMs:number;warningMs:number;day:number;history:{id:string;onlineMs:number;day:number}[];risk:RaidRisk;pending:RaidPlan|null;blockedBy:'hour'|'day'|null};
export type RaidAdvanceInput={now:number;onlineMs:number;herd:RaidHerdAnimal[];eligible:boolean;paused:boolean;eventActive:boolean;lab?:boolean};
const clone=<T,>(value:T):T=>structuredClone(value);
const finite=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
/** User-facing daily limit follows this farm's China-local day. */
export const raidDay=(now:number)=>Math.floor((finite(now)+8*3_600_000)/86_400_000);
export function raidRisk(herd:RaidHerdAnimal[]):RaidRisk{
 const unique=[...new Map(herd.filter(a=>a.id).map(a=>[a.id,a])).values()];
 const count=unique.length,rarityLoad=unique.reduce((sum,a)=>sum+Math.max(0,(Number.isFinite(a.rarity)?Math.min(5,Math.max(1,a.rarity)):1)-1),0),pressure=count+rarityLoad*.75;
 const band=pressure<6?'low':pressure<11?'medium':'high';
 return {count,rarityLoad,pressure,band,wolves:band==='low'?1:band==='medium'?2:3,minIntervalMs:(band==='low'?8:band==='medium'?5:3)*60_000,maxIntervalMs:(band==='low'?14:band==='medium'?9:6)*60_000};
}
function word(seed:number,index:number){let n=(seed+Math.imul(index+1,0x9e3779b9))>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return (n^(n>>>16))>>>0;}
function interval(c:Pick<RaidCycle,'seed'|'rollIndex'>,risk:RaidRisk,lab:boolean){const min=lab?RAID_RULES.labMinMs:risk.minIntervalMs,max=lab?RAID_RULES.labMaxMs:risk.maxIntervalMs;return Math.round(min+word(c.seed,c.rollIndex)/0xffffffff*(max-min));}
export function createRaidCycle(seed:number,now:number,onlineMs:number,lab=false):RaidCycle{
 const risk=raidRisk(Array.from({length:3},(_,i)=>({id:`initial-${i}`,rarity:1}))),c:RaidCycle={version:1,seed:finite(seed,1)>>>0,rollIndex:0,sequence:0,phase:'peace',lastOnlineMs:Math.max(0,finite(onlineMs)),remainingMs:0,intervalMs:0,warningMs:RAID_RULES.warningMs,day:raidDay(now),history:[],risk,pending:null,blockedBy:null};
 c.remainingMs=c.intervalMs=interval(c,risk,lab);return c;
}
/** Pass the saved absolute online clock, not a wall-clock delta. Duplicate ticks do nothing. */
export function advanceRaidCycle(original:RaidCycle,input:RaidAdvanceInput):{cycle:RaidCycle;launch:RaidPlan|null}{
 const c=clone(original);if(!Number.isFinite(input.now)||!Number.isFinite(input.onlineMs)||input.onlineMs<0)return {cycle:c,launch:null};
 const dt=Math.max(0,input.onlineMs-c.lastOnlineMs);c.lastOnlineMs=Math.max(c.lastOnlineMs,input.onlineMs);c.day=Math.max(c.day,raidDay(input.now));
 c.history=c.history.filter(h=>h.day>=c.day-1||h.onlineMs>c.lastOnlineMs-RAID_RULES.onlineHourMs);
 c.blockedBy=c.history.filter(h=>h.day===c.day).length>=RAID_RULES.dayCap?'day':c.history.filter(h=>h.onlineMs>c.lastOnlineMs-RAID_RULES.onlineHourMs).length>=RAID_RULES.onlineHourCap?'hour':null;
 if(c.phase==='active'||input.eventActive||input.paused||!input.eligible||!input.herd.length||c.blockedBy)return {cycle:c,launch:null};
 if(c.phase==='ready')return {cycle:c,launch:clone(c.pending)};
 if(c.phase==='peace'){
  const risk=raidRisk(input.herd),nextInterval=interval(c,risk,!!input.lab);
  // A changed herd adjusts the remaining fraction, retaining the same random roll.
  if(nextInterval!==c.intervalMs){c.remainingMs=c.intervalMs>0?c.remainingMs/c.intervalMs*nextInterval:nextInterval;c.intervalMs=nextInterval;}
  c.risk=risk;c.remainingMs=Math.max(0,c.remainingMs-dt);
  if(c.remainingMs===0&&dt>0){c.phase='warning';c.warningMs=RAID_RULES.warningMs;c.pending={id:`natural-${c.seed}-${c.sequence+1}`,seed:word(c.seed,c.rollIndex+991),risk:clone(risk),wolves:risk.wolves};}
  return {cycle:c,launch:null};
 }
 c.warningMs=Math.max(0,c.warningMs-dt);
 if(c.warningMs===0){c.phase='ready';return {cycle:c,launch:clone(c.pending)};}
 return {cycle:c,launch:null};
}
/** A launch becomes history only after the caller successfully creates its real event. */
export function markRaidStarted(original:RaidCycle,eventId:string,now:number,onlineMs:number):RaidCycle{
 const c=clone(original);if(c.phase!=='ready'||c.pending?.id!==eventId||c.history.some(h=>h.id===eventId)||!Number.isFinite(now)||!Number.isFinite(onlineMs))return c;
 c.phase='active';c.lastOnlineMs=Math.max(c.lastOnlineMs,onlineMs);c.day=Math.max(c.day,raidDay(now));c.history.push({id:eventId,onlineMs:c.lastOnlineMs,day:c.day});return c;
}
/** Called after the saved event is wrapped, or a ready event has no safe entry route. */
export function finishRaidCycle(original:RaidCycle,herd:RaidHerdAnimal[],lab=false):RaidCycle{
 const c=clone(original);if(c.phase!=='active'&&c.phase!=='ready')return c;
 c.phase='peace';c.sequence++;c.rollIndex++;c.pending=null;c.warningMs=RAID_RULES.warningMs;c.risk=raidRisk(herd);c.remainingMs=c.intervalMs=interval(c,c.risk,lab);return c;
}
/** Returns fewer wolves if the actual layout cannot support distinct safe entries. */
export function naturalRaidSpawns(layout:Layout,actors:{id:string;position:GridPoint}[],count:number,seed:number,avoid:GridPoint[]=[]):GridPoint[]{
 const owned=new Set(layout.owned.map(p=>`${p.x},${p.z}`)),doors=shelterEntries(layout),positions=[...actors.map(a=>a.position),...avoid];
 const candidates=layout.owned.filter(p=>isWalkable(layout,p)&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>!owned.has(`${p.x+x},${p.z+z}`))&&positions.every(a=>Math.hypot(a.x-p.x,a.z-p.z)>=RAID_RULES.minSpawnDistance)&&doors.some(d=>findActorPath(layout,p,{x:d.x,z:d.z})))
  .sort((a,b)=>a.x-b.x||a.z-b.z);
 const result:GridPoint[]=[];if(!candidates.length)return result;
 const offset=word(finite(seed,1),0)%candidates.length;
 for(let i=0;i<candidates.length&&result.length<Math.max(0,Math.min(3,Math.floor(finite(count)))) ;i++){
  const point=candidates[(offset+i)%candidates.length];if(result.every(p=>Math.hypot(p.x-point.x,p.z-point.z)>=3))result.push({...point});
 }
 return result;
}
