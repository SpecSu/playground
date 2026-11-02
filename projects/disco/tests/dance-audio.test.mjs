import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubAudio } from '../lib/club-audio.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
class Param { value=1; events=[]; setValueAtTime(v,t){this.events.push(['set',v,t]);this.value=v;} linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);} setTargetAtTime(v){this.value=v;} cancelScheduledValues(){} }
class Context {
 currentTime=10; state='running'; sampleRate=32000; destination={}; sources=[]; gains=[]; oscillators=[]; outputLatency=.05;
 async decodeAudioData(){return {duration:51.12,sampleRate:32000,length:1635840,numberOfChannels:2};}
 createBuffer(){return {};}
 createBufferSource(){const s={playbackRate:new Param(),connect(){},disconnect(){this.disconnected=true;},start(...v){this.startArgs=v;},stop(...v){this.stopArgs=v;}};this.sources.push(s);return s;}
 createOscillator(){const o={frequency:new Param(),connect(target){this.destination=target;},disconnect(){this.disconnected=true;},start(at){this.startedAt=at;},stop(at){this.stoppedAt=at;this.stopCalls=(this.stopCalls??0)+1;}};this.oscillators.push(o);return o;}
 createGain(){const g={gain:new Param(),connect(){},disconnect(){}};this.gains.push(g);return g;}
 listeners=new Set(); addEventListener(_event,fn){this.listeners.add(fn);} removeEventListener(_event,fn){this.listeners.delete(fn);} async resume(){this.state='running';} async close(){this.state='closed';}
}
function fixture(){ const context=new Context();let now=1000; const club=new ClubAudio({createContext:()=>context,now:()=>now,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(128)}),loadBuffer:async track=>({duration:track.durationSeconds,sampleRate:32000,length:Math.round(track.durationSeconds*32000),numberOfChannels:2})});club.setTrack('arabic-nights',0,0);return {club,context,setNow:v=>{now=v;},now:()=>now}; }

test('round claims ordinary playback without resetting its epoch',async()=>{
 const {club,context}=fixture(); await club.unlock();
 try { assert.equal(typeof club.claimRoundAudio,'function');club.claimRoundAudio(true);const count=context.sources.length;club.resync(true);await tick();assert.equal(context.sources.length,count);assert.equal(club.getTiming().elapsedMs,1000);club.claimRoundAudio(false);await tick();assert.ok(context.sources.length>count); } finally {await club.dispose();}
});

test('fixed-rate round schedules once and judgments follow audible hardware time despite wall clock corrections',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock(); const dance=new DanceAudio(f.club,{now:f.now});
 try {dance.setRound({id:'round',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);await tick();const source=f.context.sources.at(-1);assert.deepEqual(source.startArgs,[14.95,0]);assert.equal(source.loop,false);assert.equal(source.playbackRate.value,1);assert.ok(Math.abs(dance.getElapsedMs()+5000)<.001);const n=f.context.sources.length;
 f.context.currentTime=15.2075;assert.ok(Math.abs(dance.getElapsedMs()-207.5)<.001);f.setNow(19000);dance.setRound({id:'round',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},900);f.club.setServerOffset(900);assert.equal(f.context.sources.length,n);assert.equal(source.playbackRate.events.length,0);assert.ok(Math.abs(dance.getElapsedMs()-207.5)<.001);assert.equal(dance.getStatus().ranked,true);
 assert.ok(f.context.gains.at(-1).gain.events.some(e=>e[0]==='ramp'&&e[1]===0));
 } finally {dance.dispose();await f.club.dispose();}
});

test('late join and muted/interrupted audio cannot rank; disposing stops round and restores ordinary timeline',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();f.setNow(8000);const dance=new DanceAudio(f.club,{now:f.now});
 try {dance.setRound({id:'late',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);await tick();const source=f.context.sources.at(-1);assert.ok(source.startArgs[1]>=2);assert.equal(dance.getStatus().ranked,false);assert.match(dance.getStatus().reason,/late/i);dance.dispose();assert.ok(source.stopArgs);await tick();assert.equal(f.context.sources.at(-1).loop,true);}finally{dance.dispose();await f.club.dispose();}
});

