/** Cosmetic snack sequence. Geometry is authored per hero; defaults preserve old callers. */
export const DEFAULT_CAT_FEED_GEOMETRY=Object.freeze({referenceSize:[1254,1254],faceCenter:[456,456],faceWidth:368,fishStart:[1320,980],fishControl:[850,-70],fishMouth:[420,480]});
export function catFeedingSample(elapsed,reduced=false,geometry=DEFAULT_CAT_FEED_GEOMETRY){
 if(elapsed<0||elapsed>=(reduced?950:3000))return null;
 const frame=reduced?(elapsed<220?'bite':elapsed<850?'settled':null):elapsed<160?null:elapsed<640?'anticipation':elapsed<920?'bite':elapsed<1760?(['chew','chew-b'][Math.floor((elapsed-920)/160)%2]):elapsed<1980?'lick':elapsed<2820?'settled':null,u=Math.max(0,Math.min(1,(elapsed-80)/560)),a=1-u;
 const [sx,sy]=geometry.fishStart,[cx,cy]=geometry.fishControl,[mx,my]=geometry.fishMouth;
 return {frame,fish:{visible:!reduced&&elapsed>=80&&elapsed<640,x:a*a*sx+2*a*u*cx+u*u*mx,y:a*a*sy+2*a*u*cy+u*u*my,rotation:-.4+u*.72}};
}
export function drawCatFeeding(ctx,assets,body,elapsed,reduced=false,geometry=DEFAULT_CAT_FEED_GEOMETRY){
 const sample=catFeedingSample(elapsed,reduced,geometry);if(!sample)return false;
 const sx=body.w/geometry.referenceSize[0],sy=body.h/geometry.referenceSize[1];
 if(sample.frame)assets.draw(ctx,`cat_feed_${sample.frame}`,body.x+geometry.faceCenter[0]*sx,body.y+geometry.faceCenter[1]*sy,geometry.faceWidth*sx);
 if(sample.fish.visible){ctx.save();ctx.translate(body.x+sample.fish.x*sx,body.y+sample.fish.y*sy);ctx.rotate(sample.fish.rotation);assets.draw(ctx,'cat_feed_fish',0,0,29*body.w/214);ctx.restore();}
 return true;
}
