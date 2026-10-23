import {isDemoUid} from '../game/demo-catalogue.js';
import {createDemoGame} from './demo-games.js';
import {createGame,GameError} from '../game/state.js';
/** Same UID is deliberately a demo identity, not a credential or secure account. */
export class GameStore{
 constructor(db){this.db=db;}
 async ensure(uid,now){const existing=await this.read(uid);if(existing)return existing;await this.db.prepare('INSERT INTO manor_games(uid,revision,state_json,mutation_id,updated_at) VALUES (?,0,?,?,?) ON CONFLICT(uid) DO NOTHING').bind(uid,JSON.stringify(isDemoUid(uid)?createDemoGame(uid,now):createGame(uid,now)),'',now).run();return this.read(uid);}
 async read(uid){const row=await this.db.prepare('SELECT revision,state_json FROM manor_games WHERE uid=?').bind(uid).first();return row?{...JSON.parse(row.state_json),revision:row.revision}:null;}
 async receipt(uid,opId){const r=await this.db.prepare('SELECT request_hash,receipt_json FROM manor_operations WHERE uid=? AND op_id=?').bind(uid,opId).first();return r?{hash:r.request_hash,receipt:JSON.parse(r.receipt_json)}:null;}
 async commit(uid,expected,next,opId,hash,receipt,now){
  const mutation=crypto.randomUUID();const results=await this.db.batch([
   this.db.prepare('UPDATE manor_games SET revision=?,state_json=?,mutation_id=?,updated_at=? WHERE uid=? AND revision=? AND NOT EXISTS(SELECT 1 FROM manor_operations WHERE uid=? AND op_id=?)').bind(next.revision,JSON.stringify(next),mutation,now,uid,expected,uid,opId),
   this.db.prepare('INSERT INTO manor_operations(uid,op_id,request_hash,receipt_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM manor_games WHERE uid=? AND mutation_id=?)').bind(uid,opId,hash,JSON.stringify(receipt),now,uid,mutation),
  ]);return results[0].meta.changes===1&&results[1].meta.changes===1;
 }
 async visit(sessionId,uid,islandUid,now){
  const game=await this.read(islandUid);if(!game)throw new GameError('NO_ISLAND','还没找到这个庄园',404);
  const current=await this.db.prepare('SELECT uid,island_uid,state_json FROM manor_visits WHERE session_id=?').bind(sessionId).first();
  if(current&&current.uid!==uid)throw new GameError('SESSION_CHANGED','重新打开页面再试试',409);
  const changed=!current||current.island_uid!==islandUid;
  const state=changed?{position:{x:0,z:-.5},pending:null}:JSON.parse(current.state_json);
  await this.db.prepare('INSERT INTO manor_visits(session_id,uid,island_uid,revision,state_json,updated_at) VALUES (?,?,?,0,?,?) ON CONFLICT(session_id) DO UPDATE SET island_uid=excluded.island_uid,state_json=excluded.state_json,revision=manor_visits.revision+1,updated_at=excluded.updated_at').bind(sessionId,uid,islandUid,JSON.stringify(state),now).run();return state;
 }
 async presence(islandUid,now){const r=await this.db.prepare('SELECT v.uid,v.session_id,v.state_json,g.state_json AS game_json,v.updated_at FROM manor_visits v JOIN manor_games g ON g.uid=v.uid WHERE v.island_uid=? AND v.updated_at>? ORDER BY v.updated_at DESC').bind(islandUid,now-30000).all();const seen=new Set();return(r.results??[]).filter(x=>!seen.has(x.uid)&&seen.add(x.uid)).map(x=>{const s=JSON.parse(x.game_json),v=JSON.parse(x.state_json);return {uid:x.uid,profile:s.profile,position:v.position,updatedAt:x.updated_at};});}
}
