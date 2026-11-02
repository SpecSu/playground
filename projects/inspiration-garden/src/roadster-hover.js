/** Scene-only display values. Lift uses CSS pixels at zoom 1; no world coordinates. */
export const ROADSTER_HOVER_MS=1800;
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const x=clamp(n);return x*x*(3-2*x);};
const grounded=()=>({active:false,lift:0,jetAlpha:0,shadowScale:1,shadowAlpha:1});
export function roadsterHoverSample(elapsed,reduced=false){
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=(reduced?650:ROADSTER_HOVER_MS))return grounded();
 if(reduced)return {...grounded(),active:true};
 const rise=elapsed<250?0:elapsed<650?ease((elapsed-250)/400):elapsed<=1100?1:1-ease((elapsed-1100)/550);
 const gas=elapsed<100?elapsed/100:elapsed<1100?.8:elapsed<1650?.8*(1-ease((elapsed-1100)/550)):0;
 return {active:true,lift:12*rise,jetAlpha:clamp(gas)*(.8+.2*Math.sin(elapsed/70)**2),shadowScale:1-.16*rise,shadowAlpha:1-.4*rise};
}

/** Short cold-gas lobes attach to authored underside points, never to footprint cells. */
export function drawRoadsterJets(ctx,body,anchors,sample,zoom=1,reduced=false){
 if(!Array.isArray(anchors))return;
 if(reduced&&sample.active){ctx.save();ctx.globalAlpha*=.55;ctx.fillStyle='#d9edf2';for(const [x,y]of anchors){ctx.beginPath();ctx.ellipse(body.x+body.w*x,body.y+body.h*y,2.5*zoom,1.5*zoom,0,0,Math.PI*2);ctx.fill();}ctx.restore();return;}
 if(!sample.jetAlpha)return;
 ctx.save();ctx.globalAlpha*=sample.jetAlpha;ctx.fillStyle='#eefaff';ctx.shadowColor='#d8f3ff';ctx.shadowBlur=2*zoom;
 for(const [x,y]of anchors){const px=body.x+body.w*x,py=body.y+body.h*y;ctx.beginPath();ctx.moveTo(px-2.2*zoom,py);ctx.quadraticCurveTo(px-4*zoom,py+5*zoom,px,py+9*zoom);ctx.quadraticCurveTo(px+4*zoom,py+5*zoom,px+2.2*zoom,py);ctx.closePath();ctx.fill();}
 ctx.restore();
}
