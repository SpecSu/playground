import { createFishingService } from './fishing-server';
import { D1FishingStore,resolveFishingSession } from './fishing-d1';
import type { RoomDatabase } from './fishing-d1';
import { RoomError } from './fishing-errors';
import { readCommandBody,validateMutationRequest,validateReadRequest } from './fishing-validation';
export async function handleFishingRequest(request:Request,db:RoomDatabase|undefined):Promise<Response>{
 let cookie:string|undefined,actor:string|undefined;
 const service=db?createFishingService(new D1FishingStore(db)):undefined;
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store, max-age=0','vary':'Cookie','x-content-type-options':'nosniff',...(cookie?{'set-cookie':cookie}:{})}});
 try{
  if(!db||!service)throw new RoomError('UNAVAILABLE','游艇正在准备中，请稍后重试。',503);
  if(request.method!=='GET'&&request.method!=='POST')throw new RoomError('INVALID_COMMAND','不支持这个请求。',405);
  if(request.method==='GET')validateReadRequest(request);else validateMutationRequest(request);
  const body=request.method==='POST'?await readCommandBody(request):undefined;
  if(request.method==='GET'&&(new URL(request.url).searchParams.get('room')??'ocean')!=='ocean')throw new RoomError('INVALID_COMMAND','游艇不存在。');
  const session=await resolveFishingSession(db,request,request.method==='GET');cookie=session.setCookie;actor=session.actorId;
  return json(request.method==='GET'?await service.snapshot('ocean',actor):await service.command(actor,body));
 }catch(error){const e=error instanceof RoomError?error:new RoomError('UNAVAILABLE','海上信号暂时中断，请稍后重试。',503);if(!(error instanceof RoomError))console.error('[fishing-api] persistence unavailable');let snapshot;if(service&&actor&&['STALE_SEQUENCE','REQUEST_CONFLICT','NOT_PARTICIPANT','INVALID_COMMAND'].includes(e.code)){try{snapshot=await service.snapshot('ocean',actor);}catch{}}
 return json({error:{code:e.code,message:e.message,retryAfterMs:e.retryAfterMs},...(snapshot?{snapshot}:{})},e.status);}
}
