import '../tests/room-loader.mjs';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditFishingRodRails,fishingRodRailStages} from '../tests/helpers/fishing-rod-rail-audit.mjs';
const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const baseline=value('--baseline',null),output=value('--output','.local-qa/v034/rod-rail-audit.json');
const ids=value('--ids','').split(',').filter(Boolean),slots=value('--slots','').split(',').filter(Boolean).map(Number);
const sourceHashes=Object.fromEntries(['lib/fishing-avatar.ts','lib/fishing-rod.ts','lib/fishing-world.ts','lib/fishing-action-motion.ts','lib/fishing-surface-contact.ts','lib/club-avatar-rig.ts','lib/fishing-avatar-props.ts',...(baseline?[baseline]:[])].map(path=>[path,createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));
const motionOffsets=value('--motion-offsets','').split(',').filter(Boolean).map(Number);
const sampledStages=fishingRodRailStages(Number(value('--stride','100')));
const stages=motionOffsets.length?sampledStages.flatMap(stage=>motionOffsets.map(offset=>({...stage,name:`${stage.name}-motionOffset${offset}`,motionTime:stage.time/1000+offset}))):sampledStages;
const result=await auditFishingRodRails({...(ids.length?{ids}:{}),...(slots.length?{slots}:{}),stages,clearanceLimit:Number(value('--clearance','.1')),minimumClearance:Number(value('--minimum','0')),rockTime:Number(value('--rock-time','0')),
 ...(baseline?{makeAvatar:(await import(pathToFileURL(resolve(baseline)).href)).createFishingAvatar}:{}),
 onAvatar:report=>console.log(JSON.stringify({...report,failures:report.failures.slice(0,2)})),
});
result.sourceHashes=sourceHashes;
mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,...result,avatars:result.avatars.map(({failures,...rest})=>({...rest,failureCount:failures.length})),failures:result.failures.length}));
if(args.includes('--assert')&&result.failures.length)process.exitCode=1;
