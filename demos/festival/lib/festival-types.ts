import { AVATAR_PRESETS } from './room-types';
import type { AvatarPreset } from './room-types';
import { INSTALLATION_FOOTPRINT_RADII, DREAMINA_MONUMENT_RADIUS, CAMPFIRE_POSITIONS, CAMPFIRE_RADIUS } from '../src/desert/art-dimensions';

export const FESTIVAL_CAPACITY = 10 as const;
export const FESTIVAL_WORLD_RADIUS = 80;
/** Shared conservative footprint of the tilted glass landmark. */
export const FESTIVAL_MONUMENT_RADIUS = DREAMINA_MONUMENT_RADIUS;
export const FESTIVAL_INSTALLATION_RADII = INSTALLATION_FOOTPRINT_RADII;
export const FESTIVAL_CAMPFIRE_POSITIONS = CAMPFIRE_POSITIONS;
export const FESTIVAL_CAMPFIRE_RADIUS = CAMPFIRE_RADIUS;
export const FESTIVAL_AVATAR_RADIUS = 1.5;
export const FESTIVAL_PLACEMENT_CLEARANCE = .5;
/** Only the real perimeter tents are excluded, never imaginary building slots. */
export const FESTIVAL_CAMP_POSITIONS = Array.from({ length: 32 }, (_, i) => {
  const angle = i / 31 * Math.PI * 1.66 + Math.PI * .17;
  return { x: Math.sin(angle) * 80, z: Math.cos(angle) * 80 };
});
export const FESTIVAL_CAMP_RADIUS = 4.9;
export const FESTIVAL_MOVE_SPEED = 21;
export const FESTIVAL_AMBIENT_MOVE_SPEED = 7;
export const FESTIVAL_PRESENCE_TTL_MS = 60_000;
export const FESTIVAL_BUILD_MS = 300_000;
export const FESTIVAL_BURN_MS = 35_000;
export const FESTIVAL_ASHES_MS = 10_000;
export const FESTIVAL_ROUND_MS = FESTIVAL_BUILD_MS + FESTIVAL_BURN_MS + FESTIVAL_ASHES_MS;
export const FESTIVAL_MESSAGE_MAX_LENGTH = 80;
export const FESTIVAL_MESSAGE_INTERVAL_MS = 3000;
export const FESTIVAL_MESSAGE_TTL_MS = 8000;
export const FESTIVAL_MAX_INSTALLATIONS = 30;
export const FESTIVAL_BUILDS_PER_ACTOR = 3;
export const FESTIVAL_PRESETS = AVATAR_PRESETS;
export const FESTIVAL_DEFAULT_PRESET: AvatarPreset = 'human-subeike';
export const FESTIVAL_EMOTES = ['wave', 'love', 'laugh', 'spin', 'dance'] as const;
export type FestivalPreset = AvatarPreset;
export type FestivalEmote = typeof FESTIVAL_EMOTES[number];
export type FestivalInstallationKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const FESTIVAL_MONUMENT_ID = 'festival:central-monument';
export const FESTIVAL_LIGHTING_MODES = ['pulse', 'chase', 'spark'] as const;
export const FESTIVAL_LIGHTING_PALETTES = ['solar', 'aurora', 'ice'] as const;
/** Legacy values remain readable/accepted for existing clients and durable JSON. */
export type FestivalLightingMode = typeof FESTIVAL_LIGHTING_MODES[number] | 'sweep';
export type FestivalLightingPalette = typeof FESTIVAL_LIGHTING_PALETTES[number] | 'candy';
export type FestivalLighting = {
  mode: FestivalLightingMode; palette: FestivalLightingPalette;
  /** Server epoch anchors the same light pattern for every observer. */
  startedAt: number;
};

