import { ClubAudio } from './club-audio.ts';
import { getTrack } from './music-catalog.ts';
import { DANCE_TRACK } from './dance-track.ts';

/** Structural subset of the server's DanceRound, avoiding a client/server dependency. */
export interface AudioDanceRound { id: string; startsAt: number; endsAt: number; trackId: string }
export interface DanceAudioStatus {
  roundId: string | null;
  loading: boolean;
  ready: boolean;
  ranked: boolean;
  reason: string | null;
  elapsedMs: number | null;
}

/** One recording, one initial clock mapping, rate 1 for the entire round.
 * Polling only handles loading/end/lifecycle: it NEVER seeks or corrects the beat.
 */
export class DanceAudio {
  private readonly club: ClubAudio;
  private readonly now: () => number;
  private round: AudioDanceRound | null = null;
  private offset = 0;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private observedContext: AudioContext | null = null;
  private countdownScheduled = false;
  private readonly countdownNodes = new Map<OscillatorNode, GainNode>();
  private anchor = 0;
  private latency = 0;
  private loading = false;
  private invalid: string | null = null;
  private error: string | null = null;
  private finished = false;
  private completedRanked = false;
  private completedElapsed: number | null = null;
  private disposed = false;

  constructor(club: ClubAudio, options: { now?: () => number } = {}) {
    this.club = club;
    this.now = options.now ?? Date.now;
    void this.preload();
  }

  /** Warmup never starts sound or changes mute; call after unlock to await decoding. */
  preload(): Promise<boolean> {
    return this.disposed ? Promise.resolve(false) : this.club.preloadRoundRecording(DANCE_TRACK);
  }

  getPreloadStatus(): { loading: boolean; ready: boolean; error: string | null } {
    return this.club.getRoundRecordingStatus(DANCE_TRACK);
  }

  setRound(round: AudioDanceRound | null, serverOffsetMs = 0): void {
    if (this.disposed) return;
    if (round && (!Number.isFinite(round.startsAt) || !Number.isFinite(round.endsAt) || round.endsAt <= round.startsAt || !Number.isFinite(serverOffsetMs))) return;
    this.offset = serverOffsetMs;
    if (this.round?.id === round?.id) { this.refresh(); return; }
    this.stop();
    this.round = round;
    this.invalid = null;
    this.error = null;
    this.finished = false;
    this.completedRanked = false;
    this.completedElapsed = null;
    this.countdownScheduled = false;
    if (!round) return;
    this.club.claimRoundAudio(true, round.startsAt, serverOffsetMs);
    this.timer = setInterval(() => this.refresh(), 100);
    this.refresh();
  }

