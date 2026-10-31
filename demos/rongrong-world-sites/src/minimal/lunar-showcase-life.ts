import {animalScale,animalGrowthStage,ANIMAL_ADULT_MS,type AnimalGrowthProfile} from './animal-growth.ts';
import type {LunarShowcaseId} from './lunar-showcase-contract.ts';
import {lunarPath,lunarSegmentSafe,type LunarFlatPoint,type LunarClearance} from './lunar-showcase-path.ts';
/** Locomotion only: authored stride is unchanged; legs and translation speed up together. */
export const LUNAR_LOCOMOTION_RATE=1.6;
const boundedDelta=(dt:number)=>Number.isFinite(dt)&&dt>0?Math.min(.25,dt):0;
export class LunarSampleGrowth{
 private ageMs:number;private bonus=0;private cooldown=0;readonly maximumScale:number;private growth:AnimalGrowthProfile;
 constructor(id:LunarShowcaseId){const giant=id==='kunkun-chicken'||id==='floral-vest-person';this.maximumScale=id==='floral-vest-person'?3:giant?2:1.2;this.ageMs=giant?ANIMAL_ADULT_MS:id==='red-scarf-person'?45000:id==='pink-sheep'?70000:0;this.growth={version:1,scales:[.65,.9,this.maximumScale]};}
 snapshot(){const a={bornAt:0,size:'normal' as const,growth:this.growth,growthAgeMs:this.ageMs};return Object.freeze({ageMs:this.ageMs,pendingBonusMs:this.bonus,stage:animalGrowthStage(a,this.ageMs),scale:animalScale(a,this.ageMs),maximumScale:this.maximumScale,canCare:this.ageMs<ANIMAL_ADULT_MS&&this.cooldown<=0});}
 care(){if(this.ageMs>=ANIMAL_ADULT_MS||this.cooldown>0)return false;this.bonus=Math.min(16000,this.bonus+8000);this.cooldown=6;return true;}
 advance(dt:number,suspended=false){if(suspended)return;const delta=boundedDelta(dt);this.cooldown=Math.max(0,this.cooldown-delta);const bonus=Math.min(this.bonus,delta*2000);this.bonus-=bonus;this.ageMs=Math.min(ANIMAL_ADULT_MS,this.ageMs+delta*1000+bonus);}
}
export type LunarLifeContext={position:LunarFlatPoint;heading:number;scale:number;walk?:{duration:number;strideMeters:number};actionActive:boolean;safe:LunarClearance;suspended?:boolean;court?:{position:LunarFlatPoint;heading:number;actions:readonly string[]}};
export type LunarLifeFrame={position:LunarFlatPoint;heading:number;travelled:number;turnRadians:number;walking:boolean;playAction?:string};
type Phase='rest'|'plan'|'walk'|'settle'|'action';
/** Local active-time life. Manual actions interrupt, not permanently consume, life.
 * No wall clock, global randomness, canonical animals, storage or transport. */
