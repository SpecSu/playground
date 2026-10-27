/** Fixed local demo recipients; display-layout changes must never rewrite historical receipts. */
export const GIFT_RECIPIENTS=Object.freeze([
 {gardenId:'demo-frog-sea',id:'demo-jiji',name:'吉吉'},
 {gardenId:'demo-kelly-music',id:'demo-kelly',name:'Kelly'},
 {gardenId:'demo-bear-moon',id:'demo-bear',name:'Bear熊'},
 {gardenId:'demo-lx-tech',id:'demo-lx',name:'LX'},
]);
export const giftRecipient=(gardenId,id)=>GIFT_RECIPIENTS.find(r=>r.gardenId===gardenId&&r.id===id);
export const GIFT_LOG_LIMIT=60;
export function validGiftLog(s,validVariety,sameVariety){
 if(!Object.hasOwn(s,'giftLog'))return true;
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=180;
 if(!Array.isArray(s.giftLog)||s.giftLog.length>GIFT_LOG_LIMIT)return false;
 const requests=new Set(),plants=new Set([...s.plants,...(s.plantBag??[])].map(p=>p.id));
 return s.giftLog.every(g=>{if(!g||typeof g!=='object'||Array.isArray(g)||!text(g.requestId)||requests.has(g.requestId)||!Number.isFinite(g.at)||g.at>s.lastSeenAt)return false;requests.add(g.requestId);
  const recipient=giftRecipient(g.gardenId,g.recipientId);if(!recipient||recipient.name!==g.recipientName||!validVariety(g.variety)||!Object.hasOwn(s.varieties,g.variety.id)||!sameVariety(s.varieties[g.variety.id],g.variety))return false;
  if(g.kind==='seed')return g.plant===null;
  const p=g.plant;if(g.kind!=='plant'||!p||!text(p.id)||plants.has(p.id)||!text(p.tileId)||p.varietyId!==g.variety.id||!Number.isFinite(p.plantedAt)||!Number.isFinite(p.readyAt)||p.readyAt<p.plantedAt||p.readyAt>g.at)return false;
  plants.add(p.id);return true;
 });
}
