import { normalizeFestivalChat, isValidFestivalChat } from './festival-chat';
import { FESTIVAL_CONSTRUCTION_MS, planFestivalBuildApproach } from './festival-build-job';
import { isAmbientActorId } from './ambient-world';
import { FESTIVAL_AMBIENT_BUILD_DELAYS, planFestivalAmbientInstallation, projectFestivalAmbientParticipants } from './festival-ambient';
import {
  FESTIVAL_CAPACITY, FESTIVAL_PRESETS, FESTIVAL_EMOTES, FESTIVAL_MONUMENT_RADIUS,
  FESTIVAL_PRESENCE_TTL_MS, FESTIVAL_ROUND_MS, FESTIVAL_MESSAGE_MAX_LENGTH,
  FESTIVAL_MESSAGE_INTERVAL_MS, FESTIVAL_MESSAGE_TTL_MS, FESTIVAL_MAX_INSTALLATIONS,
  FESTIVAL_BUILDS_PER_ACTOR, festivalRoundAt, isFestivalDestination, projectParticipant,
  getFestivalPlacementIssue, festivalPlacementMessage, isFestivalBuildLocked,
} from './festival-types';
import type { FestivalLighting, FestivalCommand, FestivalErrorCode, FestivalAmbientInstallation, FestivalInstallation, FestivalParticipant, FestivalSnapshot } from './festival-types';

export class FestivalError extends Error {
  code: FestivalErrorCode;
  status: number;
  retryAfterMs?: number;
  lastSequence?: number;
  constructor(code: FestivalErrorCode, message: string, status = 400, details: { retryAfterMs?: number; lastSequence?: number } = {}) {
    super(message); this.name = 'FestivalError'; this.code = code; this.status = status; Object.assign(this, details);
  }
}

export type StoredFestival = {
  revision: number; participants: FestivalParticipant[]; installations: FestivalInstallation[];
  roundIndex: number; roundStartsAt: number;
  ambientInstallations?: FestivalAmbientInstallation[]; ambientBuildAttempts?: number[];
  /** Absent only in durable v0.1.0 JSON with the smaller stone landmark. */
  geometryVersion?: number;
  monumentLighting?: FestivalLighting;
};
export type StoredFestivalVisit = {
  lastSequence: number; isPresent: boolean;
  receipts: { requestId: string; sequence: number; fingerprint: string }[];
  lastSayAt: number | null; lastMoveAt: number | null; lastEmoteAt: number | null;
  tokens: number; tokenAt: number;
};
export interface FestivalStore {
  readState(actorId: string): Promise<{ room: StoredFestival | null; visit: StoredFestivalVisit | null }>;
  ensureRoom(initial: StoredFestival): Promise<void>;
  ensureVisit(actorId: string, initial: StoredFestivalVisit): Promise<void>;
  commit(expectedRevision: number, next: StoredFestival, actorId?: string, expectedSequence?: number, visit?: StoredFestivalVisit): Promise<boolean>;
}

export function sanitizeFestivalText(text: string): string {
  // Store plain text. Rendering must use textContent / React text nodes, never HTML.
  return normalizeFestivalChat(text).trim();
}

