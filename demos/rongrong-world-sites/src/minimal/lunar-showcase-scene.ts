import * as THREE from 'three';
import {createLunarFootReplant,type LunarReplantPlan} from './lunar-showcase-replant.ts';
import {createLunarStanceLock} from './lunar-showcase-stance.ts';
import {createLunarFloorContact} from './lunar-showcase-floor.ts';
import {LunarLife,LunarSampleGrowth,LUNAR_LOCOMOTION_RATE} from './lunar-showcase-life.ts';
import {LUNAR_SHOWCASE_LAYOUT} from './lunar-showcase-layout.ts';
import {LunarShowcaseAssetLibrary,type LunarAssetInstance,type LunarAssetStatus} from './lunar-showcase-assets.ts';
import type {LunarShowcaseId,LunarShowcaseRecord} from './lunar-showcase-contract.ts';
import {LunarShowcaseTimeline} from './lunar-showcase-timeline.ts';
import {animalTransferPoint,ANIMAL_TRANSFER_DURATION_MS} from './interaction-motion.ts';
import {alpacaLiftSupportPoint} from './alpaca-transfer.ts';
import type {LunarBasketballCourt,BasketballRelease} from './lunar-basketball-court.ts';
export type LunarActorSummary=Readonly<{id:LunarShowcaseId;label:string;portraitUrl:string;status:LunarAssetStatus;actionId:string|null;speech?:string|null;finishing?:boolean;carried:boolean;carryAllowed:boolean;lifePhase?:string;growthStage?:'baby'|'juvenile'|'adult';growthAgeMs?:number;growthScale?:number;canCare?:boolean;actions:readonly {id:string;label:string}[]}>;
export type LunarActionReply={accepted:boolean;message:string};
type Options={player:()=>THREE.Vector3;carrySupport:()=>THREE.Vector3;playerHeading:()=>number;groundHeight:(p:THREE.Vector3)=>number;walkable?:(p:THREE.Vector3,radius:number)=>boolean;landing:(record:LunarShowcaseRecord,occupied:readonly {position:THREE.Vector3;radius:number}[])=>THREE.Vector3|null;court?:LunarBasketballCourt;changed?:()=>void;automatic?:boolean};
type Transfer={kind:'lift'|'lower';elapsed:number;from:THREE.Vector3;fromRoot:THREE.Vector3;to:THREE.Vector3;clearance:number};
type PoseSnapshot={node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3};
const capturePose=(root:THREE.Object3D)=>{const pose:PoseSnapshot[]=[];root.traverse(node=>pose.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));return pose;};
const restorePose=(pose:PoseSnapshot[])=>{for(const v of pose){v.node.position.copy(v.position);v.node.quaternion.copy(v.quaternion);v.node.scale.copy(v.scale);}};
type Actor={idleSettlement?:string;finishing?:boolean;footReplant?:ReturnType<typeof createLunarFootReplant>;motionMode?:'idle'|'turn'|'walk';stance?:ReturnType<typeof createLunarStanceLock>;floor?:ReturnType<typeof createLunarFloorContact>;life?:LunarLife;growth?:LunarSampleGrowth;purePose?:PoseSnapshot[];definition:LunarShowcaseRecord;status:LunarAssetStatus;root:THREE.Group;instance?:LunarAssetInstance;clock?:LunarShowcaseTimeline;mixer?:THREE.AnimationMixer;action?:THREE.AnimationAction;revision:number;blend?:{elapsed:number;from:PoseSnapshot[];fromY:number;replantFrom?:ReturnType<ReturnType<typeof createLunarFootReplant>['capture']>;replantPlan?:LunarReplantPlan};transfer?:Transfer;carried:boolean;release?:BasketballRelease;courtKey?:string};
const placements:Record<LunarShowcaseId,[number,number]>={'yellow-long-ear':[-1,5],'kunkun-chicken':[3,1],'red-scarf-person':[1,5],'pink-sheep':[3,5],'floral-vest-person':[5,5]};
/** Owns temporary actor identity/poses only. Not a MinimalAnimal/CreativeAsset,
 * never writes an account, inventory, outbox or storage. */
