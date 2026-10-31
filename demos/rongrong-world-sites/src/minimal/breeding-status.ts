import type {AnimalResourceContext} from './animal-resource-context.ts';
import {canPlaceEgg,isAdult,MINIMAL_RULES,type MinimalState,type MinimalAnimal} from './model.ts';
import {dayKey} from './farm-calendar.ts';
import {isAnimalRuntimeActive,isAnimalProviderReady} from './species.ts';
export type BreedingStatus={code:'ready'|'missing'|'capacity'|'daily-egg'|'space'|'young'|'carried'|'attempted'|'partner'|'distance'|'resource-unavailable';message:string};
const ready:BreedingStatus={code:'ready',message:''};
const distance=(a:MinimalAnimal,b:MinimalAnimal)=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z);
/** Read-only checks: never settle time, consume a chance or sample RNG. */
export function breedingFarmStatus(s:MinimalState,now:number):BreedingStatus{
 if(s.animals.length+s.eggs.length>=MINIMAL_RULES.maxAnimals)return {code:'capacity',message:'小家已有 16 位伙伴和蛋，先腾出一个名额吧。'};
 if(s.breedingDay===dayKey(now))return {code:'daily-egg',message:'今天牧场已经留下 1 枚蛋，明天再碰碰鼻尖。'};
 if(!s.tiles.some(t=>canPlaceEgg(s,t)))return {code:'space',message:'先腾出一块空地，给可能到来的蛋留个位置。'};
 return ready;
}
function animalStatus(s:MinimalState,a:MinimalAnimal,now:number,resources?:AnimalResourceContext|null):BreedingStatus{
 if(a.creative||!isAnimalProviderReady(a.species,resources)||!isAnimalRuntimeActive(a,resources))return {code:'resource-unavailable',message:'伙伴资源暂不可用，请在设置中重试动物模型。'};
 if(!isAdult(a,now))return {code:'young',message:'长大后，可以和同种异性伙伴碰碰鼻尖。'};
 if(a.id===s.carriedAnimalId)return {code:'carried',message:'先把小伙伴放到地上，再碰碰鼻尖。'};
 if(a.lastBreedAttemptDay===dayKey(now))return {code:'attempted',message:`${a.name}今天已经碰过鼻尖，明天再试。`};
 return ready;
}
export function breedingPairStatus(s:MinimalState,ids:readonly [string,string],now:number,resources?:AnimalResourceContext|null):BreedingStatus{
 const a=s.animals.find(a=>a.id===ids[0]),b=s.animals.find(a=>a.id===ids[1]);
 if(!a||!b||a.id===b.id)return {code:'missing',message:'这对小伙伴已经不在一起了，请重新选一下。'};
 const farm=breedingFarmStatus(s,now);if(farm.code!=='ready')return farm;
 for(const animal of [a,b]){const status=animalStatus(s,animal,now,resources);if(status.code!=='ready')return status;}
 if(a.species!==b.species||a.sex===b.sex)return {code:'partner',message:'需要同种、异性的成年伙伴一起碰碰鼻尖。'};
 if(distance(a,b)>1.6)return {code:'distance',message:'小伙伴走远啦，等它们靠近后再试，不会消耗今天的机会。'};
 return ready;
}
export function availableBreedingPairs(s:MinimalState,now:number,resources?:AnimalResourceContext|null):[string,string][]{
 if(breedingFarmStatus(s,now).code!=='ready')return [];
 const animals=s.animals.filter(a=>animalStatus(s,a,now,resources).code==='ready'),pairs:[string,string][]=[];
 for(let i=0;i<animals.length;i++)for(let j=i+1;j<animals.length;j++){const a=animals[i],b=animals[j];if(a.species===b.species&&a.sex!==b.sex&&distance(a,b)<=1.6)pairs.push([a.id,b.id]);}
 return pairs;
}
export function animalBreedingStatus(s:MinimalState,id:string,now:number,resources?:AnimalResourceContext|null):BreedingStatus&{show:boolean;pair?:[string,string];partner?:MinimalAnimal}{
 const a=s.animals.find(a=>a.id===id);if(a?.creative)return {code:'resource-unavailable',message:'自定义样例暂不开放繁育。',show:false};if(!a)return {code:'missing',message:'',show:false};
 const mates=s.animals.filter(b=>b.id!==id&&b.species===a.species&&b.sex!==a.sex);
 if(!isAdult(a,now)&&!mates.length)return {...ready,show:false};
 const own=animalStatus(s,a,now,resources);if(own.code!=='ready')return {...own,show:true};
 const farm=breedingFarmStatus(s,now);if(farm.code!=='ready')return {...farm,show:true};
 const candidates=mates.filter(b=>animalStatus(s,b,now,resources).code==='ready'&&distance(a,b)<=1.6).sort((b,c)=>distance(a,b)-distance(a,c));
 const partner=candidates[0];if(partner)return {...ready,show:true,pair:[a.id,partner.id],partner,message:`和${partner.name}碰碰鼻尖，有机会留下蛋。`};
 return {code:'partner',show:true,message:'附近还没有可尝试的同种成年异性伙伴，等它们靠近再看看。'};
}
