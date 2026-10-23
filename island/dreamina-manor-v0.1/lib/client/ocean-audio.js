/** Waves only, preserved from the original fishing boat's procedural stereo surf. */
export const OCEAN_MUTE_KEY = 'manor-next:ocean-muted:v1';

/** Deterministic coloured noise with the original crossfaded loop seam. */
export function createOceanNoise(sampleRate = 22050, durationSeconds = 12) {
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
    let mean = 0;
    for (const value of data) mean += value;
    mean /= length;
    let peak = 0;
    for (let i = 0; i < length; i++) {
      data[i] -= mean;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    for (let i = 0; i < length; i++) data[i] *= .75 / (peak || 1);
    return data;
  });
}

function browserContext() {
  const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Constructor) throw new Error('Web Audio unavailable');
  return new Constructor({sampleRate: 22050});
}

function deviceStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/**
 * A vanilla, local-only surf controller. Construction never creates an AudioContext.
 * Call startFromGesture() or toggleMute() directly inside a user gesture, before
 * awaiting anything. Ordinary gestures never clear the saved mute preference.
 *
 * The host owns DOM listeners: pass document.hidden || pageHidden to setHidden(),
 * setting pageHidden on pagehide and clearing it on pageshow. Dispose when the host
 * unmounts, not on a temporary pagehide, so back/forward-cache restores can resume.
 * state/status return isolated snapshots; subscribe(listener) immediately sends
 * one snapshot and returns an unsubscribe function. onStatus receives changes.
 * Optional context/storage/timer dependencies allow silent lifecycle testing.
 */
