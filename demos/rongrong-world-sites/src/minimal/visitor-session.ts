import {advanceMinimalState,minimalCommand,isWalkableTile,type MinimalState,type MinimalCommand,type Point} from './model.ts';
import type {BoardingTarget} from './boarding-target.ts';
import {sampleFarm} from './sample-farms.ts';
import {isAnimalRuntimeActive} from './species.ts';
import type {PlayerMotionSnapshot} from './player-motion.ts';
export type VisitTarget=BoardingTarget;
export type VisitorCommand={type:'move';to:Point}|{type:'pickup'|'care';animalId:string}|{type:'putdown';at?:Point};
export type VisitorReply={accepted:boolean;message:string;state:MinimalState};
const clone=<T>(v:T):T=>structuredClone(v);
const clean=(state:MinimalState):MinimalState=>({...clone(state),coins:0,eggs:[],gifts:[],collection:[],lastCompanionGiftDay:undefined,lastHatch:null,lastBreeding:null,nextWolfAt:Number.MAX_SAFE_INTEGER,wolfEvent:null,carriedAnimalId:null,playerPath:[],playerSpeed:0,animals:state.animals.map(a=>({...clone(a),activity:a.activity==='carried'?'idle':a.activity}))});
const point=(v:unknown):v is Point=>!!v&&typeof v==='object'&&Number.isFinite((v as Point).x)&&Number.isFinite((v as Point).z);
/** No persistence, transport, wallet or canonical-farm reference exists in this adapter.
 * Even direct command callers only receive temporary display capabilities. */
export class VisitorSession{
 private current:MinimalState;private baseline:MinimalState;private epoch=1;private disposed=false;private targetValue:VisitTarget;
 readonly mode:'sample'|'real-readonly';
 private constructor(target:VisitTarget,state:MinimalState){this.targetValue=clone(target);this.mode=target.kind==='sample'?'sample':'real-readonly';this.current=clean(state);this.baseline=clone(this.current);}
 static sample(sampleId:string,now:number){return new VisitorSession({kind:'sample',sampleId},sampleFarm(sampleId,now).state);}
 static readonly(target:Extract<VisitTarget,{kind:'real'}>,state:MinimalState,_now:number){return new VisitorSession(target,state);}
 get state(){return clone(this.current);}
 get target(){return clone(this.targetValue);}
 get token(){return this.epoch;}
 get active(){return !this.disposed;}
 ownerOf(id:string):VisitTarget|null{return this.baseline.animals.some(a=>a.id===id)?clone(this.targetValue):null;}
 private reply(accepted:boolean,message:string):VisitorReply{return {accepted,message,state:this.state};}
 command(input:unknown,now:number,token=this.epoch):VisitorReply{
  if(this.disposed||token!==this.epoch)return this.reply(false,'这次串门已经结束');
  const c=input as VisitorCommand;if(!c||typeof c!=='object'||!['move','pickup','putdown','care'].includes(c.type))return this.reply(false,'串门只能走动、举起、放下和打招呼');
  if(!Number.isFinite(now)||c.type==='move'&&!point(c.to)||c.type==='putdown'&&c.at!==undefined&&!point(c.at)||['pickup','care'].includes(c.type)&&typeof (c as {animalId?:unknown}).animalId!=='string')return this.reply(false,'这次操作无效');
  if(c.type==='care'){
   const a=this.current.animals.find(a=>a.id===c.animalId);if(!a||a.id===this.current.carriedAnimalId||Math.hypot(a.position.x-this.current.player.x,a.position.z-this.current.player.z)>1.6)return this.reply(false,'先走到小伙伴身边');
   if(!isAnimalRuntimeActive(a))return this.reply(false,'这位伙伴的模型暂不可用，不能互动');
   // Deliberately do not run canonical care: it can award daily coins and bond.
   return this.reply(true,`${a.name}开心地回应了你 · 临时互动`);
  }
  const result=minimalCommand(this.current,c as MinimalCommand,now);
  if(!result.accepted)return this.reply(false,result.message);
  this.current={...result.state,coins:0,eggs:[],gifts:[],lastCompanionGiftDay:undefined};
  return this.reply(true,c.type==='pickup'?'举起来啦 · 只在这次串门中陪你玩':c.type==='putdown'?'小伙伴稳稳落地':result.message);
 }
 tick(now:number,motion?:PlayerMotionSnapshot):MinimalState{
  if(this.disposed||!Number.isFinite(now))return this.state;
  this.current=advanceMinimalState(this.current,now);
  if(motion&&point(motion.position)&&isWalkableTile(this.current,motion.position)){this.current.player=clone(motion.position);this.current.playerPath=clone(motion.path);this.current.playerSpeed=motion.speed;const a=this.current.animals.find(a=>a.id===this.current.carriedAnimalId);if(a)a.position=clone(motion.position);}
  this.current.coins=0;this.current.eggs=[];this.current.gifts=[];return this.state;
 }
 stop(motion?:PlayerMotionSnapshot){if(this.disposed)return;if(motion&&point(motion.position)&&isWalkableTile(this.current,motion.position))this.current.player=clone(motion.position);this.current.playerPath=[];this.current.playerSpeed=0;}
 switchSample(sampleId:string,now:number){if(this.disposed||this.mode!=='sample')return false;const next=sampleFarm(sampleId,now).state;this.epoch++;this.targetValue={kind:'sample',sampleId};this.current=clean(next);this.baseline=clone(this.current);return true;}
 async refresh(load:()=>Promise<MinimalState>):Promise<boolean>{const token=this.epoch;if(this.disposed)return false;const next=await load();if(this.disposed||token!==this.epoch)return false;
  // A refresh cannot introduce foreign assets under the existing host identity.
  const ids=new Set(this.baseline.animals.map(a=>a.id));if(next.animals.some(a=>!ids.has(a.id)))return false;
  this.epoch++;this.current=clean(next);this.baseline=clone(this.current);return true;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.epoch++;this.current=clone(this.baseline);this.current.carriedAnimalId=null;this.current.playerPath=[];}
}
