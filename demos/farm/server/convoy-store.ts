import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createConvoy,applyConvoy,convoySnapshot,type ConvoyCommand,type ConvoyRoom,type ConvoyReply} from '../src/v7/convoy.ts';
type SavedReceipt={fingerprint:string;roomId:string;accepted:boolean;message:string};
const fingerprint=(c:ConvoyCommand)=>JSON.stringify(Object.fromEntries(Object.entries(c).sort(([a],[b])=>a.localeCompare(b))));
/** Separate tables, same-origin device capabilities. No farm asset access and no public/friend identity claims. */
export class ConvoyStore{
 private db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS convoy_rooms(id TEXT PRIMARY KEY,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS convoy_receipts(device TEXT NOT NULL,id TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(device,id));');}
 private load(id:string){const row=this.db.prepare('SELECT state FROM convoy_rooms WHERE id=?').get(id) as {state:string}|undefined;return row?JSON.parse(row.state) as ConvoyRoom:undefined;}
 private save(room:ConvoyRoom){this.db.prepare('INSERT INTO convoy_rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(room.id,JSON.stringify(room));}
 get(device:string,roomId:string,now=Date.now()):ConvoyReply{
  this.db.exec('BEGIN IMMEDIATE');try{
   const room=this.load(roomId);if(!room||!room.members.some(m=>m.device===device)){this.db.exec('COMMIT');return {accepted:false,message:room?'请先加入这趟护送':'没有找到这趟护送',duplicate:false,snapshot:null};}
   const result=applyConvoy(room,device,{id:'heartbeat',type:'pulse'},now);this.save(room);this.db.exec('COMMIT');return {...result,duplicate:false,snapshot:convoySnapshot(room,device,now)};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 command(device:string,command:ConvoyCommand,now=Date.now()):ConvoyReply{
  const deny=(message:string):ConvoyReply=>({accepted:false,message,duplicate:false,snapshot:null});
  if(!command||typeof command!=='object'||typeof command.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(command.id)||!Number.isFinite(now))return deny('指令参数无效');
  this.db.exec('BEGIN IMMEDIATE');try{
   const signature=fingerprint(command),stored=this.db.prepare('SELECT receipt FROM convoy_receipts WHERE device=? AND id=?').get(device,command.id) as {receipt:string}|undefined;
   if(stored){const receipt=JSON.parse(stored.receipt) as SavedReceipt;const room=this.load(receipt.roomId);this.db.exec('COMMIT');if(receipt.fingerprint!==signature)return deny('请求编号已用于另一条指令');return {accepted:receipt.accepted,message:receipt.message,duplicate:true,snapshot:room?.members.some(m=>m.device===device)?convoySnapshot(room,device,now):null};}
   let room:ConvoyRoom|undefined,result:{accepted:boolean;message:string};
   if(command.type==='create'){
    if(command.guardian&&!['dog','cat','frog'].includes(command.guardian)){this.db.exec('COMMIT');return deny('请选择已有守护者');}
    room=createConvoy(randomUUID(),device,now,command.guardian);if(command.route==='covered')room.route='covered';result={accepted:true,message:'训练开始：点击路面带车，伙伴负责开门'};
   }else{
    room=typeof command.roomId==='string'?this.load(command.roomId):undefined;
    if(!room){this.db.exec('COMMIT');return deny('没有找到这趟护送');}
    result=applyConvoy(room,device,command,now);
   }
   // State, membership, monotonic sequence and receipt commit in one SQLite transaction.
   this.save(room);this.db.prepare('INSERT INTO convoy_receipts(device,id,receipt) VALUES(?,?,?)').run(device,command.id,JSON.stringify({...result,roomId:room.id,fingerprint:signature} satisfies SavedReceipt));
   this.db.exec('COMMIT');return {...result,duplicate:false,snapshot:room.members.some(m=>m.device===device)?convoySnapshot(room,device,now):null};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 close(){this.db.close();}
}
