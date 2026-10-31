import type {CanonicalFarm} from './cloud-contract.ts';
import type {BoardingParent} from './boarding-contract.ts';
import {isAdult,dayKey,MINIMAL_RULES} from './model.ts';
import {isAnimalProviderReady,isAnimalRuntimeActive} from './species.ts';
/** Reversible public identifier only, never authentication. No alias resolution. */
export function encodeFriendCode(uid:string):string{
 if(!/^uid_[a-f0-9]{64}$/.test(uid))throw new Error('Invalid verified UID');
 const bytes=uid.slice(4).match(/../g)!.map(v=>parseInt(v,16));return 'FF1-'+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeFriendCode(value:string):string|null{
 const text=value.trim();if(!/^FF1-[A-Za-z0-9_-]{43}$/.test(text))return null;
 try{const bytes=atob(text.slice(4).replace(/-/g,'+').replace(/_/g,'/')+'=');if(bytes.length!==32)return null;const uid='uid_'+[...bytes].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');return encodeFriendCode(uid)===text?uid:null;}catch{return null;}
}
export function boardingCandidates(farm:CanonicalFarm,now:number,parent?:BoardingParent){
 return farm.state.animals.filter(a=>!a.creative&&!a.resourceSuspended&&!farm.creative?.assets.some(asset=>asset.id===a.id)&&a.id!==farm.state.carriedAnimalId&&a.activity!=='carried'&&isAdult(a,now)&&isAnimalProviderReady(a.species)&&isAnimalRuntimeActive(a)&&a.lastBreedAttemptDay!==dayKey(now)&&(!parent||a.species===parent.species&&a.sex!==parent.sex));
}

/** Presentation only: mirror existing eligibility, never authorize a transaction. */
export function boardingAnimalIssue(farm:CanonicalFarm,animal:import('./model.ts').MinimalAnimal,now:number,parent?:BoardingParent):string|null{
 if(animal.creative||farm.creative?.assets.some(asset=>asset.id===animal.id))return '自定义小伙伴暂不支持配对';
 if(animal.resourceSuspended||!isAnimalProviderReady(animal.species)||!isAnimalRuntimeActive(animal))return '伙伴资源暂不可用';
 if(animal.id===farm.state.carriedAnimalId||animal.activity==='carried')return '请先放下伙伴';
 if(!isAdult(animal,now))return '还未成年';
 if(animal.lastBreedAttemptDay===dayKey(now))return '今天已尝试';
 if(parent&&animal.species!==parent.species)return '需要同物种伙伴';
 if(parent&&animal.sex===parent.sex)return '需要异性伙伴';
 return null;
}
export function boardingTargetIssue(ownUid:string,code:string):string|null{
 if(!code.trim())return '先粘贴好友码';const uid=decodeFriendCode(code);
 if(!uid)return '请粘贴完整好友码，测试名称不能代替';
 return uid===ownUid?'这是你自己的好友码，请换成朋友的':null;
}
export function boardingFarmIssue(farm:CanonicalFarm,now:number,inviting=true):string|null{
 if(farm.activeBoardingId)return '正在寄养，完成或取消后再试';
 if(farm.activeOfferId)return '伙伴正在许愿池托管，请先撤回';
 if(inviting&&farm.state.breedingDay===dayKey(now))return '今日产蛋名额已用，明天再来';
 if(inviting&&farm.state.animals.length+farm.state.eggs.length>=MINIMAL_RULES.maxAnimals)return '牧场空间已满，先留出一格';
 return null;
}