export class LunarShowcaseScene{
 readonly root=new THREE.Group();readonly ready:Promise<PromiseSettledResult<void>[]>;
 private reportClock=0;private actors=new Map<LunarShowcaseId,Actor>();private disposed=false;private paused=false;private options:Options;private library:LunarShowcaseAssetLibrary;
 constructor(parent:THREE.Object3D,library:LunarShowcaseAssetLibrary,options:Options){
  this.library=library;this.options=options;this.root.name='lunar-showcase-actors';parent.add(this.root);
  for(const definition of library.catalog()){const root=new THREE.Group(),living=!!definition.profile.walk&&options.automatic!==false,p=living?[LUNAR_SHOWCASE_LAYOUT.placements[definition.id].x,LUNAR_SHOWCASE_LAYOUT.placements[definition.id].z]:placements[definition.id];root.name=`lunar-actor-${definition.id}`;root.position.set(p[0],0,p[1]);root.position.y=options.groundHeight(root.position);root.rotation.y=definition.id==='kunkun-chicken'?Math.PI:0;root.userData={target:{kind:'showcase',id:definition.id},showcaseId:definition.id,candidateSha256:definition.model.sha256};root.visible=false;this.root.add(root);const growth=living?new LunarSampleGrowth(definition.id):undefined;root.scale.setScalar(growth?.snapshot().scale??1);this.actors.set(definition.id,{definition,status:'loading',root,revision:-1,carried:false,growth,life:living?new LunarLife(definition.id,this.actors.size,definition.id==='kunkun-chicken'?['dribble','dribble','celebrate','dribble','shoot']:definition.id==='pink-sheep'?['turn-dance','signature','turn-dance','greet'].filter(id=>definition.profile.actions.some(a=>a.id===id)):definition.id==='floral-vest-person'?['baoquan','signature','baoquan','greet'].filter(id=>definition.profile.actions.some(a=>a.id===id)):definition.profile.actions.map(a=>a.id).reverse()):undefined});}
  this.ready=Promise.allSettled([...this.actors.values()].map(a=>this.load(a,false)));
 }
 private async load(actor:Actor,retry:boolean){
  actor.status='loading';this.options.changed?.();
  try{const instance=await this.library.instantiate(actor.definition.id,{retry});if(this.disposed){instance.release();return;}const p=actor.definition.profile;actor.instance=instance;instance.scene.scale.multiplyScalar(p.normalizationScale);instance.scene.rotation.y+=p.facingYaw;actor.root.add(instance.scene);actor.mixer=new THREE.AnimationMixer(instance.scene);
   actor.clock=new LunarShowcaseTimeline({idle:p.idle,walk:p.walk,carried:actor.definition.verification.carry?p.carried:undefined,actions:p.actions.map(a=>({id:a.id,clip:a.clip,duration:a.duration,cycles:a.cycles,holdSeconds:a.kind==='shoot'?1.2:0})),automatic:this.options.automatic===false||actor.life?undefined:{actionId:p.automaticActionId,delaySeconds:actor.definition.id==='kunkun-chicken'?3:6+[...this.actors.keys()].indexOf(actor.definition.id)*1.1}});actor.clock.setPaused(this.paused);actor.status='ready';actor.root.visible=true;this.pose(actor,0);if(p.walk)actor.floor=createLunarFloorContact(actor.root,actor.root.scale.x);if(p.walk?.feet){actor.stance=createLunarStanceLock(actor.root,p.walk.feet,p=>this.options.groundHeight(p));actor.footReplant=createLunarFootReplant(actor.root,p.walk.feet,p=>this.options.groundHeight(p));}this.options.changed?.();
  }catch{if(!this.disposed){actor.status='failed';actor.root.visible=false;this.options.changed?.();}}
 }
 rootFor(id:LunarShowcaseId){return this.actors.get(id)?.status==='ready'?this.actors.get(id)!.root:undefined;}
 private speech(a:Actor){const frame=a.clock?.snapshot();if(!frame?.actionId||a.carried||a.finishing||a.status!=='ready')return null;const cue=a.definition.profile.actions.find(v=>v.id===frame.actionId)?.speech?.find(c=>frame.elapsed>=c.at&&frame.elapsed<c.at+c.duration);return cue?.text??null;}
 snapshot():readonly LunarActorSummary[]{return [...this.actors.values()].map(a=>Object.freeze({id:a.definition.id,label:a.definition.label,portraitUrl:a.definition.portraitUrl,status:a.status,actionId:a.clock?.snapshot().actionId??null,speech:this.speech(a),finishing:!!a.finishing||!!a.idleSettlement,carried:a.carried,carryAllowed:a.definition.verification.carry,...a.life?{lifePhase:a.life.snapshot().phase}:{},...a.growth?{growthStage:a.growth.snapshot().stage,growthAgeMs:a.growth.snapshot().ageMs,growthScale:a.growth.snapshot().scale,canCare:a.growth.snapshot().canCare}:{},actions:a.definition.profile.actions.map(v=>Object.freeze({id:v.id,label:v.label}))}));}
 carriedId():LunarShowcaseId|null{return [...this.actors].find(([,a])=>a.carried)?.[0]??null;}
 transferring(){return [...this.actors.values()].some(a=>a.transfer);}
 position(id:LunarShowcaseId):THREE.Vector3|null{return this.actors.get(id)?.root.position.clone()??null;}
 /** Exact transient world-space reserved envelopes, never canonical tile blockers. */
 obstacleCircles(){return [...this.actors.values()].filter(a=>a.status==='ready'&&(!a.carried||a.transfer?.kind==='lower')).map(a=>{const p=a.transfer?.kind==='lower'?a.transfer.to:a.root.position;return {x:p.x,z:p.z,radius:this.radius(a)};});}
 private support(a:Actor){a.root.updateMatrixWorld(true);return a.root.getObjectByName(a.definition.profile.supportAnchor)!.getWorldPosition(new THREE.Vector3());}
 private placeSupport(a:Actor,p:THREE.Vector3){a.root.position.add(p.clone().sub(this.support(a)));a.root.updateMatrixWorld(true);}
 private reply(accepted:boolean,message:string){return {accepted,message};}
 action(id:LunarShowcaseId,action:string):LunarActionReply{
  const a=this.actors.get(id);if(this.disposed||this.paused||!a||a.status!=='ready'||!a.clock)return this.reply(false,'这位DIY伙伴还没准备好');
  if(a.idleSettlement)return this.reply(action==='stop','收势后休息 · 正在站稳');
  const active=a.definition.profile.actions.find(v=>v.id===a.clock!.snapshot().actionId);
  if(active?.rootMotion||active?.finishBeforeInterrupt){if(action==='stop'){a.finishing=true;this.options.changed?.();return this.reply(true,active.rootMotion?'收势后休息 · 跳完当前这一圈':'收势后休息 · 做完当前动作');}return this.reply(false,'正在收势，稍后再陪它玩');}
  if(action==='stop'){a.life?.rest(10);a.clock.cancel();if(a.definition.id==='kunkun-chicken')this.options.court?.cancel();a.courtKey=undefined;a.release=undefined;this.options.changed?.();return this.reply(true,a.life?'先歇一会，稍后会自己活动':'已停下表演');}
  if(a.transfer)return this.reply(false,'先等伙伴稳稳停好');
  if(action==='care'){if(a.carried||!a.growth?.care())return this.reply(false,a.growth?.snapshot().stage==='adult'?'已经成年，点动作陪它玩吧':'刚刚照料过，稍等片刻');a.clock.play(a.definition.profile.greetingActionId);a.life?.rest(5);this.options.changed?.();return this.reply(true,'照料成功 · 本次示例成长加快，离岛重置');}
  if(action==='pickup'){
   if(this.carriedId())return this.reply(false,'先放下手里的伙伴');if(!a.definition.verification.carry)return this.reply(false,'这位伙伴暂不支持举起，可以点动作陪玩');
   if(Math.hypot(a.root.position.x-this.options.player().x,a.root.position.z-this.options.player().z)>3.2)return this.reply(false,'先走到伙伴身边');
   a.life?.rest(5);const from=this.support(a),to=this.options.carrySupport();a.transfer={kind:'lift',elapsed:0,from,fromRoot:a.root.position.clone(),to,clearance:Math.max(from.y,to.y)+a.definition.profile.transferUnderside*a.root.scale.x+.08};a.clock.setCarried(true);a.carried=true;if(a.definition.id==='kunkun-chicken')this.options.court?.cancel();a.courtKey=undefined;a.release=undefined;this.options.changed?.();return this.reply(true,'临时举起 · 不能带回家');
  }
  if(action==='putdown'){
   if(!a.carried)return this.reply(false,'这位伙伴没有被举起');const occupied=[...this.actors.values()].filter(b=>b!==a&&!b.carried).map(b=>({position:b.root.position.clone(),radius:this.radius(b)})),to=this.options.landing({...a.definition,profile:{...a.definition.profile,bodyRadius:this.radius(a)}},occupied);if(!to)return this.reply(false,'旁边没有安全空地，再走到开阔处试试');
   a.life?.rest(4);const from=this.support(a);a.clock.setCarried(false);a.transfer={kind:'lower',elapsed:0,from,fromRoot:a.root.position.clone(),to,clearance:Math.max(from.y,to.y)+a.definition.profile.transferUnderside*a.root.scale.x+.08};this.options.changed?.();return this.reply(true,'正在稳稳放下');
  }
  if(a.carried)return this.reply(false,'先放下伙伴再表演');const selected=action==='greet'?a.definition.profile.greetingActionId:action;
  const selectedSpec=a.definition.profile.actions.find(v=>v.id===selected);if(selectedSpec?.idleBoundary&&(a.clock.snapshot().actionId||a.clock.snapshot().walking||a.blend))return this.reply(false,'先停下，等站稳后再点热身跑');if(a.life&&selectedSpec&&(selectedSpec.kind==='dribble'||selectedSpec.kind==='shoot')){a.clock.cancel();a.life.request(selected,LUNAR_SHOWCASE_LAYOUT.courtStand,LUNAR_SHOWCASE_LAYOUT.courtHeading);this.options.changed?.();return this.reply(true,'先走回球场，站稳后再表演');}
  if(selectedSpec?.reservedRadius&&!this.clearFor(a,a.root.position,selectedSpec.reservedRadius*(a.growth?.maximumScale??a.root.scale.x)))return this.reply(false,'旁边有伙伴或障碍，换个空旷位置再热身');
  if(!a.clock.play(selected))return this.reply(false,'这个动作暂不可用');a.life?.rest(5);this.options.changed?.();return this.reply(true,`${a.definition.label} · ${a.definition.profile.actions.find(v=>v.id===selected)?.label??'打招呼'}`);
 }
 private pose(a:Actor,delta:number,fromY=a.root.position.y){
  if(!a.clock||!a.mixer||!a.instance)return;const frame=a.clock.snapshot();
  if(a.revision!==frame.revision){const from=capturePose(a.instance.scene);if(a.purePose)restorePose(a.purePose);a.mixer.stopAllAction();a.purePose=undefined;const clip=a.instance.animations.find(c=>c.name===frame.clip)!,next=a.mixer.clipAction(clip);next.reset().setEffectiveWeight(1).setLoop(THREE.LoopRepeat,Infinity).play();a.blend={elapsed:0,from,fromY,replantFrom:frame.walking?a.blend?.replantFrom:undefined};a.action=next;a.revision=frame.revision;a.release=undefined;
   const action=a.definition.profile.actions.find(v=>v.id===frame.actionId);if(a.definition.id==='kunkun-chicken'&&action&&(action.kind==='dribble'||action.kind==='shoot')){a.courtKey=`${a.definition.id}:${frame.revision}`;this.options.court?.beginAction(a.courtKey);}else if(a.definition.id==='kunkun-chicken'){this.options.court?.cancel();a.courtKey=undefined;}
  }
  // PropertyMixer may skip constant tracks when their cached output is unchanged.
  // Restore its last pure output before evaluation, never feed the displayed blend back.
  if(a.purePose)restorePose(a.purePose);a.mixer.update(delta);if(a.action){a.action.time=frame.clipTime;a.mixer.update(0);}a.purePose=capturePose(a.instance.scene);a.root.updateMatrixWorld(true);
 }
 private displayPose(a:Actor,delta:number){
  if(a.blend){a.blend.elapsed+=delta*(a.clock?.snapshot().walking?LUNAR_LOCOMOTION_RATE:1);const t=Math.min(1,a.blend.elapsed/(a.blend.replantPlan?.duration??.18));for(const pose of a.blend.from){pose.node.position.lerpVectors(pose.position,pose.node.position,t);pose.node.quaternion.slerpQuaternions(pose.quaternion,pose.node.quaternion.clone(),t);pose.node.scale.lerpVectors(pose.scale,pose.node.scale,t);}if(!a.carried&&!a.transfer)a.root.position.y=THREE.MathUtils.lerp(a.blend.fromY,a.root.position.y,t);if(t>=1)a.blend=undefined;}a.root.updateMatrixWorld(true);
 }
 private exactHand(a:Actor,time:number){
  const p=a.definition.profile,clip=a.instance!.animations.find(c=>c.name===a.clock!.snapshot().clip)!,saved:{node:THREE.Object3D;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[];a.instance!.scene.traverse(node=>saved.push({node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()}));const mixer=new THREE.AnimationMixer(a.instance!.scene);mixer.clipAction(clip).play();mixer.setTime(time);a.root.updateMatrixWorld(true);const hand=a.root.getObjectByName(p.handAnchor!)!.localToWorld(new THREE.Vector3(p.handBallOffset?.x??0,p.handBallOffset?.y??0,p.handBallOffset?.z??0));mixer.stopAllAction();mixer.uncacheRoot(a.instance!.scene);for(const v of saved){v.node.position.copy(v.p);v.node.quaternion.copy(v.q);v.node.scale.copy(v.s);}a.root.updateMatrixWorld(true);return hand;
 }
 private ball(a:Actor){
  const court=this.options.court,frame=a.clock!.snapshot(),action=a.definition.profile.actions.find(v=>v.id===frame.actionId);if(!court||!action||!a.courtKey||!a.instance)return;
  if(action.kind==='dribble'&&action.ballTrack?.length){const track=action.ballTrack,t=frame.clipTime,i=Math.max(0,track.findIndex((s,j)=>j===track.length-1||track[j+1].time>=t)),from=track[i],to=track[Math.min(i+1,track.length-1)],mix=to.time>from.time?THREE.MathUtils.clamp((t-from.time)/(to.time-from.time),0,1):0,p=new THREE.Vector3(from.center.x,from.center.y,from.center.z).lerp(new THREE.Vector3(to.center.x,to.center.y,to.center.z),mix);a.instance.scene.localToWorld(p);if(from.contact&&to.contact&&a.definition.profile.handAnchor)p.copy(a.root.getObjectByName(a.definition.profile.handAnchor)!.getWorldPosition(new THREE.Vector3()));court.update({phase:'dribble',actionId:a.courtKey,clipTime:frame.elapsed,ballWorld:p});}
  if(action.kind==='shoot'&&a.definition.profile.handAnchor&&action.releaseAt!==undefined){
   if(frame.elapsed<action.releaseAt){const hand=a.root.getObjectByName(a.definition.profile.handAnchor)!.getWorldPosition(new THREE.Vector3());court.update({phase:'held',actionId:a.courtKey,clipTime:frame.elapsed,handWorld:hand});}
   else{if(!a.release){const hand=this.exactHand(a,action.releaseAt);court.update({phase:'held',actionId:a.courtKey,clipTime:action.releaseAt,handWorld:hand});const velocity=hand.clone().sub(this.exactHand(a,action.releaseAt-.001)).multiplyScalar(1000),departure=hand.clone().add(new THREE.Vector3(-.3,-.05,2).multiplyScalar(a.root.scale.x).applyQuaternion(a.root.quaternion));a.release={clipTime:action.releaseAt,handWorld:hand,secondsToRim:.85,apexRise:a.root.scale.x,departureWorld:departure,velocityWorld:velocity};}court.update({phase:'shot',actionId:a.courtKey,clipTime:frame.elapsed,release:a.release});}
  }
 }
 private radius(a:Actor){const action=a.definition.profile.actions.find(v=>v.id===(a.clock?.snapshot().actionId??a.idleSettlement));return Math.max(a.definition.profile.bodyRadius,action?.reservedRadius??0)*(a.growth?.maximumScale??a.root.scale.x);}
 private clearFor(a:Actor,p:{x:number;z:number},reservation=this.radius(a)){
  const radius=reservation,position=new THREE.Vector3(p.x,0,p.z);
  if(this.options.walkable&&!this.options.walkable(position,radius))return false;
  if(p.x-radius< -4||p.x+radius>8||p.z-radius< -4||p.z+radius>8)return false;
  for(const b of this.actors.values())if(b!==a&&!b.carried&&Math.hypot(p.x-b.root.position.x,p.z-b.root.position.z)<radius+this.radius(b)+.06)return false;
  return Math.hypot(p.x-this.options.player().x,p.z-this.options.player().z)>=radius+.36;
 }
 private life(a:Actor,delta:number){
  if(!a.life||!a.clock||!a.definition.profile.walk)return;
  const suspended=a.carried||!!a.transfer;a.growth?.advance(delta,suspended);a.root.scale.setScalar(a.growth?.snapshot().scale??1);
  if(a.idleSettlement)return;
  if(a.clock.snapshot().walking&&a.blend)return;
  const frame=a.life.advance(delta,{position:a.root.position,heading:a.root.rotation.y,scale:a.root.scale.x,walk:a.definition.profile.walk,actionActive:!!a.clock.snapshot().actionId,safe:p=>this.clearFor(a,p),suspended,court:{position:LUNAR_SHOWCASE_LAYOUT.courtStand,heading:LUNAR_SHOWCASE_LAYOUT.courtHeading,actions:['dribble','shoot']}});
  if(suspended)return;a.root.userData.lunarTurning=frame.walking&&frame.travelled===0&&frame.turnRadians!==0;if(frame.walking&&(!a.clock.snapshot().walking||a.blend)){a.clock.locomote(0);return;}a.root.position.x=frame.position.x;a.root.position.z=frame.position.z;a.root.position.y=this.options.groundHeight(a.root.position);a.root.rotation.y=frame.heading;
  // Straight stance phase follows exact travelled distance. A bounded in-place
  // turn uses actual articulated stepping, not a rigid mesh yaw snap.
  if(frame.walking)a.clock.locomote(frame.travelled>0?frame.travelled/(a.definition.profile.walk.strideMeters*a.root.scale.x)*a.definition.profile.walk.duration:frame.turnRadians!==0?delta*.9*LUNAR_LOCOMOTION_RATE:0);else a.clock.stopWalking();
  if(frame.playAction)a.clock.play(frame.playAction);
 }
 tick(deltaSeconds:number){
  if(this.disposed||this.paused||!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return;const elapsed=Math.min(deltaSeconds,.25),steps=Math.ceil(elapsed*LUNAR_LOCOMOTION_RATE/(1/60));for(let i=0;i<steps;i++)this.step(elapsed/steps);
 }
 private step(delta:number){
  for(const a of this.actors.values()){if(a.status!=='ready'||!a.clock)continue;const old=a.clock.snapshot().actionId,previousHeading=a.root.rotation.y,previousPosition={x:a.root.position.x,z:a.root.position.z},previousY=a.root.position.y;this.life(a,delta);a.clock.advance(delta);
   const mode=a.clock.snapshot().walking?(a.root.userData.lunarTurning?'turn':'walk'):'idle';if(mode!=='idle'&&mode!==a.motionMode){a.root.userData.lunarContactEpoch=(a.root.userData.lunarContactEpoch??0)+1;a.stance?.clear();a.root.position.set(previousPosition.x,previousY,previousPosition.z);a.root.rotation.y=previousHeading;a.blend={elapsed:0,from:capturePose(a.instance!.scene),fromY:previousY,replantFrom:a.footReplant?.capture()};}a.motionMode=mode;
   if(a.floor&&!a.carried&&!a.transfer)a.root.position.y=this.options.groundHeight(a.root.position);this.pose(a,delta,previousY);
   if(a.stance){const frame=a.clock.snapshot();if(frame.walking&&!a.carried&&!a.transfer)a.stance.solve({elapsed:frame.elapsed,duration:a.definition.profile.walk!.duration,revision:frame.revision,previousHeading,previousPosition,delta:delta*LUNAR_LOCOMOTION_RATE,turning:!!a.root.userData.lunarTurning});else if(!a.carried&&!a.transfer)a.stance.release(delta,frame.revision);else a.stance.clear();}if(a.blend?.replantFrom&&a.footReplant&&!a.blend.replantPlan)a.blend.replantPlan=a.footReplant.plan(a.blend.replantFrom,a.footReplant.capture());const displayBlend=a.blend;this.displayPose(a,delta);if(displayBlend?.replantPlan&&a.footReplant)a.footReplant.apply(displayBlend.replantPlan,displayBlend.elapsed);a.root.userData.lunarContactStage=a.clock.snapshot().walking?(a.blend?'replant':'contact'):'inactive';
   if(a.transfer){const t=a.transfer;t.elapsed+=delta*1000;const support=this.support(a),offset=support.clone().sub(a.root.position),goal=t.kind==='lift'?this.options.carrySupport():t.to.clone().add(offset);t.clearance=Math.max(t.clearance,goal.y+.08);const p=t.kind==='lift'?alpacaLiftSupportPoint({fromSupport:t.from,fromRoot:t.fromRoot,goalSupport:goal,currentSupportOffset:offset,clearanceY:t.clearance,elapsedMs:t.elapsed}):animalTransferPoint(t.from,goal,t.clearance,t.elapsed);this.placeSupport(a,new THREE.Vector3(p.x,p.y,p.z));if(t.elapsed>=ANIMAL_TRANSFER_DURATION_MS){if(t.kind==='lower'){a.root.position.copy(t.to);a.carried=false;}a.transfer=undefined;this.options.changed?.();}}
   else if(a.carried){a.root.rotation.y=this.options.playerHeading();this.placeSupport(a,this.options.carrySupport());}
   if(a.floor&&!a.carried&&!a.transfer)a.floor.correct(p=>this.options.groundHeight(p),a.definition.profile.actions.find(v=>v.id===a.clock!.snapshot().actionId)?.groundContact);this.ball(a);if(old!==a.clock.snapshot().actionId){if(a.definition.profile.actions.find(v=>v.id===old)?.idleBoundary){a.idleSettlement=old!;a.life?.rest(5);}if(a.finishing){a.finishing=false;a.life?.rest(10);}this.options.changed?.();}if(a.idleSettlement&&!a.blend){a.idleSettlement=undefined;this.options.changed?.();}
  }
  this.reportClock+=delta;if(this.reportClock>=.5){this.reportClock=0;this.options.changed?.();}
 }
 setPaused(paused:boolean){if(this.disposed)return;this.paused=paused;for(const a of this.actors.values())a.clock?.setPaused(paused);this.options.court?.setPaused(paused);}
 retry(id:LunarShowcaseId){const a=this.actors.get(id);if(!this.disposed&&a?.status==='failed')void this.load(a,true);}
 dispose(){if(this.disposed)return;this.disposed=true;this.options.court?.cancel();for(const a of this.actors.values()){a.clock?.dispose();a.mixer?.stopAllAction();if(a.instance)a.mixer?.uncacheRoot(a.instance.scene);a.instance?.release();a.root.removeFromParent();}this.root.clear();this.root.removeFromParent();this.library.dispose();}
}
