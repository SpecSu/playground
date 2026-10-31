import type {GridPoint,BuildingKind} from './layout.ts';
import {BUILDING_RULES} from './layout.ts';
export type PlacementPointer={pointerId:number;isPrimary:boolean;button:number};
/** A pointer owns only a temporary grid proposal; confirmation is a separate transaction. */
export class PlacementDrag{
 private pointer:number|undefined;private origin:GridPoint|undefined;private offset:GridPoint={x:0,z:0};private last:GridPoint|undefined;
 get active(){return this.pointer!==undefined;}
 owns(id:number){return id===this.pointer;}
 begin(e:PlacementPointer,ground:GridPoint,ghost:GridPoint&{kind:BuildingKind},grabbedModel=false):boolean{
  if(this.active||!e.isPrimary||e.button!==0||!Number.isFinite(ground.x)||!Number.isFinite(ground.z))return false;
  this.pointer=e.pointerId;this.origin={x:ghost.x,z:ghost.z};this.last={...this.origin};
  const r=BUILDING_RULES[ghost.kind],inside=ground.x>=ghost.x-.7&&ground.x<=ghost.x+r.width-.3&&ground.z>=ghost.z-.7&&ground.z<=ghost.z+r.depth-.3;
  this.offset=grabbedModel||inside?{x:ground.x-ghost.x,z:ground.z-ghost.z}:{x:(r.width-1)/2,z:(r.depth-1)/2};return true;
 }
 move(id:number,ground:GridPoint):GridPoint|null{
  if(!this.owns(id)||!Number.isFinite(ground.x)||!Number.isFinite(ground.z))return null;
  const next={x:Math.round(ground.x-this.offset.x),z:Math.round(ground.z-this.offset.z)};
  if(next.x===this.last?.x&&next.z===this.last?.z)return null;this.last=next;return {...next};
 }
 finish(id:number):boolean{if(!this.owns(id))return false;this.pointer=undefined;this.origin=undefined;this.last=undefined;return true;}
 cancel():GridPoint|null{const origin=this.origin;this.pointer=undefined;this.origin=undefined;this.last=undefined;return origin?{...origin}:null;}
}

/** Only intentional edge holding pans the placement camera; the ghost position never drives it. */
export function placementEdgeDirection(pointer:{clientX:number;clientY:number},rect:{left:number;top:number;width:number;height:number}):GridPoint{
 if(rect.width<=0||rect.height<=0)return {x:0,z:0};const margin=Math.min(32,rect.width*.09),x=pointer.clientX-rect.left,y=pointer.clientY-rect.top;
 return {x:x<margin?-1:x>rect.width-margin?1:0,z:y<margin?-1:y>rect.height-margin?1:0};
}
