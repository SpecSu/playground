import {minimalRepositoryNamespace} from './minimal-namespace.ts';
import type {MinimalRepository,MinimalRows,MinimalTable,MinimalTransaction,WishingOffer} from '../src/minimal/cloud-contract.ts';
export type MinimalD1Value=string|number|null;
export interface MinimalD1Statement{
 bind(...values:MinimalD1Value[]):MinimalD1Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<{meta:{changes:number}}>;
}
export interface MinimalD1Database{
 prepare(sql:string):MinimalD1Statement;
 batch(statements:MinimalD1Statement[]):Promise<{meta:{changes:number}}[]>;
 withSession?(constraint:'first-primary'):MinimalD1Database;
}
const TABLES:Record<MinimalTable,string>={boardings:'minimal_boardings',profiles:'minimal_profiles',farms:'minimal_farms',receipts:'minimal_receipts',imports:'minimal_imports',importSources:'minimal_import_sources',offers:'minimal_wishing_offers',daily:'minimal_wishing_daily',trades:'minimal_wishing_trades'};
const tableName=(table:MinimalTable)=>{if(!Object.hasOwn(TABLES,table))throw new Error('Invalid minimal table');return TABLES[table];};

/** A global compare-and-swap gate covers ALL minimal authority rows. The callback
 * can retry and must perform no external side effect. D1 batch is atomic: a losing
 * CAS makes every staged write a no-op; a SQL error rolls the entire batch back.
 * The overlay provides read-your-writes and never leaks mutable row references.
 * Run the additive schema migration separately; missing schema fails closed. */
export class MinimalD1Repository implements MinimalRepository{
 private database:MinimalD1Database;
 private namespace:ReturnType<typeof minimalRepositoryNamespace>;
 constructor(database:MinimalD1Database,namespace?:string){this.database=database;this.namespace=minimalRepositoryNamespace(namespace);}
 async transaction<T>(work:(tx:MinimalTransaction)=>Promise<T>):Promise<T>{
  const db=this.database.withSession?.('first-primary')??this.database;
  // Data initialization is deliberately outside schema migrations. Atomic conflict
  // handling creates the one gate once and never resets an existing revision/token.
  // No request performs CREATE/ALTER; a missing table still fails closed.
  await db.prepare("INSERT INTO minimal_transaction_gate(id,revision,token) VALUES('v1',0,'') ON CONFLICT(id) DO NOTHING").run();
  for(let attempt=0;attempt<12;attempt++){
   const gate=await db.prepare("SELECT revision FROM minimal_transaction_gate WHERE id='v1'").first<{revision:number}>();
   if(!gate)throw new Error('Minimal database migration required');
   const writes=new Map<string,{table:MinimalTable;key:string;value:string}>();let active=true;
   const check=()=>{if(!active)throw new Error('Minimal transaction is closed');};
   const tx:MinimalTransaction={
    get:async<K extends MinimalTable>(table:K,key:string):Promise<MinimalRows[K]|null>=>{check();key=this.namespace.key(key);const name=tableName(table),staged=writes.get(JSON.stringify([table,key]));if(staged)return JSON.parse(staged.value) as MinimalRows[K];const row=await db.prepare(`SELECT value FROM ${name} WHERE key=?`).bind(key).first<{value:string}>();check();return row?JSON.parse(row.value) as MinimalRows[K]:null;},
    put:async(table,key,value)=>{check();key=this.namespace.key(key);tableName(table);writes.set(JSON.stringify([table,key]),{table,key,value:JSON.stringify(value)});},
    listOpenOffers:async(now,after,limit)=>{
     check();const rows=(await db.prepare(`SELECT key,value FROM minimal_wishing_offers WHERE ${this.namespace.offerPredicate} AND json_extract(value,'$.status')='open' AND json_extract(value,'$.expiresAt')>? AND (? IS NULL OR json_extract(value,'$.offerId')>?) ORDER BY json_extract(value,'$.offerId') COLLATE BINARY LIMIT ?`).bind(...this.namespace.offerArgs,now,after,after,limit+writes.size).all<{key:string;value:string}>()).results;check();
     const all=new Map(rows.map(row=>[row.key,JSON.parse(row.value) as WishingOffer]));for(const write of writes.values())if(write.table==='offers')all.set(write.key,JSON.parse(write.value) as WishingOffer);
     return [...all.values()].filter(row=>row.status==='open'&&row.expiresAt>now&&(after===null||row.offerId>after)).sort((a,b)=>a.offerId<b.offerId?-1:a.offerId>b.offerId?1:0).slice(0,limit);
    },
   };
   let result:T;try{result=await work(tx);}finally{active=false;}
   if(!writes.size){const latest=await db.prepare("SELECT revision FROM minimal_transaction_gate WHERE id='v1'").first<{revision:number}>();if(latest?.revision===gate.revision)return result;}
   else{
    const token=crypto.randomUUID(),statements=[db.prepare("UPDATE minimal_transaction_gate SET revision=revision+1,token=? WHERE id='v1' AND revision=?").bind(token,gate.revision)];
    for(const write of writes.values())statements.push(db.prepare(`INSERT INTO ${tableName(write.table)}(key,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM minimal_transaction_gate WHERE id='v1' AND token=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(write.key,write.value,token));
    const committed=await db.batch(statements);if(committed[0]?.meta.changes===1)return result;
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(25,2*(attempt+1))));
  }
  throw new Error('Minimal database is busy; retry the same request ID');
 }
}