export class LunarLife{
 private phase:Phase='rest';private wait:number;private route:LunarFlatPoint[]=[];private desired:string|undefined;private goal:LunarFlatPoint|undefined;private goalHeading:number|undefined;private cycle=0;private seed=2166136261;private speed=0;private planFailures=0;
 private actions:readonly string[];
 constructor(id:string,index:number,actions:readonly string[]){this.actions=[...actions];for(const char of id){this.seed^=char.charCodeAt(0);this.seed=Math.imul(this.seed,16777619);}this.wait=1.1+index*.73;}
 private random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return (this.seed>>>0)/4294967296;}
 snapshot(){return Object.freeze({phase:this.phase,wait:this.wait,cycle:this.cycle,route:this.route.map(p=>({...p})),desired:this.desired});}
 rest(seconds=5){this.phase='rest';this.wait=seconds;this.route=[];this.goal=undefined;this.desired=undefined;this.goalHeading=undefined;this.speed=0;}
 request(action:string,position?:LunarFlatPoint,heading?:number){this.desired=action;this.goal=position?{...position}:undefined;this.goalHeading=heading;this.route=[];this.phase=position?'plan':'settle';this.wait=position?0:.2;this.speed=0;this.planFailures=0;}
 private choose(ctx:LunarLifeContext){
  const cycle=this.cycle++;this.desired=this.actions[cycle%this.actions.length];this.goalHeading=undefined;
  if(ctx.court?.actions.includes(this.desired)){this.goal={...ctx.court.position};this.goalHeading=ctx.court.heading;}
  else{this.goal=undefined;for(let i=0;(cycle%2===1||!!ctx.court&&this.desired==='celebrate')&&i<16;i++){const angle=this.random()*Math.PI*2,distance=.7+this.random()*.7,p={x:ctx.position.x+Math.sin(angle)*distance,z:ctx.position.z+Math.cos(angle)*distance};if(ctx.safe(p)&&lunarPath(ctx.position,p,ctx.safe).length){this.goal=p;break;}}}
  this.phase=this.goal&&ctx.walk?'plan':'settle';this.wait=.35;this.planFailures=0;
 }
 advance(dt:number,ctx:LunarLifeContext):LunarLifeFrame{
  const result:LunarLifeFrame={position:{...ctx.position},heading:ctx.heading,travelled:0,turnRadians:0,walking:false},delta=boundedDelta(dt);if(!delta||ctx.suspended)return result;
  if(ctx.actionActive){this.phase='action';return result;}
  if(this.phase==='action'){this.rest(1.4+this.random()*1.2);return result;}
  if(this.phase==='rest'){this.wait=Math.max(0,this.wait-delta);if(this.wait===0)this.choose(ctx);return result;}
  if(this.phase==='plan'){
   if(this.wait>0){this.wait-=delta;return result;}
   if(!ctx.walk||!this.goal){this.phase='settle';this.wait=.35;return result;}
   this.route=lunarPath(ctx.position,this.goal,ctx.safe);
   if(!this.route.length){this.wait=1.1+this.random();if(++this.planFailures>=3){this.rest(2+this.random());}return result;}
   this.phase='walk';this.speed=0;
  }
  if(this.phase==='walk'){
   const goal=this.route[0];if(!goal){this.phase='settle';this.wait=.35;this.speed=0;return result;}
   const dx=goal.x-ctx.position.x,dz=goal.z-ctx.position.z,distance=Math.hypot(dx,dz),wanted=distance>1e-6?Math.atan2(dx,dz):this.goalHeading??ctx.heading,diff=Math.atan2(Math.sin(wanted-ctx.heading),Math.cos(wanted-ctx.heading)),turn=Math.max(-1.7*LUNAR_LOCOMOTION_RATE*delta,Math.min(1.7*LUNAR_LOCOMOTION_RATE*delta,diff));result.heading=ctx.heading+turn;result.turnRadians=turn;result.walking=true;
   if(distance<1e-6){this.route.shift();return result;}
   if(Math.abs(diff)> .001){this.speed=0;return result;}
   const maxSpeed=ctx.walk!.strideMeters*ctx.scale/ctx.walk!.duration*LUNAR_LOCOMOTION_RATE,acceleration=maxSpeed/(.35/LUNAR_LOCOMOTION_RATE);this.speed=Math.min(maxSpeed,this.speed+acceleration*delta,Math.sqrt(2*acceleration*distance));const step=Math.min(distance,this.speed*delta),next={x:ctx.position.x+dx/distance*step,z:ctx.position.z+dz/distance*step};
   if(!lunarSegmentSafe(ctx.position,next,ctx.safe)){this.phase='plan';this.wait=1.1+this.random();this.route=[];this.speed=0;result.walking=false;return result;}
   result.position=next;result.travelled=step;return result;
  }
  if(this.phase==='settle'){
   if(this.goalHeading!==undefined){const diff=Math.atan2(Math.sin(this.goalHeading-ctx.heading),Math.cos(this.goalHeading-ctx.heading));if(Math.abs(diff)>.001){const turn=Math.max(-1.7*LUNAR_LOCOMOTION_RATE*delta,Math.min(1.7*LUNAR_LOCOMOTION_RATE*delta,diff));result.heading+=turn;result.turnRadians=turn;result.walking=!!ctx.walk;return result;}}
   this.wait=Math.max(0,this.wait-delta);if(this.wait===0&&this.desired){result.playAction=this.desired;this.phase='action';}else if(!this.desired)this.rest();
  }
  return result;
 }
}
