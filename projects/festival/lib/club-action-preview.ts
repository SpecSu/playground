import { GROUP_ACTION_COOLDOWN_MS, type GroupAction, type GroupActionKind, type Participant, type RoomAction, type RoomSnapshot } from './room-types.ts';
import { beginPersonalAction } from './room-action-state.ts';

/** A local rendering hint, never a replacement for an authoritative room snapshot. */
export interface OwnActionPreview {
  token: number;
  actorId: string;
  baseActionAt: number;
  participant: Participant;
}

export function createOwnActionPreview(snapshot: RoomSnapshot | null, action: RoomAction, nowServer: number, token: number): OwnActionPreview | null {
  if (!snapshot || snapshot.self.role !== 'participant' || !Number.isFinite(nowServer)) return null;
  const self = snapshot.participants.find(person => person.id === snapshot.self.id);
  if (!self) return null;
  return { token, actorId: self.id, baseActionAt: self.actionAt, participant: beginPersonalAction(self, action, nowServer) };
}

export function projectOwnAction(participants: readonly Participant[], ownId: string | null, preview: OwnActionPreview | null | undefined): readonly Participant[] {
  if (!preview || preview.actorId !== ownId) return participants;
  const self = participants.find(person => person.id === ownId);
  // A newer server action, including one from another tab, always wins. A stale
  // GET cannot erase this hint, and losing a seat never creates a local actor.
  if (!self || self.joinedAt !== preview.participant.joinedAt || self.actionAt !== preview.baseActionAt) return participants;
  return participants.map(person => person.id === ownId ? {
    ...person,
    action: preview.participant.action,
    actionAt: preview.participant.actionAt,
    actionUntil: preview.participant.actionUntil,
    routePauseMs: preview.participant.routePauseMs,
  } : person);
}

export function settleOwnActionPreview(preview: OwnActionPreview | null, token: number): OwnActionPreview | null {
  return preview?.token === token ? null : preview;
}

const GROUP_LABELS: Record<GroupActionKind, string> = { train: '开小火车', wave: '大浪冲入', unison: '集合齐跳', battle: '左右对跳', grid: '跳格接力' };
const LEGACY_GROUP_LABELS: Partial<Record<GroupActionKind, string>> = { train: '小火车', wave: '人浪', unison: '齐舞' };

/** Count-in and cooldown are derived from authoritative timestamps, never click time. */
export function groupActionFeedback(group: GroupAction | null | undefined, nowServer: number): {
  phase: 'idle' | 'countdown' | 'active' | 'cooldown';
  message: string | null;
  personalBlocked: boolean;
  groupBlocked: boolean;
} {
  const idle = { phase: 'idle' as const, message: null, personalBlocked: false, groupBlocked: false };
  if (!group || !Number.isFinite(nowServer)) return idle;
  const label = group.version === 1 ? LEGACY_GROUP_LABELS[group.kind] ?? GROUP_LABELS[group.kind] : GROUP_LABELS[group.kind];
  if (nowServer < group.startsAt) return { phase: 'countdown', message: `${label} · ${Math.ceil((group.startsAt - nowServer) / 1000)} 秒后一起开始`, personalBlocked: true, groupBlocked: true };
  if (nowServer < group.endsAt) return { phase: 'active', message: `${label}进行中 · 还有 ${Math.ceil((group.endsAt - nowServer) / 1000)} 秒`, personalBlocked: true, groupBlocked: true };
  const remaining = group.endsAt + GROUP_ACTION_COOLDOWN_MS - nowServer;
  if (remaining > 0) return { phase: 'cooldown', message: `${Math.ceil(remaining / 1000)} 秒后可再次发起全场互动`, personalBlocked: false, groupBlocked: true };
  return idle;
}
