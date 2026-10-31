import {animalScale,ANIMAL_STAGE_MS,LEGACY_ADULT_MS} from './animal-growth.ts';
import type {MinimalAnimal,Species} from './model.ts';
import {isLegacySpecies,type LegacySpecies} from './species.ts';
import {domainMainResource,domainSelectedAnimal,type AnimalResourceContext} from './animal-resource-context.ts';
import type {AnimalMotionProfile} from './hunyuan-alpaca-contract.ts';

/** Foot contact envelopes include2–3mm local slack around actual skin at y≤.02.
 * Full feet envelopes are retained for planted poses. Pure authored distances: both model travel and GLB phase consume this contract. */
export const ANIMAL_MOTION_PROFILES:Record<LegacySpecies,AnimalMotionProfile>={
 cow:{stride:.58,muzzleReach:.72,cyclesPerSecond:1,feet:{side:0.33,front:0.367,back:0.429},walkFeet:{side:0.33,front:0.559,back:0.62},walkContactFeet:{side:0.288,front:0.508,back:0.57},reachAdjustment:{back:.14,forward:0.09}},
 sheep:{stride:.48,muzzleReach:.72,cyclesPerSecond:1,feet:{side:0.329,front:0.363,back:0.426},walkFeet:{side:0.329,front:0.526,back:0.588},walkContactFeet:{side:0.303,front:0.495,back:0.558},reachAdjustment:{back:.14,forward:0.06}},
 pig:{stride:.34,muzzleReach:.79,cyclesPerSecond:1.2,feet:{side:0.37,front:0.403,back:0.456},walkFeet:{side:0.37,front:0.519,back:0.571},walkContactFeet:{side:0.34,front:0.485,back:0.538},reachAdjustment:{back:.14,forward:0.055}},
 bunny:{stride:.42,muzzleReach:.72,cyclesPerSecond:1.7,feet:{side:0.312,front:0.35,back:0.33},walkFeet:{side:0.312,front:0.448,back:0.43},walkContactFeet:{side:0.28,front:0.418,back:0.365},reachAdjustment:{back:.14,forward:0.03}},
 duck:{stride:.32,muzzleReach:.49,cyclesPerSecond:1.5,feet:{side:0.218,front:0.185,back:0.01},walkFeet:{side:0.218,front:0.285,back:0.093},walkContactFeet:{side:0.215,front:0.281,back:0.085},reachAdjustment:{back:.14,forward:0.055,pondForward:.13}},
};
export function animalMotionProfile(species:Species,inspection?:AnimalResourceContext|null):AnimalMotionProfile|null{const resource=domainMainResource(species==='penguin'?'penguin':'alpaca',inspection);return isLegacySpecies(species)?domainSelectedAnimal(species,inspection)?.profile.motion??ANIMAL_MOTION_PROFILES[species]:resource?.profile.motion??null;}
export const ANIMAL_WORLD_UNITS_PER_CELL=2;
export const ANIMAL_VISIBLE_CORRECTION=1.10;
type MovingAnimal=Pick<MinimalAnimal,'id'|'bornAt'|'species'|'size'|'growth'|'growthAgeMs'>;
/** Already-saved immutable identity, never array order or an egg's random stream. */
export function stableAnimalPace(a:Pick<MovingAnimal,'id'|'bornAt'>):number{
 const seed=`animal-pace-v1:${a.id}:${a.bornAt}`;let hash=2166136261;
 for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619);}
 hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;
 return .95+(hash>>>0)/4294967296*.10;
}
export function animalWorldSpeed(a:MovingAnimal,now:number,minimumScale=0,inspection?:AnimalResourceContext|null):number{
 const profile=animalMotionProfile(a.species,inspection);return profile?profile.stride*profile.cyclesPerSecond*stableAnimalPace(a)*Math.max(minimumScale,animalScale(a,now)):0;
}
/** Exact integration of the existing piecewise-cubic growth curve. Splitting at
 * stage boundaries and the persisted age floor makes Simpson integration exact,
 * including wall-clock rollback, without duplicating the growth interpolation.
 * The caller bounds catch-up duration; this function has no simulation tick cap. */
export function animalGridTravel(a:MovingAnimal,from:number,to:number,inspection?:AnimalResourceContext|null):number{
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return 0;
 const duration=a.growth?ANIMAL_STAGE_MS:LEGACY_ADULT_MS;
 const boundaries=[from,to,a.bornAt,a.bornAt+(a.growthAgeMs??0),a.bornAt+duration,...(a.growth?[a.bornAt+duration*2]:[])].filter(t=>t>=from&&t<=to).sort((x,y)=>x-y);
 let scaleSeconds=0;
 for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],end=boundaries[i];scaleSeconds+=(end-start)/6000*(animalScale(a,start)+4*animalScale(a,(start+end)/2)+animalScale(a,end));}
 const profile=animalMotionProfile(a.species,inspection);return profile?scaleSeconds*profile.stride*profile.cyclesPerSecond*stableAnimalPace(a)/ANIMAL_WORLD_UNITS_PER_CELL:0;
}
