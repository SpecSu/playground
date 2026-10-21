import { FESTIVAL_CONSTRUCTION_MS } from './festival-timing.ts';

/** Original daytime ambience, Arabic Nights ceremony and bundled field recordings.
 * Provenance: public/audio/festival/CREDITS.txt. No streaming dependencies. */
export const FESTIVAL_MUTE_KEY = 'dreamina-festival:muted:v1';
const BEAT_MS = 60_000 / 72;
export const CEREMONY_RECORDING = {
  title: 'Arabic Nights', artist: 'Nemphirex', bpm: 120,
  url: '/audio/festival/arabic-nights-128beat.mp3',
  // Existing Disco metadata: a 257.5 ms beat phase, then 32 full beats.
  // The entire 9 s lead-in + 35 s burn fits inside the unchanged 64 s excerpt.
  ignitionOffsetSeconds: 16.2575, durationSeconds: 64, playbackGain: 1.0543869,
} as const;
export const CEREMONY_BPM = CEREMONY_RECORDING.bpm;
export const CEREMONY_BUILDUP_MS = 9000;
const CHORDS = [[50, 57, 60, 64], [46, 53, 57, 60], [48, 53, 57, 60], [48, 55, 58, 62]] as const;
const ROOTS = [38, 34, 29, 36] as const;
const MELODY = [69, 64, 67, 62, 65, 60, 64, 62] as const;
export type AudioRound = {index: number; startsAt: number; burnAt: number; ashesAt: number; endsAt: number};
export type AudioBuilder = {id: string; arrivalAt: number; finishAt: number; x: number; z: number};
export type FestivalAudioFrame = {now: number; round: AudioRound; builders: AudioBuilder[]; listener: {x: number; z: number}; selfId: string};
export type FestivalAudioStatus = {muted: boolean; playing: boolean; needsGesture: boolean; unavailable: boolean};
export type MusicEvent = {at: number; kind: 'pad' | 'bass' | 'pluck' | 'drum'; notes: readonly number[]; duration: number; layer: 'day'; accent: number};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {const x = clamp(value); return x * x * (3 - 2 * x);};
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Envelopes follow the supplied round time, including a late entry into a burn. */
export function ceremonyMix(round: AudioRound, now: number) {
  if (!Number.isFinite(now) || now < round.startsAt || now >= round.endsAt) return {day: 0, burn: 0, fire: 0, crowd: 0};
  if (now < round.burnAt) {
    const build = smooth((now - round.burnAt + CEREMONY_BUILDUP_MS) / CEREMONY_BUILDUP_MS);
    return {day: 1 - build, burn: .92 * build, fire: 0, crowd: 0};
  }
  if (now < round.ashesAt) {
    const elapsed = now - round.burnAt, resolve = smooth((round.ashesAt - now) / 2200);
    return {day: 0, burn: .92 * resolve, fire: .26 * smooth(elapsed / 400), crowd: (.16 + .12 * (1 - smooth(elapsed / 7000))) * resolve};
  }
  return {day: .65 * smooth((now - round.ashesAt) / 1800), burn: 0, fire: .26 * (1 - smooth((now - round.ashesAt) / 2500)), crowd: 0};
}

/** Half-open windows make lookahead scheduling deterministic and duplicate-free. */
export function musicEvents(round: AudioRound, from: number, until: number): MusicEvent[] {
  const result: MusicEvent[] = [];
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return result;
  for (const phase of [
    {start: round.startsAt, end: round.burnAt, layer: 'day' as const, ashes: false},
    {start: round.ashesAt, end: round.endsAt, layer: 'day' as const, ashes: true},
  ]) {
    const begin = Math.max(from, phase.start), end = Math.min(until, phase.end);
    if (begin >= end) continue;
    const first = Math.max(0, Math.ceil((begin - phase.start) / BEAT_MS - 1e-9));
    const last = Math.ceil((end - phase.start) / BEAT_MS - 1e-9);
    for (let beat = first; beat < last; beat++) {
      const at = phase.start + beat * BEAT_MS, chord = Math.floor(beat / 8) % 4;
      const emit = (kind: MusicEvent['kind'], notes: readonly number[], duration: number, accent = 1) => result.push({at, kind, notes, duration, layer: phase.layer, accent});
      if (beat % 8 === 0) emit('pad', CHORDS[chord], 8 * BEAT_MS / 1000 + .8, phase.ashes ? .58 : 1);
      if (phase.ashes) continue;
      if (beat % 4 === 0) emit('bass', [ROOTS[chord]], 1.8, .65);
      if (beat % 8 === 4) emit('drum', [43], .5, .32);
      if (beat % 4 === 2) emit('pluck', [MELODY[Math.floor(beat / 4) % 8]], 2.1, .66);
    }
  }
  return result.sort((a, b) => a.at - b.at);
}