  /** Also safe to call after a gesture. No need to await this method. */
  refresh(): void {
    const round = this.round;
    if (!round || this.disposed || this.finished) return;
    const output = this.club.getRoundAudioOutput();
    if (output && this.observedContext !== output.context) {
      this.observedContext?.removeEventListener('statechange', this.handleContextState);
      this.observedContext = output.context;
      output.context.addEventListener('statechange', this.handleContextState);
    }
    const elapsed = this.getElapsedMs();
    // Once scheduled, finish against the audio clock, not changing NTP estimates.
    if ((elapsed !== null && elapsed >= round.endsAt - round.startsAt) || ((!this.source || output?.context.state !== 'running') && this.now() + this.offset >= round.endsAt)) {
      this.complete();
      return;
    }
    if (output?.context.state === 'running' && !this.countdownScheduled) {
      this.countdownScheduled = true;
      this.scheduleCountdown(output, round.startsAt);
    }
    if (this.source) {
      if (output?.context.state !== 'running') this.invalid = 'Audio was interrupted. This round is unranked.';
      if (elapsed !== null && elapsed >= 0) {
        const status = this.club.getStatus();
        if (status.muted || status.volume === 0) this.invalid = 'Sound was muted. This round is unranked.';
      }
      return;
    }
    if (!output || output.context.state !== 'running' || this.loading || this.error) return;
    this.loading = true;
    const controller = new AbortController();
    this.controller = controller;
    const recording = round.trackId === DANCE_TRACK.id ? DANCE_TRACK : null;
    void this.club.loadRoundBuffer(recording ?? round.trackId, controller.signal).then(buffer => {
      if (this.disposed || controller.signal.aborted || this.round?.id !== round.id) return;
      const { context, destination, latency } = output;
      if (context.state !== 'running') { this.loading = false; return; }
      const serverNow = this.now() + this.offset;
      if (serverNow >= round.endsAt) { this.finished = true; this.stop(); return; }
      const delay = Math.max(.03, (round.startsAt - serverNow) / 1000 - latency);
      const start = context.currentTime + delay;
      const position = serverNow + (delay + latency) * 1000 <= round.startsAt + .001
        ? 0 : (serverNow - round.startsAt) / 1000 + delay + latency;
      const duration = (round.endsAt - round.startsAt) / 1000;
      // decodeAudioData resampling may round the last frame by a sample; use
      // the same two-sample tolerance as the recording loader.
      const sampleTolerance = 2 / (buffer.sampleRate || 48000);
      if (position >= duration || buffer.duration + sampleTolerance < duration) {
        throw new Error(`Round recording duration mismatch: decoded=${buffer.duration}, expected=${duration}, sampleRate=${buffer.sampleRate}`);
      }
      this.latency = latency;
      this.anchor = start - position;
      if (position > .001) this.invalid = 'Joined audio late. This round is unranked.';
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = false;
      source.playbackRate.value = 1;
      source.connect(gain);
      gain.connect(destination);
      const level = recording?.playbackGain ?? getTrack(round.trackId).playbackGain;
      const end = this.anchor + duration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + .018);
      gain.gain.setValueAtTime(level, Math.max(start + .018, end - .3));
      gain.gain.linearRampToValueAtTime(0, end);
      this.source = source;
      this.gain = gain;
      source.onended = () => {
        if (this.source !== source) return;
        this.complete();
      };
      source.start(start, position);
      source.stop(end);
      this.loading = false;
    }).catch((cause) => {
      if (controller.signal.aborted || this.disposed) return;
      // Bounded local diagnosis only; no URLs, room/user identifiers or stacks.
      const error = cause instanceof Error ? cause : new Error('Unknown round audio error');
      const message = error.message.replace(/(?:https?|file):\/\/[^\s"']+/g, '[URL]').slice(0, 180);
      console.warn('[DanceAudio] prepare/schedule failed', { name: error.name, message, contextState: output.context.state });
      this.loading = false;
      this.error = 'Round audio could not load. Watch this round or try the next one.';
    });
  }

  /** Audible recording position; use this for note drawing AND input judgment. */
  getElapsedMs(): number | null {
    const output = this.club.getRoundAudioOutput();
    if (!this.source || !output) return this.completedElapsed;
    return (output.context.currentTime - this.anchor - this.latency) * 1000;
  }

  getStatus(): DanceAudioStatus {
    const status = this.club.getStatus();
    const ready = !!this.source && status.contextState === 'running' && !this.finished;
    const reason = this.error ?? this.invalid ?? (this.finished ? 'Round finished.' : !ready
      ? this.loading ? 'Loading round audio…' : 'Enable sound to play this round.'
      : status.muted || status.volume === 0 ? 'Enable sound to play this round.' : null);
    return { roundId: this.round?.id ?? null, loading: this.loading, ready,
      ranked: this.finished ? this.completedRanked : ready && !reason, reason, elapsedMs: this.getElapsedMs() };
  }

  /** Original, quiet UI tones. Scheduling never changes the recording clock. */
  private scheduleCountdown(output: { context: AudioContext; destination: GainNode; latency: number }, startsAt: number): void {
    const { context, destination, latency } = output;
    const serverNow = this.now() + this.offset;
    const audioNow = context.currentTime;
    for (let seconds = 5; seconds >= 0; seconds--) {
      const when = audioNow + (startsAt - seconds * 1000 - serverNow) / 1000 - latency;
      // Never replay missed ticks on late join or create an immediate burst.
      if (when < audioNow + .01) continue;
      const go = seconds === 0;
      const duration = go ? .14 : .08;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      this.countdownNodes.set(oscillator, gain);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(go ? 784 : 523.25, when);
      oscillator.connect(gain);
      gain.connect(destination);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(go ? .13 : .09, when + .006);
      gain.gain.linearRampToValueAtTime(0, when + duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.countdownNodes.delete(oscillator);
      };
      oscillator.start(when);
      oscillator.stop(when + duration + .005);
    }
  }

  private cancelCountdown(): void {
    for (const [oscillator, gain] of this.countdownNodes) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* Already ended. */ }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.countdownNodes.clear();
  }

  private handleContextState = (): void => {
    if (this.observedContext?.state !== 'running') this.cancelCountdown();
    if (this.source && this.observedContext?.state !== 'running') {
      this.invalid = 'Audio was interrupted. This round is unranked.';
    }
  };

  private complete(): void {
    const status = this.club.getStatus();
    this.completedRanked = !!this.source && !this.invalid && !this.error && status.contextState === 'running' && !status.muted && status.volume > 0;
    this.completedElapsed = this.source && status.contextState === 'running' && this.round ? this.round.endsAt - this.round.startsAt : null;
    this.finished = true;
    this.stop();
  }

  private stop(): void {
    this.cancelCountdown();
    this.controller?.abort();
    this.controller = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      source.buffer = null;
    }
    this.gain?.disconnect();
    this.gain = null;
    this.loading = false;
    this.club.claimRoundAudio(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observedContext?.removeEventListener('statechange', this.handleContextState);
    this.observedContext = null;
    this.stop();
    this.round = null;
  }
}
