import test from 'node:test';import assert from 'node:assert/strict';
import {FarmAudio} from '../src/v5/estate-audio.ts';
import {enterVisitorAudio} from '../src/minimal/visit-audio.ts';
import {installAudioDevice,TestAudioContext} from './helpers/audio-device.ts';

test('visitor routing owns no device or timers and reuses exactly one original-score scheduler',async t=>{
 const restore=installAudioDevice(),scheduled=new Map<number,()=>void>();let next=0;
 t.mock.method(globalThis,'setInterval',((callback:()=>void)=>{const id=++next;scheduled.set(id,callback);return id;}) as unknown as typeof setInterval);
 t.mock.method(globalThis,'clearInterval',((id:number)=>{scheduled.delete(id);}) as unknown as typeof clearInterval);
 const audio=new FarmAudio();
 try{
  audio.setVolume(.28);audio.setEnabled(false);enterVisitorAudio(audio,'lunar');audio.setVisible(true);await audio.unlock();
  assert.equal(TestAudioContext.instances.length,0);assert.equal(audio.status,'muted');assert.equal(scheduled.size,0);
  audio.setEnabled(true);assert.equal(TestAudioContext.instances.length,0,'enabling is silent until a gesture');await audio.unlock();
  const context=TestAudioContext.instances[0],resumes=context.resumes;assert.equal(scheduled.size,1);assert.ok(context.liveSources.length>0);
  for(const id of ['forest','lunar','glacier','lunar','oasis','forest']){
   enterVisitorAudio(audio,id);assert.equal(scheduled.size,0);assert.equal(context.liveSources.length,0);
   audio.setVisible(true);assert.equal(scheduled.size,1);assert.equal(TestAudioContext.instances.length,1);assert.equal(context.resumes,resumes);assert.equal(context.nodes[0].gain.value,.7*.28);
   const notes=context.sources.filter(node=>node.kind==='oscillator').length;context.advance(1);for(const tick of scheduled.values())tick();assert.ok(context.liveOscillators.length>0);assert.ok(context.sources.filter(node=>node.kind==='oscillator').length>notes,'the score advances, not only the ambience loops');
  }
  audio.setVisible(false);assert.equal(scheduled.size,0);assert.equal(context.liveSources.length,0);
  audio.setEnabled(false);audio.setVisible(true);assert.equal(scheduled.size,0);assert.equal(audio.status,'muted');
  audio.dispose();audio.dispose();assert.equal(scheduled.size,0);assert.equal(context.closed,1);assert.equal(context.onstatechange,null);assert.ok(context.nodes.every(node=>node.disconnected));
  enterVisitorAudio(audio,'lunar');audio.setEnabled(true);audio.setVisible(true);await audio.unlock();assert.equal(scheduled.size,0);assert.equal(context.liveSources.length,0);assert.equal(TestAudioContext.instances.length,1);
 }finally{audio.dispose();restore();}
});
