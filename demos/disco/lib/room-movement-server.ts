import { validateRoomId } from './room-server';
import type { StoredRoom, StoredVisit } from './room-server';
import type { Participant } from './room-types';
import { SEAT_TTL_MS } from './room-types';
import { personalRouteTime } from './room-action-state';
import { trainReleaseClock, trainReleaseMotion } from './club-train-motion.ts';
import { CLUB_BOOTH_BOUNDS, CLUB_WALK_BOUNDS, clubMotionAt } from './club-scene-motion';
import { MOVEMENT_BODY_RADIUS, MOVEMENT_PUBLISH_MS, MOVEMENT_SPEED_LIMIT } from './room-movement';
import type { MovementCommand, MovementErrorCode, MovementReply, ParticipantMovement } from './room-movement';

export class MovementError extends Error {
  code: MovementErrorCode;
  status: number;
  retryAfterMs?: number;
  lastMoveSequence?: number;
  constructor(code: MovementErrorCode, message: string, status = 400, details: { retryAfterMs?: number; lastMoveSequence?: number } = {}) {
    super(message); this.name = 'MovementError'; this.code = code; this.status = status;
    Object.assign(this, details);
  }
}
export type StoredMovement = { sample: ParticipantMovement; tokens: number; tokenAt: number; fingerprint: string; distanceCredit: number };
export type MovementState = { room: StoredRoom | null; visit: StoredVisit | null; moveSequence: number; movement: StoredMovement | null };
export interface MovementStore {
  readState(roomId: string, actorId: string): Promise<MovementState>;
  commit(roomId: string, actorId: string, expectedRoomRevision: number, expectedMoveSequence: number, movement: StoredMovement): Promise<boolean>;
}
const BURST = 2;
const TOKENS_PER_SECOND = 2;
const POSITION_SLACK = 0.25;
const TRAVEL_JITTER_CREDIT = MOVEMENT_SPEED_LIMIT * 1.5;
const MAX_TRAVEL_CREDIT = MOVEMENT_SPEED_LIMIT * 10 + TRAVEL_JITTER_CREDIT;
const invalid = (message = 'Invalid movement command.') => new MovementError('INVALID_COMMAND', message);
const stopped = (sample: Pick<MovementCommand, 'vx' | 'vz'>) => sample.vx === 0 && sample.vz === 0;

