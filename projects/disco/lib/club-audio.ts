import { getTrack, getTrackTiming, type ClubTrack, type TrackId, type TrackTiming } from "./music-catalog.ts";

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const MAX_ENCODED_BYTES = 16 * 1024 * 1024;
const MAX_DECODED_BYTES = 52 * 1024 * 1024;
const MAX_SELECTED_DECODED_BYTES = 160 * 1024 * 1024;
const DECODE_SAMPLE_RATE = 32000;
const RESUME_WAIT_MS = 400;
const modulo = (value: number, length: number) => ((value % length) + length) % length;

/** Signed, shortest phase difference (desired minus actual), in seconds. */
export function circularTimingError(desired: number, actual: number, duration: number): number {
  return modulo(desired - actual + duration / 2, duration) - duration / 2;
}

export interface RoundRecording {
  id: string;
  audioUrl: string;
  durationSeconds: number;
  playbackGain: number;
}

export interface ClubAudioOptions {
  /** An injectable epoch clock; defaults to Date.now. Offset is server - client. */
  now?: () => number;
  createContext?: () => AudioContext;
  /** Optional recording loader for embeddings and tests. Never synthesizes a fallback. */
  loadBuffer?: (track: ClubTrack, context: AudioContext, signal: AbortSignal) => Promise<AudioBuffer>;
  fetcher?: typeof fetch;
  onStateChange?: (status: ClubAudioStatus) => void;
}
export interface ClubAudioStatus {
  desiredEnabled: boolean;
  needsGesture: boolean;
  unlocked: boolean;
  playing: boolean;
  contextState: string;
  muted: boolean;
  volume: number;
  driftMs: number;
  loading: boolean;
  error: string | null;
}

/**
 * The caller must invoke unlock() directly from a click/touch gesture on iOS.
 * AudioBufferSourceNode.start(when, offset) uses the hardware audio clock;
 * timers only correct slow clock drift, never trigger musical notes.
 * https://www.w3.org/TR/webaudio/#dom-audiobuffersourcenode-start
 */
export class ClubAudio {
  private readonly now: () => number;
  private readonly options: ClubAudioOptions;
  private context: AudioContext | null = null;
  private decoder: Pick<BaseAudioContext, "decodeAudioData" | "sampleRate"> | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private readonly retiringSources = new Map<AudioBufferSourceNode, GainNode | null>();
  private buffer: { id: TrackId; audio: AudioBuffer } | null = null;
  private readonly fetcher: typeof fetch;
  private playlistOrder: TrackId[] = [];
  private readonly encoded = new Map<TrackId, ArrayBuffer>();
  private warmBuffer: { id: TrackId; audio: AudioBuffer } | null = null;
  private prefetchBytes: { id: TrackId; signal: AbortSignal; promise: Promise<ArrayBuffer> } | null = null;
  private warmPreparation: { id: TrackId; signal: AbortSignal; promise: Promise<AudioBuffer> } | null = null;
  private preloadTask: Promise<void> | null = null;
  private preloadController: AbortController | null = null;
  private activePreloadId: TrackId | null = null;
  private readonly preloadFailures = new Set<TrackId>();
  private readonly preloadAttempts = new Set<TrackId>();
  private loadController: AbortController | null = null;
  private decodeQueue: Promise<void> = Promise.resolve();
  private track: ClubTrack | null = null;
  private startsAt = 0;
  private serverOffset = 0;
  private volume = 0.68;
  private muted = false;
  private unlocked = false;
  private unlockVersion = 0;
  private readonly resumeWaiters = new Set<() => void>();
  private disposed = false;
  private manuallySuspended = false;
  private backgroundSuspended = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private playbackStateTimer: ReturnType<typeof setTimeout> | null = null;
  private sourceAnchorTime = 0;
  private sourcePosition = 0;
  private sourceRate = 1;
  private driftMs = 0;
  private loading = false;
  private error: string | null = null;
  private roundRecording: {
    descriptor: RoundRecording; controller: AbortController; bytes: ArrayBuffer | null;
    audio: AudioBuffer | null; task: Promise<boolean> | null; error: string | null;
  } | null = null;
  private roundClaimed = false;
  private nextFadeInSeconds = .018;
  private preparationVersion = 0;
  private pendingPreparation: { key: string; promise: Promise<void> } | null = null;


