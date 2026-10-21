import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingOceanAudio, createOceanNoise, OCEAN_MUTE_KEY } from '../lib/fishing-ocean-audio.ts';

// No browser or real AudioContext is created: this fake records the graph and
// advances lifecycle transitions without outputting any sound.
class Param {
  value = 0; events = [];
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(['target', value, time, duration]); }
}
class Node {
  connections = []; stopped = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(...args) { this.started = true; this.startArgs = args; }
  stop() { this.stopped = true; }
}
class FakeContext {
  state = 'suspended'; currentTime = 0; sampleRate = 22050;
  destination = new Node(); sources = []; gains = []; filters = []; oscillators = [];
  resumes = 0; suspends = 0; closes = 0; blocked = false; resumeGate = null;
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({length: channels}, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: n => data[n] };
  }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
  createGain() { const n = Object.assign(new Node(), {gain: new Param()}); this.gains.push(n); return n; }
  createBiquadFilter() { const n = Object.assign(new Node(), {frequency: new Param(), Q: new Param()}); this.filters.push(n); return n; }
  createOscillator() { const n = Object.assign(new Node(), {frequency: new Param()}); this.oscillators.push(n); return n; }
  async resume() { this.resumes++; if (this.blocked) throw Error('gesture required'); if(this.resumeGate) await this.resumeGate; this.state = 'running'; this.onstatechange?.(); }
  async suspend() { this.suspends++; this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.closes++; this.state = 'closed'; }
}
function setup({muted = false, loadMusicBuffer = async () => {throw Error('offline');}} = {}) {
  const ctx = new FakeContext(), statuses = [], timers = new Map(), storage = new Map([[OCEAN_MUTE_KEY, String(muted)]]);
  let created = 0, id = 0;
  const audio = new FishingOceanAudio({
    createContext: () => { created++; return ctx; }, loadMusicBuffer,
    storage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    onStatus: status => statuses.push(status),
    schedule: fn => {timers.set(++id, fn); return id;}, cancel: timer => timers.delete(timer),
  });
  const flush = async () => { for(let i = 0; i < 8; i++) await Promise.resolve(); };
  const fireTimers = async () => { for(const [key, fn] of [...timers]) {timers.delete(key); fn();} await flush(); };
  return {audio, ctx, storage, statuses, timers, flush, fireTimers, created: () => created};
}

test('ocean stays silent until a gesture, then builds one soft filtered stereo graph', async () => {
  const h = setup();
  assert.equal(h.created(), 0);
  h.audio.setActive(true);
  assert.equal(h.created(), 0, 'visibility alone never creates or unlocks audio');
  h.audio.requestFromGesture();
  assert.equal(h.ctx.resumes, 1, 'resume is called synchronously inside the gesture');
  await h.flush();
  assert.equal(h.audio.status.playing, true);
  assert.equal(h.ctx.sources.length, 2);
  assert.ok(h.ctx.sources.every(n => n.loop && n.buffer.numberOfChannels === 2));
  assert.deepEqual(h.ctx.filters.map(n => n.type), ['highpass', 'lowpass', 'highpass', 'lowpass']);
  assert.ok(h.ctx.filters.filter(n => n.type === 'lowpass').every(n => n.frequency.value <= 2600));
  assert.ok(h.ctx.oscillators.every(n => n.frequency.value < 0.15), 'sub-audible swell modulators, no melody');
  assert.ok(h.ctx.gains.some(n => n.gain.events.some(e => e[0] === 'target' && e[1] > 0 && e[1] <= 0.2)), 'quiet master fades in');
  h.audio.requestFromGesture(); await h.flush();
  assert.equal(h.created(), 1); assert.equal(h.ctx.sources.length, 2);
  h.audio.dispose();
});

test('mute is persistent before joining and ordinary gestures cannot clear it', async () => {
  const h = setup(); h.audio.toggleFromGesture();
  assert.equal(h.audio.status.muted, true); assert.equal(h.storage.get(OCEAN_MUTE_KEY), 'true');
  h.audio.requestFromGesture(); h.audio.setActive(false); h.audio.setActive(true); await h.flush();
  assert.equal(h.created(), 0);
  h.audio.toggleFromGesture(); await h.flush();
  assert.equal(h.audio.status.muted, false); assert.equal(h.audio.status.playing, true);
  assert.equal(h.storage.get(OCEAN_MUTE_KEY), 'false'); h.audio.dispose();
  const saved = setup({muted: true}); saved.audio.requestFromGesture();
  assert.equal(saved.created(), 0); saved.audio.dispose();
});

