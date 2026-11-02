import {GameError} from '../game/state.js';
import {applyLocalOperation,LOCAL_COMMANDS} from '../game/local-operations.js';
import {secureSeed} from '../game/random.js';
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,'0')).join('');
export async function ensureLocalSync(store,game,now){
 if(game.localSync||game.demo)return game;
 for(let attempt=0;attempt<6;attempt++){
  if(game.localSync)return game;
  const next={...game,revision:game.revision+1,localSync:{seed:secureSeed(),sequence:0,epoch:crypto.randomUUID(),issuedAt:now}};
  if(await store.commit(game.ownerUid,game.revision,next,'local-sync-bootstrap-v1','metadata-v1',{type:'local-sync-bootstrap'},now))return next;
  game=await store.read(game.ownerUid);
 }throw new GameError('BUSY','正在连上庄园，请稍后再试');
}
export function validateLocalOperations(operations){
 if(!Array.isArray(operations)||!operations.length||operations.length>24)throw new GameError('BAD_BATCH','重新连接后再试',400);
 const seen=new Set();for(const op of operations){if(!op||!id(op.id)||seen.has(op.id)||!LOCAL_COMMANDS.has(op.command?.type)||!Array.isArray(op.dependsOn)||op.dependsOn.length>24||op.dependsOn.some(x=>!id(x)||x===op.id)||Object.keys(op).some(k=>!['id','command','startedAt','at','dependsOn','sequence','epoch'].includes(k)))throw new GameError('BAD_BATCH','这次操作需要重新选择',400);seen.add(op.id);}
 return operations;
}
export async function performLocalBatch(store,{uid,sessionId,command},now){
 const operations=validateLocalOperations(command.operations),results=[];
 // Every operation below applies only to the envelope UID's ledger. Visiting cannot retarget it.

 for(const op of operations){const requestHash=await hash(op);let finished=false;
  for(let attempt=0;attempt<6&&!finished;attempt++){
   const recorded=await store.receipt(uid,op.id);if(recorded){if(recorded.hash!==requestHash)throw new GameError('OPERATION_CONFLICT','同一操作的内容变了，请重新连接');results.push({id:op.id,...recorded.receipt,replayed:true});finished=true;break;}
   let rejection=null;for(const dependency of op.dependsOn){const r=await store.receipt(uid,dependency);if(!r||r.receipt.status==='rejected'){rejection={code:'DEPENDENCY_REJECTED',message:'前面的操作没有完成，这次没有扣除东西'};break;}}
   const game=await store.read(uid);let next,receipt;
   try{if(rejection)throw Object.assign(new GameError(rejection.code,rejection.message),rejection);if(game.pending)throw new GameError('WORK_IN_PROGRESS','先接好原来的操作');const applied=applyLocalOperation(game,op,{serverNow:now});next=applied.state;receipt={...applied.receipt,status:'confirmed'};}
   catch(e){if(!(e instanceof GameError))throw e;if(['WORK_IN_PROGRESS'].includes(e.code))throw e;next={...game,revision:game.revision+1};receipt={type:'local-operation',status:'rejected',code:e.code,message:e.message,...(e.requiredNxN?{requiredNxN:e.requiredNxN}:{}),...(e.requiredNxM?{requiredNxM:e.requiredNxM}:{}),...(e.requiredWaterHeight?{requiredWaterHeight:e.requiredWaterHeight}:{})};}
   // Each prefix is independently atomic and recoverable with exactly the same ID.
   next.updatedAt=now;next.localSync={...next.localSync,applied:[...(next.localSync?.applied??[]).filter(r=>r.id!==op.id),{id:op.id,...receipt}].slice(-256)};if(await store.commit(uid,game.revision,next,op.id,requestHash,receipt,now)){results.push({id:op.id,...receipt});finished=true;}
  }if(!finished)throw new GameError('BUSY','正在同步，稍后会接上');
 }
 return {type:'sync-local',results};
}