export type FestivalMovement = {
  /** Authoritative origin at moveAt, not a client-submitted current position. */
  x: number; z: number; targetX: number; targetZ: number; moveAt: number; heading: number;
  /** Internal ambient routes retain their original gentle pace. */
  ambient?: boolean;
};
export type FestivalBuildTask = {
  installationId: string; arrivalAt: number; finishAt: number; facing: number;
};
/** Construction commits at arrival; only the round fire may interrupt it. */
export function isFestivalBuildLocked(task: FestivalBuildTask | undefined, now: number, burnAt: number): boolean {
  return !!task && now >= task.arrivalAt && now < task.finishAt && now < burnAt;
}
export type FestivalMessage = { text: string; at: number; expiresAt: number };
export type FestivalParticipant = FestivalMovement & {
  id: string; name: string; preset: FestivalPreset; slot: number;
  joinedAt: number; lastSeenAt: number; emote: FestivalEmote; emoteAt: number;
  message?: FestivalMessage;
  buildTask?: FestivalBuildTask;
};
export type FestivalAmbientBuild = {
  approach: FestivalMovement;
  task: FestivalBuildTask;
  returnMovement: FestivalMovement;
  resumeAt: number;
  roamAnchor: { x: number; z: number; wander: number };
};
export type FestivalInstallation = {
  id: string; actorId: string; kind: FestivalInstallationKind; plotId?: string;
  x: number; z: number; createdAt: number; roundIndex: number;
  /** Captured when building so authors remain visible after leaving. */
  creatorName?: string;
  /** Legacy storage compatibility only; authority strips manual overrides. */
  lighting?: FestivalLighting;
  /** Frozen progress after an explicit interruption of an already started build. */
  constructionStoppedAt?: number;
  /** Persisted only for newly scheduled ambient creators; old snapshots remain valid. */
  ambientBuild?: FestivalAmbientBuild;
};
export type FestivalAmbientParticipant = FestivalParticipant & { ambient: true };
export type FestivalAmbientInstallation = FestivalInstallation & { ambient: true };
export type FestivalRound = {
  index: number; startsAt: number; burnAt: number; ashesAt: number; endsAt: number;
  phase: 'building' | 'burning' | 'ashes';
};
export type FestivalSnapshot = {
  roomId: 'main'; revision: number; serverNow: number; capacity: typeof FESTIVAL_CAPACITY;
  self: { id: string; role: 'visitor' | 'participant' | 'spectator'; lastSequence: number };
  participants: FestivalParticipant[]; installations: FestivalInstallation[]; round: FestivalRound;
  ambientParticipants: FestivalAmbientParticipant[]; ambientInstallations: FestivalAmbientInstallation[];
  /** Legacy read compatibility only; current authority never emits this field. */
  monumentLighting?: FestivalLighting;
};
type FestivalCommandBase = { roomId?: 'main'; requestId: string; sequence: number };
export type FestivalCommand = FestivalCommandBase & (
  | { type: 'join' | 'profile'; name: string; preset: FestivalPreset }
  | { type: 'heartbeat' | 'leave' | 'stop' }
  | { type: 'move'; x: number; z: number }
  | { type: 'emote'; emote: FestivalEmote }
  | { type: 'build'; kind: FestivalInstallationKind; x: number; z: number; roundIndex: number }
  | { type: 'say'; text: string }

);
export type FestivalErrorCode = 'INVALID_COMMAND' | 'STALE_SEQUENCE' | 'REQUEST_CONFLICT' | 'NOT_PARTICIPANT' |
  'RATE_LIMITED' | 'ROOM_BUSY' | 'FORBIDDEN' | 'UNAVAILABLE' | 'PLOT_OCCUPIED' | 'PLACEMENT_BLOCKED' | 'BUILD_LIMIT' | 'BUILD_IN_PROGRESS' | 'ROUND_CLOSED' | 'LIGHTING_CLOSED' | 'INSTALLATION_UNAVAILABLE';
export type FestivalErrorResponse = {
  error: { code: FestivalErrorCode; message: string; retryAfterMs?: number; lastSequence?: number };
  snapshot?: FestivalSnapshot;
};

export function festivalRoundAt(index: number, startsAt: number, now: number): FestivalRound {
  const burnAt = startsAt + FESTIVAL_BUILD_MS;
  const ashesAt = burnAt + FESTIVAL_BURN_MS;
  const endsAt = ashesAt + FESTIVAL_ASHES_MS;
  return { index, startsAt, burnAt, ashesAt, endsAt, phase: now < burnAt ? 'building' : now < ashesAt ? 'burning' : 'ashes' };
}

export function isFestivalDestination(x: unknown, z: unknown): boolean {
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const radius = Math.hypot(x, z);
  // Trigonometric projection can land a few ULPs inside the exact circle.
  // Permit only numerical noise so stopping on an authoritative arc is valid.
  const epsilon = 1e-8;
  return radius >= FESTIVAL_MONUMENT_RADIUS - epsilon && radius <= FESTIVAL_WORLD_RADIUS + epsilon;
}

export type FestivalPlacementIssue = 'invalid' | 'boundary' | 'monument' | 'campfire' | 'camp' | 'installation' | 'participant';

/** Pure shared preview/authority check. Coordinates are never rounded or snapped. */
export function getFestivalPlacementIssue(kind: number, x: number, z: number, installations: readonly FestivalInstallation[], participants: readonly FestivalParticipant[], now: number): FestivalPlacementIssue | null {
  if (!Number.isInteger(kind) || kind < 0 || kind >= FESTIVAL_INSTALLATION_RADII.length || !Number.isFinite(x) || !Number.isFinite(z)) return 'invalid';
  const radius = FESTIVAL_INSTALLATION_RADII[kind], gap = FESTIVAL_PLACEMENT_CLEARANCE;
  const overlaps = (ox: number, oz: number, otherRadius: number) => Math.hypot(x - ox, z - oz) < radius + otherRadius + gap - 1e-8;
  if (Math.hypot(x, z) + radius > FESTIVAL_WORLD_RADIUS + 1e-8) return 'boundary';
  if (overlaps(0, 0, FESTIVAL_MONUMENT_RADIUS)) return 'monument';
  if (FESTIVAL_CAMP_POSITIONS.some(camp => overlaps(camp.x, camp.z, FESTIVAL_CAMP_RADIUS))) return 'camp';
  if (installations.some(art => overlaps(art.x, art.z, FESTIVAL_INSTALLATION_RADII[art.kind]))) return 'installation';
  if (participants.some(person => { const position = projectParticipant(person, now); return overlaps(position.x, position.z, FESTIVAL_AVATAR_RADIUS); })) return 'participant';
  return null;
}

