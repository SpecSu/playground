import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import {handleSitesMinimalRequest,type SitesMinimalEnvironment} from '../server/sites-minimal-adapter.ts';
import {MinimalD1Repository,type MinimalD1Database,type MinimalD1Statement} from '../server/minimal-d1.ts';
import {connectFarmAccount,type AccountStorage} from '../src/minimal/account-client.ts';
import {signedInFarmServerResources} from '../server/signed-in-farm-resources.ts';
import {createMinimalState} from '../src/minimal/model.ts';
const origin='https://fluffy-farm-companions.tangguozhou.chatgpt.site',now=1793000000000;
function fixture(t:{after:(fn:()=>void)=>void}){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/minimal-schema.sql',import.meta.url),'utf8'));t.after(()=>sql.close());let writes=0;
 const prepare=(query:string):MinimalD1Statement=>{let args:(string|number|null)[]=[];const statement:MinimalD1Statement={bind(...values){args=values;return statement;},async first<T>(){return (sql.prepare(query).get(...args)??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args) as T[]};},async run(){writes++;return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return statement;};
 const db:MinimalD1Database={prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return {repository:new MinimalD1Repository(db),writes:()=>writes,env:{DB:db,FARM_MINIMAL_ONLINE:'1',FARM_NAMED_DEMO:'1'} satisfies SitesMinimalEnvironment};
}
const options=()=>({clock:()=>now,newId:()=>crypto.randomUUID(),fingerprint:async(v:string)=>createHash('sha256').update(v).digest('hex')});
test('authority accepts only issued formal commerce scope and can buy verified desert and glacier species',async t=>{
 const f=fixture(t),resources=signedInFarmServerResources(origin+'/api/minimal/farm','trusted-subject')!;
 const authority=new MinimalAuthority(f.repository,{...options(),animalResources:resources});
 for(const forged of [{},{scope:'signed-in-farm'},JSON.parse(JSON.stringify(resources))])assert.throws(()=>new MinimalAuthority(f.repository,{...options(),animalResources:forged as never}),/unissued/);
 await authority.bootstrap('alice',{requestId:'new',mode:'new'});await authority.command('alice',{requestId:'welcome',expectedRevision:1,command:{type:'welcome'}});await f.repository.transaction(async tx=>{const farm=(await tx.get('farms','alice'))!;farm.state.coins=120;farm.state.player={x:1,z:1};farm.state.exploredBiomes=['grassland','forest','wetland','desert','glacier'];await tx.put('farms','alice',farm);});
 for(const [theme,species] of [['desert','alpaca'],['glacier','penguin']] as const){const farm=(await authority.get('alice')).farm!;const reply=await authority.command('alice',{requestId:theme,expectedRevision:farm.revision,command:{type:'buyEgg',theme}});assert.equal(reply.accepted,true,reply.message);assert.equal(reply.farm!.state.eggs.at(-1)!.species,species);}
});
test('Sites formal capability is exact-origin and trusted-subject only, with named namespaces untouched',async t=>{
 const f=fixture(t);const call=async(path:string,subject:string|null='verified',host=origin,env=f.env)=>{const r=await handleSitesMinimalRequest(new Request(`${host}/api/minimal/${path}`,{headers:subject?{'oai-authenticated-user-id':subject}:{}}),env);return {status:r.status,body:await r.json() as {capabilities?:{animalResources?:unknown;demo?:unknown};account?:{uid:string}}};};
 assert.equal((await call('farm',null)).status,401);assert.equal(f.writes(),0);assert.equal((await call('farm','verified',origin,{...f.env,FARM_MINIMAL_ONLINE:'0'})).status,503);assert.equal(f.writes(),0);
 const formal=await call('farm');assert.equal(formal.status,200);assert.deepEqual(formal.body.capabilities?.animalResources,{scope:'signed-in-farm'});
 const named=await call('farm?name=twx');assert.equal(named.status,200);assert.equal(named.body.capabilities?.animalResources,undefined);assert.deepEqual(named.body.capabilities?.demo,{kind:'named-demo',name:'twx'});assert.notEqual(formal.body.account!.uid,named.body.account!.uid);
 assert.equal((await call('farm','verified','https://other.example')).body.capabilities?.animalResources,undefined);
});
const storage=():AccountStorage=>({getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0});
function envelope(){const uid=`uid_${'a'.repeat(64)}`;return {account:{uid,handle:'test',createdAt:now},view:{serverTime:now,dayKey:'2026-10-26',resetAt:now+86400000,farm:{accountId:uid,farmId:'farm_a',revision:1,state:createMinimalState(now),activeOfferId:null,initializedAt:now,origin:'server-created',assetProvenance:{}},ownOffer:null,usedToday:false,serviceGate:'client-migration-required'},capabilities:{importLegacy:false,animalResources:{scope:'signed-in-farm'}}};}
test('account bootstrap prepares formal models only after authenticated capability and before farm validation',async()=>{
 let calls=0;const prepare=async()=>{calls++;};const response=envelope();
 const connected=await connectFarmAccount(async()=>Response.json(response),storage(),undefined,undefined,prepare);assert.equal(connected.status,'online');assert.equal(calls,1);if(connected.status==='online')connected.client.dispose();
 for(const reply of [Response.json({code:'sign-in-required'},{status:401}),Response.json({...response,account:{uid:'forged'}}),Response.json({...response,capabilities:{...response.capabilities,demo:{kind:'named-demo',name:'twx'}}}),Response.json({...response,capabilities:{animalResources:{scope:'anything'}}})]){calls=0;const result=await connectFarmAccount(async()=>reply,storage(),undefined,undefined,prepare);assert.notEqual(result.status,'online');assert.equal(calls,0);}
 calls=0;const named=await connectFarmAccount(async()=>Response.json({...response,capabilities:{demo:{kind:'named-demo',name:'twx'}}}),storage(),'twx',async()=>{},prepare);assert.equal(named.status,'online');assert.equal(calls,0);if(named.status==='online')named.client.dispose();
 const missing=await connectFarmAccount(async()=>Response.json(response),storage());assert.equal(missing.status,'unavailable','resource-enabled farms must not open before their validator is installed');
 calls=0;const malformed=await connectFarmAccount(async()=>Response.json({...response,view:{...response.view,farm:{...response.view.farm,state:{version:999}}}}),storage(),undefined,undefined,prepare);assert.equal(malformed.status,'unavailable');assert.equal(calls,1,'preparation precedes model-dependent farm validation');
 const failed=await connectFarmAccount(async()=>Response.json(response),storage(),undefined,undefined,async()=>{throw new Error('bad model bytes');});assert.equal(failed.status,'unavailable');
});
