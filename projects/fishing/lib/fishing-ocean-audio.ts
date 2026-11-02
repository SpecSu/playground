/** One local audio graph: procedural surf, licensed Solace recording, reel clicks and catch celebration. */
export const OCEAN_MUTE_KEY = 'dreamina-fishing:ocean-muted:v1';
export type OceanAudioStatus = {muted: boolean; playing: boolean; needsGesture: boolean; unavailable: boolean; musicUnavailable?: boolean};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type Timer = ReturnType<typeof setTimeout>;
type Options = {
  createContext?: () => AudioContext;
  loadMusicBuffer?: (context: AudioContext, signal: AbortSignal) => Promise<AudioBuffer>;
  storage?: StorageLike;
  onStatus?: (status: OceanAudioStatus) => void;
  schedule?: (callback: () => void, ms: number) => Timer;
  cancel?: (timer: Timer) => void;
};

/** Deterministic, gently coloured stereo noise with a crossfaded loop seam. */
export function createOceanNoise(sampleRate = 22050, durationSeconds = 12): Float32Array[] {
  const length = Math.max(2, Math.floor(sampleRate * durationSeconds));
  const blend = Math.min(Math.floor(sampleRate * .18), Math.floor(length / 4));
  return [0x13579bdf, 0x2468ace1].map(seed => {
    const raw = new Float32Array(length + blend);
    let slow = 0, middle = 0, fast = 0;
    for (let i = -2048; i < raw.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const white = (seed >>> 0) / 0xffffffff * 2 - 1;
      slow = .997 * slow + .035 * white;
      middle = .96 * middle + .12 * white;
      fast = .72 * fast + .25 * white;
      if (i >= 0) raw[i] = .52 * slow + .32 * middle + .16 * fast;
    }
    const data = raw.slice(0, length);
    for (let i = 0; i < blend; i++) {
      const mix = .5 - .5 * Math.cos(Math.PI * i / blend);
      data[i] = raw[length + i] * (1 - mix) + raw[i] * mix;
    }
    let mean = 0; for (const value of data) mean += value; mean /= length;
    let peak = 0; for (let i = 0; i < length; i++) {data[i] -= mean; peak = Math.max(peak, Math.abs(data[i]));}
    for (let i = 0; i < length; i++) data[i] *= .75 / (peak || 1);
    return data;
  });
}

export const FISHING_MUSIC_URL = '/audio/solace-scott-buckley.mp3';
/** Three soft ascending major-pentatonic tones, .84 seconds, no sampled asset. */
export function createCatchChime(sampleRate = 22050): Float32Array {
  const data = new Float32Array(Math.floor(sampleRate * .84));
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
      const age = t - index * .115, duration = .58;
      if (age <= 0 || age >= duration) continue;
      const envelope = Math.min(1, age / .018) * Math.exp(-age * 7) * Math.min(1, (duration - age) / .08);
      data[i] += .27 * envelope * (Math.sin(2 * Math.PI * frequency * age) + .16 * Math.sin(4 * Math.PI * frequency * age));
    }
  }
  return data;
}
/** Dry, fast reel ratchet: distinct damped metal teeth, accelerating then coasting.
 * Reference: https://freesound.org/people/1bob/sounds/831928/ (CC0 ratchet reel).
 * Original synthesis; no recording is copied or loaded.
 */
