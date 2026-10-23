// Only fixed classifications leave this module. Never log an error message,
// stack, request URL/body, player identifier, SQL binding, or stored state.
const methods=new Set(['ensure','read','receipt','commit','visit','presence','readVisit','commitVisit','commitTransfer','commitChat','messages','lastMessage']);
const durationBucket=ms=>ms<250?'lt250ms':ms<1000?'250ms-1s':ms<5000?'1s-5s':ms<15000?'5s-15s':'gte15s';
export function observeStore(store,trace){return new Proxy(store,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);if(!methods.has(key)||typeof value!=='function')return value;return async(...args)=>{const start=performance.now();try{return await value.apply(receiver,args);}catch(error){if(!trace.failureStage){trace.failureStage=`store.${key}`;trace.failureDuration=performance.now()-start;}throw error;}finally{const ms=performance.now()-start;if(ms>=2000&&!trace.failureStage){trace.slowStages??=new Set();if(!trace.slowStages.has(key)){trace.slowStages.add(key);console.warn({event:'manor_store_slow',correlation:/^[a-f0-9-]{36}$/i.test(trace.correlation)?trace.correlation:'unavailable',stage:`store.${key}`,durationBucket:durationBucket(ms)});}}}};}});}

function classify(error){
 const text=String(error?.message??'')+' '+String(error?.cause?.message??'');
 if(/no such table|no such column/i.test(text))return 'D1_SCHEMA';
 if(/(?:daily|free tier|quota).*(?:limit|exceed)|(?:limit|exceed).*(?:daily|free tier|quota)/i.test(text))return 'D1_QUOTA';
 if(/network|connection (?:lost|reset)|fetch failed/i.test(text))return 'D1_NETWORK';
 if(/database.*reset|reset.*database/i.test(text))return 'D1_RESET';
 if(/too many (?:requests|queries)|rate.?limit|overload/i.test(text))return 'D1_CAPACITY';
 if(/SQLITE_BUSY|database is locked/i.test(text))return 'D1_BUSY';
 if(/constraint|SQLITE_CONSTRAINT/i.test(text))return 'D1_CONSTRAINT';
 if(/bind|unsupported type/i.test(text))return 'D1_BIND';
 if(/timeout|timed out/i.test(text))return 'TIMEOUT';
 if(/D1_ERROR|D1_EXEC_ERROR|internal error/i.test(text))return 'D1_INTERNAL';
 if(error instanceof TypeError)return 'TYPE_ERROR';
 if(error instanceof SyntaxError)return 'SYNTAX_ERROR';
 return 'UNAVAILABLE';
}
export function serviceFailure(error,trace){
 const fallback=new Set(['database.binding','request.parse','service.read','service.command']);
 const stage=trace.failureStage&&[...methods].some(m=>trace.failureStage===`store.${m}`)?trace.failureStage:fallback.has(trace.stage)?trace.stage:'service.unknown';
 return {event:'manor_service_error',correlation:/^[a-f0-9-]{36}$/i.test(trace.correlation)?trace.correlation:'unavailable',stage,errorClass:classify(error),...(Number.isFinite(trace.failureDuration)?{durationBucket:durationBucket(trace.failureDuration)}:{})};
}
