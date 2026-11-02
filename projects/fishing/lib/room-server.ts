import { getTrack, MUSIC_CATALOG, TRACK_IDS, DEFAULT_TRACK_ID } from './music-catalog';
import { adjacentTrack, seededShuffle } from './music-navigation';
import { beginPersonalAction, personalRouteTime } from './room-action-state';
import { lightModeAt } from './room-lighting';
import { AVATAR_PRESETS, ROOM_ACTIONS, GROUP_ACTIONS, GROUP_ACTION_LEAD_MS, GROUP_WAVE_LEAD_MS, GROUP_ACTION_COOLDOWN_MS, GROUP_ACTION_DURATIONS_MS, LIGHT_MODES, ROOM_CAPACITY, SEAT_TTL_MS, EVENT_HISTORY_LIMIT } from './room-types';
import type { Participant, RoomCommand, RoomErrorCode, RoomEvent, RoomSnapshot, RoomTrack, LightMode, RoomGroupAction } from './room-types';

export class RoomError extends Error {
  code: RoomErrorCode;
  status: number;
  retryAfterMs?: number;
  lastSequence?: number;
  constructor(code: RoomErrorCode, message: string, status = 400, details: { retryAfterMs?: number; lastSequence?: number } = {}) {
    super(message); this.name = 'RoomError'; this.code = code; this.status = status;
    Object.assign(this, details);
  }
}
export type StoredRoom = { revision: number; participants: Participant[]; track: RoomTrack; playlistSeed?: string; groupAction?: RoomGroupAction; lightMode: LightMode; lightChangedAt?: number; events: RoomEvent[]; totalVisits: number; lastControlAt: number };
export type StoredVisit = {
  lastSequence: number;
  hasJoined: boolean;
  isPresent: boolean;
  receipts: { requestId: string; sequence: number; fingerprint: string }[];
  lastActionAt: number;
  lastProfileAt: number;
  lastJoinAt: number;
  tokens: number;
  tokenAt: number;
};
export interface RoomStore {
  ensureRoom(roomId: string, initial: StoredRoom): Promise<void>;
  readRoom(roomId: string): Promise<StoredRoom>;
  ensureVisit(roomId: string, actorId: string, initial: StoredVisit): Promise<void>;
  readVisit(roomId: string, actorId: string): Promise<StoredVisit>;
  /** Optional joined read avoids writes and separate round trips for established visitors. */
  readState?(roomId: string, actorId: string): Promise<{room: StoredRoom | null; visit: StoredVisit | null}>;
  commit(roomId: string, expectedRevision: number, next: StoredRoom, actorId?: string, expectedSequence?: number, visit?: StoredVisit): Promise<boolean>;
}

