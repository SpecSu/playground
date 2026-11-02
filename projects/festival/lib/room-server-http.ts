import { withMovementSnapshot } from './room-movement-snapshot';
import { createRoomService, RoomError, validateRoomId } from './room-server';
import { D1RoomStore, resolveDeviceSession } from './room-server-d1';
import type { RoomDatabase } from './room-server-d1';
import type { RoomSnapshot } from './room-types';

const BODY_LIMIT=4096;
export function validateReadRequest(request: Request) {
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site' || (origin!==null && origin!==new URL(request.url).origin))throw new RoomError('FORBIDDEN','Open the room from this site.',403);
}
export function validateMutationRequest(request: Request) {
  const origin=request.headers.get('origin'), site=request.headers.get('sec-fetch-site');
  // These browser-controlled headers plus SameSite cookies stop a foreign page
  // from controlling the room through a visitor's existing capability.
  if(origin!==new URL(request.url).origin || site==='cross-site')throw new RoomError('FORBIDDEN','Room commands must come from this site.',403);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new RoomError('INVALID_COMMAND','Send room commands as JSON.',415);
}
export async function readCommandBody(request: Request): Promise<unknown> {
  const oversized=()=>new RoomError('INVALID_COMMAND','This room command is too large.',413);
  if(Number(request.headers.get('content-length'))>BODY_LIMIT)throw oversized();
  if(!request.body)throw new RoomError('INVALID_COMMAND','A room command is required.');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>BODY_LIMIT){await reader.cancel();throw oversized();}chunks.push(value);}
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new RoomError('INVALID_COMMAND','The room command is not valid JSON.');}
}
function json(data: unknown,status=200,setCookie?:string,retryAfterMs?:number) {
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'private, no-store, max-age=0','pragma':'no-cache','vary':'Cookie','x-content-type-options':'nosniff'});
  if(setCookie)headers.set('set-cookie',setCookie);
  if(retryAfterMs)headers.set('retry-after',String(Math.ceil(retryAfterMs/1000)));
  return new Response(JSON.stringify(data),{status,headers});
}
export async function handleRoomRequest(request: Request, db: RoomDatabase | undefined): Promise<Response> {
  let setCookie:string|undefined,actorId:string|undefined,roomId:string|undefined;
  const service=db?createRoomService(new D1RoomStore(db)):undefined;
  try {
    if(!db||!service)throw new RoomError('UNAVAILABLE','The shared room is temporarily unavailable. Please try again.',503);
    if(request.method!=='GET'&&request.method!=='POST')throw new RoomError('INVALID_COMMAND','This request method is not supported.',405);
    let body:unknown;
    if(request.method==='GET')validateReadRequest(request);
    if(request.method==='POST') {validateMutationRequest(request);body=await readCommandBody(request);}
    roomId=validateRoomId(request.method==='GET'?new URL(request.url).searchParams.get('room')??'main':(body as Record<string,unknown>|null)?.roomId);
    const session=await resolveDeviceSession(db,request,request.method==='GET');
    actorId=session.actorId;setCookie=session.setCookie;
    const snapshot=request.method==='GET'?await service.snapshot(roomId,actorId):await service.command(actorId,body);
    return json(await withMovementSnapshot(snapshot,db),200,setCookie);
  } catch(error) {
    const known=error instanceof RoomError?error:new RoomError('UNAVAILABLE','The shared room is temporarily unavailable. Please try again.',503);
    if(!(error instanceof RoomError))console.error('[room-api] A persistence request failed.');
    let snapshot:RoomSnapshot|undefined;
    if(service&&actorId&&roomId&&['STALE_SEQUENCE','REQUEST_CONFLICT','NOT_PARTICIPANT','RATE_LIMITED'].includes(known.code)) {
      try {snapshot=await withMovementSnapshot(await service.snapshot(roomId,actorId),db!);}catch{/* Preserve the original error if refresh is unavailable. */}
    }
    return json({error:{code:known.code,message:known.message,retryAfterMs:known.retryAfterMs,lastSequence:known.lastSequence},...(snapshot?{snapshot}:{})},known.status,setCookie,known.retryAfterMs);
  }
}