test('locked audio remains unavailable until existing master is gesture-unlocked',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'locked',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);assert.equal(dance.getStatus().ready,false);assert.equal(dance.getStatus().ranked,false);await f.club.unlock();dance.refresh();await tick();assert.equal(dance.getStatus().ready,true);f.club.setMuted(true);assert.equal(dance.getStatus().ranked,false);}finally{dance.dispose();await f.club.dispose();}
});

test('interrupted audio stays unranked and releases the room at the server deadline even if hardware clock freezes',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'interrupt',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);await tick();f.context.currentTime=17;f.context.state='suspended';dance.refresh();f.context.state='running';assert.equal(dance.getStatus().ranked,false);f.context.state='suspended';f.setNow(67000);dance.refresh();assert.equal(dance.getStatus().ready,false);assert.equal(dance.getElapsedMs(),null);}finally{dance.dispose();await f.club.dispose();}
});

test('ending and disposing during decode never restarts a stale round',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});let finish;f.club.loadRoundBuffer=()=>new Promise(resolve=>{finish=resolve;});try{dance.setRound({id:'pending',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);const count=f.context.sources.length;dance.dispose();finish({duration:100});await tick();assert.equal(f.context.sources.length,count+1);assert.equal(f.context.sources.at(-1).loop,true);}finally{dance.dispose();await f.club.dispose();}
});

test('successful completion retains final ranking eligibility while disabling input and restores ordinary playback',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'complete',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);await tick();f.context.currentTime=75;dance.refresh();assert.equal(dance.getStatus().ready,false);assert.equal(dance.getStatus().ranked,true);assert.equal(dance.getElapsedMs(),60000);await tick();assert.equal(f.context.sources.at(-1).loop,true);}finally{dance.dispose();await f.club.dispose();}
});


test('context suspension invalidates ranking immediately between polling ticks',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'event',startsAt:6000,endsAt:66000,trackId:'arabic-nights'},0);await tick();f.context.state='suspended';for(const listener of [...f.context.listeners])listener();f.context.state='running';assert.equal(dance.getStatus().ranked,false);dance.dispose();assert.equal(f.context.listeners.size,1);}finally{dance.dispose();await f.club.dispose();}
});

test('standalone round recording decodes through shared context without entering ordinary catalog or playlist',async()=>{
 const context=new Context();let fetched;context.decodeAudioData=async()=>({duration:51.12,sampleRate:32000,length:1635840,numberOfChannels:2});const club=new ClubAudio({createContext:()=>context,fetcher:async url=>{fetched=url;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(128)};}});
 try {await club.unlock();const track={id:'standalone-song',audioUrl:'/audio/dance-machine/song.mp3',durationSeconds:51.12,playbackGain:.78};const buffer=await club.loadRoundBuffer(track,new AbortController().signal);assert.equal(buffer.duration,51.12);assert.equal(fetched,track.audioUrl);assert.equal(club.getTiming(),null);assert.equal(context.sources.length,1);}finally{await club.dispose();}
});

test('new standalone song plays full measured duration once, preserving shared room song and clock',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const {DANCE_TRACK}=await import('../lib/dance-track.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});let requested;f.club.loadRoundBuffer=async track=>{requested=track;return {duration:DANCE_TRACK.durationSeconds};};try{dance.setRound({id:'new-song',trackId:DANCE_TRACK.id,startsAt:6000,endsAt:6000+DANCE_TRACK.durationMs},0);await tick();assert.equal(requested.audioUrl,DANCE_TRACK.audioUrl);assert.equal(dance.getStatus().ready,true);const source=f.context.sources.at(-1);assert.equal(source.loop,false);assert.equal(source.playbackRate.value,1);assert.ok(Math.abs(source.stopArgs[0]-(14.95+DANCE_TRACK.durationSeconds))<1e-8);assert.equal(f.club.getTiming().elapsedMs,1000);assert.equal(f.club.getTiming().durationMs, (await import('../lib/music-catalog.ts')).getTrack('arabic-nights').durationMs);assert.ok(f.context.gains.at(-1).gain.events.some(e=>e[0]==='ramp'&&e[1]===DANCE_TRACK.playbackGain));}finally{dance.dispose();await f.club.dispose();}
});

