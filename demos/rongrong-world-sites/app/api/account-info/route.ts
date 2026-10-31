/** Copy to app/api/account-info/route.ts ONLY on the existing protected Sites Worker.
 * The Sites dispatcher owns this identity header. Never mount on a standalone
 * server/proxy accepting arbitrary caller headers. No database or game mutation. */
const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',Vary:'Cookie, oai-authenticated-user-id'};
export async function GET(request:Request):Promise<Response>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:HEADERS});
 if(request.method!=='GET')return reply({code:'method-not-allowed'},405);
 const url=new URL(request.url),origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if(origin&&origin!==url.origin||site==='cross-site'||site==='same-site')return reply({code:'same-origin-required'},403);
 if(url.search)return reply({code:'invalid-query'},400);
 const subject=request.headers.get('oai-authenticated-user-id');
 if(!subject?.trim()||subject.length>512)return reply({code:'sign-in-required'},401);
 // Byte-for-byte identical to V27 deriveAccountId. Do NOT trim a valid subject.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`farm-account-v1\0${subject}`));
 const uid=`uid_${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
 return reply({uid});
}
