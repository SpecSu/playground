// Navigation intent only: never a second inventory or acknowledgement source.
export function createBagArrival(){
 const seen=new Set(),pending=new Map();let consumedAt=-Infinity,order=0;
 function note(id,category,at){if(!id||seen.has(id)||!['seed','bait','harvest'].includes(category))return;seen.add(id);if(seen.size>512)seen.delete(seen.values().next().value);const time=Number.isFinite(at)?at:Date.now();if(time<consumedAt)return;pending.set(id,{category,at:time,order:order++});}
 function complete(entry,{confirmed=false}={}){const c=entry?.command;if(!c)return;const at=entry.op?.at??entry.local?.pending?.finishAt??entry.at;if(c.type==='buy-input')note(entry.id,c.kind,at);else if(c.type==='harvest-batch'||c.action==='harvest'||c.action==='retrieve'||(confirmed&&c.action==='steal'))note(entry.id,'harvest',at);}
 return{note,complete,reject(id){pending.delete(id);},consume(hasDock=true){const last=[...pending.values()].sort((a,b)=>a.at-b.at||a.order-b.order).at(-1);if(!last)return null;consumedAt=Math.max(consumedAt,last.at);pending.clear();return last.category==='bait'&&!hasDock?'seed':last.category;}};
}
