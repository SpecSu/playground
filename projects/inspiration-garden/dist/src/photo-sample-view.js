/** Offline, pre-rendered Polaroid PNG viewer. No screenshot capture, generation API,
 * game-state mutation, persistence or automatic downloads. The caller owns the DOM.
 * Manifest may be a value or async ({signal}) => manifest. Call close() on panel /
 * garden change or page hiding, and dispose() on teardown. onChange receives an
 * immutable snapshot; render text with textContent (not unescaped innerHTML).
 */
const OWNER='human-subeike',MAX_BYTES=16*1024*1024,MAX_DIMENSION=4096;
const DOWNLOAD_LEASE_MS=60000,MAX_DOWNLOAD_LEASES=3;
const dimension=n=>Number.isInteger(n)&&n>0&&n<=MAX_DIMENSION;
export function photoMemorialDate(timestamp){
 if(typeof timestamp!=='number'||!Number.isFinite(timestamp))return null;
 const date=new Date(timestamp+8*60*60*1000);if(!Number.isFinite(date.getTime()))return null;
 const year=date.getUTCFullYear(),month=date.getUTCMonth()+1,day=date.getUTCDate();
 return {key:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,label:`${year}年${month}月${day}日`};
}
const cancelled=()=>new DOMException('Cancelled','AbortError');
async function loadPNG(url,{signal}){
 const response=await fetch(url,{signal,redirect:'error',credentials:'omit',cache:'force-cache'});
 if(!response.ok)throw Error('Photo unavailable');
 const size=Number(response.headers.get('content-length'));if(size>MAX_BYTES)throw Error('Photo too large');
 return response.blob();
}
function decodePNG(url,{signal}){
 return new Promise((resolve,reject)=>{
  const image=new Image();
  const cleanup=()=>{image.onload=null;image.onerror=null;signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();image.src='';reject(cancelled());};
  image.onload=()=>{const result={width:image.naturalWidth,height:image.naturalHeight};cleanup();resolve(result);};
  image.onerror=()=>{cleanup();reject(Error('Photo decode failed'));};
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});image.src=url;
 });
}
function photoEntry(manifest,gardenId,origin){
 if(manifest?.version!==1||manifest.ownerAvatarKey!==OWNER||!Object.hasOwn(manifest.photos??{},gardenId))throw Error('No approved photo');
 const p=manifest.photos[gardenId];
 if(!p||!dimension(p.width)||!dimension(p.height)||typeof p.friendId!=='string'||!p.friendId||typeof p.friendName!=='string'||!p.friendName||p.friendName.length>80)throw Error('Invalid photo metadata');
 // Exact public asset path only: rejects traversal, encoded separators, query,
 // credentials, remote/data/blob URLs and script-like image types.
 if(typeof p.image!=='string'||!/^assets\/photos\/[A-Za-z0-9_-]+\.png$/.test(p.image))throw Error('Invalid photo path');
 const base=new URL(origin),url=new URL('/'+p.image,base);
 if(!['https:','http:'].includes(base.protocol)||url.origin!==base.origin)throw Error('Invalid photo origin');
 return {...p,url:url.href};
}
export function createPhotoSampleView({manifest,origin=globalThis.location?.origin,loadAsset=loadPNG,decodeImage=decodePNG,createObjectURL=b=>URL.createObjectURL(b),revokeObjectURL=u=>URL.revokeObjectURL(u),document:doc=globalThis.document,onChange=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),now=()=>Date.now()}={}){
 let disposed=false,generation=0,controller=null,previewURL=null,readyBlob=null;
 const downloads=new Set();
 const releaseDownload=url=>{if(downloads.delete(url))revokeObjectURL(url);};
 let state=Object.freeze({status:'closed',gardenId:null,previewURL:null});
 const publish=next=>{state=Object.freeze(next);if(!disposed)onChange(state);};
 const release=()=>{readyBlob=null;controller?.abort();controller=null;if(previewURL){revokeObjectURL(previewURL);previewURL=null;}};
 const current=token=>!disposed&&token===generation;
 async function open(gardenId,openedAt=now()){
  if(disposed)return false;
  const token=++generation;release();controller=new AbortController();const signal=controller.signal;
  const base={gardenId,openedAt,ownerAvatarKey:OWNER,previewURL:null,label:'离线样片 · 固定主角苏贝壳',error:null};
  publish({...base,status:'loading'});
  try{
   const data=typeof manifest==='function'?await manifest({signal}):manifest;if(!current(token))return false;
   const entry=photoEntry(data,gardenId,origin);
   const details={...base,friendId:entry.friendId,friendName:entry.friendName,label:`离线样片 · 苏贝壳 × ${entry.friendName}`,width:entry.width,height:entry.height};
   publish({...details,status:'loading'});
   const blob=await loadAsset(entry.url,{signal});if(!current(token))return false;
   if(!(blob instanceof Blob)||blob.size<24||blob.size>MAX_BYTES)throw Error('Invalid photo bytes');
   const header=new Uint8Array(await blob.slice(0,24).arrayBuffer());if(!current(token))return false;
   if(![137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v)||String.fromCharCode(...header.slice(12,16))!=='IHDR')throw Error('Not PNG');
   const headerView=new DataView(header.buffer,header.byteOffset,header.byteLength);
   if(headerView.getUint32(16)!==entry.width||headerView.getUint32(20)!==entry.height)throw Error('Wrong PNG dimensions');
   // Normalize MIME so saved/opened object URLs are images even when hosting
   // returns application/octet-stream. Bytes remain the authored PNG unchanged.
   const imageBlob=blob.type==='image/png'?blob:new Blob([blob],{type:'image/png'});
   const url=createObjectURL(imageBlob);previewURL=url;
   const decoded=await decodeImage(url,{signal});if(!current(token))return false;
   if(decoded?.width!==entry.width||decoded?.height!==entry.height)throw Error('Invalid decoded dimensions');
   readyBlob=imageBlob;
   publish({...details,status:'ready',previewURL:url,filename:`polaroid-subeike-${gardenId.replace(/[^A-Za-z0-9_-]/g,'-')}${photoMemorialDate(openedAt)?'-'+photoMemorialDate(openedAt).key:''}.png`});return true;
  }catch(error){
   if(!current(token))return false;
   release();publish({...state,status:'error',previewURL:null,error:'这张离线样片暂时打不开，请重试。'});return false;
  }
 }
 function close(){if(disposed)return;++generation;release();publish({status:'closed',gardenId:null,previewURL:null});}
 function download(){
  if(disposed||state.status!=='ready'||!previewURL||!readyBlob||!doc?.body)return {ok:false,status:'unavailable'};
  if(downloads.size>=MAX_DOWNLOAD_LEASES)return {ok:false,status:'busy',message:'已有图片正在准备下载，请稍后再试；也可以长按图片保存。'};
  let anchor,url;
  try{
   // The browser may acquire bytes AFTER click() returns or a blur handler closes
   // the panel. This lease intentionally survives close/switch/dispose. Never
   // evict a live acquisition to make space; cap at three and expire after 60 s.
   url=createObjectURL(readyBlob);downloads.add(url);
   const timer=schedule(()=>releaseDownload(url),DOWNLOAD_LEASE_MS);timer?.unref?.();
   anchor=doc.createElement('a');anchor.href=url;anchor.download=state.filename;anchor.target='_blank';anchor.rel='noopener';anchor.hidden=true;doc.body.append(anchor);anchor.click();
   return {ok:true,status:'requested',message:'已请求打开或下载；也可以长按图片保存。'};
  }
  catch{if(url)releaseDownload(url);return {ok:false,status:'blocked',message:'未能打开下载，请长按图片保存。'};}
  finally{anchor?.remove();}
 }

 return {open,close,download,retry(){return state.status==='error'?open(state.gardenId,state.openedAt):Promise.resolve(false);},dispose(){if(disposed)return;++generation;release();disposed=true;state=Object.freeze({status:'closed',gardenId:null,previewURL:null});},get state(){return state;}};
}
