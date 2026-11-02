import type {FishingParticipant} from './fishing-types';

export const FISHING_CHAT_MAX_LENGTH=80;
export const FISHING_CHAT_TTL_MS=8000;
export const FISHING_EMOTE_TTL_MS=4000;
export const FISHING_EMOJIS=['😊','🎉','🐟','👏'] as const;
const unsafeControls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const unsafeControlsGlobal=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;
/** Single-line Unicode draft. Never interpret user text as markup. */
export function normalizeFishingChatDraft(text:string){return [...text.replace(unsafeControlsGlobal,'').replace(/\s+/gu,' ')].slice(0,FISHING_CHAT_MAX_LENGTH).join('');}
export function validateFishingChatText(text:unknown):string|null {
 if(typeof text!=='string'||text.length>4000||unsafeControls.test(text)||/[\uD800-\uDFFF]/u.test(text))return null;
 const normalized=text.replace(/\s+/gu,' ').trim();
 return /[^\s\p{Cf}\p{Mn}]/u.test(normalized)&&[...normalized].length<=FISHING_CHAT_MAX_LENGTH?normalized:null;
}
export function shouldSendFishingChatKey(event:{key:string;isComposing?:boolean;keyCode?:number;shiftKey?:boolean},composing:boolean,compositionEndedAt:number,now:number){
 return event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&!composing&&now-compositionEndedAt>250;
}
/** Emoji temporarily takes precedence; a still-live message returns afterward. */
export function fishingSpeech(person:Pick<FishingParticipant,'chat'|'emote'>,now:number){
 if(person.emote&&person.emote.expiresAt>now)return {id:person.emote.id,text:person.emote.emoji,kind:'emote' as const};
 if(person.chat&&person.chat.expiresAt>now)return {id:person.chat.id,text:person.chat.text,kind:'chat' as const};
 return null;
}

export type FishingSpeechAnchor={id:string;x:number;y:number;width:number;height:number;priority:number};
/** Bound speech to the scene, prioritizing the owner and lifting/offsetting crowded peers. */
export function layoutFishingSpeech(anchors:readonly FishingSpeechAnchor[],width:number,top:number,bottom:number){
 const placed:{left:number;right:number;top:number;bottom:number}[]=[];
 return [...anchors].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).map(anchor=>{
  const w=Math.min(anchor.width,width-24),h=anchor.height;
  for(const lift of [0,36,72,108])for(const shift of [0,-64,64]){
   const x=Math.max(12+w/2,Math.min(width-12-w/2,anchor.x+shift)),y=anchor.y-lift;
   const box={left:x-w/2,right:x+w/2,top:y-h,bottom:y};
   if(box.top<top||box.bottom>bottom||placed.some(p=>box.left<p.right+8&&box.right>p.left-8&&box.top<p.bottom+8&&box.bottom>p.top-8))continue;
   placed.push(box);return {id:anchor.id,visible:true,offsetX:x-anchor.x,lift,...box};
  }
  return {id:anchor.id,visible:false,offsetX:0,lift:0,left:0,right:0,top:0,bottom:0};
 });
}
