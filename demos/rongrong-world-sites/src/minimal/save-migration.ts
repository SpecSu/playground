import {diagnoseRejectedFarmSave,type FarmSaveDiagnostic} from './farm-save-diagnostics.ts';
import {naturalBiomeTarget} from './terrain-progression.ts';
import {advanceMinimalState,createMinimalState,validateMinimalSave,validateLegacyMinimalSave,MINIMAL_STORAGE_KEY,LEGACY_MINIMAL_STORAGE_KEY,type MinimalState,type LegacyMinimalState,type MinimalStorage} from './model.ts';
import {EGG_THEMES,themeForNaturalTerrain,type EggTheme} from './egg-catalog.ts';
import {planNaturalBiomes} from './natural-biome-layout.ts';
import {FarmSaveGuard} from './save-guard.ts';
/** Exact source bytes (or JSON null for a fresh farm), never a mutable mirror of v2. */
export const LEGACY_BACKUP_KEY='dreamina-egg-farm-v2-upgrade-backup';
export const LEGACY_ACK_KEY='dreamina-egg-farm-v3-legacy-ack';
/** Separate anonymous-local format: V27 must never see new-species progress. */
export const LOCAL_HUNYUAN_STORAGE_KEY='dreamina-egg-farm-local-hunyuan-v1';
export function migrateLegacyFarm(legacy:LegacyMinimalState):MinimalState{
 const old=structuredClone(legacy),layout=planNaturalBiomes(old),explored=new Set<EggTheme>(['grassland',...layout.compatibilityGrants]);
 for(const tile of layout.tiles)if(tile.owned){const theme=themeForNaturalTerrain(tile.naturalTerrain!);if(theme)explored.add(theme);}
 const grants:EggTheme[]=[...layout.compatibilityGrants];for(const theme of ['forest','wetland'] as const)if(!explored.has(theme)&&!naturalBiomeTarget({tiles:layout.tiles},theme)){explored.add(theme);grants.push(theme);}
 return {...old,version:3,biomeLayoutVersion:1,tiles:layout.tiles,exploredBiomes:EGG_THEMES.filter(t=>explored.has(t)),...(grants.length?{biomeCompatibilityGrants:EGG_THEMES.filter(t=>grants.includes(t)),biomeCompatibilityReason:'legacy-no-reachable-natural-target' as const}:{})};
}
export type DecodedFarm={kind:'current'|'migrated';state:MinimalState}|{kind:'invalid'|'future'};
export function decodeFarmSave(raw:string):DecodedFarm{
 try{const value:unknown=JSON.parse(raw);if(validateMinimalSave(value))return {kind:'current',state:value};if(validateLegacyMinimalSave(value)){const state=migrateLegacyFarm(value);return validateMinimalSave(state)?{kind:'migrated',state}:{kind:'invalid'};}if(value&&typeof value==='object'&&'version'in value&&typeof value.version==='number'&&value.version>3)return {kind:'future'};}catch{/* Preserve unknown raw bytes. */}
 return {kind:'invalid'};
}
export type FarmSession={state:MinimalState;guard:FarmSaveGuard|null;status:'ready'|'unavailable'|'blocked'|'conflict';migrated:boolean;currentRaw:string|null;conflictKind?:'legacy-diverged';diagnostic?:FarmSaveDiagnostic};
/** Optimistic observed-write protection, not a cross-tab atomic storage lock. */
export function openFarmSession(storage:MinimalStorage,now:number,options:{localHunyuan?:boolean}={}):FarmSession{
 if(options.localHunyuan)return openLocalHunyuanFarmSession(storage,now);
 let state:MinimalState|undefined,guard:FarmSaveGuard|null=null,migrated=false,currentRaw:string|null=null,conflictKind:FarmSession['conflictKind'],diagnostic:FarmSaveDiagnostic|undefined;
 const result=(status:FarmSession['status']):FarmSession=>({state:state??createMinimalState(now),guard,status,migrated,currentRaw,...(conflictKind?{conflictKind}:{}),...(diagnostic?{diagnostic}:{})});
 const blocked=(raw:string,source:FarmSaveDiagnostic['source'],expectedVersion:2|3)=>{diagnostic=diagnoseRejectedFarmSave(raw,source,expectedVersion);return result('blocked');};
 try{
  const raw=storage.getItem(MINIMAL_STORAGE_KEY),legacy=storage.getItem(LEGACY_MINIMAL_STORAGE_KEY),backup=storage.getItem(LEGACY_BACKUP_KEY),ack=storage.getItem(LEGACY_ACK_KEY);currentRaw=raw;
  if(raw!==null){const decoded=decodeFarmSave(raw);if(decoded.kind!=='current')return blocked(raw,'v3-source',3);state=advanceMinimalState(decoded.state,now);}
  else if(legacy!==null){const decoded=decodeFarmSave(legacy);if(decoded.kind!=='migrated')return blocked(legacy,'v2-source',2);state=advanceMinimalState(decoded.state,now);migrated=true;}
  else state=createMinimalState(now);
  const baseline=legacy??'null';
  let acknowledged:string|null|undefined;if(ack!==null){const record:unknown=JSON.parse(ack);if(!record||typeof record!=='object'||!('version'in record)||record.version!==1||!('legacyRaw'in record)||(record.legacyRaw!==null&&typeof record.legacyRaw!=='string')||backup===null){diagnostic={source:'migration-choice',reason:'invalid-migration-record'};return result('blocked');}acknowledged=record.legacyRaw;}
  if(backup!==null&&backup!==baseline&&acknowledged!==legacy){conflictKind='legacy-diverged';return result('conflict');}
  guard=new FarmSaveGuard(storage,MINIMAL_STORAGE_KEY,raw,[{key:LEGACY_MINIMAL_STORAGE_KEY,raw:legacy}]);
  if(!guard.check())return result('conflict');
  if(backup===null){
   // Check both source and destination before preserving original bytes.
   if(storage.getItem(LEGACY_BACKUP_KEY)!==null||!guard.check())return result('conflict');
   storage.setItem(LEGACY_BACKUP_KEY,baseline);
   if(storage.getItem(LEGACY_BACKUP_KEY)!==baseline||!guard.check())return result('conflict');
  }
  guard=new FarmSaveGuard(storage,MINIMAL_STORAGE_KEY,raw,[{key:LEGACY_MINIMAL_STORAGE_KEY,raw:legacy},{key:LEGACY_BACKUP_KEY,raw:backup??baseline},{key:LEGACY_ACK_KEY,raw:ack}]);
  if(raw===null){const status=guard.persist(state);return result(status==='saved'?'ready':status);}
  return result(guard.check()?'ready':'conflict');
 }catch{return result('unavailable');}
}

