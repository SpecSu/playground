import * as THREE from 'three';
import {FISHING_AVATAR_CATALOG} from '../../lib/fishing-avatar-catalog.ts';
import {createFishingAvatar} from '../../lib/fishing-avatar.ts';
import {createFishingRod} from '../../lib/fishing-rod.ts';
import {createYachtWorld,FISHING_RENDER_SEATS,disposeObject} from '../../lib/fishing-world.ts';
import {sampleFishingAction} from '../../lib/fishing-action-motion.ts';
import {uploadedAvatar} from './uploaded-avatar.mjs';
import {createFishingRodRailProbe} from './fishing-rod-rail.mjs';

export function fishingRodRailStages(stride=100){
  const stages=[];
  const add=(name,time,state,reducedMotion=false)=>stages.push({name,time,state,reducedMotion});
  for(const phase of ['idle','escaped'])for(const time of [0,730,4050])add(`${phase}-${time}`,time,{phase});
  for(const time of [3000,4070,5050])add(`waiting-${time}`,time,{phase:'waiting',castAt:1000});
  for(const time of [5300,5340,5380])add(`bite-${time}`,time,{phase:'bite',castAt:1000,biteAt:5000});
  for(const ms of new Set([...Array.from({length:Math.floor(1540/stride)+1},(_,i)=>i*stride),120,240,320,520,960,1540]))add(`cast-${ms}`,1000+ms,{phase:'waiting',castAt:1000});
  for(const ms of new Set([...Array.from({length:Math.floor(1019/stride)+1},(_,i)=>i*stride),280,700,1019]))add(`haul-${ms}`,7000+ms,{phase:'holding',catch:{caughtAt:7000}});
  for(const phase of ['idle','escaped','waiting','bite'])add(`reduced-${phase}`,5300,{phase,castAt:1000,biteAt:5000},true);
  return stages;
}

/** Actual uploaded rigs, actual deforming rod and actual created yacht. Outer
 * transforms mirror YachtScene: station translation, heading, uniform scale,
 * yacht parent. All rod-visible haul poses precede showcase movement at 1020 ms.
 * makeAvatar allows a frozen pre-fix solver for reproducible before/after audits. */
export async function auditFishingRodRails({ids=FISHING_AVATAR_CATALOG.map(a=>a.id),slots=FISHING_RENDER_SEATS.map((_,i)=>i),stages=fishingRodRailStages(),clearanceLimit=0,makeAvatar=createFishingAvatar,onAvatar=()=>{},minimumClearance=0,rockTime=0}={}){
  const world=createYachtWorld();world.animate(rockTime);
  const probe=createFishingRodRailProbe(world,{clearanceLimit}),material=new THREE.MeshBasicMaterial(),rod=createFishingRod(material,material),group=new THREE.Group();
  world.yacht.add(group);group.add(rod);const avatars=[],failures=[];let totalSamples=0,minimum=null;
  try{
    for(const id of ids){
      const avatar=makeAvatar(id,'rail-regression',{template:await uploadedAvatar(id)});group.add(avatar.root);
      const report={id,samples:0,crossingSamples:0,lowClearanceSamples:0,minimum:null,phaseFailures:{},slotFailures:{},failures:[]};
      try{
        for(const stage of stages){
          const pose=sampleFishingAction(stage.state,stage.time,stage.reducedMotion);if(!pose.rodVisible)continue;
          for(const slot of slots){
            const seat=FISHING_RENDER_SEATS[slot];if(!seat)throw new Error(`Unknown real fishing station ${slot}`);
            group.position.set(seat.x,seat.y,seat.z);group.rotation.set(0,seat.heading,0);group.scale.set(1,1,1);group.updateMatrixWorld(true);
            avatar.updateFishing(stage.motionTime??stage.time/1000,stage.state.phase,stage.reducedMotion,.352,pose);
            rod.position.copy(avatar.rodPosition);rod.quaternion.copy(avatar.rodQuaternion);rod.updateRestPose(pose.restProgress);
            const result=probe(rod),summary={id,slot,stage:stage.name,action:pose.stage,motionTime:stage.motionTime??stage.time/1000,reducedMotion:stage.reducedMotion,clearance:result.clearance,clearanceCapped:result.clearanceCapped};
            report.samples++;totalSamples++;
            if(result.clearance!==null&&(report.minimum===null||result.clearance<report.minimum.clearance))report.minimum={...summary,nearest:result.nearest};
            if(result.clearance!==null&&(minimum===null||result.clearance<minimum.clearance))minimum={...summary,nearest:result.nearest};
            if(result.crossings.count||result.clearance!==null&&result.clearance<minimumClearance){
              const failure={...summary,count:result.crossings.count,sample:result.crossings.samples[0],grip:avatar.rodPosition.toArray(),quaternion:avatar.rodQuaternion.toArray(),nearest:result.nearest};
              report.failures.push(failure);failures.push(failure);
              if(result.crossings.count)report.crossingSamples++;else report.lowClearanceSamples++;
              report.phaseFailures[pose.stage]=(report.phaseFailures[pose.stage]??0)+1;report.slotFailures[slot]=(report.slotFailures[slot]??0)+1;
            }
          }
        }
      }finally{group.remove(avatar.root);avatar.dispose();}
      avatars.push(report);await onAvatar(report);
    }
    return {method:'Actual GLB wrist solver + production deforming rod + exact world-transformed yacht rail triangles',railMeshes:probe.meshes.length,railTriangles:probe.railTriangles,avatarCount:ids.length,slotCount:slots.length,stages:stages.length,totalSamples,clearanceLimit,minimumClearance,rockTime,minimum,avatars,failures};
  }finally{group.remove(rod);disposeObject(rod);material.dispose();world.dispose();}
}
