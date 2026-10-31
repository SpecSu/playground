/** Name is only a Minimal demo selector. Never ignore it on an older writable API. */
export function rejectMixedNamedDemoRoute(request:Request):Response|null{
 const url=new URL(request.url);
 return url.searchParams.has('name')&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/minimal/')?Response.json({code:'demo-route-required',message:'测试名称只用于独立测试牧场接口'},{status:400,headers:{'Cache-Control':'private, no-store'}}):null;
}