/** Explicit user choice only: continue displayed v3, or resume an interrupted upgrade of current valid v2; retain original backup. */
export function acknowledgeLegacyFork(storage:MinimalStorage,expectedCurrentRaw:string|null):'saved'|'conflict'|'unavailable'{
 try{
  const current=storage.getItem(MINIMAL_STORAGE_KEY),legacy=storage.getItem(LEGACY_MINIMAL_STORAGE_KEY),backup=storage.getItem(LEGACY_BACKUP_KEY),oldAck=storage.getItem(LEGACY_ACK_KEY);
  if(current!==expectedCurrentRaw||backup===null)return 'conflict';
  if(current===null?(legacy===null||decodeFarmSave(legacy).kind!=='migrated'):decodeFarmSave(current).kind!=='current')return 'conflict';
  const next=JSON.stringify({version:1,legacyRaw:legacy});
  if(storage.getItem(MINIMAL_STORAGE_KEY)!==current||storage.getItem(LEGACY_MINIMAL_STORAGE_KEY)!==legacy||storage.getItem(LEGACY_BACKUP_KEY)!==backup||storage.getItem(LEGACY_ACK_KEY)!==oldAck)return 'conflict';
  storage.setItem(LEGACY_ACK_KEY,next);
  return storage.getItem(LEGACY_ACK_KEY)===next&&storage.getItem(MINIMAL_STORAGE_KEY)===current&&storage.getItem(LEGACY_MINIMAL_STORAGE_KEY)===legacy?'saved':'conflict';
 }catch{return 'unavailable';}
}

