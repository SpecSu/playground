import {signedInFarmServerResources} from './signed-in-farm-resources.ts';
import {namedDemoServerResources} from './named-demo-resources.ts';
import {handleNamedDemoApi} from './minimal-demo.ts';
import {deriveAccountId,handleMinimalApi} from './minimal-api.ts';
import {MinimalD1Repository,type MinimalD1Database} from './minimal-d1.ts';
import type {MinimalRepository} from '../src/minimal/cloud-contract.ts';
/** Hosted Sites deployment ONLY. Sites dispatch strips/owns this header. Do not
 * mount this adapter on a standalone Node server or accept it from arbitrary
 * proxy traffic. Keep withChatGPTAccess as the outer Worker access boundary. */
export type SitesMinimalEnvironment={DB?:MinimalD1Database;FARM_MINIMAL_ONLINE?:string;FARM_NAMED_DEMO?:string;FARM_NAMED_REQUIRE_MODELS?:string;FARM_OWNER_ACCOUNT_ID?:string;FARM_OWNER_SITE_SUBJECT?:string};
const unavailable:MinimalRepository={transaction:async()=>{throw new Error('Minimal storage binding unavailable');}};
export const NAMED_DEMO_SITE_ORIGIN='https://fluffy-farm-companions.tangguozhou.chatgpt.site';
const privateJson=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie, oai-authenticated-user-id'}});
export async function handleSitesMinimalRequest(request:Request,env:SitesMinimalEnvironment):Promise<Response>{
 const url=new URL(request.url);
 if(url.searchParams.has('name')){
  if(env.FARM_NAMED_DEMO!=='1')return privateJson({status:'disabled',code:'service-disabled',message:'测试账号入口尚未开启，原进度保持不变'},503);
  if(url.origin!==NAMED_DEMO_SITE_ORIGIN)return privateJson({code:'demo-boundary-required'},403);
  const subject=request.headers.get('oai-authenticated-user-id');
  if(!subject?.trim()||subject.length>512)return privateJson({status:'sign-in-required',code:'sign-in-required',message:'请先登录 ChatGPT'},401);
  // Public sharing does not authenticate a visitor. Dispatcher identity remains
  // mandatory; optional owner pins still narrow access and fail closed if invalid.
  if(env.FARM_OWNER_SITE_SUBJECT!==undefined&&(!env.FARM_OWNER_SITE_SUBJECT.trim()||subject!==env.FARM_OWNER_SITE_SUBJECT))return privateJson({code:'demo-owner-required'},403);
  if(env.FARM_OWNER_ACCOUNT_ID!==undefined&&(!/^uid_[a-f0-9]{64}$/.test(env.FARM_OWNER_ACCOUNT_ID)||await deriveAccountId(subject)!==env.FARM_OWNER_ACCOUNT_ID))return privateJson({code:'demo-owner-required'},403);
  let animalResources;try{animalResources=namedDemoServerResources(url.href,env.FARM_NAMED_REQUIRE_MODELS==='1');}catch{return privateJson({status:'unavailable',code:'demo-models-unavailable',message:'测试动物资源配置尚未通过校验，原进度保持不变'},503);}
  return handleNamedDemoApi(request,{animalResources,
   enabled:true,boundary:{kind:'sites-owner',ownerSubject:subject},
   repositoryForNamespace:namespace=>env.DB?new MinimalD1Repository(env.DB,namespace):unavailable,
   clock:Date.now,newId:()=>crypto.randomUUID(),
   fingerprint:async value=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');},
  });
 }
 const configured=env.FARM_MINIMAL_ONLINE==='1';
 const repository=env.DB?new MinimalD1Repository(env.DB):unavailable;
 const subject=request.headers.get('oai-authenticated-user-id');
 let animalResources;
 if(configured&&subject?.trim()&&subject.length<=512&&url.origin===NAMED_DEMO_SITE_ORIGIN){try{animalResources=signedInFarmServerResources(url.href,subject);}catch{return privateJson({status:'unavailable',code:'farm-models-unavailable',message:'动物资源配置尚未通过校验，原进度保持不变'},503);}}
 return handleMinimalApi(request,{
  enabled:configured,subject,animalResources,
  ownerAccountId:env.FARM_OWNER_ACCOUNT_ID&&/^uid_[a-f0-9]{64}$/.test(env.FARM_OWNER_ACCOUNT_ID)?env.FARM_OWNER_ACCOUNT_ID:undefined,
  ownerSubject:env.FARM_OWNER_SITE_SUBJECT?.trim()||undefined,
  repository,clock:Date.now,newId:()=>crypto.randomUUID(),
  fingerprint:async value=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');},
 });
}
