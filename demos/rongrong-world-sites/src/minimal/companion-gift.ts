import type {MinimalAnimal,MinimalState} from './model.ts';
import {animalGrowthStage} from './animal-growth.ts';
import {dayKey,validCalendarDay} from './farm-calendar.ts';
export const COMPANION_GREETING_GIFT_COINS=10;
/** Pure actual-action eligibility, not a promise of secure local-clock enforcement. */
export function canClaimCompanionGift(state:MinimalState,animal:MinimalAnimal,now:number):boolean{
 if(!Number.isFinite(now)||!Number.isFinite(new Date(now+8*3600000).getTime())||now<state.updatedAt||!state.welcomeClaimed)return false;
 const today=dayKey(now);if(!validCalendarDay(today))return false;
 const owned=state.animals.find(a=>a.id===animal.id);
 if(!owned||owned.id===state.carriedAnimalId||owned.activity==='carried'||Math.hypot(state.player.x-owned.position.x,state.player.z-owned.position.z)>1.6||animalGrowthStage(owned,now)!=='adult')return false;
 const claimed=state.lastCompanionGiftDay;
 return claimed===undefined||validCalendarDay(claimed)&&today>claimed;
}
