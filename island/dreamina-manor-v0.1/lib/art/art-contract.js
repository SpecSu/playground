import {SHARED_CELL_SIZE,GROUND_TOP_Y,SEA_SURFACE_Y} from './physical-contract.js';
/** Independent art owner contract. Renderers consume these values; no game state. */
export const ART_GRID = Object.freeze({cellSize:SHARED_CELL_SIZE,groundY:GROUND_TOP_Y,tileTopLocalY:0,tileDepth:.72});
export const PLANT_ART_IDS=Object.freeze(['radish','daisy','tomato','tulip','pumpkin','sunflower','dragonfruit','iris','grape','phalaenopsis']);
export const ART_PALETTE=Object.freeze({water:'#72A8AA',turf:'#B5C491',soil:'#DECFAD',leafDeep:'#3F7757',leafMid:'#649164',leafLight:'#82A46C',wood:'#A8794D'});
export const ART_LIGHTING=Object.freeze({background:'#72A8AA',ambientIntensity:1.4,keyIntensity:1.85,fillIntensity:.85,exposure:1.05,toneMapping:'NeutralToneMapping',shadowBias:-.00025,skyColor:'#F5F7EE',groundColor:'#B6B59B',keyColor:'#FFF9F0',fillColor:'#E4F2F0',shadowRadius:3.2,shadowType:'PCFShadowMap'});
export const ART_OCEAN=Object.freeze({color:'#72A8AA',surfaceY:SEA_SURFACE_Y,unlit:true,toneMapped:false});
export const ART_CAMERA=Object.freeze({worldWidth:10.4,offset:[9,13.8,18],targetCell:[.5,.5],targetY:.75});
export const ART_ASSETS=Object.freeze({tile:'/assets/world/tile.glb',plant:(id)=>`/assets/world/plants/${id}.glb`});
export const TANK_VERTICAL=Object.freeze({baseBottom:.45,baseHeight:.12,floor:.59,landSurfaceMustRemain:true});

/** Camera keeps its user yaw/zoom; only the following target is biased towards nearby playable ground.
 * Local bounds use existing cells, never rescale the island or fit distant expansion. */
export const ART_FOLLOW=Object.freeze({localRadiusCells:2.5,activityMix:.45,maxBiasCells:.65,targetY:.75});
export function artFollowTarget(player,cells,cellSize=SHARED_CELL_SIZE){
 const nearby=cells.filter(c=>Math.hypot(c.x*cellSize-player.x,c.z*cellSize-player.z)<=ART_FOLLOW.localRadiusCells*cellSize);
 if(!nearby.length)return {x:player.x,y:ART_FOLLOW.targetY,z:player.z};
 const xs=nearby.map(c=>c.x*cellSize),zs=nearby.map(c=>c.z*cellSize);
 let dx=((Math.min(...xs)+Math.max(...xs))/2-player.x)*ART_FOLLOW.activityMix;
 let dz=((Math.min(...zs)+Math.max(...zs))/2-player.z)*ART_FOLLOW.activityMix;
 const len=Math.hypot(dx,dz),limit=ART_FOLLOW.maxBiasCells*cellSize;if(len>limit){dx*=limit/len;dz*=limit/len;}
 return {x:player.x+dx,y:ART_FOLLOW.targetY,z:player.z+dz};
}
