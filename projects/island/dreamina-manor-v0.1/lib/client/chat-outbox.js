const MAX_QUEUE_AGE=30000,DISPLAY_HISTORY_AGE=3600000;
const valid=(entry,uid)=>entry&&typeof entry==='object'&&entry.uid===uid&&typeof entry.id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(entry.id)&&typeof entry.islandUid==='string'&&typeof entry.message==='string'&&entry.message.trim().length>0&&entry.message.length<=140&&Number.isFinite(entry.createdAt);
/** The local timestamp belongs to the stable message ID, not its cloud ACK. */
export function mergeHeadChats(messages,localMessages,islandUid){
 const combined=new Map(messages.map(m=>[m.id,m]));
 for(const m of localMessages)if(m.islandUid===islandUid)combined.set(m.id,m);
 return [...combined.values()].sort((a,b)=>a.createdAt-b.createdAt);
}
/** @param {any} options */
export function createChatOutbox({uid,storage=globalThis.localStorage,now=()=>Date.now(),newId=()=>crypto.randomUUID(),onChange=()=>{},onDrop=(..._args)=>{},onStorageError=()=>{}}={}){
 const key=`manor-next:chat-v7:${uid}`;let saved;
 try{saved=JSON.parse(storage?.getItem(key)??'null');}catch{saved=null;}
 let pending=(Array.isArray(saved)?saved:Array.isArray(saved?.pending)?saved.pending:[]).filter(e=>valid(e,uid));
 let displayed=(Array.isArray(saved)?saved:Array.isArray(saved?.displayed)?saved.displayed:pending).filter(e=>valid(e,uid));
 const persist=()=>{displayed=displayed.filter(e=>now()-e.createdAt<DISPLAY_HISTORY_AGE).slice(-200);try{storage?.setItem(key,JSON.stringify({pending,displayed}));}catch{onStorageError();}onChange();};
 return {
  enqueue(message,islandUid){const entry={id:newId(),uid,message:message.trim(),createdAt:now(),islandUid};if(!valid(entry,uid))throw new Error('写1到140个字就好');pending.push(entry);displayed.push(entry);persist();return entry;},
  next(islandUid){const keep=pending.filter(e=>e.islandUid===islandUid&&now()-e.createdAt<MAX_QUEUE_AGE),dropped=pending.length-keep.length;if(dropped){pending=keep;persist();onDrop();}return pending[0]??null;},
  acknowledge(id){if(!pending.some(e=>e.id===id))return;pending=pending.filter(e=>e.id!==id);persist();},
  reject(id){if(!pending.some(e=>e.id===id))return;pending=pending.filter(e=>e.id!==id);persist();onDrop();},
  observe(messages){const ids=new Set(messages.map(m=>m.id));if(pending.some(e=>ids.has(e.id))){pending=pending.filter(e=>!ids.has(e.id));persist();}},
  entries:()=>pending.slice(),localMessages:()=>displayed.slice(),
 };
}
