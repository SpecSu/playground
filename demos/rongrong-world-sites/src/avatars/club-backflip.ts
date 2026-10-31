/** A single authored somersault, in milliseconds, independent of music tempo. */
export const BACKFLIP_DURATION_MS = 1800;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const pulse = (time: number, start: number, end: number) => time > start && time < end ? Math.sin((time - start) / (end - start) * Math.PI) ** 2 : 0;
const REST = Object.freeze({ rotation: 0, lift: 0, crouch: 0, tuck: 0, landing: 0, clearance: 0 });

export function backflipAt(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= BACKFLIP_DURATION_MS) return REST;
  const flight = (elapsedMs - 280) / 1200;
  return {
    // +Z is the model's forward direction, so a negative X turn is backward.
    rotation: elapsedMs < 1480 ? -Math.PI * 2 * smooth((elapsedMs - 440) / 880) : 0,
    lift: flight > 0 && flight < 1 ? Math.sin(flight * Math.PI) ** 2 : 0,
    crouch: pulse(elapsedMs, 0, 280),
    tuck: smooth((elapsedMs - 280) / 240) * (1 - smooth((elapsedMs - 1240) / 240)),
    landing: pulse(elapsedMs, 1480, BACKFLIP_DURATION_MS),
    // Tall, full-size tucks rise before their wide core tips over, then hold
    // clearance through unfolding. The midflight peak remains unchanged.
    clearance: smooth((elapsedMs - 280) / 120) * (1 - smooth((elapsedMs - 600) / 160))
      + smooth((elapsedMs - 1000) / 160) * (1 - smooth((elapsedMs - 1360) / 120)),
  };
}

/** Two complete phrases fit the existing six-second personal action window. */
export function personalBackflipTime(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= 4800) return -1;
  if (elapsedMs < BACKFLIP_DURATION_MS) return elapsedMs;
  return elapsedMs >= 3000 ? elapsedMs - 3000 : -1;
}
