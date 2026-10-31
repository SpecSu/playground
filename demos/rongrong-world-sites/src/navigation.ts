import type {FarmEvent,Reaction} from './model.ts';
export type Point={x:number;z:number};
export const HOMES:Point[]=[{x:-3,z:.3},{x:.2,z:-2},{x:3,z:.2}];
export function responseAt(event:FarmEvent|undefined,id:string,now:number){
 const reaction=event?.reactions.find(r=>r.animalId===id);
 if(!event||!reaction||now<event.at||now-event.at>8500)return;
 const elapsed=now-event.at-reaction.delayMs;
 return {reaction,elapsed,age:now-event.at,micro:elapsed<0};
}
export function keepInMeadow(point:Point):Point{return{x:Math.max(-6,Math.min(6,point.x)),z:Math.max(-4.5,Math.min(5,point.z))};}
export function sheepDestination(home:Point,player:Point,reaction:Reaction|undefined,index:number,time:number):Point{
 if(!reaction)return{x:home.x+Math.sin(time*.23+index*2)*.65,z:home.z+Math.cos(time*.19+index)*.55};
 const angle=(index-1)*.8;
 return keepInMeadow({x:player.x+Math.sin(angle)*reaction.distance,z:player.z-Math.cos(angle)*reaction.distance});
}
export function sheepAnimationTime(r:ReturnType<typeof responseAt>,time:number):number{return r?(r.micro?r.age/1000:Math.max(0,r.elapsed)/1000):time;}
