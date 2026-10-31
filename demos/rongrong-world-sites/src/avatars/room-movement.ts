/** Small, independent HTTP movement lane. Positions and velocities use world X/Z. */
import { CLUB_AVATAR_SCALE } from './club-avatar-scale.ts';
// Shared by joystick, click navigation and server travel validation.
export const WALKING_SPEED_MULTIPLIER = 2;
export const MOVEMENT_SPEED_LIMIT = 1.8 * WALKING_SPEED_MULTIPLIER;
// Physical clearance from the DJ booth stays full sized. Other dancers use a
// small foot-space core so a crowded floor cannot become a wall of bodies.
export const MOVEMENT_BODY_RADIUS = 0.7 * CLUB_AVATAR_SCALE;
export const MOVEMENT_PEER_RADIUS = 0.18 * CLUB_AVATAR_SCALE;
export const MOVEMENT_EXTRAPOLATE_MS = 900;
export const MOVEMENT_PUBLISH_MS = 500;
export type MovementMode = 'manual' | 'auto';
export type MovementCommand = {
  roomId: string;
  moveSequence: number;
  joinedAt: number;
  groupId: string | null;
  mode: MovementMode;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
};
export type ParticipantMovement = Omit<MovementCommand, 'roomId'> & {
  actorId: string;
  acceptedAt: number;
};
export type MovementReply = {
  roomId: string;
  serverNow: number;
  accepted: boolean;
  lastMoveSequence: number;
  movement: ParticipantMovement;
};
export type MovementErrorCode = 'INVALID_COMMAND' | 'NOT_PARTICIPANT' | 'STALE_MOVEMENT_EPOCH' | 'GROUP_ACTIVE' | 'REQUEST_CONFLICT' | 'RATE_LIMITED' | 'ROOM_BUSY' | 'UNAVAILABLE';
export type MovementErrorResponse = {
  error: { code: string; message: string; retryAfterMs?: number; lastMoveSequence?: number };
};
