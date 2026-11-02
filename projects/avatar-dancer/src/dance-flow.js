// Rhythm maintains a continuous dance phrase; arrows never select/restart poses.
// This module owns no score, combo or judgement windows.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t)};
export function createDanceFlow(clips){
 const phrases=clips.map((clip,index)=>({index,name:clip.name,duration:clip.duration,beats:Math.max(4,Math.round(clip.duration*128/120)*2)})).filter(c=>Number.isFinite(c.duration)&&c.duration>.1&&!/idle|relax|wait|standing/i.test(c.name));
 let mode='lobby',pausedFrom='lobby',bpm=128,now=0,lastAudioTime=null,phrase=0,clipTime=0,phraseSerial=0,transitionAge=Infinity;
 let hitQueued=false,hitStartsFlow=false,reactionStart=-Infinity;
 let started=false,lastHit=-Infinity,deadline=-Infinity,pendingMiss=null,lastMiss=-Infinity,missStreak=0,dipUntil=-Infinity,quality=1,energy=0,successes=0,lane=0;
 const grace=()=>Math.max(1.1,180/bpm),release=.85;
 const weight=()=>started?1-smooth((now-deadline)/release):0;
 const current=()=>phrases[phrase];
 const rate=()=>current()?clamp(current().duration/(current().beats*60/bpm),.8,1.4):1;
 function reset(){reactionStart=-Infinity;hitQueued=false;hitStartsFlow=false;now=0;lastAudioTime=null;phrase=0;clipTime=0;phraseSerial=0;transitionAge=Infinity;started=false;lastHit=-Infinity;deadline=-Infinity;pendingMiss=null;lastMiss=-Infinity;missStreak=0;dipUntil=-Infinity;quality=1;energy=0;successes=0;}
 function hit(nextLane,rating='perfect',detail={}){
  if(mode!=='playing'||!Number.isInteger(nextLane)||nextLane<0||nextLane>3||!phrases.length)return false;
  if(rating==='perfect'||rating==='good'){
   hitStartsFlow=hitStartsFlow||!started||weight()===0;hitQueued=true;started=true;lastHit=now;deadline=now+grace();pendingMiss=null;missStreak=0;dipUntil=-Infinity;quality=rating==='perfect'?1:.88;successes++;lane=nextLane;return true;
  }
  // Batch a low-FPS catch-up/chord into one response. Delaying also lets a valid
  // chord member win, regardless of callback order within the same frame.
  if(rating==='miss'&&started&&!pendingMiss&&now-lastMiss>.18)pendingMiss={due:now+.10,noteTime:detail.noteTime};
  return false;
 }
 function update(delta,audioTime){
  if(mode!=='playing')return getState();
  const dt=clamp(Number.isFinite(delta)?delta:0,0,.08);
  let elapsed=dt;
  if(Number.isFinite(audioTime)){
   if(lastAudioTime!==null&&audioTime>=lastAudioTime)elapsed=audioTime-lastAudioTime;
   lastAudioTime=audioTime;
  }
  now+=elapsed;
  const animationElapsed=hitStartsFlow?dt:elapsed;
  if(hitQueued){lastHit=now;deadline=now+grace();hitQueued=false;hitStartsFlow=false;}
  if(pendingMiss&&now>=pendingMiss.due){
   if(now-lastHit>.12&&weight()>0){missStreak++;lastMiss=now;dipUntil=now+.42;if(now-reactionStart>2.4)reactionStart=now;if(missStreak>=3)deadline=Math.min(deadline,now+.08);}
   pendingMiss=null;
  }
  const w=weight(),target=w>0?quality*(now<dipUntil?.55:1)*w:0;
  energy+=(target-energy)*(1-Math.exp(-elapsed*7));if(Math.abs(energy-target)<.0001)energy=target;
  if(w>0&&current()){
   clipTime+=animationElapsed*rate()*(.72+.28*energy)*Math.max(.2,w);
   transitionAge+=animationElapsed;
   while(clipTime>=current().duration){clipTime-=current().duration;phrase=(phrase+1)%phrases.length;phraseSerial++;transitionAge=0;}
  }
  return getState();
 }
 function getState(){const w=weight(),active=mode==='playing'&&w>0;return {mode,now,state:mode==='paused'?'paused':!active?'ready':w<.999?'releasing':now<dipUntil?'dip':'flowing',active,weight:active?w:0,hesitation:active&&now>=reactionStart&&now<reactionStart+.55?Math.sin(Math.PI*(now-reactionStart)/.55)**2*w:0,energy,clipIndex:current()?.index??-1,clip:current()?.name??null,clipTime,phraseSerial,transition:smooth(transitionAge/Math.min(.5,60/bpm)),rate:rate(),restAge:started?Math.max(0,now-deadline-release):Infinity,missStreak,successes,lane};}
 return {hit,update,getState,setBPM(value){if(Number.isFinite(value))bpm=clamp(value,40,240)},setMode(value){const previous=mode;mode=value;if(value==='paused'){pausedFrom=previous;return}if(value==='playing'){if(previous!=='paused'||pausedFrom!=='playing')reset();else lastAudioTime=null;}else{started=false;pendingMiss=null;deadline=-Infinity;}},reset};
}
