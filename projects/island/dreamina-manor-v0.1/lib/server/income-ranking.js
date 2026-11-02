import{normalizeUid}from'../game/state.js';
const DAY=86400000,BEIJING=8*3600000;
export function incomePeriodStart(now,period='day'){const local=new Date(now+BEIJING),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-BEIJING;return period==='week'?day-((local.getUTCDay()+6)%7)*DAY:day;}
/** Read only: no inferred historical earnings, no global player enumeration. */
export async function readIncomeRanking(db,uid,period='day',now=Date.now()){
 uid=normalizeUid(uid);period=period==='week'?'week':'day';const metadata=await db.prepare("SELECT value FROM manor_income_metadata WHERE key='started_at'").bind().first(),trackingStartedAt=metadata?.value??now,periodStart=incomePeriodStart(now,period),since=Math.max(trackingStartedAt,periodStart);
 const r=await db.prepare(`WITH permitted(uid) AS (SELECT ? UNION SELECT friend_uid FROM manor_friendships WHERE owner_uid=?) SELECT p.uid,g.state_json,COALESCE((SELECT SUM(i.amount) FROM manor_income i WHERE i.uid=p.uid AND i.earned_at>=? AND i.earned_at<=?),0) AS income FROM permitted p LEFT JOIN manor_games g ON g.uid=p.uid ORDER BY income DESC,p.uid`).bind(uid,uid,since,now).all();
 let rank=0,last=null;const rows=(r.results??[]).map((r,index)=>{const game=r.state_json?JSON.parse(r.state_json):null;if(last!==r.income)rank=index+1;last=r.income;return{uid:r.uid,rank,income:r.income,registered:!!game,profile:game?.profile??null,self:r.uid===uid};});return{period,periodStart,trackingStartedAt,serverNow:now,rows};
}
