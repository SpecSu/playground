import {isBuilt} from './construction.js';
import {footprintOf,plantAtTile,buildingAtTile} from './footprints.js';
export const CELL_W=108,CELL_H=54;
export const isoPoint=(x,y,camera={x:0,y:0,zoom:1})=>({x:camera.x+(x-y)*CELL_W/2*camera.zoom,y:camera.y+(x+y)*CELL_H/2*camera.zoom});
export const isoCell=(px,py,camera={x:0,y:0,zoom:1})=>{const a=(px-camera.x)/(CELL_W/2*camera.zoom),b=(py-camera.y)/(CELL_H/2*camera.zoom);return {x:Math.round((a+b)/2),y:Math.round((b-a)/2)};};
export const placementCells=tiles=>{
 const occupied=new Set(tiles.map(t=>`${t.x}:${t.y}`)),out=new Map();
 for(const t of tiles)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=t.x+dx,y=t.y+dy,key=`${x}:${y}`;if(!occupied.has(key))out.set(key,{x,y});}
 return [...out.values()];
};
export const buildPlacementCells=(tiles,now)=>placementCells(tiles).filter(cell=>tiles.some(tile=>isBuilt(tile,now)&&Math.abs(tile.x-cell.x)+Math.abs(tile.y-cell.y)===1));
export const edgeAtPoint=(dx,dy)=>dx>=0?(dy<0?'north':'east'):(dy>=0?'south':'west');
export function animationSample(kind,t){
 const p=Math.max(0,Math.min(1,t)),wave=Math.sin(Math.PI*p),ring=Math.sin(p*Math.PI*6)*(1-p);
 const a={sx:1,sy:1,dy:0,rotation:0,glow:0};
 if(p===0||p===1)return a;
 switch(kind){
  case 'seed-shake':a.rotation=ring*.12;a.dy=-wave*4;break;
  case 'puff':a.sx=1+.3*wave;a.sy=1+.19*wave;break;
  case 'drum':a.dy=-Math.abs(Math.sin(p*Math.PI*4))*11*(1-p);a.sx=1+ring*.06;a.sy=1-ring*.1;break;
  case 'bell':a.rotation=ring*.14;a.glow=wave*.4;break;
  case 'keyboard':a.dy=-Math.abs(ring)*7;a.rotation=ring*.03;break;
  case 'whisper':a.rotation=wave*.13;a.sx=1+wave*.05;break;
  case 'wave':a.rotation=ring*.11;a.sx=1+ring*.09;break;
  case 'sleep':a.sy=1-wave*.12;a.dy=wave*7;a.rotation=ring*.05;break;
  case 'glow':a.glow=wave;a.dy=-wave*4;break;
  case 'float':a.dy=-wave*20;a.rotation=ring*.06;a.glow=wave*.4;break;
  case 'bubble':a.sx=1+ring*.08;a.rotation=ring*.04;break;
  case 'paint':a.rotation=ring*.16;a.dy=-wave*9;break;
  case 'gramophone':a.rotation=ring*.07;a.sx=1+ring*.04;break;
  default:a.rotation=ring*.08;a.dy=-wave*4;
 }
 return a;
}
export function fitZoom(tiles,width,height){
 if(!tiles.length)return 1;
 const pts=tiles.map(t=>isoPoint(t.x,t.y));
 const w=Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x))+CELL_W+64;
 const h=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))+CELL_H+110;
 return Math.max(.45,Math.min(1.35,(width-40)/w,(height-35)/h));
}
export const avatarStandPoint=(tile,plants=[],tiles=[],varieties={},buildings=[])=>{
 const plant=tiles.length?plantAtTile({tiles,plants},tile.id,varieties):plants.find(p=>p.tileId===tile.id);if(!plant){const b=tiles.length?buildingAtTile({tiles,exhibits:buildings},tile.id):null;if(b){const anchor=b.tileId?tiles.find(t=>t.id===b.tileId):b;return {x:anchor.x+1.44,y:anchor.y-.44};}return {x:tile.x,y:tile.y};}
 const v=varieties[plant.varietyId],anchor=tiles.find(t=>t.id===plant.tileId)??tile;
 if(footprintOf(v)[0]===2)return {x:anchor.x+1.44,y:anchor.y-.44};
 return {x:tile.x+.32,y:tile.y-.32};
};
export const stableSceneZoom=(tiles,width,height,_trayHeight=0)=>fitZoom(tiles,width,Math.max(300,height-270));
export function distanceToSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;if(!len)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
export const keyboardInset=(layoutHeight,viewport)=>viewport?Math.max(0,Math.round(layoutHeight-viewport.height-(viewport.offsetTop??0))):0;
export function coversAvatarHead(body,avatar,z=1){const head={x:avatar.x-10*z,y:avatar.y-63*z,w:20*z,h:27*z},w=Math.max(0,Math.min(body.x+body.w,head.x+head.w)-Math.max(body.x,head.x)),h=Math.max(0,Math.min(body.y+body.h,head.y+head.h)-Math.max(body.y,head.y));return w*h/(head.w*head.h)>.25;}
export function minimalVerticalOffset(bounds,top,bottom,margin=8){if(bounds.h>bottom-top-margin*2)return (top+bottom)/2-(bounds.y+bounds.h/2);if(bounds.y+bounds.h>bottom-margin)return bottom-margin-bounds.y-bounds.h;if(bounds.y<top+margin)return top+margin-bounds.y;return 0;}
