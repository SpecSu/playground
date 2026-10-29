import {AVATAR_CHARACTER_ID} from './avatar-creation.js';
/** UI transaction adapter. A local preparation timer is not proof of a usable asset. */
export function createAvatarGeneration({store,isAvailable,load,restore=async()=>{},onState=()=>{},now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  let error=null,loadingToken=null;
  function getState(){
    const state=store.getState(),op=state.operation;
    return {...state,busy:Boolean(op),progress:op&&loadingToken===op.token?null:op?store.getProgress(op.token):0,phase:op?(loadingToken===op.token?'loading-model':'preparing'):'idle',jobKind:op?.kind||null,error};
  }
  const emit=()=>{const state=getState();onState(state);return state};
  function cancel(){
    const op=store.getState().operation;if(!op)return emit();
    store.cancelOperation(op.token);error=null;
    if(loadingToken===op.token){loadingToken=null;Promise.resolve(restore()).catch(()=>{});}
    return emit();
  }
  async function run(kind,outfit){
    if(!isAvailable(AVATAR_CHARACTER_ID,outfit)){error='角色资源尚未准备好，请稍后重试';return emit();}
    const started=kind==='avatar'?store.beginAvatarCreation():store.beginCostumeCreation(outfit);
    if(!started.ok){if(started.reason==='busy')return getState();error=({'unavailable':'妆造生成即将开放，暂不扣除积分','already-owned':'已经拥有这套造型','locked':'请先创建分身','insufficient-points':'体验积分不足','unknown-outfit':'暂无这套造型'})[started.reason]||started.reason;return emit();}
    const token=started.token;error=null;emit();
    try{
      while(now()<started.operation.readyAt){
        await wait(Math.max(1,started.operation.readyAt-now()));
        if(store.getState().operation?.token!==token)return getState();
      }
      if(store.getState().operation?.token!==token)return getState();
      loadingToken=token;emit();
      const loaded=await load(AVATAR_CHARACTER_ID,outfit);
      if(store.getState().operation?.token!==token)return getState();
      if(loaded!==true)throw new Error('模型载入失败，未扣除体验积分');
      const completed=store.completeOperation(token,{resultAvailable:true});
      if(!completed.ok)throw new Error(completed.reason);
      loadingToken=null;error=null;return emit();
    }catch(reason){
      if(store.getState().operation?.token!==token)return getState();
      store.cancelOperation(token);error=reason?.message||'准备失败，未扣除体验积分';
      if(loadingToken===token){loadingToken=null;try{await restore();}catch{}}
      return emit();
    }
  }
  return {getState,cancel,createAvatar:()=>run('avatar',0),generateOutfit:index=>run('costume',index)};
}
