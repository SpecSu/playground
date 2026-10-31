import type {CanonicalFarm,MinimalView} from '../../src/minimal/cloud-contract.ts';
import type {FarmAccount} from '../../src/minimal/account-contract.ts';
type TestResponse={account:FarmAccount;view:MinimalView;farm:CanonicalFarm;accepted:boolean;message:string;code:string};
import {spawn,type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Run={stop:()=>Promise<void>;logs:()=>string};
export async function startLocal(entryPath:string,database:string,legacy:string,dist:string,extra:Record<string,string>={}):Promise<Run>{
 const child:ChildProcess=spawn(process.execPath,['--experimental-strip-types',entryPath],{cwd:root,env:{...process.env,FARM_NAMED_DEMO:'1',FARM_NAMED_REQUIRE_MODELS:'1',FARM_DEMO_DB:database,FARM_DB:legacy,FARM_DIST:dist,PORT:'5190',...extra},stdio:['ignore','pipe','pipe']});let output='';child.stdout!.on('data',v=>output+=v);child.stderr!.on('data',v=>output+=v);
 for(let i=0;i<100;i++){if(output.includes('http://127.0.0.1:5190'))return {logs:()=>output,stop:async()=>{if(child.exitCode!==null)return;child.kill('SIGTERM');await new Promise<void>((done,fail)=>{child.once('exit',()=>done());setTimeout(()=>{if(child.exitCode===null){child.kill('SIGKILL');fail(new Error('Node service did not stop'));}},3000).unref();});}};if(child.exitCode!==null)throw new Error(output);await wait(30);}child.kill();throw new Error('Local service startup timeout: '+output);
}
export async function api(path:string,body?:unknown,headers:Record<string,string>={}){const response=await fetch('http://127.0.0.1:5190/api/minimal/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as TestResponse};}
