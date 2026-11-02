import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
async function load(){const url=new URL('../lib/room-server-http.ts',import.meta.url);assert.ok(await readFile(url,'utf8').then(()=>true,()=>false),'HTTP API must enforce session and payload security');return await import(url.href);}

test('HTTP boundary blocks cross-site and missing-origin writes',async()=>{
  const {validateMutationRequest}=await load();
  assert.throws(()=>validateMutationRequest(new Request('https://club.example/api/room',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'}})),{code:'FORBIDDEN'});
  assert.throws(()=>validateMutationRequest(new Request('https://club.example/api/room',{method:'POST',headers:{'content-type':'application/json'}})),{code:'FORBIDDEN'});
  assert.doesNotThrow(()=>validateMutationRequest(new Request('https://club.example/api/room',{method:'POST',headers:{origin:'https://club.example','content-type':'application/json'}})));
});
test('HTTP body reading rejects oversized, non-JSON, and malformed requests',async()=>{
  const {readCommandBody,validateMutationRequest}=await load();
  assert.throws(()=>validateMutationRequest(new Request('https://club.example/api/room',{method:'POST',headers:{origin:'https://club.example','content-type':'text/plain'}})),{code:'INVALID_COMMAND'});
  await assert.rejects(()=>readCommandBody(new Request('https://club.example/api/room',{method:'POST',body:'a'.repeat(5000)})),{code:'INVALID_COMMAND'});
  await assert.rejects(()=>readCommandBody(new Request('https://club.example/api/room',{method:'POST',body:'{'})),{code:'INVALID_COMMAND'});
  assert.deepEqual(await readCommandBody(new Request('https://club.example/api/room',{method:'POST',body:'{"type":"heartbeat"}'})),{type:'heartbeat'});
});
test('HTTP API is no-store, rejects missing database, and never leaks raw errors',async()=>{
  const {handleRoomRequest}=await load();const response=await handleRoomRequest(new Request('https://club.example/api/room'),undefined);
  assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/no-store/);
  const body=await response.json();assert.equal(body.error.code,'UNAVAILABLE');assert.equal(body.error.stack,undefined);
});

test('cross-site GET and foreign-origin GET cannot create any database records',async()=>{
  const {handleRoomRequest}=await load();
  let writes=0;const db={prepare(){writes++;throw new Error('No database operation is allowed');}};
  for(const headers of [{'sec-fetch-site':'cross-site'},{origin:'https://evil.example'}]){
    const result=await handleRoomRequest(new Request('https://club.example/api/room',{headers}),db);
    assert.equal(result.status,403);assert.equal((await result.json()).error.code,'FORBIDDEN');
  }
  assert.equal(writes,0);
});
