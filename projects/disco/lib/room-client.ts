import type { TrackId } from './music-catalog';
import type { AvatarPreset, GroupActionKind, LightMode, RoomAction, RoomSnapshot } from './room-types';

export type RoomCommandInput =
  | { type: 'join' | 'profile'; name: string; preset: AvatarPreset }
  | { type: 'action'; action: RoomAction }
  | { type: 'chat'; text: string }
  | { type: 'dance-start' }
  | { type: 'dance-submit'; roundId: string; hits: { noteId: number; offsetMs: number }[] }
  | { type: 'group-action'; kind: GroupActionKind }
  | { type: 'track'; trackId: TrackId }
  | { type: 'track-step'; direction: -1 | 1 }
  | { type: 'lights'; lightMode: LightMode }
  | { type: 'heartbeat' | 'leave' };

export interface RoomClientState {
  snapshot: RoomSnapshot | null;
  status: 'connecting' | 'live' | 'reconnecting';
  error: string | null;
  serverOffsetMs: number;
  lastSyncedAt: number | null;
  pendingCount: number;
}

export const INITIAL_ROOM_STATE: RoomClientState = {
  snapshot: null, status: 'connecting', error: null,
  serverOffsetMs: 0, lastSyncedAt: null, pendingCount: 0,
};

/** Midpoint clock calibration. The quickest recent request is least biased by queueing. */
export class ServerClock {
  private samples: { rtt: number; offset: number; at: number }[] = [];
  offsetMs = 0;

  observe(serverNow: number, sentAt: number, receivedAt: number) {
    const rtt = receivedAt - sentAt;
    if (![serverNow, sentAt, receivedAt, rtt].every(Number.isFinite) || rtt < 0) return;
    this.samples = this.samples.filter(sample => receivedAt - sample.at < 60_000);
    this.samples.push({ rtt, offset: serverNow - (sentAt + receivedAt) / 2, at: receivedAt });
    if (this.samples.length > 80) this.samples.shift();
    const best = this.samples.reduce((a, b) => b.rtt < a.rtt ? b : a);
    this.offsetMs = best.offset;
  }

  serverTime(clientNow = Date.now()) { return clientNow + this.offsetMs; }
}

export function shouldAcceptSnapshot(current: RoomSnapshot | null, next: RoomSnapshot): boolean {
  if (!current) return true;
  if (next.roomId !== current.roomId || next.revision < current.revision || next.self.lastSequence < current.self.lastSequence) return false;
  if (next.revision > current.revision) return true;
  return next.self.lastSequence >= current.self.lastSequence && next.serverNow >= current.serverNow;
}

export class RoomRequestError extends Error {
  code: string;
  status: number;
  retryAfterMs?: number;
  constructor(message: string, code: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'RoomRequestError';
    this.code = code; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}

interface RoomClientOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  /** Independent movement samples can be newer even when room revision is stale. */
  onSnapshot?: (snapshot: RoomSnapshot) => void;
}

/** A single client owns ordering, retries and presence. Room state is never fabricated locally. */
export class RoomClient {
  readonly roomId: string;
  private fetcher: typeof fetch;
  private now: () => number;
  private onSnapshot?: (snapshot: RoomSnapshot) => void;
  private clock = new ServerClock();
  private state: RoomClientState = { ...INITIAL_ROOM_STATE };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private sequence = 0;
  private refreshPromise: Promise<RoomSnapshot> | null = null;
  private requests = new Set<AbortController>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private visible = true;
  private closed = false;
  private retryNotBefore = 0;
  private lastTransportDiagnostic = '';

  constructor(roomId = 'main', options: RoomClientOptions = {}) {
    this.roomId = roomId;
    // Browser Web IDL operations require the implementing global as their receiver.
    // Storing an unbound fetch and calling this.fetcher(...) passes RoomClient instead.
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.onSnapshot = options.onSnapshot;
  }

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<RoomClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  private accept(snapshot: RoomSnapshot, sentAt: number, receivedAt: number) {
    if (this.closed) return;
    this.retryNotBefore = 0;
    this.clock.observe(snapshot.serverNow, sentAt, receivedAt);
    this.sequence = Math.max(this.sequence, snapshot.self.lastSequence);
    this.update({
      snapshot: shouldAcceptSnapshot(this.state.snapshot, snapshot) ? snapshot : this.state.snapshot,
      serverOffsetMs: this.clock.offsetMs,
      status: 'live', error: null, lastSyncedAt: receivedAt,
    });
    this.onSnapshot?.(snapshot);
  }

  private networkFailure(error: unknown) {
    if (this.closed) return;
    if (error instanceof RoomRequestError && error.status < 500) return;
    this.update({ status: 'reconnecting', error: 'Connection interrupted. Trying to reconnect…' });
  }