test('mute fades out, then suspends, and a quick unmute cancels stale suspension', async () => {
  const h = setup(); h.audio.requestFromGesture(); await h.flush();
  h.audio.toggleFromGesture();
  assert.equal(h.audio.status.playing, false);
  assert.ok(h.ctx.gains.some(n => n.gain.events.some(e => e[0] === 'target' && e[1] === 0)));
  await h.fireTimers(); assert.equal(h.ctx.state, 'suspended');
  h.audio.toggleFromGesture(); await h.flush();
  h.audio.toggleFromGesture(); h.audio.toggleFromGesture(); await h.flush(); await h.fireTimers();
  assert.equal(h.ctx.state, 'running'); assert.equal(h.audio.status.playing, true); h.audio.dispose();
});

test('hidden and profile navigation suspend, returning respects mute and prior gesture', async () => {
  const h = setup(); h.audio.requestFromGesture(); await h.flush();
  h.audio.setActive(false, true); await h.flush();
  assert.equal(h.ctx.state, 'suspended'); assert.equal(h.audio.status.playing, false);
  h.audio.setActive(true); await h.flush(); assert.equal(h.audio.status.playing, true);
  h.audio.setActive(false); await h.fireTimers(); assert.equal(h.ctx.state, 'suspended');
  h.audio.toggleFromGesture(); h.audio.setActive(true); await h.flush();
  assert.equal(h.audio.status.muted, true); assert.equal(h.ctx.state, 'suspended'); h.audio.dispose();
});

test('blocked autoplay is retryable and an explicit mute wins over a pending resume', async () => {
  const h = setup(); h.ctx.blocked = true;
  h.audio.requestFromGesture(); await h.flush();
  assert.equal(h.audio.status.playing, false); assert.equal(h.audio.status.needsGesture, true);
  h.ctx.blocked = false; h.audio.toggleFromGesture(); await h.flush();
  assert.equal(h.audio.status.muted, false); assert.equal(h.audio.status.playing, true); h.audio.dispose();
  const delayed = setup(); let release;
  delayed.ctx.resumeGate = new Promise(resolve => { release = resolve; });
  delayed.audio.requestFromGesture(); delayed.audio.toggleFromGesture(); release(); await delayed.flush(); await delayed.fireTimers();
  assert.equal(delayed.audio.status.playing, false); assert.equal(delayed.ctx.state, 'suspended'); delayed.audio.dispose();
});

test('unmount stops every source, closes context, and ignores late resume completion', async () => {
  const h = setup(); let release; h.ctx.resumeGate = new Promise(resolve => {release = resolve;});
  h.audio.requestFromGesture(); h.audio.dispose(); release(); await h.flush();
  assert.ok(h.ctx.sources.every(n => n.stopped)); assert.ok(h.ctx.oscillators.every(n => n.stopped));
  assert.equal(h.ctx.closes, 1); assert.equal(h.audio.status.playing, false);
  h.audio.requestFromGesture(); assert.equal(h.created(), 1); assert.equal(h.timers.size, 0);
});

test('unavailable audio and denied device storage fail quietly without blocking controls', async () => {
  const audio = new FishingOceanAudio({createContext: () => {throw Error('unavailable');}, storage: {getItem() {throw Error('denied');}, setItem() {throw Error('denied');}}});
  assert.doesNotThrow(() => audio.requestFromGesture());
  assert.equal(audio.status.unavailable, true); assert.equal(audio.status.playing, false);
  assert.doesNotThrow(() => audio.toggleFromGesture()); audio.dispose();
});

test('ocean noise is reproducible, stereo, finite, peak bounded, and has a softened seam', () => {
  const channels = createOceanNoise(22050, 2), second = createOceanNoise(22050, 2);
  assert.equal(channels.length, 2); assert.deepEqual(channels, second); assert.notDeepEqual(channels[0], channels[1]);
  for(const channel of channels) {
    assert.equal(channel.length, 44100);
    let max = 0, sum = 0; for(const x of channel) {assert.ok(Number.isFinite(x)); max = Math.max(max, Math.abs(x)); sum += x;}
    assert.ok(max <= 0.76); assert.ok(max > 0.1); assert.ok(Math.abs(sum / channel.length) < 0.001);
    assert.ok(Math.abs(channel[0] - channel.at(-1)) < 0.15);
  }
});

