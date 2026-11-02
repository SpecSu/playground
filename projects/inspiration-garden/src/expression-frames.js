/** Optional local expression layer; never changes seed identity, economy, or base catalogue art. */
export function desiredExpression(control,now){
 if(!control)return 'base';
 if(control.kind==='puff'){
  if(control.active)return (control.pressure??0)>.25?'inflated':'neutral';
  return now-(control.releasedAt??0)<420?'exhale':'base';
 }
 if(control.kind==='sleep'){
  if(control.active)return control.dreamed||now-control.startedAt>=700?'asleep':control.taps>=2?'grumpy':'awake';
  if(now-(control.releasedAt??0)>900)return 'base';
  return control.dreamed?'asleep':control.taps>=2?'grumpy':'awake';
 }
 return 'base';
}
function weightsAt(transition,now){
 const u=Math.max(0,Math.min(1,(now-transition.at)/transition.duration));if(u>=1)return {[transition.target]:1};
 const weights={};for(const [key,value]of Object.entries(transition.from))if(value*(1-u)>.0001)weights[key]=value*(1-u);
 weights[transition.target]=(weights[transition.target]??0)+u;return weights;
}
export function advanceExpression(previous,target,now){
 let transition=previous??{target,at:now,duration:target==='base'?180:120,from:{base:1}};
 if(transition.target!==target)transition={target,at:now,duration:target==='base'?180:120,from:weightsAt(transition,now)};
 return {...transition,weights:weightsAt(transition,now)};
}
