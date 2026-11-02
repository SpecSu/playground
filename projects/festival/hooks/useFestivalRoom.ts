'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FestivalSnapshot } from '@/lib/festival-types';
import { FestivalClock } from '@/lib/festival-motion';

type Connection = 'connecting'|'live'|'reconnecting'|'offline';
type Intent = {type:string;[key:string]:unknown};
type Reply = FestivalSnapshot & {error?:{code:string;message:string;retryAfterMs?:number};snapshot?:FestivalSnapshot};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/** Shared state is exclusively server-backed. A failed connection never creates a local room. */
export function useFestivalRoom(){
 const [snapshot,setSnapshot]=useState<FestivalSnapshot|null>(null);
 const [connection,setConnection]=useState<Connection>('connecting');
 const [feedback,setFeedback]=useState('');
 const [pending,setPending]=useState(false);
 const stateRef=useRef<FestivalSnapshot|null>(null),alive=useRef(false);
 const clock=useRef<FestivalClock|null>(null),movementGeneration=useRef(0);if(clock.current===null){clock.current=new FestivalClock();}
 const chain=useRef<Promise<unknown>>(Promise.resolve()),pendingCount=useRef(0),failures=useRef(0);
 const requests=useRef(new Set<AbortController>());
 const accept=useCallback((next:FestivalSnapshot,start:number,end:number)=>{
  if(!alive.current)return;
  const old=stateRef.current;
  if(old&&(next.revision<old.revision||(next.revision===old.revision&&next.serverNow<old.serverNow)))return;
  stateRef.current=next;clock.current!.accept(next.serverNow,start,end);setSnapshot(next);failures.current=0;setConnection('live');
 },[]);
 const request=useCallback(async(method:'GET'|'POST',body?:object)=>{
  const controller=new AbortController();requests.current.add(controller);
  const timer=setTimeout(()=>controller.abort(),8000),started=performance.now();
  try{
   const res=await fetch('/api/festival',{method,credentials:'same-origin',cache:'no-store',headers:method==='POST'?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const data=await res.json() as Reply;
   if(data.snapshot)accept(data.snapshot,started,performance.now());
   else if(!data.error&&data.self)accept(data,started,performance.now());
   return {data,ok:res.ok,status:res.status};
  }finally{clearTimeout(timer);requests.current.delete(controller);}
 },[accept]);
 const read=useCallback(async()=>{
  try{const result=await request('GET');if(!result.ok)throw new Error(result.data.error?.message??'连接暂时中断');}
  catch{if(alive.current){failures.current++;setConnection(failures.current>3?'offline':'reconnecting');}}
 },[request]);
 const send=useCallback((intent:Intent,silent=false):Promise<boolean>=>{
  if(!stateRef.current){if(!silent)setFeedback('正在连接共享荒原，请稍等');return Promise.resolve(false);}
  const actorId=stateRef.current.self.id,movement=intent.type==='move'||intent.type==='stop',generation=movement?++movementGeneration.current:0;
  if(pendingCount.current>10&&!movement){if(!silent)setFeedback('操作太快了，稍等一下');return Promise.resolve(false);}
  pendingCount.current++;if(!silent)setPending(true);
  const job=chain.current.then(async()=>{
   if(stateRef.current?.self.id!==actorId||(movement&&generation!==movementGeneration.current))return false;
   let requestId=crypto.randomUUID(),sequence=(stateRef.current?.self.lastSequence??0)+1;
   for(let attempt=0;attempt<3;attempt++){
    if(!alive.current||stateRef.current?.self.id!==actorId||(movement&&generation!==movementGeneration.current))return false;
    try{
     const result=await request('POST',{...intent,requestId,sequence});
     if(result.ok){if(!silent)setFeedback('');return true;}
     if(result.data.error?.code==='STALE_SEQUENCE'&&attempt<2){sequence=(stateRef.current?.self.lastSequence??sequence)+1;requestId=crypto.randomUUID();continue;}
     if(movement&&result.data.error?.code==='RATE_LIMITED'&&attempt<2){await sleep(Math.max(80,Math.min(1000,result.data.error.retryAfterMs??80)));continue;}
     if(result.status>=500&&attempt<2){await sleep(300*(attempt+1));continue;}
     if(!silent)setFeedback(result.data.error?.message??'这次操作没有完成，请重试');return false;
    }catch{
     if(attempt<2){await sleep(350*(attempt+1));continue;}
     if(alive.current){setConnection('reconnecting');if(!silent)setFeedback('连接中断，操作尚未确认。重新连接后再试');}return false;
    }
   }return false;
  }).finally(()=>{pendingCount.current--;if(alive.current&&pendingCount.current===0)setPending(false);});
  chain.current=job.catch(()=>false);return job;
 },[request]);
 useEffect(()=>{
  const activeRequests=requests.current;alive.current=true;let timer:ReturnType<typeof setTimeout>;let stopped=false;
  const poll=async()=>{await read();if(!stopped)timer=setTimeout(poll,document.visibilityState==='visible'?850:5000);};
  void poll();
  const heartbeat=setInterval(()=>{if(document.visibilityState==='visible'&&stateRef.current?.self.role==='participant')void send({type:'heartbeat'},true);},8000);
  const wake=()=>{if(document.visibilityState==='visible'){if(stateRef.current?.self.role==='participant')void send({type:'heartbeat'},true);void read();}};
  window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  return()=>{stopped=true;alive.current=false;clearTimeout(timer);clearInterval(heartbeat);activeRequests.forEach(c=>c.abort());activeRequests.clear();window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);};
 },[read,send]);
 const serverTime=useCallback(()=>clock.current!.now(),[]);
 const getSnapshot=useCallback(()=>stateRef.current,[]);
 return {snapshot,connection,feedback,setFeedback,pending,send,serverTime,getSnapshot,reconnect:read};
}