test('feed keeps sound in one direct dock toggle and boarding calls unlock before network work', async () => {
  const {readFileSync} = await import('node:fs');
  const feed = readFileSync(new URL('../components/fishing/FishingFeed.tsx', import.meta.url), 'utf8');
  assert.match(feed, /useFishingOceanAudio\(page==='feed'\)/);
  assert.match(feed, /fishing-ocean-sound/);
  assert.match(feed, /onClick=\{ocean\.toggleFromGesture\}/);
  assert.match(feed, /const primary=\(\)=>\{ocean\.requestFromGesture\(\);/);
  assert.match(feed, /event\.preventDefault\(\);ocean\.requestFromGesture\(\);/);
  assert.doesNotMatch(feed, /onPointerDownCapture=.*ocean|onClickCapture=.*ocean/);
});

test('synchronous resume rejection remains retryable rather than claiming unsupported audio', async () => {
  const h = setup(); const resume = h.ctx.resume.bind(h.ctx);
  h.ctx.resume = () => {throw new Error('NotAllowedError');};
  assert.doesNotThrow(() => h.audio.requestFromGesture());
  assert.equal(h.audio.status.needsGesture, true);
  assert.equal(h.audio.status.unavailable, false);
  h.ctx.resume = resume; h.audio.toggleFromGesture(); await h.flush();
  assert.equal(h.audio.status.playing, true); h.audio.dispose();
});

test('partial graph failure releases its nodes and context before a later retry', async () => {
  const first = new FakeContext(), second = new FakeContext();
  const create = first.createBiquadFilter.bind(first); let filters = 0;
  first.createBiquadFilter = () => {if(++filters === 3) throw Error('graph interrupted'); return create();};
  let attempts = 0;
  const audio = new FishingOceanAudio({createContext: () => ++attempts === 1 ? first : second});
  audio.requestFromGesture();
  assert.equal(audio.status.unavailable, true);
  assert.equal(first.closes, 1);
  assert.ok(first.sources.filter(source => source.started).every(source => source.stopped));
  audio.toggleFromGesture(); for(let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(audio.status.playing, true); assert.equal(audio.status.unavailable, false); audio.dispose();
});

test('browser interruption and recovery keep the actual playback indicator accurate', async () => {
  const h = setup(); h.audio.requestFromGesture(); await h.flush();
  h.ctx.state = 'interrupted'; h.ctx.onstatechange();
  assert.equal(h.audio.status.playing, false);
  h.ctx.state = 'running'; h.ctx.onstatechange();
  assert.equal(h.audio.status.playing, true);
  assert.equal(h.audio.status.needsGesture, false);
  h.audio.setActive(false, true); await h.flush();
  h.ctx.state = 'running'; h.ctx.onstatechange(); await h.flush();
  assert.equal(h.ctx.state, 'suspended'); assert.equal(h.audio.status.playing, false); h.audio.dispose();
});

const musicBuffer={duration:356.34,length:7857297,numberOfChannels:2,sampleRate:22050};
test('default sound attempts playback once, honors saved mute and recovers after blocked autoplay',async()=>{
 const h=setup();h.ctx.blocked=true;h.audio.startDefault();await h.flush();assert.equal(h.ctx.resumes,1);assert.equal(h.audio.status.needsGesture,true);
 h.ctx.blocked=false;h.audio.requestFromGesture();await h.flush();assert.equal(h.audio.status.playing,true);h.audio.dispose();
 const muted=setup({muted:true});muted.audio.startDefault();await muted.flush();assert.equal(muted.created(),0);muted.audio.dispose();
});
test('full music loads once, fades gently above underlying waves, loops at original speed without polling restarts',async()=>{
 let loads=0;const h=setup({loadMusicBuffer:async()=>{loads++;return musicBuffer;}});h.audio.requestFromGesture();await h.flush();
 assert.equal(loads,1);assert.equal(h.ctx.sources.length,3);const music=h.ctx.sources[2];assert.equal(music.buffer,musicBuffer);assert.equal(music.loop,true);assert.equal(music.playbackRate,undefined,'default speed, no rate adjustment');
 assert.ok(h.ctx.gains.some(n=>n.gain.events.some(e=>e[0]==='target'&&e[1]===.4&&e[3]===.8)));
 for(let i=0;i<10;i++){h.audio.requestFromGesture();h.audio.setActive(true);}await h.flush();assert.equal(loads,1);assert.equal(h.ctx.sources.length,3);
 h.audio.setActive(false,true);await h.flush();assert.equal(h.ctx.state,'suspended');h.audio.setActive(true);await h.flush();assert.equal(h.ctx.sources.length,3);h.audio.dispose();assert.equal(music.stopped,true);
});
test('music failure or late completion never interrupts ocean or starts after disposal',async()=>{
 const failed=setup();failed.audio.requestFromGesture();await failed.flush();assert.equal(failed.audio.status.playing,true);assert.equal(failed.audio.status.unavailable,false);assert.equal(failed.audio.status.musicUnavailable,true);failed.audio.dispose();
 let release,signal;const late=setup({loadMusicBuffer:(_ctx,s)=>{signal=s;return new Promise(resolve=>{release=resolve;});}});late.audio.requestFromGesture();await late.flush();late.audio.dispose();assert.equal(signal.aborted,true);release(musicBuffer);await late.flush();assert.equal(late.ctx.sources.length,2);
});
test('short catch chime plays once per catch ID and never queues muted or hidden catches',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 h.audio.celebrateCatch('one');h.audio.celebrateCatch('one');assert.equal(h.ctx.sources.length,before+1);const chime=h.ctx.sources.at(-1);assert.equal(chime.buffer.length,Math.floor(22050*.84));assert.equal(chime.loop,undefined);
 h.audio.toggleFromGesture();h.audio.celebrateCatch('two');await h.fireTimers();h.audio.toggleFromGesture();await h.flush();h.audio.celebrateCatch('two');assert.equal(h.ctx.sources.length,before+1);
 h.audio.setActive(false,true);h.audio.celebrateCatch('three');h.audio.setActive(true);await h.flush();h.audio.celebrateCatch('three');assert.equal(h.ctx.sources.length,before+1);h.audio.celebrateCatch('four');assert.equal(h.ctx.sources.length,before+2);h.audio.dispose();
});
test('procedural celebration has a short warm finite envelope with silent boundaries',async()=>{
 const {createCatchChime}=await import('../lib/fishing-ocean-audio.ts');const data=createCatchChime();assert.equal(data.length,Math.floor(22050*.84));let peak=0,sum=0;for(const n of data){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));sum+=n*n;}assert.ok(peak>.2&&peak<=.7);assert.ok(Math.sqrt(sum/data.length)<.15);assert.equal(data[0],0);assert.equal(data.at(-1),0);
});

