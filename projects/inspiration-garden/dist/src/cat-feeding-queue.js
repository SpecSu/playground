/** One pending snack per visible cat. Loading never consumes the animation's time. */
export function createCatFeedingQueue({load,clock,onReady,onStatus=()=>{}}){
 let disposed=false;const pending=new Map();
 function request(id){
  if(disposed||pending.has(id))return false;
  const token={};pending.set(id,token);onStatus(id,'loading');
  Promise.resolve(load({retry:true})).then(ok=>{
   if(disposed||pending.get(id)!==token)return;pending.delete(id);
   if(ok)onReady(id,clock());else onStatus(id,'failed');
  },()=>{if(!disposed&&pending.get(id)===token){pending.delete(id);onStatus(id,'failed');}});
  return true;
 }
 return {request,cancel(){pending.clear();},retain(ids){for(const id of pending.keys())if(!ids.has(id))pending.delete(id);},dispose(){disposed=true;pending.clear();}};
}