test('round scheduler accepts decoder sample rounding already accepted by recording validation',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const {DANCE_TRACK}=await import('../lib/dance-track.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});f.club.loadRoundBuffer=async()=>({duration:DANCE_TRACK.durationSeconds-1/32000,sampleRate:32000});try{dance.setRound({id:'rounded',trackId:DANCE_TRACK.id,startsAt:6000,endsAt:6000+DANCE_TRACK.durationMs},0);await tick();assert.equal(dance.getStatus().ready,true);assert.equal(dance.getStatus().ranked,true);}finally{dance.dispose();await f.club.dispose();}
});

test('round load failures emit bounded safe diagnostics and remain explicitly unavailable',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});f.club.loadRoundBuffer=async()=>{throw new Error('Decode failed https://example.test/secret?token=abc');};const warnings=[];const warn=console.warn;console.warn=(...args)=>warnings.push(args);try{dance.setRound({id:'failure',trackId:'arabic-nights',startsAt:6000,endsAt:66000},0);await tick();assert.equal(dance.getStatus().ready,false);assert.equal(warnings.length,1);assert.match(JSON.stringify(warnings),/Decode failed/);assert.doesNotMatch(JSON.stringify(warnings),/token=abc|example.test/);}finally{console.warn=warn;dance.dispose();await f.club.dispose();}
});

test('standalone preload fetches before gesture, decodes after unlock, and reuses bounded cache across rounds and normal track changes',async()=>{
 const context=new Context();let fetches=0,decodes=0;context.decodeAudioData=async()=>{decodes++;return {duration:51.12,sampleRate:32000,length:1635840,numberOfChannels:2};};const club=new ClubAudio({createContext:()=>context,loadBuffer:async track=>({duration:track.durationSeconds,sampleRate:32000,length:Math.round(track.durationSeconds*32000),numberOfChannels:2}),fetcher:async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(128)};}});const track={id:'preload-song',audioUrl:'/audio/song.mp3',durationSeconds:51.12,playbackGain:.8};
 try{assert.equal(typeof club.preloadRoundRecording,'function');assert.equal(await club.preloadRoundRecording(track),false);assert.equal(fetches,1);assert.equal(decodes,0);assert.equal(context.sources.length,0);await club.unlock();await tick();assert.equal(club.getRoundRecordingStatus(track).ready,true);assert.equal(decodes,1);club.setTrack('arabic-nights',0,0);await tick();club.claimRoundAudio(true);const one=await club.loadRoundBuffer(track,new AbortController().signal);club.claimRoundAudio(false);await tick();const two=await club.loadRoundBuffer(track,new AbortController().signal);assert.equal(one,two);assert.equal(fetches,1);assert.equal(decodes,1);}finally{await club.dispose();}
});

test('disposing cancels pending preload without starting output or retaining readiness',async()=>{
 const context=new Context();let signal;const club=new ClubAudio({createContext:()=>context,fetcher:async(_url,opts)=>{signal=opts.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));}});const track={id:'pending-preload',audioUrl:'/audio/pending.mp3',durationSeconds:51.12,playbackGain:.8};try{assert.equal(typeof club.preloadRoundRecording,'function');const pending=club.preloadRoundRecording(track);await tick();await club.dispose();assert.equal(signal.aborted,true);assert.equal(await pending,false);assert.equal(club.getRoundRecordingStatus(track).ready,false);assert.equal(context.sources.length,0);}finally{await club.dispose();}
});

test('concurrent preload calls share download/decode and preserve explicit mute without starting a song',async()=>{
 const context=new Context();let fetches=0,decodes=0;const originalDecode=context.decodeAudioData;context.decodeAudioData=async()=>{decodes++;return originalDecode();};const club=new ClubAudio({createContext:()=>context,fetcher:async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(128)};}});const track={id:'concurrent',audioUrl:'/audio/shared.mp3',durationSeconds:51.12,playbackGain:.8};try{club.setMuted(true);await club.unlock();const before=context.sources.length;const [a,b]=await Promise.all([club.preloadRoundRecording(track),club.preloadRoundRecording(track)]);assert.equal(a,true);assert.equal(b,true);assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(context.sources.length,before);assert.equal(club.getStatus().muted,true);}finally{await club.dispose();}
});

