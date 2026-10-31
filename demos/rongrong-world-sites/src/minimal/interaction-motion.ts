import {staticObstacleSegmentClear} from './creative-obstacles.ts';
import {alpacaBowlSegmentSafe} from './alpaca-bowl-safety.ts';
import {animalScale,ANIMAL_ADULT_MS} from './animal-growth.ts';
import {animalMotionProfile,ANIMAL_WORLD_UNITS_PER_CELL} from './animal-motion.ts';
import type {MinimalAnimal,MinimalState,Point,Species} from './model.ts';
import {isAnimalRuntimeActive,isLegacySpecies,type LegacySpecies} from './species.ts';
import {domainMainResource,domainSelectedAnimal,type AnimalResourceContext} from './animal-resource-context.ts';

/** Circumscribed horizontal skin envelopes measured over the actual idle clips,
 * rounded outwards by >=.02 local units. Rotation cannot invalidate a circle.
 * These are local-action clearances, never global navigation obstacles. */
export const ANIMAL_INTERACTION_RADII:Record<LegacySpecies,number>={cow:.80,sheep:.76,pig:.90,bunny:.57,duck:.59};
/** Actual idle LX skin radius=.2671 at farm scale; retain a small safety margin. */
export const LX_INTERACTION_RADIUS=.30;
export const INTERACTION_CLEARANCE=.06;
const TRANSFER_GROWTH_LOOKAHEAD=650;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const finitePoint=(p:Point)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isInteger(p.x)&&Number.isInteger(p.z);
export type LandingChecks={free:(p:Point)=>boolean;ground:(p:Point)=>boolean};
const landingScale=(animal:MinimalAnimal,now:number)=>Math.max(animalScale(animal,now),animalScale(animal,now+TRANSFER_GROWTH_LOOKAHEAD));
export function animalInteractionRadius(animal:MinimalAnimal,now:number,inspection?:AnimalResourceContext|null):number{const resource=domainMainResource(animal.species==='penguin'?'penguin':'alpaca',inspection),radius=isLegacySpecies(animal.species)?domainSelectedAnimal(animal.species,inspection)?.profile.interactionRadius??ANIMAL_INTERACTION_RADII[animal.species]:resource?.profile.interactionRadius;return radius===undefined?Infinity:radius*landingScale(animal,now);}
/** A heading-independent planted-foot circle must not cross a blocked tile box.
 * Checking exact circle/box intersection avoids gaps between sampled directions. */
function dryFootprint(at:Point,animal:MinimalAnimal,now:number,ground:LandingChecks['ground'],inspection?:AnimalResourceContext|null):boolean{
 const profile=animalMotionProfile(animal.species,inspection);if(!profile)return false;const feet=profile.feet;
 const radius=(Math.hypot(feet.side,Math.max(feet.front,feet.back))*landingScale(animal,now)+.015)/ANIMAL_WORLD_UNITS_PER_CELL;
 for(let x=Math.floor(at.x-radius-.5);x<=Math.ceil(at.x+radius+.5);x++)for(let z=Math.floor(at.z-radius-.5);z<=Math.ceil(at.z+radius+.5);z++){
  const dx=Math.max(0,Math.abs(at.x-x)-.5),dz=Math.max(0,Math.abs(at.z-z)-.5);
  if(Math.hypot(dx,dz)<=radius+1e-8&&!ground({x,z}))return false;
 }
 return true;
}
export function isSafeAnimalLanding(state:MinimalState,animal:MinimalAnimal,now:number,at:Point,checks:LandingChecks,inspection?:AnimalResourceContext|null):boolean{
 return distance(state.player,at)<=1.6&&isSafeAnimalArrival(state,animal,now,at,checks,inspection);
}
/** Server transfer placement shares physical clearances, without a local pickup radius. */
export function isSafeAnimalArrival(state:MinimalState,animal:MinimalAnimal,now:number,at:Point,checks:LandingChecks,inspection?:AnimalResourceContext|null):boolean{
 if(!finitePoint(at)||!checks.free(at)||!staticObstacleSegmentClear(state,at,at,animalInteractionRadius(animal,now,inspection)/ANIMAL_WORLD_UNITS_PER_CELL))return false;
 // Reserve the individual's eventual size here: growing beside the high bowl
 // must not turn a legal hatch/landing into an inescapable turning collision.
 if(animal.species==='alpaca'){const profile=animalMotionProfile('alpaca',inspection);if(!profile||!alpacaBowlSegmentSafe(profile,animalScale(animal,now+ANIMAL_ADULT_MS),at,at))return false;}
 // Unknown dimensions do not become a global collider, but their saved cell is
 // reserved here too: server arrivals do not necessarily supply animal-aware free().
 if(state.animals.some(other=>other.id!==animal.id&&!isAnimalRuntimeActive(other,inspection)&&Math.round(other.position.x)===at.x&&Math.round(other.position.z)===at.z))return false;
 const radius=animalInteractionRadius(animal,now,inspection),world=ANIMAL_WORLD_UNITS_PER_CELL;
 if(distance(state.player,at)*world<radius+LX_INTERACTION_RADIUS+INTERACTION_CLEARANCE)return false;
 if(state.animals.some(other=>other.id!==animal.id&&isAnimalRuntimeActive(other,inspection)&&distance(other.position,at)*world<radius+animalInteractionRadius(other,now,inspection)+INTERACTION_CLEARANCE))return false;
 if(state.eggs.some(egg=>egg.location==='ground'&&egg.position&&distance(egg.position,at)*world<radius+.30+INTERACTION_CLEARANCE))return false;
 return dryFootprint(at,animal,now,checks.ground,inspection);
}
/** Explicit requests are validated, never silently redirected. Defaults choose
 * one stable nearby endpoint before the model commits ownership exactly once. */
