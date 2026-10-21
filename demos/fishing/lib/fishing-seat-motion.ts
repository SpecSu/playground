import {FISHING_SEAT_MOVE_MS,projectFishing,type FishingParticipant,type FishingSeatMovement} from './fishing-types.ts';
import {FISHING_RENDER_SEATS} from './fishing-world.ts';

/** A move is entirely server-clock driven. Repeated snapshots cannot restart it. */
export function fishingSeatHop(person:FishingParticipant,now:number,reducedMotion=false){
 const destination=FISHING_RENDER_SEATS[person.slot],movement=person.movement;
 const source=movement&&FISHING_RENDER_SEATS[movement.fromSlot];
 if(!destination||!source||!movement||!Number.isFinite(movement.startedAt)||!Number.isFinite(movement.endsAt)||movement.endsAt<=movement.startedAt||now>=movement.endsAt)return null;
 const progress=Math.max(0,Math.min(1,(now-movement.startedAt)/(movement.endsAt-movement.startedAt)));
 const eased=progress*progress*(3-2*progress),arc=reducedMotion?0:Math.sin(Math.PI*progress)**2*(1.15+Math.abs(destination.y-source.y)*.25);
 const headingDelta=Math.atan2(Math.sin(destination.heading-source.heading),Math.cos(destination.heading-source.heading));
 const landing=progress>.78?Math.sin((progress-.78)/.22*Math.PI)**2:0;
 return {x:source.x+(destination.x-source.x)*eased,y:source.y+(destination.y-source.y)*eased+arc,z:source.z+(destination.z-source.z)*eased,groundY:source.y+(destination.y-source.y)*eased,changingDeck:source.y!==destination.y,heading:source.heading+headingDelta*eased,scaleY:reducedMotion?1:1-landing*.065,progress};
}

/** The destination is reserved from the moment its move is acknowledged. */
export function selectableFishingSeats(participants:readonly FishingParticipant[],ambient:readonly FishingParticipant[],ownId:string|null,now:number){
 const self=ownId?participants.find(person=>person.id===ownId):undefined;
 if(!self||!['idle','escaped'].includes(projectFishing(self.fishing,now).phase)||fishingSeatHop(self,now))return [];
 const occupied=new Set([...participants,...ambient].map(person=>person.slot));
 return FISHING_RENDER_SEATS.flatMap((_,slot)=>occupied.has(slot)?[]:[slot]);
}

/** Live slot changes get one readable hop even if polling/network latency missed
 * the server's short movement interval. A cold snapshot never replays history. */
export class FishingSeatTimeline {
 private slot:number|null=null;
 private movement:FishingSeatMovement|undefined;
 reset(){this.slot=null;this.movement=undefined;}
 sample(person:FishingParticipant,now:number,reducedMotion=false){
  if(!['idle','escaped'].includes(projectFishing(person.fishing,now).phase)){this.slot=person.slot;this.movement=undefined;return null;}
  if(this.slot===null){
   if(person.movement&&person.movement.endsAt>now)this.movement={...person.movement};
  }else if(this.slot!==person.slot){
   const movement=person.movement,late=!movement||now-movement.startedAt>500;
   const startedAt=late?now:movement.startedAt;
   this.movement={fromSlot:this.slot,startedAt,endsAt:startedAt+FISHING_SEAT_MOVE_MS};
  }
  this.slot=person.slot;
  const pose=fishingSeatHop({...person,movement:this.movement},now,reducedMotion);
  if(!pose)this.movement=undefined;
  return pose;
 }
}
