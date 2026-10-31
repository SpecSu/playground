/** Local presentation clock only. No animal, save, account or transport dependency.
 * Call once from the visible World's frame; never feed wall-clock catch-up time. */
export type LunarTimelineClip={clip:string;duration:number};
export type LunarTimelineAction=LunarTimelineClip&{id:string;cycles:number;holdSeconds?:number};
export type LunarTimelineSpec={idle:LunarTimelineClip;walk?:LunarTimelineClip;carried?:LunarTimelineClip;actions:LunarTimelineAction[];automatic?:{actionId:string;delaySeconds:number}};
export type LunarTimelineSnapshot=Readonly<{clip:string;clipTime:number;elapsed:number;actionId:string|null;carried:boolean;paused:boolean;disposed:boolean;revision:number;automaticConsumed:boolean;walking:boolean}>;
const name=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
const validClip=(clip:LunarTimelineClip)=>!!clip&&name(clip.clip)&&Number.isFinite(clip.duration)&&clip.duration>0&&clip.duration<=60;

export class LunarShowcaseTimeline{
 private readonly spec:LunarTimelineSpec;
 private action:LunarTimelineAction|null=null;
 private walking=false;private elapsed=0;private activeSeconds=0;private carried=false;private paused=false;private disposed=false;private revision=0;private automaticConsumed=false;
 constructor(input:LunarTimelineSpec){
  if(!input||!validClip(input.idle)||input.walk&&!validClip(input.walk)||input.carried&&!validClip(input.carried)||!Array.isArray(input.actions)||input.actions.length>12)throw new Error('Invalid lunar timeline clips');
  const ids=new Set<string>();for(const action of input.actions){if(!validClip(action)||!name(action.id)||ids.has(action.id)||!Number.isInteger(action.cycles)||action.cycles<1||action.cycles>4||action.holdSeconds!==undefined&&(!Number.isFinite(action.holdSeconds)||action.holdSeconds<0||action.holdSeconds>3))throw new Error('Invalid lunar timeline action');ids.add(action.id);}
  if(input.automatic&&(!ids.has(input.automatic.actionId)||!Number.isFinite(input.automatic.delaySeconds)||input.automatic.delaySeconds<0||input.automatic.delaySeconds>120))throw new Error('Invalid lunar automatic action');
  this.spec=structuredClone(input);
 }
 private clip(){return this.carried?this.spec.carried!:this.action??(this.walking?this.spec.walk!:this.spec.idle);}
 snapshot():LunarTimelineSnapshot{const clip=this.clip();return Object.freeze({clip:clip.clip,clipTime:this.action&&this.elapsed>=this.action.duration*this.action.cycles?Math.max(0,clip.duration-1e-7):this.elapsed%clip.duration,elapsed:this.elapsed,actionId:this.action?.id??null,carried:this.carried,paused:this.paused,disposed:this.disposed,revision:this.revision,automaticConsumed:this.automaticConsumed,walking:this.walking});}
 play(actionId:string):boolean{
  if(this.disposed||this.paused||this.carried)return false;const action=this.spec.actions.find(a=>a.id===actionId);if(!action)return false;
  this.automaticConsumed=true;this.walking=false;this.action=action;this.elapsed=0;this.revision++;return true;
 }
 advance(deltaSeconds:number):LunarTimelineSnapshot{
  if(this.disposed||this.paused||!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return this.snapshot();
  const delta=Math.min(deltaSeconds,.25);this.activeSeconds+=delta;if(!this.walking)this.elapsed+=delta;
  if(this.action&&this.elapsed>=this.action.duration*this.action.cycles+(this.action.holdSeconds??0)-1e-9){this.action=null;this.elapsed=0;this.revision++;}
  const automatic=this.spec.automatic;
  if(!this.automaticConsumed&&automatic&&!this.carried&&this.activeSeconds>=automatic.delaySeconds){this.automaticConsumed=true;this.play(automatic.actionId);}
  return this.snapshot();
 }
 setPaused(paused:boolean){if(!this.disposed)this.paused=paused;}
 setCarried(carried:boolean):boolean{
  if(this.disposed||this.paused||carried&&!this.spec.carried)return false;if(this.carried===carried)return true;
  this.automaticConsumed=true;this.walking=false;this.carried=carried;this.action=null;this.elapsed=0;this.revision++;return true;
 }
 locomote(phaseSeconds:number){if(this.disposed||this.paused||this.carried||this.action||!this.spec.walk||!Number.isFinite(phaseSeconds)||phaseSeconds<0)return false;if(!this.walking){this.walking=true;this.elapsed=0;this.revision++;}this.elapsed+=phaseSeconds;return true;}
 stopWalking(){if(!this.walking)return;this.walking=false;this.elapsed=0;this.revision++;}
 cancel(){if(this.disposed)return;this.walking=false;this.automaticConsumed=true;this.action=null;this.elapsed=0;this.revision++;}
 dispose(){if(this.disposed)return;this.cancel();this.carried=false;this.paused=true;this.disposed=true;}
}
