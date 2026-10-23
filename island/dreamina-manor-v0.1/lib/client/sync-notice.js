/** Read-only health signal. Never clears, migrates or replays someone else's journal. */
export function syncNotice({uid,sessionId,entries=[],applied=[],storage,now=Date.now(),pendingSince=0,failedSince=0}){
 const confirmed=new Set(applied.filter(r=>r.status!=='rejected').map(r=>r.id)),currentKey=`manor-next:journal-v7:${uid}:${sessionId}`;
 const old=entries.some(e=>e.localDone&&e.op&&now-e.op.at>=15000);
 let orphan=false,corrupt=false;
 try{for(let i=0;i<(storage?.length??0);i++){const key=storage.key(i);if(!key?.startsWith(`manor-next:journal-v7:${uid}:`)||key===currentKey)continue;try{const data=JSON.parse(storage.getItem(key));const rows=Array.isArray(data)?data:data?.entries??[];if(rows.some(e=>!confirmed.has(e.id)))orphan=true;}catch{corrupt=true;}}}catch{corrupt=true;}
 if(old||(pendingSince>0&&now-pendingSince>=15000))return {kind:'unsaved',message:'进度还没保存，正在重试'};
 if(orphan||corrupt)return {kind:'unsaved',message:'有些进度还没保存'};
 
 return null;
}
