/** Manifest compatibility only; player identity/settings never depend on image representation. */
export function imageReference(value){
 if(typeof value==='string')return value?{image:value}:null;
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.image!=='string'||!value.image)return null;
 if(value.frame){const f=value.frame;if(![f.x,f.y,f.w,f.h].every(Number.isSafeInteger)||f.x<0||f.y<0||f.w<=0||f.h<=0)return null;}
 return {image:value.image,...(value.frame?{frame:value.frame}:{})};
}
export const avatarImageURLs=avatar=>[...new Set([avatar?.front,avatar?.back,avatar?.portrait].map(imageReference).filter(Boolean).map(ref=>ref.image))];
export const avatarHasReferences=avatar=>[avatar?.front,avatar?.back,avatar?.portrait].every(value=>!!imageReference(value));
