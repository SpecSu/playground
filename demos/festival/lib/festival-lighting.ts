import { FESTIVAL_CONSTRUCTION_MS } from './festival-build-job';
import type { FestivalInstallation, FestivalRound } from './festival-types';

/** A reserved/unfinished/stopped work never becomes a lighting target merely
 * because wall time passes. The shared ceremony owns all lighting after ignition. */
export function isFestivalInstallationLightingReady(art: FestivalInstallation, round: FestivalRound, now: number): boolean {
  return art.roundIndex === round.index && now < round.burnAt && now >= round.startsAt
    && Math.min(now, art.constructionStoppedAt ?? now) >= art.createdAt + FESTIVAL_CONSTRUCTION_MS;
}
