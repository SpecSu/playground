import{fishTankFit}from'./fish-space.js';
import{constructionView}from'./construction.js';
export const FISH_HOUSING_VERSION=2;
/** One-time, lossless compatibility migration. Never sells, resizes, or touches the hand. */
export function migrateFishHousing(game,now){
 if((game.fishHousingVersion??0)>=FISH_HOUSING_VERSION)return null;
 const next=structuredClone(game),layout=constructionView(game,now);let count=0;
 for(const item of next.items)if(item.kind==='fish'&&item.location.kind==='tank'){
  const fit=fishTankFit(layout,item);if(!fit.fitsFootprint||!fit.fitsHeight){item.location={kind:'bag'};count++;}
 }
 next.fishHousingVersion=FISH_HOUSING_VERSION;
 if(count)next.activity=[{id:'fish-housing-v2',kind:'fish-housing',count,at:now},...(next.activity??[])];
 return {state:next,count};
}
