import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSitesApi} from '../lib/sites-api.ts';
const unavailable={} as D1Database;
test('Sites API rejects cross-origin and cross-site requests before touching storage',async()=>{
 for(const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}] as Record<string,string>[]){
  const r=await handleSitesApi(new Request('https://farm.example/api/estate',{headers}),'estate',unavailable);assert.equal(r.status,403);assert.match(((await r.json()) as {error:string}).error,/同源/);
 }
});
test('Sites API rejects bad bodies, missing IDs and excessive UTF-8 input without mutating storage',async()=>{
 const cases=[['text/plain','{}',415],['application/json','{',400],['application/json','{}',400],['application/json','{"id":"12345678","type":3}',400],['application/json','x'.repeat(65537),413]] as const;
 for(const [type,body,status] of cases){const r=await handleSitesApi(new Request('https://farm.example/api/estate',{method:'POST',headers:{'Content-Type':type},body}),'estate',unavailable);assert.equal(r.status,status);assert.match(r.headers.get('Cache-Control')!,/no-store/);}
});
test('Sites API does not accept arbitrary identity headers and creates secure device cookies only for its origin',async()=>{
 const request=new Request('https://farm.example/api/estate',{method:'POST',headers:{'Content-Type':'application/json','X-User-Id':'victim','X-Device-Id':'victim'},body:'{}'});
 const r=await handleSitesApi(request,'estate',unavailable);const cookie=r.headers.get('Set-Cookie')!;assert.match(cookie,/^farm_device=[a-f0-9-]{36};/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Secure/);assert.equal(cookie.includes('victim'),false);
});
test('Sites API preserves existing device cookie and returns explicit unavailable state without fallback storage',async()=>{
 const r=await handleSitesApi(new Request('https://farm.example/api/estate'),'estate',undefined);assert.equal(r.status,503);assert.match(((await r.json()) as {error:string}).error,/存储/);assert.equal(r.headers.get('Set-Cookie'),null);
 const invalid=await handleSitesApi(new Request('https://farm.example/api/estate',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'farm_device=5a2b3800-1f5a-4f82-a95a-e303d0f2ab16'},body:'{}'}),'estate',unavailable);assert.equal(invalid.headers.get('Set-Cookie'),null);
});
test('retired legacy farm endpoint cannot create or mutate a parallel pre-migration save',async()=>{
 const old=await import('../app/api/farm/route.ts');
 for(const request of [new Request('https://farm.example/api/farm'),new Request('https://farm.example/api/farm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'old-command-id',type:'act',action:'dance'})})]){
  const r=await (request.method==='GET'?old.GET(request):old.POST(request));assert.equal(r.status,410);const body=await r.json() as {error:string};assert.match(body.error,/原存档保留/);assert.equal(r.headers.get('Set-Cookie'),null);
 }
});
test('a first POST only establishes identity, so losing its response cannot execute an unrepeatable command',async()=>{
 const body=JSON.stringify({id:'first-create-123',type:'create',guardian:'dog'});
 const first=await handleSitesApi(new Request('https://farm.example/api/convoy',{method:'POST',headers:{'Content-Type':'application/json'},body}),'convoy',unavailable);
 assert.equal(first.status,428);assert.match(first.headers.get('Set-Cookie')!,/^farm_device=/);assert.equal((await first.json() as {code:string}).code,'identity_required');
 const afterLostResponse=await handleSitesApi(new Request('https://farm.example/api/convoy',{method:'POST',headers:{'Content-Type':'application/json'},body}),'convoy',unavailable);
 assert.equal(afterLostResponse.status,428);assert.notEqual(afterLostResponse.headers.get('Set-Cookie'),first.headers.get('Set-Cookie'));
});