export function createReelClicks(sampleRate = 22050): Float32Array {
  const data = new Float32Array(Math.floor(sampleRate * .42));
  let at = .008, tooth = 0;
  while (at < .385) {
    const progress = at / .42, speed = Math.sin(Math.PI * progress);
    const level = .48 * (1 - .48 * progress);
    for (let n = 0; n < sampleRate * .011; n++) {
      const age = n / sampleRate, i = Math.floor(at * sampleRate) + n;
      if (i >= data.length) break;
      const envelope = Math.min(1, age / .0005) * Math.exp(-age * 650) * Math.max(0, 1 - age / .011);
      data[i] += level * envelope * (Math.sin(2 * Math.PI * (1850 + tooth % 3 * 130) * age) + .42 * Math.sin(2 * Math.PI * 4170 * age));
    }
    at += .025 - .013 * speed; tooth++;
  }
  return data;
}
/** One crisp bell strike: bright inharmonic partials, fast attack, short decay. */
export function createBiteBell(sampleRate = 22050): Float32Array {
  const data = new Float32Array(Math.floor(sampleRate * .38));
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, edge = Math.min(1, t / .0015) * Math.min(1, (.38 - t) / .025);
    data[i] = .43 * edge * (Math.sin(2 * Math.PI * 2350 * t) * Math.exp(-t * 17)
      + .34 * Math.sin(2 * Math.PI * 3713 * t) * Math.exp(-t * 27)
      + .16 * Math.sin(2 * Math.PI * 5260 * t) * Math.exp(-t * 38));
  }
  data[0] = 0; data[data.length - 1] = 0;
  return data;
}
async function loadMusic(context: AudioContext, signal: AbortSignal): Promise<AudioBuffer> {
  const response = await fetch(FISHING_MUSIC_URL, {signal, credentials: 'same-origin', cache: 'force-cache'});
  if (!response.ok) throw new Error('Music unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024 || !bytes.byteLength) throw new Error('Unexpected music asset');
  const buffer = await context.decodeAudioData(bytes);
  if (buffer.duration < 355 || buffer.duration > 358) throw new Error('Unexpected music duration');
  return buffer;
}

function browserContext(): AudioContext {
  const Constructor = globalThis.AudioContext ?? (globalThis as typeof globalThis & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Constructor) throw new Error('Web Audio unavailable');
  return new Constructor({sampleRate: 22050});
}
function deviceStorage(): StorageLike | undefined {try {return globalThis.localStorage;} catch {return undefined;}}

export class FishingOceanAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private sources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private active = true;
  private requested = false;
  private disposed = false;
  private revision = 0;
  private pauseTimer: Timer | null = null;
  private options: Options;
  private storage: StorageLike | undefined;
  private current: OceanAudioStatus;
  private musicLoad: AbortController | null = null;
  private celebrated = new Set<string>();
  private chimes = new Set<AudioBufferSourceNode>();
  private defaultStarted = false;
  private biteWatch: {castId: string; now: number} | null = null;
  private heardBites = new Set<string>();
  private confirmedCasts = new Set<string>();
  private soundedCasts = new Set<string>();

  constructor(options: Options = {}) {
    this.options = options;
    this.storage = options.storage ?? deviceStorage();
    let muted = false; try {muted = this.storage?.getItem(OCEAN_MUTE_KEY) === 'true';} catch {}
    this.current = {muted, playing: false, needsGesture: false, unavailable: false};
  }
  get status(): OceanAudioStatus {return {...this.current};}
  private update(patch: Partial<OceanAudioStatus>) {
    this.current = {...this.current, ...patch};
    if (!this.disposed) this.options.onStatus?.(this.status);
  }
  private clearPause() {
    if (this.pauseTimer !== null) (this.options.cancel ?? clearTimeout)(this.pauseTimer);
    this.pauseTimer = null;
  }
  private wantsPlayback() {return !this.disposed && this.active && this.requested && !this.current.muted;}
  private buildGraph(context: AudioContext) {
    const channels = createOceanNoise();
    const buffer = context.createBuffer(2, channels[0].length, 22050);
    channels.forEach((data, channel) => buffer.getChannelData(channel).set(data));
    const master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
    this.master = master; this.nodes.push(master);
    // Independent 13/18-second swells avoid an obvious repeated surge. The foam
    // layer is much quieter and rolled off at 2.3 kHz, avoiding a bright hiss.
    for (const layer of [
      {high: 85, low: 950, level: .3575, swell: .208, rate: .076, offset: 0},
      {high: 620, low: 2300, level: .06175, swell: .052, rate: .057, offset: 5.3},
    ]) {
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = layer.high; high.Q.value = .5;
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = layer.low; low.Q.value = .5;
      const swell = context.createGain(); swell.gain.value = layer.level;
      const motion = context.createOscillator(); motion.type = 'sine'; motion.frequency.value = layer.rate;
      const depth = context.createGain(); depth.gain.value = layer.swell;
      source.connect(high); high.connect(low); low.connect(swell); swell.connect(master);
      motion.connect(depth); depth.connect(swell.gain);
      this.nodes.push(source, high, low, swell, motion, depth); this.sources.push(source, motion);
      source.start(0, layer.offset); motion.start();
    }
  }
  private prepareMusic(context: AudioContext) {
    if (this.musicLoad) return;
    const controller = new AbortController(); this.musicLoad = controller;
    void (this.options.loadMusicBuffer ?? loadMusic)(context, controller.signal).then(buffer => {
      if (this.disposed || controller.signal.aborted || this.context !== context) return;
      const source = context.createBufferSource(), level = context.createGain();
      source.buffer = buffer; source.loop = true;
      // Native-rate local loop. Asset has silence-safe edge fades; never seek or
      // rate-correct to server polls. Keep the gentle recording clear over the quieter surf layer.
      level.gain.value = 0; source.connect(level); level.connect(this.master!);
      this.nodes.push(source, level); this.sources.push(source);
      source.start(); level.gain.setTargetAtTime(.4, context.currentTime, .8);
      this.update({musicUnavailable: false});
    }).catch(() => {
      if (!this.disposed && !controller.signal.aborted && this.context === context) this.update({musicUnavailable: true});
    });
  }
  /** Only transport-confirmed own catch IDs enter here. Suppressed sounds never queue. */
  celebrateCatch(catchId: string) {
    if (!catchId || this.celebrated.has(catchId) || this.disposed) return;
    this.celebrated.add(catchId);
    if (this.celebrated.size > 128) this.celebrated.delete(this.celebrated.values().next().value!);
    const context = this.context;
    if (!this.wantsPlayback() || context?.state !== 'running' || !this.master) return;
    try {
      const data = createCatchChime(), buffer = context.createBuffer(1, data.length, 22050);
      buffer.getChannelData(0).set(data);
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.master);
      this.chimes.add(source);
      source.onended = () => {source.disconnect(); this.chimes.delete(source);};
      source.start();
    } catch {/* A celebration must never interrupt gameplay or ocean audio. */}
  }
  /** Transport intent only, never a snapshot-derived effect. */
  confirmCast(castId: string) {
    if (!castId || this.disposed || this.soundedCasts.has(castId)) return;
    this.confirmedCasts.add(castId);
    if (this.confirmedCasts.size > 128) this.confirmedCasts.delete(this.confirmedCasts.values().next().value!);
  }
  /** Called by the rendered own-actor cast start; suppressed events never queue. */
  playCast(castId: string) {
    if (!this.confirmedCasts.delete(castId) || this.disposed || this.soundedCasts.has(castId)) return;
    this.soundedCasts.add(castId);
    if (this.soundedCasts.size > 128) this.soundedCasts.delete(this.soundedCasts.values().next().value!);
    const context = this.context;
    if (!this.wantsPlayback() || context?.state !== 'running' || !this.master) return;
    let source: AudioBufferSourceNode | undefined;
    try {
      const data = createReelClicks(), buffer = context.createBuffer(1, data.length, 22050);
      buffer.getChannelData(0).set(data);
      source = context.createBufferSource(); source.buffer = buffer; source.connect(this.master);
      const playing = source;
      this.chimes.add(playing);
      playing.onended = () => {playing.disconnect(); this.chimes.delete(playing);};
      playing.start();
    } catch {
      if (source) {source.onended = null; try {source.disconnect();} catch {} this.chimes.delete(source);}
    }
  }
  /** Feed supplies its own projected state every clock tick; cold bite snapshots stay silent. */
  observeBite(state: {phase: string; castId?: string; biteAt?: number; expiresAt?: number} | undefined, serverNow: number) {
    const previous = this.biteWatch;
    this.biteWatch = null;
    if (!state?.castId || !Number.isFinite(serverNow) || this.disposed) return;
    const {castId, biteAt, expiresAt} = state;
    const biting = (state.phase === 'waiting' || state.phase === 'bite') && biteAt !== undefined && serverNow >= biteAt;
    if (!biting) {
      if (this.active && state.phase === 'waiting' && biteAt !== undefined && serverNow < biteAt)
        this.biteWatch = {castId, now: serverNow};
      return;
    }
    if (this.heardBites.has(castId)) return;
    this.heardBites.add(castId);
    if (this.heardBites.size > 128) this.heardBites.delete(this.heardBites.values().next().value!);
    const context = this.context;
    if (!previous || previous.castId !== castId || serverNow - previous.now > 1000 || serverNow < previous.now
      || serverNow - biteAt >= 5000 || serverNow >= (expiresAt ?? biteAt + 5000)
      || !this.wantsPlayback() || context?.state !== 'running' || !this.master) return;
    let source: AudioBufferSourceNode | undefined;
    try {
      const data = createBiteBell(), buffer = context.createBuffer(1, data.length, 22050);
      buffer.getChannelData(0).set(data);
      source = context.createBufferSource(); source.buffer = buffer; source.connect(this.master);
      const playing = source; this.chimes.add(playing);
      playing.onended = () => {playing.disconnect(); this.chimes.delete(playing);}; playing.start();
    } catch {if (source) {source.onended = null; try {source.disconnect();} catch {} this.chimes.delete(source);}}
  }
  private stopChimes() {
    for (const source of this.chimes) {source.onended = null; try {source.stop(); source.disconnect();} catch {}}
    this.chimes.clear();
  }
  /** Default-on attempts autoplay once; browser policy may require the next gesture. */
  startDefault() {
    if (this.defaultStarted || this.disposed) return;
    this.defaultStarted = true; this.requested = true;
    if (!this.current.muted && this.active) this.start();
  }
  private fade(value: number, immediate = false) {
    if (!this.master || !this.context) return;
    const gain = this.master.gain, now = this.context.currentTime;
    // setTargetAtTime starts at the current computed value, including when a
    // quick toggle reverses an in-progress fade. No hard amplitude jump.
    gain.cancelScheduledValues(now);
    if (immediate) gain.setValueAtTime(value, now);
    else gain.setTargetAtTime(value, now, value > 0 ? .35 : .035);
  }
  private suspend() {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    try {void context.suspend().catch(() => {});} catch {}
  }
  private pause(immediate = false) {
    this.revision++; this.clearPause(); this.confirmedCasts.clear(); this.biteWatch = null; this.stopChimes(); this.fade(0, immediate); this.update({playing: false});
    if (!this.context) return;
    if (immediate) this.suspend();
    else this.pauseTimer = (this.options.schedule ?? setTimeout)(() => {
      this.pauseTimer = null; if (!this.wantsPlayback()) this.suspend();
    }, 180);
  }
  private start(fromGesture = false) {
    if (!this.wantsPlayback()) return;
    this.clearPause(); const revision = ++this.revision;
    if (!this.context || this.context.state === 'closed') {
      this.releaseGraph();
      try {
        const context = (this.options.createContext ?? browserContext)(); this.context = context;
        this.buildGraph(context);
        this.prepareMusic(context);
        context.onstatechange = () => {
          if (this.disposed || this.context !== context) return;
          if (context.state !== 'running') this.update({playing: false, needsGesture: this.wantsPlayback()});
          else if (this.wantsPlayback()) {this.fade(.18); this.update({playing: true, needsGesture: false});}
          else {this.fade(0, true); this.suspend();}
        };
      } catch {
        this.releaseGraph(); this.update({playing: false, needsGesture: false, unavailable: true}); return;
      }
    }
    const context = this.context!;
    // Browser autoplay can stay pending without rejecting. Automatic resume
    // therefore offers a gesture retry immediately; a user-requested pending
    // resume still permits an explicit second-tap mute.
    if (!fromGesture && context.state !== 'running') this.update({needsGesture: true});
    try {
      // Must happen synchronously in the original click/submit call stack.
      const resumed = context.resume();
      void resumed.then(() => {
        if (this.disposed) return;
        if (revision !== this.revision || !this.wantsPlayback()) {
          if (!this.wantsPlayback()) {this.fade(0, true); this.suspend();}
          return;
        }
        if (context.state !== 'running') {this.update({playing: false, needsGesture: true}); return;}
        this.fade(.18); this.update({playing: true, needsGesture: false, unavailable: false});
      }).catch(() => {
        if (!this.disposed && revision === this.revision) this.update({playing: false, needsGesture: this.wantsPlayback()});
      });
    } catch {
      this.fade(0, true); this.update({playing: false, needsGesture: this.wantsPlayback()});
    }
  }
  /** Call directly from an explicit boarding/casting gesture; never clears mute. */
  requestFromGesture() {
    if (this.disposed || !this.active) return;
    this.requested = true;
    if (!this.current.muted) this.start(true);
  }
  /** One direct toggle. A rejected playback attempt gets an explicit retry. */
  toggleFromGesture() {
    if (this.disposed) return;
    if ((this.current.needsGesture || this.current.unavailable) && !this.current.muted) {this.requestFromGesture(); return;}
    const muted = !this.current.muted;
    try {this.storage?.setItem(OCEAN_MUTE_KEY, String(muted));} catch {}
    this.update({muted, needsGesture: false});
    if (muted) this.pause(); else this.requestFromGesture();
  }
  setActive(active: boolean, immediate = false) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {if (this.requested && !this.current.muted) this.start();}
    else this.pause(immediate);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.revision++; this.clearPause(); this.fade(0, true);
    this.current = {...this.current, playing: false};
    this.releaseGraph();
  }
  private releaseGraph() {
    this.musicLoad?.abort(); this.musicLoad = null; this.stopChimes();
    if (this.context) this.context.onstatechange = null;
    for (const source of this.sources) {try {source.stop();} catch {}}
    for (const node of this.nodes) {try {node.disconnect();} catch {}}
    try {void this.context?.close().catch(() => {});} catch {}
    this.nodes = []; this.sources = []; this.master = null; this.context = null;
  }
}