export function resolveAnimalLanding(state:MinimalState,animal:MinimalAnimal,now:number,checks:LandingChecks,requested?:Point,inspection?:AnimalResourceContext|null):Point|null{
 if(requested!==undefined)return isSafeAnimalLanding(state,animal,now,requested,checks,inspection)?{...requested}:null;
 const candidates=state.tiles.filter(tile=>distance(state.player,tile)<=1.6).sort((a,b)=>distance(state.player,a)-distance(state.player,b)||a.z-b.z||a.x-b.x);
 const result=candidates.find(at=>isSafeAnimalLanding(state,animal,now,at,checks,inspection));return result?{x:result.x,z:result.z}:null;
}

export const GREETING_DURATION_MS=900;
export type GreetingPose={weight:number;wave:number;reactProgress:number;reacting:boolean};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const smooth=(value:number)=>{const t=clamp(value);return t*t*(3-2*t);};
/** A greeting is not a truncated feeding action. The authored animal clip
 * completes by600ms, holds briefly, then has200ms to blend back to idle. */
export function greetingPoseAt(elapsedMs:number):GreetingPose{
 const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0,p=clamp(elapsed/GREETING_DURATION_MS);
 return {weight:smooth(p/.28)*(1-smooth((p-.68)/.32)),wave:Math.sin(clamp((p-.28)/.40)*Math.PI*2),reactProgress:clamp(elapsed/600),reacting:elapsed<700};
}

export const ANIMAL_TRANSFER_DURATION_MS=650;
/** One nanosecond of endpoint tolerance absorbs accumulated frame-clock roundoff,
 * not a visible duration change. Both lifecycle and path use the same progress. */
export function animalTransferProgress(elapsedMs:number):number{
 const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
 return elapsed>=ANIMAL_TRANSFER_DURATION_MS-1e-6?1:clamp(elapsed/ANIMAL_TRANSFER_DURATION_MS);
}
/** Largest measured support-to-lowest-skin distance over grounded/carried poses,
 * padded outwards. Keep unfolding feet above LX during horizontal transfer. */
export const ANIMAL_TRANSFER_UNDERSIDE:Record<LegacySpecies,number>={cow:.38,sheep:.40,pig:.24,bunny:.15,duck:.17};
export function animalTransferUnderside(species:Species,inspection?:AnimalResourceContext|null):number|null{const resource=domainMainResource(species==='penguin'?'penguin':'alpaca',inspection);return isLegacySpecies(species)?domainSelectedAnimal(species,inspection)?.profile.transferUnderside??ANIMAL_TRANSFER_UNDERSIDE[species]:resource?.profile.transferUnderside??null;}
export type InteractionPoint={x:number;y:number;z:number};
/** Move vertically clear, translate above the avatar, then lower at the endpoint.
 * The support anchor is the path datum; no bone length or root scale changes. */
export function animalTransferPoint(from:InteractionPoint,to:InteractionPoint,clearanceY:number,elapsedMs:number):InteractionPoint{
 const p=animalTransferProgress(elapsedMs),height=Math.max(clearanceY,from.y,to.y);
 if(p<=.30){const t=smooth(p/.30);return {x:from.x,y:from.y+(height-from.y)*t,z:from.z};}
 if(p<.76){const t=smooth((p-.30)/.46);return {x:from.x+(to.x-from.x)*t,y:height,z:from.z+(to.z-from.z)*t};}
 const t=smooth((p-.76)/.24);return {x:to.x,y:height+(to.y-height)*t,z:to.z};
}
