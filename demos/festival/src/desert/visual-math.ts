import { FESTIVAL_CONSTRUCTION_MS, FESTIVAL_CONSTRUCTION_SECONDS } from '../../lib/festival-timing.ts';

/** Pure scene projections: all clients derive the same fire/collapse from server time. */
export function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
export function smoothstep(a: number, b: number, value: number): number {
  const x = clamp01((value - a) / (b - a)); return x * x * (3 - 2 * x);
}
export function installationBurn(now: number, burnAt: number, ashesAt: number, seed = 0, endsAt = ashesAt + 10_000) {
  const duration = Math.max(1, ashesAt - burnAt);
  const stagger = (Math.abs(seed) % 13) * 0.28;
  const seconds = (now - burnAt) / 1000 - stagger;
  const p = clamp01(seconds / (duration / 1000 - 3.5));
  // Finish slightly before the authoritative round reset so deletion cannot pop.
  const ashDuration = Math.max(1, endsAt - ashesAt);
  const fadeEnd = ashesAt + ashDuration - Math.min(500, ashDuration * .05);
  const remaining = 1 - smoothstep(ashesAt, fadeEnd, now);
  return {
    progress: p,
    flame: smoothstep(0, 0.12, p) * (1 - smoothstep(0.7, 0.99, p)),
    char: smoothstep(0.08, 0.63, p),
    collapse: smoothstep(0.55, 0.94, p),
    ash: smoothstep(0.52, 0.96, p) * remaining,
    smoke: smoothstep(0.015, 0.14, p) * (1 - .45 * smoothstep(.60, 1, p)) * remaining,
    visible: now < ashesAt,
  };
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function countdownLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
/** GLSL float time must stay small: epoch seconds lose minutes of animation precision. */
export function shaderTimeSeconds(serverMilliseconds:number):number {
  return ((serverMilliseconds % 4096000) + 4096000) % 4096000 / 1000;
}

/** One server-clock timeline for scene, progress UI and late joiners. Construction freezes at ignition; fire wins without completing unseen pieces. */
export const INSTALLATION_CONSTRUCTION_MS = FESTIVAL_CONSTRUCTION_MS;
export function installationConstruction(now: number, createdAt: number, burnAt: number) {
  const progress = !Number.isFinite(createdAt) ? 1 : clamp01((Math.min(now, burnAt) - createdAt) / INSTALLATION_CONSTRUCTION_MS);
  return { progress, seconds: progress * FESTIVAL_CONSTRUCTION_SECONDS, active: progress < 1 && now < burnAt };
}
