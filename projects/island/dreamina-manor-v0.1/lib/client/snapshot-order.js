/** Asset and visitor revisions are independent; both must be monotonic. */
export function createSnapshotReconciler(){
 const owners=new Map(),visits=new Map();
 return{accept(data){
  const merge=game=>{if(!game)return game;const old=owners.get(game.ownerUid);if(old&&old.revision>game.revision)return old;owners.set(game.ownerUid,game);return game;};
  let visit=data.visit;
  if(visit&&data.game?.ownerUid&&data.island?.ownerUid){
   const key=`${data.game.ownerUid}:${data.island.ownerUid}`;
   const version=Number.isFinite(visit.revision)?visit.revision:data.game.revision;
   const old=visits.get(key),stamp=data.serverNow??0;
   if(old&&(old.version>version||old.version===version&&old.stamp>stamp))visit=old.visit;
   else visits.set(key,{version,stamp,visit});
  }
  return {...data,game:merge(data.game),island:merge(data.island),visit};
 }};
}
