import {Raycaster,Vector2,type Object3D,type Camera} from 'three';
type Pointer={pointerId:number;clientX:number;clientY:number;timeStamp:number;isPrimary:boolean;button:number};
/** Selection happens on a short release, never on pointerdown or a captured drag. */
export class SceneTapGesture {
 private start:Pointer|undefined;private moved=false;
 begin(e:Pointer){
  if(!e.isPrimary||e.button!==0||this.start){this.start=undefined;return false;}
  this.start={pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,timeStamp:e.timeStamp,isPrimary:e.isPrimary,button:e.button};this.moved=false;return true;
 }
 move(e:Pick<Pointer,'pointerId'|'clientX'|'clientY'>){if(this.start?.pointerId===e.pointerId&&Math.hypot(e.clientX-this.start.clientX,e.clientY-this.start.clientY)>8)this.moved=true;}
 end(e:Pointer){const start=this.start;if(!start||start.pointerId!==e.pointerId)return false;this.move(e);const tap=!this.moved&&e.timeStamp-start.timeStamp<=650;this.start=undefined;return tap;}
 cancel(pointerId?:number){if(pointerId===undefined||this.start?.pointerId===pointerId)this.start=undefined;}
}
/** Nameplates obey the same gesture rules as mesh taps, while native keyboard clicks remain accessible. */
export function bindEntityLabel(label:HTMLButtonElement,id:string,select:(id:string)=>void):()=>void{
 const tap=new SceneTapGesture();const listeners:[string,EventListener][]=[];
 const on=(type:string,handler:EventListener)=>{label.addEventListener(type,handler);listeners.push([type,handler]);};
 on('pointerdown',((e:PointerEvent)=>{e.stopPropagation();if(tap.begin(e))label.setPointerCapture(e.pointerId);}) as EventListener);
 on('pointermove',((e:PointerEvent)=>{e.stopPropagation();tap.move(e);}) as EventListener);
 on('pointerup',((e:PointerEvent)=>{e.stopPropagation();const selected=tap.end(e);if(label.hasPointerCapture(e.pointerId))label.releasePointerCapture(e.pointerId);if(selected)select(id);}) as EventListener);
 on('pointercancel',((e:PointerEvent)=>tap.cancel(e.pointerId)) as EventListener);
 on('lostpointercapture',((e:PointerEvent)=>tap.cancel(e.pointerId)) as EventListener);
 on('blur',(()=>tap.cancel()) as EventListener);
 on('click',((e:MouseEvent)=>{e.preventDefault();e.stopPropagation();if(e.detail===0)select(id);}) as EventListener);
 return()=>{tap.cancel();listeners.forEach(([type,handler])=>label.removeEventListener(type,handler));};
}
function visible(object:Object3D){for(let node:Object3D|null=object;node;node=node.parent)if(!node.visible)return false;return true;}
/** The closest visible solid wins: scenery/player bodies occlude animals instead of picking through them. */
export function pickSceneEntity(objects:readonly Object3D[],camera:Camera,pointer:{clientX:number;clientY:number},rect:{left:number;top:number;width:number;height:number}):string|undefined{
 if(rect.width<=0||rect.height<=0||pointer.clientX<rect.left||pointer.clientX>rect.left+rect.width||pointer.clientY<rect.top||pointer.clientY>rect.top+rect.height)return;
 objects.forEach(o=>o.updateWorldMatrix(true,true));
 const ray=new Raycaster();ray.setFromCamera(new Vector2((pointer.clientX-rect.left)/rect.width*2-1,1-(pointer.clientY-rect.top)/rect.height*2),camera);
 for(const hit of ray.intersectObjects([...objects],true)){
  if(!visible(hit.object)||hit.object.userData.pickThrough)continue;
  for(let node:Object3D|null=hit.object;node;node=node.parent)if(typeof node.userData.entityId==='string')return node.userData.entityId;
  return;
 }
}