test('unsettled default autoplay offers one-click gesture retry rather than persisting mute',async()=>{
 const h=setup();let release;h.ctx.resumeGate=new Promise(resolve=>{release=resolve;});h.audio.startDefault();await h.flush();
 assert.equal(h.audio.status.needsGesture,true);assert.equal(h.audio.status.muted,false);assert.equal(h.ctx.resumes,1);
 h.audio.toggleFromGesture();assert.equal(h.ctx.resumes,2);assert.equal(h.audio.status.muted,false);release();await h.flush();assert.equal(h.audio.status.playing,true);
 h.audio.toggleFromGesture();await h.fireTimers();assert.equal(h.audio.status.muted,true);assert.equal(h.storage.get(OCEAN_MUTE_KEY),'true');h.audio.dispose();
});

test('initially hidden default sound retries pending automatic resume on first visible sound click',async()=>{
 const h=setup();let release;h.ctx.resumeGate=new Promise(resolve=>{release=resolve;});h.audio.setActive(false,true);h.audio.startDefault();assert.equal(h.created(),0);
 h.audio.setActive(true);await h.flush();assert.equal(h.audio.status.needsGesture,true);assert.equal(h.ctx.resumes,1);
 h.audio.toggleFromGesture();assert.equal(h.ctx.resumes,2);assert.equal(h.audio.status.muted,false);release();await h.flush();assert.equal(h.audio.status.playing,true);h.audio.dispose();
});

test('surf sits lower in the mix while the quiet master and catch path stay unchanged',async()=>{
 const h=setup({loadMusicBuffer:async()=>musicBuffer});h.audio.startDefault();await h.flush();
 assert.equal(h.ctx.gains[0].gain.value,.18);
 assert.deepEqual(h.ctx.gains.slice(1,5).map(n=>n.gain.value),[.3575,.208,.06175,.052]);
 h.audio.celebrateCatch('mix-check');assert.equal(h.ctx.sources.at(-1).connections[0],h.ctx.gains[0]);h.audio.dispose();
});

