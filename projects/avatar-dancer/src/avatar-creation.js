/** Device-local demo progression. No account, payments, uploads or generation API. */
export const AVATAR_CREATION_KEY = 'encore-avatar-creation-v1';
export const AVATAR_CHARACTER_ID = 'jiaxin';
export const AVATAR_GENERATION_MS = 5000;
export const INITIAL_AVATAR_POINTS = 300;
export const AVATAR_COSTUMES = Object.freeze([0,1]);
export const COSTUME_POINT_COST = 100;
const copy = value => JSON.parse(JSON.stringify(value));
const fail = reason => ({ok:false, reason});
let instanceSequence = 0;
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
function validSaved(value){
  return [1,2].includes(value?.version) && value.characterId === AVATAR_CHARACTER_ID &&
    typeof value.unlocked === 'boolean' && Number.isSafeInteger(value.points) && value.points >= 0 &&
    Number.isSafeInteger(value.sequence) && value.sequence >= 0 &&
    Array.isArray(value.outfits) && new Set(value.outfits).size === value.outfits.length &&
    value.outfits.every(id => (value.version===1?[0,1,2]:AVATAR_COSTUMES).includes(id)) &&
    (value.unlocked ? value.outfits.includes(0) : value.outfits.length === 0);
}

/** Inject now (milliseconds) and storage for deterministic tests or alternate local persistence. */
export function createAvatarCreationStore({storage=browserStorage(),now=()=>Date.now(),initialPoints=INITIAL_AVATAR_POINTS}={}){
  const instance = ++instanceSequence;
  let storageAvailable = Boolean(storage);
  let state = {version:2,characterId:AVATAR_CHARACTER_ID,unlocked:false,outfits:[],
    points:Number.isSafeInteger(initialPoints)&&initialPoints>=0?initialPoints:INITIAL_AVATAR_POINTS,
    sequence:0,operation:null};
  try {
    const saved=JSON.parse(storage?.getItem(AVATAR_CREATION_KEY)??'null');
    if(validSaved(saved))state={...state,unlocked:saved.unlocked,outfits:saved.unlocked?(saved.version===2?[...saved.outfits].sort():[0]):[],points:saved.points,sequence:saved.sequence};
  }catch{storageAvailable=false;}
  // Interrupted jobs intentionally do not resume: their visual result was never
  // acknowledged. Legacy extra costumes are retired; the existing balance is preserved.
  function persist(){try{if(storage){storage.setItem(AVATAR_CREATION_KEY,JSON.stringify(state));storageAvailable=true;}}catch{storageAvailable=false;}}
  persist();
  function start(kind,outfit){
    if(state.operation)return fail('busy');
    if(kind==='avatar'&&state.unlocked)return fail('already-owned');
    if(kind==='costume'){
      if(!state.unlocked)return fail('locked');
      if(outfit!==1)return fail('unknown-outfit');
      if(state.outfits.includes(outfit))return fail('already-owned');
      if(state.points<COSTUME_POINT_COST)return fail('insufficient-points');
    }
    const startedAt=now();
    const token=`${instance}:${++state.sequence}:${startedAt}`;
    state.operation={token,kind,outfit,startedAt,readyAt:startedAt+AVATAR_GENERATION_MS};
    persist();return {ok:true,token,operation:copy(state.operation)};
  }
  return {
    getState(){const {sequence,...snapshot}=state;return {...copy(snapshot),storageAvailable};},
    beginAvatarCreation(){return start('avatar',0);},
    beginCostumeCreation(outfit){return start('costume',outfit);},
    getProgress(token){const op=state.operation;return op?.token===token?Math.max(0,Math.min(1,(now()-op.startedAt)/AVATAR_GENERATION_MS)):0;},
    completeOperation(token,{resultAvailable=false}={}){
      const op=state.operation;
      if(!op||op.token!==token)return fail('stale-operation');
      if(now()<op.readyAt)return fail('not-ready');
      // Caller must verify the prepared model/material result actually loaded.
      // Time passing by itself can never grant ownership or spend points.
      if(resultAvailable!==true)return fail('result-unavailable');
      if(op.kind==='avatar'){state.unlocked=true;state.outfits=[0];}
      else{
        if(state.points<COSTUME_POINT_COST)return fail('insufficient-points');
        state.points-=COSTUME_POINT_COST;state.outfits=[...state.outfits,op.outfit].sort();
      }
      state.operation=null;persist();return {ok:true,kind:op.kind,outfit:op.outfit};
    },
    cancelOperation(token){
      if(!state.operation||state.operation.token!==token)return fail('stale-operation');
      state.operation=null;persist();return {ok:true};
    },
  };
}