/** A single contiguous recording seeks once to the shared round, never a loop.
 * A tiny output lead is included in the seek so late joins land in phase. */
export function ceremonyRecordingPlan(round: AudioRound, now: number, durationSeconds = CEREMONY_RECORDING.durationSeconds as number) {
  const leadAt = Math.max(round.startsAt, round.burnAt - CEREMONY_BUILDUP_MS);
  if (!Number.isFinite(now) || now < leadAt - 180 || now >= round.ashesAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const startAt = Math.max(now + 15, leadAt);
  const offsetSeconds = CEREMONY_RECORDING.ignitionOffsetSeconds + (startAt - round.burnAt) / 1000;
  if (offsetSeconds < 0 || offsetSeconds >= durationSeconds || startAt >= round.ashesAt) return null;
  return {startAt, offsetSeconds, stopAt: Math.min(round.ashesAt, startAt + (durationSeconds - offsetSeconds) * 1000)};
}

/** Matches festival-builder-avatar: .6s pickup, 1.2s cycle, contact at .76. */
export function hammerEvents(builders: readonly AudioBuilder[], listener: {x: number; z: number}, selfId: string, from: number, until: number, burnAt: number) {
  const selected = builders.map(builder => ({...builder, distance: Math.hypot(builder.x - listener.x, builder.z - listener.z)}))
    .filter(b => b.arrivalAt < until && b.finishAt > from && (b.id === selfId || b.distance < 30))
    .sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId) || a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 3);
  return selected.flatMap(builder => {
    const first = builder.arrivalAt + 1512, end = Math.min(until, builder.finishAt, builder.arrivalAt + FESTIVAL_CONSTRUCTION_MS, burnAt);
    const cues: {id: string; arrivalAt: number; at: number; gain: number}[] = [];
    for (let n = Math.max(0, Math.ceil((from - first) / 1200)); first + n * 1200 < end; n++) {
      cues.push({id: builder.id, arrivalAt: builder.arrivalAt, at: first + n * 1200, gain: builder.id === selfId ? 1 : .48 * Math.max(0, 1 - builder.distance / 30)});
    }
    return cues;
  });
}

/** Fixed-seed softly coloured noise for short wood impacts and percussion. */
export function createFestivalNoise(sampleRate = 22050): Float32Array {
  const data = new Float32Array(sampleRate * 4); let seed = 0x48271, slow = 0, mean = 0;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    slow = .8 * slow + .2 * ((seed >>> 0) / 0xffffffff * 2 - 1);
    const envelope = .25 + .75 * Math.pow(.5 + .5 * Math.sin(i / sampleRate * 17.3) * Math.sin(i / sampleRate * 7.1), 8);
    data[i] = slow * envelope; mean += data[i];
  }
  mean /= data.length; let peak = 0;
  for (let i = 0; i < data.length; i++) {data[i] -= mean; peak = Math.max(peak, Math.abs(data[i]));}
  for (let i = 0; i < data.length; i++) data[i] *= .8 / (peak || 1);
  // Short tapers keep source boundaries click-free.
  const edge = Math.floor(sampleRate * .025);
  for (let i = 0; i < edge; i++) {const gain = Math.sin(i / edge * Math.PI / 2); data[i] *= gain; data[data.length - 1 - i] *= gain;}
  return data;
}

