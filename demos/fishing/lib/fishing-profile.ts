import {DEFAULT_FISHING_AVATAR_PRESET as DEFAULT_AVATAR_PRESET,resolveFishingAvatarPreset} from './fishing-avatar-catalog.ts';
import {type AvatarPreset} from './room-types.ts';

export type FishingProfile={name:string;preset:AvatarPreset;nameConfirmed:boolean};

/** Match the server's nickname rules without inventing a name for the player. */
export function normalizeFishingNickname(value:unknown):string|null {
 if(typeof value!=='string'||/[\p{Cc}\p{Cf}<>]/u.test(value))return null;
 const name=value.trim();
 return name&&[...name].length<=16?name:null;
}

export function readFishingProfile(raw:string|null):FishingProfile {
 const empty: FishingProfile={name:'',preset:DEFAULT_AVATAR_PRESET,nameConfirmed:false};
 if(!raw)return empty;
 try{
  const saved=JSON.parse(raw);
  if(!saved||typeof saved!=='object')return empty;
  const preset=resolveFishingAvatarPreset(saved.preset);
  const candidate=normalizeFishingNickname(saved.name);
  // Old clients silently supplied this name. Only a new explicit save can
  // distinguish someone who deliberately chose it from that legacy default.
  const name=candidate&&(candidate!=='海风旅人'||saved.nameConfirmed===true)?candidate:'';
  return {name,preset,nameConfirmed:Boolean(name)};
 }catch{return empty;}
}
