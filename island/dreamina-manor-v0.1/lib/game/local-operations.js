import{constructionView}from'./construction.js';
import {applyCommand,GameError} from './state.js';
import {planFreeWalk} from './movement.js';
import {pathDistance} from './grid.js';
import {ECONOMY} from './economy.js';
export const LOCAL_COMMANDS=new Set(['construct','buy-input','emergency-seed','begin-work','hold','store-hand','sell','expand-land','build-dock','build-tank','profile','move']);
const fail=(code,message)=>{throw new GameError(code,message);};
export function productionSeed(sync,sequence){let n=(sync.seed^Math.imul(sequence+1,0x9e3779b9))>>>0;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return(n^(n>>>16))>>>0;}
export function planLocalOperation(game,command,{id,now,dependsOn=[]}={}){
 game=constructionView(game,now);const op={id,command:structuredClone(command),startedAt:Math.round(now),at:Math.round(now),dependsOn:[...dependsOn]};
 if(command.type==='begin-work'){
  const p=applyCommand({...game,pending:null},command,{now:op.startedAt,newId:()=>id,operationId:id}).state.pending;
  op.at=p.finishAt;op.motion={position:game.position,pending:p};
  if(['plant','fish'].includes(command.action)){if(!game.localSync)fail('SYNC_STARTING','还没连上庄园');op.sequence=game.localSync.sequence;op.epoch=game.localSync.epoch;}
 }else if(command.type==='move'){
  const path=planFreeWalk(game,game.position,command.point);if(!path)fail('NO_PATH','那里暂时走不到');op.at+=Math.ceil(pathDistance(path)*ECONOMY.walkSecondsPerCell*1000);op.motion={position:game.position,pending:{id,action:'move',path,startedAt:op.startedAt,arriveAt:op.at,finishAt:op.at}};
 }
 return op;
}
export function applyLocalOperation(original,op,{serverNow=null}={}){
 const c=op.command;if(!LOCAL_COMMANDS.has(c?.type))fail('BAD_COMMAND','换个操作试试');
 if(!Number.isSafeInteger(op.at)||!Number.isSafeInteger(op.startedAt)||op.at<op.startedAt)fail('BAD_TIME','这次操作时间不对，请再试一次');
 if(serverNow!==null&&(op.at>serverNow+1500||serverNow-op.at>86400000||op.startedAt<(original.localSync?.issuedAt??0)))fail('BAD_TIME','离开太久了，请重新操作');
 const s=structuredClone(constructionView(original,op.startedAt));s.pending=null;let result;
 if(c.type==='begin-work'){
  const producing=['plant','fish'].includes(c.action),sync=s.localSync;
  if(producing&&(!sync||op.epoch!==sync.epoch||op.sequence!==sync.sequence))fail('DRAW_CONFLICT','另一处刚有变化，这次操作没有扣除种子');
  const planned=applyCommand(s,c,{now:op.startedAt,newId:()=>op.id,operationId:op.id}).state;
  if(op.at<planned.pending.finishAt)fail('BAD_TIME','还没走到这里');
  result=applyCommand(planned,{type:'finish-work',intentId:op.id},{now:op.at,seed:producing?productionSeed(sync,op.sequence):0,newId:()=>op.id});
  if(producing)result.state.localSync={...sync,sequence:sync.sequence+1};
 }else if(c.type==='move'){
  const p=planLocalOperation(s,c,{id:op.id,now:op.startedAt});if(op.at<p.at)fail('BAD_TIME','还没走到这里');result={state:{...s,position:{...p.motion.pending.path.at(-1)},revision:s.revision+1,updatedAt:op.at},receipt:{type:'move'},changed:true};
 }else result=applyCommand(s,c,{now:op.at,newId:()=>op.id});
 result.receipt={...result.receipt,localOperationId:op.id};
 return result;
}
export function operationResourceKeys(command){const c=command,keys=[];if(['construct','buy-input','sell','expand-land','build-dock','build-tank','emergency-seed'].includes(c.type))keys.push('coins');if(c.type==='buy-input')keys.push(`${c.kind}:${c.tier}`);if(c.type==='emergency-seed')keys.push('seed:1');if(c.type==='begin-work'){if(c.action==='plant'||c.action==='fish')keys.push(`${c.action==='plant'?'seed':'bait'}:${c.tier}`,'draw');if(c.target)keys.push(`cell:${c.target.kind}:${c.target.cell.x}:${c.target.cell.z}`);keys.push('position','layout');if(c.action==='harvest')keys.push('hand');}if(c.type==='move')keys.push('position','layout');if(['expand-land','build-dock','build-tank'].includes(c.type))keys.push('layout');if(c.type==='construct')keys.push('layout',...c.cells.map(p=>`build:${p.x}:${p.z}`));if(c.itemId)keys.push(`item:${c.itemId}`);if(['hold','store-hand'].includes(c.type)||c.destination==='hand')keys.push('hand');return keys;}