export function validateFestivalCommand(input: unknown): FestivalCommand {
  const invalid = (message = '这条指令无效，请重试。'): never => { throw new FestivalError('INVALID_COMMAND', message); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  if (value.roomId !== undefined && value.roomId !== 'main') return invalid('这里只开放同一个沙漠广场。');
  if (typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) return invalid();
  // Legacy controls are retired, including requests whose receipts predate v0.3.2.
  if (value.type === 'lighting') throw new FestivalError('LIGHTING_CLOSED', '作品灯光现在自动运行，不再支持手动调节。', 409);
  const keys: Record<string, string[]> = { join: ['name', 'preset'], profile: ['name', 'preset'], heartbeat: [], leave: [], move: ['x', 'z'], stop: [], emote: ['emote'], build: ['kind', 'x', 'z', 'roundIndex'], say: ['text'] };
  if (typeof value.type !== 'string' || !Object.hasOwn(keys, value.type)) return invalid();
  const allowed = new Set(['type', 'roomId', 'requestId', 'sequence', ...keys[value.type]]);
  if (Object.keys(value).some(key => !allowed.has(key))) return invalid();
  if (value.type === 'join' || value.type === 'profile') {
    if (typeof value.name !== 'string' || !value.name.trim() || [...value.name.trim()].length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(value.name) || !FESTIVAL_PRESETS.includes(value.preset as never)) return invalid('名字需要 1–24 个字，请选择一个角色。');
    return { ...value, roomId: 'main', name: value.name.trim() } as FestivalCommand;
  }
  if (value.type === 'move' && !isFestivalDestination(value.x, value.z)) return invalid('请在沙漠边界内、中央雕塑外选择落脚点。');
  if (value.type === 'emote' && !FESTIVAL_EMOTES.includes(value.emote as never)) return invalid();
  if (value.type === 'build' && (!Number.isInteger(value.kind) || Number(value.kind) < 0 || Number(value.kind) > 11 || typeof value.x !== 'number' || !Number.isFinite(value.x) || typeof value.z !== 'number' || !Number.isFinite(value.z) || !Number.isSafeInteger(value.roundIndex) || Number(value.roundIndex) < 1)) return invalid('请选择有效的装置和空地。');
  if (value.type === 'say') {
    if (typeof value.text !== 'string') return invalid();
    const text = sanitizeFestivalText(value.text);
    if (!isValidFestivalChat(text) || [...text].length > FESTIVAL_MESSAGE_MAX_LENGTH) return invalid('头顶短句需要 1–80 个字。');
    return { ...value, roomId: 'main', text } as FestivalCommand;
  }
  return { ...value, roomId: 'main' } as FestivalCommand;
}

export function initialFestival(now: number): StoredFestival {
  return { revision: 0, participants: [], installations: [], roundIndex: 1, roundStartsAt: now, geometryVersion: 2 };
}
export function initialFestivalVisit(now: number): StoredFestivalVisit {
  return { lastSequence: 0, isPresent: false, receipts: [], lastSayAt: null, lastMoveAt: null, lastEmoteAt: null, tokens: 24, tokenAt: now };
}

/** Cancellation changes the reservation and job together in the existing room CAS. */
function interruptBuild(room: StoredFestival, participant: FestivalParticipant, now: number): void {
  const task = participant.buildTask;
  if (!task) return;
  const art = room.installations.find(work => work.id === task.installationId);
  if (art && now < task.arrivalAt) room.installations = room.installations.filter(work => work.id !== art.id);
  else if (art && now < task.finishAt) art.constructionStoppedAt = now;
  if (now >= task.arrivalAt) {
    participant.x = participant.targetX; participant.z = participant.targetZ;
    participant.heading = task.facing; participant.moveAt = task.arrivalAt;
  }
  delete participant.buildTask;
}

function maintain(room: StoredFestival, now: number): boolean {
  let changed = false;
  // Autonomous artwork lighting ignores and removes every legacy override.
  if (Object.hasOwn(room, 'monumentLighting')) { delete room.monumentLighting; changed = true; }
  if (now >= room.roundStartsAt + FESTIVAL_ROUND_MS) {
    const elapsed = Math.floor((now - room.roundStartsAt) / FESTIVAL_ROUND_MS);
    room.roundIndex += elapsed; room.roundStartsAt += elapsed * FESTIVAL_ROUND_MS;
    for (const person of room.participants) delete person.buildTask;
    room.installations = []; room.ambientInstallations = []; room.ambientBuildAttempts = []; changed = true;
  }
  // An absent builder relinquishes an approach reservation, but committed
  // artwork keeps growing from createdAt, even after its builder is removed.
  for (const person of room.participants) {
    if (now - person.lastSeenAt >= FESTIVAL_PRESENCE_TTL_MS && person.buildTask && person.lastSeenAt + FESTIVAL_PRESENCE_TTL_MS < person.buildTask.arrivalAt) interruptBuild(room, person, person.lastSeenAt + FESTIVAL_PRESENCE_TTL_MS);
  }
  const living = room.participants.filter(p => now - p.lastSeenAt < FESTIVAL_PRESENCE_TTL_MS);
  if (living.length !== room.participants.length) { room.participants = living; changed = true; }
  if (room.geometryVersion !== 2) {
    // Deploy safely over v0.1.0 without deleting anyone's artwork. Sample the
    // old 11.5 m route first; sampling it with the new obstacle could jump to a
    // different tangent. Only points enclosed by the enlarged glass move out.
    const outsideGlass = (x: number, z: number) => {
      const distance = Math.hypot(x, z), radius = FESTIVAL_MONUMENT_RADIUS + 1e-6;
      if (distance >= radius) return { x, z };
      if (distance < 1e-8) return { x: 0, z: radius };
      return { x: x / distance * radius, z: z / distance * radius };
    };
    for (const person of room.participants) {
      const previous = projectParticipant(person, now, 11.5);
      const current = outsideGlass(previous.x, previous.z);
      const target = outsideGlass(person.targetX, person.targetZ);
      person.x = current.x; person.z = current.z;
      person.targetX = target.x; person.targetZ = target.z;
      person.moveAt = now; person.heading = previous.heading;
    }
    room.geometryVersion = 2; changed = true;
  }
  for (const participant of room.participants) {
    if (participant.message && participant.message.expiresAt <= now) { delete participant.message; changed = true; }
  }
  const round = festivalRoundAt(room.roundIndex, room.roundStartsAt, now);
  const allWorks = [...room.installations, ...(room.ambientInstallations ?? [])];
  const creators = [...room.participants, ...projectFestivalAmbientParticipants(round, now, allWorks)];
  for (const art of allWorks) {
    // Refresh only NPC aliases; a human's captured name survives profile edits.
    // Upgrade still-present legacy authors before a leave command removes them.
    const creator = creators.find(person => person.id === art.actorId);
    if (creator && (!art.creatorName || (isAmbientActorId(creator.id) && art.creatorName !== creator.name))) { art.creatorName = creator.name; changed = true; }
    if (Object.hasOwn(art, 'lighting')) { delete art.lighting; changed = true; }
  }
  for (const person of room.participants) {
    const task = person.buildTask;
    if (task && task.finishAt <= Math.min(now, round.burnAt)) {
      person.x = person.targetX; person.z = person.targetZ;
      person.heading = task.facing; person.moveAt = task.finishAt;
      delete person.buildTask; changed = true;
    }
  }
  if (round.phase !== 'building') {
    for (const person of room.participants) if (person.buildTask) { interruptBuild(room, person, round.burnAt); changed = true; }
  }
  if (round.phase === 'building') {
    for (let index = 0; index < FESTIVAL_AMBIENT_BUILD_DELAYS.length; index++) {
      if (now < round.startsAt + FESTIVAL_AMBIENT_BUILD_DELAYS[index] || room.ambientBuildAttempts?.includes(index)) continue;
      const works = [...room.installations, ...(room.ambientInstallations ?? [])];
      const ambient = projectFestivalAmbientParticipants(round, now, works);
      const art = planFestivalAmbientInstallation(round, index, works, [...room.participants, ...ambient], now);
      room.ambientBuildAttempts = [...(room.ambientBuildAttempts ?? []), index];
      if (art) room.ambientInstallations = [...(room.ambientInstallations ?? []), art];
      changed = true;
    }
  }
  return changed;
}

function publicSnapshot(room: StoredFestival, visit: StoredFestivalVisit, actorId: string, now: number): FestivalSnapshot {
  return {
    roomId: 'main', revision: room.revision, serverNow: now, capacity: FESTIVAL_CAPACITY,
    self: { id: actorId, role: room.participants.some(p => p.id === actorId) ? 'participant' : visit.isPresent ? 'spectator' : 'visitor', lastSequence: visit.lastSequence },
    participants: room.participants, installations: room.installations,
    ambientParticipants: projectFestivalAmbientParticipants(festivalRoundAt(room.roundIndex, room.roundStartsAt, now), now, [...room.installations, ...(room.ambientInstallations ?? [])]),
    ambientInstallations: room.ambientInstallations ?? [],
    round: festivalRoundAt(room.roundIndex, room.roundStartsAt, now),
  };
}

async function fingerprint(command: FestivalCommand): Promise<string> {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))));
  // Receipts retain only a digest, never a second copy of ephemeral speech.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const limited = (retryAfterMs: number) => new FestivalError('RATE_LIMITED', '稍等一下，再试一次。', 429, { retryAfterMs: Math.max(1, Math.ceil(retryAfterMs)) });
