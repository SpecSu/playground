import { RoomError } from './fishing-errors';

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
