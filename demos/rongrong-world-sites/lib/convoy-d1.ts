import {createConvoy,applyConvoy,convoySnapshot,type ConvoyCommand,type ConvoyRoom,type ConvoyReply} from '../src/v7/convoy.ts';
import {d1Transaction,D1Transaction,commandFingerprint} from './sites-d1-transaction.ts';
type Receipt={fingerprint:string;roomId:string;accepted:boolean;message:string};
async function load(tx:D1Transaction,id:string){const row=await tx.first<{state:string}>('SELECT state FROM convoy_rooms WHERE id=?',id);if(!row)return undefined;const room=JSON.parse(row.state) as ConvoyRoom;if(room.version!==1||room.id!==id)throw new Error('不支持的护送存档版本，原存档保留');return room;}
const save=(tx:D1Transaction,room:ConvoyRoom)=>tx.put('convoy_rooms',{id:room.id},{state:JSON.stringify(room)});
const deny=(message:string):ConvoyReply=>({accepted:false,message,duplicate:false,snapshot:null});
export class ConvoyD1Store{
 private db:D1Database;constructor(db:D1Database){this.db=db;}
 async get(device:string,roomId:string,now:number):Promise<ConvoyReply>{
  return d1Transaction(this.db,async tx=>{const room=await load(tx,roomId);if(!room||!room.members.some(m=>m.device===device))return deny(room?'请先加入这趟护送':'没有找到这趟护送');
   const result=applyConvoy(room,device,{id:'heartbeat',type:'pulse'},now);save(tx,room);return {...result,duplicate:false,snapshot:convoySnapshot(room,device,now)};
  });
 }
 async command(device:string,command:ConvoyCommand,now:number):Promise<ConvoyReply>{
  if(!Number.isFinite(now))return deny('无效时钟');
  return d1Transaction(this.db,async tx=>{
   const fingerprint=commandFingerprint(command),old=await tx.first<{receipt:string}>('SELECT receipt FROM convoy_receipts WHERE device=? AND id=?',device,command.id);
   if(old){const receipt=JSON.parse(old.receipt) as Receipt;if(receipt.fingerprint!==fingerprint)return deny('请求编号已用于另一条指令');const room=await load(tx,receipt.roomId);return {accepted:receipt.accepted,message:receipt.message,duplicate:true,snapshot:room?.members.some(m=>m.device===device)?convoySnapshot(room,device,now):null};}
   const rememberRejection=(message:string):ConvoyReply=>{const result=deny(message);tx.put('convoy_receipts',{device,id:command.id},{receipt:JSON.stringify({accepted:false,message,roomId:'',fingerprint} satisfies Receipt)});return result;};
   let room:ConvoyRoom|undefined,result:{accepted:boolean;message:string};
   if(command.type==='create'){
    if(command.guardian!==undefined&&!['dog','cat','frog'].includes(command.guardian))return rememberRejection('请选择已有守护者');
    room=createConvoy(crypto.randomUUID(),device,now,command.guardian);if(command.route==='covered')room.route='covered';result={accepted:true,message:'训练开始：点击路面带车，伙伴负责开门'};
   }else{room=typeof command.roomId==='string'?await load(tx,command.roomId):undefined;if(!room)return rememberRejection('没有找到这趟护送');result=applyConvoy(room,device,command,now);}
   save(tx,room);tx.put('convoy_receipts',{device,id:command.id},{receipt:JSON.stringify({...result,roomId:room.id,fingerprint} satisfies Receipt)});
   return {...result,duplicate:false,snapshot:room.members.some(m=>m.device===device)?convoySnapshot(room,device,now):null};
  });
 }
}
