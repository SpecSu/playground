// Future excerpts remain <=60s unless explicitly overridden (KILLLOVE and UptownFunk full source).
// Append approved audio/chart entries here; rotation uses IDs, not a
// hard-coded two-song toggle. Persist last played so additions follow naturally.
export const PERFORMANCE_TRACKS=Object.freeze([
 {id:'popstars',title:'POPSTARS',bpm:169.99,metadataUrl:'/assets/audio/popstars-gameplay.metadata.json'},
 {id:'fantastic',title:'FANTASTIC',bpm:130.03,metadataUrl:'/assets/audio/fantastic-gameplay.metadata.json'},
 {id:'uptownfunk',title:'UptownFunk',bpm:115.0,metadataUrl:'/assets/audio/uptownfunk-gameplay.metadata.json?v=full-v14'},
 {id:'killlove',title:'KILLLOVE',bpm:131.995,metadataUrl:'/assets/audio/killlove-gameplay.metadata.json?v=full-v13'},
]);
export function createPerformancePlaylist(tracks=PERFORMANCE_TRACKS,storage){
 if(!tracks.length)throw new Error('Playlist needs at least one track');
 if(storage===undefined){try{storage=globalThis.localStorage}catch{}}
 const key='encore.performance.last-track.v1';let lastId=null,lastToken,selectedId=null;
 try{lastId=storage?.getItem(key)||null}catch{}
 const peek=()=>tracks.find(t=>t.id===selectedId)||tracks[(tracks.findIndex(t=>t.id===lastId)+1)%tracks.length];
 return {peek,selectNext(){selectedId=tracks[(tracks.findIndex(t=>t.id===peek().id)+1)%tracks.length].id;return peek();},commitStart(id,token){
  if(token===undefined||token===lastToken||peek().id!==id)return false;
  lastToken=token;lastId=id;selectedId=null;try{storage?.setItem(key,id)}catch{}return true;
 }};
}
