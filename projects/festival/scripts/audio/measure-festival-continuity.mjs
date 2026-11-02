/** Silent numerical QA of the real FestivalAudio source/rate timeline and MP3.
 * No browser, audio device, synthetic replacement, or audible playback.
 * node --experimental-strip-types scripts/audio/measure-festival-continuity.mjs [baseline-module.ts]
 */
import '../../tests/room-loader.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audioHarness } from '../../tests/helpers/festival-audio-harness.mjs';
import { CEREMONY_RECORDING } from '../../lib/festival-audio.ts';
const { FestivalClock } = await import('../../lib/festival-motion.ts');
const Player = process.argv[2] ? (await import(pathToFileURL(process.argv[2]).href)).FestivalAudio : undefined;
const asset = new URL(`../../public${CEREMONY_RECORDING.url}`, import.meta.url), sampleRate = 44100, channels = 2;
const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(asset), '-f', 'f32le', '-ar', String(sampleRate), '-ac', String(channels), 'pipe:1'], {maxBuffer: 64 * 1024 * 1024});
if (decoded.status !== 0) throw Error(String(decoded.stderr));
const pcm = new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset, decoded.stdout.byteOffset + decoded.stdout.byteLength));
async function measure({jitter, stall}) {
 let local = 0;
 const clock = new FestivalClock(() => local, 300000); clock.accept(300000, 0, 0);
 const h = audioHarness({getNow: () => clock.now(), Player});
 h.audio.requestFromGesture(); await h.flush(); await h.tick();
 let poll = 0, nextPoll = 850;
 const offsets = [350, 350, 350, -350, -350, -350, 250, -250];
 for (local = 60; local <= 25000; local += 60) {
  if (stall && local === 12000) local += 1200;
  h.context.currentTime = local / 1000;
  if (jitter && local >= nextPoll) {const offset = offsets[poll++ % offsets.length]; clock.accept(300000 + local + offset - 400, local - 800, local); nextPoll = local + 850;}
  await h.tick();
 }
 const sources = h.music().map(source => ({
  start: source.startArgs[0], offset: source.startArgs[1],
  end: source.disconnectedAt ?? source.stopArgs?.[0] ?? 25,
  rates: source.playbackRate.events.filter(event => event[0] === 'set').map(event => ({time: event[2], rate: event[1]})),
 }));
 const rates = sources.flatMap(source => source.rates.map(event => event.rate));
 let nonFiniteSamples = 0, peak = 0, total = 0, missingFrames = 0, maxSampleStep = 0;
 let previous = 0, sourceIndex = 0, rateIndex = 0, source = sources[0], position = source.offset, rate = 1, previousTime = source.start;
 const blocks = [];
 let blockSum = 0, blockFrames = 0;
 for (let frame = 0; frame < 25 * sampleRate; frame++) {
  const time = frame / sampleRate;
  while (sourceIndex + 1 < sources.length && time >= sources[sourceIndex + 1].start) {
   source = sources[++sourceIndex]; position = source.offset; rateIndex = 0; rate = 1; previousTime = source.start;
  }
  const live = time >= source.start && time < source.end;
  let value = 0;
  if (live) {
   while (rateIndex < source.rates.length && source.rates[rateIndex].time <= time) {
    const event = source.rates[rateIndex++], eventTime = Math.max(previousTime, event.time);
    position += Math.max(0, eventTime - previousTime) * rate; previousTime = eventTime; rate = event.rate;
   }
   position += Math.max(0, time - previousTime) * rate; previousTime = time;
   const sample = position * sampleRate, lo = Math.floor(sample), fraction = sample - lo;
   const raw = pcm[lo * channels] * (1 - fraction) + pcm[(lo + 1) * channels] * fraction;
   const fade = Math.min(1, (time - source.start) / .09);
   // Fixed burn/master gains isolate transport discontinuities. Actual final
   // graph compressor and effects are excluded; this is not an audio audition.
   value = raw * fade * CEREMONY_RECORDING.playbackGain * .92 * .52;
  } else if (time >= sources[0].start) missingFrames++;
  if (!Number.isFinite(value)) nonFiniteSamples++;
  peak = Math.max(peak, Math.abs(value)); total += value * value;
  maxSampleStep = Math.max(maxSampleStep, Math.abs(value - previous)); previous = value;
  blockSum += value * value; blockFrames++;
  if (blockFrames === sampleRate / 10) {blocks.push(Math.sqrt(blockSum / blockFrames)); blockFrames = 0; blockSum = 0;}
 }
 const result = {durationSeconds: 25, jitter, mainThreadStallMs: stall ? 1200 : 0, musicSourceStarts: sources.length,
  sourceRestarts: sources.length - 1, recordingGapMsAfterInitialStart: missingFrames / sampleRate * 1000,
  rateRange: [Math.min(1, ...rates), Math.max(1, ...rates)], nonFiniteSamples, samplePeak: peak,
  rms: Math.sqrt(total / (25 * sampleRate)), maximumAdjacentSampleStep: maxSampleStep,
  minimum100MsRmsAfterInitialFade: Math.min(...blocks.slice(2)), decodedAssets: h.context.decodes, fetchedAssets: h.loads.length};
 h.audio.dispose(); return result;
}
const report = {audiblePlayback: false, browserUsed: false, method: 'FFmpeg float32 MP3 decode; numerical reconstruction from actual FestivalAudio start, stop and playback-rate commands under simulated 850 ms shared-clock polling. Linear PCM interpolation and exact source fade-in; fixed burn/master gain. Compressor and effects excluded.',
 assetSha256: createHash('sha256').update(readFileSync(asset)).digest('hex'), sampleRate, channels, cases: []};
for (const settings of [{jitter: true, stall: false}, {jitter: false, stall: true}, {jitter: true, stall: true}]) report.cases.push(await measure(settings));
const directory = new URL('../../outputs/', import.meta.url); mkdirSync(directory, {recursive: true});
writeFileSync(new URL(process.argv[2] ? 'festival-audio-continuity-before.json' : 'festival-audio-continuity-v0.1.9.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
