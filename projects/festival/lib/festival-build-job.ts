import {
  FESTIVAL_AVATAR_RADIUS, FESTIVAL_INSTALLATION_RADII, FESTIVAL_CAMP_POSITIONS,
  FESTIVAL_CAMP_RADIUS, FESTIVAL_CAMPFIRE_POSITIONS, FESTIVAL_CAMPFIRE_RADIUS,
  FESTIVAL_MOVE_SPEED, FESTIVAL_WORLD_RADIUS, FESTIVAL_MONUMENT_RADIUS,
  projectParticipant, movementDurationMs,
  type FestivalBuildTask, type FestivalInstallation, type FestivalMovement, type FestivalParticipant,
} from './festival-types';

export { FESTIVAL_CONSTRUCTION_MS } from './festival-timing.ts';
export function getFestivalBuildPhase(task: FestivalBuildTask, now: number): 'approaching' | 'building' | 'complete' {
  return now < task.arrivalAt ? 'approaching' : now < task.finishAt ? 'building' : 'complete';
}

/** Bounded search of standpoints, using the same deterministic route as all clients.
 * Legacy movement avoids the monument only; standpoints also avoid art, fire and tents. */
export function planFestivalBuildApproach(person: FestivalParticipant, art: Pick<FestivalInstallation, 'x' | 'z' | 'kind'>, works: readonly FestivalInstallation[], now: number, participants: readonly FestivalParticipant[] = []): { movement: FestivalMovement; arrivalAt: number; facing: number } | null {
  const start = projectParticipant(person, now);
  const standRadius = FESTIVAL_INSTALLATION_RADII[art.kind] + FESTIVAL_AVATAR_RADIUS + .75;
  const obstacles = [
    ...works.map(work => ({ x: work.x, z: work.z, radius: FESTIVAL_INSTALLATION_RADII[work.kind] + FESTIVAL_AVATAR_RADIUS })),
    ...FESTIVAL_CAMP_POSITIONS.map(camp => ({ ...camp, radius: FESTIVAL_CAMP_RADIUS + FESTIVAL_AVATAR_RADIUS })),
    ...FESTIVAL_CAMPFIRE_POSITIONS.map(([x, z]) => ({ x, z, radius: FESTIVAL_CAMPFIRE_RADIUS + FESTIVAL_AVATAR_RADIUS })),
    { x: art.x, z: art.z, radius: FESTIVAL_INSTALLATION_RADII[art.kind] + FESTIVAL_AVATAR_RADIUS },
  ];
  const angle = Math.atan2(start.z - art.z, start.x - art.x);
  const candidates = Array.from({ length: 96 }, (_, i) => {
    const a = angle + i * Math.PI * 2 / 96;
    const movement = { ...(person.id.startsWith('ambient:') ? { ambient: true } : {}), x: start.x, z: start.z, targetX: art.x + Math.cos(a) * standRadius, targetZ: art.z + Math.sin(a) * standRadius, moveAt: now, heading: start.heading };
    return { movement, duration: movementDurationMs(movement) };
  }).sort((a, b) => a.duration - b.duration);
  for (const { movement, duration } of candidates) {
    const r = Math.hypot(movement.targetX, movement.targetZ);
    if (r > FESTIVAL_WORLD_RADIUS - FESTIVAL_AVATAR_RADIUS || r < FESTIVAL_MONUMENT_RADIUS + FESTIVAL_AVATAR_RADIUS) continue;
    if (obstacles.some(o => Math.hypot(movement.targetX - o.x, movement.targetZ - o.z) < o.radius + .25 - 1e-8)) continue;
    if (participants.some(other => {
      if (other.id === person.id) return false;
      const position = projectParticipant(other, now + duration);
      return Math.hypot(movement.targetX - position.x, movement.targetZ - position.z) < FESTIVAL_AVATAR_RADIUS * 2 + .25;
    })) continue;
    // Preserve the existing movement collision scope. Only the new work itself
    // must not be crossed on approach; other static obstacles constrain the endpoint.
    const targetObstacle = obstacles[obstacles.length - 1];
    const count = Math.max(1, Math.ceil(duration / 1000 * FESTIVAL_MOVE_SPEED / .5));
    let clear = true;
    for (let i = 0; i <= count; i++) {
      const point = projectParticipant(movement, now + duration * i / count);
      if (Math.hypot(point.x - targetObstacle.x, point.z - targetObstacle.z) < targetObstacle.radius + .25 - 1e-8) { clear = false; break; }
    }
    if (clear) return { movement, arrivalAt: now + duration, facing: Math.atan2(art.x - movement.targetX, art.z - movement.targetZ) };
  }
  return null;
}
