/** Keep typing/paste on one line; count Unicode code points rather than UTF-16 units. */
export function cleanChatDraft(value: string): string {
  return Array.from(value.replace(/\s+/gu, ' ')).slice(0, 80).join('');
}
export const CHAT_COMPOSITION_GUARD_MS = 200;
export function isChatSendKey(event: { key: string; isComposing?: boolean; keyCode?: number; shiftKey?: boolean }, composing: boolean, now: number, lastCompositionEnd: number): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !composing && now - lastCompositionEnd >= CHAT_COMPOSITION_GUARD_MS;
}
export function canSubmitChat(state: { joined: boolean; ready: boolean; pending: boolean; composing: boolean; now: number; lastCompositionEnd: number; text: string }): boolean {
  return state.joined && state.ready && !state.pending && !state.composing && state.now - state.lastCompositionEnd >= CHAT_COMPOSITION_GUARD_MS && Boolean(state.text.replace(/[\u200c\u200d]/g, '').trim());
}

/** Input[type=text] otherwise strips pasted CR/LF before React sees the value. */
export function pasteChatDraft(value: string, start: number, end: number, clipboard: string): { text: string; caret: number } {
  const insertion = clipboard.replace(/\s+/gu, ' ');
  const prefix = value.slice(0, start) + insertion;
  const text = cleanChatDraft(prefix + value.slice(end));
  return { text, caret: Math.min(text.length, cleanChatDraft(prefix).length) };
}
