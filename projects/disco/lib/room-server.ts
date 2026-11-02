import { clubAvatarName } from './club-avatar-catalog.ts';
import { CLUB_AMBIENT_CAST } from './club-ambient-cast.ts';
import { DANCE_CHART_VERSION, DANCE_MAX_NOTES, DANCE_DURATION_MS, DANCE_LEAD_MS, DANCE_SUBMIT_GRACE_MS, DANCE_TRACK_ID, DANCE_HIT_WINDOW_MS, danceRoundActive, generateDanceChart, scoreDanceHits, scoreDanceNpc } from './dance-machine';
import type { DanceRound, DanceRosterEntry } from './dance-machine';
import { getTrack, MUSIC_CATALOG, TRACK_IDS, DEFAULT_TRACK_ID } from './music-catalog';
import { adjacentTrack, seededShuffle } from './music-navigation';
import { beginPersonalAction, personalRouteTime } from './room-action-state';
import { lightModeAt } from './room-lighting';
import { CHAT_MAX_CHARACTERS, CHAT_DURATION_MS, CHAT_COOLDOWN_MS, normalizeChatText, chatAt } from './room-chat';
import { trainReleaseMotion, trainReleaseClock, TRAIN_RING_RADIUS, TRAIN_TOTAL_DISTANCE } from './club-train-motion.ts';
import { AVATAR_PRESETS, ROOM_ACTIONS, GROUP_ACTIONS, GROUP_ACTION_LEAD_MS, GROUP_WAVE_LEAD_MS, GROUP_TRAIN_LEAD_MS, GROUP_ACTION_COOLDOWN_MS, GROUP_ACTION_DURATIONS_MS, LIGHT_MODES, ROOM_CAPACITY, SEAT_TTL_MS, EVENT_HISTORY_LIMIT } from './room-types';
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
export type StoredRoom = { revision: number; participants: Participant[]; track: RoomTrack; playlistSeed?: string; groupAction?: RoomGroupAction; danceRound?: DanceRound; lightMode: LightMode; lightChangedAt?: number; events: RoomEvent[]; totalVisits: number; lastControlAt: number };
export type StoredVisit = {
  lastSequence: number;
  hasJoined: boolean;
  isPresent: boolean;
  receipts: { requestId: string; sequence: number; fingerprint: string }[];
  lastActionAt: number;
  lastProfileAt: number;
  lastJoinAt: number;
  /** Optional so visits persisted before chat need no migration. */
  lastChatAt?: number;
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
  const keys: Record<string, string[]> = { join:['name','preset'], profile:['name','preset'], heartbeat:[], leave:[], action:['action'], chat:['text'], 'group-action':['kind'], 'dance-start':[], 'dance-submit':['roundId','hits'], track:['trackId'], 'track-step':['direction'], lights:['lightMode'] };
  if (typeof value.type !== 'string' || !Object.hasOwn(keys,value.type)) return invalid();
  const allowed = new Set(['roomId','requestId','sequence','type', ...keys[value.type]]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return invalid();
  if (value.type === 'join' || value.type === 'profile') {
    if (typeof value.name !== 'string' || !value.name.trim() || [...value.name.trim()].length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(value.name) || !AVATAR_PRESETS.includes(value.preset as never)) return invalid();
    return { ...value, name: value.name.trim() } as RoomCommand;
  }
  if (value.type === 'chat') {
    if (typeof value.text !== 'string') return invalid();
    const text = normalizeChatText(value.text);
    // Emoji ZWJ sequences and script ZWNJ/ZWJ are ordinary text. Other format
    // controls (including bidi overrides), control codes and lone surrogates are not.
    const withoutJoiners = text.replace(/[\u200c\u200d]/g, '');
    if (!withoutJoiners.trim() || [...text].length > CHAT_MAX_CHARACTERS || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(withoutJoiners)) return invalid();
    return { ...value, text } as RoomCommand;
  }
  if (value.type === 'dance-submit') {
    if (typeof value.roundId !== 'string' || value.roundId.length > 100 || !Array.isArray(value.hits) || value.hits.length > DANCE_MAX_NOTES) return invalid();
    const seen = new Set<number>();
    for (const hit of value.hits) {
      if (!hit || typeof hit !== 'object' || Array.isArray(hit) || Object.keys(hit).some(key => key !== 'noteId' && key !== 'offsetMs') || !Number.isSafeInteger(hit.noteId) || hit.noteId < 0 || hit.noteId >= DANCE_MAX_NOTES || !Number.isFinite(hit.offsetMs) || Math.abs(hit.offsetMs) > DANCE_HIT_WINDOW_MS || seen.has(hit.noteId)) return invalid();
      seen.add(hit.noteId);
    }
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
function discardExpiredChats(room: StoredRoom, now: number) {
  for (const person of room.participants) if (person.chat && now >= person.chat.expiresAt) delete person.chat;
}
const DANCE_AMBIENT: DanceRosterEntry[] = CLUB_AMBIENT_CAST.map(({id,name,preset,slot}) => ({id,name,preset,slot,isNpc:true}));
function danceRoster(room: StoredRoom, at: number): DanceRosterEntry[] {
  const humans = room.participants.filter(p => p.joinedAt <= at && at-p.lastSeenAt < SEAT_TTL_MS)
    .map(({id,name,preset,slot}) => ({id,name,preset,slot,isNpc:false}));
  return [...humans,...DANCE_AMBIENT.filter(p => !humans.some(h => h.slot === p.slot))].sort((a,b)=>a.slot-b.slot);
}
/** Advance before expiring seats so a late read reconstructs the scheduled start. */
function advanceDanceRound(room: StoredRoom, now: number): boolean {
  const round = room.danceRound;
  if (!round || round.rosterFrozen || now < round.startsAt) return false;
  round.roster = danceRoster(room,round.startsAt);
  round.rosterFrozen = true;
  round.results = round.roster.filter(p=>p.isNpc).map(p=>({actorId:p.id,...scoreDanceNpc(round.seed,p.id,round.version),submittedAt:round.endsAt}));
  return true;
}
function publicSnapshot(roomId: string, room: StoredRoom, actorId: string, visit: StoredVisit, now: number): RoomSnapshot {
  // Duration is catalog metadata, not a new playback command: keep the epoch
  // anchor and revision stable when an asset is upgraded or a legacy ID resolves.
  const catalogTrack = getTrack(room.track.id);
  const track = {...room.track,id:catalogTrack.id,durationMs:catalogTrack.durationMs};
  const lightCycle = {mode:room.lightMode,startedAt:room.lightChangedAt!};
  // Visibility expires without a room write or revision bump. Stored text is
  // discarded on the next ordinary write; receipts contain only a chat digest.
  const participants = room.participants.map(participant => {
    if (!participant.chat || chatAt(participant, now)) return participant;
    const visible = { ...participant };
    delete visible.chat;
    return visible;
  });
  // Project legacy NPC names from the same character metadata as current cast labels.
  // Frozen rounds, scores and every real participant's chosen name remain untouched.
  return {roomId,revision:room.revision,serverNow:now,self:{id:actorId,role:room.participants.some((p)=>p.id===actorId)?'participant':visit.isPresent?'spectator':'visitor',lastSequence:visit.lastSequence},participants,capacity:ROOM_CAPACITY,track,playlistOrder:playlistOrder(roomId,room),...(room.groupAction?{groupAction:room.groupAction}:{}),...(room.danceRound?{danceRound:{...room.danceRound,roster:room.danceRound.roster.map(entry=>entry.isNpc?{...entry,name:clubAvatarName(entry.preset)}:entry),results:now>=room.danceRound.endsAt?room.danceRound.results:[]}}:{}),lightMode:lightModeAt(lightCycle,now,room.lightMode),lightCycle,events:room.events,totalVisits:room.totalVisits};
}
async function fingerprint(command: RoomCommand): Promise<string> {
  const serialized = JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b))));
  // Keep legacy receipts compatible; hash chat and bounded dance-hit payloads.
  if (command.type !== 'chat' && command.type !== 'dance-submit') return serialized;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return `${command.type}:sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
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
      const danceAdvanced=advanceDanceRound(room,now);
      if (expireSeats(room,now) || lightingInitialized || danceAdvanced) { discardExpiredChats(room,now);room.revision++; if (!await store.commit(roomId,revision,room)) continue; }
      return publicSnapshot(roomId,room,actorId,visit,now);
    }
    throw new RoomError('ROOM_BUSY','The room is busy. Please retry.',503,{retryAfterMs:500});
  }
  async function command(actorId: string, input: unknown): Promise<RoomSnapshot> {
    const cmd=validateCommand(input), digest=await fingerprint(cmd);
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
      advanceDanceRound(room,now);
      expireSeats(room,now);
      const participant=room.participants.find((p)=>p.id===actorId);
      // The HTTP boundary already established a server-issued device identity.
      // Avatar and group controls require a seat; listeners share music and lights.
      if ((cmd.type==='action'||cmd.type==='profile'||cmd.type==='chat'||cmd.type==='group-action'||cmd.type==='dance-start') && !participant) throw new RoomError('NOT_PARTICIPANT','Join an available spot before using this control.',403);
      if (danceRoundActive(room.danceRound,now) && ['action','group-action','track','track-step','dance-start'].includes(cmd.type)) throw rateLimit(room.danceRound!.endsAt-now);
      const tokens=Math.min(12,visit.tokens+Math.max(0,now-visit.tokenAt)/1000);
      if(tokens<1) throw rateLimit((1-tokens)*1000);
      visit.tokens=tokens-1;visit.tokenAt=now;
      switch(cmd.type) {
        case 'dance-start': {
          if (room.groupAction && now < room.groupAction.endsAt) throw rateLimit(room.groupAction.endsAt-now);
          // Preserve the result submission window before another round replaces it.
          if (room.danceRound && now < room.danceRound.endsAt+DANCE_SUBMIT_GRACE_MS) throw rateLimit(room.danceRound.endsAt+DANCE_SUBMIT_GRACE_MS-now);
          const startsAt=now+DANCE_LEAD_MS, id=crypto.randomUUID();
          room.danceRound={id,version:DANCE_CHART_VERSION,seed:id,trackId:DANCE_TRACK_ID,createdAt:now,startsAt,endsAt:startsAt+DANCE_DURATION_MS,rosterFrozen:false,roster:danceRoster(room,now),results:[]};
          participant!.lastSeenAt=now;
          break;
        }
        case 'dance-submit': {
          const round=room.danceRound;
          if (!round || cmd.roundId!==round.id || now<round.endsAt || now>round.endsAt+DANCE_SUBMIT_GRACE_MS) throw new RoomError('INVALID_COMMAND','This round is not accepting results.');
          if (!round.roster.some(p=>p.id===actorId&&!p.isNpc)) throw new RoomError('NOT_PARTICIPANT','You are watching this round.',403);
          if (round.results.some(result=>result.actorId===actorId)) throw new RoomError('REQUEST_CONFLICT','Your result was already submitted.',409);
          const chart=generateDanceChart(round.seed,round.version);
          if(cmd.hits.some(hit=>hit.noteId>=chart.length))throw new RoomError('INVALID_COMMAND','This note is not in the round chart.');
          round.results.push({actorId,...scoreDanceHits(chart,cmd.hits),submittedAt:now});
          if(participant)participant.lastSeenAt=now;
          break;
        }
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
        case 'chat':
          if(visit.lastChatAt!==undefined && now-visit.lastChatAt<CHAT_COOLDOWN_MS)throw rateLimit(CHAT_COOLDOWN_MS-(now-visit.lastChatAt));
          visit.lastChatAt=now;participant!.lastSeenAt=now;
          participant!.chat={text:cmd.text,sentAt:now,expiresAt:now+CHAT_DURATION_MS};break;
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
          const startsAt=now+(cmd.kind==='wave'?GROUP_WAVE_LEAD_MS:cmd.kind==='train'?GROUP_TRAIN_LEAD_MS:GROUP_ACTION_LEAD_MS);
          const sourceClockBySlot=Array.from({length:ROOM_CAPACITY},(_,slot)=>{
            const dancer=room.participants.find(person=>person.slot===slot);
            return dancer?personalRouteTime(dancer,startsAt):startsAt;
          });
          const previousTrain=room.groupAction?.kind==='train'&&room.groupAction.version===3?room.groupAction:null;
          const trainStartDistance=previousTrain?((previousTrain.trainStartDistance??0)+TRAIN_TOTAL_DISTANCE)%(2*Math.PI*TRAIN_RING_RADIUS):0;
          const sourcePositionBySlot=cmd.kind==='train'&&previousTrain?Array.from({length:ROOM_CAPACITY},(_,slot)=>{const dancer=room.participants.find(person=>person.slot===slot);const motion=trainReleaseMotion(trainReleaseClock(startsAt,dancer,previousTrain),slot,previousTrain)!;return {x:motion.x,z:motion.z,heading:motion.heading};}):undefined;
          const trainReleasePauseBySlot=cmd.kind==='train'?Array.from({length:ROOM_CAPACITY},(_,slot)=>{const dancer=room.participants.find(person=>person.slot===slot);const end=startsAt+GROUP_ACTION_DURATIONS_MS.train;return dancer?end-personalRouteTime(dancer,end):0;}):undefined;
          room.groupAction={id:crypto.randomUUID(),kind:cmd.kind,startsAt,endsAt:startsAt+GROUP_ACTION_DURATIONS_MS[cmd.kind],beatMs:60000/getTrack(room.track.id).bpm,version:cmd.kind==='train'?3:2,sourceClockBySlot,...(trainReleasePauseBySlot?{trainReleasePauseBySlot}:{}),...(sourcePositionBySlot?{sourcePositionBySlot,trainStartDistance}:{})};
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
      if (room.danceRound && !room.danceRound.rosterFrozen) room.danceRound.roster=danceRoster(room,now);
      visit.lastSequence=cmd.sequence;visit.receipts.push({requestId:cmd.requestId,sequence:cmd.sequence,fingerprint:digest});visit.receipts=visit.receipts.slice(-32);
      discardExpiredChats(room,now);
      room.revision++;
      if(await store.commit(cmd.roomId,revision,room,actorId,expectedSequence,visit))return publicSnapshot(cmd.roomId,room,actorId,visit,now);
    }
    throw new RoomError('ROOM_BUSY','The room is busy. Please retry.',503,{retryAfterMs:500});
  }
  return {snapshot,command};
}
