/** Product manor tap contract: a drag cannot become a tap again by returning to its start. */
export const isUnpressedMouseMove=(e:PointerEvent)=>e.pointerType==='mouse'&&e.buttons===0;
export function createTapGate(threshold=6){
 const pointers=new Set<number>();let candidate:{id:number;x:number;y:number}|null=null,invalid=false,eligible=false;
 return {
  down(e:PointerEvent){eligible=false;pointers.add(e.pointerId);if(pointers.size===1){candidate={id:e.pointerId,x:e.clientX,y:e.clientY};invalid=e.button!==0;}else{candidate=null;invalid=true;}},
  move(e:PointerEvent){if(isUnpressedMouseMove(e))return;if(candidate&&Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)>=threshold)invalid=true;},
  up(e:PointerEvent){this.move(e);const valid=!!candidate&&candidate.id===e.pointerId&&!invalid&&pointers.size===1;pointers.delete(e.pointerId);candidate=null;if(!pointers.size)invalid=false;eligible=valid;},
  cancel(){pointers.clear();candidate=null;invalid=true;eligible=false;},
  consume(){const yes=eligible;eligible=false;return yes;}
 };
}
