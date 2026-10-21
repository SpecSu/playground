import { FESTIVAL_CONSTRUCTION_MS, planFestivalBuildApproach } from './festival-build-job';
import { ambientProfiles, ambientRandom, ambientSeed } from './ambient-world';
import {
  FESTIVAL_CAMPFIRE_POSITIONS, FESTIVAL_CAMPFIRE_RADIUS, FESTIVAL_CAMP_POSITIONS, FESTIVAL_CAMP_RADIUS,
  FESTIVAL_MONUMENT_RADIUS, FESTIVAL_WORLD_RADIUS, FESTIVAL_INSTALLATION_RADII,
  getFestivalPlacementIssue, movementDurationMs, type FestivalAmbientParticipant, type FestivalAmbientInstallation,
  type FestivalInstallation, type FestivalParticipant, type FestivalRound, type FestivalSnapshot,
} from './festival-types';

export const FESTIVAL_AMBIENT_COUNT = 4;
export const FESTIVAL_AMBIENT_BUILD_DELAYS = [8_000, 95_000] as const;
const SPEECH_INTERVAL_MS = 32_000, SPEECH_DURATION_MS = 5_000;
const SAY = ['风刚好，一起逛逛吧', '那边的作品真有意思', '想把今天的晚霞留住', '等会儿一起看它燃烧', '再往前走走？', '这个梦，送给荒原'];
const BURN_SAY = ['看，梦开始发光了', '这一刻，我们一起记住', '下一轮再造一个梦', '火光好温暖'];
const roomSeed = (round: FestivalRound) => ambientSeed(`main:${round.index}:${round.startsAt}`);

function clearDisk(x: number, z: number, radius: number, works: readonly FestivalInstallation[]) {
  const distance = Math.hypot(x, z);
  if (distance - radius < FESTIVAL_MONUMENT_RADIUS + .5 || distance + radius > FESTIVAL_WORLD_RADIUS) return false;
  const overlap = (ox: number, oz: number, r: number) => Math.hypot(x - ox, z - oz) < radius + r + .5;
  return !FESTIVAL_CAMPFIRE_POSITIONS.some(([fx, fz]) => overlap(fx, fz, FESTIVAL_CAMPFIRE_RADIUS))
    && !FESTIVAL_CAMP_POSITIONS.some(camp => overlap(camp.x, camp.z, FESTIVAL_CAMP_RADIUS))
    && !works.some(art => overlap(art.x, art.z, FESTIVAL_INSTALLATION_RADII[art.kind]));
}
function roamAnchor(index: number, seed: number, works: readonly FestivalInstallation[]) {
  const random = ambientRandom(seed + index * 103), base = Math.PI / 4 + index * Math.PI / 2 + (random() - .5) * .16;
  // A clear disk contains the entire little walking circuit, avoiding art and fire.
  for (const wander of [3.8, 0]) for (let attempt = 0; attempt < 80; attempt++) {
    const angle = base + (attempt % 9 - 4) * .08, radius = 32 + Math.floor(attempt / 9) * 4;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (clearDisk(x, z, wander + 1.5, works)) return { x, z, wander };
  }
  // Human art cannot occupy the landmark clearance; the inner path stays available.
  return { x: Math.sin(base) * (FESTIVAL_MONUMENT_RADIUS + 2), z: Math.cos(base) * (FESTIVAL_MONUMENT_RADIUS + 2), wander: 0 };
}

/** Same round anchor + server time gives every viewer the same ambient people. */
export function projectFestivalAmbientParticipants(round: FestivalRound, serverNow: number, works: readonly FestivalInstallation[] = []): FestivalAmbientParticipant[] {
  const seed = roomSeed(round), profiles = ambientProfiles('festival', seed, FESTIVAL_AMBIENT_COUNT);
  // One clock-derived turn for the entire cast. Re-renders and new viewers
  // cannot restart a timer, roll fresh randomness or burst missed comments.
  const firstSpeechAt = round.startsAt + 15_000;
  const speech = Math.floor((serverNow - firstSpeechAt) / SPEECH_INTERVAL_MS);
  const messageAt = firstSpeechAt + speech * SPEECH_INTERVAL_MS;
  const speechActive = speech >= 0 && serverNow >= messageAt && serverNow < messageAt + SPEECH_DURATION_MS;
  // Completion remarks use the next shared turn, never an extra speech event.
  const recentArt = speechActive && messageAt < round.burnAt ? works.find(art => {
    const finishedAt = art.createdAt + FESTIVAL_CONSTRUCTION_MS;
    return profiles.some(profile => profile.id === art.actorId) && finishedAt <= round.burnAt
      && finishedAt > messageAt - SPEECH_INTERVAL_MS && finishedAt <= messageAt;
  }) : undefined;
  const speakerId = recentArt?.actorId ?? profiles[((speech + seed) % FESTIVAL_AMBIENT_COUNT + FESTIVAL_AMBIENT_COUNT) % FESTIVAL_AMBIENT_COUNT].id;
  return profiles.map((profile, index) => {
    const ownArt = works.find(art => art.actorId === profile.id && art.ambientBuild);
    const job = ownArt?.ambientBuild;
    const resumed = job && serverNow >= job.resumeAt;
    const anchor = resumed ? job.roamAnchor : roamAnchor(index, seed, works.filter(art => !art.ambientBuild || art.ambientBuild.approach.moveAt <= serverNow));
    const legMs = 7_500 + index * 350;
    const epoch = resumed ? job.resumeAt : round.startsAt - index * 1_700;
    const leg = Math.floor((serverNow - epoch) / legMs);
    const moveAt = epoch + leg * legMs;
    const point = (step: number) => { const angle = ((step % 3) + 3) % 3 * Math.PI * 2 / 3 + index; return { x: anchor.x + Math.sin(angle) * anchor.wander, z: anchor.z + Math.cos(angle) * anchor.wander }; };
    const from = point(leg), to = point(leg + 1);
    const speaking = speechActive && profile.id === speakerId;
    const text = recentArt ? '这个梦，刚刚搭好了' : messageAt >= round.burnAt ? BURN_SAY[(speech + index) % BURN_SAY.length] : SAY[(speech + index) % SAY.length];
    const working = job && serverNow >= job.approach.moveAt && serverNow < Math.min(job.task.finishAt, round.burnAt);
    const returning = job && serverNow >= job.returnMovement.moveAt && serverNow < job.resumeAt;
    return {
      ...profile, slot: 10 + index, joinedAt: round.startsAt, lastSeenAt: serverNow,
      ...(working ? job.approach : returning ? job.returnMovement : {
        x: from.x, z: from.z, targetX: to.x, targetZ: to.z, moveAt,
        heading: Math.atan2(to.x - from.x, to.z - from.z),
      }),
      ...(working ? { buildTask: job.task } : {}),
      ambient: true,
      emote: index % 2 ? 'wave' : 'laugh', emoteAt: speaking ? messageAt : 0,
      ...(speaking ? { message: { text, at: messageAt, expiresAt: messageAt + SPEECH_DURATION_MS } } : {}),
    };
  });
}

