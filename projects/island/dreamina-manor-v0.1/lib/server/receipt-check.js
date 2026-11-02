import {economicFingerprint,requestHash} from '../game/orphan-state.js';
import {normalizeUid,GameError,publicGame} from '../game/state.js';
/** Bounded, exact-key reads only. No ensure/presence/replay/receipt or income writes. */
export async function readOperationReceipts(db,body,now=Date.now()){
 const uid=normalizeUid(body?.uid),operations=body?.operations;
 if(!Array.isArray(operations)||!operations.length||operations.length>24||new Set(operations.map(o=>o?.id)).size!==operations.length||operations.some(o=>!o||Object.keys(o).some(k=>!['id','hash'].includes(k))||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(o.id)||typeof o.hash!=='string'||! /^[a-f0-9]{64}$/.test(o.hash)))throw new GameError('BAD_RECEIPT_QUERY','请稍后再试',400);
 const rows=await db.prepare('SELECT o.op_id,o.request_hash,o.receipt_json,i.amount AS income_amount FROM manor_operations o LEFT JOIN manor_income i ON i.uid=o.uid AND i.op_id=o.op_id WHERE o.uid=? AND o.op_id IN (SELECT value FROM json_each(?))').bind(uid,JSON.stringify(operations.map(o=>o.id))).all();
 const found=new Map((rows.results??[]).map(r=>[r.op_id,r]));
 let snapshotProof=null;const row=await db.prepare('SELECT revision,state_json FROM manor_games WHERE uid=?').bind(uid).first();if(row){try{const game={...JSON.parse(row.state_json),revision:row.revision};snapshotProof={revision:row.revision,serverNow:now,assetHash:await requestHash(economicFingerprint(publicGame(game,now),now))};}catch{}}
 return {uid,snapshotProof,results:operations.map(o=>{const r=found.get(o.id);let status='unknown';if(r?.request_hash===o.hash){try{const receipt=JSON.parse(r.receipt_json);if(receipt.status==='rejected')status='rejected';else if(receipt.status==='confirmed'&&(receipt.type!=='sell'||(Number.isSafeInteger(receipt.value)&&receipt.value>0&&r.income_amount===receipt.value)))status='confirmed';}catch{}}return{id:o.id,hash:o.hash,status};})};
}
