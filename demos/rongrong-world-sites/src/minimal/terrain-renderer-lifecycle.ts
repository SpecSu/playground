export type TerrainRenderMode='continuous'|'legacy';
export type TerrainRenderStatus=Readonly<{phase:'building'|'ready'|'error'|'disposed';mode:TerrainRenderMode;fallbackReason?:string;error?:string}>;
export function resolveTerrainMode(search:string):TerrainRenderMode{
 const p=new URLSearchParams(search),explicit=p.get('terrainRenderer');if(explicit==='legacy'||explicit==='continuous')return explicit;return p.get('terrainPreview')==='0'?'legacy':'continuous';
}
/** Startup readiness, not a claim of visual/GPU acceptance. No game state or commands enter here. */
export class TerrainReadiness{
 private current:TerrainRenderStatus;private notify?: (status:TerrainRenderStatus)=>void;private settled=false;private resolve!: (status:TerrainRenderStatus)=>void;
 readonly ready=new Promise<TerrainRenderStatus>(resolve=>{this.resolve=resolve;});
 constructor(mode:TerrainRenderMode,notify?:(status:TerrainRenderStatus)=>void){this.current=Object.freeze({phase:'building',mode});this.notify=notify;notify?.(this.current);}
 get status(){return this.current;}
 private publish(next:TerrainRenderStatus){if(this.current.phase==='disposed')return;const old=this.current;if(old.phase===next.phase&&old.mode===next.mode&&old.fallbackReason===next.fallbackReason&&old.error===next.error)return;this.current=Object.freeze(next);if(!this.settled&&['ready','error','disposed'].includes(next.phase)){this.settled=true;this.resolve(this.current);}this.notify?.(this.current);}
 building(mode:TerrainRenderMode,fallbackReason?:string){this.publish({phase:'building',mode,fallbackReason});}
 complete(mode:TerrainRenderMode,fallbackReason?:string){this.publish({phase:'ready',mode,fallbackReason});}
 fail(error:string){this.publish({...this.current,phase:'error',error});}
 dispose(){this.publish({...this.current,phase:'disposed'});}
}
