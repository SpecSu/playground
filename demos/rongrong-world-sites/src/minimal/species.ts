import {approvedCreativeAnimal,type CreativeAnimalIdentity} from './creative-assets.ts';
import {selectedLocalAnimalPortrait} from './local-animal-models.ts';
import {alpacaProvider} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
import {domainMainResource,domainSelectedAnimal,approvedDomainCommerce,type AnimalResourceContext} from './animal-resource-context.ts';
/** Legacy publication identities/providers stay unchanged. */
export const SPECIES=['sheep','pig','cow','bunny','duck'] as const;
export type LegacySpecies=typeof SPECIES[number];
/** Save compatibility is distinct from content availability. */
export const KNOWN_SPECIES=[...SPECIES,'alpaca','penguin'] as const;
export type Species=typeof KNOWN_SPECIES[number];
export function isSpecies(value:unknown):value is Species{return typeof value==='string'&&KNOWN_SPECIES.some(species=>species===value);}
export function isLegacySpecies(value:unknown):value is LegacySpecies{return typeof value==='string'&&SPECIES.some(species=>species===value);}
export function isAnimalProviderReady(value:unknown,resources?:AnimalResourceContext|null):value is Species{const approved=approvedDomainCommerce(resources);return isLegacySpecies(value)||(value==='alpaca'||value==='penguin')&&(resources!=null?approved:value==='alpaca'?!!alpacaProvider.get():!!penguinProvider.get());}
export function animalPortrait(species:Species,resources?:AnimalResourceContext|null):string{if(resources!=null){const selected=domainSelectedAnimal(species,resources);if(selected)return selected.portrait?.url??'';if(species==='alpaca'||species==='penguin')return domainMainResource(species,resources)?.profile.portraitUrl??'';}const selected=selectedLocalAnimalPortrait(species);if(selected!==null)return selected;return species==='alpaca'?alpacaProvider.get()?.profile.portraitUrl??'':species==='penguin'?penguinProvider.get()?.profile.portraitUrl??'':`/models/farm/portraits/${species}.png`;}

/** Suspended identities keep ownership/capacity without a physical runtime actor. */
export function isAnimalRuntimeActive(animal:{id?:unknown;species:unknown;resourceSuspended?:unknown;creative?:CreativeAnimalIdentity},inspection?:AnimalResourceContext|null):boolean{const resource=domainMainResource(animal.species==='penguin'?'penguin':'alpaca',inspection);return (!animal.creative||approvedCreativeAnimal(animal))&&animal.resourceSuspended!==true&&(isLegacySpecies(animal.species)||(animal.species==='alpaca'||animal.species==='penguin')&&!!resource);}

/** A gameplay profile never grants model/commercial admission. */
export function isAnimalCommerceReady(animal:{id?:unknown;species:unknown;resourceSuspended?:unknown;creative?:CreativeAnimalIdentity},resources?:AnimalResourceContext|null):boolean{return isAnimalRuntimeActive(animal,resources)&&isAnimalProviderReady(animal.species,resources)&&(!animal.creative||approvedCreativeAnimal(animal)&&(resources==null||approvedDomainCommerce(resources)));}
