import { ambientProfiles, ambientRandom, ambientSeed } from './ambient-world';
import { FISHING_AVATAR_CATALOG } from './fishing-avatar-catalog';
import { MARINE_SPECIES } from './fishing-catalog';
import { REEL_WINDOW_MS } from './fishing-types';
import type { CatchRecord, FishingAmbientParticipant, FishingState } from './fishing-types';

export const FISHING_AMBIENT_COUNT = 2;
const DAY_MS = 86_400_000;
const CATCH_SPECIES = MARINE_SPECIES.filter(species => species.minCm <= 80);

/** Server-clock anchored, room/day seeded ambience. No human visits or inventory. */
export function projectFishingAmbientParticipants(serverNow: number, slots: readonly number[] = [10, 11]): FishingAmbientParticipant[] {
  const day = Math.floor(serverNow / DAY_MS), startsAt = day * DAY_MS;
  return ambientProfiles('ocean', day, FISHING_AMBIENT_COUNT).map((profile, index) => {
    const schedule = ambientRandom(ambientSeed(`ocean:${day}:${index}`));
    const waitMs = 8_000 + Math.floor(schedule() * 18_000);
    const biteMs = 1_250, holdingMs = 8_000, idleMs = 3_500;
    const cycleMs = waitMs + biteMs + holdingMs + idleMs;
    const offset = Math.floor(schedule() * cycleMs);
    const cycle = Math.floor((serverNow - startsAt + offset) / cycleMs);
    const castAt = startsAt - offset + cycle * cycleMs, age = serverNow - castAt;
    const biteAt = castAt + waitMs, caughtAt = biteAt + biteMs;
    const castId = `${profile.id}:${day}:${cycle}`;
    let fishing: FishingState;
    if (age < waitMs) fishing = { phase: 'waiting', castId, castAt, biteAt, expiresAt: biteAt + REEL_WINDOW_MS };
    else if (age < waitMs + biteMs) fishing = { phase: 'bite', castId, castAt, biteAt, expiresAt: biteAt + REEL_WINDOW_MS };
    else if (age < waitMs + biteMs + holdingMs) {
      const random = ambientRandom(ambientSeed(castId)), species = CATCH_SPECIES[Math.floor(random() * CATCH_SPECIES.length)];
      // Share the canonical display geometry used by players and offline support poses.
      const lengthCm = species.fixedCm;
      const caught: CatchRecord = { id: `${castId}:catch`, speciesId: species.id, lengthCm, weightKg: Math.max(.01, Math.round(species.kgPerMeter * Math.pow(lengthCm / 100, 2.65) * 100) / 100), caughtAt };
      fishing = { phase: 'holding', castId, castAt, biteAt, catch: caught };
    } else fishing = { phase: 'idle' };
    const preset = index === 0 ? 'banana-cat' : 'milk-frog';
    const name = FISHING_AVATAR_CATALOG.find(avatar => avatar.id === preset)!.label;
    return { ...profile, name, preset, slot: slots[index], joinedAt: startsAt, lastSeenAt: serverNow, fishing };
  });
}