export function createOceanAudioController(options = {}) {
  const storage = options.storage ?? deviceStorage();
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let muted = false;
  try { muted = storage?.getItem(OCEAN_MUTE_KEY) === 'true'; } catch { /* Storage is optional. */ }
  let current = {muted, playing: false, needsGesture: false, unavailable: false};
  let context = null, master = null, nodes = [], sources = [];
  let requested = false, hidden = false, disposed = false, revision = 0;
  let pauseTimer = null, pendingSuspend = null;
  const listeners = new Set();

  const snapshot = () => ({...current});
  const wantsPlayback = () => !disposed && !hidden && requested && !current.muted;
  function notify(listener) {
    try { listener(snapshot()); } catch { /* UI observers cannot interrupt audio cleanup. */ }
  }
  function update(patch) {
    if (disposed || Object.keys(patch).every(key => current[key] === patch[key])) return;
    current = {...current, ...patch};
    if (options.onStatus) notify(options.onStatus);
    for (const listener of [...listeners]) notify(listener);
  }
  function clearPause() {
    if (pauseTimer !== null) cancel(pauseTimer);
    pauseTimer = null;
  }
  function fade(value, immediate = false) {
    if (!master || !context) return;
    const gain = master.gain, now = context.currentTime;
    gain.cancelScheduledValues(now);
    // Starting from the computed gain preserves continuity when a fade reverses.
    if (immediate) gain.setValueAtTime(value, now);
    else gain.setTargetAtTime(value, now, value > 0 ? .35 : .035);
  }
  function releaseGraph() {
    const previous = context;
    if (previous) previous.onstatechange = null;
    context = null; master = null; pendingSuspend = null;
    for (const source of sources) { try { source.stop(); } catch { /* May not have started. */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
    sources = []; nodes = [];
    try { if (previous?.state !== 'closed') void previous?.close().catch(() => {}); } catch { /* Already released. */ }
  }
  function buildGraph(ctx) {
    const track = node => { nodes.push(node); return node; };
    const sourceNode = node => { sources.push(node); return track(node); };
    const channels = createOceanNoise();
    const buffer = ctx.createBuffer(2, channels[0].length, 22050);
    channels.forEach((data, channel) => buffer.getChannelData(channel).set(data));
    master = track(ctx.createGain()); master.gain.value = 0; master.connect(ctx.destination);
    // Exact original two-layer parameters: independent slow swells, quiet foam.
    for (const layer of [
      {high: 85, low: 950, level: .3575, swell: .208, rate: .076, offset: 0},
      {high: 620, low: 2300, level: .06175, swell: .052, rate: .057, offset: 5.3},
    ]) {
      const source = sourceNode(ctx.createBufferSource()); source.buffer = buffer; source.loop = true;
      const high = track(ctx.createBiquadFilter()); high.type = 'highpass'; high.frequency.value = layer.high; high.Q.value = .5;
      const low = track(ctx.createBiquadFilter()); low.type = 'lowpass'; low.frequency.value = layer.low; low.Q.value = .5;
      const swell = track(ctx.createGain()); swell.gain.value = layer.level;
      const motion = sourceNode(ctx.createOscillator()); motion.type = 'sine'; motion.frequency.value = layer.rate;
      const depth = track(ctx.createGain()); depth.gain.value = layer.swell;
      source.connect(high); high.connect(low); low.connect(swell); swell.connect(master);
      motion.connect(depth); depth.connect(swell.gain);
      source.start(0, layer.offset); motion.start();
    }
  }
  function suspend() {
    const ctx = context;
    if (!ctx || ctx.state === 'closed' || ctx.state === 'suspended' || pendingSuspend) return;
    const operation = {}; pendingSuspend = operation;
    const settled = () => {
      if (disposed || context !== ctx || pendingSuspend !== operation) return;
      pendingSuspend = null;
      // suspend() can finish after the latest unmute's resume(). Repair that
      // ordering once it settles; a canceled timer alone does not cover this race.
      if (wantsPlayback() && ctx.state !== 'running' && ctx.state !== 'closed') start();
    };
    try { void Promise.resolve(ctx.suspend()).then(settled, settled); }
    catch { settled(); }
  }
  function pause(immediate = false) {
    const token = ++revision;
    clearPause(); fade(0, immediate); update({playing: false, needsGesture: false});
    if (!context) return;
    if (immediate) suspend();
    else pauseTimer = schedule(() => {
      if (disposed || token !== revision) return;
      pauseTimer = null;
      if (!wantsPlayback()) suspend();
    }, 180);
  }
  function start(fromGesture = false) {
    if (!wantsPlayback()) return;
    clearPause(); const token = ++revision;
    if (!context || context.state === 'closed') {
      releaseGraph();
      try {
        context = (options.createContext ?? browserContext)();
        buildGraph(context);
        const ctx = context;
        ctx.onstatechange = () => {
          if (disposed || context !== ctx) return;
          if (ctx.state !== 'running') {
            update({playing: false, needsGesture: wantsPlayback() && !pendingSuspend});
          } else if (wantsPlayback()) {
            fade(.18); update({playing: true, needsGesture: false, unavailable: false});
          } else {
            fade(0, true); update({playing: false, needsGesture: false}); suspend();
          }
        };
      } catch {
        releaseGraph(); update({playing: false, needsGesture: false, unavailable: true}); return;
      }
    }
    const ctx = context;
    if (!fromGesture && ctx.state !== 'running') update({needsGesture: true});
    const rejected = () => {
      if (!disposed && context === ctx && token === revision) {
        fade(0, true); update({playing: false, needsGesture: wantsPlayback()});
      }
    };
    try {
      // Do not queue this call: browser gesture activation belongs to this stack.
      const resumed = ctx.resume();
      void Promise.resolve(resumed).then(() => {
        if (disposed || context !== ctx) return;
        if (token !== revision || !wantsPlayback()) {
          if (!wantsPlayback()) { fade(0, true); suspend(); }
          return;
        }
        if (ctx.state !== 'running') {
          update({playing: false, needsGesture: !pendingSuspend}); return;
        }
        fade(.18); update({playing: true, needsGesture: false, unavailable: false});
      }, rejected);
    } catch { rejected(); }
  }
  function startFromGesture() {
    if (disposed || hidden) return;
    requested = true;
    if (!current.muted) start(true);
  }
  function toggleMute() {
    if (disposed) return;
    const next = !current.muted;
    try { storage?.setItem(OCEAN_MUTE_KEY, String(next)); } catch { /* In-memory mute still works. */ }
    update({muted: next, needsGesture: false});
    if (next) pause(); else startFromGesture();
  }
  function setHidden(value) {
    if (disposed || hidden === Boolean(value)) return;
    hidden = Boolean(value);
    if (hidden) pause(true); else if (wantsPlayback()) start();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; revision++; clearPause(); fade(0, true);
    current = {...current, playing: false, needsGesture: false};
    listeners.clear(); releaseGraph();
  }
  return {
    get status() { return snapshot(); },
    get state() { return snapshot(); },
    startFromGesture, toggleMute, setHidden, dispose,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener); notify(listener);
      return () => listeners.delete(listener);
    },
  };
}
