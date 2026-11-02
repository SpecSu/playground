import { resolveFishingAvatarPreset } from './fishing-avatar-catalog.ts';
import { MARINE_SPECIES } from './fishing-catalog.ts';
import { FISHING_CATCH_LAYOUT_VERSION, FISHING_CATCH_LAYOUTS } from './fishing-catch-layouts.generated.ts';

/** Build-time fingerprints guarantee these entries match the shipped meshes and solver.
 * Only the 20 canonical display sizes use this path; diagnostic arbitrary-size
 * fixtures retain the cancellable asynchronous solver. */
export function getFishingCatchLayout(preset: unknown, speciesId: unknown, lengthCm: unknown, scale: number) {
  const species = MARINE_SPECIES.find(candidate => candidate.id === speciesId);
  if (!species || lengthCm !== species.fixedCm) return undefined;
  const key = `${resolveFishingAvatarPreset(preset)}/${species.id}`;
  const layout = FISHING_CATCH_LAYOUTS[key];
  if (FISHING_CATCH_LAYOUT_VERSION !== 1 || !layout || layout.lengthCm !== species.fixedCm) {
    // Never turn a broken release cache into an unexpected live one-second solve.
    throw new Error(`Missing fixed fishing layout: ${key}`);
  }
  if (layout.scale !== scale) return undefined;
  return layout;
}
