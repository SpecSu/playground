import { CANONICAL_AVATAR_PRESETS } from './room-types';
import { CLUB_AVATAR_CATALOG } from './club-avatar-catalog';

/** Identical pure helper in each standalone demo: no identity, network or persistence. */
export function ambientSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export function ambientRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
const PRESETS = CANONICAL_AVATAR_PRESETS;
const NAMES = new Map(CLUB_AVATAR_CATALOG.map(avatar => [avatar.id, avatar.label]));
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function ambientProfiles(room: string, seed: number, count: number) {
  const random = ambientRandom(ambientSeed(`${room}:${seed}`));
  const presets = shuffled(PRESETS, random);
  return Array.from({ length: count }, (_, index) => ({ id: `ambient:${room}:${index}`, name: NAMES.get(presets[index])!, preset: presets[index], ambient: true as const }));
}
export const isAmbientActorId = (id: string) => id.startsWith('ambient:');
