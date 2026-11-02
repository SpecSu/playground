/** Avatar yaw only: fixed framing, no camera orbit or gameplay input. */
export function createAvatarTurntable(){
  let angle=0,remaining=0,mode='lobby';
  const reset=()=>{angle=0;remaining=0;};
  return {
    get angle(){return angle;},reset,
    setMode(value){mode=value;reset();},
    spin(){if(mode!=='lobby')return false;angle=0;remaining=Math.PI*2;return true;},
    drag(delta){if(mode!=='lobby'||!Number.isFinite(delta))return false;remaining=0;angle=(angle+delta)%(Math.PI*2);return true;},
    update(dt){if(mode==='lobby'&&remaining>0){const step=Math.min(remaining,Math.max(0,dt)*(1.7+remaining*.22));angle+=step;remaining-=step;if(remaining<.001)reset();}return angle;},
  };
}

/** A dedicated avatar hit area keeps controls out of the gesture path. */
export function bindAvatarInspection(element,{isEnabled,onRotate,eventTarget=window,visibilityTarget=document}){
  let pointer=null;const cleanups=[];
  function listen(target,type,fn){target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));}
  function cancel(){
    const old=pointer;pointer=null;element.classList.toggle('is-dragging',false);
    try{if(old&&element.hasPointerCapture?.(old.id))element.releasePointerCapture(old.id);}catch{}
  }
  listen(element,'pointerdown',e=>{
    if(pointer||!isEnabled()||e.target!==element||(e.button!==undefined&&e.button!==0)||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,active:false};
    try{element.setPointerCapture?.(e.pointerId);}catch{/* Window release/move remain available. */}
  });
  listen(eventTarget,'pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    if(!isEnabled()){cancel();return;}
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(!pointer.active){
      if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
      if(Math.abs(dy)>=Math.abs(dx)){cancel();return;}
      pointer.active=true;element.classList.toggle('is-dragging',true);
    }
    const delta=(e.clientX-pointer.lastX)/Math.max(1,element.getBoundingClientRect().width)*Math.PI;
    if(onRotate(delta)===false){cancel();return;}
    pointer.lastX=e.clientX;e.preventDefault();
  });
  for(const type of ['pointerup','pointercancel'])listen(eventTarget,type,e=>{if(pointer?.id===e.pointerId)cancel();});
  listen(element,'lostpointercapture',e=>{if(pointer?.id===e.pointerId)cancel();});
  listen(eventTarget,'blur',cancel);
  listen(visibilityTarget,'visibilitychange',()=>{if(visibilityTarget.hidden)cancel();});
  return {cancel,destroy(){cancel();cleanups.forEach(fn=>fn());}};
}
