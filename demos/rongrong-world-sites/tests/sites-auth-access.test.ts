import test from 'node:test';
import assert from 'node:assert/strict';
import {withChatGPTAccess} from '../lib/sites-auth-access.ts';

const base='https://farm.example';
async function invoke(path='/',init:RequestInit={}){
 let calls=0;
 const response=await withChatGPTAccess(new Request(base+path,init),async()=>{calls++;return new Response('game',{headers:{'Cache-Control':'public, max-age=3600',Vary:'Accept-Encoding'}});});
 return {response,calls};
}
test('anonymous page navigation redirects to platform sign-in before gameplay runs',async()=>{
 for(const path of ['/', '/?animationLab=1', '/?legacy=1', '/?convoy=abc', '/?harvest=token']){
  const {response,calls}=await invoke(path);assert.equal(calls,0);assert.equal(response.status,302);
  const location=new URL(response.headers.get('Location')!,base);assert.equal(location.origin,base);assert.equal(location.pathname,'/signin-with-chatgpt');assert.equal(location.searchParams.get('return_to'),path);assert.match(response.headers.get('Cache-Control')!,/no-store/);
 }
});
test('anonymous API reads writes and diagnostics never enter handlers or issue cookies',async()=>{
 for(const path of ['/api/estate','/api/convoy','/api/harvest','/api/farm','/api/diagnostics','/api/minimal/session','/api/minimal/bootstrap','/api/unknown'])for(const method of ['GET','POST','PUT','DELETE','OPTIONS']){
  const {response,calls}=await invoke(path,{method});assert.equal(calls,0);assert.equal(response.status,401);assert.equal(response.headers.get('Set-Cookie'),null);assert.equal((await response.json() as {code:string}).code,'sign_in_required');
 }
});
test('untrusted identity headers and blank platform identity cannot bypass sign-in',async()=>{
 for(const headers of [{'X-User-Id':'victim'},{'X-Device-Id':'victim'},{'oai-authenticated-user-email':'a@example.com'},{'oai-authenticated-user-id':'   '},{Cookie:'farm_device=11111111-1111-4111-8111-111111111111'}] as Record<string,string>[]){
  const {response,calls}=await invoke('/api/estate',{headers});assert.equal(response.status,401);assert.equal(calls,0);
 }
});
test('trusted Sites identity allows every signed-in user and makes dynamic responses private',async()=>{
 for(const user of ['owner-id','another-opaque-user'])for(const path of ['/', '/api/estate']){
  const {response,calls}=await invoke(path,{headers:{'oai-authenticated-user-id':user}});assert.equal(calls,1);assert.equal(await response.text(),'game');assert.match(response.headers.get('Cache-Control')!,/private, no-store/);assert.match(response.headers.get('Vary')!,/Accept-Encoding/);assert.match(response.headers.get('Vary')!,/oai-authenticated-user-id/);assert.match(response.headers.get('Vary')!,/Cookie/);
 }
});
test('non-navigation page writes and RSC fetches receive 401 instead of redirect loops',async()=>{
 for(const init of [{method:'POST'},{headers:{RSC:'1'}},{headers:{'Sec-Fetch-Mode':'cors'}}] as RequestInit[]){
  const {response,calls}=await invoke('/',init);assert.equal(response.status,401);assert.equal(calls,0);
 }
});
test('sign-in return path never becomes protocol-relative or a reserved auth endpoint',async()=>{
 for(const path of ['//evil.example/x','/signin-with-chatgpt','/signout-with-chatgpt','/callback']){
  const {response}=await invoke(path);const location=new URL(response.headers.get('Location')!,base);assert.equal(location.searchParams.get('return_to'),'/');
 }
});

test('actual hosted Worker invokes auth gate before app and connector dispatch',async()=>{
 const {build}=await import('esbuild');
 const {fileURLToPath}=await import('node:url');
 const bundled=await build({entryPoints:[fileURLToPath(new URL('../worker/index.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false'},plugins:[{name:'test-only-handler-stubs',setup(builder){
  builder.onResolve({filter:/^(vinext\/server\/fetch-handler|\.\.\/lib\/connector-context)$/},args=>({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='vinext/server/fetch-handler'?`export default {fetch(){return new Response('handler reached',{headers:{'X-Handler-Reached':'yes'}})}}`:`export function runWithConnectorBinding(binding,fn){return fn()}`}));
 }}]});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 for(const path of ['/', '/api/estate','/api/diagnostics','/api/minimal/session','/api/minimal/bootstrap']){
  const anonymous=await worker.fetch(new Request(base+path),{},{props:{}});assert.equal(anonymous.headers.get('X-Handler-Reached'),null);assert.equal(anonymous.status,path==='/'?302:401);
  const signedIn=await worker.fetch(new Request(base+path,{headers:{'oai-authenticated-user-id':'any-signed-in-person'}}),{},{props:{}});assert.equal(signedIn.status,200);assert.equal(signedIn.headers.get('X-Handler-Reached'),'yes');assert.match(signedIn.headers.get('Cache-Control'),/no-store/);
 }
});
