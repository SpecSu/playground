import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as audio from '../lib/festival-audio.ts';
const round = {index:1, startsAt:0, burnAt:300000, ashesAt:335000, endsAt:345000};

test('Arabic Nights is the only burn score and keeps its original 120 BPM beat grid', () => {
 assert.equal(audio.CEREMONY_BPM,120);
 assert.equal(audio.CEREMONY_RECORDING.title,'Arabic Nights');
 assert.equal(audio.CEREMONY_RECORDING.ignitionOffsetSeconds,16.2575);
 assert.equal(audio.CEREMONY_BUILDUP_MS,9000);
 assert.deepEqual(audio.musicEvents(round,round.burnAt,round.ashesAt),[], 'no procedural drums, bass or joyful synth lead is layered over the recording');
 assert.ok(audio.musicEvents(round,round.burnAt-9000,round.burnAt).every(e=>e.layer==='day'));
 assert.equal(audio.synthesizeCeremonyVoice,undefined,'retired procedural ceremony renderer is removed');
});
test('recording transport prerolls once and seeks exactly to shared time, including scheduling latency',()=>{
 assert.equal(typeof audio.ceremonyRecordingPlan,'function');
 assert.equal(audio.ceremonyRecordingPlan(round,290000),null);
 const preroll=audio.ceremonyRecordingPlan(round,290900);
 assert.equal(preroll.startAt,291000);assert.equal(preroll.offsetSeconds,7.2575);
 const first=audio.ceremonyRecordingPlan(round,300000),late=audio.ceremonyRecordingPlan(round,312345);
 assert.equal(first.startAt,300015);assert.ok(Math.abs(first.offsetSeconds-16.2725)<1e-9);
 assert.ok(Math.abs(late.offsetSeconds-first.offsetSeconds-12.345)<1e-9);
 assert.equal(first.stopAt,335000);assert.equal(late.stopAt,335000);
 assert.equal(audio.ceremonyRecordingPlan(round,335000),null);
 assert.equal(audio.ceremonyRecordingPlan(round,310000,10),null,'never wrap or replay a too-short asset');
 assert.equal(audio.ceremonyRecordingPlan(round,NaN),null);
});
test('the 44-second build and burn fit a contiguous section without a loop or source-edge fade',()=>{
 const first=audio.ceremonyRecordingPlan(round,291000),last=audio.ceremonyRecordingPlan(round,334950);
 assert.ok(first.offsetSeconds>0);assert.ok(last.offsetSeconds<64);
 assert.ok(Math.abs(last.offsetSeconds-first.offsetSeconds-43.95)<1e-9);
 let previous=audio.ceremonyMix(round,291000);
 for(let now=291010;now<300000;now+=10){const mix=audio.ceremonyMix(round,now);assert.ok(mix.burn>=previous.burn&&mix.day<=previous.day);previous=mix;}
 const peak=audio.ceremonyMix(round,310000);assert.ok(peak.burn>peak.fire*3&&peak.burn>peak.crowd*3);
 assert.ok(audio.ceremonyMix(round,334990).burn<.001);
});
test('the bundled recording preserves the source hash, attribution, license and modification notice',()=>{
 const bytes=readFileSync(new URL('../public/audio/festival/arabic-nights-128beat.mp3',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'a464bce9092ead1b34c7cebb2f46c836d4b03e4d348cb23fbcde66b665413f4e');
 const credits=readFileSync(new URL('../public/audio/festival/CREDITS.txt',import.meta.url),'utf8');
 for(const term of ['Arabic Nights','Nemphirex','https://soundcloud.com/nemphirex/nemphirex-arabic-nights','https://creativecommons.org/licenses/by/3.0/','No EQ, pitch or tempo changes','16.2575'])assert.ok(credits.includes(term),term);
 const metadata=JSON.parse(readFileSync(new URL('../public/audio/festival/music-assets.json',import.meta.url),'utf8'));
 assert.equal(metadata.tracks.length,1);assert.equal(metadata.tracks[0].audioSha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(metadata.tracks[0].analysis.auditioned,false);
});

test('actual recording and the full 44-second mix have finite samples, continuous energy and generous headroom',()=>{
 const report=JSON.parse(readFileSync(new URL('../public/audio/festival/MEASUREMENTS.json',import.meta.url),'utf8'));
 const asset=report.bundled.find(a=>a.filename==='arabic-nights-128beat.mp3'),mix=report.ceremonyRecording;
 assert.equal(asset.durationSeconds,64);assert.equal(asset.channels,2);assert.equal(asset.sampleRate,44100);assert.equal(asset.nonFiniteSamples,0);
 assert.ok(asset.samplePeak>.5&&asset.samplePeak<.6);assert.ok(Math.abs(asset.dcOffset)<.001);
 assert.equal(mix.audiblePlayback,false);assert.equal(mix.loop,false);assert.equal(mix.playbackDurationSeconds,44);
 assert.equal(mix.playbackStartSeconds,scoreStart());assert.equal(mix.playbackEndSeconds,scoreStart()+44);
 assert.equal(mix.oneSecondRms.length,44);assert.ok(mix.minimumOneSecondRms>.04,'no dead passage in the selected section');
 assert.ok(mix.renderedMusicPeakBeforeCompressor>.2&&mix.renderedMusicPeakBeforeCompressor<.3);
 assert.ok(mix.conservativeMixedPeakBoundBeforeCompressor<.51,'even aligned music and effects peaks retain over 5 dB headroom');
 assert.ok(mix.finalSampleAmplitude<1e-8,'the score reaches silence at ashes');
});
function scoreStart(){return audio.CEREMONY_RECORDING.ignitionOffsetSeconds-audio.CEREMONY_BUILDUP_MS/1000;}
