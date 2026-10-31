import {AVATAR_LABEL,type Avatar} from '../model.ts';
import {GUARDIAN_LABEL} from '../v5/estate.ts';
import type {GuardianKind} from '../v5/threat.ts';
export const MAX_FANTASY_LENGTH=180;
export const DEFAULT_ENCOUNTER_LINE='这一次，换我来守护你';
export type EncounterFact={id:string;text:string;at:number};
export type EncounterDraft={fantasyLine:string;fact:EncounterFact|null};
/** No local command can create a successful job or a video asset. */
export type EncounterJob={id:string;operationId:string;status:'unavailable';reason:string;createdAt:number;durationSeconds:12;budget:'unknown';avatar:Avatar;guardian:GuardianKind|null;fantasyLine:string;fact:EncounterFact|null;retryOf?:string};
export type EncounterReceipt={accepted:boolean;message:string};
export type EncounterState={version:1;draft:EncounterDraft;jobs:EncounterJob[];receipts:Record<string,EncounterReceipt>};
export type EncounterProfile={events:EncounterFact[];guardian:GuardianKind|null;encounter?:EncounterState};
export type EncounterCommand={id:string;type:string;fantasyLine?:unknown;eventId?:unknown;retryOf?:unknown};
/** Contract reserved for a future authenticated video backend; no implementation is connected. */
export interface EncounterVideoProvider {submit(request:{operationId:string;durationSeconds:12;avatar:Avatar;guardian:GuardianKind|null;fact:EncounterFact|null;fantasyLine:string}):Promise<{jobId:string;status:'queued'|'rejected';reason?:string}>;}
const portraits:Record<GuardianKind,string>={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'};
function initialDraft(p:EncounterProfile):EncounterDraft{const events=p.events.filter(e=>typeof e.id==='string'&&e.id&&typeof e.text==='string'&&e.text&&Number.isFinite(e.at)),fact=[...events].reverse().find(e=>/守护|喂|照料|营救|长大|回家|伙伴/.test(e.text))??events.at(-1);return {fantasyLine:DEFAULT_ENCOUNTER_LINE,fact:fact?{id:fact.id,text:fact.text,at:fact.at}:null};}
function ensure(p:EncounterProfile):EncounterState{return p.encounter??={version:1,draft:initialDraft(p),jobs:[],receipts:{}};}
export function encounterCard(p:EncounterProfile,avatar:Avatar){const draft=p.encounter?.draft??initialDraft(p);return {...structuredClone(draft),avatar,playerName:AVATAR_LABEL[avatar],playerPortrait:`/avatars/portraits/${avatar}.webp`,guardian:p.guardian,guardianName:p.guardian?GUARDIAN_LABEL[p.guardian]:'尚未选择伙伴',guardianPortrait:p.guardian?`/avatars/portraits/${portraits[p.guardian]}.webp`:null,durationSeconds:12 as const,service:'unavailable' as const,budget:'unknown' as const,lastJob:p.encounter?.jobs.at(-1)??null};}
/** The aggregate supplies the authoritative avatar; client payload identities are ignored. */
export function encounterCommand(p:EncounterProfile,c:EncounterCommand,now:number,avatar:Avatar):EncounterReceipt|null{
 if(!c.type.startsWith('encounter-'))return null;
 if(typeof c.id!=='string'||!c.id||c.id.length>160)return {accepted:false,message:'操作编号无效'};
 const s=ensure(p);if(Object.hasOwn(s.receipts,c.id))return {...s.receipts[c.id]};
 const finish=(accepted:boolean,message:string)=>{const receipt={accepted,message};Object.defineProperty(s.receipts,c.id,{value:receipt,enumerable:true,configurable:true,writable:true});return {...receipt};};
 if(c.type==='encounter-edit'){
  if(typeof c.fantasyLine!=='string'||Array.from(c.fantasyLine).length>MAX_FANTASY_LENGTH)return finish(false,`幻想台词最多${MAX_FANTASY_LENGTH}字`);
  let fact=s.draft.fact;if(c.eventId!==undefined){const event=p.events.find(e=>e.id===c.eventId);if(!event)return finish(false,'只能引用这座庄园已经记录的真实事件');fact={id:event.id,text:event.text,at:event.at};}
  s.draft={fantasyLine:c.fantasyLine,fact:fact?structuredClone(fact):null};return finish(true,'台词草稿已保存；真实经历未改动');
 }
 if(c.type==='encounter-submit'){
  if(c.retryOf!==undefined&&(typeof c.retryOf!=='string'||!s.jobs.some(j=>j.id===c.retryOf)))return finish(false,'找不到可重试的视频任务');
  const reason='视频生成服务未连接；本次未发送生成请求，未扣金币、物料或生成额度。';
  s.jobs.push({id:`encounter:${c.id}`,operationId:c.id,status:'unavailable',reason,createdAt:now,durationSeconds:12,budget:'unknown',avatar,guardian:p.guardian,...structuredClone(s.draft),...(typeof c.retryOf==='string'?{retryOf:c.retryOf}:{})});return finish(false,reason);
 }
 return finish(false,'未知偶遇卡操作');
}