  private reportTransportFailure(error: unknown) {
    if (this.closed) return;
    const name = error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 48) : 'UnknownError';
    const message = (error instanceof Error ? error.message : 'Unknown transport failure')
      .replace(/(?:https?|wss?):\/\/[^\s]+/gi, '[URL]')
      .replace(/(?:authorization|proxy-authorization|set-cookie|cookie)\s*:[^\r\n]*/gi, '[redacted]')
      .replace(/[\r\n\t]/g, ' ').slice(0, 240);
    const diagnostic = { name, message };
    const key = JSON.stringify(diagnostic);
    if (key === this.lastTransportDiagnostic) return;
    this.lastTransportDiagnostic = key;
    // Never log request/response objects, headers, cookies, URLs, or command bodies.
    console.warn('[room-client] Transport failed before HTTP response.', diagnostic);
  }

  private async request(method: 'GET' | 'POST', body?: object): Promise<RoomSnapshot> {
    if (this.closed) throw new Error('The room connection is closed.');
    const controller = new AbortController();
    this.requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 8_000);
    const sentAt = this.now();
    try {
      let result: Response;
      try {
        result = await this.fetcher(`/api/room?room=${encodeURIComponent(this.roomId)}`, {
          method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        this.reportTransportFailure(error);
        throw error;
      }
      this.lastTransportDiagnostic = '';
      const receivedAt = this.now();
      const data = await result.json() as Partial<RoomSnapshot> & { error?: { message?: string; code?: string; retryAfterMs?: number }; snapshot?: RoomSnapshot };
      if (this.closed) throw new Error('The room connection is closed.');
      if (!result.ok) {
        if (data.snapshot?.self && Number.isFinite(data.snapshot.revision)) this.accept(data.snapshot, sentAt, receivedAt);
        throw new RoomRequestError(data?.error?.message ?? 'The room could not respond. Try again.',
          data?.error?.code ?? 'ROOM_UNAVAILABLE', result.status, data?.error?.retryAfterMs);
      }
      if (!data?.self || !Array.isArray(data.participants) || !data.track ||
          !Number.isFinite(data.revision) || !Number.isFinite(data.serverNow)) {
        throw new RoomRequestError('The room returned an incomplete update.', 'INVALID_RESPONSE', 502);
      }
      this.accept(data as RoomSnapshot, sentAt, receivedAt);
      return data as RoomSnapshot;
    } finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }

  refresh(): Promise<RoomSnapshot> {
    if (this.closed) return Promise.reject(new Error('The room connection is closed.'));
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.request('GET').catch(error => {
      if (!this.closed) {
        const delay = error instanceof RoomRequestError ? error.retryAfterMs : undefined;
        this.retryNotBefore = this.now() + (Number.isFinite(delay) ? Math.min(60_000, Math.max(0, delay!)) : 0);
        this.update({ status: 'reconnecting', error: error instanceof RoomRequestError ? error.message : 'Connection interrupted. Trying to reconnect…' });
      }
      throw error;
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  command(input: RoomCommandInput): Promise<RoomSnapshot> {
    if (this.closed) return Promise.reject(new Error('The room connection is closed.'));
    this.update({ pendingCount: this.state.pendingCount + 1 });
    const operation = this.queue.catch(() => undefined).then(async () => {
      if (this.closed) throw new Error('The room connection is closed.');
      if (!this.state.snapshot) await this.refresh();
      let command = { ...input, roomId: this.roomId, requestId: crypto.randomUUID(), sequence: ++this.sequence };
      let recoveredSequence = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await this.request('POST', command); }
        catch (error) {
          if (this.closed) throw error;
          if (error instanceof RoomRequestError && error.code === 'STALE_SEQUENCE' && !recoveredSequence) {
            await this.refresh();
            command = { ...command, requestId: crypto.randomUUID(), sequence: ++this.sequence };
            recoveredSequence = true;
            attempt--;
            continue;
          }
          const retryable = !(error instanceof RoomRequestError) || error.status >= 500;
          if (!retryable || attempt === 1) throw error;
          this.networkFailure(error);
          // Same identity and sequence: the server may have committed before the connection failed.
        }
      }
      throw new Error('The room could not respond.');
    }).catch(error => {
      this.networkFailure(error); throw error;
    }).finally(() => { this.update({ pendingCount: Math.max(0, this.state.pendingCount - 1) }); });
    this.queue = operation;
    return operation;
  }

  private schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (!this.running || !this.visible) return;
    const baseDelay = this.state.status === 'reconnecting' ? 2_000 :
      this.state.snapshot?.self.role === 'participant' ? 850 : 2_000;
    const delay = Math.max(baseDelay, this.retryNotBefore - this.now());
    this.pollTimer = setTimeout(() => {
      void this.refresh().catch(() => undefined).finally(() => this.schedulePoll());
    }, delay);
  }

  start() {
    if (this.running || this.closed) return;
    this.running = true;
    void this.refresh().catch(() => undefined).finally(() => this.schedulePoll());
    this.heartbeatTimer = setInterval(() => {
      if (this.visible && this.state.snapshot?.self.role === 'participant' && this.state.pendingCount === 0) {
        void this.command({ type: 'heartbeat' }).catch(() => undefined);
      }
    }, 15_000);
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (visible && this.running) {
      void this.refresh().catch(() => undefined).finally(() => this.schedulePoll());
    }
  }

  stop() {
    this.closed = true;
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.requests.forEach(controller => controller.abort());
    this.listeners.clear();
  }
}
