import{normalizeUid}from'../game/state.js';
/** Exact own relationship list. Never ensures accounts or touches presence. */
export async function readFriends(db,uid,now=Date.now()){
 uid=normalizeUid(uid);const rows=await db.prepare('SELECT f.friend_uid,g.state_json,EXISTS(SELECT 1 FROM manor_visits v WHERE v.uid=f.friend_uid AND v.updated_at>?) AS online FROM manor_friendships f LEFT JOIN manor_games g ON g.uid=f.friend_uid WHERE f.owner_uid=? ORDER BY f.friend_uid').bind(now-15000,uid).all();
 return(rows.results??[]).map(r=>{if(!r.state_json)return{uid:r.friend_uid,registered:false,online:false};const g=JSON.parse(r.state_json);return{uid:r.friend_uid,registered:true,profile:g.profile,online:!!r.online};});
}
