/** The first POST may only establish a server-issued HttpOnly identity.
 * Reuse the exact idempotent payload once; never turn a lost identity response
 * into a second room or a reserved slot belonging to an orphaned identity. */
export async function sitesPost(url:string,init:RequestInit):Promise<Response>{
 const first=await fetch(url,init);
 if(first.status!==428||init.method?.toUpperCase()!=='POST'||typeof init.body!=='string')return first;
 const body=await first.clone().json().catch(()=>null) as {code?:string}|null;
 if(body?.code!=='identity_required')return first;
 const second=await fetch(url,init);
 if(second.status===428)throw new Error('请允许本站 Cookie 后重试，尚未提交本次操作');
 return second;
}
