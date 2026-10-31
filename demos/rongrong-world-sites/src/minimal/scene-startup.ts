export type SceneScheduler={frame:(callback:()=>void)=>number;cancelFrame:(id:number)=>void;delay:(callback:()=>void,ms:number)=>number;cancelDelay:(id:number)=>void};
/** Two RAF opportunities expose the committed loading card before heavy WebGL
 * setup. A bounded fallback covers frame-starved tabs; cancellation owns every
 * callback, so unmount/account changes never construct an abandoned World. */
export function scheduleSceneStartup(start:()=>void,scheduler:SceneScheduler={frame:cb=>window.requestAnimationFrame(cb),cancelFrame:id=>window.cancelAnimationFrame(id),delay:(cb,ms)=>window.setTimeout(cb,ms),cancelDelay:id=>window.clearTimeout(id)}):()=>void{
 let live=true,second:number|undefined;
 const clear=()=>{if(first!==undefined)scheduler.cancelFrame(first);if(second!==undefined)scheduler.cancelFrame(second);if(timer!==undefined)scheduler.cancelDelay(timer);};
 const finish=()=>{if(!live)return;live=false;clear();start();};
 const timer=scheduler.delay(finish,200),first=scheduler.frame(()=>{if(live)second=scheduler.frame(finish);});return()=>{live=false;clear();};
}
