import {parseDemoName} from '../src/minimal/demo-name.ts';
import type {MinimalAuthorityOptions,MinimalRepository} from '../src/minimal/cloud-contract.ts';
import {deriveAccountId,handleMinimalApi} from './minimal-api.ts';
/** A grant populated ONLY by the deployment adapter after its network/identity
 * boundary is verified. Query names select test data; they authenticate nobody. */
export type NamedDemoBoundary={kind:'loopback';instanceId:string}|{kind:'sites-owner';ownerSubject:string};
export type NamedDemoContext=MinimalAuthorityOptions&{enabled:boolean;boundary:NamedDemoBoundary;repositoryForNamespace:(namespace:string)=>MinimalRepository};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie, oai-authenticated-user-id'}});
const digest=async(value:string)=>{const result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');};
function trustedPartition(boundary:NamedDemoBoundary,url:URL):string|null{
 if(boundary?.kind==='loopback')return url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&/^[a-zA-Z0-9_-]{1,128}$/.test(boundary.instanceId)?`loopback\0${boundary.instanceId}`:null;
 // Keep this historical domain separator stable: it is partitioned by each
 // trusted signed-in subject, never by the query name or a public site owner.
 if(boundary?.kind==='sites-owner')return typeof boundary.ownerSubject==='string'&&!!boundary.ownerSubject.trim()&&boundary.ownerSubject.length<=512?`sites-owner\0${boundary.ownerSubject}`:null;
 return null;
}
/** All names in one trusted boundary share a demo-only exchange pool. Different
 * signed-in subjects, local instances, and production rows cannot share any data. */
export async function handleNamedDemoApi(request:Request,context:NamedDemoContext):Promise<Response>{
 const url=new URL(request.url),selection=parseDemoName(url.searchParams);
 if(selection.kind!=='demo')return json({code:'invalid-demo-name',message:selection.kind==='invalid'?selection.message:'请在测试链接中指定 name。'},400);
 if(!context.enabled)return json({status:'disabled',code:'service-disabled',message:'测试账号入口尚未开启，原进度保持不变'},503);
 const partition=trustedPartition(context.boundary,url),origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if(!partition||origin&&origin!==url.origin||site==='cross-site'||site==='same-site')return json({code:'demo-boundary-required',message:'测试账号仅供本机或已登录的站点访客使用'},403);
 const namespace=await digest(`farm-named-demo-namespace-v1\0${partition}`),subject=`farm-named-demo-account-v1\0${namespace}\0${selection.name}`,uid=await deriveAccountId(subject);
 const expected=request.headers.get('X-Farm-Account');if(expected!==null&&expected!==uid)return json({code:'account-changed',message:'测试账号已变化，请重新连接当前名称'},409);
 url.searchParams.delete('name');
 const route=url.pathname.replace(/^\/api\/minimal\//,'');
 if(route==='boarding'||route==='boarding-command')return json({code:'production-account-required',message:'好友寄养需要正式账号；测试名称不代表真实好友，请切换正式账号入口'},403);
 if(route==='visit'){
  if(request.method!=='GET')return json({code:'method-not-allowed'},405);
  const targetParams=new URLSearchParams();for(const target of url.searchParams.getAll('target'))targetParams.append('name',target);const target=parseDemoName(targetParams);
  if(target.kind!=='demo'||[...url.searchParams.keys()].some(key=>key!=='target'))return json({code:'invalid-query',message:'请输入有效的测试牧场名称'},400);
  try{
   const repository=context.repositoryForNamespace(namespace),targetUid=await deriveAccountId(`farm-named-demo-account-v1\0${namespace}\0${target.name}`);
   // Deliberately no Authority.get: even expiry/job settlement would write while visiting.
   const farm=await repository.transaction(tx=>tx.get('farms',targetUid));
   return json({status:'online',demo:{kind:'named-demo',name:selection.name},readOnly:true,target:{name:target.name,handle:`演示 · ${target.name}`},farm:farm?{state:farm.state}:null});
  }catch{return json({status:'unavailable',code:'temporarily-unavailable',message:'测试牧场暂时无法读取，请稍后重试'},503);}
 }
 try{
  return await handleMinimalApi(new Request(url,request),{...context,enabled:true,subject,ownerSubject:undefined,ownerAccountId:undefined,repository:context.repositoryForNamespace(namespace),demoIdentity:{kind:'named-demo',name:selection.name}});
 }catch{return json({status:'unavailable',code:'temporarily-unavailable',message:'测试牧场暂时无法连接，请重试原指令'},503);}
}
