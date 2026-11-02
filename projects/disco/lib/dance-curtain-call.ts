/** Presentation-only ceremony. Never extend server scoring, audio or submission clocks. */
export const DANCE_CURTAIN_CALL_MS = 2400;
export const DANCE_CURTAIN_SPIN_MS = 1000;
type RoundEnd = { endsAt: number };
const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export function danceCurtainCallActive(round: RoundEnd | null | undefined, now: number): boolean {
  return Boolean(round && now >= round.endsAt && now < round.endsAt + DANCE_CURTAIN_CALL_MS);
}
export function dancePresentationActive(round: RoundEnd | null | undefined, now: number): boolean {
  return Boolean(round && now < round.endsAt + DANCE_CURTAIN_CALL_MS);
}
export function danceCurtainCallPose(round: RoundEnd | null | undefined, now: number, reducedMotion = false) {
  if (!round || !danceCurtainCallActive(round, now)) return null;
  const elapsed = now - round.endsAt;
  const bowElapsed = elapsed - DANCE_CURTAIN_SPIN_MS;
  const bow = bowElapsed < 0 ? 0 : bowElapsed < 500 ? ease(bowElapsed / 500) : bowElapsed < 850 ? 1 : 1 - ease((bowElapsed - 850) / 550);
  return { phase: elapsed < DANCE_CURTAIN_SPIN_MS ? 'spin' as const : 'bow' as const,
    turn: reducedMotion ? 0 : Math.PI * 2 * ease(elapsed / DANCE_CURTAIN_SPIN_MS),
    bow: bow * (reducedMotion ? 0.16 : 1) };
}
