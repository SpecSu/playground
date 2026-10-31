/** Keep the old storage immutable after V8 migration. An old open tab must not
 * continue writing a fork of the same device's farm or create a fresh old save. */
function retired(request:Request){void request;return Response.json({error:'旧农场入口已升级为庄园 V8。原存档保留，进入庄园时按原设备身份迁移，请刷新页面。',upgrade:'/api/estate'},{status:410,headers:{'Cache-Control':'no-store'}});}
export const GET=retired;
export const POST=retired;
