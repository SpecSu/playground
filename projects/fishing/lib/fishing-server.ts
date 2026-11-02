import {FISHING_CHAT_TTL_MS,FISHING_EMOTE_TTL_MS,FISHING_EMOJIS,validateFishingChatText} from './fishing-chat';
import { FISHING_AMBIENT_COUNT, projectFishingAmbientParticipants } from './fishing-ambient';
import { isAmbientActorId } from './ambient-world';
import { FISHING_ACCEPTED_AVATAR_PRESETS as AVATAR_PRESETS } from './fishing-avatar-catalog';
import { RoomError } from './fishing-errors';
import { MARINE_SPECIES } from './fishing-catalog';
import { BITE_MIN_MS,BITE_MAX_MS,REEL_WINDOW_MS,FISHING_CAPACITY,FISHING_PHYSICAL_SEAT_COUNT,FISHING_SEAT_TTL,FISHING_SEAT_MOVE_MS,projectFishing } from './fishing-types';
import type { Backpack,CatchRecord,FishingCommand,FishingEvent,FishingParticipant,FishingSnapshot,FishingState } from './fishing-types';
export type StoredFishingRoom={revision:number;participants:FishingParticipant[];events:FishingEvent[];ambientSlots?:number[]};
export type StoredFishingVisit={lastSequence:number;isPresent:boolean;fishing:FishingState;inventory:Backpack;receipts:{requestId:string;fingerprint:string}[];tokens:number;tokenAt:number};
export interface FishingStore {
  ensureRoom(id:string,state:StoredFishingRoom):Promise<void>;
  ensureVisit(room:string,actor:string,state:StoredFishingVisit):Promise<void>;
  readState(room:string,actor:string):Promise<{room:StoredFishingRoom|null;visit:StoredFishingVisit|null}>;
  commit(room:string,revision:number,next:StoredFishingRoom,actor?:string,sequence?:number,visit?:StoredFishingVisit):Promise<boolean>;
}
export function validateFishingCommand(input:unknown):FishingCommand {
  const bad=()=>{throw new RoomError('INVALID_COMMAND','这次操作无法完成，请刷新后重试。');};
  if(!input||typeof input!=='object'||Array.isArray(input))return bad();
  const v=input as Record<string,unknown>;
  if(v.roomId!=='ocean'||typeof v.requestId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(v.requestId)||!Number.isSafeInteger(v.sequence)||Number(v.sequence)<1)return bad();
  const keys:Record<string,string[]>={join:['name','preset'],profile:['name','preset'],heartbeat:[],leave:[],cast:[],reel:[],collect:['catchId'],'move-seat':['slot'],chat:['text'],emote:['emoji']};
  if(typeof v.type!=='string'||!Object.hasOwn(keys,v.type))return bad();
  if(Object.keys(v).some(k=>!['roomId','requestId','sequence','type',...keys[v.type as string]].includes(k)))return bad();
  if(v.type==='join'||v.type==='profile') {
    if(typeof v.name!=='string'||!v.name.trim()||[...v.name.trim()].length>16||/[\p{Cc}\p{Cf}<>]/u.test(v.name)||!AVATAR_PRESETS.includes(v.preset as never))return bad();
    return {...v,name:v.name.trim()} as FishingCommand;
  }
  if(v.type==='chat'){const text=validateFishingChatText(v.text);if(text===null)return bad();return {...v,text} as FishingCommand;}
  if(v.type==='emote'&&!FISHING_EMOJIS.includes(v.emoji as never))return bad();
  if(v.type==='collect'&&(typeof v.catchId!=='string'||v.catchId.length>100||!v.catchId))return bad();
  if(v.type==='move-seat'&&(!Number.isSafeInteger(v.slot)||Number(v.slot)<0||Number(v.slot)>=FISHING_PHYSICAL_SEAT_COUNT))return bad();
  return v as FishingCommand;
}
function addEvent(room:StoredFishingRoom,event:Omit<FishingEvent,'id'>){room.events.push({id:crypto.randomUUID(),...event});room.events=room.events.slice(-30);}
function expire(room:StoredFishingRoom,now:number,pruneSpeech=false){if(pruneSpeech)for(const p of room.participants){if(p.chat&&now>=p.chat.expiresAt)delete p.chat;if(p.emote&&now>=p.emote.expiresAt)delete p.emote;}const before=room.participants.length;room.participants=room.participants.filter(p=>now-p.lastSeenAt<FISHING_SEAT_TTL);return before!==room.participants.length;}
function projectParticipant(person:FishingParticipant,now:number):FishingParticipant {
  const projected={...person,fishing:projectFishing(person.fishing,now)};
  if(projected.chat&&now>=projected.chat.expiresAt)delete projected.chat;
  if(projected.emote&&now>=projected.emote.expiresAt)delete projected.emote;
  if(projected.movement&&now>=projected.movement.endsAt)delete projected.movement;
  return projected;
}
function publicState(room:StoredFishingRoom,visit:StoredFishingVisit,actor:string,now:number):FishingSnapshot {
 return {roomId:'ocean',revision:room.revision,serverNow:now,capacity:FISHING_CAPACITY,ambientParticipants:projectFishingAmbientParticipants(now,room.ambientSlots),participants:room.participants.map(p=>projectParticipant(p,now)),events:room.events,self:{id:actor,role:room.participants.some(p=>p.id===actor)?'participant':visit.isPresent?'spectator':'visitor',lastSequence:visit.lastSequence,fishing:projectFishing(visit.fishing,now),inventory:visit.inventory}};
}
export function createFishingService(store:FishingStore,options:{now?:()=>number;random?:()=>number}={}) {
  const clock=options.now??Date.now;
  const random=options.random??(()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296);
  const roll=()=>Math.min(1-Number.EPSILON,Math.max(0,random()));
  function randomFreeSlot(occupied:readonly number[]):number {
    const free=Array.from({length:FISHING_PHYSICAL_SEAT_COUNT},(_,i)=>i).filter(slot=>!occupied.includes(slot));
    if(!free.length)throw new RoomError('ROOM_BUSY','钓位已满，请稍后重试。',503);
    return free[Math.floor(roll()*free.length)];
  }
  // Persist once under the room CAS. Legacy occupants keep their seats and catches;
  // ten humans and two ambient anglers share twelve distinct physical positions.
  function ensureAmbientSlots(room:StoredFishingRoom):boolean {
    if(room.ambientSlots?.length===FISHING_AMBIENT_COUNT)return false;
    const occupied=room.participants.map(person=>person.slot),slots:number[]=[];
    for(let i=0;i<FISHING_AMBIENT_COUNT;i++)slots.push(randomFreeSlot([...occupied,...slots]));
    room.ambientSlots=slots;return true;
  }
  async function load(roomId:string,actor:string){let state=await store.readState(roomId,actor);if(!state.room){const initial:StoredFishingRoom={revision:0,participants:[],events:[]};ensureAmbientSlots(initial);await store.ensureRoom(roomId,initial);}if(!state.visit)await store.ensureVisit(roomId,actor,{lastSequence:0,isPresent:false,fishing:{phase:'idle'},inventory:{total:0,species:{},recent:[]},receipts:[],tokens:16,tokenAt:clock()});if(!state.room||!state.visit)state=await store.readState(roomId,actor);if(!state.room||!state.visit)throw new RoomError('UNAVAILABLE','海上信号有点弱，请稍后重试。',503);return {room:state.room,visit:state.visit};}
  async function snapshot(roomId:string,actor:string):Promise<FishingSnapshot>{if(isAmbientActorId(actor))throw new RoomError('FORBIDDEN','环境分身没有玩家身份。',403);if(roomId!=='ocean')throw new RoomError('INVALID_COMMAND','这艘游艇不存在。');for(let i=0;i<32;i++){const {room,visit}=await load(roomId,actor);const revision=room.revision,now=clock();const expired=expire(room,now),allocated=ensureAmbientSlots(room);if(expired||allocated){room.revision++;if(!await store.commit(roomId,revision,room))continue;}return publicState(room,visit,actor,now);}throw new RoomError('ROOM_BUSY','上船的人有点多，请重试。',503);}
  async function command(actor:string,input:unknown):Promise<FishingSnapshot>{if(isAmbientActorId(actor))throw new RoomError('FORBIDDEN','环境分身不能接收玩家操作。',403);const cmd=validateFishingCommand(input);const canonical=JSON.stringify(Object.fromEntries(Object.entries(cmd).sort(([a],[b])=>a.localeCompare(b))));const fingerprint=cmd.type==='chat'?`sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),byte=>byte.toString(16).padStart(2,'0')).join('')}`:canonical;for(let attempt=0;attempt<32;attempt++){
    const {room,visit}=await load(cmd.roomId,actor);const revision=room.revision,sequence=visit.lastSequence,now=clock();
    const receipt=visit.receipts.find(r=>r.requestId===cmd.requestId);if(receipt){if(receipt.fingerprint!==fingerprint)throw new RoomError('REQUEST_CONFLICT','同一次操作不能更换内容。',409);return snapshot(cmd.roomId,actor);}
    if(cmd.sequence<=sequence)throw new RoomError('STALE_SEQUENCE','已同步最新状态，请再试一次。',409,{lastSequence:sequence});
    expire(room,now,true);ensureAmbientSlots(room);let person=room.participants.find(p=>p.id===actor);
    if(!person&&['profile','cast','reel','collect','move-seat','chat','emote'].includes(cmd.type))throw new RoomError('NOT_PARTICIPANT','先登上游艇，再开始钓鱼。',403);
    const tokens=Math.min(16,visit.tokens+Math.max(0,now-visit.tokenAt)/350);if(tokens<1)throw new RoomError('RATE_LIMITED','稍等一下，再试一次。',429,{retryAfterMs:350});visit.tokens=tokens-1;visit.tokenAt=now;
    visit.fishing=projectFishing(visit.fishing,now);
    if(person?.movement){
      if(now>=person.movement.endsAt)delete person.movement;
      else if(cmd.type==='cast'||cmd.type==='move-seat')throw new RoomError('INVALID_COMMAND','正在换钓位，落稳后再试。',400,{retryAfterMs:person.movement.endsAt-now});
    }
    switch(cmd.type){
      case 'join':visit.isPresent=true;if(person){person.name=cmd.name;person.preset=cmd.preset;}else if(room.participants.length<FISHING_CAPACITY){const slot=randomFreeSlot([...room.participants.map(p=>p.slot),...room.ambientSlots!]);person={id:actor,name:cmd.name,preset:cmd.preset,slot,joinedAt:now,lastSeenAt:now,fishing:visit.fishing};room.participants.push(person);addEvent(room,{type:'join',actorId:actor,name:cmd.name,at:now});}break;
      case 'profile':person!.name=cmd.name;person!.preset=cmd.preset;break;
      case 'heartbeat':break;
      case 'chat':person!.chat={id:crypto.randomUUID(),text:cmd.text,createdAt:now,expiresAt:now+FISHING_CHAT_TTL_MS};break;
      case 'emote':person!.emote={id:crypto.randomUUID(),emoji:cmd.emoji,createdAt:now,expiresAt:now+FISHING_EMOTE_TTL_MS};break;
      case 'move-seat':{
        if(!['idle','escaped'].includes(visit.fishing.phase))throw new RoomError('INVALID_COMMAND',visit.fishing.phase==='holding'?'先收进背包，再换钓位。':'这一竿结束后再换钓位吧。');
        if(room.participants.some(p=>p.slot===cmd.slot)||room.ambientSlots!.includes(cmd.slot))throw new RoomError('INVALID_COMMAND','这个钓位有人了，换一个亮起的白圈吧。',409);
        // Claim the destination with the room/visit CAS. Retries recheck all
        // occupants, while the durable receipt prevents a replayed hop.
        person!.movement={fromSlot:person!.slot,startedAt:now,endsAt:now+FISHING_SEAT_MOVE_MS};
        person!.slot=cmd.slot;
      }break;
      case 'leave':if(person){room.participants=room.participants.filter(p=>p.id!==actor);addEvent(room,{type:'leave',actorId:actor,name:person.name,at:now});}visit.isPresent=false;if(visit.fishing.phase!=='holding')visit.fishing={phase:'idle'};break;
      case 'cast':if(!['idle','escaped'].includes(visit.fishing.phase))throw new RoomError('INVALID_COMMAND',visit.fishing.phase==='holding'?'先收进背包，再抛下一竿。':'已经抛竿了，等待鱼儿咬钩吧。');{const biteAt=now+BITE_MIN_MS+Math.floor(roll()*(BITE_MAX_MS-BITE_MIN_MS+1));visit.fishing={phase:'waiting',castId:crypto.randomUUID(),castAt:now,biteAt,expiresAt:biteAt+REEL_WINDOW_MS};addEvent(room,{type:'cast',actorId:actor,name:person!.name,at:now});}break;
      case 'reel':if(visit.fishing.phase==='escaped')break;if(visit.fishing.phase!=='bite')throw new RoomError('INVALID_COMMAND',visit.fishing.phase==='holding'?'这条已经钓到了，收进背包吧。':'还没咬钩，再耐心等一等。');{let ticket=roll()*MARINE_SPECIES.reduce((sum,s)=>sum+s.selectionWeight,0);const species=MARINE_SPECIES.find(s=>(ticket-=s.selectionWeight)<0)??MARINE_SPECIES[MARINE_SPECIES.length-1];const lengthCm=species.fixedCm;const caught:CatchRecord={id:crypto.randomUUID(),speciesId:species.id,lengthCm,weightKg:Math.max(0.01,Math.round(species.kgPerMeter*Math.pow(lengthCm/100,2.65)*100)/100),caughtAt:now};visit.fishing={phase:'holding',catch:caught};addEvent(room,{type:'catch',actorId:actor,name:person!.name,at:now,speciesId:species.id,lengthCm});}break;
      case 'collect':if(visit.fishing.phase!=='holding'||visit.fishing.catch?.id!==cmd.catchId)throw new RoomError('INVALID_COMMAND','这条渔获已经收好了，或不在手中。');{const c=visit.fishing.catch;const existing=visit.inventory.species[c.speciesId];visit.inventory.species[c.speciesId]={count:(existing?.count??0)+1,largest:existing&&existing.largest.lengthCm>c.lengthCm?existing.largest:c};visit.inventory.total++;visit.inventory.recent=[c,...visit.inventory.recent].slice(0,60);visit.fishing={phase:'idle'};addEvent(room,{type:'collect',actorId:actor,name:person!.name,at:now,speciesId:c.speciesId,lengthCm:c.lengthCm});}break;
    }
    if(person&&cmd.type!=='leave'){person.lastSeenAt=now;person.fishing=visit.fishing;}
    visit.lastSequence=cmd.sequence;visit.receipts.push({requestId:cmd.requestId,fingerprint});visit.receipts=visit.receipts.slice(-80);room.revision++;
    if(await store.commit(cmd.roomId,revision,room,actor,sequence,visit))return publicState(room,visit,actor,now);
  }throw new RoomError('ROOM_BUSY','海上信号繁忙，请重试。',503,{retryAfterMs:500});}
  return {snapshot,command};
}
