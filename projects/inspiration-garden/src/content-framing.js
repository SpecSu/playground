import {ADVANCED_ART_KEYS} from './advanced-catalogue.js';
import {isoPoint,CELL_W,CELL_H} from './scene-math.js';
import {buildingSample} from './blueprints.js';
import {plantCenter,buildingCenter} from './footprints.js';
import {isMature} from './state.js';
import {isBuilt} from './construction.js';
/** Default fit for currently visible new canopies only. No loading, persistent state or manual-zoom replacement. */
export function frameAdvancedCanopies({world,varieties,sprite,width,height,trayHeight=87,zoom,time,manual=false,pan={x:0,y:0}}){
 if(!world.plants.some(p=>isMature(p,time)&&ADVANCED_ART_KEYS.includes(varieties[p.varietyId]?.artKey)&&sprite(varieties[p.varietyId].artKey))&&!(world.exhibits??[]).some(b=>isBuilt(b,time)&&buildingSample(b.sampleId??b.artKey)?.sourceType==='memory'&&sprite(b.artKey)))return null;
 const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity},include=(l,t,r,b)=>{bounds.left=Math.min(bounds.left,l);bounds.right=Math.max(bounds.right,r);bounds.top=Math.min(bounds.top,t);bounds.bottom=Math.max(bounds.bottom,b);};
 for(const tile of world.tiles){const p=isoPoint(tile.x,tile.y);include(p.x-CELL_W/2,p.y-CELL_H/2-25,p.x+CELL_W/2,p.y+CELL_H/2+25);}
 const artBounds=(key,center,scale=1,offset=8)=>{const s=sprite(key);if(!s)return;const f=s.frame,a=s.anchor??[.5,1],alpha=s.alphaBounds??{x:0,y:0,w:f.w,h:f.h},w=s.width*scale,h=w*f.h/f.w,p=isoPoint(center.x,center.y);include(p.x+(alpha.x/f.w-a[0])*w,p.y+offset+(alpha.y/f.h-a[1])*h-(key==='airforce_memory_house'?12:0),p.x+((alpha.x+alpha.w)/f.w-a[0])*w,p.y+offset+((alpha.y+alpha.h)/f.h-a[1])*h);};
 for(const plant of world.plants)if(isMature(plant,time)){const v=varieties[plant.varietyId],center=plantCenter(world,plant,v);if(v&&center)artBounds(v.artKey,center,plant.scale??1);}
 for(const building of world.exhibits??[])if(isBuilt(building,time))artBounds(building.artKey,buildingCenter(world,building),building.scale??1,6);
 const top=120,bottom=Math.max(top+180,height-trayHeight-18),fit=Math.min(zoom,(width-32)/(bounds.right-bounds.left),(bottom-top)/(bounds.bottom-bounds.top)),z=manual?zoom:Math.max(.45,fit);
 return {zoom:z,x:width/2-(bounds.left+bounds.right)/2*z+pan.x,y:(top+bottom)/2-(bounds.top+bounds.bottom)/2*z+pan.y,bounds};
}
