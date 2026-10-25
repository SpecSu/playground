/** Shared display-only path. Screen endpoints are frozen before local acceptance. */
export const GATHER_FLIGHT_MS=760;
export const gatherFlightDelay=(index,count)=>Math.floor(index*Math.min(count,20)/Math.max(1,count))*100;
export function gatherFlightSample(from,to,progress){
 const t=Math.max(0,Math.min(1,progress)),lift=Math.min(60,Math.max(30,from.y*.2)),rise={x:from.x+(to.x-from.x)*.08,y:from.y-lift};let x,y;
 if(t<.2){const u=t/.2;x=from.x+(rise.x-from.x)*u;y=from.y-lift*Math.sin(u*Math.PI/2);}
 else{const u=(t-.2)/.8,c={x:from.x+(to.x-from.x)*.55,y:rise.y-Math.min(100,Math.abs(to.x-from.x)*.2+40)};x=(1-u)**2*rise.x+2*(1-u)*u*c.x+u*u*to.x;y=(1-u)**2*rise.y+2*(1-u)*u*c.y+u*u*to.y;}
 const near=Math.max(64,Math.hypot(to.x-from.x,to.y-from.y)*.22),shrink=Math.max(0,1-Math.hypot(to.x-x,to.y-y)/near)*Math.max(0,(t-.72)/.28);return{x,y,scale:1-.98*shrink*shrink,opacity:t<.94?1:Math.max(0,(1-t)/.06)};
}
