/** Bounded in-session image cache. Keys identify presentation, not inventory identity. */
export const THUMBNAIL_REVISION='display-v19';
export function thumbnailKey(item,{fit=false}={}){return JSON.stringify([THUMBNAIL_REVISION,item.kind,item.speciesId,item.standardSize??null,item.finalSize,item.mutation??'normal',fit?'fill':'relative']);}
export function createThumbnailCache(limit=192){const ready=new Map(),pending=new Map();let generated=0,hits=0,failed=0;return{
 peek(key){const value=ready.get(key);if(value){ready.delete(key);ready.set(key,value);}return value;},
 load(key,generate){if(ready.has(key)){hits++;return Promise.resolve(this.peek(key));}if(pending.has(key)){hits++;return pending.get(key);}const task=Promise.resolve().then(()=>{generated++;return generate();}).then(value=>{ready.set(key,value);while(ready.size>limit)ready.delete(ready.keys().next().value);pending.delete(key);return value;},error=>{failed++;pending.delete(key);throw error;});pending.set(key,task);return task;},
 stats(){return{generated,hits,failed,ready:ready.size,pending:pending.size};}
};}
export const thumbnailCache=createThumbnailCache();
export const peekItemThumbnail=(item,options={})=>thumbnailCache.peek(thumbnailKey(item,options));
