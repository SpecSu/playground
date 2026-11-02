'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Fish } from 'lucide-react';
import { advanceCatchBroadcasts, createCatchBroadcastTracker, emptyCatchBroadcasts } from '@/lib/fishing-catch-broadcast';
import { getSpecies, RARITIES } from '@/lib/fishing-catalog';
import type { FishingSnapshot } from '@/lib/fishing-types';

export default function FishingCatchBroadcast({snapshot,enabled,serverOffsetMs,reducedMotion}:{snapshot:FishingSnapshot|null;enabled:boolean;serverOffsetMs:number;reducedMotion:boolean}) {
 const tracker=useRef<ReturnType<typeof createCatchBroadcastTracker>|null>(null);
 const [broadcasts,setBroadcasts]=useState(emptyCatchBroadcasts);
 useEffect(()=>{
  if(!snapshot) return;
  tracker.current ??= createCatchBroadcastTracker();
  const incoming=tracker.current.observe(snapshot);
  let cancelled=false;
  queueMicrotask(()=>{if(!cancelled)setBroadcasts(state=>advanceCatchBroadcasts(state,incoming,snapshot.serverNow,enabled&&!document.hidden));});
  return()=>{cancelled=true;};
 },[snapshot,enabled]);
 useEffect(()=>{
  const tick=()=>setBroadcasts(state=>advanceCatchBroadcasts(state,[],Date.now()+serverOffsetMs,enabled&&!document.hidden));
  const timer=setInterval(tick,150);
  document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[enabled,serverOffsetMs]);
 const item=enabled?broadcasts.current:null;
 const species=item?getSpecies(item.speciesId):undefined;
 return <div className="fishing-catch-broadcast-region" role="status" aria-live="polite" aria-atomic="true" aria-relevant="additions text">
  {item&&species&&<div key={item.id} className="fishing-catch-broadcast" data-reduced-motion={reducedMotion} style={{'--broadcast-rarity':RARITIES[species.rarity].color} as CSSProperties}>
   <Fish size={16} aria-hidden="true"/>
   <span className="fishing-catch-broadcast-copy"><span><b>{item.name}</b><span> 钓到了 {species.name}</span></span><small>{RARITIES[species.rarity].label}</small></span>
  </div>}
 </div>;
}
