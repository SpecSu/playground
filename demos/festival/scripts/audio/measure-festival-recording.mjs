/** Silent numerical measurement only; never opens an audio device or browser.
 * Run: node --experimental-strip-types scripts/audio/measure-festival-recording.mjs
 * Requires FFmpeg. Refreshes the bundled asset report, preserving effect provenance. */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CEREMONY_RECORDING, CEREMONY_BUILDUP_MS, ceremonyMix} from '../../lib/festival-audio.ts';
const root=new URL('../../',import.meta.url),rate=44100,channels=2;
const round={index:1,startsAt:0,burnAt:300000,ashesAt:335000,endsAt:345000};
const assetUrl=new URL(`public${CEREMONY_RECORDING.url}`,root),bytes=readFileSync(assetUrl);
const decoded=spawnSync('ffmpeg',['-v','error','-i',fileURLToPath(assetUrl),'-f','f32le','-ar',String(rate),'-ac',String(channels),'pipe:1'],{maxBuffer:64*1024*1024});
if(decoded.status!==0)throw Error(`FFmpeg decode failed: ${decoded.stderr}`);
const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
function measure(samples){let peak=0,total=0,mean=0,nonFinite=0;for(const value of samples){if(!Number.isFinite(value)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(value));total+=value*value;mean+=value;}return{samplePeak:peak,rms:Math.sqrt(total/samples.length),dcOffset:mean/samples.length,nonFiniteSamples:nonFinite};}
const reportUrl=new URL('public/audio/festival/MEASUREMENTS.json',root),report=JSON.parse(readFileSync(reportUrl,'utf8'));
const asset={filename:CEREMONY_RECORDING.url.split('/').at(-1),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,channels,sampleRate:rate,durationSeconds:pcm.length/channels/rate,...measure(pcm)};
report.bundled=[...report.bundled.filter(item=>item.filename!==asset.filename),asset];
const begin=round.burnAt-CEREMONY_BUILDUP_MS,seconds=(round.ashesAt-begin)/1000,start=CEREMONY_RECORDING.ignitionOffsetSeconds-CEREMONY_BUILDUP_MS/1000;
const excerpt=pcm.subarray(Math.round(start*rate)*channels,Math.round((start+seconds)*rate)*channels),render=new Float64Array(excerpt.length);
for(let frame=0;frame<excerpt.length/channels;frame++){
 const gain=ceremonyMix(round,begin+frame/rate*1000).burn*CEREMONY_RECORDING.playbackGain*report.masterGain;
 for(let channel=0;channel<channels;channel++)render[frame*channels+channel]=excerpt[frame*channels+channel]*gain;
}
const oneSecondRms=Array.from({length:seconds},(_,second)=>measure(excerpt.subarray(second*rate*channels,(second+1)*rate*channels)).rms);
const fire=report.bundled.find(item=>item.filename==='fire-crackle.mp3'),crowd=report.bundled.find(item=>item.filename==='crowd-cheer.mp3');
report.ceremonyRecording={title:CEREMONY_RECORDING.title,audiblePlayback:false,method:'FFmpeg float32 decode and numerical waveform measurements of the unchanged bundled MP3. Render uses ideal shared-time envelopes, excluding browser gain smoothing and output compressor. No browser or audible playback; sample peaks are not inter-sample true peaks.',ignitionOffsetSeconds:CEREMONY_RECORDING.ignitionOffsetSeconds,playbackStartSeconds:start,playbackEndSeconds:start+seconds,playbackDurationSeconds:seconds,loop:false,oneSecondRms,minimumOneSecondRms:Math.min(...oneSecondRms),maximumOneSecondRms:Math.max(...oneSecondRms),renderedMusicPeakBeforeCompressor:measure(render).samplePeak,renderedBurnRmsBeforeCompressor:measure(render.subarray(9*rate*channels,41*rate*channels)).rms,finalSampleAmplitude:Math.max(...render.subarray(-channels).map(Math.abs)),measuredUtcDate:new Date().toISOString().slice(0,10),conservativeMixedPeakBoundBeforeCompressor:report.masterGain*(asset.samplePeak*CEREMONY_RECORDING.playbackGain*.92+fire.samplePeak*.26+crowd.samplePeak*.28)};
writeFileSync(reportUrl,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({asset,ceremonyRecording:{...report.ceremonyRecording,oneSecondRms:undefined}},null,2));
