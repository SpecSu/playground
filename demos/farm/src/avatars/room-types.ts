export const CANONICAL_AVATAR_PRESETS = [
  'milk-frog', 'niulai', 'feidudu', 'miaocuijiao', 'banana-cat', 'sword-shield-dog',
  'human-lx', 'human-kelly', 'human-bear', 'human-subeike', 'human-jiji', 'human-jiaxin',
] as const;
/** Legacy IDs remain valid on the wire and in saved rooms, but are not new choices. */
export const AVATAR_PRESETS = [
  ...CANONICAL_AVATAR_PRESETS,
  'cat', 'frog', 'dog', 'capybara', 'panda', 'monster-blob', 'monster-tower', 'monster-star',
] as const;
export const ROOM_ACTIONS = ['dance', 'bounce', 'spin', 'wave', 'love', 'laugh', 'punch', 'ghost'] as const;
export const GROUP_ACTIONS = ['train', 'wave', 'unison', 'battle', 'grid'] as const;
export const GROUP_ACTION_LEAD_MS = 3000;
export const GROUP_WAVE_LEAD_MS = 350;
export const GROUP_TRAIN_LEAD_MS = 350;
export const GROUP_ACTION_COOLDOWN_MS = 5000;
/** Durations for newly accepted events; stored descriptors keep their own end. */
export const GROUP_ACTION_DURATIONS_MS = { train: 16000, wave: 10000, unison: 18000, battle: 26000, grid: 22000 } as const;
export const LIGHT_MODES = ['neon', 'sunset', 'ice', 'ember', 'acid', 'moon'] as const;
export const ROOM_CAPACITY = 10 as const;
export const SEAT_TTL_MS = 60_000;
export const EVENT_HISTORY_LIMIT = 40;
export type AvatarPreset = typeof AVATAR_PRESETS[number];
export type CanonicalAvatarPreset = typeof CANONICAL_AVATAR_PRESETS[number];
/** Retired choices use an existing character without rewriting saved room data. */
export function resolveAvatarPreset(preset: AvatarPreset): CanonicalAvatarPreset {
  switch (preset) {
    case 'cat': return 'miaocuijiao';
    case 'frog':
    case 'monster-star': return 'milk-frog';
    case 'dog': return 'sword-shield-dog';
    case 'capybara':
    case 'monster-blob': return 'feidudu';
    case 'panda':
    case 'monster-tower': return 'niulai';
    default: return preset;
  }
}
export type RoomAction = typeof ROOM_ACTIONS[number];
