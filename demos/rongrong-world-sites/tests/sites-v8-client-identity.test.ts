import test from 'node:test';
import assert from 'node:assert/strict';
test('identity handshake retries the exact JSON command once, without minting another command ID',async()=>{
 const {sitesPost}=await import('../src/sites-http.ts');const old=globalThis.fetch,calls:RequestInit[]=[];
 globalThis.fetch=(async(_input,init)=>{calls.push(init!);return calls.length===1?Response.json({code:'identity_required',retryable:true},{status:428}):Response.json({accepted:true});}) as typeof fetch;
 try{const request={method:'POST',body:JSON.stringify({id:'same-command',type:'create'}),headers:{'Content-Type':'application/json'}};const r=await sitesPost('/api/convoy',request);assert.equal(r.status,200);assert.equal(calls.length,2);assert.strictEqual(calls[0],calls[1]);assert.equal(calls[1].body,request.body);}finally{globalThis.fetch=old;}
});
test('disabled cookies stop after one retry and unrelated failures never auto-repeat business',async()=>{
 const {sitesPost}=await import('../src/sites-http.ts');const old=globalThis.fetch;let calls=0;
 globalThis.fetch=(async()=>{calls++;return Response.json({code:'identity_required'},{status:428});}) as typeof fetch;
 try{await assert.rejects(()=>sitesPost('/api/convoy',{method:'POST',body:'{}'}),/Cookie/);assert.equal(calls,2);calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({error:'busy'},{status:503});}) as typeof fetch;assert.equal((await sitesPost('/api/estate',{method:'POST',body:'{}'})).status,503);assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
