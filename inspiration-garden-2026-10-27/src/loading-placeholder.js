// Decorative loading only: no interaction bounds, saved state, or asset requests.
const quad=(ctx,ax,ay,bx,by,cx,cy,dx,dy)=>{ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx,cy);ctx.lineTo(dx,dy);ctx.closePath();};
/** x/y is the footprint's ground center in CSS pixels; dimensions use the scene's 2:1 projection. */
export function drawLoadingPlaceholder(ctx,{x,y,zoom=1,footprint=[2,2],kind='building',time=0,reduceMotion=false,height}={}){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(zoom)||zoom<=0)return;
 const plant=kind==='plant',inset=plant?.55:.88,cols=Math.max(1,Math.min(4,Number(footprint?.[0])||1)),rows=Math.max(1,Math.min(4,Number(footprint?.[1])||1));
 const u=cols*54*inset*zoom,v=rows*54*inset*zoom,uy=u/2,vy=v/2,base=y+6*zoom;
 const bx=x+(-u+v)/2,by=base-(uy+vy)/2,rx=x+(u+v)/2,ry=base+(uy-vy)/2,fx=x+(u-v)/2,fy=base+(uy+vy)/2,lx=x-(u+v)/2,ly=base+(-uy+vy)/2;
 const h=(Number.isFinite(height)?Math.max(12,Math.min(160,height)):plant?38:72)*zoom,breath=reduceMotion?1:1+.055*Math.sin((Number.isFinite(time)?time:0)/1100);
 ctx.save();const opacity=ctx.globalAlpha;ctx.lineJoin='round';ctx.lineWidth=1.1*zoom;
 // Three low-opacity diamond layers give a soft grounded shadow without an expensive blur or a conspicuous disk.
 ctx.fillStyle='#456b60';for(let i=2;i>=0;i--){const scale=1+i*.035,offset=(3+i)*zoom;ctx.globalAlpha=opacity*(.025+i*.008);quad(ctx,x+(bx-x)*scale,base+(by-base)*scale+offset,x+(rx-x)*scale,base+(ry-base)*scale+offset,x+(fx-x)*scale,base+(fy-base)*scale+offset,x+(lx-x)*scale,base+(ly-base)*scale+offset);ctx.fill();}
 ctx.globalAlpha=opacity*.36*breath;ctx.strokeStyle='#6b9584';ctx.fillStyle='#9fbaa2';quad(ctx,lx,ly-h,fx,fy-h,fx,fy,lx,ly);ctx.fill();ctx.stroke();
 ctx.globalAlpha=opacity*.40*breath;ctx.fillStyle='#78a59a';quad(ctx,fx,fy-h,rx,ry-h,rx,ry,fx,fy);ctx.fill();ctx.stroke();
 ctx.globalAlpha=opacity*.43*breath;ctx.fillStyle='#c4d3b5';ctx.strokeStyle='#779c8b';quad(ctx,bx,by-h,rx,ry-h,fx,fy-h,lx,ly-h);ctx.fill();ctx.stroke();
 ctx.restore();
}
/** A short fade for art that was actually missing. Cached art appears immediately. */
export function createLoadingReveal({duration=250,limit=128}={}){
 const entries=new Map(),ms=Number.isFinite(duration)&&duration>0?duration:250,cap=Number.isFinite(limit)?Math.max(1,Math.floor(limit)):128;
 return {opacity(id,ready,time,reduceMotion=false){
  if(!ready){if(!entries.has(id)&&entries.size>=cap)entries.delete(entries.keys().next().value);entries.set(id,null);return 0;}
  if(!entries.has(id))return 1;if(reduceMotion){entries.delete(id);return 1;}
  const at=Number.isFinite(time)?time:0;if(entries.get(id)===null)entries.set(id,at);const progress=Math.max(0,Math.min(1,(at-entries.get(id))/ms));if(progress===1)entries.delete(id);return progress;
 },clear(){entries.clear();},get size(){return entries.size;}};
}
