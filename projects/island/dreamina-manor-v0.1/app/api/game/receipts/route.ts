import {env} from 'cloudflare:workers';
import {readOperationReceipts} from '../../../../lib/server/receipt-check.js';
const headers={'Cache-Control':'no-store'};
/** Read-only POST keeps IDs out of URLs. It does not enter the gameplay command route. */
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return new Response('Wrong origin',{status:403});if(Number(request.headers.get('content-length')??0)>8192)return new Response('Too large',{status:413});const raw=await request.text();if(raw.length>8192)return new Response('Too large',{status:413});if(!env.DB)return new Response('Unavailable',{status:503});return Response.json(await readOperationReceipts(env.DB,JSON.parse(raw)),{headers});}catch(e:any){return Response.json({error:{code:e.code??'UNAVAILABLE'}},{status:e.status??503,headers});}}
