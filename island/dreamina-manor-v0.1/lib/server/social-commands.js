import{constructionView}from'../game/construction.js';
import {GameError,publicGame,projectedPosition} from '../game/state.js';
import {prepareSocial,finishSocial} from './social-service.js';
import {visitPosition} from './social-store.js';
import {planFreeWalk} from '../game/movement.js';
import {pathDistance} from '../game/grid.js';
import {ECONOMY} from '../game/economy.js';
export const SOCIAL_FIELDS=Object.freeze({'begin-social':['action','jobId','targetUid','itemId'],'finish-social':['intentId'],'cancel-social':[],'move':['point'],'finish-move':['intentId'],'chat':['message','islandUid']});
const fail=(code,message,status=409)=>{throw new GameError(code,message,status);};
export async function performSocial(store,{uid,sessionId,opId,command},hash,now){
 for(let attempt=0;attempt<6;attempt++){
  const saved=await store.receipt(uid,opId);if(saved){if(saved.hash!==hash)fail('OPERATION_CONFLICT','这次操作已结束，重新点一下吧');return socialResponse(store,uid,sessionId,saved.receipt,now,true);}
  const [game,visit]=await Promise.all([store.read(uid),store.readVisit(sessionId)]);
  if(!visit||visit.uid!==uid||visit.updatedAt<=now-15000)fail('VISIT_EXPIRED','重新进入这个庄园再试试');
  if(game.pending&&['move','begin-social'].includes(command.type))fail('WORK_PENDING','手边的事还没好，马上继续');
  if(command.type==='move'){
   const island=constructionView(await store.read(visit.islandUid),now),from=visitPosition(visit,game,now),path=planFreeWalk(island,from,command.point);if(!path)fail('NO_PATH','那里暂时走不到');
   const arriveAt=now+Math.ceil(pathDistance(path)*ECONOMY.walkSecondsPerCell*1000),pending={id:crypto.randomUUID(),action:'move',path,startedAt:now,arriveAt,finishAt:arriveAt};
   const next={position:from,pending},receipt={type:'move',intentId:pending.id},nextGame={...game,revision:game.revision+1,updatedAt:now};if(visit.islandUid===uid){nextGame.position=from;nextGame.pending=null;}
   if(await store.commitVisit(game,visit,next,opId,hash,receipt,now,nextGame))return socialResponse(store,uid,sessionId,receipt,now);
  }else if(command.type==='finish-move'){
   const p=visit.state.pending;if(!p||p.id!==command.intentId||p.action!=='move')fail('STALE_ACTION','已经走到了');if(now<p.finishAt)fail('STILL_APPROACHING','再走一会儿');
   const position=projectedPosition(visit.state,now),nextGame={...game,revision:game.revision+1,updatedAt:now};if(visit.islandUid===uid)nextGame.position=position;
   const receipt={type:'finish-move'};if(await store.commitVisit(game,visit,{position,pending:null},opId,hash,receipt,now,nextGame))return socialResponse(store,uid,sessionId,receipt,now);
  }else if(command.type==='begin-social'){
   const working={...game,position:visitPosition(visit,game,now),pending:visit.islandUid===uid?null:game.pending},next=await prepareSocial(store,working,visit,command,now),receipt={type:command.type,intentId:next.pending.id};
   if(await store.commitVisit(game,visit,next,opId,hash,receipt,now,{...game,position:visit.islandUid===uid?working.position:game.position,pending:null,revision:game.revision+1,updatedAt:now}))return socialResponse(store,uid,sessionId,receipt,now);
  }else if(command.type==='cancel-social'){
   const next={position:visitPosition(visit,game,now),pending:null},updatedGame={...game};if(visit.islandUid===uid)updatedGame.position=next.position;
   const receipt={type:command.type};if(await store.commitVisit(updatedGame,visit,next,opId,hash,receipt,now))return socialResponse(store,uid,sessionId,receipt,now);
  }else if(command.type==='finish-social'){
   let result;
   try{result=await finishSocial(store,game,visit,command.intentId,now);}catch(e){
    if(!(e instanceof GameError)||['STILL_APPROACHING','STALE_ACTION','VISIT_EXPIRED'].includes(e.code))throw e;
    const next={position:visitPosition(visit,game,now),pending:null},updatedGame={...game};if(visit.islandUid===uid)updatedGame.position=next.position;
    const receipt={type:command.type,action:'interrupted',message:e.message};if(await store.commitVisit(updatedGame,visit,next,opId,hash,receipt,now))return socialResponse(store,uid,sessionId,receipt,now);continue;
   }
   if(await store.commitTransfer(game,result.other,result.nextActor,result.nextOther,visit,result.nextVisit,opId,hash,result.receipt,now,result.targetPresence))return socialResponse(store,uid,sessionId,result.receipt,now);
  }else if(command.type==='chat'){
   if(typeof command.islandUid!=='string'||command.islandUid!==visit.islandUid)fail('STALE_CHAT','已经离开原来的岛，这句话没有发出');
   if(typeof command.message!=='string')fail('BAD_MESSAGE','写一句话再发送吧',400);const message=command.message.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');if(!message||message.length>140)fail('BAD_MESSAGE','写1到140个字就好',400);
   const previous=await store.lastMessage(uid);if(previous&&now-previous.createdAt<800)fail('CHAT_WAIT','慢一点，再发一句');
   const receipt={type:command.type,messageId:opId};if(await store.commitChat(game,visit,message,opId,hash,receipt,now))return socialResponse(store,uid,sessionId,receipt,now);
  }else fail('BAD_COMMAND','换个操作试试',400);
 }
 fail('BUSY','刚刚有变化，再试一下');
}
export async function socialResponse(store,uid,sessionId,receipt,now,replayed=false){
 const game=await store.read(uid),visit=await store.readVisit(sessionId),island=visit?await store.read(visit.islandUid):game;
 return {game:publicGame(game,now),island:publicGame(island,now,{viewerUid:uid}),visit:visit?{...visit.state,position:visitPosition(visit,game,now),revision:visit.revision,islandUid:visit.islandUid}:null,presence:await store.presence(island.ownerUid,now),messages:await store.messages(island.ownerUid,now),receipt,serverNow:now,replayed};
}
