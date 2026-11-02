/** A mouse hover is never a held drag, even if capture dispatches it between down and up. */
export const isUnpressedMouseMove=e=>e.pointerType==='mouse'&&e.buttons===0;
/** Track an entire contact sequence. UI-origin contacts never enter this gate. */
export function createTapGate(threshold=6){const pointers=new Set();let candidate=null,invalid=false,eligible=false;return {
 down(e){eligible=false;pointers.add(e.pointerId);if(pointers.size===1){candidate={id:e.pointerId,x:e.clientX,y:e.clientY};invalid=false;}else{candidate=null;invalid=true;}},
 move(e){if(isUnpressedMouseMove(e))return;if(candidate&&Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)>=threshold)invalid=true;},
 up(e){const valid=!!candidate&&candidate.id===e.pointerId&&!invalid&&pointers.size===1;pointers.delete(e.pointerId);candidate=null;if(!pointers.size)invalid=false;eligible=valid;},
 cancel(){pointers.clear();candidate=null;invalid=true;eligible=false;},
 consume(){const yes=eligible;eligible=false;return yes;}
};}
