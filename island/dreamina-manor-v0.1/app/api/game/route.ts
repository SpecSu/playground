import {env} from 'cloudflare:workers';
import {SocialStore} from '../../../lib/server/social-store.js';
import {performCommand,readGame} from '../../../lib/server/service.js';
import schemaSql from '../../../drizzle/0000_lumpy_slipstream.sql?raw';
import {observeStore,serviceFailure} from '../../../lib/server/diagnostics.js';
let localSchema:Promise<unknown>|null=null;
async function store(){if(!env.DB)throw new Error('Database binding unavailable');const db=env.DB;if(import.meta.env.DEV){localSchema??=db.batch(schemaSql.split('--> statement-breakpoint').map((s:string)=>s.trim()).filter(Boolean).map((s:string)=>db.prepare(s.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ').replace('CREATE INDEX ','CREATE INDEX IF NOT EXISTS '))));await localSchema;}return new SocialStore(db);}
const headers={'Cache-Control':'no-store'};
type Trace={correlation:string;stage:string;failureStage?:string};
const errorResponse=(e:any,trace:Trace)=>{if((e.status??503)>=500)console.error(JSON.stringify(serviceFailure(e,trace)));return Response.json({error:{code:e.code??'UNAVAILABLE',message:e.code?e.message:'暂时没连上，稍后再试'}},{status:e.status??503,headers});};
export async function GET(request:Request){const trace:Trace={correlation:crypto.randomUUID(),stage:'database.binding'};try{const db=observeStore(await store(),trace),q=new URL(request.url).searchParams;trace.stage='service.read';return Response.json(await readGame(db,{uid:q.get('uid'),islandUid:q.get('island')??q.get('uid'),sessionId:q.get('session')}),{headers});}catch(e){return errorResponse(e,trace);}}
export async function POST(request:Request){const trace:Trace={correlation:crypto.randomUUID(),stage:'request.parse'};try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:{code:'WRONG_ORIGIN',message:'请从游戏页面操作'}},{status:403,headers});if(Number(request.headers.get('content-length')??0)>65536)return new Response('Too large',{status:413});const text=await request.text();if(text.length>65536)return new Response('Too large',{status:413});const body=JSON.parse(text);trace.stage='database.binding';const db=observeStore(await store(),trace);trace.stage='service.command';return Response.json(await performCommand(db,body),{headers});}catch(e){return errorResponse(e,trace);}}
