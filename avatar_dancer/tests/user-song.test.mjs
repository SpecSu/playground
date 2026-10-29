import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PERFORMANCE_TRACKS} from '../src/performance-playlist.js';
import {RhythmGame} from '../src/rhythm.js';
const metadataPath=new URL('../public/assets/audio/popstars-gameplay.metadata.json',import.meta.url);
test('user supplied recording has a fitted chart with entrance, phrases and a playable tail',()=>{
 const song=JSON.parse(fs.readFileSync(metadataPath));assert.equal(song.title,'POPSTARS');assert(song.bpm>169&&song.bpm<171);assert(song.duration>58&&song.duration<60);assert.equal(song.sourceTrimStart,0);assert(song.chart.length>=100&&song.chart.length<=120);assert(song.chart[0].time>2.7&&song.chart[0].time<3);assert(song.chart.at(-1).time<song.duration-.8);assert(song.chart.at(-1).time>song.duration-3);assert.equal(new Set(song.chart.map(n=>n.lane)).size,4);
 const seen=new Set(),groups=new Map();for(const n of song.chart){assert(Number.isFinite(n.time)&&n.lane>=0&&n.lane<=3);const key=`${n.time}:${n.lane}`;assert(!seen.has(key));seen.add(key);groups.set(n.time,(groups.get(n.time)||0)+1)}assert(Math.max(...groups.values())<=2);assert([...groups.values()].filter(n=>n===2).length<=4);
 for(let lane=0;lane<4;lane++){const notes=song.chart.filter(n=>n.lane===lane);for(let i=1;i<notes.length;i++)assert(notes[i].time-notes[i-1].time>=.16)}
});
test('authored chart scores every note and ends once after a pause/resume',()=>{
 const song=JSON.parse(fs.readFileSync(metadataPath));let time=0,ends=0;const game=new RhythmGame({getTime:()=>time,onEnd:()=>ends++});game.start(song.chart,{duration:song.duration});time=1;game.pause();time=3;game.resume();for(const n of song.chart){time=n.time+2;assert.equal(game.hit(n.lane)?.rating,'perfect')}time=song.duration+2;game.update();game.update();assert.equal(ends,1);assert.equal(game.state.counts.perfect,song.chart.length);assert.equal(game.state.counts.miss,0);
});

test('only explicitly approved full-source tracks may exceed60s and retain its expanded chart',()=>{
 for(const {id} of PERFORMANCE_TRACKS){const song=JSON.parse(fs.readFileSync(new URL(`../public/assets/audio/${id}-gameplay.metadata.json`,import.meta.url)));if(id==='killlove'){assert(song.duration>74&&song.duration<75);assert.equal(song.durationPolicy,'user-approved-full-source-exception');assert(song.chart.length>=145&&song.chart.length<=155)}else if(id==='uptownfunk'){assert(song.duration>80&&song.duration<81);assert.equal(song.durationPolicy,'user-approved-full-source');assert(song.chart.length/song.duration*60>=100&&song.chart.length/song.duration*60<=120);}else{assert(song.duration<=60);assert(song.chart.length>=100&&song.chart.length<=120);}assert(song.chart.at(-1).time<song.duration-.7);if(id==='fantastic'){assert.equal(song.sourceTrimStart,0);assert(song.bpm>129&&song.bpm<131);}}
});

test('initial main song metadata matches the current authored POPSTARS asset',()=>{
 const song=JSON.parse(fs.readFileSync(metadataPath)),source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');const initial=source.match(/metadata=(\{[^}]+\})/)[1];
 assert(initial.includes(`title:'${song.title}'`));for(const field of ['bpm','duration','offset'])assert.equal(Number(initial.match(new RegExp(field+':([\\d.]+)'))[1]),song[field],field+' initial metadata must not retain the old cut');
});
