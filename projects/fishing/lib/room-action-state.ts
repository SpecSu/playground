import type { Participant, RoomAction } from './room-types';

export const PERSONAL_ACTION_MS = 6000;

/** The stored action is history after its hold ends; roaming selects no move. */
export function activePersonalAction(participant: Pick<Participant, 'action' | 'actionAt' | 'actionUntil'> | null | undefined, nowServer: number): RoomAction | null {
  return participant && Number.isFinite(nowServer) && nowServer >= participant.actionAt && nowServer < (participant.actionUntil ?? 0)
    ? participant.action : null;
}

/** Effective route epoch, frozen only for accepted personal action intervals. */
export function personalRouteTime(participant: Pick<Participant, 'actionAt' | 'actionUntil' | 'routePauseMs'>, now: number): number {
  const at = Number.isFinite(now) ? now : 0;
  const completed = Number.isFinite(participant.routePauseMs) ? Math.max(0, participant.routePauseMs!) : 0;
  const start = Number.isFinite(participant.actionAt) ? participant.actionAt : at;
  const end = Number.isFinite(participant.actionUntil) ? Math.max(start, participant.actionUntil!) : start;
  const current = Math.max(0, Math.min(at, end) - start);
  return at - completed - current;
}

/** Shared by the authoritative server transition and the owner's reversible preview. */
export function beginPersonalAction(participant: Participant, action: RoomAction, now: number): Participant {
  if (!Number.isFinite(now)) throw new RangeError('Personal actions require a finite server timestamp.');
  return {
    ...participant,
    action,
    actionAt: now,
    actionUntil: now + PERSONAL_ACTION_MS,
    routePauseMs: now - personalRouteTime(participant, now),
    lastSeenAt: now,
  };
}
