import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PERFORMANCE_TRACKS,createPerformancePlaylist} from '../src/performance-playlist.js';import {RhythmGame} from '../src/rhythm.js';
const meta=()=>JSON.parse(fs.readFileSync(new URL('../public/assets/audio/uptownfunk-gameplay.metadata.json',import.meta.url)));
test('new supplied full song carries measured115BPM chart at100–120notes/minute through EOF',()=>{
 const s=meta();assert.equal(s.title,'UptownFunk');assert.equal(s.sourceFilename,'UptownFunk.mp3');assert.equal(s.sourceTrimStart,0);assert(s.duration>80&&s.duration<80.1);assert.equal(s.durationPolicy,'user-approved-full-source');assert(s.bpm>114.9&&s.bpm<115.1);assert(s.chart.length/s.duration*60>=100&&s.chart.length/s.duration*60<=120);assert(s.chart[0].time>2);assert(s.chart.at(-1).time>s.duration-1.6&&s.chart.at(-1).time<s.duration-.7);assert(s.audioUrl.endsWith('?v=full-v14'));assert(PERFORMANCE_TRACKS.find(t=>t.id==='uptownfunk').metadataUrl.endsWith('?v=full-v14'));
 const groups=new Map();for(const n of s.chart){assert(n.lane>=0&&n.lane<4);groups.set(n.time,(groups.get(n.time)||0)+1)}assert(Math.max(...groups.values())<=2);for(let lane=0;lane<4;lane++){const notes=s.chart.filter(n=>n.lane===lane);assert(notes.length>=25);for(let i=1;i<notes.length;i++)assert(notes[i].time-notes[i-1].time>=.16)}
});
test('insertion at3 keeps last-played IDs and manual/automatic four-song rotation correct',()=>{
 const ids=['popstars','fantastic','uptownfunk','killlove'];assert.deepEqual(PERFORMANCE_TRACKS.map(t=>t.id),ids);
 for(const old of ['popstars','fantastic','killlove'])assert.equal(createPerformancePlaylist(undefined,{getItem:()=>old,setItem(){}}).peek().id,ids[(ids.indexOf(old)+1)%4]);
 const p=createPerformancePlaylist(undefined,null);for(let i=0;i<8;i++){assert.equal(p.peek().id,ids[i%4]);assert(p.commitStart(ids[i%4],i))}assert.equal(p.selectNext().id,'fantastic');assert.equal(p.selectNext().id,'uptownfunk');assert.equal(p.selectNext().id,'killlove');assert.equal(p.selectNext().id,'popstars');
});
test('full new track continues after60s and scores all notes before exactly one EOF result',()=>{
 const s=meta();let time=0,ended=0;const g=new RhythmGame({getTime:()=>time,onEnd:()=>ended++});g.start(s.chart,{duration:s.duration});time=1;g.pause();time=3;g.resume();for(const n of s.chart){time=n.time+2;assert.equal(g.hit(n.lane)?.rating,'perfect');if(time>60)assert.equal(g.state.status,'playing')}time=s.duration+2-.01;g.update();assert.equal(ended,0);time=s.duration+2;g.update();g.update();assert.equal(ended,1);assert.equal(g.state.score,s.chart.length*1000);
});
