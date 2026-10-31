import type {AnimalSize} from './model.ts';

export type AnimalGrowthStage='baby'|'juvenile'|'adult';
/** Immutable individual potential. Chosen once in the egg, not by the render loop. */
export type AnimalGrowthProfile={version:1;scales:[number,number,number]};
type GrowingAnimal={bornAt:number;size:AnimalSize;growth?:AnimalGrowthProfile;growthAgeMs?:number;growthBonusMs?:number};
export const ANIMAL_STAGE_MS=60_000;
export const ANIMAL_ADULT_MS=2*ANIMAL_STAGE_MS;
export const LEGACY_ADULT_MS=60_000;
export const ANIMAL_SCALE_BOUNDS={min:.6,max:2.2} as const;

export function validAnimalGrowth(value:unknown):value is AnimalGrowthProfile{
 if(!value||typeof value!=='object')return false;
 const profile=value as AnimalGrowthProfile;
 if(profile.version!==1||!Array.isArray(profile.scales)||profile.scales.length!==3)return false;
 const [baby,juvenile,adult]=profile.scales;
 return profile.scales.every(scale=>typeof scale==='number'&&Number.isFinite(scale)&&scale>=ANIMAL_SCALE_BOUNDS.min&&scale<=ANIMAL_SCALE_BOUNDS.max)
  &&baby<=juvenile&&juvenile<=adult&&baby<adult;
}

/** Separate deterministic stream: adding growth must not alter species/sex/rarity rolls. */
export function createAnimalGrowth(seed:string,size:AnimalSize):AnimalGrowthProfile{
 let hash=2166136261;
 for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619);}
 const random=(salt:number)=>{
  let value=(hash^Math.imul(salt+1,0x9e3779b9))>>>0;
  value^=value>>>16;value=Math.imul(value,0x7feb352d);value^=value>>>15;value=Math.imul(value,0x846ca68b);value^=value>>>16;
  return (value>>>0)/4294967296;
 };
 // Existing rarity/sale bands stay meaningful, with many individual sizes in each band.
 const [low,high]=size==='giant'?[1.8,2.2]:size==='large'?[1.3,1.8]:[.9,1.3];
 const adult=low+(high-low)*random(0);
 const baby=.6+(Math.min(.95,adult*.72)-.6)*random(1);
 const juvenile=baby+(adult-baby)*(.4+.25*random(2));
 return {version:1,scales:[baby,juvenile,adult]};
}

export function animalGrowthAgeMs(a:GrowingAnimal,now:number):number{
 const elapsed=Number.isFinite(now)?now-a.bornAt+(a.growth?a.growthBonusMs??0:0):0;
 return Math.min(a.growth?ANIMAL_ADULT_MS:LEGACY_ADULT_MS,Math.max(0,a.growthAgeMs??0,elapsed));
}
const stageDuration=(a:GrowingAnimal)=>a.growth?ANIMAL_STAGE_MS:LEGACY_ADULT_MS/2;
export function animalGrowthStage(a:GrowingAnimal,now=Date.now()):AnimalGrowthStage{
 const stage=Math.floor(animalGrowthAgeMs(a,now)/stageDuration(a));
 return stage>=2?'adult':stage===1?'juvenile':'baby';
}
export function animalGrowthLabel(a:GrowingAnimal,now=Date.now()):string{
 return {baby:'幼崽',juvenile:'少年',adult:'成年'}[animalGrowthStage(a,now)];
}
export function animalGrowthRemainingMs(a:GrowingAnimal,now=Date.now()):number{
 const age=animalGrowthAgeMs(a,now),duration=stageDuration(a);
 return age>=2*duration?0:duration-age%duration;
}
export function animalGrowthProgress(a:GrowingAnimal,now=Date.now()):number{
 const age=animalGrowthAgeMs(a,now),duration=stageDuration(a);
 return age>=2*duration?1:(age%duration)/duration;
}
const ease=(progress:number)=>progress*progress*(3-2*progress);
export function animalScale(a:GrowingAnimal,now=Date.now()):number{
 const age=animalGrowthAgeMs(a,now);
 if(!a.growth){
  // Missing profile is deliberately the original V14 curve, not a rerolled baby.
  // This preserves existing visible size and the original 60-second adult rights.
  const birth=a.size==='giant'?1.8:a.size==='large'?1.3:1;
  const adult=a.size==='giant'?2.2:a.size==='large'?1.625:1.25;
  return birth+(adult-birth)*ease(age/LEGACY_ADULT_MS);
 }
 const [baby,juvenile,adult]=a.growth.scales;
 if(age>=ANIMAL_ADULT_MS)return adult;
 const index=age<ANIMAL_STAGE_MS?0:1;
 const start=index===0?baby:juvenile,end=index===0?juvenile:adult;
 return start+(end-start)*ease((age-index*ANIMAL_STAGE_MS)/ANIMAL_STAGE_MS);
}
