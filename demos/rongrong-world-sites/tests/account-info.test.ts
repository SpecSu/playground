import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {GET} from '../app/api/account-info/route.ts';
const url='https://farm.example/api/account-info';
test('account-info is read-only canonical identity with private cache headers',async()=>{
 const subject='trusted-site-subject';
 const response=await GET(new Request(url,{headers:{'oai-authenticated-user-id':subject}}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{uid:'uid_'+createHash('sha256').update('farm-account-v1\0'+subject).digest('hex')});
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.match(response.headers.get('Vary')??'',/oai-authenticated-user-id/);
 assert.equal(response.headers.get('Set-Cookie'),null);
});
test('account-info rejects caller-selected UID and unauthenticated/cross-origin requests',async()=>{
 for(const headers of [{},{'X-User-Id':'owner'},{'oai-authenticated-user-id':'   '}] as Record<string,string>[])assert.equal((await GET(new Request(url,{headers}))).status,401);
 const headers={'oai-authenticated-user-id':'trusted-site-subject'};
 assert.equal((await GET(new Request(url+'?uid=owner',{headers}))).status,400);
 assert.equal((await GET(new Request(url,{headers:{...headers,Origin:'https://other.example'}}))).status,403);
 assert.equal((await GET(new Request(url,{headers:{...headers,'Sec-Fetch-Site':'cross-site'}}))).status,403);
 assert.equal((await GET(new Request(url,{method:'POST',headers}))).status,405);
});
