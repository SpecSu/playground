import type { AvatarPreset } from './room-types';
export const FISHING_CAPACITY = 10 as const;
// Ten main-deck and two upper-deck stations; admission is independent of geometry.
export const FISHING_PHYSICAL_SEAT_COUNT = 12;
export const FISHING_SEAT_TTL = 60_000;
export const FISHING_SEAT_MOVE_MS = 700;
export const BITE_MIN_MS=5000, BITE_MAX_MS=30000, REEL_WINDOW_MS=5000;
export type CatchRecord={id:string;speciesId:string;lengthCm:number;weightKg:number;caughtAt:number};
export type FishingState={phase:'idle'|'waiting'|'bite'|'escaped'|'holding';castId?:string;castAt?:number;biteAt?:number;expiresAt?:number;catch?:CatchRecord};
export type Backpack={total:number;species:Record<string,{count:number;largest:CatchRecord}>;recent:CatchRecord[]};
export type FishingSeatMovement={fromSlot:number;startedAt:number;endsAt:number};
export type FishingChat={id:string;text:string;createdAt:number;expiresAt:number};
export type FishingEmote={id:string;emoji:string;createdAt:number;expiresAt:number};
export type FishingParticipant={id:string;name:string;preset:AvatarPreset;slot:number;joinedAt:number;lastSeenAt:number;fishing:FishingState;movement?:FishingSeatMovement;chat?:FishingChat;emote?:FishingEmote};
export type FishingAmbientParticipant=FishingParticipant&{ambient:true};
export type FishingEvent={id:string;actorId:string;name:string;at:number;type:'join'|'leave'|'cast'|'catch'|'collect';speciesId?:string;lengthCm?:number};
export type FishingSnapshot={roomId:'ocean';revision:number;serverNow:number;capacity:typeof FISHING_CAPACITY;participants:FishingParticipant[];ambientParticipants:FishingAmbientParticipant[];events:FishingEvent[];self:{id:string;role:'visitor'|'participant'|'spectator';lastSequence:number;fishing:FishingState;inventory:Backpack}};
export type FishingInput={type:'join'|'profile';name:string;preset:AvatarPreset}|{type:'heartbeat'|'leave'|'cast'|'reel'}|{type:'collect';catchId:string}|{type:'move-seat';slot:number}|{type:'chat';text:string}|{type:'emote';emoji:string};
export type FishingCommand=FishingInput&{roomId:'ocean';requestId:string;sequence:number};
export function projectFishing(state:FishingState,now:number):FishingState { if(state.phase==='waiting'||state.phase==='bite')return {...state,phase:now>=(state.expiresAt??Infinity)?'escaped':now>=(state.biteAt??Infinity)?'bite':'waiting'};return state; }