/** Read-only import from V27 or a strictly valid v2-only source, followed by independent writes. Never calls the v2
 * migration writer and never changes v3, v2, backup or acknowledgement keys.
 * Like FarmSaveGuard, this detects observed writes; localStorage has no atomic CAS. */
function openLocalHunyuanFarmSession(storage:MinimalStorage,now:number):FarmSession{
 let state:MinimalState|undefined,currentRaw:string|null=null,guard:FarmSaveGuard|null=null,migrated=false,diagnostic:FarmSaveDiagnostic|undefined;
 const result=(status:FarmSession['status']):FarmSession=>({state:state??createMinimalState(now),guard:status==='ready'?guard:null,status,migrated,currentRaw,...(diagnostic?{diagnostic}:{})});
 const blocked=(raw:string,source:FarmSaveDiagnostic['source'],expectedVersion:2|3)=>{diagnostic=diagnoseRejectedFarmSave(raw,source,expectedVersion);return result('blocked');};
 try{
  const raw=storage.getItem(LOCAL_HUNYUAN_STORAGE_KEY);currentRaw=raw;
  if(raw!==null){
   const decoded=decodeFarmSave(raw);if(decoded.kind!=='current')return blocked(raw,'isolated-local',3);
   state=advanceMinimalState(decoded.state,now);
   if(storage.getItem(LOCAL_HUNYUAN_STORAGE_KEY)!==raw)return result('conflict');
   guard=new FarmSaveGuard(storage,LOCAL_HUNYUAN_STORAGE_KEY,raw);return result('ready');
  }
  const source=storage.getItem(MINIMAL_STORAGE_KEY);let legacy:string|null=null;
  if(source!==null){const decoded=decodeFarmSave(source);if(decoded.kind!=='current')return blocked(source,'v3-source',3);state=advanceMinimalState(decoded.state,now);}
  else {
   legacy=storage.getItem(LEGACY_MINIMAL_STORAGE_KEY);
   if(legacy!==null){const decoded=decodeFarmSave(legacy);if(decoded.kind!=='migrated')return blocked(legacy,'v2-source',2);state=advanceMinimalState(decoded.state,now);migrated=true;}
   else state=createMinimalState(now);
  }
  if(storage.getItem(LOCAL_HUNYUAN_STORAGE_KEY)!==null||storage.getItem(MINIMAL_STORAGE_KEY)!==source||source===null&&storage.getItem(LEGACY_MINIMAL_STORAGE_KEY)!==legacy)return result('conflict');
  const copyGuard=new FarmSaveGuard(storage,LOCAL_HUNYUAN_STORAGE_KEY,null,[{key:MINIMAL_STORAGE_KEY,raw:source},...(source===null?[{key:LEGACY_MINIMAL_STORAGE_KEY,raw:legacy}]:[])]);
  const copied=copyGuard.persist(state);if(copied!=='saved')return result(copied);
  const expected=JSON.stringify(state);currentRaw=storage.getItem(LOCAL_HUNYUAN_STORAGE_KEY);
  if(currentRaw!==expected||storage.getItem(MINIMAL_STORAGE_KEY)!==source||source===null&&storage.getItem(LEGACY_MINIMAL_STORAGE_KEY)!==legacy)return result('conflict');
  // Once copied, the two farms may progress independently; only this key is watched.
  guard=new FarmSaveGuard(storage,LOCAL_HUNYUAN_STORAGE_KEY,currentRaw);return result('ready');
 }catch{return result('unavailable');}
}
