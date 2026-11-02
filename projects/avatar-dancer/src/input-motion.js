import * as THREE from 'three';
import {createDanceFlow} from './dance-flow.js';
import {createAftershowPoses} from './aftershow-rig.js';

// Samples authored local bone tracks, never changes cached geometry or the model transform.
export function createInputMotionController(model, clips, options = {}) {
  const bones=[];model.traverse(n=>{if(n.isBone)bones.push(n)});
  const base=bones.map(n=>({p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()}));
  const copy=pose=>pose.map(n=>({p:n.p.clone(),q:n.q.clone(),s:n.s.clone()}));
  const apply=pose=>bones.forEach((n,i)=>{n.position.copy(pose[i].p);n.quaternion.copy(pose[i].q);n.scale.copy(pose[i].s)});
  const bindings=clips.map(clip=>clip.tracks.map(track=>{
    const parsed=THREE.PropertyBinding.parseTrackName(track.name), node=THREE.PropertyBinding.findNode(model,parsed.nodeName), index=bones.indexOf(node);
    return {index,property:{position:'p',quaternion:'q',scale:'s'}[parsed.propertyName],sample:track.createInterpolant()};
  }).filter(b=>b.index>=0&&b.property));
  function sample(index,time,out) {
    for(let i=0;i<bones.length;i++){out[i].p.copy(base[i].p);out[i].q.copy(base[i].q);out[i].s.copy(base[i].s)}
    for(const b of bindings[index]||[])out[b.index][b.property].fromArray(b.sample.evaluate(Math.max(0,Math.min(time,clips[index].duration))));
    return out;
  }
  const find=suffix=>bones.find(n=>n.name.endsWith(suffix));
  const hips=find('Hips'),head=find('Head'),left=find('LeftHand'),right=find('RightHand'),ls=find('LeftShoulder'),rs=find('RightShoulder'),lf=find('LeftFoot'),rf=find('RightFoot');
  // Presentation idle is deliberately separate from input-gated gameplay. Move
  // only the upper body; the authored ready stance and feet remain untouched.
  const idleSpine=bones.indexOf(find('Spine2')||find('Spine1')||find('Spine'));
  const idleLowerSpine=bones.indexOf(find('Spine'));
  const idleHead=bones.indexOf(find('Neck')||head);
  const idleShoulders=[bones.indexOf(ls),bones.indexOf(rs)];
  const idleArms=[bones.indexOf(find('LeftArm')),bones.indexOf(find('RightArm'))];
  const idleForearms=[bones.indexOf(find('LeftForeArm')),bones.indexOf(find('RightForeArm'))];
  const idleWrist=bones.indexOf(right);
  const idleRotation=new THREE.Quaternion(),idleEuler=new THREE.Euler();
  const world=n=>n?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3();
  const scratch=copy(base), candidates=[];
  for(let clip=0;clip<clips.length;clip++)for(let time=0;time<clips[clip].duration-.15;time+=.125){
    apply(sample(clip,time,scratch));model.updateWorldMatrix(true,true);
    const h=world(hips),a=world(left),b=world(right),top=world(head),f=world(lf),g=world(rf),shoulder=(world(ls).y+world(rs).y)/2;
    const handX=(a.x+b.x)/2-h.x,handY=(a.y+b.y)/2-h.y,headAboveHips=top.y-h.y;
    const readyScore=handY*2+Math.abs(a.x-b.x)*.35+Math.abs(f.y-g.y)*5-headAboveHips*3+Math.abs(top.x-h.x)*2;
    candidates.push({clip,time,handX,handY,headAboveHips,standingHeight:top.y-Math.min(f.y,g.y),handsBelowShoulders:Math.max(a.y,b.y)<shoulder+.02,readyScore,hipQ:hips?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion()});
  }
  // Existing assets have no idle clip. Choose a low-hands, upright, level-feet authored stance.
  const calm=candidates.filter(c=>c.handsBelowShoulders&&c.headAboveHips>.4);
  let rest=(calm.length?calm:candidates).sort((a,b)=>a.readyScore-b.readyScore)[0];
  // Opt-in per-character rest; an invalid descriptor fails closed to the
  // existing automatic choice. No named character or global pose change here.
  const resolvePose=ref=>{
    const clip=clips.findIndex(c=>typeof ref?.clip==='string'&&c.name===ref.clip);
    return clip>=0&&Number.isFinite(ref?.time)&&ref.time>=0&&ref.time<=clips[clip].duration?{clip,time:ref.time}:null;
  };
  const requested=options?.restPose,bodyPose=resolvePose(requested),armPose=resolvePose(requested?.arms);
  const bindPose=requested?.bind===true&&requested.clip===undefined&&requested.time===undefined&&requested.arms===undefined;
  const configured=bindPose||(requested?.bind!==true&&!!bodyPose&&(requested.arms===undefined||!!armPose));
  if(configured)rest=bindPose?{clip:-1,time:0,source:'bind'}:{...rest,...bodyPose};
  const ready=bindPose?copy(base):rest?copy(sample(rest.clip,rest.time,scratch)):copy(base);
  if(configured){
    if(armPose){
      sample(armPose.clip,armPose.time,scratch);
      bones.forEach((bone,index)=>{if(/(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)/.test(bone.name))ready[index].q.copy(scratch[index].q)});
    }
    // Retain ALL positions/scales from the chosen full-body pose, including
    // corrected candidate bone lengths. Only arm local quaternions are layered.
    apply(ready);model.updateWorldMatrix(true,true);
    rest={...rest,configured:true,hipQ:hips?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion(),headAboveHips:world(head).y-world(hips).y,handsBelowShoulders:Math.max(world(left).y,world(right).y)<(world(ls).y+world(rs).y)/2+.02};
  }
  // Build a relaxed bent-elbow welcome in world space, then retain only local
  // arm rotations. This is independent of exporter bone axes and never moves
  // the pelvis, legs or neck. The wrist stays near shoulder height, not overhead.
  const greeting=copy(ready),upperArm=find('RightArm'),forearm=find('RightForeArm');
  apply(ready);model.updateWorldMatrix(true,true);
  const side=world(rs).sub(world(ls));side.y=0;side.normalize();
  function aimArm(bone,child,direction){
    if(!bone||!child)return;
    model.updateWorldMatrix(true,true);
    const from=world(child).sub(world(bone)).normalize();
    const rotation=new THREE.Quaternion().setFromUnitVectors(from,direction.clone().normalize());
    const q=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(rotation);
    const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(q));model.updateWorldMatrix(true,true);
  }
  aimArm(upperArm,forearm,side.clone().multiplyScalar(.6).add(new THREE.Vector3(0,-.8,0)));
  aimArm(forearm,right,side.clone().multiplyScalar(.1).add(new THREE.Vector3(0,.995,0)));
  const greetingBones=[['RightArm',1.15],['RightForeArm',2.2]].map(([name,limit])=>{
    const index=bones.indexOf(find(name));
    if(index>=0){const angle=ready[index].q.angleTo(bones[index].quaternion);greeting[index].q.slerp(bones[index].quaternion,Math.min(1,limit/Math.max(angle,1e-8)));}
    return index;
  });
  apply(ready);
  const aftershowPoses=createAftershowPoses(model,bones,ready);
  let aftershow=null;
  const phraseQuaternion=new THREE.Quaternion();
  const flow=createDanceFlow(clips);
  let current=copy(ready),target=copy(ready),outgoing=copy(ready),mode='lobby',pausedFrom='lobby';
  let now=0,lobbyTime=0,settleAt=-Infinity,phraseSerial=0;
  apply(ready);
  function hit(lane,rating='perfect',detail={}){return flow.hit(lane,rating,detail)}
  function update(delta,audioTime){
    if(mode==='paused')return;
    const dt=Math.max(0,Math.min(Number.isFinite(delta)?delta:0,.08));now+=dt;
    const state=flow.update(dt,audioTime);
    for(let i=0;i<bones.length;i++){target[i].p.copy(ready[i].p);target[i].q.copy(ready[i].q);target[i].s.copy(ready[i].s)}
    if(mode==='playing'&&state.active&&state.clipIndex>=0){
      if(state.phraseSerial!==phraseSerial){outgoing=copy(current);phraseSerial=state.phraseSerial;}
      sample(state.clipIndex,state.clipTime,scratch);
      for(let i=0;i<bones.length;i++){
        // Crossfade whole phrases. The source clip's root/hip rotations remain
        // intact, so full turns are not filtered to same-facing fragments.
        if(state.transition<1){scratch[i].p.lerpVectors(outgoing[i].p,scratch[i].p,state.transition);phraseQuaternion.copy(scratch[i].q);scratch[i].q.copy(outgoing[i].q).slerp(phraseQuaternion,state.transition);scratch[i].s.lerpVectors(outgoing[i].s,scratch[i].s,state.transition);}
        target[i].p.lerp(scratch[i].p,state.weight);target[i].q.slerp(scratch[i].q,state.weight);target[i].s.lerp(scratch[i].s,state.weight);
      }
    }
    // Rare, small upper-body hesitation on an engaged miss. It overlays the
    // advancing phrase, never rotates hips/feet or replaces the choreography.
    if(mode==='playing'&&state.hesitation>0){
      const amount=state.hesitation;
      const add=(index,x,y,z)=>{if(index>=0)target[index].q.multiply(idleRotation.setFromEuler(idleEuler.set(x*amount,y*amount,z*amount))).normalize()};
      add(idleSpine,.075,0,.055);add(idleHead,-.025,0,-.025);
      idleShoulders.forEach((index,side)=>add(index,.025,0,(side?1:-1)*.045));
    }
    if(mode==='lobby'){
      lobbyTime+=dt;
      const breath=Math.sin(lobbyTime*1.5),sway=Math.sin(lobbyTime*.72);
      const tilt=(index,x,y,z)=>{if(index>=0)target[index].q.multiply(idleRotation.setFromEuler(idleEuler.set(x,y,z))).normalize()};
      if(idleLowerSpine!==idleSpine)tilt(idleLowerSpine,.012*breath,0,.055*sway);
      tilt(idleSpine,.025*breath,.025*Math.sin(lobbyTime*.54),.065*sway);
      tilt(idleHead,0,.025*Math.sin(lobbyTime*.61),-.018*sway);
      idleShoulders.forEach((index,side)=>tilt(index,0,0,(side?1:-1)*.035*breath));
      idleArms.forEach((index,side)=>tilt(index,.07*Math.sin(lobbyTime*.83+side),0,(side?1:-1)*.055*sway));
      idleForearms.forEach((index,side)=>tilt(index,.04*Math.sin(lobbyTime*.83+side),0,0));
      // A brief welcome every fourteen seconds, with a slow raised/lowered arm.
      const cycle=lobbyTime%14,edge=Math.max(0,Math.min(1,(cycle-2.2)/1.05,(6-cycle)/1.15));
      const wave=edge*edge*(3-2*edge)*.9;
      for(const index of greetingBones)if(index>=0)target[index].q.slerp(greeting[index].q,wave);
      tilt(idleWrist,0,0,wave*.18*Math.sin((cycle-2.2)*7));
    }
    if(mode==='results'&&aftershow?.enabled){
      for(let i=0;i<bones.length;i++){target[i].q.slerp(aftershowPoses.look[i].q,aftershow.gaze);target[i].q.slerp(aftershowPoses.gesture[i].q,aftershow.gesture)}
    }
    const blend=1-Math.exp(-dt*(mode==='lobby'?5:state.active?24:10));
    for(let i=0;i<bones.length;i++){
      current[i].p.lerp(target[i].p,blend);
      const angle=current[i].q.angleTo(target[i].q);
      current[i].q.slerp(target[i].q,Math.min(blend,dt*(mode==='lobby'?1.8:7.5)/Math.max(angle,1e-8))).normalize();
      current[i].s.lerp(target[i].s,blend);
    }
    if(mode!=='lobby'&&!(mode==='results'&&aftershow?.enabled)&&!state.active&&now>settleAt+.95&&state.restAge>.75){for(let i=0;i<bones.length;i++){current[i].p.copy(ready[i].p);current[i].q.copy(ready[i].q);current[i].s.copy(ready[i].s)}}
    apply(current);
  }
  return {hit,update,setAftershow:value=>{aftershow=value},setBPM:value=>flow.setBPM(value),
    setMode(value){
      const previous=mode;mode=value;flow.setMode(value);
      if(value==='paused'){pausedFrom=previous;return;}
      if(value==='playing'&&(previous!=='paused'||pausedFrom!=='playing')){if(previous==='results'){current=copy(ready);apply(current);aftershow=null;}settleAt=now;phraseSerial=0;outgoing=copy(current);}
      else if(value!=='playing'){settleAt=now;if(value==='lobby'&&previous!=='lobby')lobbyTime=0;}
    },
    dispose(){bindings.length=0;},
    getDiagnostics(){const state=flow.getState();return {...state,aftershow:aftershowPoses.diagnostics,mode,state:mode==='paused'?'paused':mode==='lobby'?'idle':state.state,greeting:{style:'relaxed-bent-elbow',period:14},ready:rest&&{clip:clips[rest.clip]?.name??null,time:rest.time,source:rest.source||'clip',configured:!!rest.configured,handsBelowShoulders:rest.handsBelowShoulders,headAboveHips:rest.headAboveHips},phrases:clips.map(c=>c.name)};},
  };
}
