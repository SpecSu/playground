import {buildingFootprint} from './footprints.js';
import {constructionProgress,workRemaining} from './construction.js';
const line=(c,a,b)=>{c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();};
export function drawWorkBadge(ctx,p,item,now,z=1,offsetY=-20){
 const progress=constructionProgress(item,now),w=92*z,h=25*z,x=p.x-w/2,y=p.y+offsetY*z;ctx.save();ctx.fillStyle='#fdf6e7f5';ctx.strokeStyle='#9d966f';ctx.lineWidth=.9*z;ctx.beginPath();ctx.roundRect(x,y,w,h,8*z);ctx.fill();ctx.stroke();ctx.fillStyle='#766f53';ctx.font=`500 ${9.5*z}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`建设 ${Math.floor(progress*100)}% · ${workRemaining(item,now)}秒`,p.x,y+10*z);ctx.fillStyle='#ddd7bb';ctx.fillRect(x+7*z,y+19*z,w-14*z,2.3*z);ctx.fillStyle='#9eb078';ctx.fillRect(x+7*z,y+19*z,(w-14*z)*progress,2.3*z);ctx.restore();
}
export function drawFoundationWork(ctx,p,item,now,z,cellW,cellH){
 const progress=constructionProgress(item,now);ctx.save();ctx.fillStyle='#c9b493';ctx.strokeStyle='#95846c';ctx.lineWidth=1.2*z;ctx.beginPath();ctx.moveTo(p.x,p.y-cellH*z/2+2*z);ctx.lineTo(p.x+cellW*z/2-2*z,p.y);ctx.lineTo(p.x,p.y+cellH*z/2-2*z);ctx.lineTo(p.x-cellW*z/2+2*z,p.y);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9d2a3';ctx.lineWidth=4*z;for(let i=0;i<1+Math.floor(progress*3);i++){const x=p.x-22*z+i*14*z;line(ctx,{x,y:p.y-5*z},{x:x+17*z,y:p.y+5*z});}drawWorkBadge(ctx,p,item,now,z,-27);ctx.restore();
}
export function drawBuildingWorksite(ctx,assets,p,item,now,z){
 const footprint=buildingFootprint({},item);if(footprint[0]!==2||footprint[1]!==2){const [fw,fh]=footprint,corners=[[-fw/2,-fh/2],[fw/2,-fh/2],[fw/2,fh/2],[-fw/2,fh/2]].map(([x,y])=>({x:p.x+(x-y)*54*z,y:p.y+(x+y)*27*z}));ctx.save();ctx.fillStyle='#d8c7a1bb';ctx.strokeStyle='#928364';ctx.lineWidth=2*z;ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();ctx.fill();ctx.stroke();for(const c of corners)line(ctx,c,{x:c.x,y:c.y-28*z});drawWorkBadge(ctx,p,item,now,z,-70);ctx.restore();return {x:Math.min(...corners.map(c=>c.x)),y:Math.min(...corners.map(c=>c.y))-28*z,w:Math.max(...corners.map(c=>c.x))-Math.min(...corners.map(c=>c.x)),h:Math.max(...corners.map(c=>c.y))-Math.min(...corners.map(c=>c.y))+28*z};}
 const sprite=assets.sprite('construction_site'),w=(sprite?.width??214)*z,f=sprite?.frame??{w:1,h:1},h=w*f.h/f.w,a=sprite?.anchor??[.5,.65],b=sprite?.alphaBounds??{x:0,y:0,w:f.w,h:f.h};ctx.save();
 if(!assets.draw(ctx,'construction_site',p.x,p.y+6*z,w)){ctx.strokeStyle='#8b795c';ctx.fillStyle='#d8bf8f';ctx.lineWidth=4*z;const corners=[[-.43,0],[0,-.21],[.43,0],[0,.21]].map(([x,y])=>({x:p.x+x*w,y:p.y+y*w}));ctx.beginPath();corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();ctx.fill();ctx.stroke();for(const c of corners)line(ctx,c,{x:c.x,y:c.y-25*z});}
 drawWorkBadge(ctx,p,item,now,z,-108);ctx.restore();return {x:p.x+(b.x/f.w-a[0])*w,y:p.y+6*z+(b.y/f.h-a[1])*h,w:b.w/f.w*w,h:b.h/f.h*h};
}
