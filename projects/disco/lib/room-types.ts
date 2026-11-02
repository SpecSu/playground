export type { DanceRound, DanceHit } from './dance-machine';
import type { DanceRound, DanceHit } from './dance-machine';
import type { ParticipantMovement } from './room-movement';
import type { TrackId } from './music-catalog';

export const CANONICAL_AVATAR_PRESETS = [
  'milk-frog', 'niulai', 'feidudu', 'miaocuijiao', 'banana-cat', 'sword-shield-dog',
  'human-lx', 'human-kelly', 'human-bear', 'human-subeike', 'human-jiji', 'human-jiaxin',
] as const;
/** Legacy IDs remain valid on the wire and in saved rooms, but are not new choices. */
export const AVATAR_PRESETS = [
  ...CANONICAL_AVATAR_PRESETS,
  'cat', 'frog', 'dog', 'capybara', 'panda', 'monster-blob', 'monster-tower', 'monster-star',
] as const;
export const ROOM_ACTIONS = ['dance', 'bounce', 'spin', 'wave', 'love', 'laugh', 'punch', 'ghost'] as const;
export const GROUP_ACTIONS = ['train', 'wave', 'unison', 'battle', 'grid'] as const;
export const GROUP_ACTION_LEAD_MS = 3000;
export const GROUP_WAVE_LEAD_MS = 350;
export const GROUP_TRAIN_LEAD_MS = 350;
export const GROUP_ACTION_COOLDOWN_MS = 5000;
/** Durations for newly accepted events; stored descriptors keep their own end. */
export const GROUP_ACTION_DURATIONS_MS = { train: 16000, wave: 10000, unison: 18000, battle: 26000, grid: 22000 } as const;
export const LIGHT_MODES = ['neon', 'sunset', 'ice', 'ember', 'acid', 'moon'] as const;
export const ROOM_CAPACITY = 10 as const;
export const SEAT_TTL_MS = 60_000;
export const EVENT_HISTORY_LIMIT = 40;
export type AvatarPreset = typeof AVATAR_PRESETS[number];
export type CanonicalAvatarPreset = typeof CANONICAL_AVATAR_PRESETS[number];
/** Retired choices use an existing character without rewriting saved room data. */
export function resolveAvatarPreset(preset: AvatarPreset): CanonicalAvatarPreset {
  switch (preset) {
    case 'cat': return 'miaocuijiao';
    case 'frog':
    case 'monster-star': return 'milk-frog';
    case 'dog': return 'sword-shield-dog';
    case 'capybara':
    case 'monster-blob': return 'feidudu';
    case 'panda':
    case 'monster-tower': return 'niulai';
    default: return preset;
  }
}
export type RoomAction = typeof ROOM_ACTIONS[number];
export type GroupActionKind = typeof GROUP_ACTIONS[number];
export type RoomGroupAction = {
  id: string;
  kind: GroupActionKind;
  startsAt: number;
  endsAt: number;
  beatMs: number;
  /** Keep persisted v1/v2 choreography unchanged across a deployment. */
  version: 1 | 2 | 3;
  /** Exactly ten effective personal route clocks, indexed by authoritative seat. */
  sourceClockBySlot: number[];
  /** Captured release positions let repeated trains jump from their current circle. */
  trainStartDistance?: number;
  trainReleasePauseBySlot?: number[];
  sourcePositionBySlot?: { x: number; z: number; heading: number }[];
};
export type GroupAction = RoomGroupAction;
export type LightMode = typeof LIGHT_MODES[number];
/** The last manual lighting choice and its shared server-clock epoch. */
export type RoomLightCycle = { mode: LightMode; startedAt: number };
/** Plain text with a server-clock visibility window; never render as HTML. */
export type ParticipantChat = { text: string; sentAt: number; expiresAt: number };
export type Participant = {
  id: string;
  name: string;
  preset: AvatarPreset;
  slot: number;
  joinedAt: number;
  lastSeenAt: number;
  action: RoomAction;
  actionAt: number;
  /** Optional for legacy participants: no end timestamp means no route hold. */
  actionUntil?: number;
  /** Completed time spent in earlier personal holds; group overlays never add to it. */
  routePauseMs?: number;
  /** Optional for older stored rooms and participants without a live message. */
  chat?: ParticipantChat;
};
export type RoomTrack = { id: TrackId; startedAt: number; durationMs: number };
export type RoomEvent = {
  id: string;
  type: 'join' | 'leave' | 'action' | 'track' | 'lights' | 'profile' | 'group-action';
  actorId: string;
  name: string;
  at: number;
  value?: string;
};
export type RoomSnapshot = {
  roomId: string;
  revision: number;
  serverNow: number;
  self: { id: string; role: 'visitor' | 'participant' | 'spectator'; lastSequence: number; lastMoveSequence?: number };
  participants: Participant[];
  movements?: ParticipantMovement[];
  capacity: typeof ROOM_CAPACITY;
  track: RoomTrack;
  playlistOrder: TrackId[];
  groupAction?: RoomGroupAction;
  danceRound?: DanceRound;
  lightMode: LightMode;
  /** Optional for older cached snapshots; automatic rotation is a pure projection. */
  lightCycle?: RoomLightCycle;
  events: RoomEvent[];
  totalVisits: number;
};
type CommandBase = { roomId: string; requestId: string; sequence: number };
export type RoomCommand = CommandBase & (
  | { type: 'join'; name: string; preset: AvatarPreset }
  | { type: 'profile'; name: string; preset: AvatarPreset }
  | { type: 'heartbeat' | 'leave' }
  | { type: 'action'; action: RoomAction }
  | { type: 'chat'; text: string }
  | { type: 'group-action'; kind: GroupActionKind }
  | { type: 'dance-start' }
  | { type: 'dance-submit'; roundId: string; hits: DanceHit[] }
  | { type: 'track'; trackId: TrackId }
  | { type: 'track-step'; direction: -1 | 1 }
  | { type: 'lights'; lightMode: LightMode }
);
export type RoomErrorCode = 'INVALID_COMMAND' | 'STALE_SEQUENCE' | 'REQUEST_CONFLICT' | 'NOT_PARTICIPANT' | 'RATE_LIMITED' | 'ROOM_BUSY' | 'FORBIDDEN' | 'UNAVAILABLE';
export type RoomErrorResponse = { error: { code: RoomErrorCode; message: string; retryAfterMs?: number; lastSequence?: number }; snapshot?: RoomSnapshot };
