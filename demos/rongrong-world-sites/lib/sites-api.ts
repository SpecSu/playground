import {EstateD1Store} from './estate-d1.ts';
import {ConvoyD1Store} from './convoy-d1.ts';
import {HarvestD1Store} from './harvest-d1.ts';
import type {EstateCommand} from '../src/v5/estate.ts';
import type {ConvoyCommand} from '../src/v7/convoy.ts';
import type {HarvestCommand} from '../src/v7/harvest.ts';
type ApiKind='estate'|'convoy'|'harvest';
const MAX_BODY_BYTES=65_536;
function response(value:unknown,status=200,cookie?:string){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie',...(cookie?{'Set-Cookie':cookie}:{})}});}
async function readBody(request:Request):Promise<string|null>{
 if(Number(request.headers.get('Content-Length')??0)>MAX_BODY_BYTES)return null;
 if(!request.body)return '';
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY_BYTES){await reader.cancel();return null;}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}return new TextDecoder().decode(bytes);
}
/** Identity is an opaque same-origin HttpOnly capability. No caller-supplied
 * account, player, device or user headers are treated as platform identity. */
export async function handleSitesApi(request:Request,kind:ApiKind,db:D1Database|undefined):Promise<Response>{
 let cookie:string|undefined;
 try{
  const url=new URL(request.url),origin=request.headers.get('Origin'),fetchSite=request.headers.get('Sec-Fetch-Site');
  if(origin&&origin!==url.origin||fetchSite==='cross-site'||fetchSite==='same-site')return response({error:'只接受同源操作'},403);
  if(!['GET','POST'].includes(request.method))return response({error:'Method not allowed'},405);
  if(!db)return response({error:'云端农场存储尚未就绪，请稍后重试'},503);
  let device=request.headers.get('Cookie')?.match(/(?:^|;\s*)farm_device=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:;|$)/)?.[1];
  if(!device){device=crypto.randomUUID();cookie=`farm_device=${device}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`;}
  const now=Date.now();
  if(request.method==='GET'){
   const result=kind==='estate'?await new EstateD1Store(db).get(device,now):kind==='convoy'?await new ConvoyD1Store(db).get(device,url.searchParams.get('room')??'',now):await new HarvestD1Store(db).get(device,url.searchParams.get('token')??undefined,now);
   return response(result,200,cookie);
  }
  if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type')??''))return response({error:'需要 JSON 指令'},415,cookie);
  const body=await readBody(request);if(body===null)return response({error:'指令过大'},413,cookie);
  let command:EstateCommand;try{command=JSON.parse(body);}catch{return response({error:'无效 JSON'},400,cookie);}
  if(!command||typeof command!=='object'||Array.isArray(command)||typeof command.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(command.id)||typeof command.type!=='string')return response({error:'指令缺少唯一 ID 或类型'},400,cookie);
  // Do not mutate until the client has acknowledged a previously issued cookie.
  // Otherwise losing this very first response also loses the idempotency scope,
  // and a retry could create a second convoy or occupy an orphaned guard slot.
  if(cookie)return response({error:'请完成设备会话初始化后重试，同一条指令尚未执行',code:'identity_required',retryable:true},428,cookie);
  const result=kind==='estate'?await new EstateD1Store(db).command(device,command,now):kind==='convoy'?await new ConvoyD1Store(db).command(device,command as ConvoyCommand,now):await new HarvestD1Store(db).command(device,command as HarvestCommand,now);
  return response(result,200,cookie);
 }catch(error){console.error(`Farm ${kind} API failed`,error instanceof Error?error.message:'unknown');return response({error:'云端保存暂时不可用，重试会沿用同一个指令'},503,cookie);}
}