/** Called at most twice per round by authority, then persisted once with its CAS. */
export function planFestivalAmbientInstallation(round: FestivalRound, index: number, works: readonly FestivalInstallation[], people: readonly FestivalParticipant[], now: number): FestivalAmbientInstallation | null {
  if (now >= round.burnAt || index < 0 || index >= FESTIVAL_AMBIENT_BUILD_DELAYS.length) return null;
  const random = ambientRandom(roomSeed(round) + index * 431), kind = Math.floor(random() * 12) as FestivalAmbientInstallation['kind'];
  const offset = random() * Math.PI * 2;
  for (let candidate = 0; candidate < 100; candidate++) {
    const angle = offset + candidate * 2.399963229728653, radius = 33 + candidate % 7 * 5;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (getFestivalPlacementIssue(kind, x, z, works, people, now)) continue;
    // Do not force the three other visitors to select a different wandering
    // disk when this reservation is inserted. Their current route stays continuous.
    if (Array.from({ length: FESTIVAL_AMBIENT_COUNT }, (_, otherIndex) => {
      if (otherIndex === index) return false;
      const prior = works.find(work => work.actorId === `ambient:festival:${otherIndex}` && work.ambientBuild)?.ambientBuild;
      const anchor = prior ? prior.roamAnchor : roamAnchor(otherIndex, roomSeed(round), works);
      return Math.hypot(x - anchor.x, z - anchor.z) < FESTIVAL_INSTALLATION_RADII[kind] + anchor.wander + 2;
    }).some(Boolean)) continue;
    const actorId = `ambient:festival:${index}`;
    const creator = people.find(person => person.id === actorId);
    if (!creator) return null;
    const approach = planFestivalBuildApproach(creator, { kind, x, z }, works, now, people);
    if (!approach || approach.arrivalAt >= round.burnAt) continue;
    const id = `ambient:art:${round.index}:${index}`;
    const task = { installationId: id, arrivalAt: approach.arrivalAt, finishAt: approach.arrivalAt + FESTIVAL_CONSTRUCTION_MS, facing: approach.facing };
    const art: FestivalAmbientInstallation = { id, actorId, creatorName: creator.name, ambient: true, kind, x, z, createdAt: approach.arrivalAt, roundIndex: round.index };
    // Reverse the exact approach, then begin a clear little circuit at its
    // original origin. This never jumps to a newly recomputed wandering phase.
    const returnMovement = { ambient: true, x: approach.movement.targetX, z: approach.movement.targetZ, targetX: approach.movement.x, targetZ: approach.movement.z, moveAt: Math.min(task.finishAt, round.burnAt), heading: task.facing };
    let anchor = { x: returnMovement.targetX, z: returnMovement.targetZ, wander: 0 };
    for (const wander of [3.8, 2, 1, .25]) {
      const candidateAnchor = { x: returnMovement.targetX - Math.sin(index) * wander, z: returnMovement.targetZ - Math.cos(index) * wander, wander };
      if (clearDisk(candidateAnchor.x, candidateAnchor.z, wander + 1.5, [...works, art])) { anchor = candidateAnchor; break; }
    }
    art.ambientBuild = { approach: approach.movement, task, returnMovement, resumeAt: returnMovement.moveAt + movementDurationMs(returnMovement), roamAnchor: anchor };
    return art;
  }
  return null;
}

/** Visual composition only; authority and online counts retain human-only arrays. */
export function festivalSceneState(snapshot: FestivalSnapshot, now: number) {
  const installations = [...snapshot.installations, ...(snapshot.ambientInstallations ?? [])];
  const admittedAmbientIds = new Set((snapshot.ambientParticipants ?? []).map(person => person.id));
  const ambient = admittedAmbientIds.size ? projectFestivalAmbientParticipants(snapshot.round, now, installations).filter(person => admittedAmbientIds.has(person.id)) : [];
  return { participants: [...snapshot.participants, ...ambient], installations };
}
