import {GameError} from '../game/state.js';
import {applyLocalOperation} from '../game/local-operations.js';
import {constructionView} from '../game/construction.js';
import {migrateFishHousing} from '../game/fish-housing.js';
import {RECOVERY_COUNT,RECOVERY_COMMITMENT,RECOVERY_OPERATION_ID,recoveryAssets,recoveryDigest,canonical} from '../game/journal-recovery.js';
const fail=(code,message)=>{throw new GameError(code,message);};
const hash=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function performJournalRecovery(store,{uid,opId,command},now){
 const {base,operations}=command;
 if(opId!==RECOVERY_OPERATION_ID||!base||base.ownerUid!==uid||!Array.isArray(operations)||operations.length!==RECOVERY_COUNT)fail('RECOVERY_MISMATCH','这份记录需要保留，暂未写回');
 const digest=await recoveryDigest({uid,base,operations});
 if(digest!==RECOVERY_COMMITMENT)fail('RECOVERY_MISMATCH','这份记录与已核对的记录不同，暂未写回');
 const recorded=await store.receipt(uid,opId);
 if(recorded){if(recorded.hash!==digest)fail('RECOVERY_MISMATCH','恢复记录不一致');return recorded.receipt;}
 const current=await store.read(uid);
 if(!current||canonical(recoveryAssets(current))!==canonical(recoveryAssets(base)))fail('RECOVERY_ASSET_CONFLICT','云端已有新的物品变化，已保留本机记录，暂未覆盖');
 if(current.pending)fail('RECOVERY_ASSET_CONFLICT','云端仍有动作未完成，暂未写回');
 const previous=await store.recoveryReceipts(uid,[...new Set(operations.flatMap(op=>[op.id,...op.dependsOn]))]);
 let next=structuredClone(current);next.position=structuredClone(base.position);const records=[],confirmed=new Set();
 for(const op of operations){
  if(confirmed.has(op.id)||previous.get(op.id))fail('RECOVERY_PREFIX_CONFLICT','已有部分操作记录，暂未重复写回');
  for(const dependency of op.dependsOn){if(confirmed.has(dependency))continue;const r=previous.get(dependency);if(!r||r.receipt.status==='rejected')fail('RECOVERY_DEPENDENCY','前面的记录尚未确认，暂未写回');}
  const result=applyLocalOperation(next,op,{serverNow:now,approvedLegacyHousing:true});next=result.state;
  const receipt={...result.receipt,status:'confirmed'};records.push({id:op.id,hash:await hash(op),receipt});confirmed.add(op.id);
 }
 next=constructionView(next,now);next=migrateFishHousing({...next,fishHousingVersion:0},now).state;
 // Current device movement and metadata are not a historical ledger replay target.
 next.position=structuredClone(current.position);if(canonical(current.profile)!==canonical(base.profile))next.profile=structuredClone(current.profile);
 next.revision=current.revision+1;next.updatedAt=now;
 const results=records.map(r=>({id:r.id,...r.receipt}));next.localSync={...next.localSync,applied:[...(current.localSync?.applied??[]).filter(r=>!confirmed.has(r.id)),...results].slice(-256)};
 const receipt={type:'sync-local',recovery:RECOVERY_OPERATION_ID,sourceRevision:current.revision,results};records.push({id:opId,hash:digest,receipt});
 if(!await store.commitRecovery(uid,current.revision,next,records,now))fail('RECOVERY_CONCURRENT_CHANGE','云端刚有新变化，已保留记录，请重新确认');
 return receipt;
}
