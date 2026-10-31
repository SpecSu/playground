import {isApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
import {MinimalAuthority} from '../src/minimal/authority.ts';
import type {MinimalAuthorityOptions,MinimalRepository} from '../src/minimal/cloud-contract.ts';
import type {FarmAccount,FarmAccountRow} from '../src/minimal/account-contract.ts';

/** Only the platform hosting adapter may populate `subject`. The standalone Node
 * server never treats request headers, cookies, query strings or form UID as proof.
 * Keep this API behind the existing Sites access policy; enabling it does not grant
 * anybody access to the Site. ownerSubject must be the verified site-scoped subject,
 * NOT the account_user_id returned by the Sites sharing UI. */
export type MinimalApiContext=MinimalAuthorityOptions&{
 enabled:boolean;
 subject:string|null;
 ownerSubject?:string;
 ownerAccountId?:string;
 repository:MinimalRepository;
 demoIdentity?:{kind:'named-demo';name:string};
};
const MAX_BODY=131072;
const privateJson=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie, oai-authenticated-user-id'}});
export async function deriveAccountId(subject:string):Promise<string>{
 if(!subject.trim()||subject.length>512)throw new Error('Missing trusted subject');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`farm-account-v1\0${subject}`));
 return `uid_${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
async function account(context:MinimalApiContext,uid:string):Promise<FarmAccount>{
 const owner=!context.demoIdentity&&(context.ownerSubject!==undefined&&context.subject===context.ownerSubject||context.ownerAccountId!==undefined&&context.ownerAccountId===uid);
 const row=await context.repository.transaction(async tx=>{
  const previous=await tx.get('profiles',uid);
  if(previous){
   // Owner designation is deployment-owned and is not a transferable alias.
   if(previous.ownerBound!==owner){const changed={...previous,handle:context.demoIdentity?`演示 · ${context.demoIdentity.name}`:owner?'twx':`牧场主 ${uid.slice(-6)}`,ownerBound:owner};await tx.put('profiles',uid,changed);return changed;}
   return previous;
  }
  const created:FarmAccountRow={uid,handle:context.demoIdentity?`演示 · ${context.demoIdentity.name}`:owner?'twx':`牧场主 ${uid.slice(-6)}`,createdAt:context.clock(),ownerBound:owner};
  await tx.put('profiles',uid,created);return created;
 });
 return {uid:row.uid,handle:row.handle,createdAt:row.createdAt};
}
async function readJson(request:Request):Promise<{body:unknown}|{error:Response}>{
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type')??''))return {error:privateJson({code:'json-required',message:'需要 JSON 指令'},415)};
 if(Number(request.headers.get('Content-Length'))>MAX_BODY)return {error:privateJson({code:'body-too-large',message:'请求内容过大'},413)};
 const reader=request.body?.getReader();if(!reader)return {error:privateJson({code:'invalid-json',message:'请求内容无效'},400)};
 const parts:Uint8Array[]=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return {error:privateJson({code:'body-too-large',message:'请求内容过大'},413)};}parts.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return {body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}catch{return {error:privateJson({code:'invalid-json',message:'请求内容无效'},400)};}
}

/** Fail-closed account API. Rejected/missing auth never invokes storage. */
export async function handleMinimalApi(request:Request,context:MinimalApiContext):Promise<Response>{
 if(!context.enabled)return privateJson({status:'disabled',code:'service-disabled',message:'账号同步尚未接通，本机存档保持不变'},503);
 if(!context.subject?.trim()||context.subject.length>512)return privateJson({status:'sign-in-required',code:'sign-in-required',message:'请先登录后进入牧场'},401);
 const url=new URL(request.url),origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if(origin&&origin!==url.origin||site==='cross-site'||site==='same-site')return privateJson({code:'same-origin-required',message:'只接受同源操作'},403);
 const route=url.pathname.replace(/^\/api\/minimal\//,'');
 if(!['session','farm','bootstrap','command','wishing','offers','creative','receipt','boarding','boarding-command'].includes(route))return privateJson({code:'not-found'},404);
 const readOnly=['session','farm','offers','receipt','boarding'].includes(route);
 if(request.method!==(readOnly?'GET':'POST'))return privateJson({code:'method-not-allowed'},405);
 if([...url.searchParams.keys()].some(key=>route==='receipt'?key!=='requestId':route==='offers'?!['after','limit'].includes(key):true))return privateJson({code:'invalid-query'},400);
 try{
  const uid=await deriveAccountId(context.subject);
  const expectedAccount=request.headers.get('X-Farm-Account');if(expectedAccount!==null&&expectedAccount!==uid)return privateJson({code:'account-changed',message:'登录账号已变化，请回到原账号再重试'},409);
  // Only the named-demo adapter supplies demoIdentity after selecting its isolated
  // repository. Always override any unrelated caller option; names/body/handles
  // cannot authorize a grant on the ordinary account route.
  const authority=new MinimalAuthority(context.repository,{...context,demoDebugAccountId:context.demoIdentity?uid:undefined});
  if(route==='session')return privateJson({status:'online',account:await account(context,uid),...(context.demoIdentity?{capabilities:{demo:context.demoIdentity,importLegacy:false}}:{})});
  if(route==='farm')return privateJson({status:'online',account:await account(context,uid),view:await authority.get(uid),capabilities:{...(context.demoIdentity?{demo:context.demoIdentity}:isApprovedSignedInFarmResourceContext(context.animalResources)?{animalResources:{scope:'signed-in-farm'}}:{}),importLegacy:!context.demoIdentity&&(context.ownerSubject!==undefined&&context.subject===context.ownerSubject||context.ownerAccountId!==undefined&&context.ownerAccountId===uid)}});
  if(route==='offers'){const limit=Number(url.searchParams.get('limit')??20),after=url.searchParams.get('after');if(!Number.isInteger(limit)||limit<1||limit>50||after!==null&&!/^[a-zA-Z0-9_:.-]{1,256}$/.test(after))return privateJson({code:'invalid-query'},400);return privateJson(await authority.listAssets(uid,after,limit));}
  if((route==='boarding'||route==='boarding-command')&&context.demoIdentity)return privateJson({code:'production-account-required',message:'好友寄养需要正式账号；测试名称不代表真实好友'},403);
  if(route==='boarding')return privateJson(await authority.boardingList(uid));
  if(route==='receipt')return privateJson({receipt:await authority.receipt(uid,url.searchParams.get('requestId')??'')});
  const parsed=await readJson(request);if('error' in parsed)return parsed.error;
  if(route==='bootstrap'&&parsed.body&&typeof parsed.body==='object'&&'mode' in parsed.body&&parsed.body.mode==='import'&&(context.demoIdentity||!(context.ownerSubject!==undefined&&context.subject===context.ownerSubject||context.ownerAccountId!==undefined&&context.ownerAccountId===uid)))return privateJson({code:'owner-migration-required',message:'旧档迁移须先绑定已验证的原牧场主；原存档没有改动'},403);
  const result=route==='boarding-command'?await authority.boarding(uid,parsed.body):route==='bootstrap'?await authority.bootstrap(uid,parsed.body):route==='command'?await authority.command(uid,parsed.body):route==='creative'?await authority.creative(uid,parsed.body):await authority.wishing(uid,parsed.body);
  return privateJson(result);
 }catch{
  // Do not log request bodies, subject identifiers, wishes, or asset ownership.
  return privateJson({status:'unavailable',code:'temporarily-unavailable',message:'连接暂时中断，重试会沿用同一条指令',retryable:true},503);
 }
}
