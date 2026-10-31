import {applyCommand,createFarm,snapshot,type Farm,type Command,type Snapshot,type FarmEvent} from '../src/model.ts';
export type Reply={accepted:boolean;message:string;event?:FarmEvent;duplicate:boolean;snapshot:Snapshot};
type Receipt=Omit<Reply,'duplicate'|'snapshot'>;
/** D1 owns the same rule engine as the local adapter; CAS plus receipt insertion is one batch transaction. */
export class FarmD1Store {
 private db:D1Database;constructor(db:D1Database){this.db=db;}
 private async load(device:string,now:number):Promise<Farm>{
   let row=await this.db.prepare('SELECT state FROM farm_states WHERE device=?').bind(device).first<{state:string}>();
   if(!row){const s=createFarm(device,now);await this.db.prepare('INSERT OR IGNORE INTO farm_states(device,state,revision,last_command) VALUES(?,?,0,?)').bind(device,JSON.stringify(s),'').run();row=await this.db.prepare('SELECT state FROM farm_states WHERE device=?').bind(device).first<{state:string}>();}
   if(!row)throw new Error('Farm storage is unavailable');return JSON.parse(row.state) as Farm;
 }
 async get(device:string,now:number):Promise<Snapshot>{return {...snapshot(await this.load(device,now),now),storage:'cloud-d1'};}
 async command(device:string,c:Command,now:number):Promise<Reply>{
   for(let attempt=0;attempt<5;attempt++){
    const prior=await this.db.prepare('SELECT receipt FROM farm_commands WHERE device=? AND id=?').bind(device,c.id).first<{receipt:string}>();
    if(prior)return {...JSON.parse(prior.receipt) as Receipt,duplicate:true,snapshot:await this.get(device,now)};
    const state=await this.load(device,now);const r=applyCommand(state,c,now);const receipt:Receipt={accepted:r.accepted,message:r.message,...(r.event?{event:r.event}:{})};
    // Rejections also advance the storage revision, ensuring their receipt is atomic and retryable.
    const next={...r.state,revision:state.revision+1};
    const results=await this.db.batch([
     this.db.prepare('UPDATE farm_states SET state=?, revision=?, last_command=? WHERE device=? AND revision=? AND NOT EXISTS(SELECT 1 FROM farm_commands WHERE device=? AND id=?)').bind(JSON.stringify(next),next.revision,c.id,device,state.revision,device,c.id),
     this.db.prepare('INSERT OR IGNORE INTO farm_commands(device,id,receipt) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM farm_states WHERE device=? AND revision=? AND last_command=?)').bind(device,c.id,JSON.stringify(receipt),device,next.revision,c.id)
    ]);
    if(results[0].meta.changes>0)return {...receipt,duplicate:false,snapshot:await this.get(device,now)};
   }
   throw new Error('Farm is busy; retry the same command');
 }
}
