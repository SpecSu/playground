import {namedDemoServerResources} from './named-demo-resources.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, createReadStream, statSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, extname, isAbsolute, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import {MinimalSqliteRepository} from './minimal-sqlite.ts';
import {handleNamedDemoApi} from './minimal-demo.ts';
import {EstateStore} from './estate-store.ts';
import {ConvoyStore} from './convoy-store.ts';
import {HarvestStore} from './harvest-store.ts';
import type {ConvoyCommand} from '../src/v7/convoy.ts';
import type {HarvestCommand} from '../src/v7/harvest.ts';
import type {EstateCommand} from '../src/v5/estate.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = resolve(root, '.local');
const legacyFile=process.env.FARM_DB||resolve(dataDir,'farm.sqlite');
// The named-demo path never initializes legacy stores or changes their database.
let legacyStores:{estates:EstateStore;convoys:ConvoyStore;harvests:HarvestStore}|undefined;
function getLegacyStores(){if(!legacyStores){mkdirSync(dataDir,{recursive:true});legacyStores={estates:new EstateStore(legacyFile),convoys:new ConvoyStore(legacyFile),harvests:new HarvestStore(legacyFile)};}return legacyStores;}
const demoRepositories=new Map<string,MinimalSqliteRepository>();
function demoDatabasePath(){
 const value=process.env.FARM_DEMO_DB;if(!value||!isAbsolute(value))throw new Error('FARM_DEMO_DB must name an absolute, dedicated database');
 const file=resolve(value),oldFiles=[resolve(legacyFile),resolve(dataDir,'farm.sqlite')];
 // Reject links throughout the destination path and hardlink aliases to legacy.
 for(let at=file;at!==parse(at).root;at=dirname(at)){let entry;try{entry=lstatSync(at);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(entry?.isSymbolicLink())throw new Error('Demo database path must not contain symbolic links');}
 const parent=realpathSync(dirname(file)),canonical=resolve(parent,file.slice(dirname(file).length+1));
 for(const old of oldFiles){if(file===old||canonical===old||existsSync(old)&&canonical===realpathSync(old))throw new Error('Demo database must differ from the legacy database');if(existsSync(file)&&existsSync(old)){const a=statSync(file),b=statSync(old);if(a.dev===b.dev&&a.ino===b.ino)throw new Error('Demo database aliases legacy data');}}
 if(existsSync(file)&&!statSync(file).isFile())throw new Error('Demo database is not a regular file');
 return file;
}
function demoRepository(namespace:string){let repository=demoRepositories.get(namespace);if(!repository){repository=new MinimalSqliteRepository(demoDatabasePath(),namespace);demoRepositories.set(namespace,repository);}return repository;}
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 5190);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer in 1..65535');
const types: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
function json(res: ServerResponse, code: number, data: unknown) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function api(req: IncomingMessage,res: ServerResponse,kind:'estate'|'convoy'|'harvest'='estate') {
  const {estates,convoys,harvests}=getLegacyStores();
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res,403,{error:'只接受同源操作'});
  let device = req.headers.cookie?.match(/(?:^|;\s*)farm_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!device) { device=randomUUID(); res.setHeader('Set-Cookie',`farm_device=${device}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`); }
  if (req.method === 'GET') {
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    return json(res,200,kind==='convoy'?convoys.get(device,url.searchParams.get('room')||'',Date.now()):kind==='harvest'?harvests.get(device,url.searchParams.get('token')||undefined,Date.now()):estates.get(device,Date.now()));
  }
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{error:'需要 JSON 指令'});
  let body='';
  for await (const chunk of req) { body+=chunk.toString(); if(Buffer.byteLength(body)>65536) return json(res,413,{error:'指令过大'}); }
  let c: EstateCommand;
  try { c=JSON.parse(body); } catch { return json(res,400,{error:'无效 JSON'}); }
  if (!c || typeof c.id!=='string' || !/^[a-zA-Z0-9-]{8,80}$/.test(c.id) || typeof c.type!=='string') return json(res,400,{error:'指令缺少唯一 ID 或类型'});
  return json(res,200,kind==='convoy'?convoys.command(device,c as ConvoyCommand,Date.now()):kind==='harvest'?harvests.command(device,c as HarvestCommand,Date.now()):estates.command(device,c,Date.now()));
}
const diagnostics:{message:string;at:number}[]=[];
const server = createServer((req,res)=>{ void handle(req,res).catch(error=>{console.error('Farm request failed:',error instanceof Error?error.message:'unknown'); if(!res.headersSent)json(res,503,{error:'本地保存暂时不可用，请保留页面后重试'});else res.end();}); });
let middleware: ((req: IncomingMessage,res: ServerResponse,next:()=>void)=>void) | undefined;
if (dev) { const {createServer:createVite}=await import('vite'); const vite=await createVite({root,server:{middlewareMode:true,hmr:{server}}}); middleware=vite.middlewares; }
async function handle(req: IncomingMessage,res: ServerResponse) {
  const host=req.headers.host,remote=req.socket.remoteAddress,raw=req.url||'/';
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(remote??'')||![`127.0.0.1:${port}`,`localhost:${port}`].includes(host??'')||!raw.startsWith('/')||raw.startsWith('//'))return json(res,403,{code:'loopback-required'});
  const url = new URL(raw,`http://${host}`);
  if(url.pathname.startsWith('/api/minimal/')){
   // No query name means the original anonymous local V28 behavior, never a UID.
   if(!url.searchParams.has('name'))return json(res,503,{status:'disabled',code:'service-disabled',message:'当前为本机牧场，原存档保持不变'});
   if(req.headers.origin&&req.headers.origin!==url.origin||req.headers['sec-fetch-site']&&!['none','same-origin'].includes(String(req.headers['sec-fetch-site'])))return json(res,403,{code:'same-origin-required'});
   if(Number(req.headers['content-length'])>131072)return json(res,413,{code:'body-too-large'});
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>131072)return json(res,413,{code:'body-too-large'});chunks.push(part);}
   const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);}
   const method=req.method??'GET',request=new Request(url,{method,headers,...(method==='GET'||method==='HEAD'?{}:{body:Buffer.concat(chunks)})});
   let animalResources;try{if(process.env.FARM_NAMED_DEMO==='1')animalResources=namedDemoServerResources(url.href,process.env.FARM_NAMED_REQUIRE_MODELS==='1');}catch{return json(res,503,{status:'unavailable',code:'demo-models-unavailable',message:'测试动物资源配置尚未通过校验，原进度保持不变'});}
   const response=await handleNamedDemoApi(request,{animalResources,enabled:process.env.FARM_NAMED_DEMO==='1',boundary:{kind:'loopback',instanceId:'farm-local-demo-v1'},repositoryForNamespace:demoRepository,clock:Date.now,newId:randomUUID,fingerprint:async value=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Buffer.from(bytes).toString('hex');}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.searchParams.has('name')&&['/api/estate','/api/convoy','/api/harvest','/api/farm'].includes(url.pathname))return json(res,400,{code:'demo-route-required',message:'测试名称只用于独立测试牧场接口'});
  if(url.pathname==='/api/estate')return api(req,res);
  if(url.pathname==='/api/convoy')return api(req,res,'convoy');
  if(url.pathname==='/api/harvest')return api(req,res,'harvest');
  if(url.pathname==='/api/farm')return json(res,410,{error:'旧互动接口已停用，请刷新进入庄园 V5'});
  if(url.pathname==='/api/diagnostics'){if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{});}try{const d=JSON.parse(body);diagnostics.push({message:String(d.message||'').slice(0,1000),at:Date.now()});if(diagnostics.length>20)diagnostics.shift();}catch{}return json(res,200,{ok:true});}return json(res,200,{errors:diagnostics});}
  if(middleware)return middleware(req,res,()=>{res.writeHead(404);res.end();});
  const dist=process.env.FARM_DIST?resolve(process.env.FARM_DIST):resolve(root,'dist'); let file=resolve(dist,'.'+decodeURIComponent(url.pathname));
  if (url.pathname==='/')file=resolve(dist,'index.html');
  if (!file.startsWith(dist+'/')) {res.writeHead(403);res.end();return;}
  if (!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'}); createReadStream(file).pipe(res);
}
server.listen(port,'127.0.0.1',()=>console.log(`绒绒农场 ${dev?'dev':'production preview'}: http://127.0.0.1:${port} · named demo is explicitly ${process.env.FARM_NAMED_DEMO==='1'?'enabled':'disabled'}`));
function stop(){server.close(()=>{for(const repository of demoRepositories.values())repository.close();legacyStores?.estates.close();legacyStores?.convoys.close();legacyStores?.harvests.close();process.exit(0);});server.closeIdleConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
