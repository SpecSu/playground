/** CPU WebAudio boundary: real FarmAudio scheduling, no browser/autoplay or listening claim. */
export class TestAudioParam{
 value=0;cancelScheduledValues(){}setValueAtTime(value:number){this.value=value;}linearRampToValueAtTime(value:number){this.value=value;}exponentialRampToValueAtTime(value:number){this.value=value;}setTargetAtTime(value:number){this.value=value;}
}
export class TestAudioNode{
 gain=new TestAudioParam();frequency=new TestAudioParam();Q=new TestAudioParam();type='';loop=false;buffer:unknown;onended:(()=>void)|null=null;disconnected=false;started=false;stopped=false;stopAt=Infinity;kind:'node'|'oscillator'|'buffer'='node';
 connect(){}disconnect(){this.disconnected=true;}start(){this.started=true;}stop(at?:number){if(at===undefined)this.stopped=true;else this.stopAt=at;}
}
export class TestAudioContext{
 static instances:TestAudioContext[]=[];static holdResume=false;static failResume=false;
 state='suspended';currentTime=0;sampleRate=8000;destination=new TestAudioNode();nodes:TestAudioNode[]=[];sources:TestAudioNode[]=[];closed=0;resumes=0;onstatechange:(()=>void)|null=null;pending:(()=>void)[]=[];
 constructor(){TestAudioContext.instances.push(this);}
 createGain(){const node=new TestAudioNode();this.nodes.push(node);return node;}
 createBiquadFilter(){return this.createGain();}createOscillator(){const node=this.createGain();node.kind='oscillator';this.sources.push(node);return node;}createBufferSource(){const node=this.createGain();node.kind='buffer';this.sources.push(node);return node;}
 createBuffer(_channels:number,length:number){return {getChannelData:()=>new Float32Array(length)};}
 async resume(){this.resumes++;if(TestAudioContext.failResume)throw new Error('device refused');if(TestAudioContext.holdResume)await new Promise<void>(resolve=>this.pending.push(resolve));if(this.state!=='closed'){this.state='running';this.onstatechange?.();}}
 finishResume(){for(const resolve of this.pending.splice(0))resolve();}
 suspendBySystem(){this.state='suspended';this.onstatechange?.();}
 async close(){this.closed++;this.state='closed';}
 advance(seconds:number){this.currentTime+=seconds;for(const node of this.sources)if(!node.stopped&&node.stopAt<=this.currentTime){node.stopped=true;node.onended?.();node.onended=null;}}
 get liveOscillators(){return this.liveSources.filter(node=>node.kind==='oscillator');}
 get liveSources(){return this.sources.filter(node=>node.started&&!node.stopped&&!node.disconnected);}
}
export function installAudioDevice(){
 const old=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
 TestAudioContext.instances=[];TestAudioContext.holdResume=false;TestAudioContext.failResume=false;
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:TestAudioContext});
 return ()=>{if(old)Object.defineProperty(globalThis,'AudioContext',old);else Reflect.deleteProperty(globalThis,'AudioContext');};
}