export function validateMovementCommand(input: unknown): MovementCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const value = input as Record<string, unknown>;
  const keys = ['roomId', 'moveSequence', 'joinedAt', 'groupId', 'mode', 'x', 'z', 'heading', 'vx', 'vz'];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  validateRoomId(value.roomId);
  if (!Number.isSafeInteger(value.moveSequence) || Number(value.moveSequence) < 1 || !Number.isSafeInteger(value.joinedAt) || Number(value.joinedAt) < 0) throw invalid();
  if (value.groupId !== null && (typeof value.groupId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.groupId))) throw invalid();
  if (value.mode !== 'manual' && value.mode !== 'auto') throw invalid();
  if (['x', 'z', 'heading', 'vx', 'vz'].some(key => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw invalid();
  const command = value as MovementCommand;
  if (Math.abs(command.heading) > Math.PI * 2 || Math.hypot(command.vx, command.vz) > MOVEMENT_SPEED_LIMIT + 1e-8 || (command.mode === 'auto' && !stopped(command))) throw invalid();
  return command;
}

/** Conservative disc-vs-box exclusion. Client rendering also sweeps between endpoints. */
export function isMovementPositionWalkable(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const u = (x - z) * Math.SQRT1_2, v = (x + z) * Math.SQRT1_2;
  const floor = CLUB_WALK_BOUNDS, booth = CLUB_BOOTH_BOUNDS;
  if (u < floor.minU - 1e-8 || u > floor.maxU + 1e-8 || v < floor.minV - 1e-8 || v > floor.maxV + 1e-8) return false;
  const radius = MOVEMENT_BODY_RADIUS + 0.02;
  return u <= booth.minU - radius || u >= booth.maxU + radius || v <= booth.minV - radius || v >= booth.maxV + radius;
}
function sameEpoch(sample: ParticipantMovement, command: MovementCommand) {
  return sample.joinedAt === command.joinedAt && sample.groupId === command.groupId;
}
function checkPosition(command: MovementCommand, participant: Participant, old: StoredMovement | null, now: number, group: StoredRoom['groupAction']) {
  if (!isMovementPositionWalkable(command.x, command.z)) throw invalid('Keep your avatar on the walkable floor and outside the DJ booth.');
  const previous = old?.sample;
  const matchingManual = previous?.mode === 'manual' && sameEpoch(previous, command);
  // Legacy formations park manual dancers at their canonical group-final pose.
  // A v2 wave retains its accepted point; a v3 train releases into a new route.
  // Neither case may compare a delayed first input with the moving roam clock.
  const parkedAfterGroup = previous?.mode === 'manual' && previous.joinedAt === command.joinedAt &&
    previous.groupId !== command.groupId && group && now >= group.endsAt;
  // Automatic dancers yield around manual bodies in the renderer, so their
  // displayed starting point is not recoverable from the server's route clock.
  // This noncompetitive demo adopts that already-validated endpoint once; all
  // later manual packets still spend the bounded server-time travel budget.
  // The v3 train has a shared release origin, so it never needs free adoption.
  const releasedTrain = group ? trainReleaseMotion(trainReleaseClock(now, participant, group), participant.slot, group) : null;
  if (command.mode === 'manual' && !matchingManual && !parkedAfterGroup && !releasedTrain) return TRAVEL_JITTER_CREDIT;
  const retainedWavePoint = parkedAfterGroup && group.kind === 'wave' && group.version === 2;
  const origin = matchingManual || retainedWavePoint ? previous : releasedTrain ?? clubMotionAt(personalRouteTime(participant, parkedAfterGroup ? group.endsAt : now), participant.slot);
  // Server elapsed time can cover a slow HTTP round trip, up to ten seconds
  // plus bounded jitter. A new manual epoch starts with only the jitter budget,
  // so the larger lag allowance cannot become an immediate first-packet jump.
  const distance = Math.hypot(command.x - origin.x, command.z - origin.z);
  const available = matchingManual
    ? Math.min(MAX_TRAVEL_CREDIT, (old?.distanceCredit ?? TRAVEL_JITTER_CREDIT) + MOVEMENT_SPEED_LIMIT * Math.max(0, now - previous.acceptedAt) / 1000)
    // A parked group handoff needs only one publish interval, not a full
    // second of doubled-speed travel, before regular elapsed-time credit begins.
    : MOVEMENT_SPEED_LIMIT * MOVEMENT_PUBLISH_MS / 1000 + POSITION_SLACK;
  if (distance > available + 1e-8) throw invalid('That movement was too far. Refresh your position and try again.');
  return Math.max(0, (matchingManual ? available : TRAVEL_JITTER_CREDIT) - distance);
}
function fingerprint(command: MovementCommand) {
  return JSON.stringify([command.roomId, command.moveSequence, command.joinedAt, command.groupId, command.mode, command.x, command.z, command.heading, command.vx, command.vz]);
}
export function createMovementService(store: MovementStore, options: { now?: () => number } = {}) {
  const clock = options.now ?? Date.now;
  async function command(actorId: string, input: unknown): Promise<MovementReply> {
    const cmd = validateMovementCommand(input), digest = fingerprint(cmd);
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = await store.readState(cmd.roomId, actorId), now = clock();
      const { room, visit, movement: old, moveSequence } = state;
      const participant = room?.participants.find(person => person.id === actorId && now - person.lastSeenAt < SEAT_TTL_MS);
      if (!room || !visit || !participant) throw new MovementError('NOT_PARTICIPANT', 'Join an available spot before moving your avatar.', 403);
      if (cmd.joinedAt !== participant.joinedAt || cmd.groupId !== (room.groupAction?.id ?? null)) throw new MovementError('STALE_MOVEMENT_EPOCH', 'Your movement belongs to an earlier room state. Refresh before moving again.', 409, { lastMoveSequence: moveSequence });
      if (room.groupAction && now < room.groupAction.endsAt) throw new MovementError('GROUP_ACTIVE', 'Wait for the group dance to finish before moving.', 409, { lastMoveSequence: moveSequence, retryAfterMs: room.groupAction.endsAt - now });
      if (room.danceRound && now < room.danceRound.endsAt) throw new MovementError('GROUP_ACTIVE', 'Wait for the dance round to finish before moving.', 409, { lastMoveSequence: moveSequence, retryAfterMs: room.danceRound.endsAt - now });
      if (old && cmd.moveSequence <= moveSequence) {
        if (cmd.moveSequence === moveSequence && old.fingerprint !== digest) throw new MovementError('REQUEST_CONFLICT', 'A movement sequence cannot be reused with different data.', 409, { lastMoveSequence: moveSequence });
        return { roomId: cmd.roomId, serverNow: now, accepted: cmd.moveSequence === moveSequence, lastMoveSequence: moveSequence, movement: old.sample };
      }
      const distanceCredit = checkPosition(cmd, participant, old, now, room.groupAction);
      const tokens = Math.min(BURST, (old?.tokens ?? BURST) + Math.max(0, now - (old?.tokenAt ?? now)) * TOKENS_PER_SECOND / 1000);
      // One moving→stopped transition bypasses the budget; starting again costs
      // a token, so repeated stop payloads cannot turn into unlimited free writes.
      const stopTransition = old?.sample.mode === 'manual' && sameEpoch(old.sample, cmd) && !stopped(old.sample) && stopped(cmd);
      if (tokens < 1 && !stopTransition) throw new MovementError('RATE_LIMITED', 'Give movement a moment to catch up.', 429, { retryAfterMs: Math.max(1, Math.ceil((1 - tokens) * 1000 / TOKENS_PER_SECOND)), lastMoveSequence: moveSequence });
      const sample: ParticipantMovement = { actorId, moveSequence: cmd.moveSequence, joinedAt: cmd.joinedAt, groupId: cmd.groupId, mode: cmd.mode, x: cmd.x, z: cmd.z, heading: cmd.heading, vx: cmd.vx, vz: cmd.vz, acceptedAt: now };
      const next: StoredMovement = { sample, tokens: stopTransition ? tokens : tokens - 1, tokenAt: now, fingerprint: digest, distanceCredit };
      if (await store.commit(cmd.roomId, actorId, room.revision, moveSequence, next)) return { roomId: cmd.roomId, serverNow: now, accepted: true, lastMoveSequence: sample.moveSequence, movement: sample };
    }
    throw new MovementError('ROOM_BUSY', 'The room changed while you moved. Refresh and retry.', 503, { retryAfterMs: 150 });
  }
  return { command };
}
