import {MINIMAL_DEFENSE_ENABLED} from './defense-policy.ts';
import type {AudioScene} from '../v5/estate-audio.ts';
import type {MinimalState} from './model.ts';

/** A small session adapter, not a second audio engine. One instance per mounted farm. */
export class MinimalAudioScenes{
 private scope='';
 private eventId:string|null=null;
 /** A removed wolf event still needs its identity for the engine's one-time safe cue.
  * Keep the completed scene stable across snapshots; AudioCueTracker handles audibility
  * and deduplication. A new adapter/save never invents an unseen completion.
  */
 update(state:Pick<MinimalState,'createdAt'|'updatedAt'|'wolfEvent'>):AudioScene{
  const scope=`minimal-farm:${state.createdAt}`;
  if(scope!==this.scope){this.scope=scope;this.eventId=null;}
  if(!MINIMAL_DEFENSE_ENABLED){this.eventId=null;return {scope,eventId:null,warning:false,active:false,complete:false};}
  const event=state.wolfEvent;
  const active=!!event&&event.endsAt>state.updatedAt;
  if(active)this.eventId=`wolf:${event!.startedAt}`;
  // Minimal wolves are already present when wolfEvent starts. Do not fabricate
  // a pre-arrival alarm, nor play warning and arrival accents simultaneously.
  return {scope,eventId:this.eventId,warning:false,active,complete:!active&&this.eventId!==null};
 }
}
