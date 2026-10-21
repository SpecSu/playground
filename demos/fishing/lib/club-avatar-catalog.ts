import type { AvatarPreset } from './room-types';

/** UI/asset metadata only; the protocol's canonical ID list remains in room-types. */
export interface ClubAvatarDefinition {
  readonly id: AvatarPreset;
  readonly label: string;
  readonly category: 'animal' | 'human' | 'monster';
  readonly previewIcon: string;
  /** Only derived, publishable thumbnails belong here; never private reference uploads. */
  readonly previewImage?: string;
}

export const DEFAULT_AVATAR_PRESET: AvatarPreset = 'human-subeike';

export const CLUB_AVATAR_CATALOG: readonly ClubAvatarDefinition[] = Object.freeze(([
  { id: 'cat', label: '猫咪', category: 'animal', previewIcon: '🐱' },
  { id: 'frog', label: '青蛙', category: 'animal', previewIcon: '🐸' },
  { id: 'dog', label: '小狗', category: 'animal', previewIcon: '🐶' },
  { id: 'capybara', label: '水豚', category: 'animal', previewIcon: '🦫' },
  { id: 'panda', label: '熊猫', category: 'animal', previewIcon: '🐼' },
  { id: 'banana-cat', label: '香蕉猫', category: 'animal', previewIcon: '🍌' },
  { id: 'sword-shield-dog', label: '刀盾狗', category: 'animal', previewIcon: '🛡️' },
  { id: 'human-jiji', label: '女生', category: 'human', previewIcon: '👤', previewImage: '/avatars/portraits/human-jiji.webp' },
  { id: 'human-subeike', label: '男生', category: 'human', previewIcon: '👤', previewImage: '/avatars/portraits/human-subeike.webp' },
  { id: 'human-lx', label: '小哥', category: 'human', previewIcon: '👤', previewImage: '/avatars/portraits/human-lx.webp' },
  { id: 'monster-tower', label: '高塔怪', category: 'monster', previewIcon: '🗿' },
  { id: 'monster-star', label: '星星怪', category: 'monster', previewIcon: '⭐' },
] satisfies ClubAvatarDefinition[]).map(avatar => Object.freeze(avatar)));

/** Three animal/monster rows, followed by a dedicated three-person row. */
export const CLUB_AVATAR_PICKER_OPTIONS: readonly ClubAvatarDefinition[] = Object.freeze([
  ...CLUB_AVATAR_CATALOG.filter(avatar => avatar.category !== 'human'),
  ...CLUB_AVATAR_CATALOG.filter(avatar => avatar.category === 'human'),
]);
