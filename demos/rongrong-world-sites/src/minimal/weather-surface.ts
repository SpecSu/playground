import {isShopTile,WATER_BOWL,REST_MAT,type Tile} from './model.ts';
import {worldPoint,terrainSurfaceHeight} from './scenery-art.ts';
import {sampleWater,type WaterField} from './terrain-water.ts';
import type {WeatherSurfaceSampler} from './weather-precipitation.ts';
/** Cosmetic impacts only. Never used for navigation or physical actor support. */
export function createWeatherSurfaceSampler(tiles:readonly Tile[],water?:WaterField):WeatherSurfaceSampler{
 const index=new Map(tiles.map(t=>[`${t.x},${t.z}`,t])),bowl=worldPoint(WATER_BOWL),mat=worldPoint(REST_MAT);
 return(x,z)=>{
  const tile=index.get(`${Math.round(x/2+1.5)},${Math.round(z/2+1.5)}`);if(!tile)return {height:0,snowAllowed:false};
  if(isShopTile(tile))return {height:2.2,snowAllowed:false};
  if(Math.hypot(x-(bowl.x-.5),z-(bowl.z-.45))<.28)return {height:.183,water:true,snowAllowed:false};
  if(Math.abs(x-(mat.x-.45))<.41&&Math.abs(z-(mat.z-.35))<.32)return {height:.075,snowAllowed:false};
  const center=worldPoint(tile);if(water&&(tile.terrain==='pond'||tile.terrain==='creek')){const s=sampleWater(water,x,z,tile);return {height:s.coverage?s.height:0,water:!!s.coverage,snowAllowed:!s.coverage};}
  const height=terrainSurfaceHeight(tile,x-center.x,z-center.z,tiles),wet=tile.terrain==='pond'||tile.terrain==='creek'&&height>=.006;
  return {height,water:wet,snowAllowed:!wet};
 };
}
