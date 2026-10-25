/** Ephemeral presentation scope, never an economic ACK or queue cancellation. */
export function createNavigationIntentScope(page=crypto.randomUUID()){
 let generation=0,pending=false;
 return{
  capture(islandUid){return{page,generation,islandUid};},
  accept(intent,islandUid){return !pending&&!!intent&&intent.page===page&&intent.generation===generation&&typeof islandUid==='string'&&intent.islandUid===islandUid;},
  begin(){pending=true;return ++generation;},
  finish(ticket){if(ticket!==generation)return false;pending=false;return true;},
  get pending(){return pending;}
 };
}
