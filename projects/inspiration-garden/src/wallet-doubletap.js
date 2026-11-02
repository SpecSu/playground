/**
 * Wallet-local intent only: no DOM listeners, economy mutations or browser-default blocking.
 * Feed wallet-started pointer chains plus their click/dblclick aliases. Cancel when a
 * contact leaves the wallet, another UI wins, or the page hides; dispose on teardown.
 * onDoubleTap is synchronous and may guard/dispatch the atomic +100 transaction.
 * Pointer delivery stays authoritative for this instance, including after cancellation.
 * Click-only fallback is for instances that have never observed a pointer event.
 * Keyboard/assistive clicks (detail 0, no pointerType) only invoke onSingleTap.
 */
export function createWalletDoubleTapController({
 onDoubleTap,onSingleTap=()=>{},isReady=()=>true,intervalMs=360,movementPx=18,movementAtLimitCancels=false,maxPressMs=500,
 now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,
}={}){
 let pending=null,timer=null,contact=null,pointerChannel=false,lastClickKey=null,disposed=false;
 const pointers=new Set(),seen=new WeakSet();
 const fresh=event=>{if(seen.has(event))return false;seen.add(event);return true;};
 const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
 const withinMovement=(a,b)=>movementAtLimitCancels?distance(a,b)<movementPx:distance(a,b)<=movementPx;
 const primary=event=>(event.button??0)===0&&event.isPrimary!==false;
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const discard=()=>{pending=null;contact=null;clear();};
 const cancelPending=()=>{discard();pointers.clear();};
 const usable=()=>{if(!disposed&&isReady())return true;cancelPending();return false;};
 const finishSingle=()=>{const first=pending;pending=null;clear();if(first&&usable())onSingleTap(first.event);};
 function tap(event,startedAt=now()){
  const at=now();
  if(pending&&startedAt-pending.at<=intervalMs&&withinMovement(event,pending.event)){
   pending=null;clear();onDoubleTap(event);return;
  }
  finishSingle();if(!usable())return;
  const first=pending={event,at};timer=setTimer(()=>{if(pending===first)finishSingle();},intervalMs);
 }
 return {
  handlePointerDown(event){
   pointerChannel=true;if(!fresh(event)||!usable())return;
   if(pointers.has(event.pointerId))return;
   pointers.add(event.pointerId);
   if(pointers.size!==1||!primary(event)){discard();return;}
   contact={event,at:now()};
   if(pending&&contact.at-pending.at<=intervalMs)clear();
  },
  handlePointerMove(event){
   pointerChannel=true;if(!fresh(event)||!usable())return;
   if(contact&&contact.event.pointerId===event.pointerId&&!withinMovement(contact.event,event))discard();
  },
  handlePointerUp(event){
   pointerChannel=true;if(!fresh(event)||!usable())return;const first=contact;
   if(!pointers.has(event.pointerId)||first&&event.timeStamp<first.event.timeStamp)return;
   const solo=pointers.size===1;pointers.delete(event.pointerId);contact=null;
   if(first&&solo&&first.event.pointerId===event.pointerId&&primary(event)&&now()-first.at<=maxPressMs&&withinMovement(first.event,event))tap(event,first.at);
   else discard();
  },
  handlePointerCancel(event){pointerChannel=true;if(!fresh(event)||!usable())return;pointers.delete(event.pointerId);discard();},
  handleClick(event){
   if(!fresh(event)||!usable()||(event.button??0)!==0)return;
   if(Number.isFinite(event.timeStamp)&&event.timeStamp>0){
    const key=[event.timeStamp,event.detail,event.pointerId,event.clientX,event.clientY].join(':');
    if(lastClickKey===key)return;lastClickKey=key;
   }
   if(event.detail===0&&!event.pointerType){cancelPending();onSingleTap(event);return;}
   // Once pointer delivery is observed, clicks remain aliases even if delivered late.
   if(!pointerChannel&&primary(event))tap(event);
  },
  // Native dblclick follows the two clicks (or pointerups) already counted.
  handleDoubleClick(){usable();},
  cancelPending,
  dispose(){disposed=true;cancelPending();},
 };
}
