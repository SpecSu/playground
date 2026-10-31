import type {MinimalState,Point} from './model.ts';
import {eggHabitatMatches} from './egg-incubation.ts';
import {EGG_THEME_LABELS} from './egg-catalog.ts';
/** Pure presentation selector: at most one bubble, never changes incubation. Distances are grid units. */
export function eggHabitatHint(state:Pick<MinimalState,'eggs'|'tiles'|'player'>,selectedEggId?:string|null,nearbyRadius=3):{eggId:string;position:Point;text:string}|null{
 const candidates=state.eggs.filter(egg=>egg.location==='ground'&&egg.position&&egg.theme&&!eggHabitatMatches(state,egg));
 const selected=candidates.find(egg=>egg.id===selectedEggId);
 const closest=candidates.filter(egg=>Math.hypot(egg.position!.x-state.player.x,egg.position!.z-state.player.z)<=nearbyRadius).sort((a,b)=>Math.hypot(a.position!.x-state.player.x,a.position!.z-state.player.z)-Math.hypot(b.position!.x-state.player.x,b.position!.z-state.player.z)||a.id.localeCompare(b.id))[0];
 const egg=selected??closest;return egg?{eggId:egg.id,position:{...egg.position!},text:`这里不太适合我… 想去${EGG_THEME_LABELS[egg.theme!]}`} :null;
}
