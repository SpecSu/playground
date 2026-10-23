import {applyCommand,projectedPosition} from '../game/state.js';
import {planFreeWalk} from '../game/movement.js';
import {pathDistance} from '../game/grid.js';
import {ECONOMY} from '../game/economy.js';
/** Prediction is presentation only: it never owns coins, inventory or random products. */
export function createVisualMotion({localNow=()=>performance.now()}={}){let sequence=0,active=null,authority=null,owner=null;return {
 predict(game,island,command,position,now){
  let pending;
  if(command.type==='move'){
   const path=planFreeWalk(island,position,command.point);if(!path)return null;
   const arriveAt=now+Math.ceil(pathDistance(path)*ECONOMY.walkSecondsPerCell*1000);
   pending={id:`local-${++sequence}`,action:'move',path,startedAt:now,arriveAt,finishAt:arriveAt};
  }else if(command.type==='begin-work'){
   const result=applyCommand({...game,position:{...position},pending:null},command,{now,seed:1,newId:()=>`local-${++sequence}`});pending=result.state.pending;
  }else return null;
  active={token:pending.id,position:{...position},pending,serverId:null,ackRevision:null,inputAt:now,localStartedAt:localNow()};return active.token;
 },
 observe(next,{islandUid,revision=0}={}){
  authority=next;if(owner!==null&&owner!==islandUid)active=null;owner=islandUid;
  if(active?.serverId){
   if(next.pending&&next.pending.id!==active.serverId&&revision>active.ackRevision)active=null;
   else if(!next.pending&&revision>active.ackRevision)active=null;
  }
 },
 acknowledge(token,pending,revision){if(active?.token!==token||!pending)return;active.serverId=pending.id;active.ackRevision=revision;},
 reject(token,{uncertain=false}={}){if(active?.token===token&&!uncertain)active=null;},
 cancel(){if(!active)return;const pos=projectedPosition(active,active.pending?active.pending.startedAt+localNow()-active.localStartedAt:Date.now());active={...active,position:pos,pending:null};},
 clear(){active=null;},
 clock(serverNow){return active?.pending?active.pending.startedAt+localNow()-active.localStartedAt:serverNow;},
 state(){return active??authority;},
 current(){return active;},
 position(now){const s=active??authority;return s?projectedPosition(s,now):null;},
 };}
