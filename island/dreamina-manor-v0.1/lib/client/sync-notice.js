/** Read-only health signal. Never clears, migrates or replays someone else's journal. */
export function syncNotice({uid,sessionId,entries=[],applied=[],storage,now=Date.now(),pendingSince=0,failedSince=0,quietSource=(_key,_raw)=>false}){
 const currentKey=`manor-next:journal-v7:${uid}:${sessionId}`;
 const old=entries.some(e=>e.localDone&&e.op&&now-e.op.at>=15000);
 let orphan=false,corrupt=false;
 try{for(let i=0;i<(storage?.length??0);i++){const key=storage.key(i);if(!key?.startsWith(`manor-next:journal-v7:${uid}:`)||key===currentKey)continue;try{const raw=storage.getItem(key);if(quietSource(key,raw))continue;const data=JSON.parse(raw);const rows=Array.isArray(data)?data:data?.entries;if(!Array.isArray(rows))throw new Error('Unknown journal');if(rows.length)orphan=true;}catch{corrupt=true;}}}catch{corrupt=true;}
 if(old||(pendingSince>0&&now-pendingSince>=15000))return {kind:'unsaved',message:'同步中',actionRequired:(pendingSince>0&&now-pendingSince>=120000)||entries.some(e=>e.localDone&&e.op&&now-e.op.at>=120000)};
 if(orphan||corrupt)return {kind:'unsaved',message:'暂未保存',actionRequired:true};
 
 return null;
}