test('hung warmup settles after fifteen seconds and can be retried',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let fail=true;const context=new Context();const club=new ClubAudio({createContext:()=>context,fetcher:async()=>fail?new Promise(()=>{}):({ok:true,arrayBuffer:async()=>new ArrayBuffer(128)})});const track={id:'timeout',audioUrl:'/audio/timeout.mp3',durationSeconds:51.12,playbackGain:.8};const warn=console.warn;console.warn=()=>{};try{const pending=club.preloadRoundRecording(track);await tick();t.mock.timers.tick(15001);assert.equal(await pending,false);assert.equal(club.getRoundRecordingStatus(track).loading,false);assert.ok(club.getRoundRecordingStatus(track).error);fail=false;await club.unlock();assert.equal(await club.preloadRoundRecording(track),true);}finally{console.warn=warn;await club.dispose();t.mock.timers.reset();}
});

test('gesture-started preload waits only for context readiness and never for a blocked ordinary recording',async()=>{
 const context=new Context();context.state='suspended';let resume;context.resume=()=>new Promise(resolve=>{resume=()=>{context.state='running';for(const listener of [...context.listeners])listener();resolve();};});const club=new ClubAudio({createContext:()=>context,loadBuffer:async()=>new Promise(()=>{}),fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(128)})});const track={id:'gesture',audioUrl:'/audio/gesture.mp3',durationSeconds:51.12,playbackGain:.8};try{club.setTrack('arabic-nights',0,0);club.requestPlayback();let settled=false;const preparing=club.preloadRoundRecording(track).then(value=>{settled=true;return value;});await tick();assert.equal(settled,false,'preload must wait for the pending gesture context');resume();assert.equal(await preparing,true);assert.equal(club.getRoundRecordingStatus(track).ready,true);assert.equal(club.getStatus().loading,true,'ordinary recording is still pending independently');}finally{await club.dispose();}
});

test('dispose settles preload and clears its deadline even when a loader ignores abort',async()=>{
 const club=new ClubAudio({fetcher:async()=>new Promise(()=>{})});const track={id:'ignore-abort',audioUrl:'/audio/ignore.mp3',durationSeconds:51.12,playbackGain:.8};let settled=false;const pending=club.preloadRoundRecording(track).then(value=>{settled=true;return value;});await tick();await club.dispose();await tick();assert.equal(settled,true);assert.equal(await pending,false);
});


test('countdown schedules five soft ticks and a distinct GO on hardware clock once, through the shared mute gain',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();f.club.setMuted(true);const dance=new DanceAudio(f.club,{now:f.now});try{const round={id:'countdown',trackId:'arabic-nights',startsAt:6500,endsAt:66500};dance.setRound(round,0);await tick();assert.equal(f.context.oscillators.length,6);assert.deepEqual(f.context.oscillators.map(o=>o.startedAt),[10.45,11.45,12.45,13.45,14.45,15.45]);const [tickSound,,,,,go]=f.context.oscillators;assert.notEqual(tickSound.frequency.value,go.frequency.value);assert.ok(tickSound.destination.gain.events.some(e=>e[0]==='ramp'&&e[1]>0&&e[1]<=.13));assert.equal(f.context.gains[0].gain.value,0);dance.setRound(round,120);dance.refresh();assert.equal(f.context.oscillators.length,6);assert.equal(f.context.sources.at(-1).playbackRate.value,1);}finally{dance.dispose();assert.ok(f.context.oscillators.every(o=>o.disconnected));await f.club.dispose();}
});

test('countdown late joins skip past ticks and suspend cancels every cue without replay on resume',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();f.setNow(4200);const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'late-countdown',trackId:'arabic-nights',startsAt:6000,endsAt:66000},0);await tick();assert.equal(f.context.oscillators.length,2);assert.ok(f.context.oscillators.every(o=>o.startedAt>10));f.context.state='suspended';for(const listener of [...f.context.listeners])listener();assert.ok(f.context.oscillators.every(o=>o.disconnected&&o.stopCalls===2));f.context.state='running';dance.refresh();assert.equal(f.context.oscillators.length,2);}finally{dance.dispose();await f.club.dispose();}
});

