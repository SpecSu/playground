/** Shared client/server plain-text hygiene. Joiners are needed by real emoji and scripts. */
export function normalizeFestivalChat(value: string): string {
 return value.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, char => char === '\u200c' || char === '\u200d' ? char : '');
}
export function limitFestivalDraft(value: string): string {
 return Array.from(normalizeFestivalChat(value)).slice(0, 80).join('');
}
export function isFestivalSendKey(event: { key: string; isComposing?: boolean; keyCode?: number; shiftKey?: boolean }, composing: boolean, composedAt: number, now = Date.now()): boolean {
 return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !composing && now - composedAt > 200;
}

export function isValidFestivalChat(value: string): boolean {
 const text = value.trim();
 return [...text].length <= 80 && text.replace(/[\s\u200c\u200d\ufe0e\ufe0f]/gu, '').length > 0 && !/[\uD800-\uDFFF]/u.test(text);
}
