export class AudioTransport {
  constructor(){this.context=null;this.buffer=null;this.source=null;this.offset=0;this.started=0;this.playing=false;this.muted=false;this.loadGeneration=0;this.loading=false;this.playGeneration=0;this.active=true;this.unlocked=false;this.lobbyWanted=true;this.lobbySource=null;this.lobbyBuffer=null;this.lobbyLoad=null;this.retiringLobby=new Set();}
  async init(){if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=this.muted?0:.75;this.gain.connect(this.context.destination);}await this.context.resume();}
  // Only called by an input gesture. Loading/decode alone never unlocks ambience.
  async unlock(){if(!this.active)return;await this.init();this.unlocked=true;await this._prepareLobby();this._syncLobby();}
  async _prepareLobby(){
    if(this.lobbyBuffer)return;
    // Independent ownership: preparation music never changes the gameplay buffer,
    // import generations, playback offset or pending dance-track decode.
    if(!this.lobbyLoad)this.lobbyLoad=(async()=>{
      const response=await fetch('/assets/audio/lobby-tech-house.mp3');
      if(!response.ok)throw new Error('准备音乐暂时无法加载');
      const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      this.lobbyBuffer=buffer;
    })().finally(()=>{this.lobbyLoad=null;});
    return this.lobbyLoad;
  }
  setLobby(value){this.lobbyWanted=value;this._syncLobby();}
  setActive(value){this.active=value;if(!value){this.pause();this._stopLobby();}else this._syncLobby();}
  _stopLobby(fade=0){
    if(!fade){for(const source of this.retiringLobby){source.stop();source.disconnect();}this.retiringLobby.clear();}
    const source=this.lobbySource;if(!source)return;
    const gain=this.lobbyGain,now=this.context.currentTime;
    this.lobbySource=null;this.lobbyGain=null;
    if(fade){gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+fade);this.retiringLobby.add(source);source.onended=()=>{source.disconnect();gain.disconnect();this.retiringLobby.delete(source);};source.stop(now+fade);}
    else{source.stop();source.disconnect();gain.disconnect();}
  }
  _syncLobby(){
    if(!this.lobbyWanted||!this.active||this.playing){this._stopLobby(this.active ? .3 : 0);return;}
    if(!this.unlocked||!this.context||!this.lobbyBuffer||this.lobbySource)return;
    this._stopLobby();
    const source=this.context.createBufferSource(),gain=this.context.createGain(),now=this.context.currentTime;
    source.buffer=this.lobbyBuffer;source.loop=true;source.connect(gain);gain.connect(this.gain);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.36,now+1.2);
    this.lobbySource=source;this.lobbyGain=gain;source.start();
  }
  cancelLoad(){this.loadGeneration++;this.loading=false;}
  async _decodeOwned(bytes,generation,options={}){
    if(generation!==this.loadGeneration)return null;
    const buffer=await this.context.decodeAudioData(bytes.slice(0));
    if(generation!==this.loadGeneration)return null;
    if(options.minDuration&&buffer.duration<options.minDuration)throw new Error(`请选择至少 ${options.minDuration} 秒的音频`);
    this.stop();this.buffer=buffer;return buffer;
  }
  async load(url){
    const generation=++this.loadGeneration;this.loading=true;
    try{await this.init();if(generation!==this.loadGeneration)return null;const r=await fetch(url);if(generation!==this.loadGeneration)return null;if(!r.ok)throw new Error('音乐加载失败');const bytes=await r.arrayBuffer();return await this._decodeOwned(bytes,generation);}
    finally{if(generation===this.loadGeneration)this.loading=false;}
  }
  async decode(bytes,options={}){
    const generation=++this.loadGeneration;this.loading=true;
    try{await this.init();return await this._decodeOwned(bytes,generation,options);}
    finally{if(generation===this.loadGeneration)this.loading=false;}
  }
  get time(){return this.offset+(this.playing?this.context.currentTime-this.started:0);}
  get duration(){return this.buffer?.duration||0;}
  async play(){
    if(this.loading||!this.active)return false;const generation=this.playGeneration,loadGeneration=this.loadGeneration;
    await this.init();if(!this.active||this.loading||generation!==this.playGeneration||loadGeneration!==this.loadGeneration||!this.buffer)return false;
    if(this.playing)return true;
    this.lobbyWanted=false;this._stopLobby(.3);
    this.source=this.context.createBufferSource();this.source.buffer=this.buffer;this.source.connect(this.gain);this.started=this.context.currentTime;this.playing=true;this.source.start(0,Math.min(this.offset,this.duration));return true;
  }
  pause(){this.playGeneration++;if(!this.playing)return;this.offset=this.time;this.playing=false;this.source?.stop();this.source?.disconnect();this.source=null;}
  stop(){this.pause();this.offset=0;}
  mute(value){this.muted=value;if(this.gain)this.gain.gain.setTargetAtTime(value?0:.75,this.context.currentTime,.04);}
  tap(lane,rating){if(!this.context||this.muted||rating==='miss')return;const now=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();o.type='sine';o.frequency.setValueAtTime([523.25,659.25,783.99,1046.5][lane],now);g.gain.setValueAtTime(.035,now);g.gain.exponentialRampToValueAtTime(.0001,now+.09);o.connect(g);g.connect(this.gain);o.start(now);o.stop(now+.1);}
}

// Hand-authored phrases alternate traversals, syncopation, holds and breath.
export function makeChart(bpm=120,duration=72,offset=0){
  const beat=60/bpm,patterns=[[0,1,2,3,2,1,0,3],[0,2,1,3,0,1,3,2],[1,1,3,2,0,2,3,0],[3,2,0,1,2,0,1,3]];const notes=[];
  for(let bar=2;bar*4*beat+offset<duration-3;bar++){
    const phrase=patterns[Math.floor(bar/4)%patterns.length],energetic=bar>=6&&bar%16<12;
    for(let step=0;step<4;step++){const time=offset+(bar*4+step)*beat;if(time>=duration-2)continue;notes.push({time,lane:phrase[(bar*4+step)%8]});if(energetic&&(bar%4===3||step===2)&&bar%3===0)notes.push({time:time+beat/2,lane:phrase[(bar*4+step+3)%8]});}
  }return notes;
}

export function estimateTempo(buffer){
  const data=buffer.getChannelData(0),rate=buffer.sampleRate,hop=Math.round(rate/100),n=Math.min(Math.floor(data.length/hop),9000),energy=new Float32Array(n),onset=new Float32Array(n);
  for(let i=0;i<n;i++){let sum=0;for(let j=0;j<hop;j+=4){const v=data[i*hop+j]||0;sum+=v*v;}energy[i]=Math.sqrt(sum/(hop/4));onset[i]=Math.max(0,energy[i]-(energy[i-1]||0));}
  let best=128,score=-Infinity;for(let bpm=85;bpm<=165;bpm++){const lag=Math.round(6000/bpm);let s=0;for(let i=lag;i<n;i++)s+=onset[i]*onset[i-lag];if(s>score){score=s;best=bpm;}}
  const period=6000/best;let phase=0,phaseScore=-1;for(let offset=0;offset<period;offset++){let s=0;for(let i=offset;i<n;i+=period)s+=onset[Math.round(i)]||0;if(s>phaseScore){phaseScore=s;phase=offset;}}
  return {bpm:best,offset:phase/100};
}
