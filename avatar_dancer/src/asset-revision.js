// Bump only when shipped model/thumbnail bytes change. Stable within a release,
// so HTTP caches and the stage's parsed/byte LRU caches remain effective.
export const ASSET_REVISION = '20261029-avatar-dancer-v10-stable';
export function versionedAssetUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  const hashAt=url.indexOf('#'), hash=hashAt<0?'':url.slice(hashAt), base=hashAt<0?url:url.slice(0,hashAt);
  const queryAt=base.indexOf('?'), path=queryAt<0?base:base.slice(0,queryAt);
  const params=new URLSearchParams(queryAt<0?'':base.slice(queryAt+1));
  params.set('v',ASSET_REVISION);
  return `${path}?${params}${hash}`;
}
export function versionCharacterManifest(manifest) {
  if(!manifest?.characters)return manifest;
  return {...manifest,characters:Object.fromEntries(Object.entries(manifest.characters).map(([id,character])=>[id,{
    ...character,outfits:character.outfits.map(outfit=>{
      const next={...outfit};
      for(const key of ['model','lowModel','url','modelUrl'])if(next[key])next[key]=versionedAssetUrl(next[key]);
      return next;
    }),
  }]))};
}
