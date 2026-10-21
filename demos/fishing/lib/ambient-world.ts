import type { AvatarPreset } from './room-types';

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
const PRESETS: AvatarPreset[] = ['cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'human-jiji', 'human-subeike', 'human-lx', 'monster-tower', 'monster-star'];
const NAMES = ['小满', '阿遥', '汽水', '弥弥', '北北', '游游', '橘子', '舟舟', '绒绒', '沐沐', '慢慢', '鹿鹿'];
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function ambientProfiles(room: string, seed: number, count: number) {
  const random = ambientRandom(ambientSeed(`${room}:${seed}`));
  const presets = shuffled(PRESETS, random), names = shuffled(NAMES, random);
  return Array.from({ length: count }, (_, index) => ({ id: `ambient:${room}:${index}`, name: names[index], preset: presets[index], ambient: true as const }));
}
export const isAmbientActorId = (id: string) => id.startsWith('ambient:');