export function festivalPlacementMessage(issue: FestivalPlacementIssue): string {
  return {
    invalid: '请选择有效的装置与地面位置。',
    boundary: '这件作品会超出荒原边界，往广场里面挪一点。',
    monument: '这里离中央雕塑太近，给它留一点空间。',
    campfire: '这里靠近篝火，换一块安全的空地吧。',
    camp: '这里靠近营地，往开阔的沙地挪一点。',
    installation: '这里与另一件作品太近，换一个位置吧。',
    participant: '这里有人在走动，给分身留一点空间。',
  }[issue];
}

type Route = { length: number; lineIn: number; arc: number; lineOut: number; startAngle: number; endAngle: number; direction: number };
const TAU = Math.PI * 2;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Shortest line/tangent/arc route around the circular monument; deterministic on every client. */
function movementRoute(p: FestivalMovement, radius = FESTIVAL_MONUMENT_RADIUS): Route {
  const dx = p.targetX - p.x, dz = p.targetZ - p.z;
  const direct = Math.hypot(dx, dz);
  const t = direct > 0 ? Math.max(0, Math.min(1, -(p.x * dx + p.z * dz) / (direct * direct))) : 0;
  if (Math.hypot(p.x + t * dx, p.z + t * dz) >= radius - 1e-8 || direct < 1e-8) {
    return { length: direct, lineIn: direct, arc: 0, lineOut: 0, startAngle: 0, endAngle: 0, direction: 1 };
  }
  const a = Math.atan2(p.z, p.x), b = Math.atan2(p.targetZ, p.targetX);
  const da = Math.max(radius, Math.hypot(p.x, p.z)), db = Math.max(radius, Math.hypot(p.targetX, p.targetZ));
  const lineIn = Math.sqrt(Math.max(0, da * da - radius * radius));
  const lineOut = Math.sqrt(Math.max(0, db * db - radius * radius));
  const alpha = Math.acos(Math.min(1, radius / da)), beta = Math.acos(Math.min(1, radius / db));
  const candidates = [1, -1].map(direction => {
    const startAngle = a + direction * alpha, endAngle = b - direction * beta;
    const arc = positiveAngle(direction * (endAngle - startAngle)) * radius;
    return { length: lineIn + arc + lineOut, lineIn, lineOut, arc, startAngle, endAngle, direction };
  });
  return candidates[0].length <= candidates[1].length ? candidates[0] : candidates[1];
}

export function festivalMovementSpeed(p: FestivalMovement): number {
  return p.ambient ? FESTIVAL_AMBIENT_MOVE_SPEED : FESTIVAL_MOVE_SPEED;
}

export function movementDurationMs(p: FestivalMovement): number {
  return movementRoute(p).length / festivalMovementSpeed(p) * 1000;
}

/** heading is atan2(dx, dz), appropriate for a Three.js avatar facing local +Z. */
export function projectParticipant(p: FestivalMovement, now: number, radius = FESTIVAL_MONUMENT_RADIUS): { x: number; z: number; heading: number; speed: number; distance: number } {
  const route = movementRoute(p, radius), moveSpeed = festivalMovementSpeed(p);
  const distance = Math.min(route.length, Math.max(0, now - p.moveAt) / 1000 * moveSpeed);
  const line = (x1: number, z1: number, x2: number, z2: number, length: number, travelled: number) => {
    const t = length > 0 ? Math.min(1, travelled / length) : 1;
    return { x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, heading: Math.atan2(x2 - x1, z2 - z1) };
  };
  let point: { x: number; z: number; heading: number };
  if (!route.arc) point = line(p.x, p.z, p.targetX, p.targetZ, route.length, distance);
  else if (distance < route.lineIn) point = line(p.x, p.z, Math.cos(route.startAngle) * radius, Math.sin(route.startAngle) * radius, route.lineIn, distance);
  else if (distance < route.lineIn + route.arc) {
    const angle = route.startAngle + route.direction * (distance - route.lineIn) / radius;
    point = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, heading: Math.atan2(-Math.sin(angle) * route.direction, Math.cos(angle) * route.direction) };
  } else point = line(Math.cos(route.endAngle) * radius, Math.sin(route.endAngle) * radius, p.targetX, p.targetZ, route.lineOut, distance - route.lineIn - route.arc);
  if (distance >= route.length) { point.x = p.targetX; point.z = p.targetZ; }
  if (route.length < 1e-8) point.heading = p.heading;
  const task = (p as FestivalParticipant).buildTask;
  if (task && now >= task.arrivalAt && distance >= route.length) point.heading = task.facing;
  return { ...point, speed: distance < route.length ? moveSpeed : 0, distance };
}
