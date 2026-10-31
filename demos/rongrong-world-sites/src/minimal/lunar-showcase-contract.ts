/** A separate presentation identity: these are neither Species nor MinimalAnimal. */
export const LUNAR_SHOWCASE_IDS=['yellow-long-ear','kunkun-chicken','red-scarf-person','pink-sheep','floral-vest-person'] as const;
export type LunarShowcaseId=typeof LUNAR_SHOWCASE_IDS[number];
export type LunarPoint={x:number;y:number;z:number};
export type LunarShowcaseAction={id:string;label:string;clip:string;duration:number;cycles:number;kind:'gesture'|'dribble'|'shoot';releaseAt?:number;/** A reviewed short gesture finishes its safe authored retreat before replacement. */finishBeforeInterrupt?:true;/** Retargeted one-shot starts and returns through settled idle only. */idleBoundary?:true;/** Adult world-metre pose envelope for this bounded manual gesture, not locomotion. */reservedRadius?:number;motionSource?:{kind:'user-provided-hy-motion-retargeted';sourceSha256:string};/** Reviewed non-sole support points, bound to exact model bytes and this action only. */groundContact?:{modelSha256:string;mesh:string;vertices:number[]};/** Only the reviewed dance may rotate its motion bone; navigation heading stays unchanged. */rootMotion?:{kind:'in-place-yaw';turns:1};/** Authored text cues, not generated speech or audio. */speech?:{at:number;duration:number;text:string}[];/** Native glTF actor-local ball centers, sampled from authored contact trajectory. */ballTrack?:{time:number;center:LunarPoint;contact?:boolean}[]};
export type LunarShowcaseDefinition={
 id:LunarShowcaseId;label:string;portraitUrl:string;
 model:{url:string;sha256:string;bytes:number};
 source:{originalSha256:string;compactSha256:string;geometry:'user-supplied-generated';motion:'hand-authored'|'mixed-hand-authored-and-retargeted'};
 profile:{normalizationScale:number;facingYaw:number;motionRoot:string;supportAnchor:string;headAnchor:string;handAnchor?:string;handBallOffset?:LunarPoint;bodyRadius:number;transferUnderside:number;idle:{clip:string;duration:number};walk?:{clip:string;duration:number;/** Normalized adult metres per complete two-step cycle. Growth scales this once. */strideMeters:number;feet?:{upper:string;lower:string;foot:string;phase:number;stance:number}[]};carried?:{clip:string;duration:number};actions:LunarShowcaseAction[];greetingActionId:string;automaticActionId:string};
 /** Measured artifact checks, never a claim of mobile/GPU visual acceptance. */
 verification:{reportRef:string;actualSkinAndClips:true;groundTransitions:true;rayPicking:true;carry:boolean;mobilePerformance:'unmeasured'};
};
export type DeepReadonly<T>=T extends (infer U)[]?readonly DeepReadonly<U>[]:T extends object?{readonly[K in keyof T]:DeepReadonly<T[K]>}:T;
export type LunarShowcaseRecord=DeepReadonly<LunarShowcaseDefinition>;
export const isLunarShowcaseId=(id:unknown):id is LunarShowcaseId=>typeof id==='string'&&(LUNAR_SHOWCASE_IDS as readonly string[]).includes(id);
