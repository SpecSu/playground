import {createWalletDoubleTapController} from './wallet-doubletap.js';
const keys=['id','tileId','varietyId','plantedAt','readyAt'];
export const sameGrowingPlant=(a,b)=>!!a&&!!b&&keys.every(key=>a[key]===b[key]);
/** Countdown-local identity guard; wallet intent owns pointer/click alias deduplication. */
export function createGrowthTapController({isReady=()=>true,isCurrent,onSingleTap=()=>{},onDoubleTap,...timing}){
 let target=null;
 const controller=createWalletDoubleTapController({...timing,movementPx:7,movementAtLimitCancels:true,isReady:()=>!!target&&isReady()&&isCurrent(target),onSingleTap:event=>onSingleTap(target,event),onDoubleTap:event=>{const current=target;target=null;onDoubleTap(current,event);}});
 const cancelPending=()=>{target=null;controller.cancelPending();};
 const choose=plant=>{if(!plant||!isReady()||!isCurrent(plant)){cancelPending();return;}if(!sameGrowingPlant(plant,target)){cancelPending();target={...plant};}};
 return {
  handlePointerDown(event,plant){choose(plant);controller.handlePointerDown(event);},
  handlePointerMove:event=>controller.handlePointerMove(event),
  handlePointerUp(event,plant){if(!sameGrowingPlant(plant,target))cancelPending();controller.handlePointerUp(event);},
  handlePointerCancel(event){controller.handlePointerCancel(event);target=null;},
  handleClick(event,plant){choose(plant);controller.handleClick(event);},
  handleDoubleClick:event=>controller.handleDoubleClick(event),
  cancelPending,
  dispose(){target=null;controller.dispose();},
 };
}
