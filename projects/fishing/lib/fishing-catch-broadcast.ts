import { MARINE_SPECIES } from './fishing-catalog';
import type { FishingSnapshot } from './fishing-types';

export const CATCH_BROADCAST_DURATION_MS = 4500;
const FRESH_MS = 12000;
const MAX_QUEUED = 3;
export type CatchBroadcast = { id:string; actorId:string; name:string; speciesId:string; lengthCm:number; at:number };
export type CatchBroadcastState = { current:CatchBroadcast|null; until:number; queue:CatchBroadcast[] };
export const emptyCatchBroadcasts = ():CatchBroadcastState => ({current:null,until:0,queue:[]});

/** Human catch events survive collecting between polls. Ambient catches have stable server IDs. */
export function createCatchBroadcastTracker() {
 let baseline:number|null = null;
 const seen = new Map<string,number>();
 return { observe(snapshot:FishingSnapshot):CatchBroadcast[] {
  const first = baseline === null;
  if(first) baseline=snapshot.serverNow;
  const candidates:CatchBroadcast[] = snapshot.events.flatMap(event =>
   event.type==='catch' && event.speciesId && typeof event.lengthCm==='number'
    ? [{id:`human:${event.id}`,actorId:event.actorId,name:event.name,speciesId:event.speciesId,lengthCm:event.lengthCm,at:event.at}] : []);
  for(const person of snapshot.ambientParticipants ?? []) {
   const caught=person.fishing.phase==='holding' ? person.fishing.catch : undefined;
   if(caught) candidates.push({id:`ambient:${caught.id}`,actorId:person.id,name:person.name,speciesId:caught.speciesId,lengthCm:caught.lengthCm,at:caught.caughtAt});
  }
  const fresh:CatchBroadcast[]=[];
  for(const item of candidates) {
   if(seen.has(item.id)) continue;
   seen.set(item.id,item.at);
   if(!first && item.actorId!==snapshot.self.id && item.at>=baseline! && item.at<=snapshot.serverNow && snapshot.serverNow-item.at<=FRESH_MS && MARINE_SPECIES.some(species=>species.id===item.speciesId) && Number.isFinite(item.lengthCm) && item.lengthCm>0) fresh.push(item);
  }
  // Retain IDs throughout their possible fresh window; old event history cannot replay.
  for(const [id,at] of seen) if(snapshot.serverNow-at>FRESH_MS) seen.delete(id);
  return fresh.sort((a,b)=>a.at-b.at);
 }};
}

export function advanceCatchBroadcasts(state:CatchBroadcastState,incoming:CatchBroadcast[],now:number,enabled:boolean):CatchBroadcastState {
 if(!enabled) return state.current || state.queue.length ? emptyCatchBroadcasts() : state;
 const fresh=(item:CatchBroadcast)=>now-item.at<=FRESH_MS && item.at<=now;
 const queue=[...state.queue,...incoming].filter(fresh);
 let current=state.current,until=state.until;
 if(current && now>=until) current=null;
 if(!current && queue.length) {current=queue.shift()!;until=now+CATCH_BROADCAST_DURATION_MS;}
 const bounded=queue.slice(0,MAX_QUEUED);
 if(current===state.current && until===state.until && bounded.length===state.queue.length && bounded.every((item,index)=>item===state.queue[index])) return state;
 return {current,until,queue:bounded};
}
