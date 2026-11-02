export function connectionError(error,pending=false){
 if(typeof error?.code==='string')return error;
 const e=new Error(pending?'连接断了一下，正在确认刚才的操作，请先别重复点击':'暂时没连上，正在重新连接…');
 e.code='CONNECTION_UNCERTAIN';return e;
}
