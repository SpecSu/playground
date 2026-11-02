import { clubAvatarName } from './club-avatar-catalog.ts';
import type { AvatarPreset, RoomAction } from './room-types.ts';

/** Shared by the visible scene and dance scoring; empty real seats stay empty.
 * The resident DJ is separate and does not occupy a guest/NPC seat.
 */
export const CLUB_AMBIENT_CAST = ([
  { id: 'ambient-capy', preset: 'milk-frog', slot: 2, action: 'dance' },
  { id: 'ambient-tower', preset: 'niulai', slot: 3, action: 'dance' },
  { id: 'ambient-momo', preset: 'banana-cat', slot: 1, action: 'wave' },
  { id: 'ambient-luna', preset: 'miaocuijiao', slot: 5, action: 'dance' },
  { id: 'ambient-pepper', preset: 'sword-shield-dog', slot: 4, action: 'dance' },
] as const satisfies readonly { id: string; preset: AvatarPreset; slot: number; action: RoomAction }[]).map(actor => ({ ...actor, name: clubAvatarName(actor.preset) }));
