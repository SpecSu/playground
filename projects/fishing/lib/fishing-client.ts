import type { FishingCommand,FishingInput,FishingSnapshot } from './fishing-types';
export function acceptFishingSnapshot(current:FishingSnapshot|null,incoming:FishingSnapshot):boolean {
 return !current || incoming.self.id!==current.self.id || incoming.revision>=current.revision && incoming.self.lastSequence>=current.self.lastSequence && (incoming.revision>current.revision||incoming.serverNow>=current.serverNow);
}
export class FishingTransport {
 snapshot:FishingSnapshot|null=null;
 clockOffsetMs=0;
 private pending:FishingCommand|null=null;
 private fetcher:typeof fetch;
 private reelIntent:{id:string;castId:string;sequence:number}|null=null;
 private seenCatches=new Set<string>();
 private castIntent:{id:string;previousCastId?:string;sequence:number}|null=null;
 private onCast?: (castId:string)=>void;
 private onCatch?: (catchId:string)=>void;
 private sending:Promise<FishingSnapshot>|null=null;
 constructor(fetcher?:typeof fetch,onCatch?:(catchId:string)=>void,onCast?:(castId:string)=>void){this.fetcher=fetcher??globalThis.fetch.bind(globalThis);this.onCatch=onCatch;this.onCast=onCast;}
 get hasPending(){return !!this.pending;}
 receive(snapshot:FishingSnapshot,startedAt?:number,receivedAt?:number){
  if(acceptFishingSnapshot(this.snapshot,snapshot)){
   const freshClock=!this.snapshot||this.snapshot.self.id!==snapshot.self.id||snapshot.serverNow>this.snapshot.serverNow;
   if(freshClock&&startedAt!==undefined&&receivedAt!==undefined)this.clockOffsetMs=snapshot.serverNow-(startedAt+receivedAt)/2;
   this.snapshot=snapshot;
   const own=snapshot.self, caught=own.fishing?.phase==='holding'?own.fishing.catch:undefined, intent=this.reelIntent;
   const castIntent=this.castIntent, castId=own.fishing?.castId;
   if(castIntent&&own.id===castIntent.id&&own.role==='participant'&&own.lastSequence>=castIntent.sequence&&own.fishing?.phase==='waiting'&&castId&&castId!==castIntent.previousCastId){
    this.castIntent=null;try{this.onCast?.(castId);}catch{/* Sound cannot break room state. */}
   }
   if(castIntent&&(own.id!==castIntent.id||own.lastSequence>=castIntent.sequence))this.castIntent=null;
   if(caught){
    const fresh=!this.seenCatches.has(caught.id);this.seenCatches.add(caught.id);
    if(this.seenCatches.size>128)this.seenCatches.delete(this.seenCatches.values().next().value!);
    if(fresh&&intent&&own.id===intent.id&&own.role==='participant'&&own.lastSequence>=intent.sequence&&(!own.fishing.castId||own.fishing.castId===intent.castId)){
     this.reelIntent=null;try{this.onCatch?.(caught.id);}catch{/* Audio cannot break room state. */}
    }
   }
   if(intent&&(own.id!==intent.id||own.fishing?.castId!==intent.castId))this.reelIntent=null;
  }
  return this.snapshot!;
 }
 async refresh(){const startedAt=Date.now();const response=await this.fetcher('/api/fishing?room=ocean',{credentials:'same-origin',cache:'no-store'});const data=await response.json() as FishingSnapshot & {error?:{message?:string};snapshot?:FishingSnapshot};if(!response.ok)throw new Error(data.error?.message??'连接暂时中断');return this.receive(data,startedAt,Date.now());}
 send(input:FishingInput):Promise<FishingSnapshot>{
  if(this.sending)return this.sending;
  if(!this.snapshot)return Promise.reject(new Error('先连接游艇，再开始钓鱼。'));
  if(!this.pending){
   this.pending={...input,roomId:'ocean',sequence:this.snapshot.self.lastSequence+1,requestId:crypto.randomUUID()};
   const own=this.snapshot.self;
   this.castIntent=input.type==='cast'&&own.role==='participant'?{id:own.id,previousCastId:own.fishing?.castId,sequence:this.pending.sequence}:null;
   this.reelIntent=input.type==='reel'&&own.role==='participant'&&own.fishing?.castId&&(own.fishing.phase==='bite'||own.fishing.phase==='waiting')?{id:own.id,castId:own.fishing.castId,sequence:this.pending.sequence}:null;
  }
  const command=this.pending;
  this.sending=(async()=>{const startedAt=Date.now();const response=await this.fetcher('/api/fishing',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(command)});const data=await response.json() as FishingSnapshot & {error?:{message?:string};snapshot?:FishingSnapshot};if(!response.ok){const retryCast=this.castIntent;this.castIntent=null;if(data.snapshot)this.receive(data.snapshot,startedAt,Date.now());if(response.status<500&&response.status!==429){this.pending=null;this.reelIntent=null;}else this.castIntent=retryCast;throw new Error(data.error?.message??'海上信号有点弱，请重试。');}this.pending=null;return this.receive(data,startedAt,Date.now());})().finally(()=>{this.sending=null;});
  return this.sending;
 }
}
