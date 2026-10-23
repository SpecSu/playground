import {recordDiscovery,collectionVariants} from '../game/collection.js';
import {GameError,assertGame,projectedPosition} from '../game/state.js';
import {planWalk,pathDistance} from '../game/grid.js';
import {ECONOMY} from '../game/economy.js';
import {visitPosition} from './social-store.js';
import {avatarLabel} from '../avatars/avatar-cast.js';
const fail=(code,text,status=409)=>{throw new GameError(code,text,status);};
const close=(a,b,d=.78)=>Math.hypot(a.x-b.x,a.z-b.z)<=d;
const active=(v,uid,now)=>v&&v.uid===uid&&v.updatedAt>now-15000;
function touch(s,now){s.revision++;s.updatedAt=now;return s;}
function record(s,entry){s.activity=[{...entry,id:crypto.randomUUID()},...s.activity].slice(0,40);}
function assertVisit(v,uid,now){if(!active(v,uid,now))fail('VISIT_EXPIRED','重新进入这个庄园再试试');}
export async function prepareSocial(store,game,visit,command,now){
 assertVisit(visit,game.ownerUid,now);if(game.pending)fail('WORK_PENDING','先完成手边的事，或点取消');
 const island=await store.read(visit.islandUid);if(!island)fail('NO_ISLAND','这个庄园暂时找不到');
 const from=visitPosition(visit,game,now);let target,otherUid,jobId,itemId,targetSession;
 if(command.action==='steal'){
  if(visit.islandUid===game.ownerUid)fail('OWN_ISLAND','这是自己的收获');
  if(now<game.theftAvailableAt)fail('THEFT_WAIT',`还要等${Math.ceil((game.theftAvailableAt-now)/3600000)}小时才能再摘`);
  const job=island.jobs.find(j=>j.id===command.jobId);if(!job)fail('TARGET_GONE','已经被收走了');if(now<job.readyAt)fail('NOT_READY','还要长一会儿');
  target={...job.target};jobId=job.id;otherUid=island.ownerUid;
 }else if(command.action==='gift'){
  otherUid=command.targetUid;if(otherUid===game.ownerUid)fail('OWN_GIFT','选一位朋友吧');
  const item=game.items.find(i=>i.id===command.itemId&&i.location.kind==='bag');if(!item)fail('ITEM_GONE','先把它收进背包吧');itemId=item.id;
  const person=await store.activePerson(otherUid,visit.islandUid,now);if(!person)fail('PERSON_LEFT','对方已经离开了，等见面再送吧');
  const other=await store.read(otherUid),pos=visitPosition(person,other,now);target={kind:island.docks.some(c=>c.x===Math.round(pos.x)&&c.z===Math.round(pos.z))?'dock':'land',cell:{x:Math.round(pos.x),z:Math.round(pos.z)}};targetSession=person.sessionId;
 }else fail('BAD_ACTION','换个操作试试',400);
 const path=planWalk(island.land,island.docks,island.tank,from,{type:target.kind==='dock'?'dock':'land',cell:target.cell},island);if(!path)fail('NO_PATH','现在走不到那里');
 const arriveAt=now+Math.ceil(pathDistance(path)*ECONOMY.walkSecondsPerCell*1000);
 return {position:from,pending:{id:crypto.randomUUID(),action:command.action,otherUid,target,jobId,itemId,targetSession,islandUid:visit.islandUid,path,startedAt:now,arriveAt,finishAt:arriveAt+650}};
}
export async function finishSocial(store,actor,visit,intentId,now){
 assertVisit(visit,actor.ownerUid,now);const pending=visit.state.pending;
 if(!pending||pending.id!==intentId||pending.islandUid!==visit.islandUid)fail('STALE_ACTION','这次操作已经结束了');if(now<pending.finishAt)fail('STILL_APPROACHING','还没到，再等一下');
 const other=await store.read(pending.otherUid);if(!other)fail('PERSON_LEFT','对方已经离开了');
 const a=structuredClone(actor),b=structuredClone(other),position=projectedPosition(visit.state,now);a.discoveredVariants=collectionVariants(a);b.discoveredVariants=collectionVariants(b);let targetPresence=null,item;
 if(pending.action==='steal'){
  if(visit.islandUid!==other.ownerUid||other.ownerUid===actor.ownerUid)fail('WRONG_ISLAND','到对方庄园里再摘吧');
  if(now<actor.theftAvailableAt)fail('THEFT_WAIT',`还要等${Math.ceil((actor.theftAvailableAt-now)/3600000)}小时才能再摘`);
  const job=b.jobs.find(j=>j.id===pending.jobId);if(!job||now<job.readyAt)fail('TARGET_GONE','已经被收走了');if(!close(position,job.target.cell))fail('TOO_FAR','走近一点再试试');
  item={...job.product,harvestedAt:now,location:{kind:'bag'}};b.jobs=b.jobs.filter(j=>j.id!==job.id);a.items.push(item);a.theftAvailableAt=now+ECONOMY.theftCooldownMs;recordDiscovery(a,item);
  record(b,{kind:'stolen',at:now,byUid:a.ownerUid,byName:a.profile.name||avatarLabel(a.profile.avatar),speciesId:item.speciesId,itemId:item.id});
 }else if(pending.action==='gift'){
  targetPresence=await store.activePerson(other.ownerUid,visit.islandUid,now);
  if(!targetPresence||targetPresence.sessionId!==pending.targetSession)fail('PERSON_LEFT','对方已经离开了，等见面再送吧');
  if(!close(position,visitPosition(targetPresence,other,now),1.05))fail('PERSON_MOVED','对方走远了，靠近再送吧');
  item=a.items.find(i=>i.id===pending.itemId&&i.location.kind==='bag');if(!item)fail('ITEM_GONE','这件东西已经挪走了');
  if(b.items.some(i=>i.id===item.id)||b.jobs.some(j=>j.product.id===item.id))throw new Error('Duplicate transfer ID');
  a.items=a.items.filter(i=>i.id!==item.id);b.items.push({...item,location:{kind:'bag'}});recordDiscovery(b,item);
  record(b,{kind:'gift',at:now,byUid:a.ownerUid,byName:a.profile.name||avatarLabel(a.profile.avatar),speciesId:item.speciesId,itemId:item.id});
 }else fail('BAD_ACTION','这次操作不能继续');
 if(visit.islandUid===a.ownerUid)a.position=position;
 touch(a,now);touch(b,now);assertGame(a);assertGame(b);
 return {other,nextActor:a,nextOther:b,nextVisit:{position,pending:null},targetPresence,receipt:{type:'finish-social',action:pending.action,itemId:item.id,targetUid:other.ownerUid}};
}