const busy = () => new FestivalError('ROOM_BUSY', '广场正在同步，请稍后重试。', 503, { retryAfterMs: 500 });

export function createFestivalService(store: FestivalStore, options: { now?: () => number } = {}) {
  const clock = options.now ?? Date.now;
  async function load(actorId: string): Promise<{ room: StoredFestival; visit: StoredFestivalVisit }> {
    let state = await store.readState(actorId);
    if (!state.room) await store.ensureRoom(initialFestival(clock()));
    if (!state.visit) await store.ensureVisit(actorId, initialFestivalVisit(clock()));
    if (!state.room || !state.visit) state = await store.readState(actorId);
    if (!state.room || !state.visit) throw new FestivalError('UNAVAILABLE', '暂时无法连接共享广场。', 503);
    return { room: state.room, visit: state.visit };
  }

  async function snapshot(actorId: string): Promise<FestivalSnapshot> {
    if (isAmbientActorId(actorId)) throw new FestivalError('FORBIDDEN', '环境分身没有玩家身份。', 403);
    for (let attempt = 0; attempt < 32; attempt++) {
      const { room, visit } = await load(actorId), now = clock(), revision = room.revision;
      if (maintain(room, now)) {
        room.revision++;
        if (!await store.commit(revision, room)) continue;
      }
      return publicSnapshot(room, visit, actorId, now);
    }
    throw busy();
  }

  async function command(actorId: string, input: unknown): Promise<FestivalSnapshot> {
    if (isAmbientActorId(actorId)) throw new FestivalError('FORBIDDEN', '环境分身不能接收玩家操作。', 403);
    const cmd = validateFestivalCommand(input);
    const digest = await fingerprint(cmd);
    for (let attempt = 0; attempt < 32; attempt++) {
      const { room, visit } = await load(actorId), now = clock(), revision = room.revision, expectedSequence = visit.lastSequence;
      const receipt = visit.receipts.find(r => r.requestId === cmd.requestId);
      if (receipt) {
        if (receipt.fingerprint !== digest) throw new FestivalError('REQUEST_CONFLICT', '这条操作编号已经用于另一项操作。', 409, { lastSequence: visit.lastSequence });
        return snapshot(actorId);
      }
      if (cmd.sequence <= visit.lastSequence) throw new FestivalError('STALE_SEQUENCE', '已同步更新的操作，请重试。', 409, { lastSequence: visit.lastSequence });
      maintain(room, now);
      const participant = room.participants.find(p => p.id === actorId);
      if (!['join', 'leave', 'heartbeat'].includes(cmd.type) && !participant) throw new FestivalError('NOT_PARTICIPANT', '请先加入广场，再操作你的角色。', 403);
      if (['move', 'stop', 'build'].includes(cmd.type) && isFestivalBuildLocked(participant?.buildTask, now, festivalRoundAt(room.roundIndex, room.roundStartsAt, now).burnAt)) {
        throw new FestivalError('BUILD_IN_PROGRESS', '正在搭建，完成后才能移动或创作下一件作品。', 409);
      }
      const tokens = Math.min(24, visit.tokens + Math.max(0, now - visit.tokenAt) * 0.008);
      if (tokens < 1) throw limited((1 - tokens) / 0.008);
      visit.tokens = tokens - 1; visit.tokenAt = now;
      switch (cmd.type) {
        case 'join': {
          visit.isPresent = true;
          if (participant) { participant.name = cmd.name; participant.preset = cmd.preset; participant.lastSeenAt = now; }
          else if (room.participants.length < FESTIVAL_CAPACITY) {
            const slot = Array.from({ length: FESTIVAL_CAPACITY }, (_, i) => i).find(i => !room.participants.some(p => p.slot === i))!;
            const x = (slot - 4.5) * 3, z = 44 + (slot % 2) * 2;
            room.participants.push({ id: actorId, name: cmd.name, preset: cmd.preset, slot, joinedAt: now, lastSeenAt: now, x, z, targetX: x, targetZ: z, moveAt: now, heading: Math.PI, emote: 'dance', emoteAt: 0 });
          }
          break;
        }
        case 'leave': if (participant?.buildTask && now < participant.buildTask.arrivalAt) interruptBuild(room, participant, now); room.participants = room.participants.filter(p => p.id !== actorId); visit.isPresent = false; break;
        case 'heartbeat': break;
        case 'profile': participant!.name = cmd.name; participant!.preset = cmd.preset; break;
        case 'stop': {
          interruptBuild(room, participant!, now);
          // A release may arrive after a queued target update. Freeze the
          // current server-projected point, never stale client coordinates.
          const projected = projectParticipant(participant!, now);
          participant!.x = projected.x; participant!.z = projected.z;
          participant!.targetX = projected.x; participant!.targetZ = projected.z;
          participant!.moveAt = now; participant!.heading = projected.heading;
          break;
        }
        case 'move': {
          if (visit.lastMoveAt !== null && now - visit.lastMoveAt < 80) throw limited(80 - (now - visit.lastMoveAt));
          interruptBuild(room, participant!, now);
          const projected = projectParticipant(participant!, now);
          participant!.x = projected.x; participant!.z = projected.z;
          participant!.targetX = cmd.x; participant!.targetZ = cmd.z;
          participant!.moveAt = now;
          participant!.heading = projected.heading;
          visit.lastMoveAt = now;
          break;
        }
        case 'emote':
          if (visit.lastEmoteAt !== null && now - visit.lastEmoteAt < 350) throw limited(350 - (now - visit.lastEmoteAt));
          participant!.emote = cmd.emote; participant!.emoteAt = now; visit.lastEmoteAt = now; break;
        case 'build': {
          if (cmd.roundIndex !== room.roundIndex || festivalRoundAt(room.roundIndex, room.roundStartsAt, now).phase !== 'building') throw new FestivalError('ROUND_CLOSED', '这一轮已经结束，请在新一轮重新选择落点。', 409);
          interruptBuild(room, participant!, now);
          if (room.installations.filter(art => art.actorId === actorId).length >= FESTIVAL_BUILDS_PER_ACTOR || room.installations.length >= FESTIVAL_MAX_INSTALLATIONS) throw new FestivalError('BUILD_LIMIT', '每人每轮最多建造 3 件，广场最多容纳 30 件装置。', 409);
          const works = [...room.installations, ...(room.ambientInstallations ?? [])];
          const ambient = projectFestivalAmbientParticipants(festivalRoundAt(room.roundIndex, room.roundStartsAt, now), now, works);
          const issue = getFestivalPlacementIssue(cmd.kind, cmd.x, cmd.z, works, [...room.participants, ...ambient], now);
          if (issue) throw new FestivalError('PLACEMENT_BLOCKED', festivalPlacementMessage(issue), 409);
          const approach = planFestivalBuildApproach(participant!, cmd, works, now, [...room.participants, ...ambient]);
          if (!approach) throw new FestivalError('PLACEMENT_BLOCKED', '无法安全走到这里，请选择更开阔的落点。', 409);
          if (approach.arrivalAt >= festivalRoundAt(room.roundIndex, room.roundStartsAt, now).burnAt) throw new FestivalError('ROUND_CLOSED', '燃烧即将开始，已经来不及走到这里，请等待下一轮。', 409);
          const id = crypto.randomUUID();
          room.installations.push({ id, actorId, creatorName: participant!.name, kind: cmd.kind, x: cmd.x, z: cmd.z, createdAt: approach.arrivalAt, roundIndex: room.roundIndex });
          Object.assign(participant!, approach.movement);
          participant!.buildTask = { installationId: id, arrivalAt: approach.arrivalAt, finishAt: approach.arrivalAt + FESTIVAL_CONSTRUCTION_MS, facing: approach.facing };
          break;
        }
        case 'say':
          if (visit.lastSayAt !== null && now - visit.lastSayAt < FESTIVAL_MESSAGE_INTERVAL_MS) throw limited(FESTIVAL_MESSAGE_INTERVAL_MS - (now - visit.lastSayAt));
          participant!.message = { text: cmd.text, at: now, expiresAt: now + FESTIVAL_MESSAGE_TTL_MS }; visit.lastSayAt = now; break;
      }
      if (participant && cmd.type !== 'leave') participant.lastSeenAt = now;
      visit.lastSequence = cmd.sequence;
      visit.receipts.push({ requestId: cmd.requestId, sequence: cmd.sequence, fingerprint: digest });
      visit.receipts = visit.receipts.slice(-32);
      room.revision++;
      if (await store.commit(revision, room, actorId, expectedSequence, visit)) return publicSnapshot(room, visit, actorId, now);
    }
    throw busy();
  }
  return { snapshot, command };
}
