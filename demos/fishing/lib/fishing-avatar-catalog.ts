import { AVATAR_PRESETS, type AvatarPreset, UPLOADED_AVATAR_PRESETS } from './room-types.ts';

/** The independent fishing cast preserves uploaded dimensions and names. */
export const FISHING_AVATAR_PRESETS = UPLOADED_AVATAR_PRESETS;
export type FishingAvatarPreset = typeof FISHING_AVATAR_PRESETS[number];
export const DEFAULT_FISHING_AVATAR_PRESET: FishingAvatarPreset = 'human-subeike';
const names = ['奶蛙', '牛来', '肥嘟嘟', '喵脆角', '香蕉猫', '刀盾狗', 'LX', 'Kelly', 'Bear熊', '苏贝壳', '吉吉', 'Jiaxin'] as const;
export const FISHING_AVATAR_CATALOG = Object.freeze(FISHING_AVATAR_PRESETS.map((id, index) => Object.freeze({
  id, label: names[index], modelUrl: `/avatars/cast-v1/${id}.glb`,
  previewImage: `/avatars/portraits/${id}.webp`, previewIcon: '',
})));
const legacy: Partial<Record<AvatarPreset, FishingAvatarPreset>> = {
  frog: 'milk-frog', cat: 'miaocuijiao', dog: 'sword-shield-dog',
  capybara: 'feidudu', panda: 'niulai', 'monster-blob': 'feidudu',
  'monster-tower': 'niulai', 'monster-star': 'milk-frog',
};
export const FISHING_ACCEPTED_AVATAR_PRESETS: readonly AvatarPreset[] = Object.freeze([...new Set<AvatarPreset>([...AVATAR_PRESETS, ...FISHING_AVATAR_PRESETS])]);
export function resolveFishingAvatarPreset(value: unknown): FishingAvatarPreset {
  if (FISHING_AVATAR_PRESETS.includes(value as FishingAvatarPreset)) return value as FishingAvatarPreset;
  return legacy[value as AvatarPreset] ?? DEFAULT_FISHING_AVATAR_PRESET;
}
export function fishingAvatarModelUrl(value: AvatarPreset): string {
  return `/avatars/cast-v1/${resolveFishingAvatarPreset(value)}.glb`;
}
