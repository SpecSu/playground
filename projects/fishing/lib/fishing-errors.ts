import type { RoomErrorCode } from './room-types';

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