export function validateRoomId(value: unknown): string {
  if (value !== 'main' && value !== 'soundcheck') throw new RoomError('INVALID_COMMAND', 'This demo supports the main and soundcheck rooms only.');
  return value;
}
export function validateCommand(input: unknown): RoomCommand {
  const invalid = () => { throw new RoomError('INVALID_COMMAND', 'Invalid room command.'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  validateRoomId(value.roomId);
  if (typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) return invalid();
  const keys: Record<string, string[]> = { join:['name','preset'], profile:['name','preset'], heartbeat:[], leave:[], action:['action'], 'group-action':['kind'], track:['trackId'], 'track-step':['direction'], lights:['lightMode'] };
  if (typeof value.type !== 'string' || !Object.hasOwn(keys,value.type)) return invalid();
  const allowed = new Set(['roomId','requestId','sequence','type', ...keys[value.type]]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return invalid();
  if (value.type === 'join' || value.type === 'profile') {
    if (typeof value.name !== 'string' || !value.name.trim() || [...value.name.trim()].length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(value.name) || !AVATAR_PRESETS.includes(value.preset as never)) return invalid();
    return { ...value, name: value.name.trim() } as RoomCommand;
  }
  if (value.type === 'action' && !ROOM_ACTIONS.includes(value.action as never)) return invalid();
  if (value.type === 'group-action' && !GROUP_ACTIONS.includes(value.kind as never)) return invalid();
  if (value.type === 'track' && !TRACK_IDS.includes(value.trackId as never)) return invalid();
  if (value.type === 'track-step' && value.direction !== -1 && value.direction !== 1) return invalid();
  if (value.type === 'lights' && !LIGHT_MODES.includes(value.lightMode as never)) return invalid();
  return value as RoomCommand;
}
const initialVisit = (now: number): StoredVisit => ({lastSequence:0,hasJoined:false,isPresent:false,receipts:[],lastActionAt:0,lastProfileAt:0,lastJoinAt:0,tokens:12,tokenAt:now});
function initialRoom(now: number): StoredRoom {
  const track = getTrack(DEFAULT_TRACK_ID);
  return {revision:0,participants:[],track:{id:track.id,startedAt:now,durationMs:track.durationMs},playlistSeed:crypto.randomUUID(),lightMode:'neon',lightChangedAt:now,events:[],totalVisits:0,lastControlAt:0};
}
function initializeLighting(room: StoredRoom, now: number): boolean {
  if (Number.isFinite(room.lightChangedAt)) return false;
  // Legacy rooms keep their visible color for the first full minute. The usual
  // room CAS persists one winning epoch for all readers, with no synthetic event.
  room.lightChangedAt = now;
  return true;
}
function playlistOrder(roomId: string, room: StoredRoom) {
  // Older rooms have no seed. A stable fallback gives every reader the same
  // order without rewriting the current track anchor or requiring a migration.
  return seededShuffle(MUSIC_CATALOG.map(track=>track.id),room.playlistSeed??`afterhours:${roomId}:playlist-v1`);
}
function addEvent(room: StoredRoom, event: Omit<RoomEvent, 'id'>) {
  room.events.push({id:crypto.randomUUID(),...event});
  room.events = room.events.slice(-EVENT_HISTORY_LIMIT);
}
function expireSeats(room: StoredRoom, now: number): boolean {
  const expired = room.participants.filter((p) => now - p.lastSeenAt >= SEAT_TTL_MS);
  if (!expired.length) return false;
  room.participants = room.participants.filter((p) => now - p.lastSeenAt < SEAT_TTL_MS);
  for (const p of expired) addEvent(room,{type:'leave',actorId:p.id,name:p.name,at:now,value:'expired'});
  return true;
}
function publicSnapshot(roomId: string, room: StoredRoom, actorId: string, visit: StoredVisit, now: number): RoomSnapshot {
  // Duration is catalog metadata, not a new playback command: keep the epoch
  // anchor and revision stable when an asset is upgraded or a legacy ID resolves.
  const catalogTrack = getTrack(room.track.id);
  const track = {...room.track,id:catalogTrack.id,durationMs:catalogTrack.durationMs};
  const lightCycle = {mode:room.lightMode,startedAt:room.lightChangedAt!};
  return {roomId,revision:room.revision,serverNow:now,self:{id:actorId,role:room.participants.some((p)=>p.id===actorId)?'participant':visit.isPresent?'spectator':'visitor',lastSequence:visit.lastSequence},participants:room.participants,capacity:ROOM_CAPACITY,track,playlistOrder:playlistOrder(roomId,room),...(room.groupAction?{groupAction:room.groupAction}:{}),lightMode:lightModeAt(lightCycle,now,room.lightMode),lightCycle,events:room.events,totalVisits:room.totalVisits};
}
function fingerprint(command: RoomCommand): string {
  return JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b))));
}
function rateLimit(retryAfterMs: number) { return new RoomError('RATE_LIMITED','Give the room a moment before trying again.',429,{retryAfterMs:Math.max(1,Math.ceil(retryAfterMs))}); }

