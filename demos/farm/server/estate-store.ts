import {DatabaseSync} from 'node:sqlite';
import {upgradeFarm,type Farm} from '../src/model.ts';
import {createEstate,commandEstate,settleEstate,estateSnapshot,type Estate,type EstateCommand,type EstateSnapshot} from '../src/v5/estate.ts';
export type EstateResponse={accepted:boolean;message:string;duplicate:boolean;snapshot:EstateSnapshot};
type Receipt={accepted:boolean;message:string};
/** Separate versioned table: legacy records are migration sources and never overwritten. */
export class EstateStore{
 private db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS estates(device TEXT PRIMARY KEY,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS estate_commands(device TEXT NOT NULL,id TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(device,id));`);}
 private load(device:string,now:number):Estate{
  if(!Number.isFinite(now))throw new Error('无效时钟');const row=this.db.prepare('SELECT state FROM estates WHERE device=?').get(device) as {state:string}|undefined;
  if(row){const value=JSON.parse(row.state) as Estate;if(value.version!==5||value.playerId!==device)throw new Error('不支持的庄园版本，原存档保留');return value;}
  const exists=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='farms'").get();let legacy:Farm|undefined;
  if(exists){const original=this.db.prepare('SELECT state FROM farms WHERE device=?').get(device) as {state:string}|undefined;if(original)legacy=upgradeFarm(JSON.parse(original.state));}
  const s=createEstate(device,now,legacy);this.save(s);return s;
 }
 private save(s:Estate){this.db.prepare('INSERT INTO estates(device,state) VALUES(?,?) ON CONFLICT(device) DO UPDATE SET state=excluded.state').run(s.playerId,JSON.stringify(s));}
 get(device:string,now:number):EstateSnapshot{this.db.exec('BEGIN IMMEDIATE');try{const s=settleEstate(this.load(device,now),now);this.save(s);this.db.exec('COMMIT');return estateSnapshot(s,now);}catch(e){this.db.exec('ROLLBACK');throw e;}}
 command(device:string,c:EstateCommand,now:number):EstateResponse{
  this.db.exec('BEGIN IMMEDIATE');try{const s=this.load(device,now);const row=this.db.prepare('SELECT receipt FROM estate_commands WHERE device=? AND id=?').get(device,c.id) as {receipt:string}|undefined;if(row){this.db.exec('COMMIT');return {...JSON.parse(row.receipt) as Receipt,duplicate:true,snapshot:estateSnapshot(s,now)};}
   let result;try{result=commandEstate(s,c,now);}catch(e){if(e instanceof TypeError||e instanceof RangeError)result={state:s,accepted:false,message:'指令参数无效，原状态已保留'};else throw e;}
   const receipt:Receipt={accepted:result.accepted,message:result.message};this.save(result.state);this.db.prepare('INSERT INTO estate_commands(device,id,receipt) VALUES(?,?,?)').run(device,c.id,JSON.stringify(receipt));this.db.exec('COMMIT');return {...receipt,duplicate:false,snapshot:estateSnapshot(result.state,now)};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
