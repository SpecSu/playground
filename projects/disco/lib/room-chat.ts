import type { Participant, ParticipantChat } from './room-types';

export const CHAT_MAX_CHARACTERS = 80;
export const CHAT_DURATION_MS = 8000;
export const CHAT_COOLDOWN_MS = 1500;

/** Collapse pasted spaces, tabs and newlines; preserve other controls for rejection. */
export function normalizeChatText(text: string): string {
  return text.replace(/[\p{Zs}\t\r\n\u2028\u2029]+/gu, ' ').replace(/^ +| +$/g, '');
}

/** A pure server-clock projection, including for older snapshots without chat. */
export function chatAt(participant: Pick<Participant, 'chat'> | null | undefined, now: number): ParticipantChat | null {
  const chat = participant?.chat;
  if (!chat || !Number.isFinite(now) || !Number.isFinite(chat.sentAt) || !Number.isFinite(chat.expiresAt) ||
      now < chat.sentAt || now >= chat.expiresAt) return null;
  return chat;
}
