import type {AnimalMotionProfile} from './hunyuan-alpaca-contract.ts';
/** Source-bound preferred stance, not a changed anatomical lip datum or a
 * guarantee of continuous reach. Actual shore/feet must still accept it. */
export function alpacaPondPlacement(profile:AnimalMotionProfile,scale:number):{reach:number;minimum:number;maximum:number}|null{
 const policy=profile.pondStanding;if(!policy||!Number.isFinite(scale)||scale<policy.samples[0].scale||scale>policy.samples.at(-1)!.scale)return null;
 let i=1;while(i<policy.samples.length-1&&scale>policy.samples[i].scale)i++;
 const a=policy.samples[i-1],b=policy.samples[i],u=(scale-a.scale)/(b.scale-a.scale),reach=(a.reach+(b.reach-a.reach)*u)*scale,slack=policy.localSlack*scale;
 return {reach,minimum:reach-slack,maximum:reach+slack};
}
