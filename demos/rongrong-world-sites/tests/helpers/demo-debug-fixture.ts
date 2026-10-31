import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleSitesMinimalRequest,type SitesMinimalEnvironment} from '../../server/sites-minimal-adapter.ts';
import type {MinimalD1Database,MinimalD1Statement} from '../../server/minimal-d1.ts';
import type {CanonicalFarm,MinimalResult,MinimalView} from '../../src/minimal/cloud-contract.ts';
import type {FarmAccount} from '../../src/minimal/account-contract.ts';
export const DEMO_ORIGIN='https://fluffy-farm-companions.tangguozhou.chatgpt.site';
export type DemoReply=MinimalResult&{account:FarmAccount;view:MinimalView;offers:{offerId:string}[]};
export function demoDebugFixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../server/minimal-schema.sql',import.meta.url),'utf8'));
 const queries:string[]=[];
 const prepare=(query:string):MinimalD1Statement=>{queries.push(query);let args:(string|number|null)[]=[];const statement:MinimalD1Statement={bind(...values){args=values;return statement;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return statement;};
 let queue=Promise.resolve();const db:MinimalD1Database={prepare,batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});queue=run.then(()=>{},()=>{});return run;}};
 const env:SitesMinimalEnvironment={DB:db,FARM_MINIMAL_ONLINE:'1',FARM_NAMED_DEMO:'1'};
 const request=(path:string,body?:unknown,subject:string|null='alice',headers:Record<string,string>={},environment=env)=>handleSitesMinimalRequest(new Request(`${DEMO_ORIGIN}/api/minimal/${path}`,{method:body===undefined?'GET':'POST',headers:{...(subject===null?{}:{'oai-authenticated-user-id':subject}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:DEMO_ORIGIN}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),environment);
 const call=async(path:string,body?:unknown,subject:string|null='alice',headers:Record<string,string>={},environment=env)=>{const response=await request(path,body,subject,headers,environment);return {status:response.status,body:await response.json() as DemoReply};};
 const start=async(name:string|null='twx',subject='alice')=>{const suffix=name===null?'':`?name=${name}`;const account=(await call('session'+suffix,undefined,subject)).body.account;const result=(await call('bootstrap'+suffix,{requestId:'new',mode:'new'},subject)).body;return {account,farm:result.farm!,suffix,subject};};
 const stored=(uid:string)=>{const row=sql.prepare("SELECT key,value FROM minimal_farms WHERE json_extract(value,'$.accountId')=?").get(uid)!;return {key:String(row.key),farm:JSON.parse(String(row.value)) as CanonicalFarm};};
 const snapshot=()=>Object.fromEntries(['minimal_farms','minimal_receipts','minimal_wishing_offers','minimal_wishing_trades','minimal_transaction_gate'].map(table=>[table,sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
 return {sql,db,env,queries,request,call,start,stored,snapshot,close:()=>sql.close()};
}
