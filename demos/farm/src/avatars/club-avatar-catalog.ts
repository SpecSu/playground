import {CANONICAL_AVATAR_PRESETS} from './room-types.ts';
export const CLUB_AVATAR_MODEL_URLS = Object.fromEntries(CANONICAL_AVATAR_PRESETS.map(id=>[id, `/avatars/cast-v1/${id}.glb`])) as Record<typeof CANONICAL_AVATAR_PRESETS[number],string>;
