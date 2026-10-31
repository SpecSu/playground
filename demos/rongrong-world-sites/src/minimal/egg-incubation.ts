import type {FarmEgg,MinimalState} from './model.ts';
import {themeForNaturalTerrain} from './egg-catalog.ts';
export type EggIncubation={requiredMs:number;elapsedMs:number;checkedAt:number};
export function eggHabitatMatches(state:Pick<MinimalState,'tiles'>,egg:FarmEgg):boolean{
 if(egg.location!=='ground'||!egg.position)return false;
 // Existing unthemed eggs retain the habitat-free rule they were bought under.
 if(!egg.theme)return true;
 const tile=state.tiles.find(t=>t.x===egg.position!.x&&t.z===egg.position!.z);
 return !!tile?.owned&&themeForNaturalTerrain(tile.terrain)===egg.theme;
}
export function eggIncubationStatus(state:Pick<MinimalState,'tiles'|'updatedAt'>,egg:FarmEgg){
 const remainingMs=egg.incubation?Math.max(0,egg.incubation.requiredMs-egg.incubation.elapsedMs):Math.max(0,(egg.readyAt??state.updatedAt)-state.updatedAt);
 const paused=egg.location!=='ground'||!eggHabitatMatches(state,egg);
 return {paused,ready:egg.location==='ground'&&!paused&&remainingMs===0,remainingMs};
}
/** Convert the old absolute timer only when a themed egg needs it or the owner moves it. */
export function retainEggProgress(egg:FarmEgg,at:number){
 if(egg.incubation||egg.location!=='ground'||egg.placedAt===undefined||egg.readyAt===undefined)return;
 const requiredMs=Math.max(0,egg.readyAt-egg.placedAt);
 egg.incubation={requiredMs,elapsedMs:Math.max(0,Math.min(requiredMs,at-egg.placedAt)),checkedAt:at};
}
/** Mutates only the cloned state at one authoritative time boundary. */
export function advanceEggIncubation(state:MinimalState,now:number){
 for(const egg of state.eggs){
  if(egg.theme)retainEggProgress(egg,state.updatedAt);
  const clock=egg.incubation;if(!clock)continue;
  const from=Math.max(clock.checkedAt,state.updatedAt),remainingBefore=clock.requiredMs-clock.elapsedMs,matches=eggHabitatMatches(state,egg);
  if(matches)clock.elapsedMs=Math.min(clock.requiredMs,clock.elapsedMs+Math.max(0,now-from));
  clock.checkedAt=Math.max(clock.checkedAt,now);
  if(egg.location==='ground'){
   // Keep the true completion instant stable, including an offline overshoot.
   const deadline=matches?(remainingBefore>0?from+remainingBefore:egg.readyAt??now):now+clock.requiredMs-clock.elapsedMs;
   egg.readyAt=Math.max(egg.placedAt??now,deadline);
  }
 }
}
export function validEggIncubation(value:unknown,updatedAt:number):value is EggIncubation{
 if(!value||typeof value!=='object')return false;const c=value as EggIncubation;
 return Object.keys(c).every(k=>['requiredMs','elapsedMs','checkedAt'].includes(k))&&[c.requiredMs,c.elapsedMs,c.checkedAt].every(Number.isFinite)&&c.requiredMs>=0&&c.elapsedMs>=0&&c.elapsedMs<=c.requiredMs&&c.checkedAt>=0&&c.checkedAt<=updatedAt;
}
