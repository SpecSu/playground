// A photo is a local, session-only preview. No bytes enter saves, samples or network calls.
export const CREATION_PHOTO_ACCEPT='image/jpeg,image/png,image/webp';
const allowed=new Set(CREATION_PHOTO_ACCEPT.split(','));
export function decodeLocalPhoto(url){return new Promise((resolve,reject)=>{const image=new Image();let timer=setTimeout(()=>finish(null),15000);function finish(value){clearTimeout(timer);image.onload=image.onerror=null;image.src='';value?resolve(value):reject(Error('Invalid image'));}image.onload=()=>finish({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>finish(null);image.src=url;});}
export function createCreationPhoto({createURL=file=>URL.createObjectURL(file),revokeURL=url=>URL.revokeObjectURL(url),decode=decodeLocalPhoto,onChange=()=>{}}={}){
 let panel=null,revision=0,url=null,name='',pending=null,error='';
 const release=value=>{if(value)revokeURL(value);};
 const cancel=()=>{revision++;release(pending);pending=null;};
 const clear=()=>{cancel();release(url);url=null;name='';error='';};
 return {
  sync(next){next=['create','blueprint-create'].includes(next)?next:null;if(next!==panel){clear();panel=next;}},
  reset(){clear();},
  snapshot(){return {url,name,error,loading:!!pending};},
  remove(){clear();onChange();},
  pickToken(){return {panel,revision};},
  async select(file,ticket=null){
   if(!file||!panel||(ticket&&(ticket.panel!==panel||ticket.revision!==revision)))return false;
   cancel();error='';
   if(!allowed.has(file.type)){error='请选择 JPG、PNG 或 WebP 照片';onChange();return false;}
   if(!Number.isFinite(file.size)||file.size<=0||file.size>10*1024*1024){error='请选择 10 MB 以内的照片';onChange();return false;}
   const token=revision;let candidate;
   try{candidate=createURL(file);pending=candidate;onChange();const size=await decode(candidate);if(token!==revision)return false;if(!size||size.width<=0||size.height<=0||!Number.isFinite(size.width*size.height)||size.width*size.height>40_000_000)throw Error('Invalid dimensions');pending=null;release(url);url=candidate;name=String(file.name??'照片');error='';onChange();return true;}
   catch{if(token!==revision)return false;release(candidate);pending=null;error='这张照片暂时无法打开，请换一张';onChange();return false;}
  }
 };
}
