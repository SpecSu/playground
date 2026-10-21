/** Offline actual-mesh catch arrival audit. No browser or renderer required.
 * node --experimental-strip-types scripts/audit-fishing-catch-approach.mjs [avatar-id ...] [--json=report.json] [--step=40]
 * Defaults: 12 uploads, four fish, main/upper port/starboard seats, live yacht/water.
 * --holding-seconds=20 also samples 20 seconds after arrival at one-second steps.
 * Surface crossings complement vertex containment/contact tests; sampled frames
 * are not a continuous collision proof. --static-water reproduces the flat-water baseline.
 */
import '../tests/room-loader.mjs';
import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {uploadedAvatar} from '../tests/helpers/uploaded-avatar.mjs';
import {createFishingMeshTriangleReader,createFishingTriangleIntersectionProbe} from '../tests/helpers/fishing-triangle-clearance.mjs';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
import {positionFishingCatchArrival} from '../lib/fishing-catch-motion.ts';
import {createMarineModel,animateMarineModel} from '../components/fishing/MarineModels.ts';
import {FISHING_RENDER_SEATS,catchDisplayScale,createYachtWorld,disposeObject} from '../lib/fishing-world.ts';

const args=process.argv.slice(2),ids=args.filter(arg=>!arg.startsWith('--'));
if(args.includes('--help')){
  console.log('Usage: node --experimental-strip-types scripts/audit-fishing-catch-approach.mjs [avatar-id ...] [--json=report.json] [--step=40] [--holding-seconds=20] [--species=manta-ray] [--sea-time=0] [--static-water]');
  process.exit(0);
}
const option=(name,fallback)=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const step=Number(option('step','40')),seaTime=Number(option('sea-time','0')),holdingSeconds=Number(option('holding-seconds','0'));
const json=option('json',null),speciesFilter=option('species',null),staticWater=args.includes('--static-water');
if(!Number.isFinite(step)||step<=0||step>200||!Number.isFinite(seaTime)||!Number.isInteger(holdingSeconds)||holdingSeconds<0||holdingSeconds>120)throw new Error('Use a positive --step up to 200 ms, finite --sea-time, and integer --holding-seconds from 0 to 120.');
for(const id of ids)if(!FISHING_AVATAR_CATALOG.some(avatar=>avatar.id===id))throw new Error(`Unknown avatar: ${id}`);
const species=[['clownfish',14],['pufferfish',55],['tuna',160],['manta-ray',400]].filter(([id])=>!speciesFilter||id===speciesFilter);
if(!species.length)throw new Error(`Unknown representative species: ${speciesFilter}`);
const files=['lib/fishing-avatar.ts','lib/fishing-surface-contact.ts','lib/fishing-action-motion.ts','lib/fishing-catch-motion.ts','components/fishing/MarineModels.ts','components/fishing/YachtScene.tsx','lib/fishing-world.ts','tests/helpers/fishing-triangle-clearance.mjs'];
const sourceHashes=()=>Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(new URL(`../${path}`,import.meta.url))).digest('hex')]));
const report={stepMs:step,staticWater,seaTime,holdingSeconds,measure:'Bidirectional whole-fish/whole-avatar triangle surface crossings, including hands and merged props',sourceHashes:sourceHashes(),characters:[]};
const world=staticWater?null:createYachtWorld(),water=new THREE.Vector3();
const seatTemplates=[0,1,10,11].map(slot=>({slot,...FISHING_RENDER_SEATS[slot]}));
const times=new Set([1020,1250,1450,1480]);
for(let elapsed=280;elapsed<=1480;elapsed+=step)times.add(elapsed);
for(let second=1;second<=holdingSeconds;second++)times.add(1450+second*1000);
const elapsedTimes=[...times].sort((a,b)=>a-b);
const writeReport=()=>{if(json){mkdirSync(dirname(json),{recursive:true});writeFileSync(json,JSON.stringify(report,null,2));}};
let failingFrames=0,totalFrames=0;
for(const {id}of FISHING_AVATAR_CATALOG){
  if(ids.length&&!ids.includes(id))continue;
  const avatar=createFishingAvatar(id,'catch-approach-audit',{template:await uploadedAvatar(id)});
  const readAvatar=createFishingMeshTriangleReader(avatar.root,{relativeTo:avatar.root}),cases=[];
  for(const [speciesId,cm]of species){
    const fish=createMarineModel(speciesId,cm),scale=catchDisplayScale(cm);fish.scale.setScalar(scale);
    const size=avatar.prepareCatch(fish),readFish=createFishingMeshTriangleReader(fish);
    const seats=seatTemplates.map(seat=>{const group=new THREE.Group();group.position.set(seat.x,seat.y,seat.z);group.rotation.y=seat.heading;world?.yacht.add(group);return {...seat,group};});
    let previousElapsed=280-step;
    for(const elapsed of elapsedTimes){
      const now=1000+elapsed,time=now/1000+seaTime,dt=Math.min(.1,(elapsed-previousElapsed)/1000),moving=1-Math.exp(-dt*5);previousElapsed=elapsed;
      const pose=sampleFishingAction({phase:'holding',catch:{caughtAt:1000}},now);
      avatar.updateFishing(time,'holding',false,scale*1.6,pose,undefined,size);
      const contact=avatar.positionCatch(new THREE.Vector3(),size);
      const probe=createFishingTriangleIntersectionProbe(readAvatar(),{sampleLimit:3});
      animateMarineModel(fish,time,pose.haulProgress);
      world?.animate(time,false);
      for(const seat of seats){
        const side=Math.sign(seat.x),targetX=THREE.MathUtils.lerp(seat.x,side*1.5,pose.showcaseProgress),facing=THREE.MathUtils.lerp(seat.heading,0,pose.showcaseProgress);
        seat.group.position.x+=(targetX-seat.group.position.x)*moving;
        seat.group.rotation.y+=Math.atan2(Math.sin(facing-seat.group.rotation.y),Math.cos(facing-seat.group.rotation.y))*moving;
        if(world){
          water.set(seat.x+side*4.2,0,seat.z+.7);world.yacht.localToWorld(water);
          water.y=world.waterHeightAt(water.x,water.z,time,false)+.085;
          seat.group.worldToLocal(water);
        }else{
          water.set(seat.x+side*4.2-seat.group.position.x,.085-seat.y,.7).applyAxisAngle(THREE.Object3D.DEFAULT_UP,-seat.group.rotation.y);
        }
        positionFishingCatchArrival(fish.position,water,contact,size,pose.haulProgress,avatar.catchApproachDirection);
        const result=probe(readFish());
        cases.push({species:speciesId,cm,elapsed,slot:seat.slot,deck:seat.y,side,haulProgress:pose.haulProgress,showcaseProgress:pose.showcaseProgress,position:fish.position.toArray(),crossings:result.count,samples:result.samples});
      }
    }
    for(const seat of seats)seat.group.removeFromParent();
    disposeObject(fish);
  }
  const failures=cases.filter(frame=>frame.crossings);
  failingFrames+=failures.length;totalFrames+=cases.length;
  report.characters.push({id,cases});writeReport();
  console.log(JSON.stringify({id,frames:cases.length,failingFrames:failures.length,maxCrossings:Math.max(0,...failures.map(frame=>frame.crossings)),firstFailures:failures.slice(0,8)}));
  avatar.dispose();
}
world?.dispose();
report.finalSourceHashes=sourceHashes();
report.changedSourceFiles=files.filter(path=>report.sourceHashes[path]!==report.finalSourceHashes[path]);
report.summary={characters:report.characters.length,frames:totalFrames,failingFrames,changedSourceFiles:report.changedSourceFiles};writeReport();
console.log(JSON.stringify(report.summary));
if(failingFrames)process.exitCode=1;
else if(report.changedSourceFiles.length)process.exitCode=2;
