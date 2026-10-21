import {prewarmClubAvatar} from './club-avatar-rig.ts';
import {fishingAvatarModelUrl,resolveFishingAvatarPreset} from './fishing-avatar-catalog.ts';
import type {AvatarPreset} from './room-types.ts';

export type FishingAvatarStatus='loading'|'ready'|'error';
export function preloadFishingAvatar(preset:AvatarPreset):Promise<void>{
 return prewarmClubAvatar(resolveFishingAvatarPreset(preset),fishingAvatarModelUrl(preset));
}

/** Receipts are emitted by the scene after rendering, never by the loader. */
export class FishingAvatarReadiness {
 private states=new Map<string,FishingAvatarStatus>();
 private listeners=new Set<()=>void>();
 private sceneFailed=false;
 private key(id:string,preset:string){return `${id}:${resolveFishingAvatarPreset(preset)}`;}
 report(id:string,preset:string,status:FishingAvatarStatus){
  this.states.set(this.key(id,preset),status);
  if(status==='ready')this.sceneFailed=false;
  for(const listener of this.listeners)listener();
 }
 clear(id:string,preset:string){this.states.delete(this.key(id,preset));}
 clearFailure(id:string,preset:string){if(this.states.get(this.key(id,preset))==='error')this.clear(id,preset);}
 failScene(){this.states.clear();this.sceneFailed=true;for(const listener of this.listeners)listener();}
 waitFor(id:string,preset:string,signal:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
   const visibility=typeof document==='undefined'?undefined:document;
   let timer:ReturnType<typeof setTimeout>|undefined,remaining=45000,startedAt=0,finished=false;
   const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);visibility?.removeEventListener('visibilitychange',visibilityChanged);signal.removeEventListener('abort',aborted);this.listeners.delete(check);if(error)reject(error);else resolve();};
   const aborted=()=>finish(new DOMException('分身加载已取消','AbortError'));
   // RAF intentionally pauses in hidden tabs. Only visible time counts toward
   // the deadline; resuming must neither instantly fail nor reset its budget.
   const visibilityChanged=()=>{
    if(finished)return;
    if(timer!==undefined){clearTimeout(timer);timer=undefined;remaining-=Math.max(0,Date.now()-startedAt);}
    if(!visibility?.hidden){startedAt=Date.now();timer=setTimeout(()=>finish(new Error('分身加载超时，请重试。')),Math.max(0,remaining));}
   };
   const check=()=>{
    if(signal.aborted){aborted();return;}
    if(this.sceneFailed){finish(new Error('3D 画面加载失败，请关闭面板后重新加载画面。'));return;}
    const status=this.states.get(this.key(id,preset));
    if(status==='ready')finish();else if(status==='error')finish(new Error('分身加载失败，请重试。'));
   };
   this.listeners.add(check);signal.addEventListener('abort',aborted,{once:true});visibility?.addEventListener('visibilitychange',visibilityChanged);
   visibilityChanged();check();
  });
 }
}
