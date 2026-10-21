import { clubMotionAt } from './club-scene-motion';
import { personalRouteTime } from './room-action-state';
import type { ClubMovementSample } from './club-manual-motion';
import { MOVEMENT_PUBLISH_MS, type MovementCommand, type MovementReply, type ParticipantMovement } from './room-movement';
import type { RoomSnapshot } from './room-types';

type Membership = { id: string; joinedAt: number };
export interface MovementClientState { movements: readonly ParticipantMovement[]; error: string | null }
export type MovementResetReason = 'epoch' | 'rejected' | 'superseded' | 'network';
interface Options {
  fetcher?: typeof fetch;
  now?: () => number;
  serverNow?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  onChange?: (state: MovementClientState) => void;
  onReset?: (reason: MovementResetReason) => void;
  onRefresh?: () => void;
}
interface Flight { command: MovementCommand; generation: number; controller: AbortController }
interface StopBarrier { command: MovementCommand; dueAt: number }

/** Membership filters are canonical; motion ordering is independent of room revision. */
export function mergeMovementRows(current: readonly ParticipantMovement[], incoming: readonly ParticipantMovement[], members: readonly Membership[]): ParticipantMovement[] {
  const membership = new Map(members.map(member => [member.id, member.joinedAt]));
  const rows = new Map<string, ParticipantMovement>();
  for (const row of [...current, ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!row || ![row.x, row.z, row.heading, row.vx, row.vz, row.acceptedAt].every(Number.isFinite) || !['manual', 'auto'].includes(row.mode)) continue;
    if (membership.get(row.actorId) !== row.joinedAt || !Number.isSafeInteger(row.moveSequence) || row.moveSequence < 1) continue;
    const old = rows.get(row.actorId);
    if (!old || row.moveSequence > old.moveSequence) rows.set(row.actorId, row);
  }
  return [...rows.values()];
}

/** One coalesced movement lane, separate from RoomClient commands/presence/pendingCount. */
export class MovementClient {
  private fetcher: typeof fetch;
  private now: () => number;
  private serverNow: () => number;
  private setTimer: typeof setTimeout;
  private clearTimer: typeof clearTimeout;
  private options: Options;
  private snapshot: RoomSnapshot | null = null;
  private state: MovementClientState = { movements: [], error: null };
  private sequence = 0;
  private generation = 0;
  private closed = false;
  private normalFlight: Flight | null = null;
  private stopFlight: Flight | null = null;
  private barrier: StopBarrier | null = null;
  private pending: ClubMovementSample | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNormalAt = -Infinity;
  private lastStopKey = '';
  private recoverySequence = 0;
  private blockedSnapshotAt: number | null = null;
  private hasLocalIntent = false;

