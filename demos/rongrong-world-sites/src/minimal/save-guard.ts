import {validateMinimalSave,type MinimalState,type MinimalStorage} from './model.ts';

/** Detects observed foreign writes, not an atomic cross-tab transaction lock. */
export class FarmSaveGuard {
 private expected:string|null;
 private unavailable=false;
 private conflicted=false;
 private storage:MinimalStorage;
 private key:string;
 private watched:readonly {key:string;raw:string|null}[];
 constructor(storage:MinimalStorage,key:string,raw:string|null,watched:readonly {key:string;raw:string|null}[]=[]){this.storage=storage;this.key=key;this.expected=raw;this.watched=watched;}
 /** Callers may opt into fail-closed storage without changing legacy memory-only play. */
 isUnavailable():boolean{return this.unavailable;}
 check():boolean{
  if(this.conflicted)return false;
  if(this.unavailable)return true; // Storage failure permits memory-only play.
  try{if(this.storage.getItem(this.key)!==this.expected||this.watched.some(entry=>this.storage.getItem(entry.key)!==entry.raw))this.conflicted=true;}
  catch{this.unavailable=true;}
  return !this.conflicted;
 }
 persist(state:MinimalState):'saved'|'unavailable'|'conflict'{
  if(!this.check())return 'conflict';
  if(this.unavailable)return 'unavailable';
  try{
   if(this.expected&&!validateMinimalSave(JSON.parse(this.expected)))return 'unavailable';
   if(!validateMinimalSave(state))return 'unavailable';
   const next=JSON.stringify(state);
   // Compare immediately before writing as well as before computing a command.
   if(!this.check())return 'conflict';
   if(this.unavailable)return 'unavailable';
   this.storage.setItem(this.key,next);this.expected=next;if(!this.check())return 'conflict';return this.unavailable?'unavailable':'saved';
  }catch{return 'unavailable';}
 }
}

/** Unknown formats must not become an empty, writable ledger. */
export function readableAtlasSchema(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const ledger=value as Record<string,unknown>;
 return ledger.version===1&&!!ledger.records&&typeof ledger.records==='object'&&!Array.isArray(ledger.records)&&Array.isArray(ledger.receivedReceiptIds);
}

/** The optional atlas has independent concurrency: its conflict must not freeze farming. */
export class AtlasSaveGuard {
 private expected:string|null;
 private status:'ready'|'unavailable'|'conflict'='ready';
 private storage:MinimalStorage;
 private key:string;
 constructor(storage:MinimalStorage,key:string,raw:string|null){this.storage=storage;this.key=key;this.expected=raw;}
 check():'ready'|'unavailable'|'conflict'{
  if(this.status!=='ready')return this.status;
  try{if(this.storage.getItem(this.key)!==this.expected)this.status='conflict';}
  catch{this.status='unavailable';}
  return this.status;
 }
 persist(serialized:string):'saved'|'unavailable'|'conflict'{
  const status=this.check();if(status!=='ready')return status;
  try{this.storage.setItem(this.key,serialized);this.expected=serialized;return 'saved';}
  catch{return 'unavailable';}
 }
}