export function createRoomService(store: RoomStore, options: {now?: () => number} = {}) {
  const clock = options.now ?? Date.now;
  async function loadState(roomId: string, actorId: string): Promise<[StoredRoom, StoredVisit]> {
    if (store.readState) {
      let state=await store.readState(roomId,actorId);
      if (state.room && state.visit) return [state.room,state.visit];
      if (!state.room) await store.ensureRoom(roomId,initialRoom(clock()));
      if (!state.visit) await store.ensureVisit(roomId,actorId,initialVisit(clock()));
      // A concurrent request may have won either insert, so read the persisted
      // winners rather than returning this request's proposed initial values.
      state=await store.readState(roomId,actorId);
      if (!state.room || !state.visit) throw new RoomError('UNAVAILABLE','The room could not be loaded.',503);
      return [state.room,state.visit];
    }
    await store.ensureRoom(roomId,initialRoom(clock()));
    await store.ensureVisit(roomId,actorId,initialVisit(clock()));
    return Promise.all([store.readRoom(roomId),store.readVisit(roomId,actorId)]);
  }
  async function snapshot(roomId: string, actorId: string): Promise<RoomSnapshot> {
    validateRoomId(roomId);
    for (let attempt=0; attempt<32; attempt++) {
      const [room,visit] = await loadState(roomId,actorId);
      const now=clock(), revision=room.revision;
      const lightingInitialized=initializeLighting(room,now);
      if (expireSeats(room,now) || lightingInitialized) { room.revision++; if (!await store.commit(roomId,revision,room)) continue; }
      return publicSnapshot(roomId,room,actorId,visit,now);
    }
    throw new RoomError('ROOM_BUSY','The room is busy. Please retry.',503,{retryAfterMs:500});
  }
  async function command(actorId: string, input: unknown): Promise<RoomSnapshot> {
    const cmd=validateCommand(input), digest=fingerprint(cmd);
    for (let attempt=0; attempt<32; attempt++) {
      const [room,visit]=await loadState(cmd.roomId,actorId);
      const now=clock(), revision=room.revision, expectedSequence=visit.lastSequence;
      const receipt=visit.receipts.find((r)=>r.requestId===cmd.requestId);
      if(receipt) {
        if(receipt.fingerprint!==digest) throw new RoomError('REQUEST_CONFLICT','A request ID cannot be reused with different data.',409,{lastSequence:visit.lastSequence});
        return snapshot(cmd.roomId,actorId);
      }
      if(cmd.sequence<=visit.lastSequence) throw new RoomError('STALE_SEQUENCE','This command is older than your latest action. Refresh and retry.',409,{lastSequence:visit.lastSequence});
      initializeLighting(room,now);
      expireSeats(room,now);
      const participant=room.participants.find((p)=>p.id===actorId);
      // The HTTP boundary already established a server-issued device identity.
      // Only avatar-specific commands require a seat; listeners share music and lights.
      if ((cmd.type==='action'||cmd.type==='profile') && !participant) throw new RoomError('NOT_PARTICIPANT','Join an available spot before changing your avatar.',403);
      const tokens=Math.min(12,visit.tokens+Math.max(0,now-visit.tokenAt)/1000);
      if(tokens<1) throw rateLimit((1-tokens)*1000);
      visit.tokens=tokens-1;visit.tokenAt=now;
      switch(cmd.type) {
        case 'join': {
          if(now-visit.lastJoinAt<1000) throw rateLimit(1000-(now-visit.lastJoinAt));
          visit.lastJoinAt=now;visit.isPresent=true;
          if(!visit.hasJoined){visit.hasJoined=true;room.totalVisits++;}
          if(participant){participant.lastSeenAt=now;participant.name=cmd.name;participant.preset=cmd.preset;}
          else if(room.participants.length<ROOM_CAPACITY){
            const slot=Array.from({length:ROOM_CAPACITY},(_,i)=>i).find((i)=>!room.participants.some((p)=>p.slot===i))!;
            room.participants.push({id:actorId,name:cmd.name,preset:cmd.preset,slot,joinedAt:now,lastSeenAt:now,action:'dance',actionAt:now,actionUntil:0,routePauseMs:0});
            addEvent(room,{type:'join',actorId,name:cmd.name,at:now});
          }
          break;
        }
        case 'heartbeat': if(participant)participant.lastSeenAt=now;break;
        case 'leave':
          if(participant){room.participants=room.participants.filter((p)=>p.id!==actorId);addEvent(room,{type:'leave',actorId,name:participant.name,at:now});}
          visit.isPresent=false;break;
        case 'action':
          if(room.groupAction && now<room.groupAction.endsAt)throw rateLimit(room.groupAction.endsAt-now);
          if(now-visit.lastActionAt<350)throw rateLimit(350-(now-visit.lastActionAt));
          visit.lastActionAt=now;Object.assign(participant!,beginPersonalAction(participant!,cmd.action,now));
          addEvent(room,{type:'action',actorId,name:participant!.name,at:now,value:cmd.action});break;
        case 'group-action': {
          if(room.groupAction && now<room.groupAction.endsAt+GROUP_ACTION_COOLDOWN_MS)throw rateLimit(room.groupAction.endsAt+GROUP_ACTION_COOLDOWN_MS-now);
          const startsAt=now+(cmd.kind==='wave'?GROUP_WAVE_LEAD_MS:GROUP_ACTION_LEAD_MS);
          const sourceClockBySlot=Array.from({length:ROOM_CAPACITY},(_,slot)=>{
            const dancer=room.participants.find(person=>person.slot===slot);
            return dancer?personalRouteTime(dancer,startsAt):startsAt;
          });
          room.groupAction={id:crypto.randomUUID(),kind:cmd.kind,startsAt,endsAt:startsAt+GROUP_ACTION_DURATIONS_MS[cmd.kind],beatMs:60000/getTrack(room.track.id).bpm,version:2,sourceClockBySlot};
          if(participant)participant.lastSeenAt=now;
          addEvent(room,{type:'group-action',actorId,name:participant?.name??'一位听众',at:now,value:cmd.kind});break;
        }
        case 'profile':
          if(now-visit.lastProfileAt<1000)throw rateLimit(1000-(now-visit.lastProfileAt));
          visit.lastProfileAt=now;participant!.name=cmd.name;participant!.preset=cmd.preset;participant!.lastSeenAt=now;
          addEvent(room,{type:'profile',actorId,name:cmd.name,at:now,value:cmd.preset});break;
        case 'track':
        case 'track-step': {
          if(now-room.lastControlAt<1000)throw rateLimit(1000-(now-room.lastControlAt));
          // Resolve directions against the winning server state, never against
          // a possibly stale client song or a client-specific shuffled order.
          const trackId=cmd.type==='track'?cmd.trackId:adjacentTrack(playlistOrder(cmd.roomId,room).map(id=>({id})),getTrack(room.track.id).id,cmd.direction)?.id;
          if(!trackId)throw new RoomError('INVALID_COMMAND','There are no other songs in this room.');
          const track=getTrack(trackId);room.track={id:track.id,startedAt:now,durationMs:track.durationMs};room.lastControlAt=now;
          if(participant)participant.lastSeenAt=now;
          addEvent(room,{type:'track',actorId,name:participant?.name??'一位听众',at:now,value:track.id});break;
        }
        case 'lights':
          if(now-room.lastControlAt<1000)throw rateLimit(1000-(now-room.lastControlAt));
          room.lightMode=cmd.lightMode;room.lightChangedAt=now;room.lastControlAt=now;
          if(participant)participant.lastSeenAt=now;
          addEvent(room,{type:'lights',actorId,name:participant?.name??'一位听众',at:now,value:cmd.lightMode});break;
      }
      visit.lastSequence=cmd.sequence;visit.receipts.push({requestId:cmd.requestId,sequence:cmd.sequence,fingerprint:digest});visit.receipts=visit.receipts.slice(-32);
      room.revision++;
      if(await store.commit(cmd.roomId,revision,room,actorId,expectedSequence,visit))return publicSnapshot(cmd.roomId,room,actorId,visit,now);
    }
    throw new RoomError('ROOM_BUSY','The room is busy. Please retry.',503,{retryAfterMs:500});
  }
  return {snapshot,command};
}
