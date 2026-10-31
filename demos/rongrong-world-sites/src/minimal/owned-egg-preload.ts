import {animalAssetLibrary} from './animal-assets.ts';
import type {FarmEgg,Species} from './model.ts';

type Preload=(species:Species[])=>Promise<unknown>;
/** Best-effort warmup for already owned, still-unrevealed eggs only.
 * The scene latch survives failures; the shared library owns template readiness
 * (including optional picking registration), eviction and later actor retries. */
export class OwnedEggModelPreloader{
 private attempted=new Set<Species>();
 private disposed=false;
 private preload:Preload;
 constructor(preload:Preload=species=>animalAssetLibrary.preload(species)){this.preload=preload;}
 update(eggs:readonly Pick<FarmEgg,'species'>[]){
  if(this.disposed)return;
  const fresh:Species[]=[];
  for(const egg of eggs)if(!this.attempted.has(egg.species)){this.attempted.add(egg.species);fresh.push(egg.species);}
  if(!fresh.length)return;
  // Latch before invoking: synchronous/reentrant failures cannot create a tick
  // retry storm. No completion handler creates actors or touches scene/UI state.
  try{void this.preload(fresh).catch(()=>{});}catch{/* Optional warmup never blocks gameplay. */}
 }
 dispose(){this.disposed=true;this.attempted.clear();} // Do not cancel shared template work.
}
