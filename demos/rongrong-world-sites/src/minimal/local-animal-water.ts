import {domainSelectedAnimal,type AnimalResourceContext} from './animal-resource-context.ts';
import type {WaterContact} from './model.ts';
/** Shared by local authority planning/save checks and World. Never moves water
 * geometry: it selects a point on the original bowl's real top surface. */
export function localAnimalWaterContact(contact:WaterContact|null,species:string,scale:number,resources?:AnimalResourceContext|null):WaterContact|null{
 const selected=domainSelectedAnimal(species,resources);if(!selected||!contact)return contact;
 if(!Number.isFinite(scale)||scale<.6-1e-7||scale>2.2+1e-7)return null;
 if(contact.source!=='bowl')return contact;
 const policy=selected.profile.water;if(!policy.bowlAvailable)return null;if(scale+1e-8<policy.bowlMinimumScale)return null;
 const dx=contact.standingPoint.x-contact.waterPoint.x,dz=contact.standingPoint.z-contact.waterPoint.z,length=Math.hypot(dx,dz);if(length<1e-8)return null;
 return {...contact,waterPoint:{x:contact.waterPoint.x+dx/length*policy.bowlNearSideOffsetWorld/2,z:contact.waterPoint.z+dz/length*policy.bowlNearSideOffsetWorld/2},waterHeight:policy.bowlWaterHeight};
}
