/** A local cancel belongs to one observed/in-flight work intent, never a future device action. */
export function createWorkCancellation(){let epoch=0,requestedId=null;return {
 begin(){requestedId=null;return ++epoch;},
 cancel(pending){++epoch;requestedId=pending?.id??null;},
 settle(token,pending){if(token!==epoch){requestedId=pending?.id??null;return false;}return true;},
 target(pending){if(requestedId!==pending?.id)requestedId=null;return requestedId;},
 clear(id){if(requestedId===id)requestedId=null;},
};}
