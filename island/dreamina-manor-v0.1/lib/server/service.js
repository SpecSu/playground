import {performJournalRecovery} from './journal-recovery.js';
import {ensureLocalSync,performLocalBatch,validateLocalOperations} from './local-batch.js';
import {isDemoUid} from '../game/demo-catalogue.js';
import {applyCommand,normalizeUid,publicGame,GameError} from '../game/state.js';
import {secureSeed} from '../game/random.js';
import {SOCIAL_FIELDS,performSocial,socialResponse} from './social-commands.js';
import {visitPosition} from './social-store.js';
const fields={...SOCIAL_FIELDS,'sync-local':['operations'],'recover-local-journal':['base','operations'],
 'construct':['kind','cells'],'buy-input':['kind','tier'],'emergency-seed':[],
 'begin-work':['action','target','tier','itemId','destination','catalogueVersion'],'cancel-work':['intentId'],
 'finish-work':['intentId'],'hold':['itemId'],'store-hand':[],'sell':['itemId'],
 'expand-land':['cell'],'build-dock':['cell'],'build-tank':['cells'],'profile':['name','avatar'],
};
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
export function parseCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(fields,value.type))throw new GameError('BAD_COMMAND','换个操作试试',400);
 if(Object.keys(value).some(k=>k!=='type'&&!fields[value.type].includes(k)))throw new GameError('BAD_COMMAND','更新页面后再试试',400);
 if(value.type==='cancel-work'&&!identifier(value.intentId))throw new GameError('STALE_ACTION','这次操作已经结束了',409);
 if(JSON.stringify(value).length>(value.type==='recover-local-journal'?524288:value.type==='sync-local'?48000:2000))throw new GameError('BAD_COMMAND','这次内容太长了',400);
 if(value.type==='sync-local'){validateLocalOperations(value.operations);for(const op of value.operations)parseCommand(op.command);}
 return structuredClone(value);
}
export function validateEnvelope(body){if(!body||body.schemaVersion!==1)throw new GameError('CLIENT_UPGRADE_REQUIRED','更新一下页面，再继续玩吧',426);const uid=normalizeUid(body.uid);if(!identifier(body.opId)||!identifier(body.sessionId))throw new GameError('BAD_REQUEST','重新打开页面再试试',400);return {uid,opId:body.opId,sessionId:body.sessionId,command:parseCommand(body.command)};}
async function requestHash(command){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(command)));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function performCommand(store,body,now=Date.now()){
 const {uid,opId,sessionId,command}=validateEnvelope(body),hash=await requestHash(command);if(isDemoUid(uid))throw new GameError('DEMO_ISLAND','这是一座演示庄园，从自己的庄园来参观吧',403);if(command.type==='recover-local-journal'){const receipt=await performJournalRecovery(store,{uid,opId,sessionId,command},now);return socialResponse(store,uid,sessionId,receipt,now);}
 await store.ensure(uid,now);
 if(command.type==='sync-local'){const receipt=await performLocalBatch(store,{uid,opId,sessionId,command},now);return socialResponse(store,uid,sessionId,receipt,now);}
 if(Object.hasOwn(SOCIAL_FIELDS,command.type))return performSocial(store,{uid,opId,sessionId,command},hash,now);
 const seed=secureSeed();
 for(let attempt=0;attempt<6;attempt++){
  const recorded=await store.receipt(uid,opId);if(recorded){if(recorded.hash!==hash)throw new GameError('OPERATION_CONFLICT','这次操作已结束，重新点一下吧');return socialResponse(store,uid,sessionId,recorded.receipt,now,true);}
  const game=await store.read(uid);let visit=await store.readVisit(sessionId);
  const worldCommand=['construct','begin-work','finish-work','cancel-work','expand-land','build-dock','build-tank'].includes(command.type);
  if(worldCommand&&!visit){await store.visit(sessionId,uid,uid,now);visit=await store.readVisit(sessionId);}
  if(worldCommand&&visit?.islandUid!==uid&&!(command.type==='finish-work'&&game.pending?.id===command.intentId))throw new GameError('OWN_ISLAND_REQUIRED','回自己的庄园再做吧');
  if(command.type==='begin-work'&&game.pending){const p=game.pending;if(p.operationId!==opId)throw new GameError('WORK_IN_PROGRESS','手边的事还没好，马上继续');}
  const working=worldCommand&&visit?.islandUid===uid&&visit?.state.pending?{...game,position:visitPosition(visit,game,now),pending:null}:game;
  let result;try{result=applyCommand(working,command,{now,seed,operationId:opId,sessionId,newId:()=>crypto.randomUUID()});}catch(e){if(command.type!=='finish-work'||!(e instanceof GameError)||['STILL_APPROACHING','STALE_ACTION'].includes(e.code))throw e;result=applyCommand(working,{type:'cancel-work'},{now,seed});result.receipt={type:command.type,action:'interrupted',message:e.message};}

  // A no-op still receives an atomic receipt, so a retry cannot later become a different operation.
  const next=result.changed?result.state:{...game,revision:game.revision+1,updatedAt:now};
  const committed=worldCommand&&visit?.islandUid===uid&&result.changed?await store.commitVisit(game,visit,{position:next.position,pending:null},opId,hash,result.receipt,now,next):await store.commit(uid,game.revision,next,opId,hash,result.receipt,now);
  if(committed)return socialResponse(store,uid,sessionId,result.receipt,now);
 }
 throw new GameError('BUSY','刚刚有变化，再试一下',409);
}
export async function readGame(store,{uid,islandUid,sessionId},now=Date.now()){
 uid=normalizeUid(uid);islandUid=normalizeUid(islandUid??uid);if(!identifier(sessionId))throw new GameError('BAD_SESSION','重新打开页面再试试',400);
 if(isDemoUid(uid))throw new GameError('DEMO_ISLAND','这是一座演示庄园，从自己的庄园来参观吧',403);const ensured=await ensureLocalSync(store,await store.ensure(uid,now),now);const island=islandUid===uid?ensured:isDemoUid(islandUid)?await store.ensure(islandUid,now):await store.read(islandUid);const visibleIsland=island?await store.migrateHousing(island,now):island;const visit=await store.visit(sessionId,uid,islandUid,now,visibleIsland);const [self,presence]=await Promise.all([islandUid===uid?ensured:store.read(uid),store.presence(islandUid,now)]);
 return {game:publicGame(self,now),island:publicGame(visibleIsland,now,{viewerUid:uid}),presence,visit,messages:await store.messages(islandUid,now),serverNow:now};
}
