import {isBuilt} from './construction.js';
import {buildingAtTile} from './footprints.js';
import {validEdge} from './state.js';
const sides=['south','east','north','west'];
export function initialEdgePreview(world,kind,time,actor=null){
 const candidates=[];for(const tile of world.tiles.filter(t=>isBuilt(t,time)))for(const edge of sides)if(validEdge(world,tile.id,edge)){const [dx,dy]={south:[0,1],east:[1,0],north:[0,-1],west:[-1,0]}[edge],front=['south','east'].includes(edge),outside=!world.tiles.some(t=>t.x===tile.x+dx&&t.y===tile.y+dy);candidates.push({tile,edge,score:(front?0:100)+(outside?0:20)+(buildingAtTile(world,tile.id)?30:0)+(actor?Math.hypot(tile.x-actor.x,tile.y-actor.y):-(tile.x+tile.y)*.1)});}
 candidates.sort((a,b)=>a.score-b.score);const best=candidates[0];return best?{tileId:best.tile.id,edge:best.edge,armed:true}:{tileId:null,edge:null,armed:false};
}
export function chooseEdgePreview(world,mode,target,time){const tile=target.tile,edge=target.edge,valid=tile&&sides.includes(edge)&&isBuilt(tile,time)&&validEdge(world,tile.id,edge);if(!valid)return {confirm:false,preview:{tileId:tile?.id??null,edge:edge??null,armed:false,invalid:true},message:'这里不能放置边饰，换一条空边吧。'};const previous=mode.edgePreview,same=previous?.tileId===tile.id&&previous.edge===edge;return {confirm:!!((target.pointerType==='mouse'&&target.edgePreviewMatch===true)||(same&&previous.armed&&target.edgePreviewMatch!==false)),preview:{tileId:tile.id,edge,armed:true}};}
