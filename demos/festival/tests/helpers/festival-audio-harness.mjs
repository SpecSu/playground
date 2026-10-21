import { FestivalAudio } from '../../lib/festival-audio.ts';

export const audioRound = {index: 1, startsAt: 0, burnAt: 300000, ashesAt: 335000, endsAt: 345000};
export class AudioParamDouble {
 value = 0; events = [];
 cancelScheduledValues(time) {this.events.push(['cancel', time]);}
 setValueAtTime(value, time) {this.value = value; this.events.push(['set', value, time]);}
 setTargetAtTime(value, time, duration) {this.value = value; this.events.push(['target', value, time, duration]);}
 linearRampToValueAtTime(value, time) {this.value = value; this.events.push(['linear', value, time]);}
 exponentialRampToValueAtTime(value, time) {this.value = value; this.events.push(['exp', value, time]);}
}
class AudioNodeDouble {
 connections = []; stops = []; disconnectedAt = null;
 constructor(context) {this.context = context;}
 connect(node) {this.connections.push(node); return node;}
 disconnect() {this.connections = []; this.disconnectedAt = this.context.currentTime;}
 start(...args) {this.startArgs = args;}
 stop(...args) {this.stopArgs = args; this.stops.push(args);}
}
export class AudioContextDouble {
 state = 'suspended'; currentTime = 0; sampleRate = 44100; nodes = []; decodes = 0;
 destination = new AudioNodeDouble(this);
 node(fields = {}) {const node = Object.assign(new AudioNodeDouble(this), fields); this.nodes.push(node); return node;}
 createGain() {return this.node({gain: new AudioParamDouble()});}
 createBiquadFilter() {return this.node({frequency: new AudioParamDouble(), Q: new AudioParamDouble()});}
 createOscillator() {return this.node({frequency: new AudioParamDouble(), detune: new AudioParamDouble()});}
 createBufferSource() {const playbackRate = new AudioParamDouble(); playbackRate.value = 1; return this.node({playbackRate});}
 createDynamicsCompressor() {return this.node(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new AudioParamDouble()])));}
 createBuffer(channels, length, sampleRate) {const data = Array.from({length: channels}, () => new Float32Array(length)); return {length, sampleRate, duration: length / sampleRate, getChannelData: index => data[index]};}
 async decodeAudioData(bytes) {this.decodes++; const asset = new Uint8Array(bytes)[0]; return {duration: asset === 3 ? 64 : 10, asset};}
 async resume() {this.state = 'running'; this.onstatechange?.();}
 async suspend() {this.state = 'suspended'; this.onstatechange?.();}
 async close() {this.state = 'closed';}
}
export function audioHarness({now = 300000, getNow, round = audioRound, Player = FestivalAudio} = {}) {
 const context = new AudioContextDouble(), timers = new Map(), loads = [];
 let timerId = 0, serverNow = now, currentRound = round;
 const audio = new Player({
  createContext: () => context,
  getFrame: () => ({now: getNow ? getNow() : serverNow, round: currentRound, builders: [], listener: {x: 0, z: 0}, selfId: ''}),
  storage: {getItem: () => null, setItem() {}},
  loadAsset: async url => {loads.push(url); return Uint8Array.of(url.includes('arabic') ? 3 : url.includes('fire') ? 1 : 2).buffer;},
  schedule: callback => {timers.set(++timerId, callback); return timerId;}, cancel: id => timers.delete(id),
 });
 const flush = async () => {for (let i = 0; i < 25; i++) await Promise.resolve();};
 const tick = async () => {for (const [id, callback] of [...timers]) {timers.delete(id); callback();} await flush();};
 return {audio, context, timers, loads, flush, tick, setNow: value => {serverNow = value;}, setRound: value => {currentRound = value;},
  music: () => context.nodes.filter(node => node.buffer?.asset === 3 && node.startArgs),
  recordings: () => context.nodes.filter(node => node.buffer?.asset && node.startArgs),
 };
}
