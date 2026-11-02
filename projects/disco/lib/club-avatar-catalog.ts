import { resolveAvatarPreset, type AvatarPreset, type CanonicalAvatarPreset } from './room-types.ts';

/** UI/asset metadata only; the protocol's canonical ID list remains in room-types. */
export interface ClubAvatarDefinition {
  readonly id: CanonicalAvatarPreset;
  readonly label: string;
  readonly category: 'animal' | 'human';
  readonly previewIcon: string;
  /** Only derived, publishable thumbnails belong here; never private reference uploads. */
  readonly previewImage: string;
  readonly modelUrl: string;
}

export const DEFAULT_AVATAR_PRESET: CanonicalAvatarPreset = 'human-subeike';

export const CLUB_AVATAR_CATALOG: readonly ClubAvatarDefinition[] = Object.freeze(([
  { id: 'milk-frog', label: '奶蛙', category: 'animal', previewIcon: '🐸' },
  { id: 'niulai', label: '牛来', category: 'animal', previewIcon: '🐮' },
  { id: 'feidudu', label: '肥嘟嘟', category: 'animal', previewIcon: '🐹' },
  { id: 'miaocuijiao', label: '喵脆角', category: 'animal', previewIcon: '🐱' },
  { id: 'banana-cat', label: '香蕉猫', category: 'animal', previewIcon: '🍌' },
  { id: 'sword-shield-dog', label: '刀盾狗', category: 'animal', previewIcon: '🛡️' },
  { id: 'human-lx', label: 'LX', category: 'human', previewIcon: '👤' },
  { id: 'human-kelly', label: 'Kelly', category: 'human', previewIcon: '👤' },
  { id: 'human-bear', label: 'Bear熊', category: 'human', previewIcon: '👤' },
  { id: 'human-subeike', label: '苏贝壳', category: 'human', previewIcon: '👤' },
  { id: 'human-jiji', label: '吉吉', category: 'human', previewIcon: '👤' },
  { id: 'human-jiaxin', label: 'Jiaxin', category: 'human', previewIcon: '👤' },
] satisfies Omit<ClubAvatarDefinition, 'previewImage' | 'modelUrl'>[]).map(avatar => Object.freeze({
  ...avatar,
  previewImage: `/avatars/portraits/${avatar.id}.webp`,
  modelUrl: `/avatars/cast-v1/${avatar.id}.glb`,
})));

/** Two animal rows followed by two human rows, three choices per row. */
export const CLUB_AVATAR_PICKER_OPTIONS: readonly ClubAvatarDefinition[] = CLUB_AVATAR_CATALOG;

/** Current model paths only; callers resolve legacy protocol IDs before lookup. */
export const CLUB_AVATAR_MODEL_URLS: Readonly<Record<CanonicalAvatarPreset, string>> = Object.freeze(
  Object.fromEntries(CLUB_AVATAR_CATALOG.map(avatar => [avatar.id, avatar.modelUrl])) as Record<CanonicalAvatarPreset, string>,
);

/** Character metadata for NPCs; real participants always keep their chosen names. */
export function clubAvatarName(preset: AvatarPreset): string {
  return CLUB_AVATAR_CATALOG.find(avatar => avatar.id === resolveAvatarPreset(preset))!.label;
}
