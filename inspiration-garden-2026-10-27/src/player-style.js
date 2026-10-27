/** The player is Su Bei Ke. Legacy selected roles remain serialized, never silently rewritten. */
export const PLAYER_AVATAR='human-subeike';
export const OUTFIT_KEYS=Object.freeze(['original','outdoor-utility','sage-gardener','graphite-runner','evening-ink','christmas-santa']);
export const playerOutfit=state=>typeof state.settings?.outfitKey==='string'&&OUTFIT_KEYS.includes(state.settings.outfitKey)?state.settings.outfitKey:'original';
