import type {FarmAudio} from '../v5/estate-audio.ts';

/** Switch the one app-owned engine, not the preference or audio device. The
 * caller restores foreground visibility and unlocks directly in its gesture.
 * Visitor score is calm and independent of a late home snapshot/wolf event. */
export function enterVisitorAudio(audio:FarmAudio,sampleId:string):void{
 audio.setVisible(false);
 audio.updateScene({scope:`sample-visit:${sampleId}`,eventId:null,warning:false,active:false,complete:false});
 // Do not carry a home storm or nearby pond into a different island. This is
 // the existing quiet procedural bed; it never loads media or creates a context.
 audio.updateAtmosphere({weather:'sunny',water:0});
}