type Timer = ReturnType<typeof setTimeout>;
type Recording = 'music' | 'fire' | 'crowd';
const RECORDINGS: Record<Recording, string> = {music: CEREMONY_RECORDING.url, fire: '/audio/festival/fire-crackle.mp3', crowd: '/audio/festival/crowd-cheer.mp3'};
type Options = {getFrame: () => FestivalAudioFrame | null; createContext?: () => AudioContext; loadAsset?: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>; storage?: Pick<Storage, 'getItem' | 'setItem'>; onStatus?: (status: FestivalAudioStatus) => void; schedule?: (callback: () => void, ms: number) => Timer; cancel?: (timer: Timer) => void};
type Voice = {sources: (AudioBufferSourceNode | OscillatorNode)[]; nodes: AudioNode[]; builder?: {id: string; arrivalAt: number}; recording?: Recording; padEnd?: number};
// Network clock estimates are observations, never permission to interrupt music.
const HARD_RESYNC_MS = 1500;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
function browserContext() {const Constructor = globalThis.AudioContext ?? (globalThis as typeof globalThis & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext; if (!Constructor) throw Error('Web Audio unavailable'); return new Constructor();}

export class FestivalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private day: GainNode | null = null;
  private burn: GainNode | null = null;
  private fire: GainNode | null = null;
  private crowd: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private encoded = new Map<Recording, ArrayBuffer>();
  private buffers = new Map<Recording, AudioBuffer>();
  private recordings = new Map<Recording, Voice>();
  private preloadPromise: Promise<void> | null = null;
  private preloadSettled = false;
  private decoding = new Map<Recording, AudioContext>();
  private fetchController = new AbortController();
  private graph: Voice = {sources: [], nodes: []};
  private voices = new Set<Voice>();
  private timer: Timer | null = null;
  private pauseTimer: Timer | null = null;
  private active = true;
  private requested = false;
  private disposed = false;
  private revision = 0;
  private scheduledUntil = 0;
  private roundKey = '';
  private clockOrigin: {now: number; audioTime: number} | null = null;
  private finishedCeremony = '';
  private current: FestivalAudioStatus;
  private options: Options;
  private storage: Options['storage'];
  constructor(options: Options) {
    this.options = options; this.storage = options.storage;
    if (!this.storage) {try {this.storage = globalThis.localStorage;} catch {}}
    let muted = false; try {muted = this.storage?.getItem(FESTIVAL_MUTE_KEY) === 'true';} catch {}
    this.current = {muted, playing: false, needsGesture: false, unavailable: false};
  }
  get status() {return {...this.current};}
  /** Fetch bytes early without creating an AudioContext or playing any sound. */
  preload(retryMissing = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (retryMissing && this.preloadSettled && this.encoded.size < Object.keys(RECORDINGS).length) this.preloadPromise = null;
    if (!this.preloadPromise) {
      this.preloadSettled = false;
      const load = this.options.loadAsset ?? (async (url: string, signal: AbortSignal) => {
        const response = await fetch(url, {signal, credentials: 'same-origin'});
        if (!response.ok) throw Error(`Audio asset ${response.status}`);
        return response.arrayBuffer();
      });
      this.preloadPromise = Promise.all((Object.keys(RECORDINGS) as Recording[]).filter(kind => !this.encoded.has(kind)).map(async kind => {
        try {
          const bytes = await load(RECORDINGS[kind], this.fetchController.signal);
          if (!this.disposed) {
            this.encoded.set(kind, bytes);
            // Each ready file can decode independently; a slow optional effect
            // must never hold back the ceremony recording.
            if (this.context && this.requested) this.decodeRecording(kind, this.context);
          }
        } catch {/* Failed files stay silent; a later playback request can retry them. */}
      })).then(() => {this.preloadSettled = true;});
    }
    return this.preloadPromise;
  }
  private decodeRecording(kind: Recording, context: AudioContext) {
    const bytes = this.encoded.get(kind);
    if (!bytes || this.disposed || this.context !== context || context.state === 'closed' || this.buffers.has(kind) || this.decoding.get(kind) === context) return;
    this.decoding.set(kind, context);
    void (async () => {
      try {
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (!this.disposed && this.context === context && context.state !== 'closed') this.buffers.set(kind, buffer);
      } catch {/* A later explicit playback request can retry failed decoding. */}
      finally {if (this.decoding.get(kind) === context) this.decoding.delete(kind);}
    })();
  }
  private decodeRecordings(context: AudioContext) {
    // Only playback requests/resumes and individual completed loads decode.
    // Scheduling ticks never fetch or retry; cached/in-flight files are reused.
    void this.preload(true);
    for (const kind of this.encoded.keys()) this.decodeRecording(kind, context);
  }
  private update(patch: Partial<FestivalAudioStatus>) {this.current = {...this.current, ...patch}; if (!this.disposed) this.options.onStatus?.(this.status);}
  private wantsPlayback() {return !this.disposed && this.active && this.requested && !this.current.muted;}
  private cancelTimer(kind: 'timer' | 'pauseTimer') {if (this[kind] !== null) (this.options.cancel ?? clearTimeout)(this[kind]!); this[kind] = null;}
  private target(node: GainNode | null, value: number, duration = .35) {if (!node || !this.context) return; node.gain.cancelScheduledValues(this.context.currentTime); node.gain.setTargetAtTime(value, this.context.currentTime, duration);}
  private buildGraph(context: AudioContext) {
    this.master = context.createGain(); this.master.gain.value = 0;
    const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -14; compressor.knee.value = 18; compressor.ratio.value = 6; compressor.attack.value = .012; compressor.release.value = .4;
    this.master.connect(compressor); compressor.connect(context.destination);
    this.day = context.createGain(); this.burn = context.createGain(); this.fire = context.createGain(); this.crowd = context.createGain();
    this.day.gain.value = 0; this.burn.gain.value = 0; this.fire.gain.value = 0; this.crowd.gain.value = 0;
    for (const bus of [this.day, this.burn, this.fire, this.crowd]) bus.connect(this.master);
    const samples = createFestivalNoise(); this.noise = context.createBuffer(1, samples.length, 22050); this.noise.getChannelData(0).set(samples);
    this.graph = {sources: [], nodes: [this.master, compressor, this.day, this.burn, this.fire, this.crowd]};
  }
  private releaseVoice(voice: Voice) {for (const source of voice.sources) {source.onended = null; try {source.stop();} catch {}} for (const node of voice.nodes) {try {node.disconnect();} catch {}} this.voices.delete(voice); if (voice.recording && this.recordings.get(voice.recording) === voice) this.recordings.delete(voice.recording);}
  private clearVoices() {for (const voice of [...this.voices]) this.releaseVoice(voice); this.scheduledUntil = 0; this.roundKey = ''; this.clockOrigin = null;}
  private tone(event: MusicEvent, at: number, remaining?: number) {
    const context = this.context!, bus = this.day!;
    const duration = Math.max(.1, remaining ?? event.duration), voice: Voice = {sources: [], nodes: [], padEnd: event.kind === 'pad' ? event.at + event.duration * 1000 : undefined};
    const envelope = context.createGain(), filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = event.kind === 'pad' ? 1050 : event.kind === 'pluck' ? 1650 : 420; filter.Q.value = .45;
    const peak = (event.kind === 'pad' ? .038 : event.kind === 'bass' ? .13 : event.kind === 'drum' ? .18 : .065) * event.accent;
    const attack = event.kind === 'pad' ? Math.min(.85, duration * .3) : .014;
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(peak, at + attack);
    if (event.kind === 'pad') {envelope.gain.setValueAtTime(peak, at + Math.max(attack, duration - .9)); envelope.gain.linearRampToValueAtTime(0, at + duration);}
    else {envelope.gain.exponentialRampToValueAtTime(.0001, at + duration); envelope.gain.linearRampToValueAtTime(0, at + duration + .015);}
    filter.connect(envelope); envelope.connect(bus); voice.nodes.push(filter, envelope);
    for (const midi of event.notes) {
      const oscillator = context.createOscillator(); oscillator.type = event.kind === 'pluck' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(hz(midi), at);
      if (event.kind === 'drum') oscillator.frequency.exponentialRampToValueAtTime(hz(midi) * .48, at + .2);
      oscillator.connect(filter); oscillator.start(at); oscillator.stop(at + duration + .025); voice.sources.push(oscillator); voice.nodes.push(oscillator);
      // A quiet second harmonic gives the warm pad body without bright saw waves.
      if (event.kind === 'pad') {const overtone = context.createOscillator(), soft = context.createGain(); overtone.type = 'sine'; overtone.frequency.setValueAtTime(hz(midi) * 2, at); soft.gain.value = .16; overtone.connect(soft); soft.connect(filter); overtone.start(at); overtone.stop(at + duration + .025); voice.sources.push(overtone); voice.nodes.push(overtone, soft);}
    }
    this.voices.add(voice); voice.sources[voice.sources.length - 1].onended = () => this.releaseVoice(voice);
  }
  private syncCeremonyRecording(frame: FestivalAudioFrame) {
    const context = this.context!, existing = this.recordings.get('music'), buffer = this.buffers.get('music');
    if (frame.now >= frame.round.ashesAt) this.finishedCeremony = this.roundKey;
    if (this.finishedCeremony === this.roundKey) {if (existing) this.releaseVoice(existing); return;}
    const plan = ceremonyRecordingPlan(frame.round, frame.now, buffer?.duration);
    if (!plan) {if (existing) this.releaseVoice(existing); return;}
    if (existing || !buffer) return;
    const source = context.createBufferSource(), fade = context.createGain();
    source.buffer = buffer; source.loop = false;
    const at = context.currentTime + (plan.startAt - frame.now) / 1000;
    fade.gain.setValueAtTime(0, at); fade.gain.linearRampToValueAtTime(CEREMONY_RECORDING.playbackGain, at + .09);
    source.connect(fade); fade.connect(this.burn!);
    source.start(at, plan.offsetSeconds); source.stop(context.currentTime + (plan.stopAt - frame.now) / 1000);
    const voice: Voice = {sources: [source], nodes: [source, fade], recording: 'music'};
    this.voices.add(voice); this.recordings.set('music', voice);
    const ceremonyKey = this.roundKey;
    source.onended = () => {this.finishedCeremony = ceremonyKey; this.releaseVoice(voice);};
  }
  private syncRecordings(frame: FestivalAudioFrame, mix: ReturnType<typeof ceremonyMix>) {
    const context = this.context!;
    for (const kind of ['fire', 'crowd'] as const) {
      const existing = this.recordings.get(kind), buffer = this.buffers.get(kind);
      if (mix[kind] <= 0) {if (existing) this.releaseVoice(existing); continue;}
      if (existing || !buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) continue;
      const source = context.createBufferSource(), fade = context.createGain(); source.buffer = buffer; source.loop = true;
      // A late join/visibility return enters the live recording phase; it never
      // replays an ignition cheer or catches up on missed percussion.
      const at = context.currentTime + .015, offset = modulo((frame.now - frame.round.burnAt) / 1000, buffer.duration);
      fade.gain.setValueAtTime(0, at); fade.gain.linearRampToValueAtTime(1, at + .09);
      source.connect(fade); fade.connect(kind === 'fire' ? this.fire! : this.crowd!); source.start(at, offset);
      const voice: Voice = {sources: [source], nodes: [source, fade], recording: kind}; this.voices.add(voice); this.recordings.set(kind, voice);
    }
  }
  private hammer(at: number, strength: number, builder: {id: string; arrivalAt: number}) {
    const context = this.context!, voice: Voice = {sources: [], nodes: [], builder};
    const gain = context.createGain(), filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1450; filter.Q.value = .65;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.19 * strength, at + .004); gain.gain.exponentialRampToValueAtTime(.0001, at + .15); gain.gain.linearRampToValueAtTime(0, at + .17);
    const noise = context.createBufferSource(); noise.buffer = this.noise; noise.connect(filter);
    const wood = context.createOscillator(); wood.type = 'sine'; wood.frequency.setValueAtTime(210, at); wood.frequency.exponentialRampToValueAtTime(95, at + .08); wood.connect(filter);
    filter.connect(gain); gain.connect(this.master!); noise.start(at, .8, .18); wood.start(at); wood.stop(at + .18);
    voice.sources.push(noise, wood); voice.nodes.push(noise, wood, filter, gain); this.voices.add(voice); wood.onended = () => this.releaseVoice(voice);
  }
  private tick = () => {
    this.timer = null;
    if (!this.wantsPlayback() || this.context?.state !== 'running') return;
    const frame = this.options.getFrame();
    if (frame && Number.isFinite(frame.now)) {
      const {round} = frame, key = `${round.index}:${round.startsAt}:${round.burnAt}:${round.ashesAt}:${round.endsAt}`;
      const audioTime = this.context.currentTime;
      const elapsed = this.clockOrigin ? Math.max(0, audioTime - this.clockOrigin.audioTime) : 0;
      // A delayed JS callback does not stop Web Audio. Advance the playhead from
      // its hardware clock, not the cadence or jitter of room polling/RAF.
      const predicted = this.clockOrigin ? this.clockOrigin.now + elapsed * 1000 : frame.now;
      // The short ceremony is positioned once, then runs at the recording's
      // original speed. No rate correction, repeated seeks or stop rescheduling.
      const ceremonyStarted = this.recordings.has('music') || this.finishedCeremony === key;
      let now = ceremonyStarted ? predicted : frame.now;
      const discontinuity = this.roundKey !== key || !this.clockOrigin || (!ceremonyStarted && Math.abs(frame.now - predicted) > HARD_RESYNC_MS);
      if (discontinuity) {
        this.clearVoices(); this.roundKey = key; this.scheduledUntil = now = frame.now;
      }
      // A real end-of-burn observation may retire the old score, but subsequent
      // clock refinements cannot replay an already completed ceremony.
      if (frame.now >= round.ashesAt) now = Math.max(now, round.ashesAt);
      this.clockOrigin = {now, audioTime};
      const audioFrame = {...frame, now};
      for (const voice of [...this.voices]) {
        if (voice.builder && (now >= round.burnAt || !frame.builders.some(builder => builder.id === voice.builder!.id && builder.arrivalAt === voice.builder!.arrivalAt && builder.finishAt > now))) this.releaseVoice(voice);
      }
      const phase = now >= round.endsAt ? 'waiting' : now >= round.ashesAt ? 'ashes' : now >= round.burnAt ? 'burn' : 'day';
      const mix = ceremonyMix(round, now);
      this.target(this.day, mix.day, .16); this.target(this.burn, mix.burn, .12); this.target(this.fire, mix.fire, .12); this.target(this.crowd, mix.crowd, .15);
      this.syncCeremonyRecording(audioFrame);
      this.syncRecordings(audioFrame, mix);
      // Seek only the current sustaining chord. Percussion/hammer attacks in the
      // past are never replayed after joining, a hidden tab, or clock correction.
      // Timer stalls may recover a missing pad without cutting a live recording.
      if ((discontinuity || now > this.scheduledUntil) && phase !== 'waiting') {
        // Only daytime pads are synthesized; the ceremony recording seeks above.
        for (const layer of ['day'] as const) {
          if (mix[layer] <= 0 || [...this.voices].some(voice => voice.padEnd !== undefined && voice.padEnd > now)) continue;
          const origin = phase === 'ashes' ? round.ashesAt : round.startsAt;
          const chordMs = 8 * BEAT_MS;
          const chordAt = origin + Math.floor((now - origin) / chordMs) * chordMs;
          if (chordAt < now) {const pad = musicEvents(round, chordAt, chordAt + .01).find(e => e.kind === 'pad' && e.layer === layer); if (pad) this.tone(pad, this.context.currentTime + .015, Math.max(.2, pad.duration - (now - chordAt) / 1000));}
        }
      }
      const from = Math.max(now, this.scheduledUntil), until = now + 180;
      const time = (at: number) => this.context!.currentTime + .015 + Math.max(0, at - now) / 1000;
      for (const event of musicEvents(round, from, until)) this.tone(event, time(event.at));
      for (const event of hammerEvents(frame.builders, frame.listener, frame.selfId, from, until, round.burnAt)) this.hammer(time(event.at), event.gain, event);
      this.scheduledUntil = until;
    } else {this.clearVoices(); this.target(this.day, 0); this.target(this.burn, 0); this.target(this.fire, 0); this.target(this.crowd, 0);}
    this.timer = (this.options.schedule ?? setTimeout)(this.tick, 60);
  };
  private suspend() {try {void this.context?.suspend().catch(() => {});} catch {}}
  private pause(immediate = false) {
    this.revision++; this.cancelTimer('timer'); this.cancelTimer('pauseTimer'); this.target(this.master, 0, .035); this.update({playing: false});
    if (immediate) {if (this.master && this.context) this.master.gain.setValueAtTime(0, this.context.currentTime); this.clearVoices(); this.suspend();}
    else this.pauseTimer = (this.options.schedule ?? setTimeout)(() => {this.pauseTimer = null; if (!this.wantsPlayback()) {this.clearVoices(); this.suspend();}}, 180);
  }
  private start() {
    if (!this.wantsPlayback()) return;
    this.cancelTimer('pauseTimer'); const revision = ++this.revision;
    if (!this.context || this.context.state === 'closed') {
      this.releaseGraph();
      try {this.context = (this.options.createContext ?? browserContext)(); this.buildGraph(this.context);} catch {this.releaseGraph(); this.update({playing: false, unavailable: true}); return;}
      const context = this.context;
      context.onstatechange = () => {
        if (this.disposed || this.context !== context) return;
        if (context.state !== 'running') {this.cancelTimer('timer'); this.clearVoices(); this.update({playing: false, needsGesture: this.wantsPlayback()});}
        else if (!this.wantsPlayback()) {this.target(this.master, 0, .01); this.suspend();}
        else {this.decodeRecordings(context); this.target(this.master, .52, .4); this.update({playing: true, needsGesture: false, unavailable: false}); if (this.timer === null) this.tick();}
      };
    }
    const context = this.context;
    this.decodeRecordings(context);
    try {
      // resume stays in the original click/submit stack, including Safari.
      void context.resume().then(() => {
        if (this.disposed) return;
        if (revision !== this.revision || !this.wantsPlayback()) {if (!this.wantsPlayback()) this.suspend(); return;}
        if (context.state !== 'running') {this.update({playing: false, needsGesture: true}); return;}
        this.target(this.master, .52, .4); this.update({playing: true, needsGesture: false, unavailable: false});
        if (this.timer === null) this.tick();
      }).catch(() => {if (!this.disposed && revision === this.revision) this.update({playing: false, needsGesture: this.wantsPlayback()});});
    } catch {this.update({playing: false, needsGesture: this.wantsPlayback()});}
  }
  requestFromGesture() {if (this.disposed || !this.active) return; this.requested = true; if (!this.current.muted) this.start();}
  toggleFromGesture() {
    if (this.disposed) return;
    // Before first unlock, the crossed speaker means “start sound”, not “mute”.
    if (!this.current.muted && (!this.requested || this.current.needsGesture || this.current.unavailable)) {this.requestFromGesture(); return;}
    const muted = !this.current.muted; try {this.storage?.setItem(FESTIVAL_MUTE_KEY, String(muted));} catch {}
    this.update({muted, needsGesture: false}); if (muted) this.pause(); else this.requestFromGesture();
  }
  setActive(active: boolean, immediate = false) {if (this.disposed || active === this.active) return; this.active = active; if (active) {if (this.requested && !this.current.muted) this.start();} else this.pause(immediate);}
  private releaseGraph() {
    if (this.context) this.context.onstatechange = null;
    this.clearVoices(); this.releaseVoice(this.graph); this.graph = {sources: [], nodes: []};
    try {void this.context?.close().catch(() => {});} catch {}
    this.context = null; this.decoding.clear(); this.buffers.clear(); this.master = null; this.day = null; this.burn = null; this.fire = null; this.crowd = null; this.noise = null;
  }
  dispose() {if (this.disposed) return; this.disposed = true; this.revision++; this.fetchController.abort(); this.encoded.clear(); this.cancelTimer('timer'); this.cancelTimer('pauseTimer'); this.current = {...this.current, playing: false}; this.releaseGraph();}
}