test('changing rounds releases scheduled countdown nodes and a locked master never schedules cues',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();const dance=new DanceAudio(f.club,{now:f.now});try{dance.setRound({id:'locked-countdown',trackId:'arabic-nights',startsAt:6500,endsAt:66500},0);assert.equal(f.context.oscillators.length,0);await f.club.unlock();dance.refresh();await tick();const previous=[...f.context.oscillators];assert.equal(previous.length,6);dance.setRound({id:'replacement-countdown',trackId:'arabic-nights',startsAt:7500,endsAt:67500},0);assert.ok(previous.every(o=>o.disconnected&&o.stopCalls===2));assert.equal(f.context.oscillators.length,12);dance.setRound(null);assert.ok(f.context.oscillators.every(o=>o.disconnected));}finally{dance.dispose();await f.club.dispose();}
});

test('round countdown gently ducks ordinary BGM into a quiet bed until the song transition, then restores with a slow fade',async()=>{
 const f=fixture();await f.club.unlock();try{const ordinary=f.context.sources.at(-1),gain=f.context.gains.at(-1);f.club.claimRoundAudio(true,6500,0);assert.ok(gain.gain.events.some(e=>e[0]==='ramp'&&e[1]>0&&e[2]>=10.8),'duck gradually instead of abrupt stop');assert.ok(Math.abs(ordinary.stopArgs[0]-15.63)<1e-8);assert.ok(gain.gain.events.some(e=>e[0]==='ramp'&&e[1]===0&&Math.abs(e[2]-15.63)<1e-8));assert.equal(ordinary.disconnected,undefined,'keep ordinary recording connected during countdown');const eventCount=gain.gain.events.length;f.club.claimRoundAudio(true,6500,100);assert.equal(gain.gain.events.length,eventCount);f.context.currentTime=70;f.setNow(61000);f.club.claimRoundAudio(false);await tick();const restored=f.context.sources.at(-1),restoredGain=f.context.gains.at(-1);assert.notEqual(restored,ordinary);assert.ok(restoredGain.gain.events.some(e=>e[0]==='ramp'&&e[1]>0&&e[2]>=70.6));assert.equal(f.club.getTiming().elapsedMs,61000);assert.equal(ordinary.disconnected,true);}finally{await f.club.dispose();}
});

test('short countdown still reserves a release fade and disposal stops its ordinary bed',async()=>{
 const f=fixture();await f.club.unlock();const source=f.context.sources.at(-1),gain=f.context.gains.at(-1);try{f.club.claimRoundAudio(true,1500,0);const end=source.stopArgs[0];const transition=gain.gain.events.filter(e=>e[0]==='ramp'&&e[2]>=10.1);assert.ok(transition.some(e=>e[1]>0&&e[2]<end-.1));await f.club.dispose();assert.equal(source.disconnected,true);}finally{await f.club.dispose();}
});

test('audible countdown doubles cue amplitude with a longer soft tick and unchanged master volume',async()=>{
 const {DanceAudio}=await import('../lib/dance-audio.ts');const f=fixture();await f.club.unlock();const dance=new DanceAudio(f.club,{now:f.now});try{const master=f.context.gains[0].gain.value;dance.setRound({id:'audible-countdown',trackId:'arabic-nights',startsAt:6500,endsAt:66500},0);await tick();const [cue,,,,,go]=f.context.oscillators;assert.ok(cue.destination.gain.events.some(e=>e[0]==='ramp'&&e[1]===.09&&Math.abs(e[2]-cue.startedAt-.006)<1e-8));assert.ok(go.destination.gain.events.some(e=>e[0]==='ramp'&&e[1]===.13));assert.ok(Math.abs(cue.stoppedAt-cue.startedAt-.085)<1e-8);assert.ok(Math.abs(go.stoppedAt-go.startedAt-.145)<1e-8);assert.equal(f.context.gains[0].gain.value,master);assert.equal(cue.type,'sine');assert.equal(cue.frequency.value,523.25);assert.equal(go.frequency.value,784);}finally{dance.dispose();await f.club.dispose();}
});
