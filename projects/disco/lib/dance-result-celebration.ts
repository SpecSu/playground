/** Fishing's epic macaron celebration, projected directly over the DOM result board. */
export const DANCE_CONFETTI_COLORS = ['#ff9baa','#ffe5a3','#a8d8ff'] as const;
export const DANCE_CONFETTI_COUNT = 54;
export const DANCE_CONFETTI_DURATION_MS = 2600;
export class DanceResultCelebration {
  private readonly seen = new Set<string>();
  sample(roundId: string, ready: boolean, visible: boolean, reducedMotion: boolean): boolean {
    if (!ready || this.seen.has(roundId)) return false;
    this.seen.add(roundId);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
    return visible && !reducedMotion;
  }
}
// Same 9×8 permutation, dimensions, stagger and sway as fishing-confetti.ts.
const seeds = Array.from({length:DANCE_CONFETTI_COUNT},(_,i)=>{
  const cell=i*37%72,u=(i*.61803398875)%1,v=(i*.41421356237)%1;
  return {x:-.88+(cell%9)*.22+(u-.5)*.07,y:-.78+Math.floor(cell/9)*.33+(v-.5)*.26,u,v,spin:(i*1.731)%6.28,speed:.64+u*.16,delay:(i%6)*28};
});
export type DanceConfettiParticle = {x:number;y:number;width:number;height:number;angle:number;opacity:number;color:string};
export function danceConfettiParticle(index:number,elapsed:number,width:number,height:number,out:DanceConfettiParticle={x:0,y:0,width:0,height:0,angle:0,opacity:0,color:''}):DanceConfettiParticle {
  const seed=seeds[index%seeds.length],age=Math.max(0,elapsed-seed.delay),phase=age*.0018+seed.spin,progress=elapsed/DANCE_CONFETTI_DURATION_MS;
  out.x=(1+seed.x+Math.sin(phase)*.028)*width/2;
  out.y=(1-seed.y+age/DANCE_CONFETTI_DURATION_MS*seed.speed)*height/2;
  const entrance=Math.min(1,age/120);
  out.width=(3.6+seed.u*1.2)*entrance*Math.cos(Math.sin(phase*.8)*.5);
  out.height=(8+seed.v*3)*entrance*Math.cos(Math.sin(phase*1.7)*.4);
  out.angle=seed.spin+Math.sin(phase)*.7;
  out.opacity=progress>=1?0:.96*Math.min(1,Math.max(0,elapsed)/140)*Math.min(1,(1-progress)/.25);
  out.color=DANCE_CONFETTI_COLORS[index%DANCE_CONFETTI_COLORS.length];
  return out;
}
