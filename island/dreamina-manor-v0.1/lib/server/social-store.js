import {GameStore} from './store.js';
import {projectedPosition,GameError} from '../game/state.js';

/** All effects below share the D1 batch transaction and a private mutation token.
 * UID is a deliberately simple demo identity, never an authentication claim. */
export class SocialStore extends GameStore {
 async visit(sessionId,uid,islandUid,now,cachedIsland=null){
  const island=cachedIsland??await this.read(islandUid);if(!island)throw new GameError('NO_ISLAND','还没找到这个庄园',404);
  const old=await this.readVisit(sessionId);if(old&&old.uid!==uid)throw new GameError('SESSION_CHANGED','重新打开页面再试试');
  if(old?.islandUid===islandUid&&now-old.updatedAt<5000){const self=islandUid===uid?island:await this.read(uid);return {...old.state,position:visitPosition(old,self,now),revision:old.revision,islandUid:old.islandUid};}
  const free=island.land.find(c=>!island.tank.some(t=>t.x===c.x&&t.z===c.z))??island.land[0];
  const initial={position:islandUid===uid?projectedPosition(island,now):{x:free.x,z:free.z+.45},pending:null};
  // A heartbeat never reserializes state read earlier: that could erase an arriving command.
  await this.db.prepare('INSERT INTO manor_visits(session_id,uid,island_uid,revision,state_json,updated_at) VALUES (?,?,?,0,?,?) ON CONFLICT(session_id) DO UPDATE SET island_uid=excluded.island_uid,state_json=CASE WHEN manor_visits.island_uid<>excluded.island_uid THEN excluded.state_json ELSE manor_visits.state_json END,revision=CASE WHEN manor_visits.island_uid<>excluded.island_uid THEN manor_visits.revision+1 ELSE manor_visits.revision END,updated_at=excluded.updated_at WHERE manor_visits.island_uid<>excluded.island_uid OR manor_visits.updated_at<=excluded.updated_at-5000').bind(sessionId,uid,islandUid,JSON.stringify(initial),now).run();
  const visit=await this.readVisit(sessionId),self=islandUid===uid?island:await this.read(uid);return {...visit.state,position:visitPosition(visit,self,now),revision:visit.revision,islandUid:visit.islandUid};
 }
 async presence(islandUid,now){const r=await this.db.prepare('SELECT v.*,g.state_json AS game_json FROM manor_visits v JOIN manor_games g ON g.uid=v.uid WHERE v.island_uid=? AND v.updated_at>? ORDER BY v.updated_at DESC').bind(islandUid,now-15000).all();const seen=new Set();return(r.results??[]).filter(x=>!seen.has(x.uid)&&seen.add(x.uid)).map(x=>{const game=JSON.parse(x.game_json),visit={islandUid:x.island_uid,state:JSON.parse(x.state_json)};return {uid:x.uid,profile:game.profile,position:visitPosition(visit,game,now),pending:visit.state.pending??(islandUid===game.ownerUid?game.pending:null),heldItem:game.items.find(i=>i.location.kind==='hand')??null,updatedAt:x.updated_at};});}
 async readVisit(sessionId){const r=await this.db.prepare('SELECT * FROM manor_visits WHERE session_id=?').bind(sessionId).first();return r?{sessionId:r.session_id,uid:r.uid,islandUid:r.island_uid,revision:r.revision,state:JSON.parse(r.state_json),updatedAt:r.updated_at}:null;}
 async activePerson(uid,islandUid,now){const r=await this.db.prepare('SELECT * FROM manor_visits WHERE uid=? AND island_uid=? AND updated_at>? ORDER BY updated_at DESC LIMIT 1').bind(uid,islandUid,now-15000).first();return r?{sessionId:r.session_id,uid:r.uid,islandUid:r.island_uid,revision:r.revision,state:JSON.parse(r.state_json),updatedAt:r.updated_at}:null;}
 async commitVisit(game,visit,nextVisit,opId,hash,receipt,now,nextGame=null){
  const token=crypto.randomUUID(),next=nextGame??{...game,revision:game.revision+1,updatedAt:now};
  const results=await this.db.batch([
   this.db.prepare('UPDATE manor_games SET revision=?,state_json=?,mutation_id=?,updated_at=? WHERE uid=? AND revision=? AND EXISTS(SELECT 1 FROM manor_visits WHERE session_id=? AND uid=? AND island_uid=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM manor_operations WHERE uid=? AND op_id=?)').bind(next.revision,JSON.stringify(next),token,now,game.ownerUid,game.revision,visit.sessionId,game.ownerUid,visit.islandUid,visit.revision,game.ownerUid,opId),
   this.db.prepare('UPDATE manor_visits SET state_json=?,revision=revision+1,updated_at=? WHERE session_id=? AND EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(JSON.stringify(nextVisit),now,visit.sessionId,game.ownerUid,token),
   this.db.prepare('INSERT INTO manor_operations(uid,op_id,request_hash,receipt_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(game.ownerUid,opId,hash,JSON.stringify(receipt),now,game.ownerUid,token),
  ]);return results.every(r=>r.meta.changes===1);
 }
 async commitTransfer(actor,other,nextActor,nextOther,visit,nextVisit,opId,hash,receipt,now,targetPresence=null){
  const token=crypto.randomUUID();
  const targetClause=targetPresence?' AND EXISTS(SELECT 1 FROM manor_visits WHERE session_id=? AND uid=? AND island_uid=? AND revision=? AND updated_at>?)':'';
  const args=[nextActor.revision,JSON.stringify(nextActor),token,now,actor.ownerUid,actor.revision,other.ownerUid,other.revision,visit.sessionId,actor.ownerUid,visit.islandUid,visit.revision,now-15000,actor.ownerUid,opId];
  if(targetPresence)args.push(targetPresence.sessionId,other.ownerUid,visit.islandUid,targetPresence.revision,now-15000);
  const results=await this.db.batch([
   this.db.prepare('UPDATE manor_games SET revision=?,state_json=?,mutation_id=?,updated_at=? WHERE uid=? AND revision=? AND EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND revision=?) AND EXISTS(SELECT 1 FROM manor_visits WHERE session_id=? AND uid=? AND island_uid=? AND revision=? AND updated_at>?) AND NOT EXISTS(SELECT 1 FROM manor_operations WHERE uid=? AND op_id=?)'+targetClause).bind(...args),
   this.db.prepare('UPDATE manor_games SET revision=?,state_json=?,mutation_id=?,updated_at=? WHERE uid=? AND EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(nextOther.revision,JSON.stringify(nextOther),token,now,other.ownerUid,actor.ownerUid,token),
   this.db.prepare('UPDATE manor_visits SET state_json=?,revision=revision+1,updated_at=? WHERE session_id=? AND EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(JSON.stringify(nextVisit),now,visit.sessionId,actor.ownerUid,token),
   this.db.prepare('INSERT INTO manor_operations(uid,op_id,request_hash,receipt_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?) AND EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(actor.ownerUid,opId,hash,JSON.stringify(receipt),now,actor.ownerUid,token,other.ownerUid,token),
  ]);return results.every(r=>r.meta.changes===1);
 }
 async commitChat(game,visit,message,opId,hash,receipt,now){
  const token=crypto.randomUUID(),next={...game,revision:game.revision+1,updatedAt:now};
  const results=await this.db.batch([
   this.db.prepare('UPDATE manor_games SET revision=?,state_json=?,mutation_id=?,updated_at=? WHERE uid=? AND revision=? AND EXISTS(SELECT 1 FROM manor_visits WHERE session_id=? AND uid=? AND island_uid=? AND updated_at>?) AND NOT EXISTS(SELECT 1 FROM manor_operations WHERE uid=? AND op_id=?) AND NOT EXISTS(SELECT 1 FROM manor_messages WHERE uid=? AND created_at>?)').bind(next.revision,JSON.stringify(next),token,now,game.ownerUid,game.revision,visit.sessionId,game.ownerUid,visit.islandUid,now-15000,game.ownerUid,opId,game.ownerUid,now-800),
   this.db.prepare('INSERT INTO manor_messages(id,island_uid,uid,name,message,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(receipt.messageId,visit.islandUid,game.ownerUid,game.profile.name,message,now,game.ownerUid,token),
   this.db.prepare('INSERT INTO manor_operations(uid,op_id,request_hash,receipt_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(game.ownerUid,opId,hash,JSON.stringify(receipt),now,game.ownerUid,token),
  ]);return results.every(r=>r.meta.changes===1);
 }
 async messages(islandUid,now){const r=await this.db.prepare('SELECT id,uid,name,message,created_at AS createdAt FROM manor_messages WHERE island_uid=? AND created_at>? ORDER BY created_at DESC LIMIT 30').bind(islandUid,now-3600000).all();return (r.results??[]).reverse();}
 async lastMessage(uid){return this.db.prepare('SELECT created_at AS createdAt FROM manor_messages WHERE uid=? ORDER BY created_at DESC LIMIT 1').bind(uid).first();}
}
export function visitPosition(visit,game,now){return visit.state.pending?projectedPosition(visit.state,now):visit.islandUid===game.ownerUid?projectedPosition(game,now):{...visit.state.position};}
