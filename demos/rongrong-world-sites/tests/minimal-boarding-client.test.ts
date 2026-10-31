import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountClient,type AccountStorage,type FarmFetch} from '../src/minimal/account-client.ts';
import {handleMinimalApi,deriveAccountId} from '../server/minimal-api.ts';
import {boardingFixture,ALICE,BOB} from './helpers/boarding-fixture.ts';
const flush=async()=>{for(let i=0;i<3;i++)await new Promise<void>(r=>setImmediate(r));};
const storage=():AccountStorage=>{const map=new Map<string,string>();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>{map.delete(k);},key:i=>[...map.keys()][i]??null,get length(){return map.size;}};};
async function setup(){const f=await boardingFixture(),uid=await deriveAccountId('client-alice');await f.repo.transaction(async tx=>{const old=(await tx.get('farms',ALICE))!;old.accountId=uid;await tx.put('farms',uid,old);});const view=await f.authority.get(uid),local=storage();let subject='client-alice',lose=false,posts=0;const fetcher:FarmFetch=async(input,init)=>{const response=await handleMinimalApi(new Request(new URL(String(input),'https://farm.example'),init),{...f.options,enabled:true,repository:f.repo,subject});if(init?.method==='POST'){posts++;if(lose)throw new Error('lost after commit');}return response;};const account={uid,handle:'Alice',createdAt:view.serverTime};const create=()=>new AccountClient(account,view,fetcher,local);return {...f,uid,local,create,posts:()=>posts,setLoss:(v:boolean)=>{lose=v;},setSubject:(v:string)=>{subject=v;}};}
test('boarding request survives lost response reload and replay using the existing durable account outbox',async t=>{
 const f=await setup(),client=f.create();t.after(()=>client.dispose());const id=client.farm!.state.animals[0].id;f.setLoss(true);await assert.rejects(client.boarding({type:'invite',targetUid:BOB,animalId:id,consent:'egg-to-initiator-helper-5-coins'}),/连接/);assert.ok(client.pending);assert.equal(client.pending.route,'boarding-command');const raw=JSON.stringify(client.pending);f.setLoss(false);const reloaded=f.create();t.after(()=>reloaded.dispose());assert.equal(JSON.stringify(reloaded.pending),raw);const result=await reloaded.retry();await flush();assert.equal(result.accepted,true);assert.equal(reloaded.pending,null);assert.equal(f.local.length,0);assert.equal((await reloaded.boardings()).invitations.length,1);assert.equal(f.posts(),2);
});
test('boarding unknown outcome remains in original account after login changes',async t=>{
 const f=await setup(),client=f.create();t.after(()=>client.dispose());f.setLoss(true);await assert.rejects(client.boarding({type:'invite',targetUid:BOB,animalId:client.farm!.state.animals[0].id,consent:'egg-to-initiator-helper-5-coins'}));const pending=JSON.stringify(client.pending);f.setLoss(false);f.setSubject('different-user');await assert.rejects(client.retry(),/账号已变化/);assert.equal(JSON.stringify(client.pending),pending);assert.equal(f.local.length,1);
});
test('boarding list rejects other-participant or private pending-result fields',async t=>{
 const f=await setup(),view=await f.authority.get(f.uid),client=new AccountClient({uid:f.uid,handle:'A',createdAt:view.serverTime},view,async()=>Response.json({serverTime:view.serverTime,invitations:[{id:'secret',status:'active',pendingEgg:{},initiatorUid:BOB,recipientUid:ALICE}]}),storage());t.after(()=>client.dispose());await assert.rejects(client.boardings(),/寄养/);
});
