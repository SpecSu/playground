const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t)};
export function createAftershow(onEvent=()=>{}){
 let mode='lobby',time=0,runId=0,emitted=false,reduced=false;
 function getState(){const enabled=mode==='results';return {enabled,time,runId,reduced,turn:!enabled||reduced?0:(time<1.3?120*smooth((time-.4)/.9):120-85*smooth((time-1.3)/.9))*Math.PI/180,gaze:enabled&&!reduced?smooth((time-.9)/.8):0,gesture:enabled&&!reduced?smooth((time-1.9)/.6)*(1-smooth((time-3.1)/.7)):0,wiggle:enabled&&!reduced?Math.sin((time-2.3)*12)*.09:0};}
 return {getState,setMode(value){if(value==='results'&&mode!=='results'){time=0;runId++;emitted=false}mode=value;},setReducedMotion(value){reduced=!!value;if(reduced)emitted=true;},update(delta,{active=true}={}){if(mode==='results'&&active){time=Math.min(8,time+Math.max(0,Math.min(.08,Number.isFinite(delta)?delta:0)));if(!reduced&&!emitted&&time>=1.05){emitted=true;onEvent({type:'popcorn',runId})}}return getState();}};
}
