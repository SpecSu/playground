/** Sites dispatch owns and injects this header. Never accept caller-selected
 * X-User-Id, device cookies, or an email as evidence of a signed-in visitor.
 * This gate is for the hosted Worker, not the standalone local farm server.
 */
const USER_ID_HEADER='oai-authenticated-user-id';
const AUTH_PATHS=new Set(['/signin-with-chatgpt','/signout-with-chatgpt','/callback']);

function privateResponse(response:Response):Response{
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');
 const vary=new Set((headers.get('Vary')??'').split(',').map(value=>value.trim()).filter(Boolean));
 vary.add(USER_ID_HEADER);vary.add('Cookie');headers.set('Vary',[...vary].join(', '));
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function withChatGPTAccess(request:Request,handle:()=>Response|Promise<Response>):Promise<Response>{
 if(request.headers.get(USER_ID_HEADER)?.trim())return privateResponse(await handle());
 const url=new URL(request.url),mode=request.headers.get('Sec-Fetch-Mode');
 const navigation=['GET','HEAD'].includes(request.method)&&!url.pathname.startsWith('/api/')&&url.pathname!=='/api'&&!request.headers.has('RSC')&&(!mode||mode==='navigate');
 if(navigation){
  const returnTo=url.pathname.startsWith('//')||AUTH_PATHS.has(url.pathname)?'/':`${url.pathname}${url.search}`;
  return privateResponse(new Response(null,{status:302,headers:{Location:`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}}));
 }
 return privateResponse(Response.json({error:'请先登录 ChatGPT 后进入农场',code:'sign_in_required',signIn:'/signin-with-chatgpt?return_to=%2F'},{status:401}));
}