test('production loader accepts the actual local Solace asset and validates its decoded duration',async t=>{
 const {readFileSync}=await import('node:fs');const {FISHING_MUSIC_URL}=await import('../lib/fishing-ocean-audio.ts');
 const bytes=readFileSync(new URL('../public'+FISHING_MUSIC_URL,import.meta.url));const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};});
 const h=setup({loadMusicBuffer:undefined});h.ctx.decodeAudioData=async data=>{assert.equal(data.byteLength,bytes.length);return musicBuffer;};
 // setup's offline default is bypassed explicitly to exercise the production loader.
 const audio=new FishingOceanAudio({createContext:()=>h.ctx});audio.startDefault();await h.flush();
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/audio/solace-scott-buckley.mp3');assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(audio.status.musicUnavailable,false);assert.equal(h.ctx.sources.length,3);audio.dispose();
 const wrong=setup();wrong.ctx.decodeAudioData=async()=>({...musicBuffer,duration:189.2});
 const rejected=new FishingOceanAudio({createContext:()=>wrong.ctx});rejected.startDefault();await wrong.flush();
 assert.equal(rejected.status.musicUnavailable,true);assert.equal(rejected.status.playing,true);assert.equal(wrong.ctx.sources.length,2);rejected.dispose();
});

test('cast reel requires confirmed intent, plays once, and shares the master',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 h.audio.playCast('unconfirmed');assert.equal(h.ctx.sources.length,before);
 h.audio.confirmCast('cast-one');h.audio.playCast('cast-one');h.audio.playCast('cast-one');
 assert.equal(h.ctx.sources.length,before+1);const swish=h.ctx.sources.at(-1);
 assert.equal(swish.buffer.length,Math.floor(22050*.42));assert.equal(swish.connections[0],h.ctx.gains[0]);
 swish.onended();assert.equal(swish.connections.length,0);h.audio.dispose();
});
test('cast reel consumes muted, hidden and suspended events without replay and cleans active sources',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 h.audio.toggleFromGesture();h.audio.confirmCast('muted');h.audio.playCast('muted');h.audio.toggleFromGesture();await h.flush();h.audio.playCast('muted');
 h.audio.setActive(false,true);h.audio.confirmCast('hidden');h.audio.playCast('hidden');h.audio.setActive(true);await h.flush();h.audio.playCast('hidden');
 h.ctx.state='suspended';h.audio.confirmCast('blocked');h.audio.playCast('blocked');h.ctx.state='running';h.audio.playCast('blocked');assert.equal(h.ctx.sources.length,before);
 h.audio.confirmCast('live');h.audio.playCast('live');const live=h.ctx.sources.at(-1);h.audio.toggleFromGesture();assert.equal(live.stopped,true);assert.equal(live.connections.length,0);
 h.audio.toggleFromGesture();await h.flush();h.audio.confirmCast('last');h.audio.playCast('last');const last=h.ctx.sources.at(-1);h.audio.dispose();assert.equal(last.stopped,true);assert.equal(last.connections.length,0);
});
test('procedural reel clicks are brief, deterministic, quiet and click-free',async()=>{
 const {createReelClicks}=await import('../lib/fishing-ocean-audio.ts');const data=createReelClicks();assert.deepEqual(data,createReelClicks());assert.equal(data.length,Math.floor(22050*.42));let peak=0,power=0;
 for(const x of data){assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));power+=x*x;}
 assert.ok(peak>.1&&peak<.55);assert.ok(Math.sqrt(power/data.length)<.15);assert.equal(data[0],0);assert.equal(data.at(-1),0);
});
test('failed reel start disconnects its transient node and never interrupts the ambient graph',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const create=h.ctx.createBufferSource.bind(h.ctx);
 h.ctx.createBufferSource=()=>{const source=create();source.start=()=>{throw Error('interrupted');};return source;};
 h.audio.confirmCast('failed-start');assert.doesNotThrow(()=>h.audio.playCast('failed-start'));assert.equal(h.ctx.sources.at(-1).connections.length,0);assert.equal(h.audio.status.playing,true);h.audio.dispose();
});
test('feed connects transport-confirmed intent to rendered scene sound instead of button click',async()=>{
 const {readFileSync}=await import('node:fs');const feed=readFileSync(new URL('../components/fishing/FishingFeed.tsx',import.meta.url),'utf8');
 assert.match(feed,/useFishingRoom\(ocean\.celebrateCatch,ocean\.confirmCast\)/);assert.match(feed,/onCastStart=\{ocean\.playCast\}/);
 assert.equal(feed.match(/ocean\.playCast/g)?.length,1);
});
test('bite bell sounds once only after observing own waiting to projected bite',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 const state={phase:'waiting',castId:'bite-one',biteAt:1000,expiresAt:6000};
 h.audio.observeBite(state,900);h.audio.observeBite({...state,phase:'bite'},1000);h.audio.observeBite({...state,phase:'bite'},1100);
 assert.equal(h.ctx.sources.length,before+1);assert.equal(h.ctx.sources.at(-1).buffer.length,Math.floor(22050*.38));assert.equal(h.ctx.sources.at(-1).connections[0],h.ctx.gains[0]);h.audio.dispose();
});
test('cold, old, hidden, muted and clock-gap bites do not queue a bell',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 const bite=(id)=>({phase:'bite',castId:id,biteAt:1000,expiresAt:6000});
 h.audio.observeBite(bite('cold'),1100);h.audio.observeBite({...bite('old'),phase:'waiting'},900);h.audio.observeBite(bite('old'),6000);
 h.audio.observeBite({...bite('gap'),phase:'waiting'},900);h.audio.observeBite(bite('gap'),2500);
 h.audio.observeBite({...bite('hidden'),phase:'waiting'},900);h.audio.setActive(false,true);h.audio.observeBite(bite('hidden'),1000);h.audio.setActive(true);await h.flush();h.audio.observeBite(bite('hidden'),1100);
 h.audio.observeBite({...bite('muted'),phase:'waiting'},900);h.audio.toggleFromGesture();h.audio.observeBite(bite('muted'),1000);h.audio.toggleFromGesture();await h.flush();h.audio.observeBite(bite('muted'),1100);
 assert.equal(h.ctx.sources.length,before);h.audio.dispose();
});
test('reel sound has separated rapid mechanical clicks and bite bell a bright decaying ring',async()=>{
 const {createReelClicks,createBiteBell}=await import('../lib/fishing-ocean-audio.ts');const clicks=createReelClicks(),bell=createBiteBell();
 let runs=0,inside=false;for(let i=0;i<clicks.length;i+=22){let power=0;for(let j=i;j<Math.min(i+22,clicks.length);j++)power+=clicks[j]**2;const loud=power/22>.001;if(loud&&!inside)runs++;inside=loud;}assert.ok(runs>=12,'at least 12 distinct gear ticks, not continuous noise');
 assert.equal(bell.length,Math.floor(22050*.38));assert.equal(bell[0],0);assert.equal(bell.at(-1),0);
 const energy=(a,b)=>bell.slice(a,b).reduce((sum,x)=>sum+x*x,0)/(b-a);assert.ok(energy(100,1500)>energy(6000,7500)*20);
 const spectral=(frequency)=>{let re=0,im=0;for(let i=0;i<bell.length;i++){re+=bell[i]*Math.cos(2*Math.PI*frequency*i/22050);im+=bell[i]*Math.sin(2*Math.PI*frequency*i/22050);}return re*re+im*im;};assert.ok(spectral(2350)>spectral(500)*100,'clear high bell pitch');
});
test('server waiting phase still rings at projected biteAt and identity changes cannot borrow an armed cast',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();const before=h.ctx.sources.length;
 const state={phase:'waiting',castId:'projected',biteAt:2000,expiresAt:7000};
 h.audio.observeBite(state,1999);h.audio.observeBite(state,2000);assert.equal(h.ctx.sources.length,before+1);
 const bell=h.ctx.sources.at(-1);h.audio.toggleFromGesture();assert.equal(bell.stopped,true);assert.equal(bell.connections.length,0);
 h.audio.toggleFromGesture();await h.flush();h.audio.observeBite({...state,castId:'other'},1999);h.audio.observeBite(undefined,1999);h.audio.observeBite({...state,castId:'other'},2000);assert.equal(h.ctx.sources.length,before+1);h.audio.dispose();
});
