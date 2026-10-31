import type {FriendCard} from './sample-farms.ts';
/** User-supplied display name/avatar; deliberately NOT a linked account or UID.
 * Kept outside sampleFarm because this scene owns a separate larger world. */
export type SchoolFriendCard=Omit<FriendCard,'themeId'|'avatar'|'identityStatus'>&{themeId:'school';avatar:string;identityStatus:'unlinked-account'};
export const SCHOOL_PLAYGROUND_FRIEND:SchoolFriendCard=Object.freeze({target:Object.freeze({kind:'sample' as const,sampleId:'school-playground'}),name:'咕咕',farmName:'校园操场',avatar:'/assets/friends/gugu.png',badge:'示例' as const,identityStatus:'unlinked-account' as const,themeId:'school' as const,today:0,week:0,theme:'大操场 · 两列四排 · 豆包慢跑队',accent:'#668b72'});
