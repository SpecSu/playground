import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FarmStore } from './store.ts';
import type { Command } from '../src/model.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = resolve(root, '.local'); mkdirSync(dataDir, { recursive: true });
const store = new FarmStore(process.env.FARM_DB || resolve(dataDir, 'farm.sqlite'));
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 5190);
const types: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
function json(res: ServerResponse, code: number, data: unknown) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function api(req: IncomingMessage,res: ServerResponse) {
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res,403,{error:'只接受同源操作'});
  let device = req.headers.cookie?.match(/(?:^|;\s*)farm_device=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!device) { device=randomUUID(); res.setHeader('Set-Cookie',`farm_device=${device}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`); }
  if (req.method === 'GET') return json(res,200,store.get(device,Date.now()));
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{error:'需要 JSON 指令'});
  let body='';
  for await (const chunk of req) { body+=chunk.toString(); if(Buffer.byteLength(body)>8192) return json(res,413,{error:'指令过大'}); }
  let c: Command;
  try { c=JSON.parse(body); } catch { return json(res,400,{error:'无效 JSON'}); }
  if (!c || typeof c.id!=='string' || !/^[a-zA-Z0-9-]{8,80}$/.test(c.id) || typeof c.type!=='string') return json(res,400,{error:'指令缺少唯一 ID 或类型'});
  return json(res,200,store.command(device,c,Date.now()));
}
const server = createServer((req,res)=>{ void handle(req,res).catch(error=>{console.error('Farm request failed:',error instanceof Error?error.message:'unknown'); if(!res.headersSent)json(res,503,{error:'本地保存暂时不可用，请保留页面后重试'});else res.end();}); });
let middleware: ((req: IncomingMessage,res: ServerResponse,next:()=>void)=>void) | undefined;
if (dev) { const {createServer:createVite}=await import('vite'); const vite=await createVite({root,server:{middlewareMode:true,hmr:{server}}}); middleware=vite.middlewares; }
async function handle(req: IncomingMessage,res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if(url.pathname==='/api/farm')return api(req,res);
  if(middleware)return middleware(req,res,()=>{res.writeHead(404);res.end();});
  const dist=resolve(root,'dist'); let file=resolve(dist,'.'+decodeURIComponent(url.pathname));
  if (url.pathname==='/')file=resolve(dist,'index.html');
  if (!file.startsWith(dist+'/')) {res.writeHead(403);res.end();return;}
  if (!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'}); createReadStream(file).pipe(res);
}
server.listen(port,'127.0.0.1',()=>console.log(`绒绒农场 ${dev?'dev':'production preview'}: http://127.0.0.1:${port} · local SQLite`));
function stop(){server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
