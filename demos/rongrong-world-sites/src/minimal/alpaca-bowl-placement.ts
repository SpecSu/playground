import {alpacaBowlTurnClearance} from './alpaca-bowl-safety.ts';
import type {AnimalMotionProfile} from './hunyuan-alpaca-contract.ts';
import {BOWL_WATER_GEOMETRY} from './bowl-water-geometry.ts';
/** Source-bound fixed center policy. Linear interpolation is an algorithm to
 * sample, not a mathematical assertion of safety between source witnesses. */
export function alpacaBowlPlacement(profile:AnimalMotionProfile,scale:number):{reach:number;minimum:number;maximum:number}|null{
 const policy=profile.bowlStanding;if(!policy||!Number.isFinite(scale)||scale<Math.max(.75,policy.samples[0].scale)||scale>policy.samples.at(-1)!.scale)return null;
 let i=1;while(i<policy.samples.length-1&&scale>policy.samples[i].scale)i++;
 const a=policy.samples[i-1],b=policy.samples[i],u=(scale-a.scale)/(b.scale-a.scale),center=a.centerDistance+(b.centerDistance-a.centerDistance)*u,reach=center-BOWL_WATER_GEOMETRY.radius*.95,slack=policy.localSlack*scale;
 const minimum=Math.max(reach-slack,alpacaBowlTurnClearance(profile,scale)-BOWL_WATER_GEOMETRY.radius*.95),maximum=reach+slack;
 if(minimum>maximum)return null;
 return {reach:Math.max(reach,minimum),minimum,maximum};
}
