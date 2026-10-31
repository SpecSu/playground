import {isApprovedSignedInFarmResourceContext,approvedSignedInFarmMainResource,approvedSignedInFarmSelectedAnimal,type ApprovedSignedInFarmResourceContext} from './signed-in-farm-resources.ts';
import {getHunyuanMainResource,getHunyuanMainInspectionStatus,type AlpacaInspectionContext} from './alpaca-inspection.ts';
import {selectedLocalAnimal} from './local-animal-models.ts';
import {isApprovedDemoResourceContext,approvedDemoMainResource,approvedDemoSelectedAnimal,type ApprovedDemoResourceContext} from './named-demo-resources.ts';
import type {HunyuanMainSpecies} from './hunyuan-profile.ts';
/** Domain-only resources. Inspection can animate/measure, but cannot open shops.
 * Approved named-server capabilities are isolated from all global render state. */
export type ApprovedFarmResourceContext=ApprovedDemoResourceContext|ApprovedSignedInFarmResourceContext;
export type AnimalResourceContext=AlpacaInspectionContext|ApprovedFarmResourceContext;
/** Commerce authority accepts issued deployment scopes, never inspection capabilities. */
export function assertApprovedFarmResourceContext(context:unknown):asserts context is ApprovedFarmResourceContext{if(!isApprovedDemoResourceContext(context)&&!isApprovedSignedInFarmResourceContext(context))throw new Error('Farm resources: unissued commerce context');}
export function assertAnimalResourceContext(context:AnimalResourceContext):void{if(!isApprovedDemoResourceContext(context)&&!isApprovedSignedInFarmResourceContext(context))getHunyuanMainInspectionStatus(context as AlpacaInspectionContext);}
export function domainMainResource(species:HunyuanMainSpecies,context?:AnimalResourceContext|null){return context!=null&&isApprovedSignedInFarmResourceContext(context)?approvedSignedInFarmMainResource(species,context):context!=null&&isApprovedDemoResourceContext(context)?approvedDemoMainResource(species,context):getHunyuanMainResource(species,context as AlpacaInspectionContext|null|undefined);}
export function domainSelectedAnimal(species:string,context?:AnimalResourceContext|null){if(context!=null){if(isApprovedSignedInFarmResourceContext(context))return approvedSignedInFarmSelectedAnimal(species,context);if(isApprovedDemoResourceContext(context))return approvedDemoSelectedAnimal(species,context);assertAnimalResourceContext(context);}return selectedLocalAnimal(species);}
export function approvedDomainCommerce(context?:AnimalResourceContext|null):boolean{if(context==null)return false;if(isApprovedDemoResourceContext(context)||isApprovedSignedInFarmResourceContext(context))return true;assertAnimalResourceContext(context);return false;}
