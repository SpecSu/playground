import {projectCreativeObstacles,withoutStaticObstacles} from './creative-obstacles.ts';
import {CREATIVE_CATALOG,approvedCreativeAnimal,approvedCreativeAnimalTemplate,creativeTemplate,type CreativeAsset,type CreativeTemplate} from './creative-assets.ts';
import {createAnimalGrowth,animalGrowthAgeMs} from './animal-growth.ts';
import {canPlaceEgg,MINIMAL_RULES,stopStaticObstacleRoutes,type MinimalAnimal,type MinimalState} from './model.ts';
import type {CanonicalFarm,MinimalTransaction} from './cloud-contract.ts';
const clone=<T>(value:T):T=>structuredClone(value);
export function createCreativeAnimal(asset:CreativeAsset,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):MinimalAnimal|null{
 const template=creativeTemplate(catalog,asset.templateId);if(asset.kind!=='custom-creature'||!approvedCreativeAnimalTemplate(template)||template?.model.status!=='ready')return null;
 const bornAt=asset.hatchedAt??asset.createdAt;
 return {id:asset.id,creative:{assetId:asset.id,templateId:asset.templateId,modelSha256:template.model.sha256},name:asset.name,species:'pig',sex:'female',size:'normal',rarity:'white',growth:createAnimalGrowth(asset.id,'normal'),growthAgeMs:0,growthBonusMs:0,bornAt,position:clone(asset.position??{x:1,z:3}),activity:'idle',activityUntil:bornAt+8000,energy:85,bond:0};
}
export function bagCreativeAnimal(animal:MinimalAnimal,now:number):MinimalAnimal{
 const next=clone(animal);delete next.path;delete next.target;delete next.targetActivity;delete next.drinkAnchor;next.activity='idle';next.activityUntil=now+8000;next.growthAgeMs=animalGrowthAgeMs(next,now);return next;
}
/** Validates both representations; a pig with a forged UGC tag is not an owned released creature. */
export function ownedCreativeAnimal(farm:CanonicalFarm,animal:MinimalAnimal,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):boolean{
 if(!approvedCreativeAnimal(animal,catalog))return false;
 const asset=farm.creative?.assets.find(a=>a.id===animal.id);
 return !!asset&&asset.kind==='custom-creature'&&asset.location==='ground'&&asset.position?.x===animal.position.x&&asset.position?.z===animal.position.z&&asset.templateId===animal.creative!.templateId&&asset.name===animal.name&&asset.animal===undefined;
}
/** Existing fixed samples acquire lifecycle once. Never reroll, re-hatch or pay coins.
 * A full/blocked old pasture safely keeps the original creature in its bag. */
export function migrateCreativeAnimals(farm:CanonicalFarm,catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):boolean{
 let changed=false;
 for(const asset of farm.creative?.assets??[]){
  if(asset.kind!=='custom-creature'||!approvedCreativeAnimalTemplate(creativeTemplate(catalog,asset.templateId)))continue;
  const active=farm.state.animals.find(a=>a.id===asset.id);if(active)continue;
  if(asset.animal)continue;
  const animal=createCreativeAnimal(asset,catalog);if(!animal)continue;animal.growthAgeMs=animalGrowthAgeMs(animal,farm.state.updatedAt);
  // Hydrate an existing ground identity in place, including old prop overlaps.
  // New placement/hatching uses the stricter obstacle/body checks instead.
  if(asset.location==='ground'&&asset.position&&farm.state.animals.length+farm.state.eggs.length<MINIMAL_RULES.maxAnimals&&canPlaceEgg(withoutStaticObstacles(farm.state),asset.position)){
   farm.state.animals.push(animal);farm.assetProvenance[animal.id]='server-created';
  }else{asset.location='bag';delete asset.position;asset.animal=animal;}
  farm.state.hatchedCount++;changed=true;
 }
 return changed;
}
/** Synchronizes view metadata only; a missing actor must never be recreated here (it may have been sold). */
export function syncCreativeAnimals(farm:CanonicalFarm):void{
 for(const asset of farm.creative?.assets??[]){
  const animal=farm.state.animals.find(a=>a.id===asset.id&&a.creative?.assetId===asset.id);
  if(animal){asset.location='ground';asset.position=clone(animal.position);delete asset.animal;}
 }
}
/** View projection reads the moving canonical actor, never stale creative position metadata. */
export function projectCreativeAnimals(assets:readonly CreativeAsset[],state:MinimalState):CreativeAsset[]{
 return assets.flatMap(asset=>{
  if(asset.kind!=='custom-creature')return [asset];
  const animal=state.animals.find(a=>a.id===asset.id&&a.creative?.assetId===asset.id);
  if(!animal)return asset.location==='ground'?[]:[asset];
  return [{...asset,location:'ground' as const,position:clone(animal.position),animal}];
 });
}

/** Single canonical farm commit boundary for command, creative and both exchange routes.
 * Ground actors own position/lifecycle; the creative inventory holds identity plus a view projection. */
export async function putCanonicalFarm(tx:MinimalTransaction,farm:CanonicalFarm):Promise<void>{
 syncCreativeAnimals(farm);farm.state=projectCanonicalObstacles(farm);await tx.put('farms',farm.accountId,farm);
}

/** Single projection used by authoritative reads, advancement and canonical commits. */
export function projectCanonicalObstacles(farm:Pick<CanonicalFarm,'state'|'creative'>):MinimalState{return stopStaticObstacleRoutes(projectCreativeObstacles(farm.state,farm.creative?.assets));}