  constructor(options: ClubAudioOptions = {}) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    // A fresh visit always requests music. Explicit mute belongs to this player
    // session, so an old localStorage preference cannot silence future launches.
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.handleVisibility);
    if (typeof window !== "undefined") window.addEventListener("pageshow", this.handlePageShow);
  }

  /** Startup and intentional gestures may call this without awaiting browser policy. */
  requestPlayback(): void {
    this.notify();
    if (this.disposed || this.muted || this.manuallySuspended || this.backgroundSuspended) return;
    if (this.context?.state === "running" && this.unlocked && !this.error) return;
    void this.unlock();
  }

  private resumeContext(context: AudioContext): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.resumeWaiters.delete(cancel);
        if (error) reject(error); else resolve();
      };
      const cancel = () => finish();
      const timer = setTimeout(cancel, RESUME_WAIT_MS);
      this.resumeWaiters.add(cancel);
      // The call itself remains synchronous in the user's gesture stack. Some
      // browsers leave resume pending until a gesture; the UI must never wait.
      try { Promise.resolve(context.resume()).then(() => finish(), error => finish(error)); }
      catch (error) { finish(error); }
    });
  }

  /** Create/resume synchronously in the gesture stack, before any await. */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    const version = ++this.unlockVersion;
    this.manuallySuspended = false;
    this.preloadFailures.clear();
    this.preloadAttempts.clear();
    try {
      if (!this.context) {
        const globalAudio = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
        const Context = globalAudio.AudioContext ?? globalAudio.webkitAudioContext;
        if (!this.options.createContext && !Context) return false;
        let context: AudioContext;
        if (this.options.createContext) context = this.options.createContext();
        else {
          try { context = new Context({ latencyHint: "interactive", sampleRate: DECODE_SAMPLE_RATE }); }
          catch { context = new Context({ latencyHint: "interactive" }); }
        }
        // Decode separately at a bounded rate even if hardware playback ignores
        // or rejects the preferred rate. Older engines safely use their actual rate.
        const offlineGlobal = globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext };
        const Offline = offlineGlobal.OfflineAudioContext ?? offlineGlobal.webkitOfflineAudioContext;
        try { this.decoder = Offline ? new Offline(2, 1, DECODE_SAMPLE_RATE) : context; }
        catch { this.decoder = context; }
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(context.destination);
        context.addEventListener("statechange", this.handleContextState);
        // A one-frame silent source helps older WebKit unlock the output route.
        const silent = context.createBufferSource();
        silent.buffer = context.createBuffer(1, 1, 22050);
        silent.connect(context.destination);
        silent.onended = () => silent.disconnect();
        silent.start();
      }
      const context = this.context;
      this.notify();
      await this.resumeContext(context);
      if (version !== this.unlockVersion) return this.unlocked && !this.disposed;
      if (this.disposed || this.manuallySuspended || this.backgroundSuspended) return false;
      this.unlocked = context.state === "running";
      if (this.unlocked) {
        if (this.roundRecording) void this.preloadRoundRecording(this.roundRecording.descriptor);
        await this.prepareAndSchedule();
        if (!this.syncTimer && !this.disposed) this.syncTimer = setInterval(() => this.resync(), 2000);
      }
      this.notify();
      return this.unlocked && !this.disposed;
    } catch (cause) {
      if (this.disposed || version !== this.unlockVersion) return false;
      // Autoplay refusal is expected policy, not a corrupt/downloaded recording.
      if (!(cause instanceof DOMException && cause.name === "NotAllowedError")) this.reportError("unlock", cause);
      this.notify();
      return false;
    }
  }

  setTrack(id: TrackId | string, startsAtServerMs: number, serverOffsetMs = this.serverOffset): void {
    if (this.disposed) return;
    const track = getTrack(id);
    if (!Number.isFinite(startsAtServerMs) || !Number.isFinite(serverOffsetMs)) throw new RangeError("Track timing requires finite timestamps");
    const changed = track.id !== this.track?.id || startsAtServerMs !== this.startsAt;
    if (changed) {
      this.preloadAttempts.clear();
      this.cancelPreparation();
      this.cancelPreload(track.id);
      if (this.buffer?.id !== track.id) this.buffer = null;
      if (this.warmBuffer?.id !== track.id) this.warmBuffer = null;
    }
    this.track = track;
    this.startsAt = startsAtServerMs;
    this.serverOffset = serverOffsetMs;
    this.resync(changed);
  }

  /** Server-supplied order only. Fetch/decode begins after successful gesture unlock. */
  setPlaylistOrder(ids: readonly string[]): void {
    if (this.disposed) return;
    const order: TrackId[] = [];
    for (const id of ids) {
      try { const canonical = getTrack(id).id; if (!order.includes(canonical)) order.push(canonical); }
      catch { /* Ignore stale or unknown wire IDs without interrupting playback. */ }
    }
    if (order.join(',') !== this.playlistOrder.join(',')) {
      this.playlistOrder = order;
      this.preloadFailures.clear();
      this.preloadAttempts.clear();
      this.cancelPreload();
    }
    this.startPreload();
    this.resync();
  }

  setServerOffset(serverOffsetMs: number): void {
    if (!Number.isFinite(serverOffsetMs)) throw new RangeError("Server offset must be finite");
    this.serverOffset = serverOffsetMs;
    this.resync();
  }

  /** Exclusive round ownership keeps the ordinary room epoch intact. */
  claimRoundAudio(claimed: boolean, roundStartsAt?: number, serverOffsetMs = this.serverOffset): void {
    if (this.disposed || this.roundClaimed === claimed) return;
    this.roundClaimed = claimed;
    if (claimed) {
      this.cancelPreparation();
      this.cancelPreload();
      this.fadeOrdinaryIntoRound(roundStartsAt, serverOffsetMs);
    } else {
      this.nextFadeInSeconds = .65;
      this.resync(true);
    }
    this.notify();
  }

  /** Keep one quiet bed through countdown, with one bounded 180 ms crossfade. */
  private fadeOrdinaryIntoRound(roundStartsAt: number | undefined, serverOffsetMs: number): void {
    if (this.playbackStateTimer) clearTimeout(this.playbackStateTimer);
    this.playbackStateTimer = null;
    this.clearRetiringSources();
    const source = this.source;
    const gain = this.sourceGain;
    const context = this.context;
    this.source = null;
    this.sourceGain = null;
    if (!source || !gain || !context) return;
    const now = context.currentTime;
    const seconds = roundStartsAt === undefined ? .9 : (roundStartsAt - this.now() - serverOffsetMs) / 1000 - this.outputLatency();
    const cutover = now + Math.max(.03, seconds);
    const end = cutover + .18;
    const duckEnd = Math.min(now + .9, Math.max(now, cutover - .1));
    const bedEnd = cutover;
    const level = (this.track?.playbackGain ?? 1) * .2;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    if (end - now > .25) {
      gain.gain.linearRampToValueAtTime(level, duckEnd);
      gain.gain.setValueAtTime(level, bedEnd);
    }
    gain.gain.linearRampToValueAtTime(0, end);
    this.retiringSources.set(source, gain);
    source.stop(end);
  }

  /** Shared gesture-unlocked context and master gain; never a second output route. */
  getRoundAudioOutput(): { context: AudioContext; destination: GainNode; latency: number } | null {
    return !this.disposed && this.context && this.master
      ? { context: this.context, destination: this.master, latency: this.outputLatency() } : null;
  }

  async loadRoundBuffer(id: string | RoundRecording, signal: AbortSignal): Promise<AudioBuffer> {
    const context = this.context;
    if (!context || this.disposed) throw new Error("Enable sound before joining the dance round");
    // Independent, single-entry cache survives ordinary track changes/round claims.
    if (typeof id !== 'string') {
      if (!await this.preloadRoundRecording(id)) throw new Error(this.roundRecording?.error ?? "Round audio is not ready");
      this.assertLoading(context, signal);
      const cached = this.roundRecording;
      if (!cached?.audio || cached.descriptor.audioUrl !== id.audioUrl) throw new Error("Round audio was replaced");
      return cached.audio;
    }
    const track = getTrack(id);
    if (this.buffer?.id === track.id) return this.buffer.audio;
    if (this.warmBuffer?.id === track.id) return this.warmBuffer.audio;
    const buffer = this.options.loadBuffer
      ? await this.options.loadBuffer(track, context, signal)
      : await this.loadRecording(track, context, signal);
    this.assertLoading(context, signal);
    this.validateBuffer(track, buffer);
    return buffer;
  }

  getRoundRecordingStatus(recording: RoundRecording): { loading: boolean; ready: boolean; error: string | null } {
    const cached = this.roundRecording?.descriptor.audioUrl === recording.audioUrl ? this.roundRecording : null;
    return { loading: !!cached?.task, ready: !this.disposed && !!cached?.audio, error: cached?.error ?? null };
  }

  /** Observe a gesture resume without waiting for ordinary-song download/decode. */
  private waitForRoundContext(context: AudioContext, signal: AbortSignal): Promise<boolean> {
    if (context.state === 'running') return Promise.resolve(true);
    if (signal.aborted || this.disposed || context.state === 'closed') return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        context.removeEventListener('statechange', changed);
        signal.removeEventListener('abort', finish);
        resolve(!signal.aborted && !this.disposed && context.state === 'running');
      };
      const changed = () => { if (context.state === 'running' || context.state === 'closed') finish(); };
      const timer = setTimeout(finish, RESUME_WAIT_MS);
      context.addEventListener('statechange', changed);
      signal.addEventListener('abort', finish, { once: true });
      changed();
    });
  }

  /** Fetch immediately, but decode only after the shared gesture context exists.
   * A single cache owns <=4 MiB compressed +24 MiB decoded; no audio nodes start.
   */
  preloadRoundRecording(recording: RoundRecording): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    let cached = this.roundRecording;
    if (!cached || cached.descriptor.audioUrl !== recording.audioUrl) {
      cached?.controller.abort();
      cached = { descriptor: recording, controller: new AbortController(), bytes: null, audio: null, task: null, error: null };
      this.roundRecording = cached;
    }
    if (cached.audio) return Promise.resolve(true);
    if (cached.controller.signal.aborted) cached.controller = new AbortController();
    if (cached.task) return cached.task;
    const entry = cached;
    const signal = entry.controller.signal;
    entry.error = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => {
        entry.error = 'Round music preparation timed out. Tap to retry.';
        entry.controller.abort();
        resolve(false);
      }, 15000);
    });
    let cancel: () => void = () => undefined;
    const cancelled = new Promise<boolean>(resolve => {
      cancel = () => resolve(false);
      signal.addEventListener('abort', cancel, { once: true });
    });
    const work = Promise.resolve().then(async () => {
      if (!entry.bytes) {
        const response = await this.fetcher(recording.audioUrl, { signal, cache: "force-cache", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Round audio request failed (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (signal.aborted || this.disposed) return false;
        if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw new Error("Round audio asset size is outside the supported limit");
        entry.bytes = bytes;
      }
      const context = this.context;
      if (!context || !await this.waitForRoundContext(context, signal)) return false;
      this.assertLoading(context, signal);
      if (!Number.isFinite(recording.durationSeconds) || recording.durationSeconds <= 0 ||
        (recording.durationSeconds + .15) * (this.decoder?.sampleRate ?? context.sampleRate) * 8 > 24 * 1024 * 1024) {
        throw new Error("Round recording exceeds preload memory limit");
      }
      const buffer = await this.decodeRecording(entry.bytes, context, signal);
      this.validateBuffer(recording, buffer);
      if (buffer.length * buffer.numberOfChannels * 4 > 24 * 1024 * 1024) throw new Error("Round recording exceeds decoded memory limit");
      this.assertLoading(context, signal);
      entry.audio = buffer;
      return true;
    }).catch(cause => {
      if (!signal.aborted && !this.disposed) {
        entry.error = 'Round music could not preload. Tap to retry.';
        this.reportError('round preload', cause);
      }
      return false;
    });
    const task = Promise.race([work, deadline, cancelled]).finally(() => {
      if (timeout) clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      entry.task = null;
    });
    entry.task = task;
    return task;
  }

  /** nowLocalMs defaults to the same epoch clock used for audio scheduling. */
  getTiming(nowLocalMs = this.now()): TrackTiming | null {
    return this.track ? getTrackTiming(this.track, this.startsAt, nowLocalMs + this.serverOffset) : null;
  }

  getStatus(): ClubAudioStatus {
    return {
      desiredEnabled: !this.muted && !this.manuallySuspended && !this.disposed,
      needsGesture: !this.muted && !this.manuallySuspended && !this.backgroundSuspended && !this.disposed && this.context?.state !== "running" && this.context?.state !== "closed",
      unlocked: this.unlocked,
      playing: !this.muted && this.volume > 0 && !!this.source && this.context?.state === "running" && !this.manuallySuspended && !this.backgroundSuspended && this.now() + this.serverOffset >= this.startsAt,
      contextState: this.disposed ? "closed" : this.context?.state ?? "locked",
      muted: this.muted, volume: this.volume, driftMs: this.driftMs,
      loading: this.loading, error: this.error,
    };
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) throw new RangeError("Volume must be finite");
    this.volume = clamp(volume, 0, 1);
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) { this.unlockVersion++; for (const finish of this.resumeWaiters) finish(); }
    this.applyVolume();
  }

  async suspend(): Promise<void> {
    this.manuallySuspended = true;
    this.cancelPreload();
    this.stopSource(false);
    if (this.context && this.context.state !== "closed") await this.context.suspend();
    this.notify();
  }

  /** Rejoins current room time; never resumes a stale, paused playhead. */
  async resume(): Promise<boolean> {
    if (!this.context || !this.unlocked || this.disposed) return false;
    return this.unlock();
  }

  /** Safe to call after a time-sync estimate or foreground restoration. */
  resync(force = false): void {
    const context = this.context;
    const track = this.track;
    if (this.roundClaimed || !context || !track || !this.unlocked || context.state !== "running" || this.disposed || this.manuallySuspended || this.backgroundSuspended) return;
    if (force || !this.source) {
      void this.prepareAndSchedule();
      return;
    }
    const audioNow = context.currentTime;
    if (audioNow < this.sourceAnchorTime) return;
    const actual = modulo(this.sourcePosition + (audioNow - this.sourceAnchorTime) * this.sourceRate, track.durationSeconds);
    const desired = getTrackTiming(track, this.startsAt, this.now() + this.serverOffset + this.outputLatency() * 1000).positionSeconds;
    const error = circularTimingError(desired, actual, track.durationSeconds);
    this.driftMs = error * 1000;
    if (Math.abs(error) > 0.12) {
      void this.prepareAndSchedule();
      return;
    }
    // At most ±0.5%; small NTP refinements are inaudibly converged over time.
    const rate = Math.abs(error) < 0.008 ? 1 : clamp(1 + error / 6, 0.995, 1.005);
    this.sourcePosition = actual;
    this.sourceAnchorTime = audioNow;
    this.sourceRate = rate;
    this.source.playbackRate.setValueAtTime(rate, audioNow);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.unlockVersion++;
    for (const finish of this.resumeWaiters) finish();
    this.unlocked = false;
    this.cancelPreparation();
    this.cancelPreload();
    this.encoded.clear();
    this.roundRecording?.controller.abort();
    this.roundRecording = null;
    this.warmBuffer = null;
    this.decoder = null;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.handleVisibility);
    if (typeof window !== "undefined") window.removeEventListener("pageshow", this.handlePageShow);
    this.stopSource(false);
    const context = this.context;
    context?.removeEventListener("statechange", this.handleContextState);
    this.master?.disconnect();
    this.buffer = null;
    if (context && context.state !== "closed") await context.close();
    this.notify();
  }

  private outputLatency(): number {
    const context = this.context;
    // This is a browser estimate, not a promise of speaker/Bluetooth phase lock.
    return clamp(context?.outputLatency ?? context?.baseLatency ?? 0, 0, 0.25);
  }

  private cancelPreparation(): void {
    this.preparationVersion++;
    this.loadController?.abort();
    this.loadController = null;
    this.pendingPreparation = null;
    this.loading = false;
  }

  private prepareAndSchedule(): Promise<void> {
    const track = this.track;
    const context = this.context;
    if (this.roundClaimed || !track || !context || this.disposed) return Promise.resolve();
    const key = `${track.id}:${this.startsAt}`;
    if (this.pendingPreparation?.key === key) return this.pendingPreparation.promise;
    this.cancelPreparation();
    const version = this.preparationVersion;
    this.error = null;
    if (this.warmBuffer?.id === track.id) {
      this.buffer = this.warmBuffer;
      this.warmBuffer = null;
    }
    if (this.buffer?.id === track.id) {
      this.scheduleSource(this.buffer.audio);
      return Promise.resolve();
    }
    this.stopSource(false);
    this.buffer = null;
    this.loading = true;
    this.notify();
    const controller = new AbortController();
    this.loadController = controller;
    const promise = Promise.resolve().then(() => {
      this.assertLoading(context, controller.signal);
      if (this.warmPreparation?.id === track.id && !this.warmPreparation.signal.aborted) return this.warmPreparation.promise;
      return this.options.loadBuffer
        ? this.options.loadBuffer(track, context, controller.signal)
        : this.loadRecording(track, context, controller.signal);
    }).then((prepared) => {
      if (this.disposed || version !== this.preparationVersion || controller.signal.aborted) return;
      this.validateBuffer(track, prepared);
      this.buffer = { id: track.id, audio: prepared };
      this.loading = false;
      if (context.state === "running" && !this.manuallySuspended && !this.backgroundSuspended) this.scheduleSource(prepared);
      this.notify();
    }).catch((cause) => {
      if (this.disposed || version !== this.preparationVersion || controller.signal.aborted) return;
      this.reportError("prepare", cause);
      this.loading = false;
      this.unlocked = false;
      this.error = "Music could not be loaded. Tap Enable sound to retry.";
      this.notify();
    }).finally(() => {
      if (version === this.preparationVersion) {
        this.pendingPreparation = null;
        this.loadController = null;
      }
    });
    this.pendingPreparation = { key, promise };
    return promise;
  }

  private assertLoading(context: AudioContext, signal: AbortSignal): void {
    if (signal.aborted || this.disposed || context.state === "closed") throw new DOMException("Audio load cancelled", "AbortError");
  }

  private cacheBytes(id: TrackId, bytes: ArrayBuffer): void {
    this.encoded.delete(id);
    this.encoded.set(id, bytes);
    let size = [...this.encoded.values()].reduce((sum, value) => sum + value.byteLength, 0);
    for (const [oldId, value] of this.encoded) {
      if (size <= MAX_ENCODED_BYTES) break;
      this.encoded.delete(oldId);
      size -= value.byteLength;
    }
  }

  private async fetchRecording(track: ClubTrack, context: AudioContext, signal: AbortSignal): Promise<ArrayBuffer> {
    const cached = this.encoded.get(track.id);
    if (cached) { this.cacheBytes(track.id, cached); return cached; }
    const response = await this.fetcher(track.audioUrl, { signal, cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    this.assertLoading(context, signal);
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw new Error("Audio asset size is outside the supported limit");
    this.cacheBytes(track.id, bytes);
    return bytes;
  }

  private async decodeRecording(bytes: ArrayBuffer, context: AudioContext, signal: AbortSignal): Promise<AudioBuffer> {
    // Native decoding cannot be cancelled. Serialize it and pass a copy because
    // decodeAudioData may detach its input; the small compressed cache stays reusable.
    const decoding = this.decodeQueue.then(() => {
      this.assertLoading(context, signal);
      return (this.decoder ?? context).decodeAudioData(bytes.slice(0));
    });
    this.decodeQueue = decoding.then(() => undefined, () => undefined);
    const prepared = await decoding;
    this.assertLoading(context, signal);
    return prepared;
  }

  private async loadRecording(track: ClubTrack, context: AudioContext, signal: AbortSignal): Promise<AudioBuffer> {
    if (this.warmPreparation?.id === track.id && !this.warmPreparation.signal.aborted) {
      const prepared = await this.warmPreparation.promise;
      this.assertLoading(context, signal);
      return prepared;
    }
    const decodeRate = this.decoder?.sampleRate ?? context.sampleRate;
    if ((track.durationSeconds + .15) * decodeRate * 2 * 4 > MAX_SELECTED_DECODED_BYTES) throw new Error("Device audio rate exceeds the supported full-track memory limit");
    const bytes = this.prefetchBytes?.id === track.id && !this.prefetchBytes.signal.aborted
      ? await this.prefetchBytes.promise
      : await this.fetchRecording(track, context, signal);
    this.assertLoading(context, signal);
    if (this.warmPreparation?.id === track.id && !this.warmPreparation.signal.aborted) return this.warmPreparation.promise;
    return this.decodeRecording(bytes, context, signal);
  }

  private canWarm(track: ClubTrack): boolean {
    const rate = this.decoder?.sampleRate ?? this.context?.sampleRate ?? DECODE_SAMPLE_RATE;
    // Reserve stereo PCM at the context rate for both tracks, plus codec tolerance.
    const currentBytes = this.buffer
      ? this.buffer.audio.length * this.buffer.audio.numberOfChannels * 4
      : (this.track?.durationSeconds ?? 0) * rate * 2 * 4;
    return currentBytes + (track.durationSeconds + .3) * rate * 2 * 4 <= MAX_DECODED_BYTES;
  }

  private cancelPreload(keepId?: TrackId): void {
    if (!keepId || this.activePreloadId !== keepId) {
      // A selected track may be awaiting this same background promise. Invalidate
      // its foreground observer first so an expected abort cannot revoke unlock.
      if (this.preloadController && this.activePreloadId === this.track?.id && this.loading) this.cancelPreparation();
      this.preloadController?.abort();
    }
  }

  private startPreload(): void {
    const context = this.context;
    const current = this.track;
    if (!context || !current || !this.unlocked || !this.source || this.loading || this.disposed ||
      this.manuallySuspended || this.backgroundSuspended || context.state !== "running" || this.preloadTask || this.playlistOrder.length < 2) return;
    const index = Math.max(0, this.playlistOrder.indexOf(current.id));
    const next = this.playlistOrder[(index + 1) % this.playlistOrder.length];
    const previous = this.playlistOrder[(index + this.playlistOrder.length - 1) % this.playlistOrder.length];
    const ids = [...new Set([next, previous, ...this.playlistOrder])].filter(id => id !== current.id);
    const needsWork = ids.some(id => !this.preloadFailures.has(id) && (
      (!this.options.loadBuffer && !this.encoded.has(id) && !this.preloadAttempts.has(id)) ||
      (id === next && this.warmBuffer?.id !== id && this.canWarm(getTrack(id)) &&
        (this.options.loadBuffer || this.encoded.has(id) || !this.preloadAttempts.has(id)))
    ));
    if (!needsWork) return;
    const controller = new AbortController();
    this.preloadController = controller;
    const task = Promise.resolve().then(async () => {
      for (const id of ids) {
        if (controller.signal.aborted || this.disposed || this.track?.id !== current.id) break;
        if (this.preloadFailures.has(id)) continue;
        this.activePreloadId = id;
        const track = getTrack(id);
        try {
          let bytes: ArrayBuffer | null = null;
          if (!this.options.loadBuffer) {
            if (this.preloadAttempts.has(id) && !this.encoded.has(id)) continue;
            this.preloadAttempts.add(id);
            const promise = this.fetchRecording(track, context, controller.signal);
            this.prefetchBytes = { id, signal: controller.signal, promise };
            bytes = await promise;
            this.prefetchBytes = null;
          }
          // If selected during the fetch, the foreground owns its decode/schedule.
          if (this.track?.id !== current.id || controller.signal.aborted) break;
          if (id === next && this.warmBuffer?.id !== id && this.canWarm(track)) {
            this.warmBuffer = null;
            const promise = this.options.loadBuffer
              ? this.options.loadBuffer(track, context, controller.signal)
              : this.decodeRecording(bytes!, context, controller.signal);
            this.warmPreparation = { id, signal: controller.signal, promise };
            const prepared = await promise;
            this.assertLoading(context, controller.signal);
            this.validateBuffer(track, prepared);
            const currentBytes = this.buffer ? this.buffer.audio.length * this.buffer.audio.numberOfChannels * 4 : 0;
            if (currentBytes + prepared.length * prepared.numberOfChannels * 4 > MAX_DECODED_BYTES) throw new Error("Warm recording exceeds decoded cache budget");
            if (this.track?.id !== id) this.warmBuffer = { id, audio: prepared };
            this.warmPreparation = null;
          }
        } catch {
          if (!controller.signal.aborted) this.preloadFailures.add(id);
          // Background failures never replace healthy playback with a retry state.
        } finally {
          this.prefetchBytes = null;
          this.warmPreparation = null;
        }
      }
    }).finally(() => {
      this.preloadTask = null;
      this.preloadController = null;
      this.activePreloadId = null;
      this.startPreload();
    });
    this.preloadTask = task;
  }

  private validateBuffer(track: Pick<ClubTrack, "durationSeconds">, buffer: AudioBuffer): void {
    const sampleTolerance = 2 / buffer.sampleRate;
    if (!Number.isFinite(buffer.duration) || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 ||
      buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2 ||
      buffer.length * buffer.numberOfChannels * 4 > MAX_SELECTED_DECODED_BYTES ||
      buffer.duration + sampleTolerance < track.durationSeconds || buffer.duration > track.durationSeconds + 0.15) {
      throw new Error(`Decoded recording does not match its declared loop duration: decoded=${buffer.duration}, expected=${track.durationSeconds}, sampleRate=${buffer.sampleRate}, channels=${buffer.numberOfChannels}`);
    }
  }

  private reportError(stage: string, cause: unknown): void {
    // Local console diagnosis only: no room, profile, token, PCM or stack data.
    const error = cause instanceof Error ? cause : new Error("Unknown audio error");
    const message = error.message.replace(/(?:https?|file):\/\/[^\s"']+/g, "[URL]").slice(0, 180);
    console.warn(`[ClubAudio] ${stage} failed`, { name: error.name, message });
  }

  private scheduleSource(buffer: AudioBuffer): void {
    const context = this.context;
    const track = this.track;
    if (this.roundClaimed || !context || !track || !this.master || this.disposed) return;
    // Read clocks after decoding: download time must not skew a late join.
    const serverNow = this.now() + this.serverOffset;
    const latency = this.outputLatency();
    const delay = Math.max(0.03, (this.startsAt - serverNow) / 1000 - latency);
    const startAt = context.currentTime + delay;
    const timing = getTrackTiming(track, this.startsAt, serverNow + (delay + latency) * 1000);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = track.durationSeconds;
    source.playbackRate.value = 1;
    source.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(track.playbackGain, startAt + this.nextFadeInSeconds);
    this.nextFadeInSeconds = .018;
    this.stopSource(true);
    this.source = source;
    this.sourceGain = gain;
    this.sourceAnchorTime = startAt;
    this.sourcePosition = timing.positionSeconds;
    this.sourceRate = 1;
    this.driftMs = 0;
    source.onended = () => { this.retiringSources.delete(source); source.disconnect(); source.buffer = null; gain.disconnect(); };
    source.start(startAt, timing.positionSeconds);
    // A future room anchor can start without another snapshot or gesture. Tell
    // controls when that scheduled source becomes current, not merely unlocked.
    this.playbackStateTimer = setTimeout(() => {
      this.playbackStateTimer = null;
      if (this.source === source && !this.disposed) this.notify();
    }, Math.max(delay * 1000, this.startsAt - serverNow) + 30);
    this.notify();
    this.startPreload();
  }

  private clearRetiringSources(): void {
    for (const [source, gain] of this.retiringSources) {
      try { source.stop(); } catch { /* It may already have ended. */ }
      source.disconnect();
      source.buffer = null;
      gain?.disconnect();
    }
    this.retiringSources.clear();
  }

  private stopSource(fade: boolean): void {
    if (this.playbackStateTimer) clearTimeout(this.playbackStateTimer);
    this.playbackStateTimer = null;
    // At most one retiring source survives a transition, and none survives a
    // cold decode/dispose. This bounds application-held PCM independently of GC.
    this.clearRetiringSources();
    const source = this.source;
    const gain = this.sourceGain;
    this.source = null;
    this.sourceGain = null;
    if (!source) return;
    const now = this.context?.currentTime ?? 0;
    try {
      if (fade && gain) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.025);
        this.retiringSources.set(source, gain);
        source.stop(now + 0.03);
      } else {
        source.stop();
        source.disconnect();
        source.buffer = null;
        gain?.disconnect();
      }
    } catch { /* Already-stopped nodes are harmless during dispose/state races. */ }
  }

  private applyVolume(): void {
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.02);
    }
    this.notify();
  }

  private notify(): void { this.options.onStateChange?.(this.getStatus()); }

  private handleContextState = (): void => {
    if (this.context?.state === "running" && !this.muted && !this.manuallySuspended && !this.backgroundSuspended && !this.disposed && !this.error) {
      // A browser may settle its policy decision after our bounded resume wait.
      this.unlocked = true;
      if (this.roundRecording) void this.preloadRoundRecording(this.roundRecording.descriptor);
      this.resync(true);
      if (!this.syncTimer) this.syncTimer = setInterval(() => this.resync(), 2000);
    }
    this.notify();
  };

  private handlePageShow = (): void => {
    if (this.unlocked && !this.manuallySuspended && !this.backgroundSuspended) void this.resume();
  };

  private handleVisibility = (): void => {
    if (this.disposed) return;
    // A failed background load clears unlocked. Still refresh visibility so a
    // foreground gesture can retry rather than retaining a stale hidden flag.
    this.backgroundSuspended = document.visibilityState === "hidden";
    if (!this.context || !this.unlocked) return;
    if (this.backgroundSuspended) {
      this.cancelPreload();
      this.stopSource(false);
      void this.context.suspend().catch(() => undefined);
    } else if (!this.manuallySuspended) {
      void this.resume();
    }
    this.notify();
  };
}
