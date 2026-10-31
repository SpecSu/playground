import {animalTransferPoint,animalTransferProgress,type InteractionPoint} from './interaction-motion.ts';

/** Alpaca lift policy: changing support-bone offsets must not pull the actor
 * backwards during the vertical phase. Keep the original support Y curve;
 * smoothly join the actual head-support XZ during horizontal travel. */
export function alpacaLiftSupportPoint({fromSupport,fromRoot,goalSupport,currentSupportOffset,clearanceY,elapsedMs}:{fromSupport:InteractionPoint;fromRoot:InteractionPoint;goalSupport:InteractionPoint;currentSupportOffset:InteractionPoint;clearanceY:number;elapsedMs:number}):InteractionPoint{
 const original=animalTransferPoint(fromSupport,goalSupport,clearanceY,elapsedMs);
 const u=Math.max(0,Math.min(1,(animalTransferProgress(elapsedMs)-.30)/.46)),t=u*u*(3-2*u);
 if(u>=1)return {x:goalSupport.x,y:original.y,z:goalSupport.z};
 const startX=fromRoot.x+currentSupportOffset.x,startZ=fromRoot.z+currentSupportOffset.z;
 return {x:startX+(goalSupport.x-startX)*t,y:original.y,z:startZ+(goalSupport.z-startZ)*t};
}
