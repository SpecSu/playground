/** Finite local ornament responses. Never moves the building, avatar, or occupied cells. */
export const PERSONAL_REACTION_MS=Object.freeze({shutter:550,'shell-glow':1200,canopy:1600});
export function personalExhibitReactionSample(kind,elapsed,reduced=false){
 const duration=PERSONAL_REACTION_MS[kind],rest={active:false,glow:0,sway:0,progress:.5};
 if(!duration||!Number.isFinite(elapsed)||elapsed<0||elapsed>=(reduced?Math.min(duration,650):duration))return rest;
 const u=elapsed/(reduced?Math.min(duration,650):duration),glow=Math.sin(Math.PI*u);
 return {active:true,glow,sway:!reduced&&kind==='canopy'?Math.sin(u*Math.PI*4)*glow*2:0,progress:reduced?.5:u};
}
export function drawPersonalExhibitReaction(ctx,kind,body,sprite,sample,zoom=1){
 if(!sample.active)return;
 const point=([x,y])=>({x:body.x+body.w*x,y:body.y+body.h*y});
 ctx.save();ctx.globalAlpha*=sample.glow;ctx.strokeStyle='#f7f7e8';ctx.fillStyle='#fff3c6';ctx.lineWidth=1.2*zoom;
 if(kind==='shutter'&&sprite.lensAnchor){
  const p=point(sprite.lensAnchor),r=5*zoom;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.7,-.2,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-r*.6,p.y);ctx.lineTo(p.x+r*.6,p.y);ctx.moveTo(p.x,p.y-r*.6);ctx.lineTo(p.x,p.y+r*.6);ctx.stroke();
 }else if(kind==='shell-glow'&&sprite.ribGlowAnchors?.length){
  const anchors=sprite.ribGlowAnchors,at=sample.progress*(anchors.length-1),lo=Math.floor(at),a=point(anchors[lo]),b=point(anchors[Math.min(lo+1,anchors.length-1)]),u=at-lo;
  ctx.beginPath();ctx.ellipse(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,4*zoom,2.6*zoom,0,0,Math.PI*2);ctx.fill();
 }else if(kind==='canopy'){
  if(sprite.lanternAnchor){const p=point(sprite.lanternAnchor);ctx.beginPath();ctx.ellipse(p.x,p.y,4*zoom,5*zoom,0,0,Math.PI*2);ctx.fill();}
  if(sprite.clothEdge?.length){ctx.globalAlpha*=.55;ctx.beginPath();sprite.clothEdge.forEach((v,i)=>{const p=point(v),y=p.y+sample.sway*zoom*Math.sin(Math.PI*i/(sprite.clothEdge.length-1));if(i)ctx.lineTo(p.x,y);else ctx.moveTo(p.x,y);});ctx.stroke();}
 }
 ctx.restore();
}
