import type {FishingCameraController} from './fishing-camera';

type InputOptions={gesture?:FishingCameraGesture;onTap?:(position:{x:number;y:number})=>void;enabled?:()=>boolean;windowTarget?:EventTarget;documentTarget?:EventTarget&{hidden?:boolean}};
type PointerPosition={x:number;y:number;target:HTMLElement};
export type FishingCameraGesture={pointers:Map<number,PointerPosition>;tap?:{id:number;x:number;y:number};cursors:Map<HTMLElement,string>};
/** Labels and the canvas share this state so a pinch may begin on either surface. */
export function createFishingCameraGesture():FishingCameraGesture{return {pointers:new Map(),cursors:new Map()};}
/** Canvas-local Pointer Events keep app panels native-scrollable. Each membership
 * change rebases the next delta, so pinch → one finger never jumps the camera. */
export function bindFishingCameraInput(canvas:HTMLElement,controller:Pick<FishingCameraController,'orbit'|'zoom'>,options:InputOptions={}){
 const gesture=options.gesture??createFishingCameraGesture(),pointers=gesture.pointers;
 const documentTarget=options.documentTarget??canvas.ownerDocument;
 const windowTarget=options.windowTarget??canvas.ownerDocument?.defaultView;
 const previousTouchAction=canvas.style.touchAction,previousCursor=canvas.style.cursor;
 canvas.style.touchAction='none';gesture.cursors.set(canvas,previousCursor);
 const restoreCursors=()=>{for(const [target,cursor] of gesture.cursors)target.style.cursor=cursor;};
 const enabled=()=>options.enabled?.()!==false&&!documentTarget?.hidden;
 const release=(id:number,target=canvas)=>{if(target.hasPointerCapture(id)){try{target.releasePointerCapture(id);}catch{/* Capture may already have been released by the browser. */}}};
 const cancel=()=>{const active=[...pointers];pointers.clear();gesture.tap=undefined;restoreCursors();for(const [id,point] of active)release(id,point.target);};
 const span=()=>{const [a,b]=pointers.values();return a&&b?Math.hypot(b.x-a.x,b.y-a.y):0;};
 const down=(event:PointerEvent)=>{
  if(event.button!==0||!enabled())return;
  event.preventDefault();
  if(pointers.size>=2||pointers.has(event.pointerId))return;
  gesture.tap=pointers.size?undefined:{id:event.pointerId,x:event.clientX,y:event.clientY};
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,target:canvas});
  try{canvas.setPointerCapture(event.pointerId);}catch{pointers.delete(event.pointerId);return;}
  canvas.style.cursor='grabbing';
 };
 const move=(event:PointerEvent)=>{
  if(!enabled()){cancel();return;}
  const previous=pointers.get(event.pointerId);if(!previous)return;
  event.preventDefault();
  // A missed mouse-up outside the window must not leave a sticky orbit gesture.
  if(event.pointerType==='mouse'&&event.buttons===0){cancel();return;}
  if(gesture.tap&&Math.hypot(event.clientX-gesture.tap.x,event.clientY-gesture.tap.y)>7)gesture.tap=undefined;
  const before=span();
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,target:canvas});
  if(pointers.size===2){const after=span();if(before>=8&&after>=8)controller.zoom(before/after);return;}
  const rect=canvas.getBoundingClientRect(),scale=canvas.clientWidth/Math.max(1,rect.width);
  controller.orbit((event.clientX-previous.x)*scale,(event.clientY-previous.y)*scale);
 };
 const end=(event:PointerEvent)=>{if(!pointers.delete(event.pointerId))return;event.preventDefault();const selection=gesture.tap?.id===event.pointerId&&Math.hypot(event.clientX-gesture.tap.x,event.clientY-gesture.tap.y)<=7?gesture.tap:undefined;gesture.tap=undefined;release(event.pointerId);if(!pointers.size)restoreCursors();if(selection&&enabled())options.onTap?.({x:event.clientX,y:event.clientY});};
 const canceled=(event:PointerEvent)=>{if(pointers.has(event.pointerId))cancel();};
 const lost=(event:PointerEvent)=>{gesture.tap=undefined;if(pointers.delete(event.pointerId)&&!pointers.size)restoreCursors();};
 const wheel=(event:WheelEvent)=>{
  if(!enabled())return;
  event.preventDefault();
  const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
  const delta=Math.max(-700,Math.min(700,event.deltaY*unit));
  controller.zoom(Math.exp(delta*.0012));
 };
 const visibility=()=>{if(documentTarget?.hidden)cancel();};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);
 canvas.addEventListener('pointercancel',canceled);canvas.addEventListener('lostpointercapture',lost);canvas.addEventListener('wheel',wheel,{passive:false});
 windowTarget?.addEventListener('blur',cancel);documentTarget?.addEventListener('visibilitychange',visibility);
 return {cancel,dispose(){
  cancel();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);
  canvas.removeEventListener('pointercancel',canceled);canvas.removeEventListener('lostpointercapture',lost);canvas.removeEventListener('wheel',wheel);
  windowTarget?.removeEventListener('blur',cancel);documentTarget?.removeEventListener('visibilitychange',visibility);
  canvas.style.touchAction=previousTouchAction;canvas.style.cursor=previousCursor;gesture.cursors.delete(canvas);
 }};
}
