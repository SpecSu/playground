/** Legacy manor v37 feedback, adapted without any game-state or economy dependency.
 * Source commit 633f1af5f8f8a6fe30f267abef0f2383c962b4e2. See docs/legacy-coin-provenance.md.
 */
export const AUDIO_PATH='assets/audio/legacy-sale-coins.wav';
// Exact original HUD engraving; no numeral or generic currency symbol.
export const GOLD_COIN_SVG='<svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="11" rx="7.5" ry="7.6" fill="#B87D24"/><circle cx="9.5" cy="9" r="7.5" fill="#E8B64E" stroke="#B98225" stroke-width=".8"/><circle cx="9.5" cy="9" r="5.7" fill="#F6D16F" stroke="#D29A33" stroke-width=".8"/><path d="M5.4 5.8A5.8 5.8 0 0 1 11 3.6" fill="none" stroke="#FFF0AD" stroke-width="1.4" stroke-linecap="round"/></svg>';
export function coinCount(value){return value<30?3:value<100?5:7;}
export function flightPoints(from,to,count=13){return Array.from({length:count},(_,i)=>{const t=i/(count-1);return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t-Math.sin(Math.PI*t)*Math.min(100,Math.abs(to.y-from.y)*.3+45)};});}
/** Call capture BEFORE rendering removes a sale button. Coordinates are host-local CSS px.
 * Call sale ONLY after a successful sale; id is the sold instance/transaction ID, value the actual gain.
 * Sound hook must honor mute/visibility. Reduced motion keeps a short stationary HUD fade.
 */
export function createCoinReward(host,{target=()=>host.querySelector('.wallet.coins'),playSound=()=>{},document:doc=globalThis.document,reducedMotion=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}={}){
 const seen=new Set(),live=new Map();let disposed=false;
 const capture=element=>{
  const h=host.getBoundingClientRect(),r=element?.getBoundingClientRect?.(),sx=(host.clientWidth||h.width)/h.width,sy=(host.clientHeight||h.height)/h.height;
  return r?{x:(r.left+r.width/2-h.left)*sx,y:(r.top+r.height/2-h.top)*sy}:{x:(host.clientWidth||h.width)/2,y:(host.clientHeight||h.height)*.65};
 };
 const clear=element=>{const a=live.get(element);live.delete(element);if(a){a.onfinish=null;a.oncancel=null;try{a.cancel?.();}catch{}}element.remove();};
 function animate(element,frames,options,after){
  host.append(element);live.set(element,null);
  if(typeof element.animate!=='function'){clear(element);return;}
  const a=element.animate(frames,{...options,fill:'both'});live.set(element,a);
  a.onfinish=()=>{live.delete(element);element.remove();if(!disposed)after?.();};
  a.oncancel=()=>{live.delete(element);element.remove();};
 }
 function sale({id,value,source,ok=true}={}){
  if(disposed||ok===false||!id||seen.has(id)||!Number.isFinite(value)||value<=0)return false;
  seen.add(id);if(seen.size>512)seen.delete(seen.values().next().value);
  try{playSound();}catch{/* Feedback never cancels an accepted transaction. */}
  const wallet=target();if(!wallet||!doc)return true;
  const end=capture(wallet),start=source&&Number.isFinite(source.x)&&Number.isFinite(source.y)?source:capture(source),reduced=reducedMotion(),n=coinCount(value);
  // Bound rapid repeated sales, including label nodes; discarded effects never touch balances.
  while(live.size+n+1>24){const old=live.keys().next().value;if(!old)break;clear(old);}
  for(let i=0;i<n;i++){
   const element=doc.createElement('span');element.className='coin-reward-particle';element.setAttribute('aria-hidden','true');element.innerHTML=GOLD_COIN_SVG.replace('width="17" height="17"','width="28" height="28"');
   element.style.cssText='position:absolute;left:0;top:0;width:28px;height:28px;margin:-14px;z-index:80;pointer-events:none;display:grid;place-items:center;filter:drop-shadow(0 2px 3px rgba(20,20,20,.08));will-change:transform';
   const p={x:start.x+(i-(n-1)/2)*8,y:start.y-(i%3)*6};
   const frames=reduced?[{transform:`translate(${end.x}px,${end.y}px)`,opacity:.8},{transform:`translate(${end.x}px,${end.y}px)`,opacity:0}]:flightPoints(p,end).map((v,j)=>({transform:`translate(${v.x}px,${v.y}px) scale(${1-j/20})`,opacity:j===12?0:1}));
   animate(element,frames,{duration:reduced?160:560,delay:reduced?0:i*24,easing:'ease-in'},()=>{
    if(i===n-1&&!reduced){const current=target();if(current===wallet){const a=current.animate?.([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:240});if(a){const marker={remove(){}};live.set(marker,a);a.onfinish=()=>live.delete(marker);}}}
   });
  }
  const label=doc.createElement('span');label.className='coin-reward-gain';label.setAttribute('aria-hidden','true');label.textContent=`+${value}`;
  label.style.cssText='position:absolute;left:0;top:0;z-index:81;pointer-events:none;color:#76511f;background:#fff7df;border:1px solid #e8b64e;border-radius:12px;padding:3px 8px;font:700 14px system-ui;white-space:nowrap';
  const p=reduced?{x:end.x+20,y:end.y+18}:{x:start.x+12,y:start.y-36};
  animate(label,[{transform:`translate(${p.x}px,${p.y}px)`,opacity:1},{transform:`translate(${p.x}px,${p.y-(reduced?0:24)}px)`,opacity:0}],{duration:reduced?500:950,easing:'ease-out'});
  return true;
 }
 return{capture,sale,dispose(){disposed=true;for(const e of [...live.keys()])clear(e);seen.clear();}};
}
