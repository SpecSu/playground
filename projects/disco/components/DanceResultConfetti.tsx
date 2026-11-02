'use client';
import { useEffect, useRef } from 'react';
import { DANCE_CONFETTI_COUNT,DANCE_CONFETTI_DURATION_MS,DanceResultCelebration,danceConfettiParticle } from '@/lib/dance-result-celebration';
/** Above the opaque DOM board. No retained WebGL scene or continuous animation loop. */
export default function DanceResultConfetti({roundId,visible,celebration}:{roundId:string;visible:boolean;celebration:DanceResultCelebration}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const surface=canvas.current;if(!surface)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!celebration.sample(roundId,true,visible&&document.visibilityState==='visible',motion.matches))return;
    const ctx=surface.getContext('2d');if(!ctx)return;
    const width=surface.clientWidth||390,height=surface.clientHeight||758,dpr=Math.min(2,window.devicePixelRatio||1);
    surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);ctx.scale(dpr,dpr);
    let frame=0,stopped=false;const started=performance.now();
    const particle={x:0,y:0,width:0,height:0,angle:0,opacity:0,color:''};
    const stop=()=>{stopped=true;cancelAnimationFrame(frame);ctx.clearRect(0,0,width,height);};
    const draw=(time:number)=>{
      if(stopped)return;const elapsed=time-started;ctx.clearRect(0,0,width,height);
      if(elapsed>=DANCE_CONFETTI_DURATION_MS){stop();return;}
      for(let i=0;i<DANCE_CONFETTI_COUNT;i++){
        danceConfettiParticle(i,elapsed,width,height,particle);ctx.save();ctx.translate(particle.x,particle.y);ctx.rotate(particle.angle);ctx.globalAlpha=particle.opacity;ctx.fillStyle=particle.color;ctx.fillRect(-particle.width/2,-particle.height/2,particle.width,particle.height);ctx.restore();
      }
      frame=requestAnimationFrame(draw);
    };
    const hide=()=>{if(document.visibilityState!=='visible')stop();};const reduce=()=>{if(motion.matches)stop();};
    document.addEventListener('visibilitychange',hide);motion.addEventListener('change',reduce);frame=requestAnimationFrame(draw);
    return()=>{stop();document.removeEventListener('visibilitychange',hide);motion.removeEventListener('change',reduce);};
  },[roundId,visible,celebration]);
  return <canvas ref={canvas} className="dance-result-confetti" aria-hidden="true"/>;
}
