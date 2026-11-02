import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PERFORMANCE_TRACKS} from '../src/performance-playlist.js';
import {RhythmGame} from '../src/rhythm.js';import {createDanceFlow} from '../src/dance-flow.js';
const clips=[{name:'dance_01',duration:23.166666},{name:'dance_03',duration:12.791667},{name:'dance_05',duration:2.875}];
for(const {id} of PERFORMANCE_TRACKS)for(const scenario of ['perfect','interrupted'])test(id+' actual chart: '+scenario+' keeps judgement authoritative and flow lifecycle independent',()=>{
 const song=JSON.parse(fs.readFileSync(new URL(`../public/assets/audio/${id}-gameplay.metadata.json`,import.meta.url))),flow=createDanceFlow(clips);let audio=0,end=0,index=0,hits=0,misses=0,started=false,sawRest=false,recovered=false;
 const game=new RhythmGame({getTime:()=>audio,onJudge:j=>{flow.hit(j.lane,j.rating,{kind:'note',noteTime:j.note.time});if(j.rating==='perfect')hits++;else misses++},onEnd:()=>{end++;flow.setMode('results')}});
 flow.setBPM(song.bpm);flow.setMode('playing');game.start(song.chart,{duration:song.duration});
 for(let frame=0;frame<=Math.ceil((song.duration+.1)*60);frame++){
  audio=frame/60;
  while(index<song.chart.length&&song.chart[index].time<=audio){const n=song.chart[index++];if(scenario==='perfect'||n.time<8||n.time>15)game.hit(n.lane)}
  game.update();flow.update(1/60,audio);const state=flow.getState();
  if(audio<song.chart[0].time)assert.equal(state.active,false,'intro awaits a scored note');
  if(state.active){if(sawRest)recovered=true;started=true}if(started&&audio>11&&audio<15&&!state.active)sawRest=true;
  if(frame===Math.round(6*60)){game.pause();flow.setMode('paused');const frozen=flow.getState();for(let j=0;j<30;j++)flow.update(1/60,audio);assert.deepEqual(flow.getState(),frozen);game.resume();flow.setMode('playing')}
 }
 assert.equal(end,1);assert.equal(game.state.judged,song.chart.length);assert.equal(game.state.score,hits*1000);assert.equal(game.state.counts.miss,misses);assert.equal(flow.getState().active,false);
 if(scenario==='perfect'){assert.equal(misses,0);assert.equal(hits,song.chart.length)}else{assert(misses>0);assert(sawRest);assert(recovered)}
 flow.setMode('playing');assert.equal(flow.getState().successes,0);assert.equal(flow.getState().active,false,'new round requires fresh success');
});
