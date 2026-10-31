import type {BufferGeometry} from 'three';
export const PYRAMID_INTERIOR=Object.freeze({url:'/models/interiors/pyramid.spz',bytes:12015743,sha256:'e5976754bd1278f83b8d55f99524da47db9e07af6cad8b06647811b15cea611a',count:723426});
type Options={fetcher?:typeof fetch;decode?:(buffer:ArrayBuffer)=>BufferGeometry|Promise<BufferGeometry>};
const aborted=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('Interior visit canceled','AbortError');};
/** Exact byte identity is checked before invoking the format decoder. No external textures or URLs. */
export async function loadPyramidGeometry(signal:AbortSignal,progress:(value:number)=>void,options:Options={}):Promise<BufferGeometry>{
 aborted(signal);const response=await(options.fetcher??fetch)(PYRAMID_INTERIOR.url,{signal});aborted(signal);if(!response.ok)throw new Error('Interior download unavailable');
 const reader=response.body?.getReader();let bytes:Uint8Array;
 if(reader){const result=new Uint8Array(PYRAMID_INTERIOR.bytes);let offset=0,done=false;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{for(;;){aborted(signal);const next=await reader.read();aborted(signal);if(next.done){done=true;break;}if(offset+next.value.length>result.length)throw new Error('Interior byte budget exceeded');result.set(next.value,offset);offset+=next.value.length;progress(offset/result.length*.92);aborted(signal);}if(offset!==result.length)throw new Error('Interior identity length mismatch');bytes=result;}
  finally{signal.removeEventListener('abort',cancel);if(!done&&!signal.aborted)await reader.cancel().catch(()=>{});reader.releaseLock();}
 }else bytes=new Uint8Array(await response.arrayBuffer());
 aborted(signal);if(bytes.length!==PYRAMID_INTERIOR.bytes)throw new Error('Interior identity length mismatch');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),v=>v.toString(16).padStart(2,'0')).join('');aborted(signal);if(hash!==PYRAMID_INTERIOR.sha256)throw new Error('Interior identity hash mismatch');progress(.95);aborted(signal);
 const decode=options.decode??(async(buffer:ArrayBuffer)=>{const {SPZLoader}=await import('three/addons/loaders/SPZLoader.js');return await new SPZLoader().parse(buffer) as BufferGeometry;});
 const geometry=await decode(Uint8Array.from(bytes).buffer);if(signal.aborted){geometry.dispose();aborted(signal);}if(geometry.getAttribute('position')?.count!==PYRAMID_INTERIOR.count||geometry.getAttribute('covariance')?.itemSize!==6){geometry.dispose();throw new Error('Interior splat geometry identity mismatch');}progress(1);if(signal.aborted){geometry.dispose();aborted(signal);}return geometry;
}
