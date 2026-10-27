/** Presentation-only owner follow. View gestures keep a short inspection grace; never touches life state. */
export function createCameraFollow(){let last=null,viewUntil=-Infinity;return {
 view(at){viewUntil=at+2000;last=at;},resume(at){viewUntil=-Infinity;last=at;},reset(){last=null;viewUntil=-Infinity;},
 step(at,{owner,width,height,trayHeight=0,locked=false}){const dt=last===null?0:Math.max(0,Math.min(40,at-last));last=at;if(!dt||!owner?.moving||!Number.isFinite(owner.x)||locked||at<viewUntil)return {x:0,y:0};const target={x:width/2,y:120+Math.max(160,height-trayHeight-160)*.5},k=1-Math.exp(-dt/300);return {x:(target.x-owner.x)*k,y:(target.y-owner.y)*k};}
};}