  constructor(options: Options = {}) {
    this.options = options;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.serverNow = options.serverNow ?? this.now;
    // Window timer methods, like fetch, require their implementing global as
    // receiver. Calling an unbound default through this client stops the frame.
    this.setTimer = options.setTimer ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimer = options.clearTimer ?? globalThis.clearTimeout.bind(globalThis);
  }
  getState = () => this.state;
  private update(patch: Partial<MovementClientState>) {
    this.state = { ...this.state, ...patch };
    this.options.onChange?.(this.state);
  }
  private epoch(snapshot: RoomSnapshot | null) {
    const self = snapshot?.participants.find(person => person.id === snapshot.self.id);
    return snapshot ? `${snapshot.roomId}:${snapshot.self.id}:${snapshot.self.role}:${self?.joinedAt ?? '-'}:${snapshot.groupAction?.id ?? '-'}` : '';
  }
  private canSend() {
    const snapshot = this.snapshot;
    return !this.closed && this.blockedSnapshotAt === null && !!snapshot && snapshot.self.role === 'participant' &&
      snapshot.participants.some(person => person.id === snapshot.self.id) &&
      (!snapshot.groupAction || this.serverNow() >= snapshot.groupAction.endsAt);
  }
  private clearWork() {
    this.generation++;
    this.normalFlight?.controller.abort(); this.stopFlight?.controller.abort();
    this.normalFlight = null; this.stopFlight = null; this.pending = null; this.barrier = null;
    this.lastStopKey = ''; this.recoverySequence = 0;
    if (this.wakeTimer !== null) this.clearTimer(this.wakeTimer);
    this.wakeTimer = null;
  }
  /** Use only the ordinary client's accepted snapshot to change membership/group epochs. */
  setSnapshot(snapshot: RoomSnapshot) {
    if (this.closed) return;
    const previous = this.snapshot;
    if (this.epoch(previous) !== this.epoch(snapshot)) {
      this.clearWork();
      this.lastNormalAt = -Infinity;
      this.hasLocalIntent = false;
      if (previous?.roomId !== snapshot.roomId || previous?.self.id !== snapshot.self.id) {
        this.sequence = 0;
        this.state = { movements: [], error: null };
      }
      if (previous) this.options.onReset?.('epoch');
    }
    this.snapshot = snapshot;
    if (this.blockedSnapshotAt !== null && snapshot.serverNow > this.blockedSnapshotAt) this.blockedSnapshotAt = null;
    this.observeSnapshot(snapshot);
  }
  /** Also receive rejected ordinary snapshots: their movement read may be newer. */
  observeSnapshot(snapshot: RoomSnapshot) {
    if (this.closed || !this.snapshot || snapshot.roomId !== this.snapshot.roomId || snapshot.self.id !== this.snapshot.self.id) return;
    const movements = mergeMovementRows(this.state.movements, snapshot.movements ?? [], this.snapshot.participants);
    const nextSequence = Math.max(snapshot.self.lastMoveSequence ?? 0, movements.find(row => row.actorId === snapshot.self.id)?.moveSequence ?? 0);
    if (nextSequence > this.sequence) {
      this.sequence = nextSequence;
      // A different tab won ordering. Never replay this tab's old direction.
      if (this.hasLocalIntent || this.pending || this.normalFlight || this.barrier) {
        this.clearWork(); this.hasLocalIntent = false; this.options.onReset?.('superseded');
      }
    }
    this.update({ movements });
  }
  offer(sample: ClubMovementSample) {
    if (!this.canSend() || ![sample.x, sample.z, sample.heading, sample.vx, sample.vz].every(Number.isFinite)) return;
    this.hasLocalIntent = true;
    if (sample.reason === 'stop') {
      const key = `${sample.x}:${sample.z}:${sample.heading}`;
      if (key === this.lastStopKey) return;
      this.lastStopKey = key;
      this.pending = null;
      // A newer stop replaces the barrier, never creating an unbounded queue.
      this.barrier = { command: this.command({ ...sample, mode: 'manual', vx: 0, vz: 0 }), dueAt: this.now() };
    } else { this.lastStopKey = ''; this.pending = { ...sample }; }
    this.pump();
  }
  private command(sample: ClubMovementSample): MovementCommand {
    const snapshot = this.snapshot!;
    return {
      roomId: snapshot.roomId, moveSequence: ++this.sequence,
      joinedAt: snapshot.participants.find(person => person.id === snapshot.self.id)!.joinedAt,
      groupId: snapshot.groupAction?.id ?? null,
      mode: sample.mode, x: sample.x, z: sample.z, heading: sample.heading,
      vx: sample.mode === 'auto' ? 0 : sample.vx, vz: sample.mode === 'auto' ? 0 : sample.vz,
    };
  }
  private wake(delay: number) {
    if (this.wakeTimer !== null) this.clearTimer(this.wakeTimer);
    this.wakeTimer = this.setTimer(() => { this.wakeTimer = null; this.pump(); }, Math.max(0, delay));
  }
  private pump() {
    if (!this.canSend()) return;
    if (this.barrier) {
      if (this.stopFlight) return;
      if (this.barrier.dueAt > this.now()) { this.wake(this.barrier.dueAt - this.now()); return; }
      this.send(this.barrier.command, true); return;
    }
    if (!this.pending || this.normalFlight) return;
    const wait = this.lastNormalAt + MOVEMENT_PUBLISH_MS - this.now();
    if (wait > 0) { this.wake(wait); return; }
    const sample = this.pending; this.pending = null;
    this.lastNormalAt = this.now();
    this.send(this.command(sample), false);
  }
  private reject(reason: MovementResetReason, message: string) {
    this.clearWork();
    if (reason === 'superseded') this.hasLocalIntent = false;
    this.update({ error: message });
    this.options.onReset?.(reason);
    this.options.onRefresh?.();
  }
  private send(command: MovementCommand, stop: boolean) {
    const flight: Flight = { command, generation: this.generation, controller: new AbortController() };
    if (stop) this.stopFlight = flight; else this.normalFlight = flight;
    const timeout = this.setTimer(() => flight.controller.abort(), 8000);
    void (async () => {
      try {
        const response = await this.fetcher('/api/room/move', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: flight.controller.signal,
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
        });
        const data = await response.json() as Partial<MovementReply> & { error?: { code?: string; lastMoveSequence?: number; retryAfterMs?: number } };
        if (this.closed || flight.generation !== this.generation) return;
        if (!response.ok) {
          const code = data?.error?.code;
          const supersededLocally = command.moveSequence < this.sequence;
          if (Number.isSafeInteger(data?.error?.lastMoveSequence)) this.sequence = Math.max(this.sequence, data.error!.lastMoveSequence!);
          if (stop && code === 'INVALID_COMMAND') {
            this.recoverStop(command); return;
          }
          if (!stop && supersededLocally) return;
          if (stop && (code === 'RATE_LIMITED' || response.status >= 500)) {
            this.retryStop(command, data?.error?.retryAfterMs); return;
          }
          if (!stop && response.status >= 500) throw new Error('Movement write uncertain');
          if (['GROUP_ACTIVE', 'STALE_MOVEMENT_EPOCH', 'NOT_PARTICIPANT'].includes(code ?? '')) this.blockedSnapshotAt = this.snapshot!.serverNow;
          this.reject(code === 'REQUEST_CONFLICT' ? 'superseded' : 'rejected', code === 'GROUP_ACTIVE' ? '全场互动中，稍后再移动。' : '位置同步已暂停，请重新推动摇杆。');
          return;
        }
        const reply = data as MovementReply;
        if (reply.roomId !== command.roomId || !Number.isSafeInteger(reply.lastMoveSequence) ||
            !reply.movement || reply.movement.actorId !== this.snapshot?.self.id ||
            reply.movement.joinedAt !== command.joinedAt || !Number.isSafeInteger(reply.movement.moveSequence) ||
            ![reply.movement.x, reply.movement.z, reply.movement.heading, reply.movement.vx, reply.movement.vz, reply.movement.acceptedAt].every(Number.isFinite)) {
          throw new Error('Incomplete movement response');
        }
        const localSequence = this.sequence;
        const newerLocalWork = localSequence > command.moveSequence;
        this.sequence = Math.max(this.sequence, reply.lastMoveSequence);
        this.update({ movements: mergeMovementRows(this.state.movements, [reply.movement], this.snapshot!.participants), error: null });
        if (!reply.accepted && (!newerLocalWork || reply.lastMoveSequence > localSequence)) {
          this.reject('superseded', '位置已在其他页面更新，请重新推动摇杆。'); return;
        }
        if (this.barrier?.command.moveSequence === command.moveSequence) this.barrier = null;
      } catch {
        if (this.closed || flight.generation !== this.generation) return;
        if (!stop && command.moveSequence < this.sequence) return;
        if (stop) this.retryStop(command);
        else {
          // An uncertain moving write might have committed. Park with a newer stop,
          // rather than replaying a stale direction after reconnection.
          const latest = this.pending ?? command;
          this.pending = null;
          this.options.onReset?.('network');
          this.update({ error: '位置连接中断，已停下。' });
          if (!this.barrier) this.barrier = { command: this.command({ ...latest, reason: 'stop', mode: 'manual', vx: 0, vz: 0 }), dueAt: this.now() };
          this.options.onRefresh?.();
        }
      } finally {
        this.clearTimer(timeout);
        if (flight === this.normalFlight) this.normalFlight = null;
        if (flight === this.stopFlight) this.stopFlight = null;
        if (!this.closed && flight.generation === this.generation) this.pump();
      }
    })();
  }
  private recoverStop(command: MovementCommand) {
    if (this.barrier?.command.moveSequence !== command.moveSequence) return;
    this.pending = null;
    // A stop can overtake the first manual start and fail the first-origin
    // bound. Keep fencing that late start while the renderer rolls back.
    if (this.recoverySequence !== command.moveSequence) {
      this.recoverySequence = command.moveSequence;
      this.options.onReset?.('rejected');
      this.options.onRefresh?.();
    }
    const previous = this.state.movements.find(row => row.actorId === this.snapshot?.self.id && row.joinedAt === command.joinedAt);
    const accepted = previous?.mode === 'manual' && previous.groupId === command.groupId ? previous : null;
    const member = this.snapshot!.participants.find(person => person.id === this.snapshot!.self.id)!;
    const group = this.snapshot!.groupAction;
    const parkedAfterGroup = previous?.mode === 'manual' && previous.groupId !== command.groupId && group && this.serverNow() >= group.endsAt;
    const canonical = clubMotionAt(personalRouteTime(member, parkedAfterGroup ? group.endsAt : this.serverNow()), member.slot);
    // A v2 wave overlays the parked avatar without moving its navigation root.
    const retainedWavePoint = parkedAfterGroup && group.kind === 'wave' && group.version === 2 ? previous : null;
    const point = accepted ?? retainedWavePoint ?? canonical;
    const corrected: ClubMovementSample = { mode: 'manual', x: point.x, z: point.z, heading: point.heading, vx: 0, vz: 0, reason: 'stop' };
    // This pure fallback also works while hidden or when WebGL is unavailable.
    this.lastStopKey = `${corrected.x}:${corrected.z}:${corrected.heading}`;
    this.barrier = { command: this.command(corrected), dueAt: this.now() + MOVEMENT_PUBLISH_MS };
    this.update({ error: '正在校正停止位置…' });
  }
  private retryStop(command: MovementCommand, delay = MOVEMENT_PUBLISH_MS) {
    if (this.barrier?.command.moveSequence !== command.moveSequence) return;
    this.barrier.dueAt = this.now() + Math.max(MOVEMENT_PUBLISH_MS, Math.min(30_000, Number.isFinite(delay) ? delay : MOVEMENT_PUBLISH_MS));
    this.update({ error: '正在同步停止位置…' });
  }
  close() { this.closed = true; this.clearWork(); }
}
