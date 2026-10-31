import {projectCreativeObstacles} from './creative-obstacles.ts';
export {projectCanonicalState,CanonicalPresentationTimeline} from './canonical-timeline.ts';
import {minimalCommand,MINIMAL_RULES,type MinimalCommand,type MinimalState} from './model.ts';
import type {CanonicalFarm,WishingOffer} from './cloud-contract.ts';
import {lockedAnimalId,offerRef} from './exchange-authority.ts';
/** Shared display/authority lock identities; no caller can mutate retained locks. */
export function canonicalFarmLocks(farm:Pick<CanonicalFarm,'boardingAnimalId'>,offer:WishingOffer|null):readonly string[]{return [...new Set([lockedAnimalId(offer),farm.boardingAnimalId].filter((id):id is string=>!!id))];}
/** Prediction is display-only. The server still validates every command. Namespacing
 * mirrors canonical minting so a pending purchase never creates a local-ID egg. */
export function predictCanonicalCommand(farm:CanonicalFarm,state:MinimalState,command:MinimalCommand,now:number,offer:WishingOffer|null){
 const locks=canonicalFarmLocks(farm,offer),ref=offer?offerRef(offer):null;
 const affected=command.type==='pickup'||command.type==='care'||command.type==='resumeSuspendedAnimal'?[command.animalId]:command.type==='breed'?command.animalIds:command.type==='hatch'||command.type==='placeEgg'||command.type==='collectEgg'?[command.eggId]:command.type==='sellAnimal'||command.type==='putdown'||command.type==='suspendUnavailableCarry'?[state.carriedAnimalId]:[];
 if(farm.boardingAnimalId&&(affected.includes(farm.boardingAnimalId)||command.type==='convert'))return {accepted:false,state,message:'伙伴正在寄养，取消或结算后即可继续'};
 if(farm.boardingReservedEgg&&['buyEgg','emergencyEgg','breed'].includes(command.type)&&state.animals.length+state.eggs.length>=MINIMAL_RULES.maxAnimals-1)return {accepted:false,state,message:'寄养已为可能到来的蛋保留一个名额'};
 if(ref&&(affected.includes(ref.id)||command.type==='convert'))return {accepted:false,state,message:'物品正在许愿，请先撤回'};
 const result=minimalCommand(projectCreativeObstacles(state,farm.creative?.assets),command,now,[...locks]),map=(id:string)=>id.includes(':')||farm.creative?.assets.some(asset=>asset.id===id)?id:`${farm.farmId}:${id}`;
 for(const animal of result.state.animals)animal.id=map(animal.id);
 for(const egg of result.state.eggs){egg.id=map(egg.id);if(egg.parents)egg.parents=egg.parents.map(map) as [string,string];}
 if(result.state.carriedAnimalId)result.state.carriedAnimalId=map(result.state.carriedAnimalId);
 if(result.state.lastHatch)result.state.lastHatch.animalId=map(result.state.lastHatch.animalId);
 if(result.state.lastBreeding)result.state.lastBreeding.animalIds=result.state.lastBreeding.animalIds.map(map) as [string,string];
 return result;
}
