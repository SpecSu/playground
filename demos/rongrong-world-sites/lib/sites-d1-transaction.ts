/** All V8 state writes go through one optimistic commit gate.
 *
 * D1 batch() is a transaction. The gate CAS is its first statement; every later
 * UPSERT is conditional on this attempt's unguessable token. A failed CAS is a
 * complete no-op. A SQL failure rolls back the gate AND every dependent write.
 * Reading the gate before any inputs prevents mixed/stale reads from committing.
 * This deliberately favors correctness over high-volume multi-room throughput.
 */
type SqlValue=string|number|null;
type Connection=Pick<D1Database,'prepare'|'batch'>;
export class D1Transaction {
 readonly connection:Connection;
 readonly token:string;
 readonly writes:D1PreparedStatement[]=[];
 constructor(connection:Connection,token:string){this.connection=connection;this.token=token;}
 first<T>(sql:string,...values:SqlValue[]){return this.connection.prepare(sql).bind(...values).first<T>();}
 put(table:string,keys:Record<string,SqlValue>,values:Record<string,SqlValue>){
  // Identifiers are fixed internal literals, never request data.
  const record={...keys,...values},columns=Object.keys(record),keyNames=Object.keys(keys);
  if(![table,...columns].every(name=>/^[a-z_]+$/.test(name)))throw new Error('Invalid internal SQL identifier');
  const assignments=Object.keys(values).map(name=>`${name}=excluded.${name}`).join(',');
  const sql=`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS(SELECT 1 FROM site_transactions WHERE id='v8' AND token=?) ON CONFLICT(${keyNames.join(',')}) DO ${assignments?`UPDATE SET ${assignments}`:'NOTHING'}`;
  this.writes.push(this.connection.prepare(sql).bind(...Object.values(record),this.token));
 }
}
export async function d1Transaction<T>(database:D1Database,work:(tx:D1Transaction)=>Promise<T>):Promise<T>{
 // A first-primary session also preserves read-your-writes if D1 read replication
 // is enabled. It is not an authentication or user-controlled session.
 const db:Connection=database.withSession?database.withSession('first-primary'):database;
 for(let attempt=0;attempt<12;attempt++){
  let gate=await db.prepare("SELECT revision FROM site_transactions WHERE id='v8'").first<{revision:number}>();
  if(!gate){await db.prepare("INSERT OR IGNORE INTO site_transactions(id,revision,token) VALUES('v8',0,'')").run();gate=await db.prepare("SELECT revision FROM site_transactions WHERE id='v8'").first<{revision:number}>();}
  if(!gate)throw new Error('D1 transaction gate unavailable');
  const tx=new D1Transaction(db,crypto.randomUUID()),result=await work(tx);
  if(!tx.writes.length){
   const latest=await db.prepare("SELECT revision FROM site_transactions WHERE id='v8'").first<{revision:number}>();
   if(latest?.revision===gate.revision)return result;
  }else{
   const committed=await db.batch([db.prepare("UPDATE site_transactions SET revision=revision+1, token=? WHERE id='v8' AND revision=?").bind(tx.token,gate.revision),...tx.writes]);
   if(committed[0].meta.changes===1)return result;
  }
  await new Promise(resolve=>setTimeout(resolve,Math.min(32,2*(attempt+1))+Math.floor(Math.random()*5)));
 }
 throw new Error('D1 is busy; retry the same command ID');
}
export function commandFingerprint(command:object){return JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b))));}
