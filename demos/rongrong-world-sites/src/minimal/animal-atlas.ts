import {isSpecies,animalGrowthStage,animalScale,type AnimalGrowthStage,type MinimalState,type Sex,type Species} from './model.ts';
import {ANIMAL_SCALE_BOUNDS} from './animal-growth.ts';
import {KNOWN_SPECIES,isAnimalProviderReady,animalPortrait} from './species.ts';

/** Optional album metadata. It never owns animals, currency, or trade authority. */
export type AnimalAtlasRecord={sexes:Sex[];adultSeen:boolean;maxObservedScale?:number;receivedViaWish:boolean};
export type AnimalAtlasLedger={version:1;records:Partial<Record<Species,AnimalAtlasRecord>>;receivedReceiptIds:string[]};
export type AnimalAtlasReceipt={id:string;status:'completed';receivedAnimalId:string};
export type AnimalAtlasEntry={species:Species;label:string;portrait:string;discovered:boolean;ownedCount:number;record?:AnimalAtlasRecord;currentAnimals:{id:string;name:string;sex:Sex;stage:AnimalGrowthStage}[]};
export const ANIMAL_ATLAS_STORAGE_KEY='dreamina-animal-atlas-v1';
export const ATLAS_SPECIES_LABELS:Record<Species,string>={sheep:'绵羊',pig:'小猪',cow:'奶牛',bunny:'兔子',duck:'小鸭',alpaca:'羊驼',penguin:'企鹅'};
const sexes:readonly Sex[]=['male','female'];
const object=(input:unknown):input is Record<string,unknown>=>!!input&&typeof input==='object'&&!Array.isArray(input);
const validId=(input:unknown):input is string=>typeof input==='string'&&input.trim().length>0&&input.length<=256;
const emptyRecord=():AnimalAtlasRecord=>({sexes:[],adultSeen:false,receivedViaWish:false});

/** Parse the optional ledger independently of the existing, unchanged farm save. */
export function normalizeAnimalAtlasLedger(input:unknown):AnimalAtlasLedger{
 const ledger:AnimalAtlasLedger={version:1,records:{},receivedReceiptIds:[]};
 if(!object(input)||input.version!==1)return ledger;
 if(object(input.records))for(const species of KNOWN_SPECIES){
  if(!Object.hasOwn(input.records,species))continue;
  const value=input.records[species];if(!object(value))continue;
  const record:AnimalAtlasRecord={sexes:sexes.filter(sex=>Array.isArray(value.sexes)&&value.sexes.includes(sex)),adultSeen:value.adultSeen===true,receivedViaWish:value.receivedViaWish===true};
  const scale=value.maxObservedScale;
  if(typeof scale==='number'&&Number.isFinite(scale)&&scale>=ANIMAL_SCALE_BOUNDS.min&&scale<=ANIMAL_SCALE_BOUNDS.max)record.maxObservedScale=scale;
  ledger.records[species]=record;
 }
 if(Array.isArray(input.receivedReceiptIds))ledger.receivedReceiptIds=[...new Set(input.receivedReceiptIds.filter(validId))];
 return ledger;
}

/** Observe only animals present now. Collection alone cannot reconstruct sold pets. */
export function observeAnimalAtlas(state:MinimalState,input?:unknown,now=state.updatedAt):AnimalAtlasLedger{
 const ledger=normalizeAnimalAtlasLedger(input),at=Number.isFinite(now)?now:state.updatedAt;
 for(const animal of state.animals){
  if(animal.creative||!isSpecies(animal.species))continue;
  const previous=ledger.records[animal.species]??emptyRecord(),scale=animalScale(animal,at);
  const next:AnimalAtlasRecord={...previous,sexes:sexes.filter(sex=>previous.sexes.includes(sex)||animal.sex===sex),adultSeen:previous.adultSeen||animalGrowthStage(animal,at)==='adult'};
  if(Number.isFinite(scale)&&scale>=ANIMAL_SCALE_BOUNDS.min&&scale<=ANIMAL_SCALE_BOUNDS.max)next.maxObservedScale=Math.max(previous.maxObservedScale??scale,scale);
  ledger.records[animal.species]=next;
 }
 return ledger;
}

/**
 * Call only after applying an authenticated, completed incoming trade receipt.
 * A listing is not a receipt. This cosmetic ledger is not a trade validator.
 * Replayed receipts are inert even if that animal has since left the farm.
 */
export function recordAnimalAtlasReceipt(state:MinimalState,input:unknown,receipt:unknown,now=state.updatedAt):AnimalAtlasLedger{
 const ledger=normalizeAnimalAtlasLedger(input);
 if(!object(receipt)||receipt.status!=='completed'||!validId(receipt.id)||!validId(receipt.receivedAnimalId)||ledger.receivedReceiptIds.includes(receipt.id))return ledger;
 const animal=state.animals.find(animal=>animal.id===receipt.receivedAnimalId&&!animal.creative&&isSpecies(animal.species));if(!animal)return ledger;
 const observed=observeAnimalAtlas({...state,animals:[animal]},ledger,now);
 observed.records[animal.species]={...observed.records[animal.species]!,receivedViaWish:true};
 observed.receivedReceiptIds.push(receipt.id);return observed;
}

/** Pure view model: observing here does not mutate or persist the input ledger. */
export function getAnimalAtlasEntries(state:MinimalState,input?:unknown,now=state.updatedAt):AnimalAtlasEntry[]{
 const ledger=observeAnimalAtlas(state,input,now),discovered=new Set(state.collection.filter(isSpecies));
 return KNOWN_SPECIES.filter(species=>isAnimalProviderReady(species)||discovered.has(species)||state.animals.some(a=>!a.creative&&a.species===species)||!!ledger.records[species]).map(species=>{
  const animals=state.animals.filter(animal=>!animal.creative&&animal.species===species);
  return {species,label:ATLAS_SPECIES_LABELS[species],portrait:animalPortrait(species),discovered:discovered.has(species)||animals.length>0||!!ledger.records[species]?.sexes.length,ownedCount:animals.length,record:ledger.records[species],currentAnimals:animals.map(animal=>({id:animal.id,name:animal.name,sex:animal.sex,stage:animalGrowthStage(animal,now)}))};
 });
}
