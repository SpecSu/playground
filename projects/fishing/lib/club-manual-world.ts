import type { Participant } from './room-types';
import type { ParticipantMovement } from './room-movement';
import { clubMotionAtDistance, type ClubMotionState } from './club-scene-motion.ts';
import { ClickNavigation } from './club-click-navigation.ts';
import { MOVEMENT_BODY_RADIUS, MOVEMENT_SPEED_LIMIT } from './room-movement.ts';
import { ManualWalkTrail, approachManualTarget, constrainManualPosition, remoteManualTarget, sweepManualPosition, type ClubMovementSample, type ManualIntent, type ManualPoint, type ManualBlocker, type ClubManualControl } from './club-manual-motion.ts';

interface State {
 joinedAt:number; slot:number; mode:'manual'|'auto'; point:ManualPoint; heading:number; trail:ManualWalkTrail;
 groupId:string|null; sourceSequence:number; source?:ParticipantMovement; local:boolean; active:boolean;
 blockedUntilRelease:boolean; autoRequest:number; summonAt?:number; summonFrom?:ManualPoint; groupParkPending:boolean; waveParkPending?:boolean; autoAt?:number;
}
interface UpdateOptions {
 now:number;deltaSeconds:number;canonical:ReadonlyMap<number,ClubMotionState>;
 canonicalAt:(slot:number,time:number)=>ClubMotionState;
 group?:{id:string;startsAt:number;endsAt:number;kind?:string;version?:number}|null;intent?:ManualIntent;reducedMotion?:boolean;
}
const distance=(a:ManualPoint,b:ManualPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));
function separatedPoint(origin:ManualPoint,blockers:readonly ManualBlocker[],slot:number,radius=MOVEMENT_BODY_RADIUS):ManualPoint{
 const minimum=(other:ManualBlocker)=>radius+(other.radius??MOVEMENT_BODY_RADIUS)+.025;
 let point=constrainManualPosition(origin,radius);
 for(let pass=0;pass<5;pass++)for(const other of blockers){
  const span=distance(point,other),clearance=minimum(other);if(span>=clearance)continue;
  const fallback=(slot+1)*2.399963,dx=span>1e-7?(point.x-other.x)/span:Math.sin(fallback),dz=span>1e-7?(point.z-other.z)/span:Math.cos(fallback);
  point=constrainManualPosition({x:other.x+dx*clearance,z:other.z+dz*clearance},radius);
 }
 if(blockers.some(other=>distance(point,other)<minimum(other)-1e-5)){
  let best:ManualPoint|undefined,bestDistance=Infinity;
  for(let ring=1;ring<=24&&!best;ring++)for(let ray=0;ray<24;ray++){
   const angle=ray*Math.PI/12+(slot%3)*.17,candidate=constrainManualPosition({x:origin.x+Math.sin(angle)*ring*.25,z:origin.z+Math.cos(angle)*ring*.25},radius);
   if(blockers.some(other=>distance(candidate,other)<minimum(other)-1e-5))continue;
   const span=distance(candidate,origin);if(span<bestDistance){best=candidate;bestDistance=span;}
  }
  if(best)point=best;
 }
 return point;
}
/** Presentation-only navigation. Server position samples remain the network authority. */
export class ClubManualWorld {
 private participants:readonly Participant[]=[];
 private ownId:string|null=null;
 private states=new Map<string,State>();
 private yieldTrails=new Map<number,ManualWalkTrail>();
 private automaticPositions=new Map<number,ManualPoint>();
 private flipOffsets=new Map<number,ManualPoint>();
 private clearanceAt:number|undefined;
 private ownAutoRequest=0;
 private reconcileRequest=0;
 private targetSequence=0;
 private cancelRequest=0;
 private navigation:ClickNavigation|null=null;
 private clickMarker:ManualPoint|null=null;
 private clickMarkerUntil=0;
 private waveHold:{id:string;points:Map<number,ManualPoint>}|null=null;
 get destination(){return this.navigation?.destination??null;}
 get markerDestination(){return this.clickMarker;}
 constructor(tokens?:Partial<Pick<ClubManualControl,'autoRequest'|'reconcileRequest'|'targetRequest'|'targetSequence'|'cancelRequest'>>){this.ownAutoRequest=tokens?.autoRequest??0;this.reconcileRequest=tokens?.reconcileRequest??0;this.targetSequence=tokens?.targetSequence??tokens?.targetRequest?.sequence??0;this.cancelRequest=tokens?.cancelRequest??0;}
 private automaticOrigin(slot:number,base:ClubMotionState){const trail=this.yieldTrails.get(slot);return {...base,...this.automaticPositions.get(slot),heading:trail?.sampleAtDistance(trail.distance).heading??base.heading,distance:trail?.distance??base.distance};}
 sync(participants:readonly Participant[],ownId:string|null,movements:readonly ParticipantMovement[]=[]){
  const previousOwn=this.participants.find(person=>person.id===this.ownId),nextOwn=participants.find(person=>person.id===ownId);
  if(previousOwn?.id!==nextOwn?.id||previousOwn?.joinedAt!==nextOwn?.joinedAt){this.navigation=null;this.clickMarker=null;}
  this.participants=participants;this.ownId=ownId;
  for(const slot of this.flipOffsets.keys())if(!participants.some(person=>person.slot===slot))this.flipOffsets.delete(slot);
  for(const [id,state]of this.states){const p=participants.find(p=>p.id===id);if(!p||p.joinedAt!==state.joinedAt){this.states.delete(id);this.yieldTrails.delete(state.slot);this.automaticPositions.delete(state.slot);this.flipOffsets.delete(state.slot);}}
  for(const sample of movements){
   const p=participants.find(p=>p.id===sample.actorId&&p.joinedAt===sample.joinedAt);if(!p)continue;
   let state=this.states.get(p.id);
   if(!state){state=this.makeState(p,sample,sample.mode,sample.groupId);this.states.set(p.id,state);}
   if(sample.moveSequence<=state.sourceSequence)continue;
   state.sourceSequence=sample.moveSequence;state.source=sample;
   // Old network replies never rewind an actively predicted owner. Membership
   // and group transitions below still preempt the local prediction immediately.
   if(!state.local){state.mode=sample.mode;if(sample.mode==='auto')state.autoAt=sample.acceptedAt;}
  }
 }
 private makeState(p:Participant,origin:ManualPoint&{heading:number;distance?:number},mode:'manual'|'auto',groupId:string|null):State{
  return {joinedAt:p.joinedAt,slot:p.slot,mode,point:{x:origin.x,z:origin.z},heading:origin.heading,trail:new ManualWalkTrail(origin,origin.heading,origin.distance??0),groupId,sourceSequence:-1,local:false,active:false,blockedUntilRelease:false,autoRequest:this.ownAutoRequest,groupParkPending:false};
 }
 update(options:UpdateOptions){
  const {now,canonical,group}=options,dt=Math.max(0,Math.min(.1,options.deltaSeconds||0));
  if(now>=this.clickMarkerUntil)this.clickMarker=null;
  const motions=new Map<number,ClubMotionState>(),scales=new Map<number,number>(),samples:ClubMovementSample[]=[];
  const groupId=group?.id??null,groupActive=Boolean(group&&now<group.endsAt);
  const waveV2=group?.kind==='wave'&&group.version===2;
  if(waveV2&&groupActive&&this.waveHold?.id!==group!.id){
   const points=new Map<number,ManualPoint>();
   for(const [slot,base]of canonical)if(this.yieldTrails.has(slot)&&!this.manualPointAtSlot(slot))points.set(slot,{...(this.automaticPositions.get(slot)??base)});
   this.waveHold={id:group!.id,points};
  }else if(!waveV2||this.waveHold?.id!==groupId)this.waveHold=null;
  const own=this.participants.find(p=>p.id===this.ownId),intent=options.intent;
  let ownState=own?this.states.get(own.id):undefined;
  // The movement transport drops local-intent ownership on a group epoch.
  // A newer accepted post-wave row can therefore win without a reset callback.
  const acceptedWave=Boolean(waveV2&&!groupActive&&ownState?.waveParkPending&&ownState.source?.groupId===groupId&&ownState.source.acceptedAt>=group!.endsAt);
  if(acceptedWave&&ownState?.source){ownState.waveParkPending=false;ownState.local=false;ownState.active=false;ownState.mode=ownState.source.mode;if(ownState.mode==='auto')ownState.autoAt=ownState.source.acceptedAt;}
  const autoRequest=intent?.autoRequest??this.ownAutoRequest;
  const cancelled=(intent?.cancelRequest??this.cancelRequest)!==this.cancelRequest;
  const reconciled=intent?.reconcileRequest!==undefined&&intent.reconcileRequest!==this.reconcileRequest;
  const groupChanged=Boolean(ownState&&ownState.groupId!==groupId);
  const blocked=acceptedWave||!own||intent?.enabled===false||groupActive||groupChanged||reconciled||autoRequest!==this.ownAutoRequest||Boolean(intent?.active);
  this.cancelRequest=intent?.cancelRequest??this.cancelRequest;
  if(blocked||cancelled){this.navigation=null;this.clickMarker=null;}
  const request=intent?.targetRequest;
  if(request&&Number.isSafeInteger(request.sequence)&&request.sequence>this.targetSequence){
   this.targetSequence=request.sequence;
   // A tap made after a stop may reach this frame with that still-unconsumed
   // reset. Its stamp proves it is newer; an older target can never replay.
   if(!blocked&&(request.cancelGeneration??0)===this.cancelRequest){this.navigation=new ClickNavigation(request);this.clickMarker=null;}
  }
  const active=Boolean(!acceptedWave&&(intent?.active||this.navigation?.active)&&intent?.enabled!==false&&!groupActive);
  if(own&&!ownState&&(active||autoRequest!==this.ownAutoRequest)){
   ownState=this.makeState(own,this.automaticOrigin(own.slot,canonical.get(own.slot)!),'manual',groupId);this.states.set(own.id,ownState);
  }
  const emit=(s:State,reason:ClubMovementSample['reason'],vx=0,vz=0)=>samples.push({mode:s.mode,...s.point,heading:angle(s.heading),vx,vz,reason});
  if(!ownState&&intent?.reconcileRequest!==undefined)this.reconcileRequest=intent.reconcileRequest;
  if(ownState&&intent?.reconcileRequest!==undefined&&intent.reconcileRequest!==this.reconcileRequest){
   this.reconcileRequest=intent.reconcileRequest;ownState.local=true;ownState.active=false;ownState.blockedUntilRelease=true;
   const source=ownState.source;
   const retainedWave=waveV2&&!groupActive&&source?.mode==='manual';
   const target=source?.mode==='manual'&&(source.groupId===groupId||retainedWave)?source:canonical.get(ownState.slot)!;
   ownState.mode='manual';ownState.point=constrainManualPosition(target);ownState.heading=target.heading;
   ownState.trail=new ManualWalkTrail(ownState.point,ownState.heading);ownState.autoAt=undefined;
   if(intent.reconcileStop===false){ownState.local=false;ownState.mode=source?.mode??'auto';}
   else if(!groupActive)emit(ownState,'stop');
  }
  if(ownState&&autoRequest!==this.ownAutoRequest&&!groupActive){
   ownState.mode='auto';ownState.local=true;ownState.active=false;ownState.autoAt=now;ownState.summonFrom={...ownState.point};ownState.source=undefined;emit(ownState,'auto');
  }
  this.ownAutoRequest=autoRequest;
  for(const [id,state]of this.states){
   if(state.groupId!==groupId){
    state.groupId=groupId;state.summonAt=now;state.summonFrom={...state.point};state.groupParkPending=state.mode==='manual'&&!waveV2;state.waveParkPending=state.mode==='manual'&&waveV2;
    if(state.active&&id===this.ownId)emit(state,'stop');state.active=false;state.blockedUntilRelease=true;
   }
   if(id===this.ownId&&reconciled&&intent?.reconcileStop===false)state.waveParkPending=false;
   if(groupActive){
    if(state.active&&id===this.ownId)emit(state,'stop');state.active=false;state.blockedUntilRelease=true;
    if(waveV2){
     state.groupParkPending=false;state.summonAt=undefined;state.summonFrom=undefined;
     if(state.mode==='manual')motions.set(state.slot,state.trail.motion(state.slot,state.point,state.heading,0));
     scales.set(state.slot,1);
     continue;
    }
    if(state.mode==='manual'){
     state.groupParkPending=true;state.summonAt??=now;state.summonFrom??={...state.point};
     const elapsed=now-state.summonAt;
     if(elapsed<250)motions.set(state.slot,state.trail.motion(state.slot,state.summonFrom,state.heading,0));
     scales.set(state.slot,elapsed<250?Math.max(.001,1-elapsed/250):Math.max(.001,Math.min(1,(elapsed-250)/250)));
    }
    continue;
   }
   if(state.waveParkPending&&waveV2){state.waveParkPending=false;if(id===this.ownId&&state.mode==='manual')emit(state,'stop');}
   if(state.groupParkPending&&group){
    const final=options.canonicalAt(state.slot,group.endsAt);state.point={x:final.x,z:final.z};state.heading=final.heading;
    state.trail=new ManualWalkTrail(final,final.heading,final.distance);state.groupParkPending=false;state.summonAt=undefined;state.summonFrom=undefined;
    if(id===this.ownId)emit(state,'stop');
   }
   if(id===this.ownId&&!intent?.active)state.blockedUntilRelease=false;
  }
  if(groupActive){
   if(!waveV2)this.flipOffsets.clear();else this.clearanceAt=now;
   for(const [slot,base]of canonical){
    const held=waveV2?this.waveHold?.points.get(slot):undefined;
    const point=motions.get(slot)??held??base;
    this.automaticPositions.set(slot,{x:point.x,z:point.z});
    if(held&&!motions.has(slot)){
     let trail=this.yieldTrails.get(slot);if(!trail){trail=new ManualWalkTrail(held,base.heading,base.distance);this.yieldTrails.set(slot,trail);}
     motions.set(slot,trail.motion(slot,held,base.heading,0));
    }
    const offset=waveV2?this.flipOffsets.get(slot):undefined;
    if(offset){
     const motion=motions.get(slot)??base,path=motion.sampleAtDistance??((at:number)=>clubMotionAtDistance(slot,at));
     motions.set(slot,{...motion,x:motion.x+offset.x,z:motion.z+offset.z,sampleAtDistance:(at:number)=>{const sample=path(at);return {...sample,x:sample.x+offset.x,z:sample.z+offset.z};}});
    }
   }
   if(!waveV2)this.yieldTrails.clear();
   return {motions,scales,samples};
  }

  // Start a new gesture only after any disabled/group-interrupted pointer has
  // actually been released. Keeping a finger held cannot resurrect movement.
  if(ownState&&active&&!ownState.blockedUntilRelease){
   if(ownState.mode!=='manual'){
    const base=this.automaticOrigin(ownState.slot,canonical.get(ownState.slot)!);ownState.point={x:base.x,z:base.z};ownState.heading=base.heading;
    ownState.trail=new ManualWalkTrail(base,base.heading,base.distance);ownState.mode='manual';ownState.autoAt=undefined;
   }
   ownState.local=true;
  }
  // Remote targets are sampled before the owner moves, so body blockers use
  // this frame's bounded extrapolation rather than stale renderer positions.
  const occupiedManual:ManualPoint[]=[];
  if(ownState?.mode==='manual'&&ownState.local)occupiedManual.push(ownState.point);
  const orderedStates=[...this.states].sort(([a,sa],[b,sb])=>a===this.ownId?-1:b===this.ownId?1:sa.slot-sb.slot);
  for(const [id,state]of orderedStates){
   if(state.mode!=='manual'||id===this.ownId&&state.local)continue;
   const source=state.source;
   if(source&&source.groupId===groupId){
    const target=remoteManualTarget(source,now),next=separatedPoint(approachManualTarget(state.point,target,dt,occupiedManual),occupiedManual,state.slot);
    const moved=distance(next,state.point);if(moved>1e-6)state.heading=Math.atan2(next.x-state.point.x,next.z-state.point.z);
    else state.heading=source.heading;
    state.point=next;state.trail.append(next,state.heading);
    motions.set(state.slot,state.trail.motion(state.slot,next,state.heading,dt?moved/dt:0));
   }else motions.set(state.slot,state.trail.motion(state.slot,state.point,state.heading,0));
   occupiedManual.push(state.point);
  }
  if(ownState){
   if(intent?.enabled===false&&intent.active)ownState.blockedUntilRelease=true;
   let shouldMove=active&&!ownState.blockedUntilRelease;
   if(ownState.mode==='manual'&&ownState.local){
    const wasActive=ownState.active;
    let vx=shouldMove?intent!.vx:0,vz=shouldMove?intent!.vz:0;
    const magnitude=Math.hypot(vx,vz);if(!Number.isFinite(magnitude)){vx=0;vz=0;}else if(magnitude>MOVEMENT_SPEED_LIMIT){vx*=MOVEMENT_SPEED_LIMIT/magnitude;vz*=MOVEMENT_SPEED_LIMIT/magnitude;}
    const blockers:Array<ManualPoint>=[];
    for(const [slot,base]of canonical)if(slot!==ownState.slot)blockers.push(motions.get(slot)??this.manualPointAtSlot(slot)??this.automaticPositions.get(slot)??base);
    const before=ownState.point;
    const clicking=shouldMove&&Boolean(this.navigation?.active)&&!intent?.active;
    const next=clicking?this.navigation!.step(before,dt,blockers):shouldMove?sweepManualPosition(before,{x:vx*dt,z:vz*dt},blockers):before;
    if(clicking){
     const endpoint=this.navigation!.destination??this.navigation!.arrivalDestination;
     this.clickMarker=endpoint?{x:endpoint.x,z:endpoint.z}:null;
     this.clickMarkerUntil=this.navigation!.active?Infinity:now+650;
    }
    const clickFinished=clicking&&!this.navigation?.active;
    if(clickFinished)shouldMove=false;
    const moved=distance(before,next);if(moved>1e-6)ownState.heading=Math.atan2(next.x-before.x,next.z-before.z);
    ownState.point=next;ownState.trail.append(next,ownState.heading);ownState.active=shouldMove;
    const actualX=dt>0?(next.x-before.x)/dt:0,actualZ=dt>0?(next.z-before.z)/dt:0;
    motions.set(ownState.slot,ownState.trail.motion(ownState.slot,next,ownState.heading,dt?moved/dt:0));
    if(shouldMove)emit(ownState,wasActive?'move':'start',actualX,actualZ);else if(wasActive||clickFinished)emit(ownState,'stop');
   }
  }
  for(const state of this.states.values()){
   if(state.mode==='manual'&&!motions.has(state.slot))motions.set(state.slot,state.trail.motion(state.slot,state.point,state.heading,0));
   if(state.mode==='auto'&&state.autoAt!==undefined){
    const elapsed=now-state.autoAt;
    if(elapsed<250)motions.set(state.slot,state.trail.motion(state.slot,state.summonFrom??state.point,state.heading,0));
    if(elapsed<500)scales.set(state.slot,elapsed<250?Math.max(.001,1-elapsed/250):Math.max(.001,(elapsed-250)/250));
   }
  }
  // Manual discs have priority. NPC/automatic dancers yield locally; canonical
  // route and group clocks are never modified or written back to the server.
  const manualSlots=new Set([...this.states.values()].filter(s=>s.mode==='manual').map(s=>s.slot));
  if(manualSlots.size||this.yieldTrails.size){
   const occupied:ManualPoint[]=[...manualSlots].map(slot=>motions.get(slot)!).filter(Boolean);
   const waiting=new Map([...canonical].filter(([slot])=>!manualSlots.has(slot)).map(([slot,base])=>[slot,this.automaticPositions.get(slot)??base]));
   for(const [slot,base]of canonical){
    if(manualSlots.has(slot))continue;
    const previous=this.automaticPositions.get(slot)??base;
    waiting.delete(slot);
    const blockers=[...occupied,...waiting.values()];
    const target=separatedPoint(base,blockers,slot);
    const point=approachManualTarget(previous,target,dt*.5,blockers);
    let trail=this.yieldTrails.get(slot);
    if(!trail){trail=new ManualWalkTrail(previous,base.heading,base.distance);this.yieldTrails.set(slot,trail);}
    const moved=distance(previous,point),heading=moved>.0001?Math.atan2(point.x-previous.x,point.z-previous.z):base.heading;
    trail.append(point,heading);motions.set(slot,trail.motion(slot,point,heading,dt?Math.min(1.8,moved/dt):0,base.action));
    this.automaticPositions.set(slot,point);occupied.push(point);
    if(!manualSlots.size&&distance(point,base)<.001){this.yieldTrails.delete(slot);motions.delete(slot);this.automaticPositions.set(slot,{x:base.x,z:base.z});}
   }
  }else for(const [slot,base]of canonical)this.automaticPositions.set(slot,{x:base.x,z:base.z});
  for(const slot of manualSlots){const point=motions.get(slot);if(point)this.automaticPositions.set(slot,{x:point.x,z:point.z});}
  this.applyBackflipClearance(options,motions);
  return {motions,scales,samples};
 }
 /** Only render poses move aside. Accepted coordinates, gait distance, and
  * movement packets remain untouched; the shared action clock never waits. */
 private applyBackflipClearance(options:UpdateOptions,motions:Map<number,ClubMotionState>){
  const initialize=this.clearanceAt===undefined||options.now-this.clearanceAt>300;
  this.clearanceAt=options.now;
  if(options.reducedMotion){this.flipOffsets.clear();return;}
  const {now,canonical}=options,dt=Math.max(0,Math.min(.1,options.deltaSeconds||0));
  const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  const radii=new Map<number,number>();
  const positions=new Map([...canonical].map(([slot,base])=>[slot,motions.get(slot)??base]));
  for(const person of this.participants){
   const motion=positions.get(person.slot),elapsed=now-person.actionAt;
   if(person.action!=='wave'||!motion||motion.walkBlend>.04||person.actionAt<person.joinedAt||!Number.isFinite(elapsed)||elapsed<0||now>=(person.actionUntil??0))continue;
   // Both finite flips finish at 4800 ms. Open while crouching, then return
   // during the quiet finish, never during an airborne part of either phrase.
   const weight=smooth(elapsed/280)*(1-smooth((elapsed-4800)/400));
   if(weight>0)radii.set(person.slot,MOVEMENT_BODY_RADIUS+(1-MOVEMENT_BODY_RADIUS)*weight);
  }
  const targets=new Map([...positions].map(([slot,point])=>[slot,{x:point.x,z:point.z}]));
  const slots=[...positions.keys()].sort((a,b)=>a-b);
  // Share room-making between simultaneous flips. A fixed number of pair
  // projections avoids sending one actor through a packed row to a distant gap.
  for(let pass=0;pass<16;pass++)for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){
   const aSlot=slots[i],bSlot=slots[j],aRadius=radii.get(aSlot),bRadius=radii.get(bSlot);
   if(aRadius===undefined&&bRadius===undefined)continue;
   const a=targets.get(aSlot)!,b=targets.get(bSlot)!,span=distance(a,b);
   const minimum=(aRadius??MOVEMENT_BODY_RADIUS)+(bRadius??MOVEMENT_BODY_RADIUS)+.025;
   if(span>=minimum)continue;
   const direction=(aSlot+1)*2.399963,dx=span>1e-7?(a.x-b.x)/span:Math.sin(direction),dz=span>1e-7?(a.z-b.z)/span:Math.cos(direction);
   const correction=minimum-span,share=aRadius!==undefined&&bRadius!==undefined?.5:1;
   if(aRadius!==undefined)targets.set(aSlot,constrainManualPosition({x:a.x+dx*correction*share,z:a.z+dz*correction*share},aRadius));
   if(bRadius!==undefined)targets.set(bSlot,constrainManualPosition({x:b.x-dx*correction*share,z:b.z-dz*correction*share},bRadius));
  }
  for(const [slot,radius]of radii)targets.set(slot,constrainManualPosition(targets.get(slot)!,radius));
  const displayed=new Map([...positions].map(([slot,base])=>{const offset=this.flipOffsets.get(slot)??{x:0,z:0};return[slot,{x:base.x+offset.x,z:base.z+offset.z}];}));
  for(const [slot,base]of positions){
   const target=targets.get(slot)??base,previous=this.flipOffsets.get(slot)??{x:0,z:0};
   const desired={x:target.x-base.x,z:target.z-base.z},dx=desired.x-previous.x,dz=desired.z-previous.z;
   const length=Math.hypot(dx,dz),step=initialize?1:Math.min(1,length>0?4*dt/length:1);
   const offset={x:previous.x+dx*step,z:previous.z+dz*step};
   if(Math.hypot(offset.x,offset.z)<1e-8){this.flipOffsets.delete(slot);continue;}
   const blockers=[...displayed].filter(([other])=>other!==slot).map(([,point])=>point);
   // A newly visible/resumed frame has no visible transition to preserve.
   // Seed its safe pose before painting instead of briefly intersecting bodies.
   const point=initialize?target:sweepManualPosition({x:base.x+previous.x,z:base.z+previous.z},{x:offset.x-previous.x,z:offset.z-previous.z},blockers);
   displayed.set(slot,point);
   offset.x=point.x-base.x;offset.z=point.z-base.z;this.flipOffsets.set(slot,offset);
   const sampleAtDistance=base.sampleAtDistance??((at:number)=>clubMotionAtDistance(slot,at));
   motions.set(slot,{...base,...point,sampleAtDistance:(at:number)=>{const sample=sampleAtDistance(at);return {...sample,x:sample.x+offset.x,z:sample.z+offset.z};}});
  }
 }
 private manualPointAtSlot(slot:number){for(const state of this.states.values())if(state.slot===slot&&state.mode==='manual')return state.point;return undefined;}
}
