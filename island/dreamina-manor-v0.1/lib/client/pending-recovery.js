import {RECOVERY_COUNT,RECOVERY_OPERATION_ID} from '../game/journal-recovery.js';
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);

/** A tab session is not the owner of a UID's already persisted local ledger batch.
 * Only replay that exact batch; do not adopt scene-bound social commands here. */
export function recoverableLocalBatch(body,uid){
 const operations=body?.command?.operations,type=body?.command?.type;
 if(body?.schemaVersion!==1||body.uid!==uid||!identifier(body.sessionId)||!identifier(body.opId)||!['sync-local','recover-local-journal'].includes(type))return false;
 if(type==='recover-local-journal'&&(body.opId!==RECOVERY_OPERATION_ID||body.command.base?.ownerUid!==uid||operations?.length!==RECOVERY_COUNT))return false;
 return Array.isArray(operations)&&operations.length>0&&operations.length<=(type==='recover-local-journal'?RECOVERY_COUNT:24)
  &&operations.every(op=>identifier(op?.id))&&new Set(operations.map(op=>op.id)).size===operations.length;
}

/** A successful HTTP response is not enough to remove a recovered pending body. */
export function confirmsEntireLocalBatch(body,data){
 if(data?.game?.ownerUid!==body.uid||data?.receipt?.type!=='sync-local')return false;
 const results=data.receipt.results,ids=body.command.operations.map(op=>op.id);
 return Array.isArray(results)&&results.length===ids.length&&new Set(results.map(r=>r.id)).size===ids.length
  &&results.every(r=>ids.includes(r.id)&&r.status==='confirmed');
}
