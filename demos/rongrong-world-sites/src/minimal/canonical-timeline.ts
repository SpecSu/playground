import {MINIMAL_DEFENSE_ENABLED} from './defense-policy.ts';
import {advanceMinimalState,type MinimalState} from './model.ts';
import {animalGrowthAgeMs} from './animal-growth.ts';
import type {ApprovedFarmResourceContext} from './animal-resource-context.ts';
/** Preserve the historical single-wish API while accepting independent farm locks. */
export type CanonicalAnimalLocks=string|null|readonly string[];
const lockIds=(locks:CanonicalAnimalLocks):readonly string[]=>typeof locks==='string'?[locks]:locks===null?[]:[...new Set(locks)];
/** Project from the persisted state's timestamp, never the GET/ACK timestamp.
 * Intermediate display samples must not become the next base: autonomous choices
 * depend on tick boundaries. This is the same bounded timeline used by authority.
 * Nothing returned here is committed or trusted by the server. */
export function projectCanonicalState(input:MinimalState,now:number,locks:CanonicalAnimalLocks,resources?:ApprovedFarmResourceContext):MinimalState {
 const lockedAnimalIds=lockIds(locks);let state=structuredClone(input);if(!Number.isFinite(now)||now<state.updatedAt)return state;
 const end=Math.min(now,state.updatedAt+120_000);
 while(state.updatedAt<end)state=advanceMinimalState(state,Math.min(end,state.updatedAt+2000),lockedAnimalIds,undefined,resources);
 if(now>state.updatedAt){
  state.playerPath=[];state.playerSpeed=0;
  state.animals=state.animals.map(a=>{if(lockedAnimalIds.includes(a.id)||a.id===state.carriedAnimalId)return a;const next={...a};delete next.path;delete next.target;delete next.targetActivity;delete next.drinkAnchor;next.activity='idle';next.activityUntil=now+8000;next.growthAgeMs=animalGrowthAgeMs(next,now);return next;});
  for(const a of state.animals)a.growthAgeMs=animalGrowthAgeMs(a,now);
  state.updatedAt=now;state.terrainGrowthAt=now;if(MINIMAL_DEFENSE_ENABLED){if(state.wolfEvent&&state.wolfEvent.endsAt<=now)state.wolfEvent=null;state.nextWolfAt=Math.max(state.nextWolfAt,now+300000);}
 }
 return state;
}

/** Display-only speculation for an actively rendered session. Only completed
 * canonical 2-second ticks become checkpoints; partial display samples cannot
 * perturb autonomous decision times. Authority receipts replace this instance.
 * Continuous sessions may roam past 120s, but a long unsampled/offline gap still
 * uses the authority's bounded catch-up policy before resuming live ticks. */
export class CanonicalPresentationTimeline{
 private checkpoint:MinimalState;
 private lastSampleAt:number;
 private readonly lockedAnimalIds:readonly string[];
 constructor(state:MinimalState,locks:CanonicalAnimalLocks){
  this.checkpoint=structuredClone(state);this.lastSampleAt=state.updatedAt;this.lockedAnimalIds=lockIds(locks);
 }
 at(now:number):MinimalState{
  const at=Number.isFinite(now)?Math.max(now,this.lastSampleAt):this.lastSampleAt;
  if(at-this.lastSampleAt>120_000){
   this.checkpoint=projectCanonicalState(this.checkpoint,at,this.lockedAnimalIds);
  }else{
   while(this.checkpoint.updatedAt+2000<=at)this.checkpoint=advanceMinimalState(this.checkpoint,this.checkpoint.updatedAt+2000,this.lockedAnimalIds);
  }
  this.lastSampleAt=at;
  return projectCanonicalState(this.checkpoint,at,this.lockedAnimalIds);
 }
}
